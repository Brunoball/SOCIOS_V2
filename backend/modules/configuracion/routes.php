<?php
declare(strict_types=1);

function register_configuracion_routes(Router $router): void
{
    $router->register('configuracion_obtener', 'GET', static fn() => not_implemented('Configuracion'), true);
    $router->register('configuracion_guardar', 'POST', static fn() => not_implemented('Configuracion'), true);
    $router->register('usuarios_listar', 'GET', static fn() => not_implemented('Configuracion'), true);
    $router->register('usuarios_guardar', 'POST', static fn() => not_implemented('Configuracion'), true);
}
