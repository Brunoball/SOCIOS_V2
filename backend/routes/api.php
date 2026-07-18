<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/env.php';
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../core/request.php';
require_once __DIR__ . '/../core/router.php';
require_once __DIR__ . '/../core/domain.php';

foreach (glob(__DIR__ . '/../modules/*/routes.php') ?: [] as $routeFile) {
    require_once $routeFile;
}

date_default_timezone_set((string)env_value('APP_TIMEZONE', 'America/Argentina/Cordoba'));
ini_set('display_errors', env_bool('APP_DEBUG', false) ? '1' : '0');

$router = new Router();
$router->register('health', 'GET', static function (): never {
    json_response([
        'exito' => true,
        'servicio' => 'gestion-socios-api',
        'estado' => 'ok',
        'fecha' => date(DATE_ATOM),
    ]);
}, false);

register_auth_routes($router);
register_dashboard_routes($router);
register_socios_routes($router);
register_cuotas_routes($router);
register_categorias_routes($router);
register_contable_routes($router);
register_whatsapp_routes($router);
register_configuracion_routes($router);

try {
    $router->dispatch(request_action());
} catch (Throwable $error) {
    error_log($error->__toString());
    $payload = ['exito' => false, 'mensaje' => 'Error interno del servidor.'];
    if (env_bool('APP_DEBUG', false)) $payload['detalle'] = $error->getMessage();
    json_response($payload, 500);
}
