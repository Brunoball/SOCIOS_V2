import React from "react";
import Toast from "../Toast";

const TOAST_DURATION = {
  success: 2800,
  error: 4200,
  warning: 4200,
};

export default function ModuleFeedback({ type = "success", message, onClose }) {
  if (!message) return null;

  const toastType = type === "success" ? "exito" : type;

  return (
    <Toast
      tipo={toastType}
      mensaje={message}
      duracion={TOAST_DURATION[type] || 3200}
      onClose={onClose}
    />
  );
}
