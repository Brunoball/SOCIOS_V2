const SESSION_STORAGE_KEY = "gestion_socios_session";

function removeLegacyPersistentSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // El acceso al almacenamiento puede estar bloqueado por el navegador.
  }
}

function isExpired(session) {
  if (!session?.expira_en) return false;
  const expirationTime = Date.parse(session.expira_en);
  return Number.isFinite(expirationTime) && expirationTime <= Date.now();
}

export function getSession() {
  removeLegacyPersistentSession();

  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) || "null");
    if (isExpired(session)) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    clearSession();
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
  removeLegacyPersistentSession();
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // El cierre local continúa aunque el almacenamiento esté bloqueado.
  }
  removeLegacyPersistentSession();
}
