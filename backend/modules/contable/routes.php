<?php
declare(strict_types=1);

function register_contable_routes(Router $router): void
{
    $router->register('contable_listar', 'GET', static fn() => not_implemented('Contable'), true);
    $router->register('contable_guardar', 'POST', static fn() => not_implemented('Contable'), true);
    $router->register('contable_eliminar', 'POST', static fn() => not_implemented('Contable'), true);
}
