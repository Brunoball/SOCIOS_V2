import BASE_URL from "../../../config/config";
import { getSession } from "../auth/session";
import { handleUnauthorizedSession } from "../auth/centralAuth";

const normalizedBaseUrl = String(BASE_URL || "").trim().replace(/\/+$/, "");
const API_URL = /\/api\.php$/i.test(normalizedBaseUrl)
  ? normalizedBaseUrl
  : `${normalizedBaseUrl}/api.php`;

function buildUrl(action, params = {}) {
  const url = new URL(API_URL, window.location.origin);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function request(action, { method = "GET", params, body, signal } = {}) {
  const session = getSession();
  const response = await fetch(buildUrl(action, params), {
    method,
    signal,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const error = new Error("El backend devolvió una respuesta no válida.");
    error.status = response.status;
    throw error;
  }

  if (response.status === 401) {
    handleUnauthorizedSession();
  }

  if (!response.ok || data?.exito === false) {
    const error = new Error(data?.mensaje || "No se pudo completar la operación.");
    error.status = response.status;
    error.code = data?.codigo;
    error.data = data;
    throw error;
  }

  return data;
}

export const apiGet = (action, params, options = {}) =>
  request(action, { method: "GET", params, ...options });

export const apiPost = (action, body, options = {}) =>
  request(action, { method: "POST", body, ...options });

export const apiPut = (action, body, options = {}) =>
  request(action, { method: "PUT", body, ...options });

export const apiDelete = (action, body, options = {}) =>
  request(action, { method: "DELETE", body, ...options });

export async function apiFormPost(action, formData, options = {}) {
  const session = getSession();
  const response = await fetch(buildUrl(action, options.params || {}), {
    method: "POST",
    signal: options.signal,
    headers: {
      Accept: "application/json",
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: formData,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const error = new Error("El backend devolvió una respuesta no válida.");
    error.status = response.status;
    throw error;
  }

  if (response.status === 401) {
    handleUnauthorizedSession();
  }
  if (!response.ok || data?.exito === false) {
    const error = new Error(data?.mensaje || "No se pudo completar la operación.");
    error.status = response.status;
    error.code = data?.codigo;
    error.data = data;
    throw error;
  }
  return data;
}

export async function apiDownload(action, params = {}, options = {}) {
  const session = getSession();
  const response = await fetch(buildUrl(action, params), {
    method: "GET",
    signal: options.signal,
    headers: {
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
  });
  if (response.status === 401) {
    handleUnauthorizedSession();
  }
  if (!response.ok) {
    let message = "No se pudo descargar el archivo.";
    try {
      const data = await response.json();
      message = data?.mensaje || message;
    } catch {
      // La respuesta puede no ser JSON.
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response.blob();
}
