const SESSION_STORAGE_KEY = "gestion_socios_session";

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(getSession()?.token);
}

export function canWrite() {
  return getSession()?.usuario?.rol === "admin";
}

export function saveSession(session) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}
