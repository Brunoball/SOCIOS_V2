import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export default function SummaryCards({
  ariaLabel,
  className = "",
  items = [],
  title = "Resumen",
  variant = "footer",
}) {
  if (!items.length) return null;

  return (
    <section
      className={`contable-summaryCards contable-summaryCards--${variant} ${className}`.trim()}
      aria-label={ariaLabel || title || "Resumen"}
    >
      {title ? (
        <strong className="contable-summaryCards__title">{title}</strong>
      ) : null}
      <div className="contable-summaryCards__list">
        {items.map((item) => (
          <article
            className={`contable-summaryCards__item ${item.tone ? `is-${item.tone}` : ""}`.trim()}
            key={item.key || item.label}
          >
            {item.icon ? (
              <span className="contable-summaryCards__icon" aria-hidden="true">
                <FontAwesomeIcon icon={item.icon} />
              </span>
            ) : null}
            <div className="contable-summaryCards__body">
              <span className="contable-summaryCards__label">
                {item.label}
              </span>
              <b className="contable-summaryCards__value">{item.value}</b>
              {item.detail ? (
                <small className="contable-summaryCards__detail">
                  {item.detail}
                </small>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
