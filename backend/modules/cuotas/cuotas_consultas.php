<?php
declare(strict_types=1);

require_once __DIR__ . '/cuotas_soporte.php';

abstract class CuotasConsultas extends CuotasSoporte
{
    protected static function listarDatos(PDO $db, array $filters): array
    {
        $tab = strtolower(trim((string)($filters['pestana'] ?? 'deudores')));
        if (!in_array($tab, ['deudores', 'pagados', 'condonados'], true)) {
            api_error('La pestaña solicitada no es válida.', 'FILTRO_INVALIDO');
        }
        $search = clean_text($filters['buscar'] ?? '', 160, false);
        $categoryId = trim((string)($filters['categoria'] ?? ''));
        $categoryId = $categoryId === '' ? null : positive_id($categoryId, 'categoría');
        $yearText = trim((string)($filters['anio'] ?? ''));
        $year = $yearText === '' ? null : filter_var($yearText, FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 2000, 'max_range' => (int)date('Y') + 1],
        ]);
        if ($year === false) api_error('El año seleccionado no es válido.', 'FILTRO_INVALIDO');
        $year = $year === null ? null : (int)$year;
        $monthText = trim((string)($filters['mes'] ?? ''));
        $month = $monthText === '' ? null : filter_var($monthText, FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1, 'max_range' => 12],
        ]);
        if ($month === false) api_error('El mes seleccionado no es válido.', 'FILTRO_INVALIDO');
        $month = $month === null ? null : (int)$month;

        $result = $tab === 'deudores'
            ? self::listarDeudores($db, $search, $categoryId, $year, $month)
            : self::listarOperaciones(
                $db,
                $tab === 'pagados' ? 'PAGADO' : 'CONDONADO',
                $search,
                $categoryId,
                $year,
                $month
            );

        $result['catalogos'] = [
            'categorias' => self::categoriasCatalogo($db, false),
            'anios' => self::aniosCatalogo($db),
            'meses' => self::mesesCatalogo($db),
        ];
        $result['filtros'] = ['anio' => $year, 'mes' => $month];
        return $result;
    }

    protected static function catalogosDatos(PDO $db): array
    {
        $socios = $db->query(
            'SELECT s.id_socio, s.apellido, s.nombre, s.dni, f.nombre AS familia
             FROM socios s
             LEFT JOIN familia_socios fs ON fs.id_socio = s.id_socio
             LEFT JOIN familias f ON f.id_familia = fs.id_familia AND f.activo = 1
             WHERE s.activo = 1
             ORDER BY s.apellido, s.nombre'
        )->fetchAll();
        foreach ($socios as &$socio) $socio['id_socio'] = (int)$socio['id_socio'];
        unset($socio);

        return [
            'socios' => $socios,
            'categorias' => self::categoriasCatalogo($db, true),
            'medios_pago' => self::mediosPagoCatalogo($db),
        ];
    }

    protected static function listarDeudores(
        PDO $db,
        string $search,
        ?int $categoryId,
        ?int $selectedYear,
        ?int $selectedMonth
    ): array
    {
        $where = ['s.activo = 1', 'sc.activo = 1', 'c.activo = 1'];
        $params = [];
        if ($search !== '') {
            $where[] = '(s.nombre LIKE :buscar_nombre OR s.apellido LIKE :buscar_apellido OR s.dni LIKE :buscar_dni OR c.nombre LIKE :buscar_categoria)';
            $term = '%' . $search . '%';
            $params = [
                'buscar_nombre' => $term,
                'buscar_apellido' => $term,
                'buscar_dni' => $term,
                'buscar_categoria' => $term,
            ];
        }
        if ($categoryId !== null) {
            $where[] = 'c.id_categoria = :categoria';
            $params['categoria'] = $categoryId;
        }

        $statement = $db->prepare(
            'SELECT s.id_socio, s.apellido, s.nombre, s.dni, s.fecha_ingreso,
                    sc.id_categoria, sc.fecha_desde, sc.fecha_hasta,
                    c.nombre AS categoria, c.monto_actual,
                    f.id_familia, f.nombre AS familia
             FROM socios s
             INNER JOIN socio_categorias sc ON sc.id_socio = s.id_socio
             INNER JOIN categorias c ON c.id_categoria = sc.id_categoria
             LEFT JOIN familia_socios fs ON fs.id_socio = s.id_socio
             LEFT JOIN familias f ON f.id_familia = fs.id_familia AND f.activo = 1
             WHERE ' . implode(' AND ', $where) . '
             ORDER BY s.apellido, s.nombre, c.nombre
             LIMIT 1000'
        );
        $statement->execute($params);
        $assignments = $statement->fetchAll();
        if ($assignments === []) {
            return ['items' => [], 'resumen' => ['registros' => 0, 'periodos' => 0, 'monto' => '0.00']];
        }

        $paymentRows = $db->query(
            "SELECT id_socio, id_categoria, anio, id_mes, estado
             FROM pagos WHERE estado IN ('PAGADO','CONDONADO')"
        )->fetchAll();
        $registered = [];
        foreach ($paymentRows as $payment) {
            $registered[self::periodKey((int)$payment['id_socio'], (int)$payment['id_categoria'], (int)$payment['anio'], (int)$payment['id_mes'])] = $payment['estado'];
        }

        $categoryIds = array_values(array_unique(array_map(static fn(array $row): int => (int)$row['id_categoria'], $assignments)));
        $prices = self::priceHistory($db, $categoryIds);
        $rules = self::discountRules($db);
        $familyCounts = self::familyCounts($db);
        // Cada socio conserva su deuda individual. Para permitir el pago
        // anticipado, se muestran los períodos hasta diciembre del año
        // consultado (o del año actual cuando no hay filtro de año).
        $listingEndYear = $selectedYear ?? (int)date('Y');
        $listingEndMonth = new DateTimeImmutable($listingEndYear . '-12-01');
        $items = [];
        $totalPeriods = 0;
        $totalAmount = 0.0;

        foreach ($assignments as $assignment) {
            $startText = max((string)$assignment['fecha_ingreso'], (string)$assignment['fecha_desde']);
            $start = new DateTimeImmutable(substr($startText, 0, 7) . '-01');
            $end = $listingEndMonth;
            if ($assignment['fecha_hasta']) {
                $assignmentEnd = new DateTimeImmutable(substr((string)$assignment['fecha_hasta'], 0, 7) . '-01');
                if ($assignmentEnd < $end) $end = $assignmentEnd;
            }
            if ($start > $end) continue;

            $familyId = $assignment['id_familia'] === null ? null : (int)$assignment['id_familia'];
            $memberCount = $familyId === null ? 0 : ($familyCounts[$familyId] ?? 0);
            $discount = self::discountForCount($rules, $memberCount);
            $periodCount = 0;
            $baseTotal = 0.0;
            $amountTotal = 0.0;
            $firstPeriod = null;
            $lastPeriod = null;

            for ($period = $start; $period <= $end; $period = $period->modify('+1 month')) {
                $year = (int)$period->format('Y');
                $month = (int)$period->format('n');
                if ($selectedYear !== null && $year !== $selectedYear) continue;
                if ($selectedMonth !== null && $month !== $selectedMonth) continue;
                $key = self::periodKey((int)$assignment['id_socio'], (int)$assignment['id_categoria'], $year, $month);
                if (isset($registered[$key])) continue;
                $base = self::priceForPeriod($prices[(int)$assignment['id_categoria']] ?? [], (float)$assignment['monto_actual'], $year, $month);
                $amount = round($base * (1 - $discount / 100), 2);
                $label = self::monthName($month) . ' ' . $year;
                $firstPeriod ??= ['anio' => $year, 'mes' => $month, 'label' => $label];
                $lastPeriod = ['anio' => $year, 'mes' => $month, 'label' => $label];
                $periodCount++;
                $baseTotal += $base;
                $amountTotal += $amount;
            }
            if ($periodCount === 0) continue;

            $totalPeriods += $periodCount;
            $totalAmount += $amountTotal;
            $items[] = [
                'id_socio' => (int)$assignment['id_socio'],
                'socio' => trim($assignment['apellido'] . ', ' . $assignment['nombre']),
                'dni' => (string)$assignment['dni'],
                'id_categoria' => (int)$assignment['id_categoria'],
                'categoria' => (string)$assignment['categoria'],
                'id_familia' => $familyId,
                'familia' => $assignment['familia'],
                'cantidad_integrantes' => $memberCount,
                'porcentaje_descuento' => number_format($discount, 2, '.', ''),
                'cantidad_periodos' => $periodCount,
                'primer_periodo' => $firstPeriod,
                'ultimo_periodo' => $lastPeriod,
                'monto_base' => number_format($baseTotal, 2, '.', ''),
                'monto' => number_format($amountTotal, 2, '.', ''),
            ];
        }

        return [
            'items' => $items,
            'resumen' => [
                'registros' => count($items),
                'periodos' => $totalPeriods,
                'monto' => number_format($totalAmount, 2, '.', ''),
            ],
        ];
    }

    protected static function listarOperaciones(
        PDO $db,
        string $status,
        string $search,
        ?int $categoryId,
        ?int $selectedYear,
        ?int $selectedMonth
    ): array
    {
        $rows = array_merge(self::paymentRows($db, $status), self::registrationRows($db, $status));
        $rows = array_values(array_filter($rows, static function (array $row) use ($selectedYear, $selectedMonth): bool {
            if ($selectedYear !== null && (int)$row['anio'] !== $selectedYear) return false;
            if ($selectedMonth !== null) {
                if ($row['tipo_registro'] !== 'CUOTA') return false;
                if ((int)$row['id_mes'] !== $selectedMonth) return false;
            }
            return true;
        }));
        $operations = self::groupOperations($rows, true);
        $needle = self::lower($search);
        $operations = array_values(array_filter($operations, static function (array $operation) use ($needle, $categoryId): bool {
            if ($categoryId !== null && !in_array($categoryId, $operation['categoria_ids'], true)) return false;
            if ($needle !== '' && !str_contains(self::lower($operation['busqueda']), $needle)) return false;
            return true;
        }));
        usort($operations, static function (array $a, array $b): int {
            $byOperation = strcmp($b['fecha_pago'] . $b['codigo_operacion'], $a['fecha_pago'] . $a['codigo_operacion']);
            return $byOperation !== 0 ? $byOperation : strcmp($a['socios_label'], $b['socios_label']);
        });
        if (count($operations) > 1000) $operations = array_slice($operations, 0, 1000);

        $collected = 0.0;
        $base = 0.0;
        foreach ($operations as $operation) {
            $collected += (float)$operation['monto'];
            $base += (float)$operation['monto_base'];
        }
        return [
            'items' => $operations,
            'resumen' => [
                'registros' => count($operations),
                'monto_base' => number_format($base, 2, '.', ''),
                'monto' => number_format($collected, 2, '.', ''),
            ],
        ];
    }

    protected static function detalleSocioDatos(PDO $db, int $partnerId, int $enabledUntilYear): array
    {
        $statement = $db->prepare('SELECT id_socio, apellido, nombre, dni, fecha_ingreso, activo FROM socios WHERE id_socio = ?');
        $statement->execute([$partnerId]);
        $principal = $statement->fetch();
        if (!$principal) api_error('El socio no existe.', 'SOCIO_NO_ENCONTRADO', 404);

        $familyStatement = $db->prepare(
            'SELECT f.id_familia, f.nombre
             FROM familia_socios fs INNER JOIN familias f ON f.id_familia = fs.id_familia
             WHERE fs.id_socio = ? AND f.activo = 1 LIMIT 1'
        );
        $familyStatement->execute([$partnerId]);
        $family = $familyStatement->fetch() ?: null;

        if ($family) {
            $membersStatement = $db->prepare(
                'SELECT s.id_socio, s.apellido, s.nombre, s.dni, s.fecha_ingreso, s.activo
                 FROM familia_socios fs INNER JOIN socios s ON s.id_socio = fs.id_socio
                 WHERE fs.id_familia = ? AND s.activo = 1
                 ORDER BY s.apellido, s.nombre'
            );
            $membersStatement->execute([(int)$family['id_familia']]);
            $members = $membersStatement->fetchAll();
        } else {
            $members = [$principal];
        }
        $memberIds = array_map(static fn(array $member): int => (int)$member['id_socio'], $members);
        $placeholders = implode(',', array_fill(0, count($memberIds), '?'));

        $assignmentsStatement = $db->prepare(
            "SELECT sc.id_socio, sc.id_categoria, sc.fecha_desde, sc.fecha_hasta,
                    c.nombre AS categoria, c.monto_actual
             FROM socio_categorias sc INNER JOIN categorias c ON c.id_categoria = sc.id_categoria
             WHERE sc.id_socio IN ({$placeholders}) AND sc.activo = 1 AND c.activo = 1
             ORDER BY c.nombre"
        );
        $assignmentsStatement->execute($memberIds);
        $assignments = $assignmentsStatement->fetchAll();

        $categoryIds = array_values(array_unique(array_map(static fn(array $row): int => (int)$row['id_categoria'], $assignments)));
        $prices = self::priceHistory($db, $categoryIds);
        $paymentsStatement = $db->prepare(
            "SELECT id_pago, id_socio, id_categoria, anio, id_mes, estado
             FROM pagos
             WHERE id_socio IN ({$placeholders}) AND estado IN ('PAGADO','CONDONADO')"
        );
        $paymentsStatement->execute($memberIds);
        $paymentMap = [];
        foreach ($paymentsStatement->fetchAll() as $payment) {
            $paymentMap[self::periodKey((int)$payment['id_socio'], (int)$payment['id_categoria'], (int)$payment['anio'], (int)$payment['id_mes'])] = $payment;
        }

        $rules = self::discountRules($db);
        $memberCount = count($members);
        $discount = $family ? self::discountForCount($rules, $memberCount) : 0.0;
        $currentYear = (int)date('Y');
        $maximumEnabledYear = min(max($enabledUntilYear, $currentYear), $currentYear + 1);
        $endOfEnabledYear = new DateTimeImmutable($maximumEnabledYear . '-12-01');
        $periods = [];
        $earliestYear = $currentYear;
        $memberMap = [];
        foreach ($members as &$member) {
            $member['id_socio'] = (int)$member['id_socio'];
            $member['activo'] = (bool)$member['activo'];
            $member['socio'] = trim($member['apellido'] . ', ' . $member['nombre']);
            $member['es_principal'] = $member['id_socio'] === $partnerId;
            $memberMap[$member['id_socio']] = $member;
        }
        unset($member);

        foreach ($assignments as $assignment) {
            $member = $memberMap[(int)$assignment['id_socio']];
            $startText = max((string)$member['fecha_ingreso'], (string)$assignment['fecha_desde']);
            $start = new DateTimeImmutable(substr($startText, 0, 7) . '-01');
            $earliestYear = min($earliestYear, (int)$start->format('Y'));
            $end = $endOfEnabledYear;
            if ($assignment['fecha_hasta']) {
                $assignmentEnd = new DateTimeImmutable(substr((string)$assignment['fecha_hasta'], 0, 7) . '-01');
                if ($assignmentEnd < $end) $end = $assignmentEnd;
            }
            if ($start > $end) continue;

            for ($period = $start; $period <= $end; $period = $period->modify('+1 month')) {
                $year = (int)$period->format('Y');
                $month = (int)$period->format('n');
                $key = self::periodKey((int)$assignment['id_socio'], (int)$assignment['id_categoria'], $year, $month);
                $payment = $paymentMap[$key] ?? null;
                $base = self::priceForPeriod($prices[(int)$assignment['id_categoria']] ?? [], (float)$assignment['monto_actual'], $year, $month);
                $amount = round($base * (1 - $discount / 100), 2);
                $periods[] = [
                    'clave' => $key,
                    'id_socio' => (int)$assignment['id_socio'],
                    'socio' => $member['socio'],
                    'id_categoria' => (int)$assignment['id_categoria'],
                    'categoria' => (string)$assignment['categoria'],
                    'anio' => $year,
                    'id_mes' => $month,
                    'mes' => self::monthName($month),
                    'periodo' => self::monthName($month) . ' ' . $year,
                    'estado' => $payment['estado'] ?? 'PENDIENTE',
                    'es_futuro' => $period > new DateTimeImmutable(date('Y-m-01')),
                    'monto_base' => number_format($base, 2, '.', ''),
                    'porcentaje_descuento' => number_format($discount, 2, '.', ''),
                    'monto' => number_format($amount, 2, '.', ''),
                ];
            }
        }

        usort($periods, static function (array $a, array $b): int {
            return [$a['socio'], $a['categoria'], -$a['anio'], $a['id_mes']] <=> [$b['socio'], $b['categoria'], -$b['anio'], $b['id_mes']];
        });

        $registrationsStatement = $db->prepare(
            "SELECT id_pago_inscripcion, id_socio, id_categoria, anio, estado
             FROM pagos_inscripciones
             WHERE id_socio IN ({$placeholders}) AND estado IN ('PAGADO','CONDONADO')"
        );
        $registrationsStatement->execute($memberIds);
        $registrations = $registrationsStatement->fetchAll();
        foreach ($registrations as &$registration) {
            $registration['id_pago_inscripcion'] = (int)$registration['id_pago_inscripcion'];
            $registration['id_socio'] = (int)$registration['id_socio'];
            $registration['id_categoria'] = (int)$registration['id_categoria'];
            $registration['anio'] = (int)$registration['anio'];
        }
        unset($registration);

        $categories = [];
        foreach ($assignments as $assignment) {
            $id = (int)$assignment['id_categoria'];
            $categories[$id] = ['id_categoria' => $id, 'nombre' => $assignment['categoria']];
        }

        $years = [];
        for ($year = $maximumEnabledYear; $year >= $earliestYear; $year--) $years[] = $year;
        return [
            'socio' => $memberMap[$partnerId],
            'familia' => $family ? [
                'id_familia' => (int)$family['id_familia'],
                'nombre' => $family['nombre'],
                'cantidad_integrantes' => $memberCount,
                'porcentaje_descuento' => number_format($discount, 2, '.', ''),
            ] : null,
            'integrantes' => array_values($memberMap),
            'categorias' => array_values($categories),
            'periodos' => $periods,
            'inscripciones' => $registrations,
            'anios' => $years,
            'anio_maximo_habilitado' => $maximumEnabledYear,
            'siguiente_anio_habilitable' => $maximumEnabledYear < $currentYear + 1 ? $currentYear + 1 : null,
            'medios_pago' => self::mediosPagoCatalogo($db),
        ];
    }

    protected static function aniosCatalogo(PDO $db): array
    {
        $currentYear = (int)date('Y');
        $rows = $db->query(
            'SELECT DISTINCT anio
             FROM (
                 SELECT anio FROM pagos WHERE anio IS NOT NULL
                 UNION
                 SELECT anio FROM pagos_inscripciones WHERE anio IS NOT NULL
             ) AS anios_registrados
             WHERE anio BETWEEN 2000 AND ' . ($currentYear + 1) . '
             ORDER BY anio DESC'
        )->fetchAll();
        $years = array_map('intval', array_column($rows, 'anio'));
        $years[] = $currentYear;
        $years = array_values(array_unique($years));
        rsort($years, SORT_NUMERIC);
        return $years;
    }

    protected static function mesesCatalogo(PDO $db): array
    {
        $rows = $db->query('SELECT id_mes, nombre FROM meses ORDER BY id_mes')->fetchAll();
        foreach ($rows as &$row) $row['id_mes'] = (int)$row['id_mes'];
        unset($row);
        return $rows;
    }

    protected static function categoriasCatalogo(PDO $db, bool $onlyActive): array
    {
        $rows = $db->query(
            'SELECT id_categoria, nombre, monto_actual, activo FROM categorias '
            . ($onlyActive ? 'WHERE activo = 1 ' : '')
            . 'ORDER BY activo DESC, nombre'
        )->fetchAll();
        foreach ($rows as &$row) {
            $row['id_categoria'] = (int)$row['id_categoria'];
            $row['activo'] = (bool)$row['activo'];
        }
        unset($row);
        return $rows;
    }

    protected static function mediosPagoCatalogo(PDO $db): array
    {
        $rows = $db->query("SELECT id_medio_pago, nombre FROM medios_pago WHERE activo = 1 AND nombre <> 'CONDONACIÓN' ORDER BY nombre")->fetchAll();
        foreach ($rows as &$row) $row['id_medio_pago'] = (int)$row['id_medio_pago'];
        unset($row);
        return $rows;
    }

    protected static function paymentRows(PDO $db, ?string $status = null, ?string $code = null, ?int $id = null): array
    {
        $where = [];
        $params = [];
        if ($status !== null) { $where[] = 'p.estado = ?'; $params[] = $status; }
        if ($code !== null) { $where[] = 'p.codigo_operacion = ?'; $params[] = $code; }
        if ($id !== null) { $where[] = 'p.id_pago = ?'; $params[] = $id; }
        $sqlWhere = $where === [] ? '' : 'WHERE ' . implode(' AND ', $where);
        $statement = $db->prepare(
            "SELECT 'CUOTA' AS tipo_registro, p.id_pago AS id_linea,
                    COALESCE(p.codigo_operacion, CONCAT('PAGO-', p.id_pago)) AS codigo_operacion,
                    p.id_socio, CONCAT(s.apellido, ', ', s.nombre) AS socio, s.dni,
                    p.id_categoria, c.nombre AS categoria, p.anio, p.id_mes, m.nombre AS periodo,
                    p.monto_base, p.porcentaje_descuento_familiar, p.monto, p.fecha_pago,
                    p.estado, p.motivo_condonacion, p.observaciones, mp.nombre AS medio_pago
             FROM pagos p
             INNER JOIN socios s ON s.id_socio = p.id_socio
             INNER JOIN categorias c ON c.id_categoria = p.id_categoria
             INNER JOIN meses m ON m.id_mes = p.id_mes
             INNER JOIN medios_pago mp ON mp.id_medio_pago = p.id_medio_pago
             {$sqlWhere}
             ORDER BY p.fecha_pago DESC, p.id_pago DESC"
        );
        $statement->execute($params);
        return $statement->fetchAll();
    }

    protected static function registrationRows(PDO $db, ?string $status = null, ?string $code = null, ?int $id = null): array
    {
        $where = [];
        $params = [];
        if ($status !== null) { $where[] = 'pi.estado = ?'; $params[] = $status; }
        if ($code !== null) { $where[] = 'pi.codigo_operacion = ?'; $params[] = $code; }
        if ($id !== null) { $where[] = 'pi.id_pago_inscripcion = ?'; $params[] = $id; }
        $sqlWhere = $where === [] ? '' : 'WHERE ' . implode(' AND ', $where);
        $statement = $db->prepare(
            "SELECT 'INSCRIPCION' AS tipo_registro, pi.id_pago_inscripcion AS id_linea,
                    COALESCE(pi.codigo_operacion, CONCAT('INSCRIPCION-', pi.id_pago_inscripcion)) AS codigo_operacion,
                    pi.id_socio, CONCAT(s.apellido, ', ', s.nombre) AS socio, s.dni,
                    pi.id_categoria, c.nombre AS categoria, pi.anio, NULL AS id_mes, pi.descripcion AS periodo,
                    pi.monto_base, pi.porcentaje_descuento_familiar, pi.monto, pi.fecha_pago,
                    pi.estado, pi.motivo_condonacion, pi.observaciones, mp.nombre AS medio_pago
             FROM pagos_inscripciones pi
             INNER JOIN socios s ON s.id_socio = pi.id_socio
             INNER JOIN categorias c ON c.id_categoria = pi.id_categoria
             INNER JOIN medios_pago mp ON mp.id_medio_pago = pi.id_medio_pago
             {$sqlWhere}
             ORDER BY pi.fecha_pago DESC, pi.id_pago_inscripcion DESC"
        );
        $statement->execute($params);
        return $statement->fetchAll();
    }

    protected static function groupOperations(array $rows, bool $separateByPartner = false): array
    {
        $grouped = [];
        foreach ($rows as $row) {
            $code = (string)$row['codigo_operacion'];
            $groupKey = $separateByPartner ? $code . '-SOCIO-' . (int)$row['id_socio'] : $code;
            if (!isset($grouped[$groupKey])) {
                $grouped[$groupKey] = [
                    'codigo_operacion' => $code,
                    'tipo' => $row['tipo_registro'],
                    'concepto' => $row['tipo_registro'] === 'INSCRIPCION' ? 'INSCRIPCIÓN' : 'CUOTAS',
                    'estado' => $row['estado'],
                    'fecha_pago' => $row['fecha_pago'],
                    'medio_pago' => $row['medio_pago'],
                    'motivo_condonacion' => $row['motivo_condonacion'],
                    'observaciones' => $row['observaciones'],
                    'socios_map' => [],
                    'dni_map' => [],
                    'categorias_map' => [],
                    'periodos_map' => [],
                    'descuentos_map' => [],
                    'monto_base_num' => 0.0,
                    'monto_num' => 0.0,
                    'lineas' => [],
                ];
            }
            $grouped[$groupKey]['socios_map'][(int)$row['id_socio']] = $row['socio'];
            $grouped[$groupKey]['dni_map'][(int)$row['id_socio']] = (string)$row['dni'];
            $grouped[$groupKey]['categorias_map'][(int)$row['id_categoria']] = $row['categoria'];
            $periodLabel = $row['tipo_registro'] === 'INSCRIPCION'
                ? $row['periodo'] . ' (' . $row['anio'] . ')'
                : $row['periodo'] . ' ' . $row['anio'];
            $grouped[$groupKey]['periodos_map'][$periodLabel] = $periodLabel;
            $grouped[$groupKey]['descuentos_map'][(string)$row['porcentaje_descuento_familiar']] = (float)$row['porcentaje_descuento_familiar'];
            $grouped[$groupKey]['monto_base_num'] += (float)$row['monto_base'];
            $grouped[$groupKey]['monto_num'] += (float)$row['monto'];
            $grouped[$groupKey]['lineas'][] = [
                'id_linea' => (int)$row['id_linea'],
                'tipo' => $row['tipo_registro'],
                'socio' => $row['socio'],
                'dni' => $row['dni'],
                'categoria' => $row['categoria'],
                'periodo' => $periodLabel,
                'monto_base' => (string)$row['monto_base'],
                'porcentaje_descuento_familiar' => (string)$row['porcentaje_descuento_familiar'],
                'monto' => (string)$row['monto'],
            ];
        }

        $result = [];
        foreach ($grouped as $operation) {
            $partners = array_values($operation['socios_map']);
            $partnerIds = array_keys($operation['socios_map']);
            $partnerDocuments = array_values($operation['dni_map']);
            $categories = array_values($operation['categorias_map']);
            $periods = array_values($operation['periodos_map']);
            $discounts = array_values($operation['descuentos_map']);
            $periodSummary = count($periods) <= 6
                ? implode(' · ', $periods)
                : implode(' · ', array_slice($periods, 0, 5)) . ' · +' . (count($periods) - 5);
            $result[] = [
                'fila_id' => $operation['codigo_operacion'] . '-SOCIO-' . implode('-', $partnerIds),
                'codigo_operacion' => $operation['codigo_operacion'],
                'tipo' => $operation['tipo'],
                'concepto' => $operation['concepto'],
                'estado' => $operation['estado'],
                'fecha_pago' => $operation['fecha_pago'],
                'medio_pago' => $operation['medio_pago'],
                'socios' => $partners,
                'socios_label' => implode(' · ', $partners),
                'id_socio' => count($partnerIds) === 1 ? (int)$partnerIds[0] : null,
                'socio' => count($partners) === 1 ? $partners[0] : implode(' · ', $partners),
                'dni' => count($partnerDocuments) === 1 ? $partnerDocuments[0] : implode(' · ', $partnerDocuments),
                'categoria_ids' => array_keys($operation['categorias_map']),
                'categorias' => $categories,
                'categorias_label' => implode(' · ', $categories),
                'periodos' => $periods,
                'periodos_label' => $periodSummary,
                'cantidad_lineas' => count($operation['lineas']),
                'porcentaje_descuento' => count($discounts) === 1 ? number_format($discounts[0], 2, '.', '') : null,
                'descuento_label' => count($discounts) === 1 ? number_format($discounts[0], 2, ',', '') . '%' : 'VARIOS',
                'monto_base' => number_format($operation['monto_base_num'], 2, '.', ''),
                'monto' => number_format($operation['monto_num'], 2, '.', ''),
                'motivo_condonacion' => $operation['motivo_condonacion'],
                'observaciones' => $operation['observaciones'],
                'lineas' => $operation['lineas'],
                'busqueda' => implode(' ', [$operation['codigo_operacion'], implode(' ', $partners), implode(' ', $partnerDocuments), implode(' ', $categories), implode(' ', $periods)]),
            ];
        }
        return $result;
    }

    protected static function operacionPorCodigo(PDO $db, string $code): ?array
    {
        if (preg_match('/^PAGO-(\d+)$/', $code, $match)) {
            $rows = self::paymentRows($db, null, null, (int)$match[1]);
        } elseif (preg_match('/^INSCRIPCION-(\d+)$/', $code, $match)) {
            $rows = self::registrationRows($db, null, null, (int)$match[1]);
        } else {
            $rows = array_merge(self::paymentRows($db, null, $code), self::registrationRows($db, null, $code));
        }
        return self::groupOperations($rows)[0] ?? null;
    }
}
