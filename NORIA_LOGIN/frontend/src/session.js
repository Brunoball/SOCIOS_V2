export const SESSION_KEY = process.env.REACT_APP_SESSION_KEY || 'saas_central_session';
const REMEMBER_KEY = 'saas_central_remembered_account';

export function saveSession(data) {
  const session = {
    token: data.token,
    expira_en: data.expira_en,
    usuario: data.usuario,
    tenant: data.tenant,
    plan: data.plan,
    sistema: data.sistema,
    redirect_url: data.redirect_url,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (!session?.token) return null;
    if (session.expira_en && Date.parse(session.expira_en) <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveRememberedUser(usuario) {
  localStorage.setItem(REMEMBER_KEY, JSON.stringify({ usuario }));
}

export function clearRememberedUser() {
  localStorage.removeItem(REMEMBER_KEY);
}

export function getRememberedUser() {
  try {
    const data = JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null');
    return typeof data?.usuario === 'string' ? data.usuario : '';
  } catch {
    return '';
  }
}

function appendDevSessionFragment(target, session) {
  const destination = new URL(target, window.location.href);
  if (destination.origin === window.location.origin) return destination.toString();

  const params = new URLSearchParams(destination.hash.replace(/^#/, ''));
  params.set('saas_session', session.token);
  if (session.expira_en) params.set('saas_expira_en', session.expira_en);
  if (session.sistema?.codigo) params.set('saas_sistema', session.sistema.codigo);
  destination.hash = params.toString();
  return destination.toString();
}

export function goToSystem(session) {
  const target = session?.redirect_url || session?.sistema?.frontend_url;
  if (!target) throw new Error('La cuenta no tiene un sistema de destino configurado.');
  window.location.replace(appendDevSessionFragment(target, session));
}
