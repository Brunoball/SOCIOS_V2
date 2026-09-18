<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/env.php';
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../core/http.php';
require_once __DIR__ . '/../core/request.php';
require_once __DIR__ . '/../core/domain.php';
require_once __DIR__ . '/../core/auth.php';
require_once __DIR__ . '/../core/router.php';
require_once __DIR__ . '/../modules/auth/routes.php';

date_default_timezone_set((string)env_value('APP_TIMEZONE', 'America/Argentina/Cordoba'));
ini_set('display_errors', env_bool('APP_DEBUG', false) ? '1' : '0');

$router = new Router();
$router->register('health', 'GET', static function (): never {
    // Verifica también que MASTER sea alcanzable y que la tabla de sistemas exista.
    $count = (int)master_db()->query('SELECT COUNT(*) FROM sistemas_saas')->fetchColumn();
    api_success([
        'servicio' => 'saas-login-api',
        'estado' => 'ok',
        'sistemas_registrados' => $count,
        'fecha' => date(DATE_ATOM),
    ]);
}, false);

register_auth_routes($router);
$router->dispatch(request_action());
