import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers } from "@fortawesome/free-solid-svg-icons";
import { apiPost } from "../Global/api/apiClient";
import { saveSession } from "../Global/auth/session";
import "./inicio.css";

const APP_NAME = "Gestión de Socios";

export default function Inicio() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [visible, setVisible] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const ingresar = async (event) => {
    event.preventDefault();
    setMensaje("");
    setCargando(true);
    try {
      const data = await apiPost("auth_login", { usuario: usuario.trim(), contrasena });
      saveSession({
        token: data.token,
        expira_en: data.expira_en,
        usuario: data.usuario,
        tenant: data.tenant,
        plan: data.plan,
      });
      navigate("/panel", { replace: true });
    } catch (error) {
      setMensaje(error.message || "No se pudo iniciar sesión.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="ini_contenedor-principal">
      <main className="ini_login-shell" aria-label={`Acceso a ${APP_NAME}`}>
        <section className="ini_brand-panel">
          <div className="ini_brand-glow" aria-hidden="true" />
          <div className="ini_brand-content">
            <div className="ini_brand-logo--placeholder" aria-label={APP_NAME}>
              <div className="brand-mark"><FontAwesomeIcon icon={faUsers} /></div>
              <div className="brand-word"><strong>Socios</strong><span>GESTIÓN INTEGRAL</span></div>
            </div>
            <div className="ini_brand-copy">
              <h2>Administración simple y centralizada</h2>
              <p>Una base preparada para gestionar socios, familias, cuotas, categorías, contabilidad y comunicación por WhatsApp.</p>
            </div>
          </div>
        </section>

        <section className="ini_access-panel">
          <div className="ini_contenedor">
            <div className="ini_encabezado">
              <h1 className="ini_titulo">Iniciar sesión</h1>
              <p className="ini_subtitulo">Ingresá tus credenciales para continuar al panel.</p>
            </div>
            <form className="ini_formulario" onSubmit={ingresar}>
              <div className="ini_campo">
                <input className="ini_input" value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="Usuario" autoComplete="username" required maxLength={100} autoFocus />
              </div>
              <div className="ini_campo ini_campo-password">
                <input className="ini_input" type={visible ? "text" : "password"} value={contrasena} onChange={(e) => setContrasena(e.target.value)} placeholder="Contraseña" autoComplete="current-password" required maxLength={255} />
                <button type="button" className="ini_toggle-password" onClick={() => setVisible((value) => !value)} aria-label="Mostrar u ocultar contraseña">
                  {visible ? "×" : "●"}
                </button>
              </div>
              {mensaje ? <p className="ini_mensaje-error">{mensaje}</p> : null}
              <button className="ini_boton" type="submit" disabled={cargando}>{cargando ? "Ingresando..." : "Ingresar"}</button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
