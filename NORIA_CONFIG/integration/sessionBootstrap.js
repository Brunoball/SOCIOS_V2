// Copiar/adaptar este helper en cada SPA (SOCIOS y COOPERADORA).
// Permite compartir la sesión si todas las apps están en el mismo origen y,
// durante desarrollo local con puertos distintos, importar el token desde el hash.

export const CENTRAL_SESSION_KEY =
  process.env.REACT_APP_CENTRAL_SESSION_KEY || 'saas_central_session';

export function bootstrapCentralSessionFromHash() {
  if (typeof window === 'undefined') return null;

  const rawHash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(rawHash);
  const token = params.get('saas_session');
  const expiraEn = params.get('saas_expira_en');
  const sistema = params.get('saas_sistema');

  if (token) {
    const session = { token, expira_en: expiraEn || null, sistema: sistema || null };
    sessionStorage.setItem(CENTRAL_SESSION_KEY, JSON.stringify(session));

    params.delete('saas_session');
    params.delete('saas_expira_en');
    params.delete('saas_sistema');
    const cleanHash = params.toString();
    window.history.replaceState(
      null,
      document.title,
      `${window.location.pathname}${window.location.search}${cleanHash ? `#${cleanHash}` : ''}`,
    );
    return session;
  }

  try {
    return JSON.parse(sessionStorage.getItem(CENTRAL_SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}
