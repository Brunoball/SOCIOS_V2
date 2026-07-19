<?php
declare(strict_types=1);

trait ConfiguracionConsultas
{
    private static function obtenerDatos(PDO $db): array
    {
        $paymentMethods = self::listarMediosPago($db);
        $locations = self::listarLocalidades($db);

        return [
            'parametros' => [
                'monto_inscripcion' => self::montoInscripcionConfigurado($db),
            ],
            'listas' => [
                'medios_pago' => $paymentMethods,
                'localidades' => $locations,
            ],
            'resumen' => [
                'medios_pago_activos' => count(array_filter(
                    $paymentMethods,
                    static fn(array $item): bool => $item['activo']
                )),
                'localidades_activas' => count(array_filter(
                    $locations,
                    static fn(array $item): bool => $item['activo']
                )),
            ],
        ];
    }

    private static function montoInscripcionConfigurado(PDO $db): string
    {
        $statement = $db->prepare(
            "SELECT monto_fijo
             FROM modalidades_pago
             WHERE codigo = 'INSCRIPCION'
             LIMIT 1"
        );
        $statement->execute();
        $value = $statement->fetchColumn();
        if ($value === false) {
            api_error(
                'No existe la modalidad INSCRIPCION en la base del tenant.',
                'MODALIDAD_INSCRIPCION_NO_CONFIGURADA',
                500
            );
        }
        return number_format((float)($value ?? 0), 2, '.', '');
    }

    private static function listarMediosPago(PDO $db): array
    {
        $rows = $db->query(
            "SELECT mp.id_medio_pago, mp.nombre, mp.activo,
                    (
                        (SELECT COUNT(*) FROM pagos p WHERE p.id_medio_pago = mp.id_medio_pago)
                        +
                        (SELECT COUNT(*) FROM pagos_inscripciones pi WHERE pi.id_medio_pago = mp.id_medio_pago)
                    ) AS cantidad_usos
             FROM medios_pago mp
             WHERE mp.nombre <> 'CONDONACIÓN'
             ORDER BY mp.activo DESC, mp.nombre"
        )->fetchAll();

        foreach ($rows as &$row) {
            $row['id_medio_pago'] = (int)$row['id_medio_pago'];
            $row['activo'] = (bool)$row['activo'];
            $row['cantidad_usos'] = (int)$row['cantidad_usos'];
        }
        unset($row);
        return $rows;
    }

    private static function listarLocalidades(PDO $db): array
    {
        $rows = $db->query(
            'SELECT l.id_localidad, l.nombre, l.codigo_postal, l.activo,
                    (SELECT COUNT(*) FROM socios s WHERE s.id_localidad = l.id_localidad) AS cantidad_usos
             FROM localidades l
             ORDER BY l.activo DESC, l.nombre'
        )->fetchAll();

        foreach ($rows as &$row) {
            $row['id_localidad'] = (int)$row['id_localidad'];
            $row['activo'] = (bool)$row['activo'];
            $row['cantidad_usos'] = (int)$row['cantidad_usos'];
        }
        unset($row);
        return $rows;
    }

    private static function itemConfiguracion(PDO $db, string $list, int $id, bool $lock = false): ?array
    {
        $suffix = $lock ? ' FOR UPDATE' : '';
        if ($list === 'medios_pago') {
            $statement = $db->prepare(
                'SELECT id_medio_pago, nombre, activo
                 FROM medios_pago
                 WHERE id_medio_pago = ?' . $suffix
            );
        } else {
            $statement = $db->prepare(
                'SELECT id_localidad, nombre, codigo_postal, activo
                 FROM localidades
                 WHERE id_localidad = ?' . $suffix
            );
        }
        $statement->execute([$id]);
        $row = $statement->fetch();
        if (!$row) return null;

        if ($list === 'medios_pago') $row['id_medio_pago'] = (int)$row['id_medio_pago'];
        else $row['id_localidad'] = (int)$row['id_localidad'];
        $row['activo'] = (bool)$row['activo'];
        return $row;
    }

    private static function listaValida(mixed $value): string
    {
        $list = strtolower(trim((string)$value));
        if (!in_array($list, ['medios_pago', 'localidades'], true)) {
            api_error('La lista solicitada no es válida.', 'LISTA_CONFIGURACION_INVALIDA');
        }
        return $list;
    }

    private static function esMedioInterno(string $name): bool
    {
        $upper = function_exists('mb_strtoupper')
            ? mb_strtoupper(trim($name), 'UTF-8')
            : strtoupper(trim($name));
        $normalized = strtr($upper, [
            'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ü' => 'U',
        ]);
        return $normalized === 'CONDONACION';
    }
}
