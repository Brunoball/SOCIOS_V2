<?php
declare(strict_types=1);

/**
 * Garantiza que las tablas propias del módulo Contable existan en el tenant.
 * Se ejecuta una sola vez por conexión PDO y usa CREATE TABLE IF NOT EXISTS,
 * por lo que también sirve para instalaciones donde la migración aún no fue aplicada.
 */
function ensure_contable_schema(PDO $db): void
{
    static $ensuredConnections = [];
    $connectionId = spl_object_id($db);
    if (isset($ensuredConnections[$connectionId])) return;

    $statements = [
        "CREATE TABLE IF NOT EXISTS `contable_opciones` (
          `id_opcion` int unsigned NOT NULL AUTO_INCREMENT,
          `tipo` enum('PROVEEDOR','CATEGORIA_INGRESO','CONCEPTO_INGRESO','CATEGORIA_EGRESO','CONCEPTO_EGRESO')
            CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
          `nombre` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
          `activo` tinyint(1) NOT NULL DEFAULT 1,
          `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (`id_opcion`),
          UNIQUE KEY `uq_contable_opciones_tipo_nombre` (`tipo`,`nombre`),
          KEY `idx_contable_opciones_tipo_activo` (`tipo`,`activo`,`nombre`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS `contable_ingresos` (
          `id_ingreso` bigint unsigned NOT NULL AUTO_INCREMENT,
          `fecha` date NOT NULL,
          `id_medio_pago` int unsigned NOT NULL,
          `id_proveedor` int unsigned NOT NULL,
          `id_categoria` int unsigned NOT NULL,
          `id_concepto` int unsigned NOT NULL,
          `importe` decimal(14,2) unsigned NOT NULL,
          `detalle` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
          `medio_pago_snapshot` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
          `proveedor_snapshot` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
          `categoria_snapshot` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
          `concepto_snapshot` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
          `estado` enum('ACTIVO','ANULADO') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVO',
          `id_usuario_master_creacion` int unsigned DEFAULT NULL,
          `id_usuario_master_modificacion` int unsigned DEFAULT NULL,
          `fecha_anulacion` datetime DEFAULT NULL,
          `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (`id_ingreso`),
          KEY `idx_contable_ingresos_fecha_estado` (`fecha`,`estado`),
          KEY `idx_contable_ingresos_medio` (`id_medio_pago`),
          KEY `idx_contable_ingresos_proveedor` (`id_proveedor`),
          KEY `idx_contable_ingresos_categoria` (`id_categoria`),
          KEY `idx_contable_ingresos_concepto` (`id_concepto`),
          CONSTRAINT `fk_contable_ingresos_medio` FOREIGN KEY (`id_medio_pago`) REFERENCES `medios_pago` (`id_medio_pago`) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT `fk_contable_ingresos_proveedor` FOREIGN KEY (`id_proveedor`) REFERENCES `contable_opciones` (`id_opcion`) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT `fk_contable_ingresos_categoria` FOREIGN KEY (`id_categoria`) REFERENCES `contable_opciones` (`id_opcion`) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT `fk_contable_ingresos_concepto` FOREIGN KEY (`id_concepto`) REFERENCES `contable_opciones` (`id_opcion`) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT `chk_contable_ingresos_importe` CHECK (`importe` > 0)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS `contable_egresos` (
          `id_egreso` bigint unsigned NOT NULL AUTO_INCREMENT,
          `fecha` date NOT NULL,
          `id_medio_pago` int unsigned NOT NULL,
          `id_proveedor` int unsigned NOT NULL,
          `id_categoria` int unsigned NOT NULL,
          `id_concepto` int unsigned NOT NULL,
          `numero_comprobante` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
          `importe` decimal(14,2) unsigned NOT NULL,
          `detalle` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
          `medio_pago_snapshot` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
          `proveedor_snapshot` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
          `categoria_snapshot` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
          `concepto_snapshot` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
          `archivo_nombre_original` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
          `archivo_nombre_guardado` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
          `archivo_mime` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
          `archivo_tamanio` int unsigned DEFAULT NULL,
          `archivo_path` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
          `estado` enum('ACTIVO','ANULADO') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVO',
          `id_usuario_master_creacion` int unsigned DEFAULT NULL,
          `id_usuario_master_modificacion` int unsigned DEFAULT NULL,
          `fecha_anulacion` datetime DEFAULT NULL,
          `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (`id_egreso`),
          KEY `idx_contable_egresos_fecha_estado` (`fecha`,`estado`),
          KEY `idx_contable_egresos_medio` (`id_medio_pago`),
          KEY `idx_contable_egresos_proveedor` (`id_proveedor`),
          KEY `idx_contable_egresos_categoria` (`id_categoria`),
          KEY `idx_contable_egresos_concepto` (`id_concepto`),
          CONSTRAINT `fk_contable_egresos_medio` FOREIGN KEY (`id_medio_pago`) REFERENCES `medios_pago` (`id_medio_pago`) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT `fk_contable_egresos_proveedor` FOREIGN KEY (`id_proveedor`) REFERENCES `contable_opciones` (`id_opcion`) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT `fk_contable_egresos_categoria` FOREIGN KEY (`id_categoria`) REFERENCES `contable_opciones` (`id_opcion`) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT `fk_contable_egresos_concepto` FOREIGN KEY (`id_concepto`) REFERENCES `contable_opciones` (`id_opcion`) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT `chk_contable_egresos_importe` CHECK (`importe` > 0)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ];

    try {
        foreach ($statements as $sql) $db->exec($sql);
    } catch (Throwable $error) {
        throw new RuntimeException(
            'No se pudo preparar la estructura del módulo Contable. Ejecutá la migración SQL incluida en el ZIP. Detalle: ' . $error->getMessage(),
            0,
            $error
        );
    }

    $ensuredConnections[$connectionId] = true;
}
