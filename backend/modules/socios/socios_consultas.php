<?php
declare(strict_types=1);

trait SociosConsultas
{
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
}
