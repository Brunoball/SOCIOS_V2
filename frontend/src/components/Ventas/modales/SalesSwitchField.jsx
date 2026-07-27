import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faToggleOff, faToggleOn } from "@fortawesome/free-solid-svg-icons";

export default function SalesSwitchField({ checked, onChange, label, hint }) {
  return (
    <label className="sales-switch">
      <button
        type="button"
        className={checked ? "is-on" : ""}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
      >
        <FontAwesomeIcon icon={checked ? faToggleOn : faToggleOff} />
      </button>
      <span>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  );
}
