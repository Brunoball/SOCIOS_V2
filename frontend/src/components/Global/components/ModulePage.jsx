import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faRotateRight } from "@fortawesome/free-solid-svg-icons";

export function ModulePage({
  title,
  description,
  stats = [],
  filters = [],
  primaryActionLabel = "Nuevo registro",
  onPrimaryAction,
  onRefresh,
  canCreate = true,
  refreshing = false,
  children,
  notice,
}) {
  return (
    <section className="mov-page module-page">
      <header className="module-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="module-header__actions">
          {onRefresh ? (
            <button type="button" className="mov-btn mov-btn--ghost" onClick={onRefresh} disabled={refreshing}>
              <FontAwesomeIcon icon={faRotateRight} />
              {refreshing ? "Actualizando..." : "Actualizar"}
            </button>
          ) : null}
          {canCreate ? (
            <button type="button" className="mov-btn mov-btn--primary" onClick={onPrimaryAction} disabled={!onPrimaryAction}>
              <FontAwesomeIcon icon={faPlus} />
              {primaryActionLabel}
            </button>
          ) : null}
        </div>
      </header>

      {notice ? <div className="module-notice">{notice}</div> : null}

      {stats.length ? (
        <section className="module-stats" aria-label={`Resumen de ${title}`}>
          {stats.map((stat) => (
            <article className="module-stat" key={stat.label}>
              <span className="module-stat__icon">
                <FontAwesomeIcon icon={stat.icon} />
              </span>
              <div>
                <small>{stat.label}</small>
                <strong>{stat.value}</strong>
                <p>{stat.detail}</p>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <article className="mov-card module-card">
        {filters.length ? (
          <div className="mov-card__head module-card__head">
            <div className="module-filters">
              {filters.map((filter) => (
              <label className={filter.type === "search" ? "mov-search" : "mov-filter"} key={filter.key || filter.label}>
                <span>{filter.label}</span>
                {filter.type === "select" ? (
                  <select value={filter.value ?? ""} onChange={(event) => filter.onChange?.(event.target.value)}>
                    <option value="">{filter.placeholder || "Todos"}</option>
                    {(filter.options || []).map((option) => (
                      <option key={typeof option === "object" ? option.value : option} value={typeof option === "object" ? option.value : option}>
                        {typeof option === "object" ? option.label : option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input type="search" value={filter.value ?? ""} onChange={(event) => filter.onChange?.(event.target.value)} placeholder={filter.placeholder || "Buscar..."} />
                )}
              </label>
              ))}
            </div>
          </div>
        ) : null}
        {children}
      </article>
    </section>
  );
}
