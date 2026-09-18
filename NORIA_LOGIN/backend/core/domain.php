<?php
declare(strict_types=1);

function client_ip(): string
{
    return substr(trim((string)($_SERVER['REMOTE_ADDR'] ?? '')), 0, 64);
}

function client_user_agent(): string
{
    return substr(trim((string)($_SERVER['HTTP_USER_AGENT'] ?? '')), 0, 255);
}

function clean_login_text(mixed $value, int $maxLength = 100): string
{
    $text = preg_replace('/\s+/u', ' ', trim((string)$value)) ?? '';
    return function_exists('mb_substr') ? mb_substr($text, 0, $maxLength, 'UTF-8') : substr($text, 0, $maxLength);
}

function allowed_system_codes(): array
{
    return array_values(array_filter(array_map(
        static fn(string $v): string => strtoupper(trim($v)),
        explode(',', (string)env_value('ALLOWED_SYSTEM_CODES', 'SOCIOS,COOPERADORA'))
    )));
}

/**
 * SAAS_CONFIG genera SOCIOS_FRONTEND_URL / COOPERADORA_FRONTEND_URL y sus APIs.
 * Esas variables tienen prioridad sobre las URL guardadas en MASTER, de modo que
 * cambiar SAAS_CONFIG/saas.env sea suficiente para mover todo el ecosistema.
 */
function system_runtime_config(array $system): array
{
    $code = strtoupper(trim((string)($system['codigo'] ?? '')));
    if ($code === '') return $system;

    $frontend = trim((string)env_value($code . '_FRONTEND_URL', ''));
    $api = trim((string)env_value($code . '_API_URL', ''));

    if ($frontend !== '') {
        $system['frontend_url'] = rtrim($frontend, '/');
    }
    if ($api !== '') {
        $system['api_base_url'] = rtrim($api, '/');
    }

    return $system;
}

function build_system_redirect(array $system): string
{
    $system = system_runtime_config($system);
    $base = rtrim((string)($system['frontend_url'] ?? ''), '/');
    $path = trim((string)($system['dashboard_path'] ?? '/panel'));
    if ($path === '') $path = '/panel';
    if ($path[0] !== '/') $path = '/' . $path;
    return $base . $path;
}
