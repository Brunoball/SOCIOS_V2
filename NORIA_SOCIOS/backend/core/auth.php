<?php
declare(strict_types=1);
require_once __DIR__ . '/http.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/env.php';

$GLOBALS['SAAS_SOCIOS_AUTH'] = null;

function request_session_token(): string
{
    $authorization = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if (stripos($authorization, 'Bearer ') === 0) {
        return trim(substr($authorization, 7));
    }

    return trim((string)($_SERVER['HTTP_X_SESSION'] ?? $_SERVER['HTTP_X_SESSION_KEY'] ?? ''));
}

function require_auth(): array
{
    if (is_array($GLOBALS['SAAS_SOCIOS_AUTH'])) return $GLOBALS['SAAS_SOCIOS_AUTH'];

    $token = request_session_token();
    if ($token === '' || strlen($token) > 128) {
        api_error('Sesión requerida.', 'SESSION_REQUIRED', 401);
    }

    $master = master_db();
    $statement = $master->prepare(
        'SELECT
            se.idSesion, se.idUsuarioMaster, se.idTenant, se.expira_en,
            u.usuario, u.rol, u.activo AS usuario_activo,
            t.nombre AS tenant_nombre, t.slug AS tenant_slug, t.logo_url, t.logo_icono_url,
            t.db_host, t.db_name, t.db_user, t.db_pass, t.activo AS tenant_activo,
            p.idPlan AS plan_id, p.nombre AS plan_nombre, p.nivel AS plan_nivel, p.activo AS plan_activo,
            sys.idSistema, sys.codigo AS sistema_codigo, sys.nombre AS sistema_nombre,
            sys.frontend_url, sys.api_base_url, sys.dashboard_path, sys.activo AS sistema_activo
         FROM sesiones se
         INNER JOIN usuarios_master u ON u.idUsuarioMaster = se.idUsuarioMaster
         INNER JOIN tenants t ON t.idTenant = se.idTenant
         INNER JOIN planes_saas p ON p.idPlan = t.idPlan
         INNER JOIN sistemas_saas sys ON sys.idSistema = t.idSistema
         WHERE se.session_key = :session_key AND se.activo = 1
         LIMIT 1'
    );
    $statement->execute(['session_key' => $token]);
    $row = $statement->fetch();

    if (!$row) api_error('La sesión no existe o fue cerrada.', 'SESSION_REQUIRED', 401);

    if (strtotime((string)$row['expira_en']) <= time()) {
        $master->prepare('UPDATE sesiones SET activo = 0 WHERE idSesion = ?')->execute([(int)$row['idSesion']]);
        api_error('La sesión venció.', 'SESSION_EXPIRED', 401);
    }
    if (!(bool)$row['usuario_activo']) {
        $master->prepare('UPDATE sesiones SET activo = 0 WHERE idUsuarioMaster = ?')->execute([(int)$row['idUsuarioMaster']]);
        api_error('El usuario se encuentra deshabilitado.', 'USER_DISABLED', 403);
    }
    if (!(bool)$row['tenant_activo'] || !(bool)$row['plan_activo'] || !(bool)$row['sistema_activo']) {
        $master->prepare('UPDATE sesiones SET activo = 0 WHERE idTenant = ?')->execute([(int)$row['idTenant']]);
        api_error('La organización o el producto no se encuentra habilitado.', 'TENANT_DISABLED', 403);
    }

    $expectedSystem = strtoupper(trim((string)env_value('EXPECTED_SYSTEM_CODE', 'SOCIOS')));
    $sessionSystem = strtoupper(trim((string)$row['sistema_codigo']));
    if ($sessionSystem !== $expectedSystem) {
        api_error('La sesión pertenece a otro producto.', 'WRONG_SYSTEM', 403, [
            'esperado' => $expectedSystem,
            'recibido' => $sessionSystem,
        ]);
    }

    $master->prepare('UPDATE sesiones SET ultimo_uso = NOW() WHERE idSesion = ?')->execute([(int)$row['idSesion']]);

    $context = [
        'id_sesion' => (int)$row['idSesion'],
        'session_key' => $token,
        'id_usuario_master' => (int)$row['idUsuarioMaster'],
        'id_tenant' => (int)$row['idTenant'],
        'usuario' => (string)$row['usuario'],
        'rol' => (string)$row['rol'],
        'tenant' => [
            'id' => (int)$row['idTenant'],
            'nombre' => (string)$row['tenant_nombre'],
            'slug' => $row['tenant_slug'],
            'logo_url' => $row['logo_url'],
            'logo_icono_url' => $row['logo_icono_url'],
            'db_host' => (string)$row['db_host'],
            'db_name' => (string)$row['db_name'],
            'db_user' => (string)$row['db_user'],
            'db_pass' => (string)$row['db_pass'],
        ],
        'plan' => [
            'id' => (int)$row['plan_id'],
            'nombre' => (string)$row['plan_nombre'],
            'nivel' => (int)$row['plan_nivel'],
        ],
        'sistema' => [
            'id' => (int)$row['idSistema'],
            'codigo' => $sessionSystem,
            'nombre' => (string)$row['sistema_nombre'],
            'frontend_url' => (string)$row['frontend_url'],
            'api_base_url' => $row['api_base_url'],
            'dashboard_path' => (string)$row['dashboard_path'],
        ],
    ];

    $context['db'] = tenant_db($context['tenant']);
    $GLOBALS['SAAS_SOCIOS_AUTH'] = $context;
    return $context;
}

function auth_context(): array
{
    return require_auth();
}

function require_admin(): array
{
    $auth = require_auth();
    if ($auth['rol'] !== 'admin') api_error('Tu usuario es de solo lectura.', 'FORBIDDEN_ROLE', 403);
    return $auth;
}
