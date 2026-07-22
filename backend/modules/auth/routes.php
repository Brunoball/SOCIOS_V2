<?php
declare(strict_types=1);

function auth_login_audit(PDO $master, ?array $candidate, string $usuario, bool $success): void
{
    try {
        $statement = $master->prepare(
            'INSERT INTO login_auditoria (idUsuarioMaster, idTenant, usuario, ip, user_agent, exito)
             VALUES (:id_usuario, :id_tenant, :usuario, :ip, :agente, :exito)'
        );
        $statement->execute([
            'id_usuario' => $candidate['idUsuarioMaster'] ?? null,
            'id_tenant' => $candidate['idTenant'] ?? null,
            'usuario' => substr($usuario, 0, 100),
            'ip' => client_ip(),
            'agente' => client_user_agent(),
            'exito' => $success ? 1 : 0,
        ]);
    } catch (Throwable $error) {
        error_log('No se pudo registrar login_auditoria: ' . $error->getMessage());
    }
}

function auth_login_lock_status(PDO $master, string $usuario): array
{
    try {
        $statement = $master->prepare(
            "SELECT
                idLog,
                GREATEST(
                    0,
                    TIMESTAMPDIFF(SECOND, NOW(), DATE_ADD(creado_en, INTERVAL 15 MINUTE))
                ) AS reintentar_en_segundos
             FROM login_auditoria
             WHERE usuario = :usuario_fallos
               AND exito = 0
               AND idLog > COALESCE((
                   SELECT MAX(exitoso.idLog)
                   FROM login_auditoria exitoso
                   WHERE exitoso.usuario = :usuario_exitos
                     AND exitoso.exito = 1
               ), 0)
               AND creado_en > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
             ORDER BY idLog DESC
             LIMIT 5"
        );
        $statement->execute([
            'usuario_fallos' => $usuario,
            'usuario_exitos' => $usuario,
        ]);
        $attempts = $statement->fetchAll();

        if (count($attempts) < 5) {
            return [
                'bloqueado' => false,
                'intentos_fallidos' => count($attempts),
                'reintentar_en_segundos' => 0,
            ];
        }

        $retryAfter = max(0, (int)($attempts[0]['reintentar_en_segundos'] ?? 0));
        return [
            'bloqueado' => $retryAfter > 0,
            'intentos_fallidos' => count($attempts),
            'reintentar_en_segundos' => $retryAfter,
        ];
    } catch (Throwable $error) {
        // El login no debe quedar inutilizable si la tabla de auditoría todavía
        // no existe durante una instalación o migración incompleta.
        error_log('No se pudo verificar el bloqueo de login: ' . $error->getMessage());
        return [
            'bloqueado' => false,
            'intentos_fallidos' => 0,
            'reintentar_en_segundos' => 0,
        ];
    }
}

function auth_reject_locked_login(array $lock): never
{
    $seconds = max(1, (int)($lock['reintentar_en_segundos'] ?? 900));
    $minutes = max(1, (int)ceil($seconds / 60));
    header('Retry-After: ' . $seconds);
    api_error(
        "Demasiados intentos fallidos. Este usuario está bloqueado. Intentá nuevamente en {$minutes} minuto" . ($minutes === 1 ? '.' : 's.'),
        'LOGIN_LOCKED',
        429,
        ['reintentar_en_segundos' => $seconds]
    );
}

function auth_cookie(string $token, int $expires): void
{
    $secure = env_bool('SESSION_COOKIE_SECURE', (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'));
    setcookie((string)env_value('SESSION_COOKIE_NAME', 'socios_session'), $token, [
        'expires' => $expires,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => $secure ? 'None' : 'Lax',
    ]);
}

function auth_login(): never
{
    $body = request_body();
    $usuario = clean_text($body['usuario'] ?? '', 100, false);
    $password = (string)($body['contrasena'] ?? '');
    if ($usuario === '' || $password === '') api_error('Ingresá usuario y contraseña.', 'VALIDATION_ERROR');
    if (strlen($password) > 255) api_error('Las credenciales no son válidas.', 'INVALID_CREDENTIALS', 401);

    $master = master_db();
    $lock = auth_login_lock_status($master, $usuario);
    if ($lock['bloqueado']) auth_reject_locked_login($lock);

    $statement = $master->prepare(
        'SELECT
            u.idUsuarioMaster, u.idTenant, u.usuario, u.hash_contrasena, u.rol, u.activo AS usuario_activo,
            t.nombre AS tenant_nombre, t.slug AS tenant_slug, t.logo_url, t.logo_icono_url,
            t.activo AS tenant_activo, p.idPlan AS plan_id, p.nombre AS plan_nombre,
            p.nivel AS plan_nivel, p.activo AS plan_activo
         FROM usuarios_master u
         INNER JOIN tenants t ON t.idTenant = u.idTenant
         INNER JOIN planes_saas p ON p.idPlan = t.idPlan
         WHERE u.usuario = :usuario
         ORDER BY u.idUsuarioMaster ASC
         LIMIT 20'
    );
    $statement->execute(['usuario' => $usuario]);
    $candidates = $statement->fetchAll();
    $matched = [];
    foreach ($candidates as $candidate) {
        if (password_verify($password, (string)$candidate['hash_contrasena'])) $matched[] = $candidate;
    }

    if (count($matched) !== 1) {
        auth_login_audit($master, $candidates[0] ?? null, $usuario, false);
        $lock = auth_login_lock_status($master, $usuario);
        if ($lock['bloqueado']) auth_reject_locked_login($lock);
        api_error('Usuario o contraseña incorrectos.', 'INVALID_CREDENTIALS', 401);
    }

    $user = $matched[0];
    if (!(bool)$user['usuario_activo']) {
        auth_login_audit($master, $user, $usuario, false);
        api_error('El usuario se encuentra deshabilitado.', 'USER_DISABLED', 403);
    }
    if (!(bool)$user['tenant_activo'] || !(bool)$user['plan_activo']) {
        auth_login_audit($master, $user, $usuario, false);
        api_error('La organización no se encuentra habilitada.', 'TENANT_DISABLED', 403);
    }

    $hours = max(1, min(168, (int)env_value('SESSION_HOURS', '12')));
    $expiresAt = (new DateTimeImmutable())->modify("+{$hours} hours");
    $token = bin2hex(random_bytes(32));
    $insert = $master->prepare(
        'INSERT INTO sesiones (session_key, idUsuarioMaster, idTenant, expira_en, ultimo_uso, ip, user_agent, activo)
         VALUES (:token, :usuario, :tenant, :expira, NOW(), :ip, :agente, 1)'
    );
    $insert->execute([
        'token' => $token,
        'usuario' => (int)$user['idUsuarioMaster'],
        'tenant' => (int)$user['idTenant'],
        'expira' => $expiresAt->format('Y-m-d H:i:s'),
        'ip' => client_ip(),
        'agente' => client_user_agent(),
    ]);

    // El acceso se mantiene con el token Bearer guardado por pestaña en el
    // frontend. Además se elimina cualquier cookie heredada para que cerrar la
    // pestaña obligue a pasar nuevamente por el formulario de inicio de sesión.
    auth_cookie('', time() - 3600);
    auth_login_audit($master, $user, $usuario, true);

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
    ], 'Sesión iniciada correctamente.');
}

function auth_current(): never
{
    api_success(public_auth_profile(auth_context()));
}

function auth_logout(): never
{
    $auth = auth_context();
    master_db()->prepare('UPDATE sesiones SET activo = 0 WHERE idSesion = ?')->execute([$auth['id_sesion']]);
    auth_cookie('', time() - 3600);
    api_success([], 'Sesión cerrada correctamente.');
}

function register_auth_routes(Router $router): void
{
    $router->register('auth_login', 'POST', 'auth_login', false);
    $router->register('auth_usuario_actual', 'GET', 'auth_current', true);
    $router->register('auth_logout', 'POST', 'auth_logout', true);
}
