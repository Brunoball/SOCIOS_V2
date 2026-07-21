<?php
declare(strict_types=1);

final class Usuarios
{
    private const ROLES = ['admin', 'vista'];

    public static function listar(): never
    {
        $auth = require_admin();
        api_success(self::listarDatos($auth));
    }

    public static function guardar(): never
    {
        $auth = require_admin();
        $result = self::guardarDatos($auth, request_body());
        api_success(
            $result,
            $result['creado']
                ? 'Usuario creado correctamente.'
                : 'Usuario actualizado correctamente.'
        );
    }

    public static function cambiarEstado(): never
    {
        $auth = require_admin();
        $result = self::cambiarEstadoDatos($auth, request_body());
        api_success(
            $result,
            $result['activo']
                ? 'Usuario reactivado correctamente.'
                : 'Usuario dado de baja correctamente.'
        );
    }

    public static function eliminar(): never
    {
        $auth = require_admin();
        $result = self::eliminarDatos($auth, request_body());
        api_success($result, 'Usuario eliminado correctamente.');
    }

    private static function listarDatos(array $auth): array
    {
        $master = master_db();
        $schema = self::schema($master);
        $emailSql = $schema['email'] !== null
            ? 'u.' . self::identifier($schema['email']) . ' AS email'
            : 'NULL AS email';
        $createdSql = $schema['created_at'] !== null
            ? 'u.' . self::identifier($schema['created_at']) . ' AS creado_en'
            : 'NULL AS creado_en';

        $accessesSql = $schema['login_auditoria']
            ? '(SELECT COUNT(*) FROM login_auditoria la WHERE la.idUsuarioMaster = u.idUsuarioMaster)'
            : '0';
        $statement = $master->prepare(
            "SELECT u.idUsuarioMaster, u.usuario, u.rol, u.activo,
                    {$emailSql}, {$createdSql},
                    (SELECT COUNT(*) FROM sesiones s WHERE s.idUsuarioMaster = u.idUsuarioMaster) AS sesiones,
                    {$accessesSql} AS accesos
             FROM usuarios_master u
             WHERE u.idTenant = ?
             ORDER BY u.activo DESC, u.usuario ASC, u.idUsuarioMaster ASC"
        );
        $statement->execute([$auth['id_tenant']]);

        $users = [];
        $summary = ['total' => 0, 'activos' => 0, 'bajas' => 0, 'admins' => 0];
        foreach ($statement->fetchAll() as $row) {
            $active = (bool)$row['activo'];
            $current = (int)$row['idUsuarioMaster'] === (int)$auth['id_usuario_master'];
            $sessions = (int)$row['sesiones'];
            $accesses = (int)$row['accesos'];

            $summary['total']++;
            $summary[$active ? 'activos' : 'bajas']++;
            if ((string)$row['rol'] === 'admin') $summary['admins']++;

            $users[] = [
                'id' => (int)$row['idUsuarioMaster'],
                'usuario' => (string)$row['usuario'],
                'email' => $row['email'] === null ? null : (string)$row['email'],
                'rol' => (string)$row['rol'],
                'activo' => $active,
                'creado_en' => $row['creado_en'] === null ? null : (string)$row['creado_en'],
                'sesion_actual' => $current,
                'cantidad_sesiones' => $sessions,
                'cantidad_accesos' => $accesses,
                'puede_cambiar_estado' => !$current,
                'puede_eliminar' => !$current && $sessions === 0 && $accesses === 0,
            ];
        }

        return [
            'usuarios' => $users,
            'resumen' => $summary,
            'capacidades' => [
                'email' => $schema['email'] !== null,
                'fecha_creacion' => $schema['created_at'] !== null,
            ],
        ];
    }

    private static function guardarDatos(array $auth, array $body): array
    {
        $master = master_db();
        $schema = self::schema($master);
        $id = self::optionalId($body['id'] ?? null);
        $username = self::username($body['usuario'] ?? '');
        $email = self::email($body['email'] ?? null);
        $role = self::role($body['rol'] ?? 'vista');
        $password = (string)($body['contrasena'] ?? '');
        $passwordConfirmation = (string)($body['confirmar_contrasena'] ?? '');

        if ($email !== null && $schema['email'] === null) {
            api_error(
                'Falta ejecutar la migración SQL de usuarios para guardar direcciones de email.',
                'USUARIOS_SCHEMA_INCOMPLETO',
                409
            );
        }

        if ($password !== '' || $id === null) {
            self::validatePassword($password, $passwordConfirmation);
        }

        return transaction($master, static function () use (
            $master,
            $schema,
            $auth,
            $id,
            $username,
            $email,
            $role,
            $password
        ): array {
            self::assertUniqueUsername($master, (int)$auth['id_tenant'], $username, $id);
            self::assertUniqueEmail($master, $schema, (int)$auth['id_tenant'], $email, $id);

            if ($id === null) {
                $columns = ['idTenant', 'usuario', 'hash_contrasena', 'rol', 'activo'];
                $values = [(int)$auth['id_tenant'], $username, password_hash($password, PASSWORD_DEFAULT), $role, 1];
                if ($schema['email'] !== null) {
                    $columns[] = $schema['email'];
                    $values[] = $email;
                }

                $columnSql = implode(', ', array_map([self::class, 'identifier'], $columns));
                $placeholders = implode(', ', array_fill(0, count($columns), '?'));
                $master->prepare("INSERT INTO usuarios_master ({$columnSql}) VALUES ({$placeholders})")
                    ->execute($values);
                $savedId = (int)$master->lastInsertId();
                self::audit($auth, 'CREAR_USUARIO', $savedId, null, [
                    'usuario' => $username,
                    'email' => $email,
                    'rol' => $role,
                    'activo' => true,
                ]);
                return [
                    'creado' => true,
                    'usuario' => self::publicUser($savedId, $username, $email, $role, true, false),
                ];
            }

            $lock = $master->prepare(
                'SELECT idUsuarioMaster, usuario, rol, activo
                 FROM usuarios_master
                 WHERE idUsuarioMaster = ? AND idTenant = ?
                 FOR UPDATE'
            );
            $lock->execute([$id, $auth['id_tenant']]);
            $existing = $lock->fetch();
            if (!$existing) api_error('El usuario solicitado no existe.', 'USUARIO_NO_ENCONTRADO', 404);

            $isCurrent = $id === (int)$auth['id_usuario_master'];
            if ($isCurrent && $role !== (string)$existing['rol']) {
                api_error('No podés cambiar el rol de tu propia sesión.', 'USUARIO_ACTUAL_ROL', 409);
            }
            if (
                (string)$existing['rol'] === 'admin'
                && $role !== 'admin'
                && (bool)$existing['activo']
            ) {
                self::assertAnotherActiveAdmin($master, (int)$auth['id_tenant'], $id);
            }

            $sets = ['usuario = ?', 'rol = ?'];
            $values = [$username, $role];
            if ($schema['email'] !== null) {
                $sets[] = self::identifier($schema['email']) . ' = ?';
                $values[] = $email;
            }
            if ($password !== '') {
                $sets[] = 'hash_contrasena = ?';
                $values[] = password_hash($password, PASSWORD_DEFAULT);
            }
            $values[] = $id;
            $values[] = (int)$auth['id_tenant'];

            $master->prepare(
                'UPDATE usuarios_master SET ' . implode(', ', $sets) . '
                 WHERE idUsuarioMaster = ? AND idTenant = ?'
            )->execute($values);

            if ($password !== '') {
                if ($isCurrent) {
                    $master->prepare(
                        'UPDATE sesiones SET activo = 0
                         WHERE idUsuarioMaster = ? AND idSesion <> ?'
                    )->execute([$id, $auth['id_sesion']]);
                } else {
                    $master->prepare('UPDATE sesiones SET activo = 0 WHERE idUsuarioMaster = ?')
                        ->execute([$id]);
                }
            }

            self::audit($auth, 'EDITAR_USUARIO', $id, [
                'usuario' => (string)$existing['usuario'],
                'rol' => (string)$existing['rol'],
                'activo' => (bool)$existing['activo'],
            ], [
                'usuario' => $username,
                'email' => $email,
                'rol' => $role,
                'contrasena_modificada' => $password !== '',
            ]);

            return [
                'creado' => false,
                'usuario' => self::publicUser(
                    $id,
                    $username,
                    $email,
                    $role,
                    (bool)$existing['activo'],
                    $isCurrent
                ),
            ];
        });
    }

    private static function cambiarEstadoDatos(array $auth, array $body): array
    {
        $master = master_db();
        $id = positive_id($body['id'] ?? null, 'usuario');
        $active = filter_var($body['activo'] ?? null, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);
        if ($active === null) api_error('El estado indicado no es válido.', 'VALIDATION_ERROR');
        if ($id === (int)$auth['id_usuario_master'] && !$active) {
            api_error('No podés dar de baja tu propia sesión.', 'USUARIO_ACTUAL_BAJA', 409);
        }

        return transaction($master, static function () use ($master, $auth, $id, $active): array {
            $lock = $master->prepare(
                'SELECT idUsuarioMaster, usuario, rol, activo
                 FROM usuarios_master
                 WHERE idUsuarioMaster = ? AND idTenant = ?
                 FOR UPDATE'
            );
            $lock->execute([$id, $auth['id_tenant']]);
            $user = $lock->fetch();
            if (!$user) api_error('El usuario solicitado no existe.', 'USUARIO_NO_ENCONTRADO', 404);

            if (!$active && (string)$user['rol'] === 'admin' && (bool)$user['activo']) {
                self::assertAnotherActiveAdmin($master, (int)$auth['id_tenant'], $id);
            }

            $master->prepare(
                'UPDATE usuarios_master SET activo = ?
                 WHERE idUsuarioMaster = ? AND idTenant = ?'
            )->execute([$active ? 1 : 0, $id, $auth['id_tenant']]);

            if (!$active) {
                $master->prepare('UPDATE sesiones SET activo = 0 WHERE idUsuarioMaster = ?')
                    ->execute([$id]);
            }

            self::audit(
                $auth,
                $active ? 'REACTIVAR_USUARIO' : 'DAR_BAJA_USUARIO',
                $id,
                ['activo' => (bool)$user['activo']],
                ['activo' => $active]
            );

            return ['id' => $id, 'activo' => $active];
        });
    }

    private static function eliminarDatos(array $auth, array $body): array
    {
        $master = master_db();
        $id = positive_id($body['id'] ?? null, 'usuario');
        if ($id === (int)$auth['id_usuario_master']) {
            api_error('No podés eliminar tu propia sesión.', 'USUARIO_ACTUAL_ELIMINAR', 409);
        }

        return transaction($master, static function () use ($master, $auth, $id): array {
            $lock = $master->prepare(
                'SELECT idUsuarioMaster, usuario, rol, activo
                 FROM usuarios_master
                 WHERE idUsuarioMaster = ? AND idTenant = ?
                 FOR UPDATE'
            );
            $lock->execute([$id, $auth['id_tenant']]);
            $user = $lock->fetch();
            if (!$user) api_error('El usuario solicitado no existe.', 'USUARIO_NO_ENCONTRADO', 404);

            if ((string)$user['rol'] === 'admin' && (bool)$user['activo']) {
                self::assertAnotherActiveAdmin($master, (int)$auth['id_tenant'], $id);
            }

            $schema = self::schema($master);
            $accessesSql = $schema['login_auditoria']
                ? '(SELECT COUNT(*) FROM login_auditoria WHERE idUsuarioMaster = ?)'
                : '0';
            $usage = $master->prepare(
                "SELECT
                    (SELECT COUNT(*) FROM sesiones WHERE idUsuarioMaster = ?) AS sesiones,
                    {$accessesSql} AS accesos"
            );
            $usageParams = $schema['login_auditoria'] ? [$id, $id] : [$id];
            $usage->execute($usageParams);
            $counts = $usage->fetch() ?: ['sesiones' => 0, 'accesos' => 0];
            if ((int)$counts['sesiones'] > 0 || (int)$counts['accesos'] > 0) {
                api_error(
                    'El usuario tiene historial de accesos y no se puede eliminar. Podés darlo de baja para conservar la auditoría.',
                    'USUARIO_CON_HISTORIAL',
                    409
                );
            }

            $master->prepare(
                'DELETE FROM usuarios_master WHERE idUsuarioMaster = ? AND idTenant = ?'
            )->execute([$id, $auth['id_tenant']]);

            self::audit($auth, 'ELIMINAR_USUARIO', $id, [
                'usuario' => (string)$user['usuario'],
                'rol' => (string)$user['rol'],
                'activo' => (bool)$user['activo'],
            ], null);

            return ['id' => $id];
        });
    }

    private static function schema(PDO $master): array
    {
        static $cache = null;
        if (is_array($cache)) return $cache;

        $columns = $master->query(
            "SELECT COLUMN_NAME
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios_master'"
        )->fetchAll(PDO::FETCH_COLUMN);
        $tables = $master->query(
            "SELECT TABLE_NAME
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE()"
        )->fetchAll(PDO::FETCH_COLUMN);
        $tableLookup = array_fill_keys(array_map('strtolower', $tables), true);
        $lookup = array_fill_keys(array_map('strtolower', $columns), true);

        $pick = static function (array $candidates) use ($lookup): ?string {
            foreach ($candidates as $candidate) {
                if (isset($lookup[strtolower($candidate)])) return $candidate;
            }
            return null;
        };

        return $cache = [
            'email' => $pick(['email', 'correo']),
            'created_at' => $pick(['created_at', 'creado_en', 'fecha_creacion', 'fecha_alta']),
            'login_auditoria' => isset($tableLookup['login_auditoria']),
        ];
    }

    private static function identifier(string $name): string
    {
        if (!preg_match('/^[A-Za-z0-9_]+$/', $name)) {
            throw new RuntimeException('Identificador SQL no válido.');
        }
        return '`' . $name . '`';
    }

    private static function optionalId(mixed $value): ?int
    {
        if ($value === null || $value === '') return null;
        return positive_id($value, 'usuario');
    }

    private static function username(mixed $value): string
    {
        $username = clean_text($value, 100, false);
        if ($username === '') api_error('El usuario es obligatorio.', 'VALIDATION_ERROR');
        $length = function_exists('mb_strlen') ? mb_strlen($username, 'UTF-8') : strlen($username);
        if ($length < 3) api_error('El usuario debe tener al menos 3 caracteres.', 'VALIDATION_ERROR');
        if (!preg_match('/^[\p{L}\p{N}._@-]+$/u', $username)) {
            api_error('El usuario solo puede contener letras, números, punto, guion, guion bajo o arroba.', 'VALIDATION_ERROR');
        }
        return $username;
    }

    private static function email(mixed $value): ?string
    {
        $email = optional_text($value, 190, false);
        if ($email !== null && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            api_error('El email ingresado no es válido.', 'VALIDATION_ERROR');
        }
        return $email;
    }

    private static function role(mixed $value): string
    {
        $role = clean_text($value, 20, false);
        if (!in_array($role, self::ROLES, true)) {
            api_error('El rol indicado no es válido.', 'VALIDATION_ERROR');
        }
        return $role;
    }

    private static function validatePassword(string $password, string $confirmation): void
    {
        $length = strlen($password);
        if ($length < 8 || $length > 128) {
            api_error('La contraseña debe tener entre 8 y 128 caracteres.', 'VALIDATION_ERROR');
        }
        if ($password !== $confirmation) {
            api_error('Las contraseñas no coinciden.', 'VALIDATION_ERROR');
        }
    }

    private static function assertUniqueUsername(PDO $master, int $tenantId, string $username, ?int $excludeId): void
    {
        $sql = 'SELECT idUsuarioMaster FROM usuarios_master WHERE idTenant = ? AND usuario = ?';
        $params = [$tenantId, $username];
        if ($excludeId !== null) {
            $sql .= ' AND idUsuarioMaster <> ?';
            $params[] = $excludeId;
        }
        $sql .= ' LIMIT 1';
        $statement = $master->prepare($sql);
        $statement->execute($params);
        if ($statement->fetchColumn()) {
            api_error('Ya existe un usuario con ese nombre en la organización.', 'USUARIO_DUPLICADO', 409);
        }
    }

    private static function assertUniqueEmail(PDO $master, array $schema, int $tenantId, ?string $email, ?int $excludeId): void
    {
        if ($email === null || $schema['email'] === null) return;
        $sql = 'SELECT idUsuarioMaster FROM usuarios_master WHERE idTenant = ? AND '
            . self::identifier($schema['email']) . ' = ?';
        $params = [$tenantId, $email];
        if ($excludeId !== null) {
            $sql .= ' AND idUsuarioMaster <> ?';
            $params[] = $excludeId;
        }
        $sql .= ' LIMIT 1';
        $statement = $master->prepare($sql);
        $statement->execute($params);
        if ($statement->fetchColumn()) {
            api_error('Ya existe un usuario con ese email en la organización.', 'EMAIL_DUPLICADO', 409);
        }
    }

    private static function assertAnotherActiveAdmin(PDO $master, int $tenantId, int $excludeId): void
    {
        $statement = $master->prepare(
            "SELECT COUNT(*) FROM usuarios_master
             WHERE idTenant = ? AND rol = 'admin' AND activo = 1 AND idUsuarioMaster <> ?"
        );
        $statement->execute([$tenantId, $excludeId]);
        if ((int)$statement->fetchColumn() === 0) {
            api_error(
                'La organización debe conservar al menos un administrador activo.',
                'ULTIMO_ADMIN_ACTIVO',
                409
            );
        }
    }

    private static function publicUser(
        int $id,
        string $username,
        ?string $email,
        string $role,
        bool $active,
        bool $current
    ): array {
        return [
            'id' => $id,
            'usuario' => $username,
            'email' => $email,
            'rol' => $role,
            'activo' => $active,
            'sesion_actual' => $current,
        ];
    }

    private static function audit(array $auth, string $action, int $id, mixed $before, mixed $after): void
    {
        try {
            audit_change(
                $auth['db'],
                $auth,
                'CONFIGURACION',
                $action,
                'usuarios_master',
                $id,
                'Se actualizó la configuración de usuarios.',
                $before,
                $after
            );
        } catch (Throwable $error) {
            error_log('No se pudo auditar la gestión de usuarios: ' . $error->getMessage());
        }
    }
}
