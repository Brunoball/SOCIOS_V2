<?php
declare(strict_types=1);

function register_cuotas_routes(Router $router): void
{
    $router->register('cuotas_listar', 'GET', static fn() => not_implemented('Cuotas'), true);
    $router->register('cuotas_generar', 'POST', static fn() => not_implemented('Cuotas'), true);
    $router->register('cuotas_registrar_pago', 'POST', static fn() => not_implemented('Cuotas'), true);
    $router->register('cuotas_eliminar_pago', 'POST', static fn() => not_implemented('Cuotas'), true);
}
