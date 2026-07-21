import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendDown,
  faArrowTrendUp,
  faCalendarDays,
  faChartColumn,
  faCircleCheck,
  faReceipt,
  faRotateRight,
  faTags,
  faTriangleExclamation,
  faUsers,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import { dashboardApi } from "./api/dashboardApi";
import "./Dashboard.css";

const money = (value) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return "";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return String(value);
  return new Intl.DateTimeFormat("es-AR").format(new Date(year, month - 1, day));
};

const EMPTY = {
  periodo: {},
  socios: {},
  familias: {},
  categorias: {},
  contable: {},
  estado: {},
  serie: [],
  movimientos_recientes: [],
};

function MetricCard({ icon, title, value, subtitle, tone = "default" }) {
  return (
    <article className={`admin-dashboard__metric is-${tone}`}>
      <div className="admin-dashboard__metricIcon">
        <FontAwesomeIcon icon={icon} />
      </div>
      <div className="admin-dashboard__metricBody">
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{subtitle}</small>
      </div>
    </article>
  );
}

function ProgressItem({ icon, label, value, detail }) {
  const normalized = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <article className="admin-dashboard__progressItem">
      <div className="admin-dashboard__progressHead">
        <span>
          <FontAwesomeIcon icon={icon} />
          {label}
        </span>
        <strong>{normalized}%</strong>
      </div>
      <div className="admin-dashboard__progressTrack" aria-label={`${label}: ${normalized}%`}>
        <i style={{ width: `${normalized}%` }} />
      </div>
      <small>{detail}</small>
    </article>
  );
}

function Chart({ items }) {
  const maximum = useMemo(
    () =>
      Math.max(
        1,
        ...items.flatMap((item) => [Number(item.ingresos || 0), Number(item.egresos || 0)]),
      ),
    [items],
  );

  return (
    <div className="admin-dashboard__chart" role="img" aria-label="Ingresos y egresos de los últimos seis meses">
      <div className="admin-dashboard__chartGrid" aria-hidden="true">
        <i /><i /><i /><i />
      </div>
      <div className="admin-dashboard__chartColumns">
        {items.map((item) => {
          const incomeValue = Number(item.ingresos || 0);
          const expenseValue = Number(item.egresos || 0);
          const incomeHeight = incomeValue > 0 ? Math.max(3, (incomeValue / maximum) * 100) : 0;
          const expenseHeight = expenseValue > 0 ? Math.max(3, (expenseValue / maximum) * 100) : 0;
          return (
            <div className="admin-dashboard__chartMonth" key={item.periodo}>
              <div className="admin-dashboard__bars">
                <i
                  className="is-income"
                  style={{ height: `${incomeHeight}%` }}
                  title={`Ingresos: ${money(item.ingresos)}`}
                />
                <i
                  className="is-expense"
                  style={{ height: `${expenseHeight}%` }}
                  title={`Egresos: ${money(item.egresos)}`}
                />
              </div>
              <strong>{item.etiqueta}</strong>
              <small>{String(item.anio || "").slice(-2)}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecentMovements({ items }) {
  if (!items.length) {
    return (
      <div className="admin-dashboard__empty">
        <FontAwesomeIcon icon={faReceipt} />
        <strong>Sin movimientos registrados</strong>
        <span>Los cobros, ingresos y egresos aparecerán acá.</span>
      </div>
    );
  }

  return (
    <div className="admin-dashboard__movements">
      {items.map((item, index) => {
        const expense = item.tipo === "EGRESO";
        return (
          <article className="admin-dashboard__movement" key={`${item.tipo}-${item.fecha}-${index}`}>
            <span className={`admin-dashboard__movementIcon ${expense ? "is-expense" : "is-income"}`}>
              <FontAwesomeIcon icon={expense ? faArrowTrendDown : faArrowTrendUp} />
            </span>
            <div>
              <strong>{item.titulo}</strong>
              <small>{item.detalle || "Movimiento contable"}</small>
            </div>
            <time>{formatDate(item.fecha)}</time>
            <b className={expense ? "is-negative" : "is-positive"}>
              {expense ? "−" : "+"} {money(item.importe)}
            </b>
          </article>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    dashboardApi
      .resumen({ signal: controller.signal })
      .then((response) => setSummary(response.resumen || EMPTY))
      .catch((requestError) => {
        if (requestError?.name !== "AbortError") {
          setError(requestError?.message || "No se pudo cargar el panel de administración.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const { socios, familias, categorias, contable, estado, periodo } = summary;
  const balance = Number(contable.saldo_mes || 0);
  const complete = Boolean(estado.configuracion_completa);
  const pendingConfig = estado.configuracion_pendientes || [];

  const statusItems = [
    {
      icon: faUsers,
      label: "Socios con familia",
      value: estado.socios_con_familia,
      detail: `${Number(socios.con_familia || 0)} de ${Number(socios.activos || 0)} socios activos`,
    },
    {
      icon: faTags,
      label: "Socios con categoría",
      value: estado.socios_con_categoria,
      detail: `${Number(socios.con_categoria || 0)} socios con al menos una categoría activa`,
    },
    {
      icon: faChartColumn,
      label: "Categorías con socios",
      value: estado.categorias_con_socios,
      detail: `${Number(categorias.con_socios || 0)} de ${Number(categorias.activas || 0)} categorías activas`,
    },
    {
      icon: complete ? faCircleCheck : faTriangleExclamation,
      label: "Configuración contable",
      value: estado.configuracion_contable,
      detail: complete
        ? "Listas y medios de pago listos para operar"
        : `${pendingConfig.length} lista${pendingConfig.length === 1 ? "" : "s"} pendiente${pendingConfig.length === 1 ? "" : "s"}`,
    },
  ];

  return (
    <section className="admin-dashboard">
      <header className="admin-dashboard__header">
        <div>
          <span className="admin-dashboard__eyebrow">Administración</span>
          <h1>Panel de Gestión de Socios</h1>
          <p>Resumen operativo de socios, categorías, cobranzas y contabilidad.</p>
        </div>
        <div className="admin-dashboard__period">
          <FontAwesomeIcon icon={faCalendarDays} />
          <span>{periodo.mes_nombre || "MES ACTUAL"}</span>
          <strong>{periodo.anio || new Date().getFullYear()}</strong>
        </div>
      </header>

      {error ? (
        <div className="admin-dashboard__error" role="alert">
          <div>
            <strong>No se pudo cargar el dashboard</strong>
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
            <FontAwesomeIcon icon={faRotateRight} /> Reintentar
          </button>
        </div>
      ) : null}

      <div className={`admin-dashboard__body ${loading ? "is-loading" : ""}`}>
        <section className="admin-dashboard__metrics">
          <MetricCard
            icon={faUsers}
            title="Socios activos"
            value={Number(socios.activos || 0)}
            subtitle={`${Number(socios.altas_mes || 0)} alta${Number(socios.altas_mes || 0) === 1 ? "" : "s"} este mes`}
          />
          <MetricCard
            icon={faTags}
            title="Familias activas"
            value={Number(familias.activas || 0)}
            subtitle={`${Number(socios.sin_familia || 0)} socio${Number(socios.sin_familia || 0) === 1 ? "" : "s"} sin familia`}
          />
          <MetricCard
            icon={faArrowTrendUp}
            title="Ingresos del mes"
            value={money(contable.ingresos_mes)}
            subtitle={`${Number(contable.operaciones_cobro_mes || 0)} operación${Number(contable.operaciones_cobro_mes || 0) === 1 ? "" : "es"} de cobro`}
            tone="income"
          />
          <MetricCard
            icon={faWallet}
            title="Saldo del mes"
            value={money(contable.saldo_mes)}
            subtitle={`Egresos: ${money(contable.egresos_mes)}`}
            tone={balance < 0 ? "danger" : "balance"}
          />
        </section>

        <div className="admin-dashboard__mainGrid">
          <article className="admin-dashboard__panel admin-dashboard__panel--chart">
            <header className="admin-dashboard__panelHead">
              <div>
                <h2>Movimiento contable</h2>
                <p>Comparación de ingresos y egresos de los últimos seis meses.</p>
              </div>
              <div className="admin-dashboard__legend">
                <span><i className="is-income" /> Ingresos</span>
                <span><i className="is-expense" /> Egresos</span>
              </div>
            </header>
            <Chart items={summary.serie || []} />
          </article>

          <aside className="admin-dashboard__panel admin-dashboard__panel--status">
            <header className="admin-dashboard__panelHead admin-dashboard__panelHead--status">
              <div>
                <h2>Estado de la administración</h2>
                <p>Controles rápidos sobre la información principal.</p>
              </div>
              <span className={`admin-dashboard__statusChip ${complete ? "is-complete" : "is-pending"}`}>
                <FontAwesomeIcon icon={complete ? faCircleCheck : faTriangleExclamation} />
                {complete ? "Contable listo" : "Configuración pendiente"}
              </span>
            </header>
            <div className="admin-dashboard__progressList">
              {statusItems.map((item) => <ProgressItem key={item.label} {...item} />)}
            </div>
          </aside>
        </div>

        <div className="admin-dashboard__bottomGrid">
          <article className="admin-dashboard__panel admin-dashboard__panel--movements">
            <header className="admin-dashboard__panelHead">
              <div>
                <h2>Movimientos recientes</h2>
                <p>Últimos cobros, ingresos manuales y egresos registrados.</p>
              </div>
            </header>
            <RecentMovements items={summary.movimientos_recientes || []} />
          </article>

          <article className="admin-dashboard__panel admin-dashboard__panel--quick">
            <header className="admin-dashboard__panelHead">
              <div>
                <h2>Resumen del mes</h2>
                <p>Composición de los ingresos contabilizados.</p>
              </div>
            </header>
            <div className="admin-dashboard__quickRows">
              <p><span><FontAwesomeIcon icon={faReceipt} /> Cobros de socios</span><b>{money(contable.ingresos_socios_mes)}</b></p>
              <p><span><FontAwesomeIcon icon={faArrowTrendUp} /> Otros ingresos</span><b>{money(contable.otros_ingresos_mes)}</b></p>
              <p><span><FontAwesomeIcon icon={faArrowTrendDown} /> Egresos</span><b className="is-negative">{money(contable.egresos_mes)}</b></p>
              <p className="is-total"><span><FontAwesomeIcon icon={faWallet} /> Resultado</span><b className={balance < 0 ? "is-negative" : "is-positive"}>{money(contable.saldo_mes)}</b></p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
