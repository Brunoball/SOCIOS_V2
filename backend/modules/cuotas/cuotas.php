<?php
declare(strict_types=1);

final class Cuotas
{
    private const ESTADOS_REGISTRADOS = ['PAGADO', 'CONDONADO'];

    public static function listar(): never
    {
        $auth = auth_context();
        api_success(self::listarDatos($auth['db'], $_GET));
    }

    public static function catalogos(): never
    {
        $auth = auth_context();
        api_success(self::catalogosDatos($auth['db']));
    }

    public static function detalleSocio(): never
    {
        $auth = auth_context();
        $id = positive_id($_GET['id'] ?? null, 'socio');
        $currentYear = (int)date('Y');
        $untilYearText = trim((string)($_GET['hasta_anio'] ?? ''));
        $untilYear = $currentYear;
        if ($untilYearText !== '') {
            $validatedYear = filter_var($untilYearText, FILTER_VALIDATE_INT, [
                'options' => ['min_range' => $currentYear, 'max_range' => $currentYear + 1],
            ]);
            if ($validatedYear === false) {
                api_error('Solo se puede habilitar el año actual o el año siguiente.', 'ANIO_NO_HABILITABLE');
            }
            $untilYear = (int)$validatedYear;
        }
        api_success(self::detalleSocioDatos($auth['db'], $id, $untilYear));
    }

    public static function registrarPago(): never
    {
        $auth = require_admin();
        $result = self::registrarPagoDatos($auth, request_body());
        api_success($result, $result['estado'] === 'CONDONADO'
            ? 'Cuotas condonadas correctamente.'
            : 'Pago de cuotas registrado correctamente.');
    }

    public static function registrarInscripcion(): never
    {
        $auth = require_admin();
        $result = self::registrarInscripcionDatos($auth, request_body());
        api_success($result, $result['estado'] === 'CONDONADO'
            ? 'Inscripción condonada correctamente.'
            : 'Pago de inscripción registrado correctamente.');
    }

    public static function anular(): never
    {
        $auth = require_admin();
        $result = self::anularDatos($auth, request_body());
        api_success($result, 'El registro fue eliminado y volvió a quedar pendiente.');
    }

    public static function comprobante(): never
    {
        $auth = auth_context();
        $code = clean_text($_GET['codigo'] ?? '', 64, false);
        if ($code === '') api_error('Falta el código de operación.', 'VALIDATION_ERROR');
        $operation = self::operacionPorCodigo($auth['db'], $code);
        if (!$operation) api_error('El comprobante solicitado no existe.', 'COMPROBANTE_NO_ENCONTRADO', 404);
        api_success([
            'organizacion' => $auth['tenant']['nombre'],
            'operacion' => $operation,
        ]);
    }

    private static function listarDatos(PDO $db, array $filters): array
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

    private static function catalogosDatos(PDO $db): array
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

    private static function listarDeudores(
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

    private static function listarOperaciones(
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
        $operations = self::groupOperations($rows);
        $needle = self::lower($search);
        $operations = array_values(array_filter($operations, static function (array $operation) use ($needle, $categoryId): bool {
            if ($categoryId !== null && !in_array($categoryId, $operation['categoria_ids'], true)) return false;
            if ($needle !== '' && !str_contains(self::lower($operation['busqueda']), $needle)) return false;
            return true;
        }));
        usort($operations, static fn(array $a, array $b): int => strcmp($b['fecha_pago'] . $b['codigo_operacion'], $a['fecha_pago'] . $a['codigo_operacion']));
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

    private static function detalleSocioDatos(PDO $db, int $partnerId, int $enabledUntilYear): array
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

    private static function registrarPagoDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $principalId = positive_id($body['id_socio'] ?? null, 'socio');
        $applyFamily = filter_var($body['aplicar_familia'] ?? false, FILTER_VALIDATE_BOOL);
        $condoned = filter_var($body['condonado'] ?? false, FILTER_VALIDATE_BOOL);
        $date = valid_date($body['fecha_pago'] ?? date('Y-m-d'), 'pago');
        if ($date > date('Y-m-d')) api_error('La fecha de pago no puede ser futura.', 'VALIDATION_ERROR');
        $observations = optional_text($body['observaciones'] ?? null, 500);
        $reason = $condoned ? required_text($body, 'motivo_condonacion', 'motivo de condonación', 500) : null;
        $obligations = is_array($body['obligaciones'] ?? null) ? $body['obligaciones'] : [];
        if ($obligations === [] || count($obligations) > 500) api_error('Seleccioná entre 1 y 500 cuotas.', 'VALIDATION_ERROR');

        $allowed = self::allowedRecipients($db, $principalId, $applyFamily);
        $normalized = [];
        foreach ($obligations as $obligation) {
            if (!is_array($obligation)) continue;
            $partnerId = positive_id($obligation['id_socio'] ?? null, 'socio');
            $categoryId = positive_id($obligation['id_categoria'] ?? null, 'categoría');
            $year = filter_var($obligation['anio'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 2000, 'max_range' => (int)date('Y') + 1]]);
            $month = filter_var($obligation['id_mes'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 12]]);
            if ($year === false || $month === false) api_error('Uno de los períodos no es válido.', 'VALIDATION_ERROR');
            if (!in_array($partnerId, $allowed, true)) api_error('Uno de los socios seleccionados no pertenece al alcance del pago.', 'SOCIO_FUERA_DE_FAMILIA');
            $key = self::periodKey($partnerId, $categoryId, (int)$year, (int)$month);
            $normalized[$key] = [
                'id_socio' => $partnerId,
                'id_categoria' => $categoryId,
                'anio' => (int)$year,
                'id_mes' => (int)$month,
            ];
        }
        if ($applyFamily && $normalized !== []) {
            $periodsToApply = [];
            foreach ($normalized as $obligation) {
                $periodKey = $obligation['id_categoria'] . '-' . $obligation['anio'] . '-' . $obligation['id_mes'];
                $periodsToApply[$periodKey] = [
                    'id_categoria' => $obligation['id_categoria'],
                    'anio' => $obligation['anio'],
                    'id_mes' => $obligation['id_mes'],
                ];
            }

            $expanded = [];
            foreach ($periodsToApply as $period) {
                foreach ($allowed as $familyPartnerId) {
                    if (!self::hasAssignmentForPeriod(
                        $db,
                        $familyPartnerId,
                        $period['id_categoria'],
                        $period['anio'],
                        $period['id_mes']
                    ) || self::hasRegisteredPeriod(
                        $db,
                        $familyPartnerId,
                        $period['id_categoria'],
                        $period['anio'],
                        $period['id_mes']
                    )) {
                        continue;
                    }
                    $key = self::periodKey(
                        $familyPartnerId,
                        $period['id_categoria'],
                        $period['anio'],
                        $period['id_mes']
                    );
                    $expanded[$key] = [
                        'id_socio' => $familyPartnerId,
                        'id_categoria' => $period['id_categoria'],
                        'anio' => $period['anio'],
                        'id_mes' => $period['id_mes'],
                    ];
                }
            }
            $normalized = $expanded;
        }

        $normalized = array_values($normalized);
        if ($normalized === []) api_error('No hay cuotas válidas seleccionadas.', 'VALIDATION_ERROR');

        $mediumId = $condoned
            ? self::condonationMediumId($db)
            : self::normalPaymentMediumId($db, $body['id_medio_pago'] ?? null);
        $modalities = self::modalityIds($db);
        $groups = self::modalityByObligation($normalized, $modalities);
        $categoryIds = array_values(array_unique(array_column($normalized, 'id_categoria')));
        $categoryRows = self::categoryMap($db, $categoryIds);
        $prices = self::priceHistory($db, $categoryIds);
        $rules = self::discountRules($db);
        $operationCode = self::operationCode($condoned ? 'COND-CUO' : 'CUO');
        $state = $condoned ? 'CONDONADO' : 'PAGADO';
        $discountCache = [];

        $saved = transaction($db, static function () use (
            $db, $auth, $normalized, $groups, $categoryRows, $prices, $rules,
            $operationCode, $state, $mediumId, $date, $observations, $reason, &$discountCache
        ): array {
            $lines = [];
            $charged = 0.0;
            $theoretical = 0.0;
            foreach ($normalized as $obligation) {
                $partnerId = $obligation['id_socio'];
                $categoryId = $obligation['id_categoria'];
                $year = $obligation['anio'];
                $month = $obligation['id_mes'];
                self::validateAssignmentForPeriod($db, $partnerId, $categoryId, $year, $month);
                $category = $categoryRows[$categoryId] ?? null;
                if (!$category) api_error('Una categoría seleccionada no existe.', 'CATEGORIA_NO_ENCONTRADA', 404);

                $lock = $db->prepare('SELECT * FROM pagos WHERE id_socio = ? AND id_categoria = ? AND anio = ? AND id_mes = ? FOR UPDATE');
                $lock->execute([$partnerId, $categoryId, $year, $month]);
                $existing = $lock->fetch();
                if ($existing && in_array($existing['estado'], self::ESTADOS_REGISTRADOS, true)) {
                    api_error('Una de las cuotas seleccionadas ya está pagada o condonada.', 'CUOTA_YA_REGISTRADA', 409);
                }

                $discountContext = self::discountContextForPartner($db, $partnerId, $rules, $discountCache);
                $base = self::priceForPeriod($prices[$categoryId] ?? [], (float)$category['monto_actual'], $year, $month);
                $discounted = round($base * (1 - $discountContext['porcentaje'] / 100), 2);
                $amount = $state === 'CONDONADO' ? 0.0 : $discounted;
                $groupKey = $partnerId . '-' . $categoryId . '-' . $year;
                $modalityId = $groups[$groupKey] ?? $groups['default'];

                if ($existing) {
                    $update = $db->prepare(
                        'UPDATE pagos SET codigo_operacion = ?, id_familia = ?, id_medio_pago = ?, id_modalidad_pago = ?,
                         monto_base = ?, porcentaje_descuento_modalidad = 0, porcentaje_descuento_familiar = ?, monto = ?,
                         fecha_pago = ?, estado = ?, motivo_condonacion = ?, observaciones = ? WHERE id_pago = ?'
                    );
                    $update->execute([
                        $operationCode, $discountContext['id_familia'], $mediumId, $modalityId,
                        number_format($base, 2, '.', ''), number_format($discountContext['porcentaje'], 2, '.', ''), number_format($amount, 2, '.', ''),
                        $date, $state, $reason, $observations, $existing['id_pago'],
                    ]);
                    $paymentId = (int)$existing['id_pago'];
                } else {
                    $insert = $db->prepare(
                        'INSERT INTO pagos
                         (codigo_operacion, id_socio, id_familia, id_categoria, id_mes, id_medio_pago, id_modalidad_pago,
                          anio, monto_base, porcentaje_descuento_modalidad, porcentaje_descuento_familiar, monto,
                          fecha_pago, estado, motivo_condonacion, observaciones)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)'
                    );
                    $insert->execute([
                        $operationCode, $partnerId, $discountContext['id_familia'], $categoryId, $month, $mediumId, $modalityId,
                        $year, number_format($base, 2, '.', ''), number_format($discountContext['porcentaje'], 2, '.', ''), number_format($amount, 2, '.', ''),
                        $date, $state, $reason, $observations,
                    ]);
                    $paymentId = (int)$db->lastInsertId();
                }

                $lines[] = [
                    'id_pago' => $paymentId,
                    'id_socio' => $partnerId,
                    'id_categoria' => $categoryId,
                    'anio' => $year,
                    'id_mes' => $month,
                    'monto_base' => number_format($base, 2, '.', ''),
                    'porcentaje_descuento_familiar' => number_format($discountContext['porcentaje'], 2, '.', ''),
                    'monto' => number_format($amount, 2, '.', ''),
                ];
                $theoretical += $discounted;
                $charged += $amount;
            }

            audit_change(
                $db,
                $auth,
                'CUOTAS',
                $state === 'CONDONADO' ? 'CONDONAR_CUOTAS' : 'REGISTRAR_PAGO',
                'pagos',
                $operationCode,
                $state === 'CONDONADO' ? 'Se condonaron cuotas.' : 'Se registró un pago de cuotas.',
                null,
                ['codigo_operacion' => $operationCode, 'lineas' => $lines]
            );
            return [
                'lineas' => count($lines),
                'monto_teorico' => number_format($theoretical, 2, '.', ''),
                'monto' => number_format($charged, 2, '.', ''),
            ];
        });

        return ['codigo_operacion' => $operationCode, 'estado' => $state] + $saved;
    }

    private static function registrarInscripcionDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $principalId = positive_id($body['id_socio'] ?? null, 'socio');
        $categoryId = positive_id($body['id_categoria'] ?? null, 'categoría');
        $year = filter_var($body['anio'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 2000, 'max_range' => (int)date('Y') + 1]]);
        if ($year === false) api_error('El año de inscripción no es válido.', 'VALIDATION_ERROR');
        $baseAmount = decimal_amount($body['monto_base'] ?? null, 'monto de inscripción', 0.01);
        $applyFamily = filter_var($body['aplicar_familia'] ?? false, FILTER_VALIDATE_BOOL);
        $condoned = filter_var($body['condonado'] ?? false, FILTER_VALIDATE_BOOL);
        $date = valid_date($body['fecha_pago'] ?? date('Y-m-d'), 'pago');
        if ($date > date('Y-m-d')) api_error('La fecha de pago no puede ser futura.', 'VALIDATION_ERROR');
        $description = optional_text($body['descripcion'] ?? null, 255) ?? ('INSCRIPCIÓN ' . $year);
        $observations = optional_text($body['observaciones'] ?? null, 500);
        $reason = $condoned ? required_text($body, 'motivo_condonacion', 'motivo de condonación', 500) : null;
        $mediumId = $condoned
            ? self::condonationMediumId($db)
            : self::normalPaymentMediumId($db, $body['id_medio_pago'] ?? null);
        $allowed = self::allowedRecipients($db, $principalId, $applyFamily);
        $recipients = self::recipientsWithCategory($db, $allowed, $categoryId, (int)$year);
        if ($recipients === []) api_error('Ningún socio seleccionado tiene esa categoría en el año indicado.', 'CATEGORIA_NO_ASIGNADA');

        $pendingRecipients = [];
        $registered = $db->prepare(
            "SELECT id_pago_inscripcion FROM pagos_inscripciones
             WHERE id_socio = ? AND id_categoria = ? AND anio = ?
               AND estado IN ('PAGADO','CONDONADO') LIMIT 1"
        );
        foreach ($recipients as $recipientId) {
            $registered->execute([$recipientId, $categoryId, (int)$year]);
            if (!$registered->fetch()) $pendingRecipients[] = $recipientId;
        }
        $recipients = $pendingRecipients;
        if ($recipients === []) api_error('La inscripción ya está pagada o condonada para los socios seleccionados.', 'INSCRIPCION_YA_REGISTRADA', 409);

        $rules = self::discountRules($db);
        $discountCache = [];
        $operationCode = self::operationCode($condoned ? 'COND-INS' : 'INS');
        $state = $condoned ? 'CONDONADO' : 'PAGADO';
        $base = (float)$baseAmount;

        $saved = transaction($db, static function () use (
            $db, $auth, $recipients, $categoryId, $year, $base, $rules, &$discountCache,
            $operationCode, $state, $mediumId, $date, $description, $observations, $reason
        ): array {
            $lines = [];
            $charged = 0.0;
            $theoretical = 0.0;
            foreach ($recipients as $partnerId) {
                $lock = $db->prepare(
                    "SELECT * FROM pagos_inscripciones
                     WHERE id_socio = ? AND id_categoria = ? AND anio = ?
                     ORDER BY id_pago_inscripcion DESC FOR UPDATE"
                );
                $lock->execute([$partnerId, $categoryId, $year]);
                $existingRows = $lock->fetchAll();
                $active = array_values(array_filter($existingRows, static fn(array $row): bool => in_array($row['estado'], self::ESTADOS_REGISTRADOS, true)));
                if ($active !== []) api_error('Una de las inscripciones ya está pagada o condonada.', 'INSCRIPCION_YA_REGISTRADA', 409);

                $discountContext = self::discountContextForPartner($db, $partnerId, $rules, $discountCache);
                $discounted = round($base * (1 - $discountContext['porcentaje'] / 100), 2);
                $amount = $state === 'CONDONADO' ? 0.0 : $discounted;
                $reusable = $existingRows[0] ?? null;
                if ($reusable) {
                    $update = $db->prepare(
                        'UPDATE pagos_inscripciones SET codigo_operacion = ?, id_familia = ?, id_medio_pago = ?, descripcion = ?, anio = ?,
                         monto_base = ?, porcentaje_descuento_familiar = ?, monto = ?, fecha_pago = ?, estado = ?,
                         motivo_condonacion = ?, observaciones = ? WHERE id_pago_inscripcion = ?'
                    );
                    $update->execute([
                        $operationCode, $discountContext['id_familia'], $mediumId, $description, $year,
                        number_format($base, 2, '.', ''), number_format($discountContext['porcentaje'], 2, '.', ''), number_format($amount, 2, '.', ''),
                        $date, $state, $reason, $observations, $reusable['id_pago_inscripcion'],
                    ]);
                    $registrationId = (int)$reusable['id_pago_inscripcion'];
                } else {
                    $insert = $db->prepare(
                        'INSERT INTO pagos_inscripciones
                         (codigo_operacion, id_socio, id_categoria, id_familia, id_medio_pago, descripcion, anio,
                          monto_base, porcentaje_descuento_familiar, monto, fecha_pago, estado, motivo_condonacion, observaciones)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    );
                    $insert->execute([
                        $operationCode, $partnerId, $categoryId, $discountContext['id_familia'], $mediumId, $description, $year,
                        number_format($base, 2, '.', ''), number_format($discountContext['porcentaje'], 2, '.', ''), number_format($amount, 2, '.', ''),
                        $date, $state, $reason, $observations,
                    ]);
                    $registrationId = (int)$db->lastInsertId();
                }
                $lines[] = ['id_pago_inscripcion' => $registrationId, 'id_socio' => $partnerId, 'monto' => number_format($amount, 2, '.', '')];
                $theoretical += $discounted;
                $charged += $amount;
            }

            audit_change(
                $db,
                $auth,
                'CUOTAS',
                $state === 'CONDONADO' ? 'CONDONAR_INSCRIPCION' : 'REGISTRAR_INSCRIPCION',
                'pagos_inscripciones',
                $operationCode,
                $state === 'CONDONADO' ? 'Se condonó una inscripción.' : 'Se registró un pago de inscripción.',
                null,
                ['codigo_operacion' => $operationCode, 'lineas' => $lines]
            );
            return [
                'lineas' => count($lines),
                'monto_teorico' => number_format($theoretical, 2, '.', ''),
                'monto' => number_format($charged, 2, '.', ''),
            ];
        });

        return ['codigo_operacion' => $operationCode, 'estado' => $state] + $saved;
    }

    private static function anularDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $code = required_text($body, 'codigo_operacion', 'código de operación', 64, false);
        $before = self::operacionPorCodigo($db, $code);
        if (!$before || $before['estado'] === 'ANULADO') api_error('El registro no existe o ya fue eliminado.', 'OPERACION_NO_ENCONTRADA', 404);

        $count = transaction($db, static function () use ($db, $auth, $code, $before): int {
            $affected = 0;
            if (preg_match('/^PAGO-(\d+)$/', $code, $match)) {
                $statement = $db->prepare("UPDATE pagos SET estado = 'ANULADO' WHERE id_pago = ? AND estado IN ('PAGADO','CONDONADO')");
                $statement->execute([(int)$match[1]]);
                $affected += $statement->rowCount();
            } elseif (preg_match('/^INSCRIPCION-(\d+)$/', $code, $match)) {
                $statement = $db->prepare("UPDATE pagos_inscripciones SET estado = 'ANULADO' WHERE id_pago_inscripcion = ? AND estado IN ('PAGADO','CONDONADO')");
                $statement->execute([(int)$match[1]]);
                $affected += $statement->rowCount();
            } else {
                $statement = $db->prepare("UPDATE pagos SET estado = 'ANULADO' WHERE codigo_operacion = ? AND estado IN ('PAGADO','CONDONADO')");
                $statement->execute([$code]);
                $affected += $statement->rowCount();
                $statement = $db->prepare("UPDATE pagos_inscripciones SET estado = 'ANULADO' WHERE codigo_operacion = ? AND estado IN ('PAGADO','CONDONADO')");
                $statement->execute([$code]);
                $affected += $statement->rowCount();
            }
            if ($affected === 0) api_error('El registro ya fue eliminado.', 'OPERACION_SIN_CAMBIOS', 409);
            audit_change($db, $auth, 'CUOTAS', 'ANULAR', 'pagos', $code, 'Se eliminó un pago o una condonación.', $before, ['estado' => 'ANULADO']);
            return $affected;
        });
        return ['codigo_operacion' => $code, 'registros_anulados' => $count];
    }

    private static function allowedRecipients(PDO $db, int $principalId, bool $applyFamily): array
    {
        $statement = $db->prepare('SELECT id_socio FROM socios WHERE id_socio = ? AND activo = 1');
        $statement->execute([$principalId]);
        if (!$statement->fetch()) api_error('El socio no existe o está dado de baja.', 'SOCIO_NO_DISPONIBLE', 404);
        if (!$applyFamily) return [$principalId];

        $familyStatement = $db->prepare(
            'SELECT f.id_familia FROM familia_socios fs INNER JOIN familias f ON f.id_familia = fs.id_familia
             WHERE fs.id_socio = ? AND f.activo = 1 LIMIT 1'
        );
        $familyStatement->execute([$principalId]);
        $familyId = $familyStatement->fetchColumn();
        if (!$familyId) return [$principalId];
        $members = $db->prepare(
            'SELECT s.id_socio FROM familia_socios fs INNER JOIN socios s ON s.id_socio = fs.id_socio
             WHERE fs.id_familia = ? AND s.activo = 1 ORDER BY s.id_socio'
        );
        $members->execute([(int)$familyId]);
        return array_map('intval', array_column($members->fetchAll(), 'id_socio'));
    }

    private static function recipientsWithCategory(PDO $db, array $partnerIds, int $categoryId, int $year): array
    {
        if ($partnerIds === []) return [];
        $placeholders = implode(',', array_fill(0, count($partnerIds), '?'));
        $start = $year . '-01-01';
        $end = $year . '-12-31';
        $statement = $db->prepare(
            "SELECT DISTINCT sc.id_socio
             FROM socio_categorias sc INNER JOIN categorias c ON c.id_categoria = sc.id_categoria
             WHERE sc.id_socio IN ({$placeholders}) AND sc.id_categoria = ?
               AND sc.activo = 1 AND c.activo = 1
               AND sc.fecha_desde <= ? AND (sc.fecha_hasta IS NULL OR sc.fecha_hasta >= ?)"
        );
        $statement->execute([...$partnerIds, $categoryId, $end, $start]);
        return array_map('intval', array_column($statement->fetchAll(), 'id_socio'));
    }

    private static function hasAssignmentForPeriod(PDO $db, int $partnerId, int $categoryId, int $year, int $month): bool
    {
        $start = sprintf('%04d-%02d-01', $year, $month);
        $end = (new DateTimeImmutable($start))->modify('last day of this month')->format('Y-m-d');
        $statement = $db->prepare(
            'SELECT sc.id_socio_categoria
             FROM socios s
             INNER JOIN socio_categorias sc ON sc.id_socio = s.id_socio
             INNER JOIN categorias c ON c.id_categoria = sc.id_categoria
             WHERE s.id_socio = ? AND c.id_categoria = ?
               AND s.activo = 1 AND sc.activo = 1 AND c.activo = 1
               AND s.fecha_ingreso <= ? AND sc.fecha_desde <= ?
               AND (sc.fecha_hasta IS NULL OR sc.fecha_hasta >= ?)
             LIMIT 1'
        );
        $statement->execute([$partnerId, $categoryId, $end, $end, $start]);
        return (bool)$statement->fetchColumn();
    }

    private static function hasRegisteredPeriod(PDO $db, int $partnerId, int $categoryId, int $year, int $month): bool
    {
        $statement = $db->prepare(
            "SELECT 1 FROM pagos
             WHERE id_socio = ? AND id_categoria = ? AND anio = ? AND id_mes = ?
               AND estado IN ('PAGADO','CONDONADO')
             LIMIT 1"
        );
        $statement->execute([$partnerId, $categoryId, $year, $month]);
        return (bool)$statement->fetchColumn();
    }

    private static function validateAssignmentForPeriod(PDO $db, int $partnerId, int $categoryId, int $year, int $month): void
    {
        if (!self::hasAssignmentForPeriod($db, $partnerId, $categoryId, $year, $month)) {
            api_error('Una cuota no corresponde a la fecha de ingreso o categoría del socio.', 'CUOTA_NO_CORRESPONDE');
        }
    }

    private static function discountContextForPartner(PDO $db, int $partnerId, array $rules, array &$cache): array
    {
        if (isset($cache[$partnerId])) return $cache[$partnerId];
        $statement = $db->prepare(
            'SELECT f.id_familia,
                    COUNT(CASE WHEN sm.activo = 1 THEN 1 END) AS cantidad_integrantes
             FROM socios s
             LEFT JOIN familia_socios fs ON fs.id_socio = s.id_socio
             LEFT JOIN familias f ON f.id_familia = fs.id_familia AND f.activo = 1
             LEFT JOIN familia_socios fsm ON fsm.id_familia = f.id_familia
             LEFT JOIN socios sm ON sm.id_socio = fsm.id_socio
             WHERE s.id_socio = ?
             GROUP BY s.id_socio, f.id_familia'
        );
        $statement->execute([$partnerId]);
        $row = $statement->fetch() ?: ['id_familia' => null, 'cantidad_integrantes' => 0];
        $familyId = $row['id_familia'] === null ? null : (int)$row['id_familia'];
        $count = $familyId === null ? 0 : (int)$row['cantidad_integrantes'];
        return $cache[$partnerId] = [
            'id_familia' => $familyId,
            'cantidad_integrantes' => $count,
            'porcentaje' => $familyId === null ? 0.0 : self::discountForCount($rules, $count),
        ];
    }

    private static function normalPaymentMediumId(PDO $db, mixed $value): int
    {
        $id = positive_id($value, 'medio de pago');
        $statement = $db->prepare("SELECT id_medio_pago, nombre FROM medios_pago WHERE id_medio_pago = ? AND activo = 1 LIMIT 1");
        $statement->execute([$id]);
        $row = $statement->fetch();
        if (!$row || self::upper((string)$row['nombre']) === 'CONDONACIÓN') api_error('El medio de pago seleccionado no es válido.', 'MEDIO_PAGO_INVALIDO');
        return $id;
    }

    private static function condonationMediumId(PDO $db): int
    {
        $statement = $db->prepare("SELECT id_medio_pago FROM medios_pago WHERE nombre = 'CONDONACIÓN' AND activo = 1 LIMIT 1");
        $statement->execute();
        $id = $statement->fetchColumn();
        if (!$id) api_error('Ejecutá primero la migración SQL del módulo Cuotas.', 'MIGRACION_CUOTAS_REQUERIDA', 500);
        return (int)$id;
    }

    private static function modalityIds(PDO $db): array
    {
        $rows = $db->query("SELECT id_modalidad_pago, codigo FROM modalidades_pago WHERE activo = 1")->fetchAll();
        $map = [];
        foreach ($rows as $row) $map[$row['codigo']] = (int)$row['id_modalidad_pago'];
        foreach (['MENSUAL', 'PRIMERA_MITAD', 'SEGUNDA_MITAD', 'CONTADO_ANUAL'] as $required) {
            if (!isset($map[$required])) api_error('Falta configurar la modalidad ' . $required . '.', 'MODALIDAD_NO_CONFIGURADA', 500);
        }
        return $map;
    }

    private static function modalityByObligation(array $obligations, array $modalities): array
    {
        $monthsByGroup = [];
        foreach ($obligations as $obligation) {
            $key = $obligation['id_socio'] . '-' . $obligation['id_categoria'] . '-' . $obligation['anio'];
            $monthsByGroup[$key][$obligation['id_mes']] = $obligation['id_mes'];
        }
        $result = ['default' => $modalities['MENSUAL']];
        foreach ($monthsByGroup as $key => $months) {
            sort($months);
            $code = 'MENSUAL';
            if ($months === range(1, 12)) $code = 'CONTADO_ANUAL';
            elseif ($months === range(1, 6)) $code = 'PRIMERA_MITAD';
            elseif ($months === range(7, 12)) $code = 'SEGUNDA_MITAD';
            $result[$key] = $modalities[$code];
        }
        return $result;
    }

    private static function categoryMap(PDO $db, array $categoryIds): array
    {
        if ($categoryIds === []) return [];
        $placeholders = implode(',', array_fill(0, count($categoryIds), '?'));
        $statement = $db->prepare("SELECT id_categoria, nombre, monto_actual FROM categorias WHERE id_categoria IN ({$placeholders})");
        $statement->execute($categoryIds);
        $map = [];
        foreach ($statement->fetchAll() as $row) $map[(int)$row['id_categoria']] = $row;
        return $map;
    }

    private static function priceHistory(PDO $db, array $categoryIds): array
    {
        if ($categoryIds === []) return [];
        $placeholders = implode(',', array_fill(0, count($categoryIds), '?'));
        $statement = $db->prepare(
            "SELECT id_categoria, monto_nuevo, vigente_desde, vigente_hasta
             FROM categorias_precios_historial
             WHERE id_categoria IN ({$placeholders})
             ORDER BY id_categoria, vigente_desde DESC, id_historial DESC"
        );
        $statement->execute($categoryIds);
        $map = [];
        foreach ($statement->fetchAll() as $row) $map[(int)$row['id_categoria']][] = $row;
        return $map;
    }

    private static function priceForPeriod(array $history, float $fallback, int $year, int $month): float
    {
        $start = sprintf('%04d-%02d-01', $year, $month);
        $end = (new DateTimeImmutable($start))->modify('last day of this month')->format('Y-m-d');
        foreach ($history as $row) {
            if ($row['vigente_desde'] <= $end && ($row['vigente_hasta'] === null || $row['vigente_hasta'] >= $start)) {
                return (float)$row['monto_nuevo'];
            }
        }
        return $fallback;
    }

    private static function discountRules(PDO $db): array
    {
        $rows = $db->query('SELECT cantidad_integrantes, porcentaje_descuento FROM descuentos_familiares ORDER BY cantidad_integrantes ASC')->fetchAll();
        return array_map(static fn(array $row): array => [
            'cantidad' => (int)$row['cantidad_integrantes'],
            'porcentaje' => (float)$row['porcentaje_descuento'],
        ], $rows);
    }

    private static function discountForCount(array $rules, int $count): float
    {
        $percentage = 0.0;
        foreach ($rules as $rule) {
            if ($rule['cantidad'] > $count) break;
            $percentage = $rule['porcentaje'];
        }
        return $percentage;
    }

    private static function familyCounts(PDO $db): array
    {
        $rows = $db->query(
            'SELECT f.id_familia, COUNT(CASE WHEN s.activo = 1 THEN 1 END) AS cantidad
             FROM familias f
             LEFT JOIN familia_socios fs ON fs.id_familia = f.id_familia
             LEFT JOIN socios s ON s.id_socio = fs.id_socio
             WHERE f.activo = 1 GROUP BY f.id_familia'
        )->fetchAll();
        $map = [];
        foreach ($rows as $row) $map[(int)$row['id_familia']] = (int)$row['cantidad'];
        return $map;
    }

    private static function aniosCatalogo(PDO $db): array
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

    private static function mesesCatalogo(PDO $db): array
    {
        $rows = $db->query('SELECT id_mes, nombre FROM meses ORDER BY id_mes')->fetchAll();
        foreach ($rows as &$row) $row['id_mes'] = (int)$row['id_mes'];
        unset($row);
        return $rows;
    }

    private static function categoriasCatalogo(PDO $db, bool $onlyActive): array
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

    private static function mediosPagoCatalogo(PDO $db): array
    {
        $rows = $db->query("SELECT id_medio_pago, nombre FROM medios_pago WHERE activo = 1 AND nombre <> 'CONDONACIÓN' ORDER BY nombre")->fetchAll();
        foreach ($rows as &$row) $row['id_medio_pago'] = (int)$row['id_medio_pago'];
        unset($row);
        return $rows;
    }

    private static function paymentRows(PDO $db, ?string $status = null, ?string $code = null, ?int $id = null): array
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

    private static function registrationRows(PDO $db, ?string $status = null, ?string $code = null, ?int $id = null): array
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

    private static function groupOperations(array $rows): array
    {
        $grouped = [];
        foreach ($rows as $row) {
            $code = (string)$row['codigo_operacion'];
            if (!isset($grouped[$code])) {
                $grouped[$code] = [
                    'codigo_operacion' => $code,
                    'tipo' => $row['tipo_registro'],
                    'concepto' => $row['tipo_registro'] === 'INSCRIPCION' ? 'INSCRIPCIÓN' : 'CUOTAS',
                    'estado' => $row['estado'],
                    'fecha_pago' => $row['fecha_pago'],
                    'medio_pago' => $row['medio_pago'],
                    'motivo_condonacion' => $row['motivo_condonacion'],
                    'observaciones' => $row['observaciones'],
                    'socios_map' => [],
                    'categorias_map' => [],
                    'periodos_map' => [],
                    'descuentos_map' => [],
                    'monto_base_num' => 0.0,
                    'monto_num' => 0.0,
                    'lineas' => [],
                ];
            }
            $grouped[$code]['socios_map'][(int)$row['id_socio']] = $row['socio'];
            $grouped[$code]['categorias_map'][(int)$row['id_categoria']] = $row['categoria'];
            $periodLabel = $row['tipo_registro'] === 'INSCRIPCION'
                ? $row['periodo'] . ' (' . $row['anio'] . ')'
                : $row['periodo'] . ' ' . $row['anio'];
            $grouped[$code]['periodos_map'][$periodLabel] = $periodLabel;
            $grouped[$code]['descuentos_map'][(string)$row['porcentaje_descuento_familiar']] = (float)$row['porcentaje_descuento_familiar'];
            $grouped[$code]['monto_base_num'] += (float)$row['monto_base'];
            $grouped[$code]['monto_num'] += (float)$row['monto'];
            $grouped[$code]['lineas'][] = [
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
            $categories = array_values($operation['categorias_map']);
            $periods = array_values($operation['periodos_map']);
            $discounts = array_values($operation['descuentos_map']);
            $periodSummary = count($periods) <= 6
                ? implode(' · ', $periods)
                : implode(' · ', array_slice($periods, 0, 5)) . ' · +' . (count($periods) - 5);
            $result[] = [
                'codigo_operacion' => $operation['codigo_operacion'],
                'tipo' => $operation['tipo'],
                'concepto' => $operation['concepto'],
                'estado' => $operation['estado'],
                'fecha_pago' => $operation['fecha_pago'],
                'medio_pago' => $operation['medio_pago'],
                'socios' => $partners,
                'socios_label' => implode(' · ', $partners),
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
                'busqueda' => implode(' ', [$operation['codigo_operacion'], implode(' ', $partners), implode(' ', $categories), implode(' ', $periods)]),
            ];
        }
        return $result;
    }

    private static function operacionPorCodigo(PDO $db, string $code): ?array
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

    private static function periodKey(int $partnerId, int $categoryId, int $year, int $month): string
    {
        return $partnerId . '-' . $categoryId . '-' . $year . '-' . $month;
    }

    private static function operationCode(string $prefix): string
    {
        return $prefix . '-' . date('YmdHis') . '-' . strtoupper(bin2hex(random_bytes(4)));
    }

    private static function monthName(int $month): string
    {
        return [1 => 'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'][$month] ?? '';
    }

    private static function lower(string $value): string
    {
        return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
    }

    private static function upper(string $value): string
    {
        return function_exists('mb_strtoupper') ? mb_strtoupper($value, 'UTF-8') : strtoupper($value);
    }
}
