<?php
declare(strict_types=1);
require_once __DIR__ . '/env.php';

function pdo_connection(string $host, int $port, string $database, string $user, string $password): PDO
{
    $dsn = "mysql:host={$host};port={$port};dbname={$database};charset=utf8mb4";
    return new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

function master_db(): PDO
{
    static $connection = null;
    if ($connection instanceof PDO) return $connection;
    $connection = pdo_connection(
        (string)env_value('MASTER_DB_HOST', 'localhost'),
        (int)env_value('MASTER_DB_PORT', '3306'),
        (string)env_value('MASTER_DB_NAME', 'socios_master'),
        (string)env_value('MASTER_DB_USER', 'root'),
        (string)env_value('MASTER_DB_PASS', '')
    );
    return $connection;
}

function tenant_db(array $tenant): PDO
{
    return pdo_connection(
        (string)($tenant['db_host'] ?? 'localhost'),
        (int)($tenant['db_port'] ?? 3306),
        (string)($tenant['db_name'] ?? ''),
        (string)($tenant['db_user'] ?? ''),
        (string)($tenant['db_pass'] ?? '')
    );
}
