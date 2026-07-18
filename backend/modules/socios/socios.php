<?php
declare(strict_types=1);

final class Socios
{
    public static function listar(): never
    {
        $auth = auth_context();
        api_success(self::listarDatos($auth['db'], $_GET));
    }

    public static function obtener(): never
    {
        $auth = auth_context();
        $id = positive_id($_GET['id'] ?? null, 'socio');
        api_success(self::obtenerDatos($auth['db'], $id));
    }

    public static function guardar(): never
    {
        $auth = require_admin();
        $result = self::guardarDatos($auth, request_body());
        $created = (bool)$result['creado'];
        unset($result['creado']);
        api_success($result, $created ? 'Socio creado correctamente.' : 'Socio actualizado correctamente.');
    }

    public static function darBaja(): never
    {
        $auth = require_admin();
        $body = request_body();
        $id = positive_id($body['id'] ?? null, 'socio');
        $date = valid_date($body['fecha_baja'] ?? date('Y-m-d'), 'baja');
        $reason = required_text($body, 'motivo_baja', 'motivo de baja', 500);
        api_success(self::darBajaDatos($auth, $id, $date, $reason), 'Socio dado de baja correctamente.');
    }

    public static function reactivar(): never
    {
        $auth = require_admin();
        $id = positive_id(request_body()['id'] ?? null, 'socio');
        api_success(self::reactivarDatos($auth, $id), 'Socio reactivado correctamente.');
    }

    private static function listarDatos(PDO $db, array $filters): array
    {
        $where = [];
        $params = [];
        $search = clean_text($filters['buscar'] ?? '', 150, false);
        if ($search !== '') {
            $where[] = '(s.nombre LIKE :buscar_nombre OR s.apellido LIKE :buscar_apellido OR s.dni LIKE :buscar_dni OR s.telefono LIKE :buscar_telefono)';
            $term = '%' . $search . '%';
            $params['buscar_nombre'] = $term;
            $params['buscar_apellido'] = $term;
            $params['buscar_dni'] = $term;
            $params['buscar_telefono'] = $term;
        }

        $status = trim((string)($filters['estado'] ?? ''));
        if (!in_array($status, ['', 'activo', 'inactivo'], true)) {
            api_error('El estado solicitado no es válido.', 'FILTRO_INVALIDO');
        }
        if ($status === 'activo') $where[] = 's.activo = 1';
        if ($status === 'inactivo') $where[] = 's.activo = 0';

        if (($category = (int)($filters['categoria'] ?? 0)) > 0) {
            $where[] = 'EXISTS (SELECT 1 FROM socio_categorias scf WHERE scf.id_socio = s.id_socio AND scf.id_categoria = :categoria AND scf.activo = 1)';
            $params['categoria'] = $category;
        }
        if (($location = (int)($filters['localidad'] ?? 0)) > 0) {
            $where[] = 's.id_localidad = :localidad';
            $params['localidad'] = $location;
        }
        if (($family = (int)($filters['familia'] ?? 0)) > 0) {
            $where[] = 'fs.id_familia = :familia';
            $params['familia'] = $family;
        }
        if (trim((string)($filters['familia'] ?? '')) === 'sin_familia') {
            $where[] = 'fs.id_familia IS NULL';
        }

        $from = trim((string)($filters['ingreso_desde'] ?? ''));
        $to = trim((string)($filters['ingreso_hasta'] ?? ''));
        if ($from !== '') {
            $from = valid_date($from, 'ingreso desde');
            $where[] = 's.fecha_ingreso >= :desde';
            $params['desde'] = $from;
        }
        if ($to !== '') {
            $to = valid_date($to, 'ingreso hasta');
            $where[] = 's.fecha_ingreso <= :hasta';
            $params['hasta'] = $to;
        }
        if ($from !== '' && $to !== '' && $from > $to) {
            api_error('La fecha desde no puede ser posterior a la fecha hasta.', 'FILTRO_INVALIDO');
        }

        $sqlWhere = $where === [] ? '' : 'WHERE ' . implode(' AND ', $where);
        $statement = $db->prepare(self::baseQuery($sqlWhere) . ' ORDER BY s.activo DESC, s.apellido ASC, s.nombre ASC LIMIT 500');
        $statement->execute($params);
        $items = [];
        foreach ($statement->fetchAll() as $row) $items[] = self::cast($row);

        $summary = $db->query(
            'SELECT COUNT(*) AS total,
                    SUM(s.activo = 1) AS activos,
                    SUM(s.activo = 0) AS inactivos,
                    SUM(s.activo = 1 AND fs.id_familia IS NULL) AS sin_familia,
                    SUM(s.activo = 1 AND s.fecha_ingreso >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS altas_recientes
             FROM socios s LEFT JOIN familia_socios fs ON fs.id_socio = s.id_socio'
        )->fetch();
        $families = (int)$db->query('SELECT COUNT(*) FROM familias WHERE activo = 1')->fetchColumn();

        return [
            'items' => $items,
            'resumen' => [
                'total' => (int)($summary['total'] ?? 0),
                'activos' => (int)($summary['activos'] ?? 0),
                'inactivos' => (int)($summary['inactivos'] ?? 0),
                'sin_familia' => (int)($summary['sin_familia'] ?? 0),
                'altas_recientes' => (int)($summary['altas_recientes'] ?? 0),
                'familias' => $families,
            ],
            'catalogos' => self::catalogos($db),
        ];
    }

    private static function obtenerDatos(PDO $db, int $id): array
    {
        $item = self::detalle($db, $id);
        if (!$item) api_error('El socio no existe.', 'SOCIO_NO_ENCONTRADO', 404);
        return ['item' => $item, 'catalogos' => self::catalogos($db)];
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
        if ($dni === '') api_error('El DNI es obligatorio.', 'VALIDATION_ERROR');

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
        $categoryIds = self::validarCategorias($db, $body['categoria_ids'] ?? []);

        try {
            $saved = transaction($db, static function () use ($db, $auth, $body, $id, $name, $surname, $dni, $birthDate, $sex, $address, $phone, $email, $admissionDate, $observations, $categoryIds): array {
                $locationId = self::resolverLocalidad($db, $auth, $body);
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
                    self::sincronizarCategorias($db, $partnerId, $categoryIds, $admissionDate, true);
                    $after = self::detalle($db, $partnerId);
                    audit_change($db, $auth, 'SOCIOS', 'CREAR', 'socios', $partnerId, "Se creó el socio {$surname}, {$name}.", null, $after);
                    return $after ?? [];
                }

                $lock = $db->prepare('SELECT * FROM socios WHERE id_socio = ? FOR UPDATE');
                $lock->execute([$id]);
                $locked = $lock->fetch();
                if (!$locked) api_error('El socio no existe.', 'SOCIO_NO_ENCONTRADO', 404);
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
                self::sincronizarCategorias($db, $id, $categoryIds, $admissionDate, false);
                $after = self::detalle($db, $id);
                audit_change($db, $auth, 'SOCIOS', 'MODIFICAR', 'socios', $id, "Se modificó el socio {$surname}, {$name}.", $before, $after);
                return $after ?? [];
            });
        } catch (Throwable $error) {
            if (duplicate_key($error)) {
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
            if (!$locked) api_error('El socio no existe.', 'SOCIO_NO_ENCONTRADO', 404);
            if (!(bool)$locked['activo']) api_error('El socio ya se encuentra dado de baja.', 'ESTADO_SIN_CAMBIOS', 409);
            if ($date < $locked['fecha_ingreso']) {
                api_error('La fecha de baja no puede ser anterior a la fecha de ingreso.', 'FECHA_BAJA_INVALIDA');
            }
            $before = self::detalle($db, $id) ?? $locked;
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
            if (!$locked) api_error('El socio no existe.', 'SOCIO_NO_ENCONTRADO', 404);
            if ((bool)$locked['activo']) api_error('El socio ya se encuentra activo.', 'ESTADO_SIN_CAMBIOS', 409);
            $before = self::detalle($db, $id) ?? $locked;
            $db->prepare('UPDATE socios SET activo = 1, fecha_baja = NULL, motivo_baja = NULL WHERE id_socio = ?')->execute([$id]);
            $after = self::detalle($db, $id);
            audit_change($db, $auth, 'SOCIOS', 'REACTIVAR', 'socios', $id, 'Se reactivó al socio.', $before, $after);
            return $after ?? [];
        });
        return ['item' => $saved];
    }

    private static function catalogos(PDO $db): array
    {
        $locations = $db->query(
            'SELECT id_localidad, nombre, codigo_postal FROM localidades WHERE activo = 1 ORDER BY nombre'
        )->fetchAll();
        $categories = $db->query(
            'SELECT id_categoria, nombre, monto_actual FROM categorias WHERE activo = 1 ORDER BY nombre'
        )->fetchAll();
        $families = $db->query(
            'SELECT id_familia, nombre FROM familias WHERE activo = 1 ORDER BY nombre'
        )->fetchAll();
        foreach ($locations as &$row) $row['id_localidad'] = (int)$row['id_localidad'];
        foreach ($categories as &$row) $row['id_categoria'] = (int)$row['id_categoria'];
        foreach ($families as &$row) $row['id_familia'] = (int)$row['id_familia'];
        unset($row);
        return ['localidades' => $locations, 'categorias' => $categories, 'familias' => $families];
    }

    private static function baseQuery(string $extraWhere = ''): string
    {
        return "SELECT
                    s.id_socio, s.nombre, s.apellido, s.dni, s.fecha_nacimiento, s.sexo,
                    s.domicilio, s.id_localidad, l.nombre AS localidad, s.telefono, s.email,
                    s.fecha_ingreso, s.observaciones, s.activo, s.fecha_baja, s.motivo_baja,
                    s.created_at, s.updated_at,
                    f.id_familia, f.nombre AS familia,
                    GROUP_CONCAT(DISTINCT CASE WHEN sc.activo = 1 THEN c.id_categoria END ORDER BY c.nombre SEPARATOR ',') AS categoria_ids,
                    GROUP_CONCAT(DISTINCT CASE WHEN sc.activo = 1 THEN c.nombre END ORDER BY c.nombre SEPARATOR ' · ') AS categorias
                FROM socios s
                INNER JOIN localidades l ON l.id_localidad = s.id_localidad
                LEFT JOIN familia_socios fs ON fs.id_socio = s.id_socio
                LEFT JOIN familias f ON f.id_familia = fs.id_familia
                LEFT JOIN socio_categorias sc ON sc.id_socio = s.id_socio
                LEFT JOIN categorias c ON c.id_categoria = sc.id_categoria
                {$extraWhere}
                GROUP BY s.id_socio, l.id_localidad, f.id_familia";
    }

    private static function cast(array $row): array
    {
        $row['id_socio'] = (int)$row['id_socio'];
        $row['id_localidad'] = (int)$row['id_localidad'];
        $row['id_familia'] = $row['id_familia'] === null ? null : (int)$row['id_familia'];
        $row['activo'] = (bool)$row['activo'];
        $row['categoria_ids'] = $row['categoria_ids'] === null || $row['categoria_ids'] === ''
            ? []
            : array_map('intval', explode(',', (string)$row['categoria_ids']));
        return $row;
    }

    private static function detalle(PDO $db, int $id): ?array
    {
        $statement = $db->prepare(self::baseQuery('WHERE s.id_socio = ?'));
        $statement->execute([$id]);
        $row = $statement->fetch();
        return $row ? self::cast($row) : null;
    }

    private static function resolverLocalidad(PDO $db, array $auth, array $body): int
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
        $statement = $db->prepare('SELECT id_localidad FROM localidades WHERE id_localidad = ? AND activo = 1');
        $statement->execute([$id]);
        if (!$statement->fetch()) {
            api_error('La localidad seleccionada no existe o está inactiva.', 'LOCALIDAD_INVALIDA');
        }
        return $id;
    }

    private static function validarCategorias(PDO $db, mixed $value): array
    {
        $ids = id_list($value);
        if ($ids === []) return [];
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $statement = $db->prepare("SELECT id_categoria FROM categorias WHERE activo = 1 AND id_categoria IN ({$placeholders})");
        $statement->execute($ids);
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
        $currentStatement = $db->prepare('SELECT id_socio_categoria, id_categoria, activo, fecha_desde FROM socio_categorias WHERE id_socio = ? FOR UPDATE');
        $currentStatement->execute([$partnerId]);
        $current = [];
        foreach ($currentStatement->fetchAll() as $row) $current[(int)$row['id_categoria']] = $row;
        $selected = array_fill_keys($categoryIds, true);
        $today = date('Y-m-d');

        foreach ($current as $categoryId => $row) {
            if ((bool)$row['activo'] && !isset($selected[$categoryId])) {
                $until = max((string)$row['fecha_desde'], $today);
                $db->prepare('UPDATE socio_categorias SET activo = 0, fecha_hasta = ? WHERE id_socio_categoria = ?')
                    ->execute([$until, $row['id_socio_categoria']]);
            }
        }
        foreach ($categoryIds as $categoryId) {
            if (!isset($current[$categoryId])) {
                $from = $isNew ? $admissionDate : max($admissionDate, $today);
                $db->prepare('INSERT INTO socio_categorias (id_socio, id_categoria, fecha_desde, fecha_hasta, activo) VALUES (?, ?, ?, NULL, 1)')
                    ->execute([$partnerId, $categoryId, $from]);
            } elseif (!(bool)$current[$categoryId]['activo']) {
                $from = max($admissionDate, $today);
                $db->prepare('UPDATE socio_categorias SET activo = 1, fecha_desde = ?, fecha_hasta = NULL WHERE id_socio_categoria = ?')
                    ->execute([$from, $current[$categoryId]['id_socio_categoria']]);
            }
        }
    }
}
