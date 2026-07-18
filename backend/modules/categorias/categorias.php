<?php
declare(strict_types=1);

final class Categorias
{
    public static function listar(): never
    {
        $auth = auth_context();
        api_success(self::listarDatos($auth['db'], $_GET));
    }

    public static function obtener(): never
    {
        $auth = auth_context();
        $id = positive_id($_GET['id'] ?? null, 'categoría');
        api_success(self::obtenerDatos($auth['db'], $id));
    }

    public static function guardar(): never
    {
        $auth = require_admin();
        $result = self::guardarDatos($auth, request_body());
        $created = (bool)$result['creada'];
        unset($result['creada']);
        api_success($result, $created ? 'Categoría creada correctamente.' : 'Categoría actualizada correctamente.');
    }

    public static function darBaja(): never
    {
        $auth = require_admin();
        $id = positive_id(request_body()['id'] ?? null, 'categoría');
        api_success(self::cambiarEstadoDatos($auth, $id, false), 'Categoría dada de baja correctamente.');
    }

    public static function reactivar(): never
    {
        $auth = require_admin();
        $id = positive_id(request_body()['id'] ?? null, 'categoría');
        api_success(self::cambiarEstadoDatos($auth, $id, true), 'Categoría reactivada correctamente.');
    }

    public static function historial(): never
    {
        $auth = auth_context();
        $id = positive_id($_GET['id'] ?? null, 'categoría');
        api_success(self::historialDatos($auth['db'], $id));
    }

    public static function listarDescuentos(): never
    {
        $auth = auth_context();
        api_success(['items' => self::listarDescuentosDatos($auth['db'])]);
    }

    public static function guardarDescuento(): never
    {
        $auth = require_admin();
        $result = self::guardarDescuentoDatos($auth, request_body());
        $created = (bool)$result['creado'];
        unset($result['creado']);
        api_success($result, $created ? 'Descuento familiar creado correctamente.' : 'Descuento familiar actualizado correctamente.');
    }

    public static function eliminarDescuento(): never
    {
        $auth = require_admin();
        $id = positive_id(request_body()['id'] ?? null, 'descuento familiar');
        self::eliminarDescuentoDatos($auth, $id);
        api_success([], 'Descuento familiar eliminado correctamente.');
    }

    private static function listarDatos(PDO $db, array $filters): array
    {
        $search = clean_text($filters['buscar'] ?? '', 120, false);
        $status = trim((string)($filters['estado'] ?? ''));
        if (!in_array($status, ['', 'activo', 'inactivo'], true)) {
            api_error('El estado solicitado no es válido.', 'FILTRO_INVALIDO');
        }

        $where = [];
        $params = [];
        if ($search !== '') {
            $where[] = '(c.nombre LIKE :buscar_nombre OR c.descripcion LIKE :buscar_descripcion)';
            $term = '%' . $search . '%';
            $params['buscar_nombre'] = $term;
            $params['buscar_descripcion'] = $term;
        }
        if ($status === 'activo') $where[] = 'c.activo = 1';
        if ($status === 'inactivo') $where[] = 'c.activo = 0';
        $sqlWhere = $where === [] ? '' : 'WHERE ' . implode(' AND ', $where);

        $statement = $db->prepare(
            "SELECT c.id_categoria, c.nombre, c.descripcion, c.monto_actual, c.activo,
                    c.created_at, c.updated_at,
                    COUNT(DISTINCT CASE WHEN sc.activo = 1 AND s.activo = 1 THEN sc.id_socio END) AS cantidad_socios
             FROM categorias c
             LEFT JOIN socio_categorias sc ON sc.id_categoria = c.id_categoria
             LEFT JOIN socios s ON s.id_socio = sc.id_socio
             {$sqlWhere}
             GROUP BY c.id_categoria
             ORDER BY c.activo DESC, c.nombre ASC
             LIMIT 500"
        );
        $statement->execute($params);
        $items = $statement->fetchAll();
        foreach ($items as &$item) {
            $item['id_categoria'] = (int)$item['id_categoria'];
            $item['cantidad_socios'] = (int)$item['cantidad_socios'];
            $item['activo'] = (bool)$item['activo'];
        }
        unset($item);

        $summary = $db->query(
            'SELECT COUNT(*) AS total,
                    SUM(activo = 1) AS activas,
                    SUM(activo = 0) AS inactivas,
                    COALESCE(AVG(CASE WHEN activo = 1 THEN monto_actual END), 0) AS promedio
             FROM categorias'
        )->fetch();
        return [
            'items' => $items,
            'resumen' => [
                'total' => (int)($summary['total'] ?? 0),
                'activas' => (int)($summary['activas'] ?? 0),
                'inactivas' => (int)($summary['inactivas'] ?? 0),
                'promedio' => (string)($summary['promedio'] ?? '0.00'),
            ],
        ];
    }

    private static function obtenerDatos(PDO $db, int $id): array
    {
        $category = self::detalle($db, $id);
        if (!$category) api_error('La categoría no existe.', 'CATEGORIA_NO_ENCONTRADA', 404);
        return ['item' => $category];
    }

    private static function guardarDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = isset($body['id_categoria']) && $body['id_categoria'] !== ''
            ? positive_id($body['id_categoria'], 'categoría')
            : null;
        $name = required_text($body, 'nombre', 'nombre', 120);
        $description = optional_text($body['descripcion'] ?? null, 500);
        $amount = decimal_amount($body['monto_actual'] ?? null, 'monto mensual');
        $effectiveDate = valid_date($body['vigente_desde'] ?? date('Y-m-d'), 'vigencia');
        $reason = optional_text($body['motivo_precio'] ?? null, 255);

        try {
            $saved = transaction($db, static function () use ($db, $auth, $id, $name, $description, $amount, $effectiveDate, $reason): array {
                $duplicate = $db->prepare('SELECT id_categoria FROM categorias WHERE nombre = ? AND id_categoria <> ? LIMIT 1');
                $duplicate->execute([$name, $id ?? 0]);
                if ($duplicate->fetch()) api_error('Ya existe otra categoría con ese nombre.', 'CATEGORIA_DUPLICADA');

                if ($id === null) {
                    $insert = $db->prepare('INSERT INTO categorias (nombre, descripcion, monto_actual, activo) VALUES (?, ?, ?, 1)');
                    $insert->execute([$name, $description, $amount]);
                    $categoryId = (int)$db->lastInsertId();
                    $db->prepare(
                        'INSERT INTO categorias_precios_historial
                         (id_categoria, monto_anterior, monto_nuevo, vigente_desde, vigente_hasta, motivo)
                         VALUES (?, NULL, ?, ?, NULL, ?)'
                    )->execute([$categoryId, $amount, $effectiveDate, $reason ?? 'PRECIO INICIAL']);
                    $after = self::detalle($db, $categoryId);
                    audit_change($db, $auth, 'CATEGORIAS', 'CREAR', 'categorias', $categoryId, "Se creó la categoría {$name}.", null, $after);
                    return $after ?? [];
                }

                $lock = $db->prepare('SELECT * FROM categorias WHERE id_categoria = ? FOR UPDATE');
                $lock->execute([$id]);
                $locked = $lock->fetch();
                if (!$locked) api_error('La categoría no existe.', 'CATEGORIA_NO_ENCONTRADA', 404);
                $before = self::detalle($db, $id) ?? $locked;
                $db->prepare('UPDATE categorias SET nombre = ?, descripcion = ? WHERE id_categoria = ?')->execute([$name, $description, $id]);

                if (number_format((float)$locked['monto_actual'], 2, '.', '') !== $amount) {
                    $lastStatement = $db->prepare(
                        'SELECT * FROM categorias_precios_historial
                         WHERE id_categoria = ? ORDER BY vigente_desde DESC, id_historial DESC LIMIT 1 FOR UPDATE'
                    );
                    $lastStatement->execute([$id]);
                    $last = $lastStatement->fetch();
                    if ($last && $effectiveDate < $last['vigente_desde']) {
                        api_error('La nueva vigencia no puede ser anterior al último precio registrado.', 'VIGENCIA_PRECIO_INVALIDA');
                    }
                    if ($last && $effectiveDate === $last['vigente_desde']) {
                        $db->prepare('UPDATE categorias_precios_historial SET monto_nuevo = ?, motivo = ? WHERE id_historial = ?')
                            ->execute([$amount, $reason ?? 'AJUSTE DEL MISMO DÍA', $last['id_historial']]);
                    } else {
                        if ($last) {
                            $dayBefore = (new DateTimeImmutable($effectiveDate))->modify('-1 day')->format('Y-m-d');
                            $db->prepare('UPDATE categorias_precios_historial SET vigente_hasta = ? WHERE id_historial = ?')
                                ->execute([$dayBefore, $last['id_historial']]);
                        }
                        $db->prepare(
                            'INSERT INTO categorias_precios_historial
                             (id_categoria, monto_anterior, monto_nuevo, vigente_desde, vigente_hasta, motivo)
                             VALUES (?, ?, ?, ?, NULL, ?)'
                        )->execute([$id, $locked['monto_actual'], $amount, $effectiveDate, $reason ?? 'CAMBIO DE PRECIO']);
                    }
                    $db->prepare('UPDATE categorias SET monto_actual = ? WHERE id_categoria = ?')->execute([$amount, $id]);
                }

                $after = self::detalle($db, $id);
                audit_change($db, $auth, 'CATEGORIAS', 'MODIFICAR', 'categorias', $id, "Se modificó la categoría {$name}.", $before, $after);
                return $after ?? [];
            });
        } catch (Throwable $error) {
            if (duplicate_key($error)) api_error('Ya existe una categoría con esos datos.', 'CATEGORIA_DUPLICADA');
            throw $error;
        }
        return ['item' => $saved, 'creada' => $id === null];
    }

    private static function cambiarEstadoDatos(array $auth, int $id, bool $active): array
    {
        $db = $auth['db'];
        $saved = transaction($db, static function () use ($db, $auth, $id, $active): array {
            $statement = $db->prepare('SELECT * FROM categorias WHERE id_categoria = ? FOR UPDATE');
            $statement->execute([$id]);
            $locked = $statement->fetch();
            if (!$locked) api_error('La categoría no existe.', 'CATEGORIA_NO_ENCONTRADA', 404);
            if ((bool)$locked['activo'] === $active) {
                api_error($active ? 'La categoría ya se encuentra activa.' : 'La categoría ya se encuentra dada de baja.', 'ESTADO_SIN_CAMBIOS', 409);
            }
            $before = self::detalle($db, $id) ?? $locked;
            $db->prepare('UPDATE categorias SET activo = ? WHERE id_categoria = ?')->execute([$active ? 1 : 0, $id]);
            $after = self::detalle($db, $id);
            audit_change($db, $auth, 'CATEGORIAS', $active ? 'REACTIVAR' : 'DAR_BAJA', 'categorias', $id, $active ? 'Se reactivó la categoría.' : 'Se dio de baja la categoría.', $before, $after);
            return $after ?? [];
        });
        return ['item' => $saved];
    }

    private static function historialDatos(PDO $db, int $id): array
    {
        if (!self::detalle($db, $id)) api_error('La categoría no existe.', 'CATEGORIA_NO_ENCONTRADA', 404);
        $statement = $db->prepare(
            'SELECT id_historial, monto_anterior, monto_nuevo, vigente_desde, vigente_hasta, motivo, created_at
             FROM categorias_precios_historial WHERE id_categoria = ?
             ORDER BY vigente_desde DESC, id_historial DESC'
        );
        $statement->execute([$id]);
        return ['items' => $statement->fetchAll()];
    }

    private static function detalle(PDO $db, int $id): ?array
    {
        $statement = $db->prepare(
            'SELECT c.*,
                    COUNT(DISTINCT CASE WHEN sc.activo = 1 AND s.activo = 1 THEN sc.id_socio END) AS cantidad_socios
             FROM categorias c
             LEFT JOIN socio_categorias sc ON sc.id_categoria = c.id_categoria
             LEFT JOIN socios s ON s.id_socio = sc.id_socio
             WHERE c.id_categoria = ?
             GROUP BY c.id_categoria'
        );
        $statement->execute([$id]);
        $category = $statement->fetch();
        if (!$category) return null;
        $category['id_categoria'] = (int)$category['id_categoria'];
        $category['cantidad_socios'] = (int)$category['cantidad_socios'];
        $category['activo'] = (bool)$category['activo'];
        return $category;
    }

    private static function listarDescuentosDatos(PDO $db): array
    {
        $items = $db->query(
            'SELECT id_descuento_familiar, cantidad_integrantes, porcentaje_descuento, created_at, updated_at
             FROM descuentos_familiares ORDER BY cantidad_integrantes ASC'
        )->fetchAll();
        foreach ($items as &$item) $item = self::castDescuento($item);
        unset($item);
        return $items;
    }

    private static function guardarDescuentoDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = isset($body['id_descuento_familiar']) && $body['id_descuento_familiar'] !== ''
            ? positive_id($body['id_descuento_familiar'], 'descuento familiar')
            : null;
        $quantity = filter_var($body['cantidad_integrantes'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 2, 'max_range' => 50]]);
        if ($quantity === false) api_error('La cantidad de integrantes debe estar entre 2 y 50.', 'VALIDATION_ERROR');
        $percentage = decimal_amount($body['porcentaje_descuento'] ?? null, 'porcentaje de descuento', 0.01, 100);

        try {
            $saved = transaction($db, static function () use ($db, $auth, $id, $quantity, $percentage): array {
                $duplicate = $db->prepare(
                    'SELECT id_descuento_familiar FROM descuentos_familiares
                     WHERE cantidad_integrantes = ? AND id_descuento_familiar <> ? LIMIT 1'
                );
                $duplicate->execute([(int)$quantity, $id ?? 0]);
                if ($duplicate->fetch()) api_error('Ya existe una regla para esa cantidad de integrantes.', 'DESCUENTO_FAMILIAR_DUPLICADO');

                if ($id === null) {
                    $db->prepare(
                        'INSERT INTO descuentos_familiares (cantidad_integrantes, porcentaje_descuento) VALUES (?, ?)'
                    )->execute([(int)$quantity, $percentage]);
                    $discountId = (int)$db->lastInsertId();
                    $before = null;
                    $action = 'CREAR_DESCUENTO_FAMILIAR';
                } else {
                    $lock = $db->prepare('SELECT * FROM descuentos_familiares WHERE id_descuento_familiar = ? FOR UPDATE');
                    $lock->execute([$id]);
                    $before = $lock->fetch();
                    if (!$before) api_error('El descuento familiar no existe.', 'DESCUENTO_FAMILIAR_NO_ENCONTRADO', 404);
                    $discountId = $id;
                    $action = 'MODIFICAR_DESCUENTO_FAMILIAR';
                    $db->prepare(
                        'UPDATE descuentos_familiares SET cantidad_integrantes = ?, porcentaje_descuento = ? WHERE id_descuento_familiar = ?'
                    )->execute([(int)$quantity, $percentage, $discountId]);
                }

                $statement = $db->prepare(
                    'SELECT id_descuento_familiar, cantidad_integrantes, porcentaje_descuento, created_at, updated_at
                     FROM descuentos_familiares WHERE id_descuento_familiar = ?'
                );
                $statement->execute([$discountId]);
                $after = self::castDescuento($statement->fetch() ?: []);
                audit_change($db, $auth, 'CATEGORIAS', $action, 'descuentos_familiares', $discountId, 'Se guardó una regla de descuento familiar.', $before, $after);
                return $after;
            });
        } catch (Throwable $error) {
            if (duplicate_key($error)) api_error('Ya existe una regla para esa cantidad de integrantes.', 'DESCUENTO_FAMILIAR_DUPLICADO');
            throw $error;
        }
        return ['item' => $saved, 'creado' => $id === null];
    }

    private static function eliminarDescuentoDatos(array $auth, int $id): void
    {
        $db = $auth['db'];
        transaction($db, static function () use ($db, $auth, $id): void {
            $statement = $db->prepare('SELECT * FROM descuentos_familiares WHERE id_descuento_familiar = ? FOR UPDATE');
            $statement->execute([$id]);
            $before = $statement->fetch();
            if (!$before) api_error('El descuento familiar no existe.', 'DESCUENTO_FAMILIAR_NO_ENCONTRADO', 404);
            $db->prepare('DELETE FROM descuentos_familiares WHERE id_descuento_familiar = ?')->execute([$id]);
            audit_change($db, $auth, 'CATEGORIAS', 'ELIMINAR_DESCUENTO_FAMILIAR', 'descuentos_familiares', $id, 'Se eliminó una regla de descuento familiar.', $before, null);
        });
    }

    private static function castDescuento(array $item): array
    {
        if ($item === []) return [];
        $item['id_descuento_familiar'] = (int)$item['id_descuento_familiar'];
        $item['cantidad_integrantes'] = (int)$item['cantidad_integrantes'];
        $item['porcentaje_descuento'] = (string)$item['porcentaje_descuento'];
        return $item;
    }
}
