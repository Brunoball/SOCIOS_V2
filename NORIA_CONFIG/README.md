# SAAS_CONFIG - configuración central única

La configuración de URLs funciona igual que BALTO: **se cambia una sola línea**.

```env
SAAS_ORIGIN=http://localhost
```

Luego ejecutar:

```powershell
cd C:\Users\USER\Desktop\SAAS\SAAS_CONFIG
.\SYNC_CONFIG.bat
```

o:

```powershell
node .\sync-env.cjs
```

## Destinos

### Local

Usar:

```env
SAAS_ORIGIN=http://localhost
```

Se derivan automáticamente:

- LOGIN frontend: `http://localhost:3010`
- LOGIN API: `http://localhost:3011/routes/api.php`
- SOCIOS frontend: `http://localhost:3000`
- SOCIOS API: `http://localhost:3001/routes/api.php`
- COOPERADORA frontend: `http://localhost:3002`
- COOPERADORA API: `http://localhost:3003/routes/api.php`

### Producción / servidor

Ejemplo:

```env
SAAS_ORIGIN=https://saas.tudominio.com
```

Se derivan automáticamente:

- LOGIN: `https://saas.tudominio.com/`
- LOGIN API: `https://saas.tudominio.com/SAAS_LOGIN/backend/routes/api.php`
- SOCIOS: `https://saas.tudominio.com/SAAS_SOCIOS`
- SOCIOS API: `https://saas.tudominio.com/SAAS_SOCIOS/backend/routes/api.php`
- COOPERADORA: `https://saas.tudominio.com/SAAS_COOPERADORA`
- COOPERADORA API: `https://saas.tudominio.com/SAAS_COOPERADORA/backend/routes/api.php`

## Qué sincroniza

`sync-env.cjs` actualiza automáticamente:

- `SAAS_LOGIN/backend/.env`
- `SAAS_LOGIN/frontend/.env`
- `SAAS_LOGIN/frontend/.env.production`
- `SAAS_LOGIN/frontend/.env.playwright`
- `SAAS_SOCIOS/backend/.env`
- `SAAS_SOCIOS/frontend/.env`
- `SAAS_SOCIOS/frontend/.env.production`
- `SAAS_SOCIOS/frontend/.env.playwright`
- los mismos archivos de `SAAS_COOPERADORA` cuando exista.

Las variables propias que ya existan (por ejemplo credenciales de base de datos o configuraciones específicas del producto) **se preservan**. Solamente se reemplazan las variables administradas por `SAAS_CONFIG`.

## LOGIN y MASTER

El LOGIN ya no depende de cambiar manualmente `sistemas_saas.frontend_url` cada vez que se cambia de entorno. Las URL generadas por `SAAS_CONFIG` se cargan en el backend del LOGIN y tienen prioridad en runtime. Las URL almacenadas en MASTER quedan como fallback.

## Testing

Cada ejecución genera `.env.playwright` con:

- `PW_BASE_URL`
- `PW_API_URL`
- `PW_LOGIN_URL`
- `PW_LOGIN_API_URL`
- `PW_EXPECTED_SYSTEM`

Por lo tanto, cambiando `SAAS_ORIGIN` y sincronizando, Playwright apunta al mismo entorno que el resto del sistema.

Para ver el destino sin modificar archivos:

```powershell
.\VER_DESTINO.bat
```

## SQL incluidos

Se conservan también los scripts de instalación/migración originales:

- `sql/01_master_multi_producto.sql`
- `sql/02_registrar_cooperadora_ejemplo.sql`
- `sql/03_urls_produccion_ejemplo.sql`
- `sql/04_verificacion.sql`

`01_master_multi_producto.sql` incluye manejo temporal de `SQL_SAFE_UPDATES` para evitar el bloqueo típico de MySQL Workbench durante la asignación inicial de tenants a `SOCIOS`.
