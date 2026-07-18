<?php
declare(strict_types=1);

function register_dashboard_routes(Router $router): void
{
    $router->register('dashboard_resumen', 'GET', static fn() => not_implemented('Dashboard'), true);
}
