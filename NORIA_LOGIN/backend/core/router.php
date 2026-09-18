<?php
declare(strict_types=1);
require_once __DIR__ . '/http.php';
require_once __DIR__ . '/auth.php';

final class Router
{
    private array $routes = [];

    public function register(string $action, string $method, callable $handler, bool $protected = true): void
    {
        $this->routes[$action] = [
            'method' => strtoupper($method),
            'handler' => $handler,
            'protected' => $protected,
        ];
    }

    public function dispatch(string $action): never
    {
        if ($action === '' || !isset($this->routes[$action])) {
            api_error($action === '' ? 'Falta el parámetro action.' : 'Acción no encontrada.', 'ROUTE_NOT_FOUND', $action === '' ? 400 : 404);
        }
        $route = $this->routes[$action];
        $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        if ($method !== $route['method']) api_error('Método HTTP no permitido.', 'METHOD_NOT_ALLOWED', 405);
        if ($route['protected']) require_auth();
        ($route['handler'])();
        api_success();
    }
}
