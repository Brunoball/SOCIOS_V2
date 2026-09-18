export const SESSION_STORAGE_KEY =
  process.env.REACT_APP_CENTRAL_SESSION_KEY || "saas_central_session";

export const EXPECTED_SYSTEM_CODE = String(
  process.env.REACT_APP_EXPECTED_SYSTEM || "SOCIOS",
).trim().toUpperCase();

function readStoredSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

export function bootstrapSessionFromHash() {
  if (typeof window === "undefined") return null;

  const rawHash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(rawHash);
  const token = params.get("saas_session");
  const expiraEn = params.get("saas_expira_en");
  const sistema = params.get("saas_sistema");

  if (token) {
    const session = {
      token,
      expira_en: expiraEn || null,
      sistema: sistema ? { codigo: sistema } : null,
    };
    saveSession(session);

    params.delete("saas_session");
    params.delete("saas_expira_en");
    params.delete("saas_sistema");

    const cleanHash = params.toString();
    window.history.replaceState(
      null,
      document.title,
      `${window.location.pathname}${window.location.search}${cleanHash ? `#${cleanHash}` : ""}`,
    );
    return session;
  }

  return getSession();
}

export function getSession() {
  const session = readStoredSession();
  if (!session?.token) return null;

  if (session.expira_en) {
    const expiresAt = Date.parse(session.expira_en);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      clearSession();
      return null;
    }
  }

  return session;
}

export function isAuthenticated() {
  return Boolean(getSession()?.token);
}

export function canWrite() {
  return getSession()?.usuario?.rol === "admin";
}

export function saveSession(session) {
  if (!session?.token) return null;
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function mergeSession(data) {
  const current = getSession();
  if (!current?.token) return null;
  return saveSession({ ...current, ...data, token: current.token });
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // El cierre de sesión puede continuar aunque el navegador bloquee storage.
  }
}

function appPath(path) {
  const rawBase = String(process.env.REACT_APP_ROUTER_BASENAME || "/").trim();
  const base = !rawBase || rawBase === "/"
    ? ""
    : `/${rawBase.replace(/^\/+|\/+$/g, "")}`;
  const route = String(path || "/").startsWith("/") ? String(path || "/") : `/${path}`;
  return `${base}${route}` || "/";
}

export function openAuthenticatedTab(path) {
  const targetUrl = new URL(appPath(path), window.location.origin).toString();
  const newTab = window.open("about:blank", "_blank");
  if (!newTab) return false;

  try {
    const session = getSession();
    if (session?.token) {
      newTab.sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify(session),
      );
    }
    newTab.opener = null;
    newTab.location.replace(targetUrl);
  } catch {
    newTab.location.href = targetUrl;
  }

  return true;
}
