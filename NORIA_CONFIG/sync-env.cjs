#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_DIR = __dirname;
const ROOT = path.resolve(CONFIG_DIR, '..');
const CENTRAL_FILE = path.join(CONFIG_DIR, 'saas.env');
const PREVIEW = process.argv.includes('--preview');
const QUIET = process.argv.includes('--quiet');

const APP_TIMEZONE = 'America/Argentina/Cordoba';
const SESSION_HOURS = '12';
const SESSION_KEY = 'saas_central_session';

const FRONTEND_MANAGED_KEYS = new Set([
  'REACT_APP_SAAS_ORIGIN',
  'REACT_APP_API_URL',
  'REACT_APP_LOGIN_URL',
  'REACT_APP_LOGIN_API_URL',
  'REACT_APP_EXPECTED_SYSTEM',
  'REACT_APP_CENTRAL_SESSION_KEY',
  'REACT_APP_SESSION_KEY',
  'REACT_APP_ROUTER_BASENAME',
  'PUBLIC_URL',
]);

const PLAYWRIGHT_MANAGED_KEYS = new Set([
  'PW_BASE_URL',
  'PW_API_URL',
  'PW_LOGIN_URL',
  'PW_LOGIN_API_URL',
  'PW_EXPECTED_SYSTEM',
]);

const LOGIN_BACKEND_MANAGED_KEYS = new Set([
  'APP_ENV',
  'APP_DEBUG',
  'APP_TIMEZONE',
  'SAAS_ORIGIN',
  'ALLOWED_ORIGINS',
  'ALLOWED_SYSTEM_CODES',
  'SESSION_HOURS',
  'LOGIN_FRONTEND_URL',
  'LOGIN_API_URL',
  'SOCIOS_FRONTEND_URL',
  'SOCIOS_API_URL',
  'COOPERADORA_FRONTEND_URL',
  'COOPERADORA_API_URL',
]);

const PRODUCT_BACKEND_MANAGED_KEYS = new Set([
  'APP_ENV',
  'APP_DEBUG',
  'APP_TIMEZONE',
  'SAAS_ORIGIN',
  'ALLOWED_ORIGINS',
  'EXPECTED_SYSTEM_CODE',
  'LOGIN_FRONTEND_URL',
  'LOGIN_API_URL',
]);

function log(message = '') {
  if (!QUIET) console.log(message);
}

function fail(message) {
  console.error(`\n[SAAS_CONFIG] ERROR: ${message}\n`);
  process.exit(1);
}

function readKeyValueFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

function normalizeOrigin(value) {
  let origin = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(origin)) {
    fail(`SAAS_ORIGIN debe comenzar con http:// o https://. Valor actual: ${JSON.stringify(value)}`);
  }
  try {
    const parsed = new URL(origin);
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
      fail(`SAAS_ORIGIN debe contener solamente protocolo + host, sin rutas. Valor actual: ${origin}`);
    }
    origin = `${parsed.protocol}//${parsed.host}`;
  } catch {
    fail(`SAAS_ORIGIN no es una URL valida: ${origin}`);
  }
  return origin;
}

function deriveUrls(origin) {
  const parsed = new URL(origin);
  const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname.toLowerCase());
  const protocol = parsed.protocol;
  const host = parsed.hostname;

  if (isLocal) {
    return {
      isLocal: true,
      origin,
      loginFrontend: `${protocol}//${host}:3010`,
      loginApi: `${protocol}//${host}:3011/routes/api.php`,
      sociosFrontend: `${protocol}//${host}:3000`,
      sociosApiBase: `${protocol}//${host}:3001/routes`,
      sociosApi: `${protocol}//${host}:3001/routes/api.php`,
      cooperadoraFrontend: `${protocol}//${host}:3002`,
      cooperadoraApiBase: `${protocol}//${host}:3003/routes`,
      cooperadoraApi: `${protocol}//${host}:3003/routes/api.php`,
      sociosBaseName: '/',
      cooperadoraBaseName: '/',
      loginBaseName: '/',
    };
  }

  return {
    isLocal: false,
    origin,
    loginFrontend: origin,
    loginApi: `${origin}/SAAS_LOGIN/backend/routes/api.php`,
    sociosFrontend: `${origin}/SAAS_SOCIOS`,
    sociosApiBase: `${origin}/SAAS_SOCIOS/backend/routes`,
    sociosApi: `${origin}/SAAS_SOCIOS/backend/routes/api.php`,
    cooperadoraFrontend: `${origin}/SAAS_COOPERADORA`,
    cooperadoraApiBase: `${origin}/SAAS_COOPERADORA/backend/routes`,
    cooperadoraApi: `${origin}/SAAS_COOPERADORA/backend/routes/api.php`,
    sociosBaseName: '/SAAS_SOCIOS',
    cooperadoraBaseName: '/SAAS_COOPERADORA',
    loginBaseName: '/',
  };
}

function getExtraAssignments(file, managedKeys) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const extras = [];
  const seen = new Set();

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=.*$/);
    if (!match) continue;
    const key = match[1];
    if (managedKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    extras.push(trimmed);
  }
  return extras;
}

function writeManagedEnv(file, managedEntries, managedKeys, options = {}) {
  const { createIfMissing = true, label = 'SAAS_CONFIG' } = options;
  if (!createIfMissing && !fs.existsSync(file)) return false;

  const extras = getExtraAssignments(file, managedKeys);
  const lines = [
    '# ============================================================',
    '# GENERADO AUTOMATICAMENTE POR SAAS_CONFIG/sync-env.cjs',
    '# NO EDITAR URLs A MANO. CAMBIAR SOLO: SAAS_CONFIG/saas.env',
    '# ============================================================',
    ...managedEntries.map(([key, value]) => `${key}=${value}`),
  ];

  if (extras.length) {
    lines.push('', '# Variables propias preservadas del archivo anterior:', ...extras);
  }
  lines.push('');

  if (!PREVIEW) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
  }
  log(`[SAAS_CONFIG] ${label}: ${PREVIEW ? 'PREVIEW' : 'OK'} -> ${path.relative(ROOT, file)}`);
  return true;
}

function existingDir(...parts) {
  const dir = path.join(ROOT, ...parts);
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory() ? dir : null;
}

function commonOrigins(urls) {
  return urls.isLocal
    ? [urls.loginFrontend, urls.sociosFrontend, urls.cooperadoraFrontend].join(',')
    : urls.origin;
}

function frontendEntries(app, urls, mode) {
  const production = mode === 'production';
  if (app === 'LOGIN') {
    return [
      ['REACT_APP_SAAS_ORIGIN', urls.origin],
      ['REACT_APP_LOGIN_API_URL', urls.loginApi],
      ['REACT_APP_SESSION_KEY', SESSION_KEY],
      ['REACT_APP_ROUTER_BASENAME', '/'],
      ...(production ? [['PUBLIC_URL', '/']] : []),
    ];
  }

  const isSocios = app === 'SOCIOS';
  const apiBase = isSocios ? urls.sociosApiBase : urls.cooperadoraApiBase;
  const basename = production
    ? (isSocios ? urls.sociosBaseName : urls.cooperadoraBaseName)
    : '/';

  return [
    ['REACT_APP_SAAS_ORIGIN', urls.origin],
    ['REACT_APP_LOGIN_URL', urls.loginFrontend],
    ['REACT_APP_LOGIN_API_URL', urls.loginApi],
    ['REACT_APP_API_URL', apiBase],
    ['REACT_APP_EXPECTED_SYSTEM', app],
    ['REACT_APP_CENTRAL_SESSION_KEY', SESSION_KEY],
    ['REACT_APP_ROUTER_BASENAME', basename],
    ...(production ? [['PUBLIC_URL', basename]] : []),
  ];
}

function playwrightEntries(app, urls) {
  if (app === 'LOGIN') {
    return [
      ['PW_BASE_URL', urls.loginFrontend],
      ['PW_API_URL', urls.loginApi],
      ['PW_LOGIN_URL', urls.loginFrontend],
      ['PW_LOGIN_API_URL', urls.loginApi],
      ['PW_EXPECTED_SYSTEM', 'LOGIN'],
    ];
  }
  const isSocios = app === 'SOCIOS';
  return [
    ['PW_BASE_URL', isSocios ? urls.sociosFrontend : urls.cooperadoraFrontend],
    ['PW_API_URL', isSocios ? urls.sociosApi : urls.cooperadoraApi],
    ['PW_LOGIN_URL', urls.loginFrontend],
    ['PW_LOGIN_API_URL', urls.loginApi],
    ['PW_EXPECTED_SYSTEM', app],
  ];
}

function loginBackendEntries(urls) {
  return [
    ['APP_ENV', urls.isLocal ? 'local' : 'production'],
    ['APP_DEBUG', urls.isLocal ? 'true' : 'false'],
    ['APP_TIMEZONE', APP_TIMEZONE],
    ['SAAS_ORIGIN', urls.origin],
    ['ALLOWED_ORIGINS', commonOrigins(urls)],
    ['ALLOWED_SYSTEM_CODES', 'SOCIOS,COOPERADORA'],
    ['SESSION_HOURS', SESSION_HOURS],
    ['LOGIN_FRONTEND_URL', urls.loginFrontend],
    ['LOGIN_API_URL', urls.loginApi],
    ['SOCIOS_FRONTEND_URL', urls.sociosFrontend],
    ['SOCIOS_API_URL', urls.sociosApi],
    ['COOPERADORA_FRONTEND_URL', urls.cooperadoraFrontend],
    ['COOPERADORA_API_URL', urls.cooperadoraApi],
  ];
}

function productBackendEntries(app, urls) {
  return [
    ['APP_ENV', urls.isLocal ? 'local' : 'production'],
    ['APP_DEBUG', urls.isLocal ? 'true' : 'false'],
    ['APP_TIMEZONE', APP_TIMEZONE],
    ['SAAS_ORIGIN', urls.origin],
    ['ALLOWED_ORIGINS', commonOrigins(urls)],
    ['EXPECTED_SYSTEM_CODE', app],
    ['LOGIN_FRONTEND_URL', urls.loginFrontend],
    ['LOGIN_API_URL', urls.loginApi],
  ];
}

function syncFrontend(app, folderName, urls) {
  const frontend = existingDir(folderName, 'frontend');
  if (!frontend) {
    log(`[SAAS_CONFIG] ${app} frontend: carpeta no encontrada, se omite.`);
    return;
  }

  writeManagedEnv(
    path.join(frontend, '.env'),
    frontendEntries(app, urls, 'development'),
    FRONTEND_MANAGED_KEYS,
    { label: `${app} frontend .env` },
  );
  writeManagedEnv(
    path.join(frontend, '.env.production'),
    frontendEntries(app, urls, 'production'),
    FRONTEND_MANAGED_KEYS,
    { label: `${app} frontend .env.production` },
  );
  writeManagedEnv(
    path.join(frontend, '.env.playwright'),
    playwrightEntries(app, urls),
    PLAYWRIGHT_MANAGED_KEYS,
    { label: `${app} Playwright` },
  );

  for (const name of ['.env.local', '.env.development.local', '.env.production.local']) {
    if (!fs.existsSync(path.join(frontend, name))) continue;
    const mode = name.includes('production') ? 'production' : 'development';
    writeManagedEnv(
      path.join(frontend, name),
      frontendEntries(app, urls, mode),
      FRONTEND_MANAGED_KEYS,
      { createIfMissing: false, label: `${app} ${name}` },
    );
  }
}

function syncBackend(app, folderName, urls) {
  const backend = existingDir(folderName, 'backend');
  if (!backend) {
    log(`[SAAS_CONFIG] ${app} backend: carpeta no encontrada, se omite.`);
    return;
  }

  const entries = app === 'LOGIN'
    ? loginBackendEntries(urls)
    : productBackendEntries(app, urls);
  const managedKeys = app === 'LOGIN'
    ? LOGIN_BACKEND_MANAGED_KEYS
    : PRODUCT_BACKEND_MANAGED_KEYS;

  writeManagedEnv(path.join(backend, '.env'), entries, managedKeys, {
    label: `${app} backend .env`,
  });
}

function printDestination(urls) {
  log('');
  log(`[SAAS_CONFIG] ORIGEN CENTRAL: ${urls.origin}`);
  log(`[SAAS_CONFIG] MODO: ${urls.isLocal ? 'LOCAL' : 'PRODUCCION/REMOTO'}`);
  log('');
  log('[SAAS_CONFIG] URLs derivadas:');
  log(`  LOGIN          ${urls.loginFrontend}`);
  log(`  LOGIN API      ${urls.loginApi}`);
  log(`  SOCIOS         ${urls.sociosFrontend}`);
  log(`  SOCIOS API     ${urls.sociosApi}`);
  log(`  COOPERADORA    ${urls.cooperadoraFrontend}`);
  log(`  COOPERADORA API ${urls.cooperadoraApi}`);
  log('');
}

function main() {
  if (!fs.existsSync(CENTRAL_FILE)) fail(`No existe ${CENTRAL_FILE}`);
  const central = readKeyValueFile(CENTRAL_FILE);
  const origin = normalizeOrigin(central.SAAS_ORIGIN);
  const urls = deriveUrls(origin);

  printDestination(urls);
  if (PREVIEW) return;

  syncBackend('LOGIN', 'SAAS_LOGIN', urls);
  syncFrontend('LOGIN', 'SAAS_LOGIN', urls);

  syncBackend('SOCIOS', 'SAAS_SOCIOS', urls);
  syncFrontend('SOCIOS', 'SAAS_SOCIOS', urls);

  syncBackend('COOPERADORA', 'SAAS_COOPERADORA', urls);
  syncFrontend('COOPERADORA', 'SAAS_COOPERADORA', urls);

  log('');
  log('[SAAS_CONFIG] LISTO. Para cambiar TODO el ecosistema, modifica solamente SAAS_ORIGIN y volve a ejecutar SYNC_CONFIG.bat.');
  log('[SAAS_CONFIG] Las credenciales/variables no administradas de los .env existentes se preservan.');
  log('');
}

main();
