import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faTriangleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";

export default function ModuleFeedback({ type = "success", message, onClose }) {
  if (!message) return null;
  return (
    <div className={`entity-feedback entity-feedback--${type}`} role={type === "error" ? "alert" : "status"}>
      <FontAwesomeIcon icon={type === "error" ? faTriangleExclamation : faCircleCheck} />
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="Cerrar aviso"><FontAwesomeIcon icon={faXmark} /></button>
    </div>
  );
}
