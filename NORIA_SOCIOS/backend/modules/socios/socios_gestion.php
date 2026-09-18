<?php
declare(strict_types=1);

trait SociosGestion
{
    /**
     * Implementado por SociosConsultas al componerse ambos traits en Socios.
     * La declaración explícita evita que los analizadores estáticos interpreten
     * las llamadas a self::detalle() como un método inexistente.
     */
    abstract private static function detalle(PDO $db, int $id): ?array;

    private static function socioEliminado(PDO $db, int $id): bool
    {
        $statement = $db->prepare('SELECT 1 FROM socios_eliminados WHERE id_socio = ? LIMIT 1');
        $statement->execute([$id]);
        return (bool)$statement->fetchColumn();
    }

    private static function guardarDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = isset($body['id_socio']) && $body['id_socio'] !== ''
            ? positive_id($body['id_socio'], 'socio')
            : null;
        $name = required_text($body, 'nombre', 'nombre', 120);
        $surname = required_text($body, 'apellido', 'apellido', 120);
        $dni = preg_replace('/[.\s-]+/', '', required_text($body, 'dni', 'DNI', 20)) ?? '';
        if (!preg_match('/^\d{6,9}$/', $dni)) {
            api_error('El DNI debe contener entre 6 y 9 dígitos.', 'VALIDATION_ERROR');
        }

        $birthDate = valid_date($body['fecha_nacimiento'] ?? '', 'nacimiento', false);
        if ($birthDate !== null && $birthDate > date('Y-m-d')) {
            api_error('La fecha de nacimiento no puede ser futura.', 'VALIDATION_ERROR');
        }
        $admissionDate = valid_date($body['fecha_ingreso'] ?? '', 'ingreso');
        if ($admissionDate > date('Y-m-d')) {
            api_error('La fecha de ingreso no puede ser futura.', 'VALIDATION_ERROR');
        }

        $sex = clean_text($body['sexo'] ?? 'NO_INFORMA', 20);
        if (!in_array($sex, ['MASCULINO', 'FEMENINO', 'OTRO', 'NO_INFORMA'], true)) {
            api_error('El sexo seleccionado no es válido.', 'VALIDATION_ERROR');
        }
        $address = optional_text($body['domicilio'] ?? null, 255);
        $phone = optional_text($body['telefono'] ?? null, 50, false);
        $email = optional_text($body['email'] ?? null, 190, false);
        if ($email !== null) {
            $email = strtolower($email);
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                api_error('El email no tiene un formato válido.', 'VALIDATION_ERROR');
            }
        }
        $observations = optional_text($body['observaciones'] ?? null, 5000);
        $categoryIds = self::validarCategorias($db, $body['categoria_ids'] ?? [], $id);

        try {
            $saved = transaction($db, static function () use ($db, $auth, $body, $id, $name, $surname, $dni, $birthDate, $sex, $address, $phone, $email, $admissionDate, $observations, $categoryIds): array {
                $locationId = self::resolverLocalidad($db, $auth, $body, $id);
                $duplicate = $db->prepare('SELECT id_socio FROM socios WHERE dni = ? AND id_socio <> ? LIMIT 1');
                $duplicate->execute([$dni, $id ?? 0]);
                if ($duplicate->fetch()) api_error('Ya existe un socio con ese DNI.', 'DNI_DUPLICADO');

                if ($id === null) {
                    $insert = $db->prepare(
                        'INSERT INTO socios
                         (nombre, apellido, dni, fecha_nacimiento, sexo, domicilio, id_localidad, telefono, email, fecha_ingreso, observaciones, activo)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
                    );
                    $insert->execute([$name, $surname, $dni, $birthDate, $sex, $address, $locationId, $phone, $email, $admissionDate, $observations]);
                    $partnerId = (int)$db->lastInsertId();
                    $db->prepare(
                        'INSERT INTO socios_periodos_activos (id_socio, vigente_desde, vigente_hasta, motivo_baja)
                         VALUES (?, ?, NULL, NULL)'
                    )->execute([$partnerId, $admissionDate]);
                    self::sincronizarCategorias($db, $partnerId, $categoryIds, $admissionDate, true);
                    $after = self::detalle($db, $partnerId);
                    audit_change($db, $auth, 'SOCIOS', 'CREAR', 'socios', $partnerId, "Se creó el socio {$surname}, {$name}.", null, $after);
                    return $after ?? [];
                }

                $lock = $db->prepare('SELECT * FROM socios WHERE id_socio = ? FOR UPDATE');
                $lock->execute([$id]);
                $locked = $lock->fetch();
                if (!$locked || self::socioEliminado($db, $id)) api_error('El socio no existe.', 'SOCIO_NO_ENCONTRADO', 404);
                $before = self::detalle($db, $id) ?? $locked;

                if ($locked['fecha_ingreso'] !== $admissionDate) {
                    $payments = $db->prepare(
                        'SELECT (SELECT COUNT(*) FROM pagos WHERE id_socio = ?) +
                                (SELECT COUNT(*) FROM pagos_inscripciones WHERE id_socio = ?)'
                    );
                    $payments->execute([$id, $id]);
                    if ((int)$payments->fetchColumn() > 0) {
                        api_error('No se puede modificar la fecha de ingreso porque el socio ya tiene pagos.', 'FECHA_INGRESO_BLOQUEADA');
                    }
                }

                $update = $db->prepare(
                    'UPDATE socios SET nombre = ?, apellido = ?, dni = ?, fecha_nacimiento = ?, sexo = ?, domicilio = ?,
                        id_localidad = ?, telefono = ?, email = ?, fecha_ingreso = ?, observaciones = ? WHERE id_socio = ?'
                );
                $update->execute([$name, $surname, $dni, $birthDate, $sex, $address, $locationId, $phone, $email, $admissionDate, $observations, $id]);
                if ($locked['fecha_ingreso'] !== $admissionDate) {
                    $db->prepare(
                        'UPDATE socios_periodos_activos SET vigente_desde = ?
                         WHERE id_socio = ? AND vigente_desde = ?'
                    )->execute([$admissionDate, $id, $locked['fecha_ingreso']]);
                    $db->prepare(
                        'UPDATE socio_categorias SET fecha_desde = ?
                         WHERE id_socio = ? AND fecha_desde = ?'
                    )->execute([$admissionDate, $id, $locked['fecha_ingreso']]);
                }
                self::sincronizarCategorias($db, $id, $categoryIds, $admissionDate, false);
                $after = self::detalle($db, $id);
                audit_change($db, $auth, 'SOCIOS', 'MODIFICAR', 'socios', $id, "Se modificó el socio {$surname}, {$name}.", $before, $after);
                return $after ?? [];
            });
        } catch (Throwable $error) {
            if (duplicate_key($error)) {
                if (str_contains($error->getMessage(), 'uq_socio_categoria_activa')) {
                    api_error('El socio ya tiene esa categoría asignada como activa.', 'CATEGORIA_DUPLICADA', 409);
                }
                api_error('El DNI o alguno de los datos ingresados ya está registrado.', 'DNI_DUPLICADO');
            }
            throw $error;
        }

        return ['item' => $saved, 'creado' => $id === null];
    }

    private static function darBajaDatos(array $auth, int $id, string $date, string $reason): array
    {
        $db = $auth['db'];
        if ($date > date('Y-m-d')) {
            api_error('La fecha de baja no puede ser futura.', 'FECHA_BAJA_INVALIDA');
        }
        $saved = transaction($db, static function () use ($db, $auth, $id, $date, $reason): array {
            $statement = $db->prepare('SELECT * FROM socios WHERE id_socio = ? FOR UPDATE');
            $statement->execute([$id]);
            $locked = $statement->fetch();
            if (!$locked || self::socioEliminado($db, $id)) api_error('El socio no existe.', 'SOCIO_NO_ENCONTRADO', 404);
            if (!(bool)$locked['activo']) api_error('El socio ya se encuentra dado de baja.', 'ESTADO_SIN_CAMBIOS', 409);
            if ($date < $locked['fecha_ingreso']) {
                api_error('La fecha de baja no puede ser anterior a la fecha de ingreso.', 'FECHA_BAJA_INVALIDA');
            }
            $before = self::detalle($db, $id) ?? $locked;
            $period = $db->prepare(
                'SELECT id_periodo, vigente_desde FROM socios_periodos_activos
                 WHERE id_socio = ? AND vigente_hasta IS NULL FOR UPDATE'
            );
            $period->execute([$id]);
            $activePeriod = $period->fetch();
            if (!$activePeriod) api_error('El socio no tiene un período activo abierto. Ejecutá la migración SQL.', 'HISTORIAL_INCONSISTENTE', 409);
            if ($date < $activePeriod['vigente_desde']) {
                api_error('La fecha de baja no puede ser anterior a la última reactivación.', 'FECHA_BAJA_INVALIDA');
            }
            $db->prepare(
                'UPDATE socios_periodos_activos SET vigente_hasta = ?, motivo_baja = ? WHERE id_periodo = ?'
            )->execute([$date, $reason, $activePeriod['id_periodo']]);
            $db->prepare('UPDATE socios SET activo = 0, fecha_baja = ?, motivo_baja = ? WHERE id_socio = ?')->execute([$date, $reason, $id]);
            $after = self::detalle($db, $id);
            audit_change($db, $auth, 'SOCIOS', 'DAR_BAJA', 'socios', $id, 'Se dio de baja al socio.', $before, $after);
            return $after ?? [];
        });
        return ['item' => $saved];
    }

    private static function reactivarDatos(array $auth, int $id): array
    {
        $db = $auth['db'];
        $saved = transaction($db, static function () use ($db, $auth, $id): array {
            $statement = $db->prepare('SELECT * FROM socios WHERE id_socio = ? FOR UPDATE');
            $statement->execute([$id]);
            $locked = $statement->fetch();
            if (!$locked || self::socioEliminado($db, $id)) api_error('El socio no existe.', 'SOCIO_NO_ENCONTRADO', 404);
            if ((bool)$locked['activo']) api_error('El socio ya se encuentra activo.', 'ESTADO_SIN_CAMBIOS', 409);
            $before = self::detalle($db, $id) ?? $locked;
            $today = date('Y-m-d');
            $openPeriod = $db->prepare(
                'SELECT id_periodo FROM socios_periodos_activos WHERE id_socio = ? AND vigente_hasta IS NULL FOR UPDATE'
            );
            $openPeriod->execute([$id]);
            if ($openPeriod->fetch()) api_error('El historial del socio ya tiene un período abierto.', 'HISTORIAL_INCONSISTENTE', 409);
            $db->prepare(
                'INSERT INTO socios_periodos_activos (id_socio, vigente_desde, vigente_hasta, motivo_baja)
                 VALUES (?, ?, NULL, NULL)'
            )->execute([$id, $today]);
            $db->prepare('UPDATE socios SET activo = 1, fecha_baja = NULL, motivo_baja = NULL WHERE id_socio = ?')->execute([$id]);
            $after = self::detalle($db, $id);
            audit_change($db, $auth, 'SOCIOS', 'REACTIVAR', 'socios', $id, 'Se reactivó al socio.', $before, $after);
            return $after ?? [];
        });
        return ['item' => $saved];
    }

    private static function eliminarDefinitivamenteDatos(array $auth, int $id, string $reason): array
    {
        $db = $auth['db'];
        $today = date('Y-m-d');
        $now = date('Y-m-d H:i:s');

        return transaction($db, static function () use ($db, $auth, $id, $reason, $today, $now): array {
            $statement = $db->prepare('SELECT * FROM socios WHERE id_socio = ? FOR UPDATE');
            $statement->execute([$id]);
            $locked = $statement->fetch();
            if (!$locked) api_error('El socio no existe.', 'SOCIO_NO_ENCONTRADO', 404);

            $archived = $db->prepare('SELECT 1 FROM socios_eliminados WHERE id_socio = ? FOR UPDATE');
            $archived->execute([$id]);
            if ($archived->fetchColumn()) {
                api_error('El socio ya fue eliminado definitivamente.', 'SOCIO_YA_ELIMINADO', 409);
            }

            $before = self::detalle($db, $id) ?? $locked;

            $periods = $db->prepare(
                'SELECT id_periodo, vigente_desde, vigente_hasta, motivo_baja, created_at
                 FROM socios_periodos_activos WHERE id_socio = ? ORDER BY id_periodo'
            );
            $periods->execute([$id]);
            $periodRows = $periods->fetchAll();

            $categories = $db->prepare(
                'SELECT sc.id_socio_categoria, sc.id_categoria, c.nombre AS categoria,
                        sc.fecha_desde, sc.fecha_hasta, sc.activo
                 FROM socio_categorias sc
                 INNER JOIN categorias c ON c.id_categoria = sc.id_categoria
                 WHERE sc.id_socio = ? ORDER BY sc.id_socio_categoria'
            );
            $categories->execute([$id]);
            $categoryRows = $categories->fetchAll();

            $families = $db->prepare(
                'SELECT fs.id_familia_socio, fs.id_familia, f.nombre AS familia,
                        fs.created_at, fs.fecha_desvinculacion, fs.motivo_desvinculacion
                 FROM familia_socios fs
                 INNER JOIN familias f ON f.id_familia = fs.id_familia
                 WHERE fs.id_socio = ? ORDER BY fs.id_familia_socio'
            );
            $families->execute([$id]);
            $familyRows = $families->fetchAll();

            $count = static function (string $sql) use ($db, $id): int {
                $q = $db->prepare($sql);
                $q->execute([$id]);
                return (int)$q->fetchColumn();
            };

            $balanceStatement = $db->prepare(
                'SELECT COALESCE(SUM(monto), 0) FROM saldos_favor_movimientos WHERE id_socio = ?'
            );
            $balanceStatement->execute([$id]);
            $balance = number_format((float)$balanceStatement->fetchColumn(), 2, '.', '');

            $impact = [
                'pagos' => $count('SELECT COUNT(*) FROM pagos WHERE id_socio = ?'),
                'inscripciones' => $count('SELECT COUNT(*) FROM pagos_inscripciones WHERE id_socio = ?'),
                'periodos_estado' => count($periodRows),
                'categorias_historicas' => count($categoryRows),
                'vinculos_familiares' => count($familyRows),
                'movimientos_saldo_favor' => $count('SELECT COUNT(*) FROM saldos_favor_movimientos WHERE id_socio = ?'),
                'saldo_favor' => $balance,
                'ventas' => $count('SELECT COUNT(*) FROM ventas_operaciones WHERE id_socio = ?'),
            ];

            $snapshot = [
                'socio' => $locked,
                'detalle' => $before,
                'periodos_activos' => $periodRows,
                'categorias' => $categoryRows,
                'familias' => $familyRows,
            ];

            $openPeriod = $db->prepare(
                'SELECT id_periodo FROM socios_periodos_activos
                 WHERE id_socio = ? AND vigente_hasta IS NULL FOR UPDATE'
            );
            $openPeriod->execute([$id]);
            foreach ($openPeriod->fetchAll(PDO::FETCH_COLUMN) as $periodId) {
                $db->prepare(
                    'UPDATE socios_periodos_activos
                     SET vigente_hasta = ?, motivo_baja = ?
                     WHERE id_periodo = ?'
                )->execute([$today, 'ELIMINADO DEFINITIVAMENTE: ' . $reason, $periodId]);
            }

            $db->prepare(
                'UPDATE socio_categorias
                 SET activo = 0,
                     fecha_hasta = COALESCE(fecha_hasta, ?),
                     id_categoria_activa = NULL
                 WHERE id_socio = ? AND activo = 1'
            )->execute([$today, $id]);

            $db->prepare(
                'UPDATE familia_socios
                 SET fecha_desvinculacion = ?,
                     motivo_desvinculacion = ?,
                     socio_vinculo_activo = NULL
                 WHERE id_socio = ? AND fecha_desvinculacion IS NULL'
            )->execute([$today, 'SOCIO ELIMINADO DEFINITIVAMENTE: ' . $reason, $id]);

            $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR;
            $db->prepare(
                'INSERT INTO socios_eliminados
                 (id_socio, socio_nombre, documento, fecha_eliminacion, id_usuario_master, motivo, datos_socio, impacto)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $id,
                trim((string)$locked['apellido'] . ', ' . (string)$locked['nombre'], ' ,'),
                $locked['dni'],
                $now,
                (int)$auth['id_usuario_master'],
                $reason,
                json_encode($snapshot, $jsonFlags),
                json_encode($impact, $jsonFlags),
            ]);

            // El registro base y sus IDs se conservan para no romper ninguna FK.
            // Se libera únicamente el DNI para permitir una nueva alta futura con
            // el mismo documento. Pagos, inscripciones, ventas y saldo permanecen.
            $db->prepare(
                'UPDATE socios
                 SET activo = 0, fecha_baja = ?, motivo_baja = ?, dni = NULL
                 WHERE id_socio = ?'
            )->execute([$today, 'ELIMINADO DEFINITIVAMENTE: ' . $reason, $id]);

            $after = [
                'id_socio' => $id,
                'eliminado' => true,
                'fecha_eliminacion' => $now,
                'motivo' => $reason,
                'impacto' => $impact,
            ];
            audit_change(
                $db,
                $auth,
                'SOCIOS',
                'ELIMINAR_DEFINITIVAMENTE',
                'socios_eliminados',
                $id,
                'Se archivó definitivamente al socio sin eliminar su historial económico.',
                $before,
                $after
            );

            return ['item' => $after];
        });
    }

    private static function resolverLocalidad(PDO $db, array $auth, array $body, ?int $partnerId): int
    {
        if (!empty($body['localidad_nueva'])) {
            $name = clean_text($body['localidad_nueva'], 120);
            if ($name === '') api_error('Ingresá el nombre de la nueva localidad.', 'LOCALIDAD_INVALIDA');
            $existing = $db->prepare('SELECT id_localidad, activo FROM localidades WHERE nombre = ? LIMIT 1');
            $existing->execute([$name]);
            $row = $existing->fetch();
            if ($row) {
                if (!(bool)$row['activo']) api_error('La localidad existe pero está inactiva.', 'LOCALIDAD_INVALIDA');
                return (int)$row['id_localidad'];
            }
            try {
                $db->prepare('INSERT INTO localidades (nombre, activo) VALUES (?, 1)')->execute([$name]);
            } catch (Throwable $error) {
                if (!duplicate_key($error)) throw $error;
                $existing->execute([$name]);
                $row = $existing->fetch();
                if (!$row || !(bool)$row['activo']) api_error('La localidad existe pero está inactiva.', 'LOCALIDAD_INVALIDA');
                return (int)$row['id_localidad'];
            }
            $id = (int)$db->lastInsertId();
            audit_change($db, $auth, 'CONFIGURACION', 'CREAR_LOCALIDAD', 'localidades', $id, "Se creó la localidad {$name} desde Socios.", null, ['id_localidad' => $id, 'nombre' => $name]);
            return $id;
        }

        $id = positive_id($body['id_localidad'] ?? null, 'localidad');
        $statement = $db->prepare(
            'SELECT l.id_localidad
             FROM localidades l
             LEFT JOIN socios s ON s.id_socio = ? AND s.id_localidad = l.id_localidad
             WHERE l.id_localidad = ? AND (l.activo = 1 OR s.id_socio IS NOT NULL)'
        );
        $statement->execute([$partnerId ?? 0, $id]);
        if (!$statement->fetch()) {
            api_error('La localidad seleccionada no existe o está inactiva.', 'LOCALIDAD_INVALIDA');
        }
        return $id;
    }

    private static function validarCategorias(PDO $db, mixed $value, ?int $partnerId): array
    {
        $ids = id_list($value);
        if ($ids === []) return [];
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $statement = $db->prepare(
            "SELECT c.id_categoria
             FROM categorias c
             WHERE c.id_categoria IN ({$placeholders})
               AND (
                    c.activo = 1
                    OR EXISTS (
                        SELECT 1 FROM socio_categorias sc
                        WHERE sc.id_socio = ? AND sc.id_categoria = c.id_categoria AND sc.activo = 1
                    )
               )"
        );
        $statement->execute([...$ids, $partnerId ?? 0]);
        $valid = array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));
        sort($valid);
        $expected = $ids;
        sort($expected);
        if ($valid !== $expected) {
            api_error('Una categoría seleccionada no existe o está inactiva.', 'CATEGORIA_INACTIVA');
        }
        return $ids;
    }

    private static function sincronizarCategorias(PDO $db, int $partnerId, array $categoryIds, string $admissionDate, bool $isNew): void
    {
        $currentStatement = $db->prepare(
            'SELECT id_socio_categoria, id_categoria, activo, fecha_desde
             FROM socio_categorias WHERE id_socio = ? AND activo = 1 FOR UPDATE'
        );
        $currentStatement->execute([$partnerId]);
        $current = [];
        foreach ($currentStatement->fetchAll() as $row) $current[(int)$row['id_categoria']] = $row;
        $selected = array_fill_keys($categoryIds, true);
        $today = date('Y-m-d');
        $currentMonthStart = date('Y-m-01');
        $previousMonthEnd = (new DateTimeImmutable($currentMonthStart))
            ->modify('-1 day')
            ->format('Y-m-d');
        $currentMonthEnd = (new DateTimeImmutable($currentMonthStart))
            ->modify('last day of this month')
            ->format('Y-m-d');
        $paymentHistory = $db->prepare(
            'SELECT 1 FROM pagos WHERE id_socio = ? AND id_categoria = ? LIMIT 1'
        );
        $registrationHistory = $db->prepare(
            'SELECT 1 FROM pagos_inscripciones WHERE id_socio = ? AND id_categoria = ? LIMIT 1'
        );

        foreach ($current as $categoryId => $row) {
            if (!isset($selected[$categoryId])) {
                $paymentHistory->execute([$partnerId, $categoryId]);
                $hasHistory = (bool)$paymentHistory->fetchColumn();
                if (!$hasHistory) {
                    $registrationHistory->execute([$partnerId, $categoryId]);
                    $hasHistory = (bool)$registrationHistory->fetchColumn();
                }

                // Si se agregó y se quitó dentro del mismo mes sin registrar
                // nada, no existe una vigencia histórica real: se elimina la
                // asignación y desaparecen inmediatamente todas sus deudas.
                if ((string)$row['fecha_desde'] >= $currentMonthStart && !$hasHistory) {
                    $db->prepare('DELETE FROM socio_categorias WHERE id_socio_categoria = ?')
                        ->execute([$row['id_socio_categoria']]);
                    continue;
                }

                // Para una categoría con historia, la baja corta obligaciones
                // desde el mes actual. Se conserva únicamente hasta el cierre
                // del mes anterior. Si comenzó este mismo mes y ya tiene un
                // pago, se conserva ese mes histórico sin generar meses futuros.
                $until = (string)$row['fecha_desde'] <= $previousMonthEnd
                    ? $previousMonthEnd
                    : $currentMonthEnd;
                $db->prepare(
                    'UPDATE socio_categorias
                     SET activo = 0, fecha_hasta = ?, id_categoria_activa = NULL
                     WHERE id_socio_categoria = ?'
                )->execute([$until, $row['id_socio_categoria']]);
            }
        }
        foreach ($categoryIds as $categoryId) {
            if (isset($current[$categoryId])) continue;
            $from = $isNew ? $admissionDate : max($admissionDate, $today);
            $db->prepare('INSERT INTO socio_categorias (id_socio, id_categoria, fecha_desde, fecha_hasta, activo, id_categoria_activa) VALUES (?, ?, ?, NULL, 1, ?)')
                ->execute([$partnerId, $categoryId, $from, $categoryId]);
        }
    }
}
