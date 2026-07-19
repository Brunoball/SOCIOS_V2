<?php
declare(strict_types=1);

trait ConfiguracionGestion
{
    private static function guardarParametrosDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $amount = decimal_amount($body['monto_inscripcion'] ?? null, 'monto de inscripción', 0.01);

        $result = transaction($db, static function () use ($db, $auth, $amount): array {
            $statement = $db->prepare(
                "SELECT id_modalidad_pago, monto_fijo
                 FROM modalidades_pago
                 WHERE codigo = 'INSCRIPCION'
                 LIMIT 1
                 FOR UPDATE"
            );
            $statement->execute();
            $row = $statement->fetch();
            if (!$row) {
                api_error(
                    'No existe la modalidad INSCRIPCION en la base del tenant.',
                    'MODALIDAD_INSCRIPCION_NO_CONFIGURADA',
                    500
                );
            }

            $before = [
                'monto_inscripcion' => number_format((float)($row['monto_fijo'] ?? 0), 2, '.', ''),
            ];
            $db->prepare('UPDATE modalidades_pago SET monto_fijo = ? WHERE id_modalidad_pago = ?')
                ->execute([$amount, (int)$row['id_modalidad_pago']]);
            $after = ['monto_inscripcion' => $amount];

            audit_change(
                $db,
                $auth,
                'CONFIGURACION',
                'MODIFICAR_MONTO_INSCRIPCION',
                'modalidades_pago',
                (int)$row['id_modalidad_pago'],
                'Se modificó el monto predeterminado de inscripción.',
                $before,
                $after
            );
            return ['parametros' => $after];
        });

        return $result;
    }

    private static function guardarItemDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $list = self::listaValida($body['lista'] ?? null);
        $idText = trim((string)($body['id'] ?? ''));
        $id = $idText === '' ? null : positive_id($idText, 'opción');
        $name = required_text(
            $body,
            'nombre',
            $list === 'localidades' ? 'nombre de localidad' : 'nombre del medio de pago',
            $list === 'localidades' ? 120 : 100
        );
        $postalCode = $list === 'localidades'
            ? optional_text($body['codigo_postal'] ?? null, 20)
            : null;

        if ($list === 'medios_pago' && self::esMedioInterno($name)) {
            api_error('CONDONACIÓN es un medio interno del sistema y no se puede administrar.', 'MEDIO_PAGO_RESERVADO');
        }

        try {
            return transaction($db, static function () use ($db, $auth, $list, $id, $name, $postalCode): array {
                $idField = $list === 'medios_pago' ? 'id_medio_pago' : 'id_localidad';
                $table = $list;
                $before = null;

                if ($id !== null) {
                    $before = self::itemConfiguracion($db, $list, $id, true);
                    if (!$before) api_error('La opción que intentás editar no existe.', 'OPCION_NO_ENCONTRADA', 404);
                    if ($list === 'medios_pago' && self::esMedioInterno((string)$before['nombre'])) {
                        api_error('El medio interno CONDONACIÓN no se puede modificar.', 'MEDIO_PAGO_RESERVADO');
                    }

                    $duplicate = $db->prepare("SELECT {$idField} FROM {$table} WHERE nombre = ? AND {$idField} <> ? LIMIT 1");
                    $duplicate->execute([$name, $id]);
                    if ($duplicate->fetchColumn()) {
                        api_error('Ya existe otra opción con ese nombre.', 'NOMBRE_DUPLICADO', 409);
                    }

                    if ($list === 'medios_pago') {
                        $db->prepare('UPDATE medios_pago SET nombre = ? WHERE id_medio_pago = ?')
                            ->execute([$name, $id]);
                    } else {
                        $db->prepare('UPDATE localidades SET nombre = ?, codigo_postal = ? WHERE id_localidad = ?')
                            ->execute([$name, $postalCode, $id]);
                    }
                    $savedId = $id;
                    $action = $list === 'medios_pago' ? 'MODIFICAR_MEDIO_PAGO' : 'MODIFICAR_LOCALIDAD';
                    $description = $list === 'medios_pago'
                        ? 'Se modificó un medio de pago.'
                        : 'Se modificó una localidad.';
                } else {
                    $duplicate = $db->prepare("SELECT {$idField}, activo FROM {$table} WHERE nombre = ? LIMIT 1");
                    $duplicate->execute([$name]);
                    $existing = $duplicate->fetch();
                    if ($existing) {
                        api_error(
                            (bool)$existing['activo']
                                ? 'Ya existe una opción activa con ese nombre.'
                                : 'Esa opción ya existe inactiva. Podés reactivarla o eliminarla desde la lista.',
                            'NOMBRE_DUPLICADO',
                            409
                        );
                    }

                    if ($list === 'medios_pago') {
                        $db->prepare('INSERT INTO medios_pago (nombre, activo) VALUES (?, 1)')->execute([$name]);
                    } else {
                        $db->prepare('INSERT INTO localidades (nombre, codigo_postal, activo) VALUES (?, ?, 1)')
                            ->execute([$name, $postalCode]);
                    }
                    $savedId = (int)$db->lastInsertId();
                    $action = $list === 'medios_pago' ? 'CREAR_MEDIO_PAGO' : 'CREAR_LOCALIDAD';
                    $description = $list === 'medios_pago'
                        ? 'Se creó un medio de pago.'
                        : 'Se creó una localidad.';
                }

                $after = self::itemConfiguracion($db, $list, $savedId);
                audit_change(
                    $db,
                    $auth,
                    'CONFIGURACION',
                    $action,
                    $table,
                    $savedId,
                    $description,
                    $before,
                    $after
                );

                return [
                    'creado' => $id === null,
                    'lista' => $list,
                    'item' => $after,
                ];
            });
        } catch (Throwable $error) {
            if (duplicate_key($error)) {
                api_error('Ya existe una opción con ese nombre.', 'NOMBRE_DUPLICADO', 409);
            }
            throw $error;
        }
    }

    private static function cambiarEstadoItemDatos(array $auth, array $body, bool $active): array
    {
        $db = $auth['db'];
        $list = self::listaValida($body['lista'] ?? null);
        $id = positive_id($body['id'] ?? null, 'opción');

        return transaction($db, static function () use ($db, $auth, $list, $id, $active): array {
            $before = self::itemConfiguracion($db, $list, $id, true);
            if (!$before) api_error('La opción seleccionada no existe.', 'OPCION_NO_ENCONTRADA', 404);
            if ($list === 'medios_pago' && self::esMedioInterno((string)$before['nombre'])) {
                api_error('El medio interno CONDONACIÓN no se puede eliminar ni reactivar.', 'MEDIO_PAGO_RESERVADO');
            }

            $usageStatement = $list === 'medios_pago'
                ? $db->prepare(
                    'SELECT
                        (SELECT COUNT(*) FROM pagos WHERE id_medio_pago = ?)
                        +
                        (SELECT COUNT(*) FROM pagos_inscripciones WHERE id_medio_pago = ?)'
                )
                : $db->prepare('SELECT COUNT(*) FROM socios WHERE id_localidad = ?');

            $usageStatement->execute($list === 'medios_pago' ? [$id, $id] : [$id]);
            $usageCount = (int)$usageStatement->fetchColumn();

            if ($active) {
                if ((bool)$before['activo']) {
                    api_error('La opción ya se encuentra activa.', 'ESTADO_SIN_CAMBIOS', 409);
                }

                if ($list === 'medios_pago') {
                    $db->prepare('UPDATE medios_pago SET activo = 1 WHERE id_medio_pago = ?')->execute([$id]);
                } else {
                    $db->prepare('UPDATE localidades SET activo = 1 WHERE id_localidad = ?')->execute([$id]);
                }

                $after = self::itemConfiguracion($db, $list, $id);
                $entity = $list === 'medios_pago' ? 'MEDIO_PAGO' : 'LOCALIDAD';
                audit_change(
                    $db,
                    $auth,
                    'CONFIGURACION',
                    'REACTIVAR_' . $entity,
                    $list,
                    $id,
                    'Se reactivó una opción de configuración.',
                    $before,
                    $after
                );

                return [
                    'lista' => $list,
                    'item' => $after,
                    'eliminado_definitivo' => false,
                    'desactivado' => false,
                ];
            }

            if ($list === 'medios_pago' && (bool)$before['activo']) {
                $statement = $db->prepare(
                    "SELECT COUNT(*)
                     FROM medios_pago
                     WHERE activo = 1
                       AND id_medio_pago <> ?
                       AND nombre <> 'CONDONACIÓN'"
                );
                $statement->execute([$id]);
                if ((int)$statement->fetchColumn() === 0) {
                    api_error(
                        'Debe quedar al menos un medio de pago activo para registrar cobros.',
                        'ULTIMO_MEDIO_PAGO_ACTIVO',
                        409
                    );
                }
            }

            $entity = $list === 'medios_pago' ? 'MEDIO_PAGO' : 'LOCALIDAD';

            if ($usageCount === 0) {
                if ($list === 'medios_pago') {
                    $db->prepare('DELETE FROM medios_pago WHERE id_medio_pago = ?')->execute([$id]);
                } else {
                    $db->prepare('DELETE FROM localidades WHERE id_localidad = ?')->execute([$id]);
                }

                audit_change(
                    $db,
                    $auth,
                    'CONFIGURACION',
                    'ELIMINAR_' . $entity,
                    $list,
                    $id,
                    'Se eliminó definitivamente una opción de configuración sin uso.',
                    $before,
                    null
                );

                return [
                    'lista' => $list,
                    'item' => null,
                    'eliminado_definitivo' => true,
                    'desactivado' => false,
                ];
            }

            if (!(bool)$before['activo']) {
                api_error(
                    'La opción ya está inactiva porque posee registros asociados.',
                    'ESTADO_SIN_CAMBIOS',
                    409
                );
            }

            if ($list === 'medios_pago') {
                $db->prepare('UPDATE medios_pago SET activo = 0 WHERE id_medio_pago = ?')->execute([$id]);
            } else {
                $db->prepare('UPDATE localidades SET activo = 0 WHERE id_localidad = ?')->execute([$id]);
            }

            $after = self::itemConfiguracion($db, $list, $id);
            audit_change(
                $db,
                $auth,
                'CONFIGURACION',
                'DESACTIVAR_' . $entity,
                $list,
                $id,
                'Se desactivó una opción de configuración porque posee registros asociados.',
                $before,
                $after
            );

            return [
                'lista' => $list,
                'item' => $after,
                'eliminado_definitivo' => false,
                'desactivado' => true,
            ];
        });
    }
}
