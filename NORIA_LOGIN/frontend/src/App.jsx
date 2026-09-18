import React, { useEffect, useState } from 'react';
import { apiRequest } from './api';
import {
  clearRememberedUser,
  getRememberedUser,
  getSession,
  goToSystem,
  saveRememberedUser,
  saveSession,
} from './session';
import './styles.css';

export default function App() {
  const remembered = getRememberedUser();
  const [usuario, setUsuario] = useState(remembered);
  const [contrasena, setContrasena] = useState('');
  const [recordar, setRecordar] = useState(Boolean(remembered));
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const existing = getSession();
    if (!existing?.token) return;

    apiRequest('auth_current', { token: existing.token })
      .then((data) => {
        const refreshed = saveSession({ ...existing, ...data, token: existing.token });
        goToSystem(refreshed);
      })
      .catch(() => sessionStorage.removeItem(process.env.REACT_APP_SESSION_KEY || 'saas_central_session'));
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage('');
    try {
      const data = await apiRequest('auth_login', {
        method: 'POST',
        body: { usuario: usuario.trim(), contrasena },
      });
      const session = saveSession(data);
      if (recordar) saveRememberedUser(usuario.trim());
      else clearRememberedUser();
      goToSystem(session);
    } catch (error) {
      setMessage(error.message || 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="brand-panel" aria-label="Gestión institucional">
        <div className="brand-mark" aria-hidden="true">
          <span className="brand-dot dot-a" />
          <span className="brand-dot dot-b" />
          <span className="brand-dot dot-c" />
        </div>
        <div>
          <p className="eyebrow">PLATAFORMA CENTRAL</p>
          <h1>Gestión Institucional</h1>
          <p className="brand-copy">
            Un único acceso para ingresar automáticamente al sistema correspondiente a tu organización.
          </p>
          <div className="products" aria-label="Productos disponibles">
            <span>Gestión de Socios</span>
            <span>Gestión de Cooperadora</span>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="heading">
            <p className="eyebrow">ACCESO SEGURO</p>
            <h2>Iniciar sesión</h2>
            <p>Ingresá tus credenciales. El sistema abrirá automáticamente el producto asignado a tu cuenta.</p>
          </div>

          <label>
            <span>Usuario</span>
            <input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              maxLength={100}
              required
              autoFocus
            />
          </label>

          <label>
            <span>Contraseña</span>
            <div className="password-row">
              <input
                type={visible ? 'text' : 'password'}
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                autoComplete="current-password"
                maxLength={255}
                required
              />
              <button type="button" className="ghost-button" onClick={() => setVisible((v) => !v)}>
                {visible ? 'Ocultar' : 'Ver'}
              </button>
            </div>
          </label>

          <label className="remember-row">
            <input
              type="checkbox"
              checked={recordar}
              onChange={(e) => {
                setRecordar(e.target.checked);
                if (!e.target.checked) clearRememberedUser();
              }}
            />
            <span>Recordar usuario</span>
          </label>

          {message ? <div className="error-box" role="alert">{message}</div> : null}

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </section>
    </main>
  );
}
