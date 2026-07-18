<?php
declare(strict_types=1);

final class Familias
{
    public static function listar(): never
    {
        $auth = auth_context();
        api_success(self::listarDatos($auth['db'], $_GET));
    }

    public static function obtener(): never
    {
        $auth = auth_context();
        $id = positive_id($_GET['id'] ?? null, 'familia');
        api_success(self::obtenerDatos($auth['db'], $id));
    }

    public static function guardar(): never
    {
        $auth = require_admin();
        $result = self::guardarDatos($auth, request_body());
        $created = (bool)$result['creada'];
        unset($result['creada']);
        api_success($result, $created ? 'Familia creada correctamente.' : 'Familia actualizada correctamente.');
    }

    public static function darBaja(): never
    {
        $auth = require_admin();
        $id = positive_id(request_body()['id'] ?? null, 'familia');
        api_success(self::cambiarEstadoDatos($auth, $id, false), 'Familia dada de baja correctamente.');
    }

    public static function reactivar(): never
    {
        $auth = require_admin();
        $id = positive_id(request_body()['id'] ?? null, 'familia');
        api_success(self::cambiarEstadoDatos($auth, $id, true), 'Familia reactivada correctamente.');
    }

    private static function listarDatos(PDO $db, array $filters): array
    {
        $where = [];
        $params = [];
        $search = clean_text($filters['buscar'] ?? '', 150, false);
        if ($search !== '') {
            $where[] = '(f.nombre LIKE :buscar_familia OR f.descripcion LIKE :buscar_descripcion OR EXISTS (
                SELECT 1 FROM familia_socios fss INNER JOIN socios ss ON ss.id_socio = fss.id_socio
                WHERE fss.id_familia = f.id_familia AND (ss.nombre LIKE :buscar_socio_nombre OR ss.apellido LIKE :buscar_socio_apellido OR ss.dni LIKE :buscar_socio_dni)
            ))';
            $term = '%' . $search . '%';
            $params['buscar_familia'] = $term;
            $params['buscar_descripcion'] = $term;
            $params['buscar_socio_nombre'] = $term;
            $params['buscar_socio_apellido'] = $term;
            $params['buscar_socio_dni'] = $term;
        }

        $status = trim((string)($filters['estado'] ?? ''));
        if (!in_array($status, ['', 'activo', 'inactivo'], true)) {
            api_error('El estado solicitado no es válido.', 'FILTRO_INVALIDO');
        }
        if ($status === 'activo') $where[] = 'f.activo = 1';
        if ($status === 'inactivo') $where[] = 'f.activo = 0';

        $sqlWhere = $where === [] ? '' : 'WHERE ' . implode(' AND ', $where);
        $statement = $db->prepare("SELECT f.* FROM familias f {$sqlWhere} ORDER BY f.activo DESC, f.nombre ASC LIMIT 500");
        $statement->execute($params);
        $items = self::hidratar($db, $statement->fetchAll());

        $summary = $db->query(
            'SELECT COUNT(*) AS total, SUM(activo = 1) AS activas, SUM(activo = 0) AS inactivas FROM familias'
        )->fetch();
        $members = (int)$db->query(
            'SELECT COUNT(*) FROM familia_socios fs
             INNER JOIN familias f ON f.id_familia = fs.id_familia
             INNER JOIN socios s ON s.id_socio = fs.id_socio
             WHERE f.activo = 1 AND s.activo = 1'
        )->fetchColumn();

        return [
            'items' => $items,
            'resumen' => [
                'total' => (int)($summary['total'] ?? 0),
                'activas' => (int)($summary['activas'] ?? 0),
                'inactivas' => (int)($summary['inactivas'] ?? 0),
                'integrantes' => $members,
            ],
            'catalogos' => ['socios' => self::sociosCatalogo($db)],
        ];
    }

    private static function obtenerDatos(PDO $db, int $id): array
    {
        $item = self::detalle($db, $id);
        if (!$item) api_error('La familia no existe.', 'FAMILIA_NO_ENCONTRADA', 404);
        return ['item' => $item, 'catalogos' => ['socios' => self::sociosCatalogo($db)]];
    }

    private static function guardarDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = isset($body['id_familia']) && $body['id_familia'] !== ''
            ? positive_id($body['id_familia'], 'familia')
            : null;
        $name = required_text($body, 'nombre', 'nombre', 150);
        $description = optional_text($body['descripcion'] ?? null, 500);
        $memberIds = id_list($body['integrante_ids'] ?? []);
        if ($memberIds === []) {
            api_error('Seleccioná al menos un integrante para la familia.', 'VALIDATION_ERROR');
        }

        try {
            $saved = transaction($db, static function () use ($db, $auth, $id, $name, $description, $memberIds): array {
                $duplicate = $db->prepare('SELECT id_familia FROM familias WHERE nombre = ? AND id_familia <> ? LIMIT 1');
                $duplicate->execute([$name, $id ?? 0]);
                if ($duplicate->fetch()) api_error('Ya existe otra familia con ese nombre.', 'FAMILIA_DUPLICADA');

                $placeholders = implode(',', array_fill(0, count($memberIds), '?'));
                $members = $db->prepare(
                    "SELECT s.id_socio
                     FROM socios s
                     WHERE s.id_socio IN ({$placeholders}) AND (
                        s.activo = 1 OR EXISTS (
                            SELECT 1 FROM familia_socios fs WHERE fs.id_socio = s.id_socio AND fs.id_familia = ?
                        )
                     )
                     FOR UPDATE"
                );
                $members->execute(array_merge($memberIds, [$id ?? 0]));
                if (count($members->fetchAll()) !== count($memberIds)) {
                    api_error('Uno de los integrantes no existe o está inactivo.', 'SOCIO_INACTIVO');
                }

                $conflicts = $db->prepare(
                    "SELECT s.apellido, s.nombre, f.nombre AS familia
                     FROM familia_socios fs
                     INNER JOIN socios s ON s.id_socio = fs.id_socio
                     INNER JOIN familias f ON f.id_familia = fs.id_familia
                     WHERE fs.id_socio IN ({$placeholders}) AND fs.id_familia <> ? LIMIT 1"
                );
                $conflicts->execute(array_merge($memberIds, [$id ?? 0]));
                if ($conflict = $conflicts->fetch()) {
                    api_error("{$conflict['apellido']}, {$conflict['nombre']} ya pertenece a {$conflict['familia']}.", 'SOCIO_YA_TIENE_FAMILIA');
                }

                $before = null;
                if ($id === null) {
                    $db->prepare('INSERT INTO familias (nombre, descripcion, activo) VALUES (?, ?, 1)')->execute([$name, $description]);
                    $familyId = (int)$db->lastInsertId();
                } else {
                    $lock = $db->prepare('SELECT * FROM familias WHERE id_familia = ? FOR UPDATE');
                    $lock->execute([$id]);
                    $locked = $lock->fetch();
                    if (!$locked) api_error('La familia no existe.', 'FAMILIA_NO_ENCONTRADA', 404);
                    $before = self::detalle($db, $id) ?? $locked;
                    $familyId = $id;
                    $db->prepare('UPDATE familias SET nombre = ?, descripcion = ? WHERE id_familia = ?')->execute([$name, $description, $familyId]);
                    $db->prepare('DELETE FROM familia_socios WHERE id_familia = ?')->execute([$familyId]);
                }

                $insert = $db->prepare('INSERT INTO familia_socios (id_familia, id_socio) VALUES (?, ?)');
                foreach ($memberIds as $memberId) $insert->execute([$familyId, $memberId]);
                $after = self::detalle($db, $familyId);
                audit_change(
                    $db,
                    $auth,
                    'FAMILIAS',
                    $id === null ? 'CREAR' : 'MODIFICAR',
                    'familias',
                    $familyId,
                    $id === null ? "Se creó la familia {$name}." : "Se modificó la familia {$name}.",
                    $before,
                    $after
                );
                return $after ?? [];
            });
        } catch (Throwable $error) {
            if (duplicate_key($error)) {
                api_error('El nombre ya existe o uno de los socios ya pertenece a otra familia.', 'SOCIO_YA_TIENE_FAMILIA');
            }
            throw $error;
        }

        return ['item' => $saved, 'creada' => $id === null];
    }

    private static function cambiarEstadoDatos(array $auth, int $id, bool $active): array
    {
        $db = $auth['db'];
        $saved = transaction($db, static function () use ($db, $auth, $id, $active): array {
            $statement = $db->prepare('SELECT * FROM familias WHERE id_familia = ? FOR UPDATE');
            $statement->execute([$id]);
            $locked = $statement->fetch();
            if (!$locked) api_error('La familia no existe.', 'FAMILIA_NO_ENCONTRADA', 404);
            if ((bool)$locked['activo'] === $active) {
                api_error(
                    $active ? 'La familia ya se encuentra activa.' : 'La familia ya se encuentra dada de baja.',
                    'ESTADO_SIN_CAMBIOS',
                    409
                );
            }
            $before = self::detalle($db, $id) ?? $locked;
            $db->prepare('UPDATE familias SET activo = ? WHERE id_familia = ?')->execute([$active ? 1 : 0, $id]);
            $after = self::detalle($db, $id);
            audit_change(
                $db,
                $auth,
                'FAMILIAS',
                $active ? 'REACTIVAR' : 'DAR_BAJA',
                'familias',
                $id,
                $active ? 'Se reactivó la familia.' : 'Se dio de baja la familia.',
                $before,
                $after
            );
            return $after ?? [];
        });
        return ['item' => $saved];
    }

    private static function sociosCatalogo(PDO $db): array
    {
        $rows = $db->query(
            'SELECT s.id_socio, s.apellido, s.nombre, s.dni, s.activo, fs.id_familia, f.nombre AS familia
             FROM socios s
             LEFT JOIN familia_socios fs ON fs.id_socio = s.id_socio
             LEFT JOIN familias f ON f.id_familia = fs.id_familia
             ORDER BY s.activo DESC, s.apellido, s.nombre'
        )->fetchAll();
        foreach ($rows as &$row) {
            $row['id_socio'] = (int)$row['id_socio'];
            $row['id_familia'] = $row['id_familia'] === null ? null : (int)$row['id_familia'];
            $row['activo'] = (bool)$row['activo'];
        }
        unset($row);
        return $rows;
    }

    private static function hidratar(PDO $db, array $families): array
    {
        if ($families === []) return [];
        $indexed = [];
        foreach ($families as $family) {
            $family['id_familia'] = (int)$family['id_familia'];
            $family['activo'] = (bool)$family['activo'];
            $family['integrantes'] = [];
            $indexed[$family['id_familia']] = $family;
        }

        $ids = array_keys($indexed);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $members = $db->prepare(
            "SELECT fs.id_familia, s.id_socio, s.nombre, s.apellido, s.dni, s.activo
             FROM familia_socios fs INNER JOIN socios s ON s.id_socio = fs.id_socio
             WHERE fs.id_familia IN ({$placeholders}) ORDER BY fs.id_familia, s.apellido, s.nombre"
        );
        $members->execute($ids);
        foreach ($members->fetchAll() as $member) {
            $familyId = (int)$member['id_familia'];
            unset($member['id_familia']);
            $member['id_socio'] = (int)$member['id_socio'];
            $member['activo'] = (bool)$member['activo'];
            $indexed[$familyId]['integrantes'][] = $member;
        }

        foreach ($indexed as &$family) {
            $family['integrante_ids'] = array_map(static fn(array $member): int => $member['id_socio'], $family['integrantes']);
            $family['cantidad_integrantes'] = count($family['integrantes']);
        }
        unset($family);
        return array_values($indexed);
    }

    private static function detalle(PDO $db, int $id): ?array
    {
        $statement = $db->prepare('SELECT * FROM familias WHERE id_familia = ?');
        $statement->execute([$id]);
        $family = $statement->fetch();
        if (!$family) return null;
        return self::hidratar($db, [$family])[0] ?? null;
    }
}
