<?php
declare(strict_types=1);
require_once __DIR__ . '/http.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/domain.php';

$GLOBALS['SAAS_LOGIN_AUTH'] = null;

function request_session_token(): string
{
    $authorization = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if (stripos($authorization, 'Bearer ') === 0) return trim(substr($authorization, 7));
    return trim((string)($_SERVER['HTTP_X_SESSION'] ?? $_SERVER['HTTP_X_SESSION_KEY'] ?? ''));
}

function require_auth(): array
{
    if (is_array($GLOBALS['SAAS_LOGIN_AUTH'])) return $GLOBALS['SAAS_LOGIN_AUTH'];

    $token = request_session_token();
    if ($token === '' || strlen($token) > 128) api_error('Sesión requerida.', 'SESSION_REQUIRED', 401);

    $stmt = master_db()->prepare(
        'SELECT
            se.idSesion, se.idUsuarioMaster, se.idTenant, se.expira_en,
            u.usuario, u.rol, u.activo AS usuario_activo,
            t.nombre AS tenant_nombre, t.slug AS tenant_slug, t.logo_url, t.logo_icono_url, t.activo AS tenant_activo,
            p.idPlan AS plan_id, p.nombre AS plan_nombre, p.nivel AS plan_nivel, p.activo AS plan_activo,
            s.idSistema, s.codigo AS sistema_codigo, s.nombre AS sistema_nombre,
            s.frontend_url, s.api_base_url, s.dashboard_path, s.activo AS sistema_activo
         FROM sesiones se
         INNER JOIN usuarios_master u ON u.idUsuarioMaster = se.idUsuarioMaster
         INNER JOIN tenants t ON t.idTenant = se.idTenant
         INNER JOIN planes_saas p ON p.idPlan = t.idPlan
         INNER JOIN sistemas_saas s ON s.idSistema = t.idSistema
         WHERE se.session_key = :token AND se.activo = 1
         LIMIT 1'
    );
    $stmt->execute(['token' => $token]);
    $row = $stmt->fetch();

    if (!$row) api_error('La sesión no existe o fue cerrada.', 'SESSION_REQUIRED', 401);
    if (strtotime((string)$row['expira_en']) <= time()) {
        master_db()->prepare('UPDATE sesiones SET activo = 0 WHERE idSesion = ?')->execute([(int)$row['idSesion']]);
        api_error('La sesión venció.', 'SESSION_EXPIRED', 401);
    }
    if (!(bool)$row['usuario_activo']) api_error('Usuario deshabilitado.', 'USER_DISABLED', 403);
    if (!(bool)$row['tenant_activo'] || !(bool)$row['plan_activo'] || !(bool)$row['sistema_activo']) {
        api_error('La organización o el producto no se encuentra habilitado.', 'TENANT_DISABLED', 403);
    }
    if (!in_array(strtoupper((string)$row['sistema_codigo']), allowed_system_codes(), true)) {
        api_error('El producto asociado al usuario no está permitido por este LOGIN.', 'SYSTEM_NOT_ALLOWED', 403);
    }

    master_db()->prepare('UPDATE sesiones SET ultimo_uso = NOW() WHERE idSesion = ?')->execute([(int)$row['idSesion']]);

    $auth = [
        'id_sesion' => (int)$row['idSesion'],
        'token' => $token,
        'usuario' => [
            'id' => (int)$row['idUsuarioMaster'],
            'nombre' => (string)$row['usuario'],
            'rol' => (string)$row['rol'],
        ],
        'tenant' => [
            'id' => (int)$row['idTenant'],
            'nombre' => (string)$row['tenant_nombre'],
            'slug' => $row['tenant_slug'],
            'logo_url' => $row['logo_url'],
            'logo_icono_url' => $row['logo_icono_url'],
        ],
        'plan' => [
            'id' => (int)$row['plan_id'],
            'nombre' => (string)$row['plan_nombre'],
            'nivel' => (int)$row['plan_nivel'],
        ],
        'sistema' => system_runtime_config([
            'id' => (int)$row['idSistema'],
            'codigo' => (string)$row['sistema_codigo'],
            'nombre' => (string)$row['sistema_nombre'],
            'frontend_url' => (string)$row['frontend_url'],
            'api_base_url' => $row['api_base_url'],
            'dashboard_path' => (string)$row['dashboard_path'],
        ]),
        'expira_en' => (string)$row['expira_en'],
    ];
    $auth['redirect_url'] = build_system_redirect($auth['sistema']);
    return $GLOBALS['SAAS_LOGIN_AUTH'] = $auth;
}
