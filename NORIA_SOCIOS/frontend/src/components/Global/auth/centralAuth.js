import { LOGIN_API_URL, LOGIN_FRONTEND_URL } from "../../../config/config";
import {
  EXPECTED_SYSTEM_CODE,
  bootstrapSessionFromHash,
  clearSession,
  getSession,
  mergeSession,
} from "./session";

function buildLoginApiUrl(action) {
  const url = new URL(LOGIN_API_URL, window.location.origin);
  url.searchParams.set("action", action);
  return url.toString();
}

async function centralRequest(action, { method = "GET", token } = {}) {
  const response = await fetch(buildLoginApiUrl(action), {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error("El LOGIN central devolvió una respuesta no válida.");
  }

  if (!response.ok || data?.exito === false || data?.ok === false) {
    const error = new Error(data?.mensaje || "No se pudo validar la sesión central.");
    error.status = response.status;
    error.code = data?.codigo;
    throw error;
  }

  return data;
}

function assertSociosSession(session) {
  const code = String(session?.sistema?.codigo || "").trim().toUpperCase();
  if (code !== EXPECTED_SYSTEM_CODE) {
    const error = new Error("La sesión pertenece a otro producto del SaaS.");
    error.code = "WRONG_SYSTEM";
    throw error;
  }
}

export function redirectToCentralLogin() {
  if (typeof window === "undefined") return;
  window.location.replace(LOGIN_FRONTEND_URL || "/");
}

export async function initializeCentralSession() {
  const imported = bootstrapSessionFromHash();
  const session = imported || getSession();
  if (!session?.token) {
    redirectToCentralLogin();
    return null;
  }

  try {
    const profile = await centralRequest("auth_current", { token: session.token });
    const merged = mergeSession(profile);
    assertSociosSession(merged);
    return merged;
  } catch (error) {
    clearSession();
    redirectToCentralLogin();
    return null;
  }
}

export async function logoutCentralSession() {
  const token = getSession()?.token;
  if (token) {
    try {
      await centralRequest("auth_logout", { method: "POST", token });
    } catch {
      // La sesión local se limpia igualmente si ya venció o el LOGIN no responde.
    }
  }
  clearSession();
  redirectToCentralLogin();
}

export function handleUnauthorizedSession() {
  clearSession();
  redirectToCentralLogin();
}
