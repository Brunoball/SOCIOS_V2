const API_URL = String(
  process.env.REACT_APP_LOGIN_API_URL || 'http://localhost:3011/routes/api.php',
).replace(/\/+$/, '');

export async function apiRequest(action, { method = 'GET', body, token } = {}) {
  const url = `${API_URL}?action=${encodeURIComponent(action)}`;
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error('El servidor devolvió una respuesta inválida.');
  }

  if (!response.ok || data?.exito === false || data?.ok === false) {
    const error = new Error(data?.mensaje || 'No se pudo completar la operación.');
    error.code = data?.codigo;
    error.details = data?.detalles;
    throw error;
  }
  return data;
}
