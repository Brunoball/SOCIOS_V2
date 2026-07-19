<?php
declare(strict_types=1);

require_once __DIR__ . '/cuotas_consultas.php';

abstract class CuotasRegistros extends CuotasConsultas
{
    protected static function registrarPagoDatos(array $auth, array $body): array
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

        try {
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
        } catch (Throwable $error) {
            if (duplicate_key($error)) {
                api_error('Una de las cuotas seleccionadas ya está pagada o condonada.', 'CUOTA_YA_REGISTRADA', 409);
            }
            throw $error;
        }

        return ['codigo_operacion' => $operationCode, 'estado' => $state] + $saved;
    }

    protected static function registrarInscripcionDatos(array $auth, array $body): array
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

        try {
            $saved = transaction($db, static function () use (
            $db, $auth, $recipients, $categoryId, $year, $base, $rules, &$discountCache,
            $operationCode, $state, $mediumId, $date, $description, $observations, $reason
        ): array {
            $lines = [];
            $charged = 0.0;
            $theoretical = 0.0;
            $partnerLock = $db->prepare('SELECT id_socio FROM socios WHERE id_socio = ? FOR UPDATE');
            foreach ($recipients as $partnerId) {
                $partnerLock->execute([$partnerId]);
                if (!$partnerLock->fetchColumn()) {
                    api_error('Uno de los socios seleccionados ya no existe.', 'SOCIO_NO_DISPONIBLE', 404);
                }
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
        } catch (Throwable $error) {
            if (duplicate_key($error)) {
                api_error('La inscripción ya está pagada o condonada para uno de los socios.', 'INSCRIPCION_YA_REGISTRADA', 409);
            }
            throw $error;
        }

        return ['codigo_operacion' => $operationCode, 'estado' => $state] + $saved;
    }

    protected static function anularDatos(array $auth, array $body): array
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
            $auditTable = $before['tipo'] === 'INSCRIPCION' ? 'pagos_inscripciones' : 'pagos';
            audit_change($db, $auth, 'CUOTAS', 'ANULAR', $auditTable, $code, 'Se anuló un pago o una condonación.', $before, ['estado' => 'ANULADO']);
            return $affected;
        });
        return ['codigo_operacion' => $code, 'registros_anulados' => $count];
    }
}
