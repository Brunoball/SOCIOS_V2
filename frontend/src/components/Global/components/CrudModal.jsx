import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import useAnimatedModalSize from "./useAnimatedModalSize";
import "../styles/Global_Modals.css";
import {
  configureModalField,
  configureModalFields,
  restrictModalField,
} from "../utils/modalFieldRules";

export default function CrudModal({
  open,
  title,
  subtitle,
  children,
  onClose,
  onSubmit,
  saving = false,
  submitLabel = "Guardar",
  danger = false,
  wide = false,
  hideSubmit = false,
  submitDisabled = false,
  hideCancel = false,
  cancelLabel = "Cancelar",
  footerStart = null,
  modalClassName = "",
}) {
  const overlayRef = useRef(null);
  const modalRef = useRef(null);
  useAnimatedModalSize(modalRef, open);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    const onKey = (event) => {
      if (event.key !== "Escape" || saving) return;
      const openModals = document.querySelectorAll("[data-global-modal-root]");
      const topModal = openModals[openModals.length - 1];
      if (topModal !== overlayRef.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose?.();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose, saving]);

  useEffect(() => {
    if (!open || !modalRef.current) return undefined;
    configureModalFields(modalRef.current);
    const observer = new MutationObserver(() => {
      configureModalFields(modalRef.current);
    });
    observer.observe(modalRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [open, children]);

  if (!open) return null;
  return createPortal(
    <div
      ref={overlayRef}
      className="entity-modal-overlay"
      role="presentation"
      data-global-modal-root
    >
      <div
        ref={modalRef}
        className={`entity-modal ${wide ? "entity-modal--wide" : ""} ${modalClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="entity-modal-title"
        onFocusCapture={(event) => configureModalField(event.target)}
        onChangeCapture={restrictModalField}
        onCompositionEndCapture={restrictModalField}
      >
        <header className="entity-modal__header">
          <div>
            <h2 id="entity-modal-title">{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button
            className="entity-modal__close"
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </header>
        <form onSubmit={onSubmit}>
          <div className="entity-modal__body">{children}</div>
          {footerStart || !hideCancel || !hideSubmit ? (
            <footer className="entity-modal__footer">
              {footerStart ? (
                <div className="entity-modal__footer-start">{footerStart}</div>
              ) : null}
              {!hideCancel ? (
                <button
                  className="mov-btn mov-btn--ghost"
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                >
                  {cancelLabel}
                </button>
              ) : null}
              {!hideSubmit ? (
                <button
                  className={`mov-btn ${danger ? "mov-btn--danger" : "mov-btn--primary"}`}
                  type="submit"
                  disabled={saving || submitDisabled}
                >
                  {saving ? "Guardando..." : submitLabel}
                </button>
              ) : null}
            </footer>
          ) : null}
        </form>
      </div>
    </div>,
    document.body,
  );
}
