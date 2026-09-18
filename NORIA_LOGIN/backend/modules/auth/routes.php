<?php
declare(strict_types=1);

function login_audit(PDO $master, ?array $candidate, string $usuario, bool $success): void
{
    try {
        $stmt = $master->prepare(
            'INSERT INTO login_auditoria (idUsuarioMaster, idTenant, usuario, ip, user_agent, exito)
             VALUES (:id_usuario, :id_tenant, :usuario, :ip, :ua, :exito)'
        );
        $stmt->execute([
            'id_usuario' => $candidate['idUsuarioMaster'] ?? null,
            'id_tenant' => $candidate['idTenant'] ?? null,
            'usuario' => substr($usuario, 0, 100),
            'ip' => client_ip(),
            'ua' => client_user_agent(),
            'exito' => $success ? 1 : 0,
        ]);
    } catch (Throwable $error) {
        error_log('login_auditoria: ' . $error->getMessage());
    }
}

function login_lock_status(PDO $master, string $usuario): array
{
    try {
        $stmt = $master->prepare(
            "SELECT idLog,
                    GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), DATE_ADD(creado_en, INTERVAL 15 MINUTE))) AS retry_seconds
             FROM login_auditoria
             WHERE usuario = :usuario_fallos
               AND exito = 0
               AND idLog > COALESCE((
                    SELECT MAX(ok.idLog) FROM login_auditoria ok
                    WHERE ok.usuario = :usuario_ok AND ok.exito = 1
               ), 0)
               AND creado_en > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
             ORDER BY idLog DESC
             LIMIT 5"
        );
        $stmt->execute(['usuario_fallos' => $usuario, 'usuario_ok' => $usuario]);
        $attempts = $stmt->fetchAll();
        if (count($attempts) < 5) return ['blocked' => false, 'retry' => 0];
        $retry = max(0, (int)($attempts[0]['retry_seconds'] ?? 0));
        return ['blocked' => $retry > 0, 'retry' => $retry];
    } catch (Throwable $error) {
        error_log('login rate limit: ' . $error->getMessage());
        return ['blocked' => false, 'retry' => 0];
    }
}

function reject_locked(array $lock): never
{
    $seconds = max(1, (int)($lock['retry'] ?? 900));
    header('Retry-After: ' . $seconds);
    api_error('Demasiados intentos fallidos. Intentá nuevamente más tarde.', 'LOGIN_LOCKED', 429, [
        'reintentar_en_segundos' => $seconds,
    ]);
}

function auth_login(): never
{
    $body = request_body();
    $usuario = clean_login_text($body['usuario'] ?? '', 100);
    $password = (string)($body['contrasena'] ?? '');

    if ($usuario === '' || $password === '') api_error('Ingresá usuario y contraseña.', 'VALIDATION_ERROR', 422);
    if (strlen($password) > 255) api_error('Credenciales inválidas.', 'INVALID_CREDENTIALS', 401);

    $master = master_db();
    $lock = login_lock_status($master, $usuario);
    if ($lock['blocked']) reject_locked($lock);

    $stmt = $master->prepare(
        'SELECT
            u.idUsuarioMaster, u.idTenant, u.usuario, u.hash_contrasena, u.rol, u.activo AS usuario_activo,
            t.nombre AS tenant_nombre, t.slug AS tenant_slug, t.logo_url, t.logo_icono_url, t.activo AS tenant_activo,
            p.idPlan AS plan_id, p.nombre AS plan_nombre, p.nivel AS plan_nivel, p.activo AS plan_activo,
            s.idSistema, s.codigo AS sistema_codigo, s.nombre AS sistema_nombre,
            s.frontend_url, s.api_base_url, s.dashboard_path, s.activo AS sistema_activo
         FROM usuarios_master u
         INNER JOIN tenants t ON t.idTenant = u.idTenant
         INNER JOIN planes_saas p ON p.idPlan = t.idPlan
         INNER JOIN sistemas_saas s ON s.idSistema = t.idSistema
         WHERE LOWER(u.usuario) = LOWER(:usuario)
         ORDER BY u.idUsuarioMaster ASC
         LIMIT 20'
    );
    $stmt->execute(['usuario' => $usuario]);
    $candidates = $stmt->fetchAll();
    $matched = array_values(array_filter(
        $candidates,
        static fn(array $candidate): bool => password_verify($password, (string)$candidate['hash_contrasena'])
    ));

    if (count($matched) !== 1) {
        login_audit($master, $candidates[0] ?? null, $usuario, false);
        $lock = login_lock_status($master, $usuario);
        if ($lock['blocked']) reject_locked($lock);
        api_error('Usuario o contraseña incorrectos.', 'INVALID_CREDENTIALS', 401);
    }

    $user = $matched[0];
    if (!(bool)$user['usuario_activo']) {
        login_audit($master, $user, $usuario, false);
        api_error('El usuario se encuentra deshabilitado.', 'USER_DISABLED', 403);
    }
    if (!(bool)$user['tenant_activo'] || !(bool)$user['plan_activo'] || !(bool)$user['sistema_activo']) {
        login_audit($master, $user, $usuario, false);
        api_error('La organización o el producto se encuentra deshabilitado.', 'TENANT_DISABLED', 403);
    }

    $systemCode = strtoupper((string)$user['sistema_codigo']);
    if (!in_array($systemCode, allowed_system_codes(), true)) {
        login_audit($master, $user, $usuario, false);
        api_error('El producto de esta cuenta no está habilitado en el LOGIN central.', 'SYSTEM_NOT_ALLOWED', 403);
    }

    $hours = max(1, min(168, (int)env_value('SESSION_HOURS', '12')));
    $expiresAt = (new DateTimeImmutable())->modify("+{$hours} hours");
    $token = bin2hex(random_bytes(32));

    $insert = $master->prepare(
        'INSERT INTO sesiones (session_key, idUsuarioMaster, idTenant, expira_en, ultimo_uso, ip, user_agent, activo)
         VALUES (:token, :usuario, :tenant, :expira, NOW(), :ip, :ua, 1)'
    );
    $insert->execute([
        'token' => $token,
        'usuario' => (int)$user['idUsuarioMaster'],
        'tenant' => (int)$user['idTenant'],
        'expira' => $expiresAt->format('Y-m-d H:i:s'),
        'ip' => client_ip(),
        'ua' => client_user_agent(),
    ]);

    login_audit($master, $user, $usuario, true);

    $system = system_runtime_config([
        'id' => (int)$user['idSistema'],
        'codigo' => $systemCode,
        'nombre' => (string)$user['sistema_nombre'],
        'frontend_url' => (string)$user['frontend_url'],
        'api_base_url' => $user['api_base_url'],
        'dashboard_path' => (string)$user['dashboard_path'],
    ]);

    api_success([
        'token' => $token,
        'expira_en' => $expiresAt->format(DATE_ATOM),
        'usuario' => [
            'id' => (int)$user['idUsuarioMaster'],
            'nombre' => (string)$user['usuario'],
            'rol' => (string)$user['rol'],
        ],
        'tenant' => [
            'id' => (int)$user['idTenant'],
            'nombre' => (string)$user['tenant_nombre'],
            'slug' => $user['tenant_slug'],
            'logo_url' => $user['logo_url'],
            'logo_icono_url' => $user['logo_icono_url'],
        ],
        'plan' => [
            'id' => (int)$user['plan_id'],
            'nombre' => (string)$user['plan_nombre'],
            'nivel' => (int)$user['plan_nivel'],
        ],
        'sistema' => $system,
        'redirect_url' => build_system_redirect($system),
    ], 'Sesión iniciada correctamente.');
}

function auth_current(): never
{
    $auth = require_auth();
    api_success([
        'usuario' => $auth['usuario'],
        'tenant' => $auth['tenant'],
        'plan' => $auth['plan'],
        'sistema' => $auth['sistema'],
        'redirect_url' => $auth['redirect_url'],
        'expira_en' => $auth['expira_en'],
    ]);
}

function auth_logout(): never
{
    $auth = require_auth();
    master_db()->prepare('UPDATE sesiones SET activo = 0 WHERE idSesion = ?')->execute([$auth['id_sesion']]);
    api_success([], 'Sesión cerrada correctamente.');
}

function register_auth_routes(Router $router): void
{
    $router->register('auth_login', 'POST', 'auth_login', false);
    $router->register('auth_current', 'GET', 'auth_current', true);
    $router->register('auth_validate', 'GET', 'auth_current', true);
    $router->register('auth_logout', 'POST', 'auth_logout', true);
}
