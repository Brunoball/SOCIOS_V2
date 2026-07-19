import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars,
  faChartLine,
  faReceipt,
  faRightFromBracket,
  faTags,
  faUserCircle,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { clearSession, getSession } from "../Global/auth/session";
import { apiPost } from "../Global/api/apiClient";
import "./AppLayout.css";

const APP_NAME = "Gestión de Socios";

const NAV_ITEMS = [
  {
    key: "socios", label: "Socios", path: "/socios", icon: faUsers,
    children: [{ key: "familias", label: "Familias", path: "/socios/familias" }],
  },
  { key: "cuotas", label: "Cuotas", path: "/cuotas", icon: faReceipt },
  { key: "categorias", label: "Categorías", path: "/categorias", icon: faTags },
];

function LogoutModal({ open, onClose, onConfirm }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="pp-modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="pp-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="pp-modal__icon"><FontAwesomeIcon icon={faRightFromBracket} /></div>
        <h3 className="pp-modal__title">Confirmar cierre de sesión</h3>
        <p className="pp-modal__text">¿Estás seguro de que deseas salir del sistema?</p>
        <div className="pp-modal__actions">
          <button className="pp-btn pp-btn--ghost" type="button" onClick={onClose}>Cancelar</button>
          <button className="pp-btn pp-btn--danger" type="button" onClick={onConfirm}>Cerrar sesión</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = getSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const activeLabel = useMemo(() => {
    for (const item of NAV_ITEMS) {
      const child = item.children?.find((entry) => location.pathname === entry.path);
      if (child) return child.label;
      if (location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)) return item.label;
    }
    return "Socios";
  }, [location.pathname]);

  const logout = async () => {
    try {
      await apiPost("auth_logout", {});
    } catch {
      // El cierre local se completa aunque el servidor ya haya vencido la sesión.
    } finally {
      clearSession();
      navigate("/", { replace: true });
    }
  };

  return (
    <div className="pp-shell">
      <header className="mov-topbar">
        <div className="mov-topbar__left">
          <button className="pp-burger" type="button" onClick={() => setDrawerOpen(true)} aria-label="Abrir menú"><FontAwesomeIcon icon={faBars} /></button>
          <div className="mov-topbar__logo mov-topbar__appBrand">
            <span className="mov-topbar__appBrandMark"><FontAwesomeIcon icon={faUsers} /></span>
            <span>{APP_NAME}</span>
          </div>
        </div>
        <div className="mov-topbar__right">
          <div className="mov-topbar__section">{activeLabel}</div>
          <button className="mov-topbar__usericon" type="button" title={`${session?.usuario?.nombre || "Usuario"} · ${session?.usuario?.rol || ""}`}><FontAwesomeIcon icon={faUserCircle} /></button>
          <button className="pp-topbarLogout" type="button" onClick={() => setLogoutOpen(true)} title="Cerrar sesión"><FontAwesomeIcon icon={faRightFromBracket} /></button>
        </div>
      </header>

      <div className={`pp-drawerOverlay ${drawerOpen ? "is-open" : ""}`} onMouseDown={() => setDrawerOpen(false)} />
      <aside className={`pp-sidebar ${drawerOpen ? "is-drawerOpen" : ""}`}>
        <div className="pp-drawerHeader">
          <div className="pp-drawerBrand" onClick={() => navigate("/socios")} role="button" tabIndex={0}>
            <div className="pp-drawerBrand__mark"><FontAwesomeIcon icon={faChartLine} /></div>
            <div className="pp-drawerBrand__txt"><div className="pp-drawerBrand__t">{APP_NAME}</div><div className="pp-drawerBrand__s">Administración</div></div>
          </div>
          <button className="pp-drawerClose" type="button" onClick={() => setDrawerOpen(false)}><FontAwesomeIcon icon={faXmark} /></button>
        </div>

        <div className="pp-brand panel_contable" onClick={() => navigate("/socios")} role="button" tabIndex={0}>
          <div className="pp-brand__mark"><FontAwesomeIcon icon={faChartLine} /></div>
          <div className="pp-brand__text"><div className="pp-brand__title">{APP_NAME}</div><div className="pp-brand__subtitle">Administración</div></div>
        </div>

        <nav className="pp-nav" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
            const groupOpen = Boolean(item.children && active);
            return (
              <div className={`pp-navGroup ${item.children ? "has-sub" : ""} ${groupOpen ? "is-open" : ""}`} key={item.key}>
                {item.children ? (
                  <NavLink className={`pp-nav__item ${active ? "is-active" : ""}`} to={item.path}>
                    <span className="pp-nav__icon"><FontAwesomeIcon icon={item.icon} /></span><span className="pp-nav__label">{item.label}</span>
                  </NavLink>
                ) : (
                  <NavLink className={({ isActive }) => `pp-nav__item ${isActive ? "is-active" : ""}`} to={item.path}>
                    <span className="pp-nav__icon"><FontAwesomeIcon icon={item.icon} /></span><span className="pp-nav__label">{item.label}</span>
                  </NavLink>
                )}
                {item.children && groupOpen ? (
                  <div className="pp-navSub">
                    {item.children.map((child) => (
                      <NavLink className={({ isActive }) => `pp-navSub__item ${isActive ? "is-active" : ""}`} to={child.path} key={child.key}>
                        <span className="pp-navSub__dot" /><span className="pp-navSub__label">{child.label}</span>
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </aside>

      <main className="pp-content"><div className="pp-content__inner"><Outlet /></div></main>
      <LogoutModal open={logoutOpen} onClose={() => setLogoutOpen(false)} onConfirm={logout} />
    </div>
  );
}
