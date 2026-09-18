<?php
declare(strict_types=1);
require_once __DIR__ . '/env.php';

function master_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $host = (string)env_value('MASTER_DB_HOST', 'localhost');
    $port = (int)env_value('MASTER_DB_PORT', '3306');
    $name = (string)env_value('MASTER_DB_NAME', 'socios_master');
    $user = (string)env_value('MASTER_DB_USER', 'root');
    $pass = (string)env_value('MASTER_DB_PASS', '');

    $pdo = new PDO(
        "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4",
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
    return $pdo;
}
