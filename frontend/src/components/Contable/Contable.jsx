import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendDown,
  faArrowTrendUp,
  faChartPie,
  faEye,
  faFileExcel,
  faFileInvoiceDollar,
  faMagnifyingGlass,
  faPaperclip,
  faPen,
  faPlus,
  faTrashCan,
  faUsers,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import CrudModal from "../Global/components/CrudModal";
import ModalEliminarGlobal from "../Global/components/ModalEliminarGlobal";
import ModuleFeedback from "../Global/components/ModuleFeedback";
import { canWrite } from "../Global/auth/session";
import { contableApi } from "./api/contableApi";
import "./Contable.css";

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const CURRENT_MONTH = now.getMonth() + 1;
const MONTHS = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

const money = (value) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : "—";

const localDate = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};

const upper = (value) => String(value ?? "").toLocaleUpperCase("es-AR");

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>'"]/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#039;",
      '"': "&quot;",
    };
    return entities[character];
  });

function exportExcel(filename, headers, rows) {
  const table = `<table><thead><tr>${headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td>${escapeHtml(cell)}</td>`)
          .join("")}</tr>`,
    )
    .join("")}</tbody></table>`;
  const blob = new Blob(
    ["\ufeff", `<html><meta charset="utf-8"><body>${table}</body></html>`],
    { type: "application/vnd.ms-excel;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const emptyCatalogs = {
  opciones: {
    PROVEEDOR: [],
    CATEGORIA_INGRESO: [],
    CONCEPTO_INGRESO: [],
    CATEGORIA_EGRESO: [],
    CONCEPTO_EGRESO: [],
  },
  medios_pago: [],
  categorias_socios: [],
  anios: [CURRENT_YEAR],
};

const emptyIncomeForm = () => ({
  id_ingreso: "",
  fecha: localDate(),
  id_medio_pago: "",
  id_proveedor: "",
  id_categoria: "",
  id_concepto: "",
  importe: "",
  detalle: "",
});

const emptyExpenseForm = () => ({
  id_egreso: "",
  fecha: localDate(),
  id_medio_pago: "",
  id_proveedor: "",
  id_categoria: "",
  id_concepto: "",
  numero_comprobante: "",
  importe: "",
  detalle: "",
  archivo: null,
  archivo_nombre_original: "",
  eliminar_archivo: false,
});

function OptionSelect({
  label,
  value,
  options,
  optionType,
  onChange,
  onRequestCreate,
  required = true,
}) {
  return (
    <label className="ct-field">
      <span>{label}</span>
      <select
        value={value}
        required={required}
        onChange={(event) => {
          if (event.target.value === "__ADD__") {
            onRequestCreate(optionType, label, onChange);
            return;
          }
          onChange(event.target.value);
        }}
      >
        <option value="">SELECCIONE...</option>
        <option value="__ADD__">＋ AGREGAR NUEVA OPCIÓN</option>
        {(options || []).map((option) => (
          <option key={option.id_opcion} value={option.id_opcion}>
            {option.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}

function LoadingRows({ columns, loading, message = "No hay registros para mostrar." }) {
  return (
    <tr>
      <td className="ct-empty" colSpan={columns}>
        {loading ? "Cargando información contable..." : message}
      </td>
    </tr>
  );
}

function StatCard({ icon, label, value, detail, tone = "default" }) {
  return (
    <article className={`ct-stat ct-stat--${tone}`}>
      <span className="ct-stat__icon">
        <FontAwesomeIcon icon={icon} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
    </article>
  );
}

function Sidebar({
  year,
  month,
  years,
  onYear,
  onMonth,
  total,
  records,
  categories,
  category,
  categoryOptions,
  onCategory,
  medio,
  means,
  onMedio,
  showDetailFilters,
}) {
  return (
    <aside className="ct-sidebar">
      <div className="ct-sidebar__title">Filtros</div>
      <div className="ct-sidebar__filters">
        <label>
          <span>Año</span>
          <select value={year} onChange={(event) => onYear(event.target.value)}>
            {(years || [CURRENT_YEAR]).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Mes</span>
          <select value={month} onChange={(event) => onMonth(event.target.value)}>
            {MONTHS.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {showDetailFilters ? (
          <>
            <label>
              <span>Categoría</span>
              <select value={category} onChange={(event) => onCategory(event.target.value)}>
                <option value="">TODAS</option>
                {(categoryOptions || []).map((item) => (
                  <option
                    key={item.id_categoria ?? item.id_opcion}
                    value={item.id_categoria ?? item.id_opcion}
                  >
                    {item.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Medio de pago</span>
              <select value={medio} onChange={(event) => onMedio(event.target.value)}>
                <option value="">TODOS</option>
                {(means || []).map((item) => (
                  <option key={item.id_medio_pago} value={item.id_medio_pago}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>

      {total !== undefined ? (
        <div className="ct-sidebar__totals">
          <StatCard icon={faWallet} label="Total" value={money(total)} />
          <StatCard
            icon={faFileInvoiceDollar}
            label="Registros"
            value={String(records || 0)}
          />
        </div>
      ) : null}

      {categories?.length ? (
        <div className="ct-category-summary">
          <h3>Categorías</h3>
          <div className="ct-category-summary__list">
            {categories.map((item) => (
              <article key={item.nombre}>
                <strong>{item.nombre}</strong>
                <span>
                  {item.registros !== undefined ? `${item.registros} registros` : ""}
                </span>
                <b>{money(item.total)}</b>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function AccountingHeader() {
  return (
    <header className="ct-header">
      <div className="ct-header__identity">
        <span className="ct-header__mark">
          <FontAwesomeIcon icon={faWallet} />
        </span>
        <div>
          <h1>Contable</h1>
          <p>Gestión de ingresos, egresos y resumen financiero</p>
        </div>
      </div>
    </header>
  );
}

function SummaryView({ summary, loading, mode, setMode, month }) {
  const totals = summary?.totales || {};
  const income = Number(totals.ingresos || 0);
  const expenses = Number(totals.egresos || 0);
  const sum = income + expenses;
  const incomeDegrees = sum > 0 ? (income / sum) * 360 : 0;
  const selected = summary?.meses?.find((item) => Number(item.mes) === Number(month));
  const detail = summary?.detalle_mes || {};

  return (
    <section className="ct-summary">
      <div className="ct-summary__cards">
        <StatCard
          icon={faArrowTrendUp}
          label="Total ingresos"
          value={money(totals.ingresos)}
          detail={`${money(totals.ingresos_socios)} socios · ${money(totals.otros_ingresos)} otros`}
          tone="success"
        />
        <StatCard
          icon={faArrowTrendDown}
          label="Total egresos"
          value={money(totals.egresos)}
          tone="danger"
        />
        <StatCard
          icon={faWallet}
          label="Resultado"
          value={money(totals.resultado)}
          detail={Number(totals.resultado || 0) >= 0 ? "Balance positivo" : "Balance negativo"}
          tone={Number(totals.resultado || 0) >= 0 ? "success" : "danger"}
        />
      </div>

      <div className="ct-summary__mode">
        <button type="button" className={mode === "annual" ? "is-active" : ""} onClick={() => setMode("annual")}>
          Anual
        </button>
        <button type="button" className={mode === "monthly" ? "is-active" : ""} onClick={() => setMode("monthly")}>
          Mensual
        </button>
      </div>

      {loading ? <div className="ct-loading-panel">Calculando el resumen...</div> : null}

      {!loading && mode === "annual" ? (
        <div className="ct-summary__annual">
          <article className="ct-panel ct-chart-panel">
            <header><FontAwesomeIcon icon={faChartPie} /> Visualización anual</header>
            <div className="ct-donut-wrap">
              <div
                className="ct-donut"
                style={{
                  background: `conic-gradient(var(--balto-action) 0deg ${incomeDegrees}deg, var(--balto-midnight) ${incomeDegrees}deg 360deg)`,
                }}
              >
                <div>
                  <strong>{money(income - expenses)}</strong>
                  <span>Resultado</span>
                </div>
              </div>
              <div className="ct-legend">
                <span><i className="income" /> Ingresos <b>{money(income)}</b></span>
                <span><i className="expense" /> Egresos <b>{money(expenses)}</b></span>
              </div>
            </div>
          </article>

          <article className="ct-panel ct-month-table-panel">
            <header><FontAwesomeIcon icon={faFileInvoiceDollar} /> Resumen anual</header>
            <div className="ct-table-scroll">
              <table className="ct-table">
                <thead>
                  <tr><th>Mes</th><th>Ingresos</th><th>Egresos</th><th>Resultado</th></tr>
                </thead>
                <tbody>
                  {(summary?.meses || []).map((item) => (
                    <tr key={item.mes}>
                      <td>{item.nombre}</td>
                      <td>{money(item.ingresos)}</td>
                      <td>{money(item.egresos)}</td>
                      <td className={Number(item.resultado) >= 0 ? "ct-positive" : "ct-negative"}>
                        {money(item.resultado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      ) : null}

      {!loading && mode === "monthly" ? (
        <div className="ct-summary__monthly">
          <div className="ct-summary__cards ct-summary__cards--month">
            <StatCard icon={faUsers} label={`Socios · ${selected?.nombre || "Mes"}`} value={money(selected?.ingresos_socios)} />
            <StatCard icon={faArrowTrendUp} label="Otros ingresos" value={money(selected?.otros_ingresos)} />
            <StatCard icon={faArrowTrendDown} label="Egresos" value={money(selected?.egresos)} />
            <StatCard
              icon={faWallet}
              label="Resultado mensual"
              value={money(selected?.resultado)}
              tone={Number(selected?.resultado || 0) >= 0 ? "success" : "danger"}
            />
          </div>
          <div className="ct-breakdowns">
            <Breakdown title="Categorías de ingresos" items={detail.categorias_ingresos} />
            <Breakdown title="Categorías de egresos" items={detail.categorias_egresos} />
            <Breakdown title="Medios de cobro" items={detail.medios} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Breakdown({ title, items = [] }) {
  return (
    <article className="ct-panel ct-breakdown">
      <header>{title}</header>
      <div>
        {items.length ? items.map((item) => (
          <p key={item.nombre}><span>{item.nombre}</span><b>{money(item.total)}</b></p>
        )) : <p className="ct-breakdown__empty">Sin movimientos en el mes.</p>}
      </div>
    </article>
  );
}

export default function Contable() {
  const location = useLocation();
  const writable = canWrite();
  const view = location.pathname.endsWith("/ingresos")
    ? "income"
    : location.pathname.endsWith("/egresos")
      ? "expense"
      : "summary";

  const [catalogs, setCatalogs] = useState(emptyCatalogs);
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [month, setMonth] = useState(String(CURRENT_MONTH));
  const [summaryMode, setSummaryMode] = useState("annual");
  const [incomeTab, setIncomeTab] = useState("partners");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [mean, setMean] = useState("");
  const [data, setData] = useState({ items: [], resumen: {} });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [incomeForm, setIncomeForm] = useState(emptyIncomeForm());
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm());
  const [saving, setSaving] = useState(false);
  const [optionModal, setOptionModal] = useState(null);
  const [optionName, setOptionName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const requestId = useRef(0);

  const loadCatalogs = useCallback(async () => {
    const response = await contableApi.catalogos();
    setCatalogs({ ...emptyCatalogs, ...response, opciones: { ...emptyCatalogs.opciones, ...(response.opciones || {}) } });
    return response;
  }, []);

  useEffect(() => {
    loadCatalogs().catch((error) => setFeedback({ type: "error", message: error.message }));
  }, [loadCatalogs]);

  useEffect(() => {
    setCategory("");
    setMean("");
    setSearch("");
    // Evita mostrar datos de la pestaña anterior mientras se carga la nueva.
    // También garantiza que las filas de Socios siempre se rendericen con su clave propia.
    setData({ items: [], resumen: {} });
  }, [view, incomeTab]);

  const loadData = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      if (view === "summary") {
        const response = await contableApi.resumen({ anio: year, mes: month });
        if (requestId.current === currentRequest) setSummary(response.resumen || null);
      } else {
        const filters = { anio: year, mes: month, buscar: search, categoria: category, medio: mean };
        let response;
        if (view === "income" && incomeTab === "partners") response = await contableApi.ingresosSocios(filters);
        else if (view === "income") response = await contableApi.ingresos(filters);
        else response = await contableApi.egresos(filters);
        if (requestId.current === currentRequest) setData({ items: response.items || [], resumen: response.resumen || {} });
      }
    } catch (error) {
      if (requestId.current === currentRequest) setFeedback({ type: "error", message: error.message });
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [view, incomeTab, year, month, search, category, mean]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, search ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      requestId.current += 1;
    };
  }, [loadData, search]);

  const requestOption = (type, label, onCreated) => {
    setOptionName("");
    setOptionModal({ type, label, onCreated });
  };

  const saveOption = async (event) => {
    event.preventDefault();
    if (!optionModal) return;
    setSaving(true);
    try {
      const response = await contableApi.guardarOpcion({ tipo: optionModal.type, nombre: optionName });
      await loadCatalogs();
      optionModal.onCreated(String(response.item.id_opcion));
      setOptionModal(null);
      setFeedback({ type: "success", message: response.mensaje });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const openIncome = (item = null) => {
    setIncomeForm(item ? {
      id_ingreso: String(item.id_ingreso),
      fecha: item.fecha,
      id_medio_pago: String(item.id_medio_pago),
      id_proveedor: String(item.id_proveedor),
      id_categoria: String(item.id_categoria),
      id_concepto: String(item.id_concepto),
      importe: String(item.importe),
      detalle: item.detalle || "",
    } : emptyIncomeForm());
    setIncomeOpen(true);
  };

  const saveIncome = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await contableApi.guardarIngreso(incomeForm);
      setIncomeOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await Promise.all([loadData(), loadCatalogs()]);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const openExpense = (item = null) => {
    setExpenseForm(item ? {
      id_egreso: String(item.id_egreso),
      fecha: item.fecha,
      id_medio_pago: String(item.id_medio_pago),
      id_proveedor: String(item.id_proveedor),
      id_categoria: String(item.id_categoria),
      id_concepto: String(item.id_concepto),
      numero_comprobante: item.numero_comprobante || "",
      importe: String(item.importe),
      detalle: item.detalle || "",
      archivo: null,
      archivo_nombre_original: item.archivo_nombre_original || "",
      eliminar_archivo: false,
    } : emptyExpenseForm());
    setExpenseOpen(true);
  };

  const chooseFile = (file) => {
    if (!file) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      setFeedback({ type: "error", message: "Solo se permiten PDF, JPG, PNG, GIF o WEBP." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFeedback({ type: "error", message: "El archivo no puede superar los 10 MB." });
      return;
    }
    setExpenseForm((current) => ({ ...current, archivo: file, archivo_nombre_original: file.name, eliminar_archivo: false }));
  };

  const saveExpense = async (event) => {
    event.preventDefault();
    setSaving(true);
    const formData = new FormData();
    Object.entries(expenseForm).forEach(([key, value]) => {
      if (key === "archivo") return;
      formData.append(key, typeof value === "boolean" ? (value ? "1" : "0") : value ?? "");
    });
    if (expenseForm.archivo) formData.append("archivo", expenseForm.archivo);
    try {
      const response = await contableApi.guardarEgreso(formData);
      setExpenseOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await Promise.all([loadData(), loadCatalogs()]);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return { ok: false };
    const response = deleteTarget.type === "income"
      ? await contableApi.anularIngreso(deleteTarget.item.id_ingreso)
      : await contableApi.anularEgreso(deleteTarget.item.id_egreso);
    await loadData();
    setDeleteTarget(null);
    return response;
  };

  const viewFile = async (item) => {
    const popup = window.open("", "_blank");
    try {
      const blob = await contableApi.archivoEgreso(item.id_egreso);
      const url = URL.createObjectURL(blob);
      if (popup) popup.location.href = url;
      else window.open(url, "_blank");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      popup?.close();
      setFeedback({ type: "error", message: error.message });
    }
  };

  const categoryOptions = useMemo(() => {
    if (view === "income" && incomeTab === "partners") return catalogs.categorias_socios || [];
    if (view === "income") return catalogs.opciones.CATEGORIA_INGRESO || [];
    return catalogs.opciones.CATEGORIA_EGRESO || [];
  }, [catalogs, view, incomeTab]);

  const exportCurrent = () => {
    const items = data.items || [];
    if (view === "income" && incomeTab === "partners") {
      exportExcel(`ingresos_socios_${year}_${month}`, ["Fecha de cobro", "Socio", "DNI", "Categoría", "Modalidad", "Período pagado", "Medio", "Monto"], items.map((item) => [formatDate(item.fecha), item.socio, item.dni, item.categoria, item.modalidad, item.periodo, item.medio, item.monto]));
    } else if (view === "income") {
      exportExcel(`otros_ingresos_${year}_${month}`, ["Fecha", "Medio", "Proveedor / Persona", "Categoría", "Concepto", "Detalle", "Importe"], items.map((item) => [formatDate(item.fecha), item.medio, item.proveedor, item.categoria, item.concepto, item.detalle || "", item.importe]));
    } else {
      exportExcel(`egresos_${year}_${month}`, ["Fecha", "Categoría", "Comprobante", "Concepto", "Proveedor", "Medio", "Detalle", "Importe"], items.map((item) => [formatDate(item.fecha), item.categoria, item.numero_comprobante || "", item.concepto, item.proveedor, item.medio, item.detalle || "", item.importe]));
    }
  };

  const summaryCategories = data.resumen?.categorias || [];

  return (
    <div className="ct-module">
      <AccountingHeader />
      <div className="ct-body">
        <Sidebar
          year={year}
          month={month}
          years={catalogs.anios}
          onYear={setYear}
          onMonth={setMonth}
          total={view === "summary" ? undefined : data.resumen?.total}
          records={data.resumen?.registros}
          categories={view === "summary" ? [] : summaryCategories}
          category={category}
          categoryOptions={categoryOptions}
          onCategory={setCategory}
          medio={mean}
          means={catalogs.medios_pago}
          onMedio={setMean}
          showDetailFilters={view !== "summary"}
        />

        <main className="ct-main">
          {view === "summary" ? (
            <SummaryView summary={summary} loading={loading} mode={summaryMode} setMode={setSummaryMode} month={month} />
          ) : (
            <>
              <div className="ct-toolbar">
                <div className="ct-toolbar__left">
                  {view === "income" ? (
                    <div className="ct-tabs">
                      <button type="button" className={incomeTab === "partners" ? "is-active" : ""} onClick={() => setIncomeTab("partners")}>Socios</button>
                      <button type="button" className={incomeTab === "manual" ? "is-active" : ""} onClick={() => setIncomeTab("manual")}>Ingresos</button>
                    </div>
                  ) : <strong className="ct-section-label">Egresos</strong>}
                </div>
                <div className="ct-toolbar__actions">
                  <label className="ct-search">
                    <FontAwesomeIcon icon={faMagnifyingGlass} />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar..." />
                  </label>
                  <button type="button" className="ct-btn ct-btn--secondary" onClick={exportCurrent} disabled={!data.items?.length}>
                    <FontAwesomeIcon icon={faFileExcel} /> Exportar Excel
                  </button>
                  {writable && view === "income" && incomeTab === "manual" ? (
                    <button type="button" className="ct-btn ct-btn--primary" onClick={() => openIncome()}>
                      <FontAwesomeIcon icon={faPlus} /> Registrar ingreso
                    </button>
                  ) : null}
                  {writable && view === "expense" ? (
                    <button type="button" className="ct-btn ct-btn--primary" onClick={() => openExpense()}>
                      <FontAwesomeIcon icon={faPlus} /> Registrar egreso
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="ct-table-wrap">
                {view === "income" && incomeTab === "partners" ? (
                  <table className="ct-table">
                    <thead><tr><th>Fecha de cobro</th><th>Socio</th><th>Categoría</th><th>Concepto</th><th>Período pagado</th><th>Medio</th><th className="right">Monto</th></tr></thead>
                    <tbody>
                      {data.items?.length ? data.items.map((item, index) => (
                        <tr key={item.clave || `${item.origen || "COBRO"}-${item.id_registro || index}`}>
                          <td>{formatDate(item.fecha)}</td>
                          <td><strong>{item.socio}</strong><small>{item.dni}</small></td>
                          <td>{item.categoria}</td>
                          <td>{item.modalidad_codigo === "MENSUAL" ? "CUOTA MENSUAL" : item.modalidad}</td>
                          <td>{item.periodo}</td>
                          <td>{item.medio}</td>
                          <td className="right amount">{money(item.monto)}</td>
                        </tr>
                      )) : <LoadingRows columns={7} loading={loading} message="No hubo cobros de socios en el mes seleccionado." />}
                    </tbody>
                  </table>
                ) : null}

                {view === "income" && incomeTab === "manual" ? (
                  <table className="ct-table">
                    <thead><tr><th>Fecha</th><th>Medio</th><th>Persona / Proveedor</th><th>Categoría</th><th>Descripción / concepto</th><th className="right">Importe</th>{writable ? <th>Acciones</th> : null}</tr></thead>
                    <tbody>
                      {data.items?.length ? data.items.map((item) => (
                        <tr key={item.id_ingreso}>
                          <td>{formatDate(item.fecha)}</td><td>{item.medio}</td><td>{item.proveedor}</td><td>{item.categoria}</td>
                          <td><strong>{item.concepto}</strong>{item.detalle ? <small>{item.detalle}</small> : null}</td>
                          <td className="right amount">{money(item.importe)}</td>
                          {writable ? <td><div className="ct-actions"><button type="button" className="edit" onClick={() => openIncome(item)} title="Editar"><FontAwesomeIcon icon={faPen} /></button><button type="button" className="delete" onClick={() => setDeleteTarget({ type: "income", item })} title="Anular"><FontAwesomeIcon icon={faTrashCan} /></button></div></td> : null}
                        </tr>
                      )) : <LoadingRows columns={writable ? 7 : 6} loading={loading} message="No hay otros ingresos registrados en el mes." />}
                    </tbody>
                  </table>
                ) : null}

                {view === "expense" ? (
                  <table className="ct-table">
                    <thead><tr><th>Fecha</th><th>Categoría</th><th>N.º comprobante</th><th>Descripción</th><th>Proveedor</th><th>Medio</th><th className="right">Monto</th><th>Acciones</th></tr></thead>
                    <tbody>
                      {data.items?.length ? data.items.map((item) => (
                        <tr key={item.id_egreso}>
                          <td>{formatDate(item.fecha)}</td><td>{item.categoria}</td><td>{item.numero_comprobante || "—"}</td>
                          <td><strong>{item.concepto}</strong>{item.detalle ? <small>{item.detalle}</small> : null}</td>
                          <td>{item.proveedor}</td><td>{item.medio}</td><td className="right amount">{money(item.importe)}</td>
                          <td><div className="ct-actions">
                            <button type="button" className="view" onClick={() => viewFile(item)} disabled={!item.tiene_archivo} title={item.tiene_archivo ? "Ver comprobante" : "Sin comprobante"}><FontAwesomeIcon icon={faEye} /></button>
                            {writable ? <><button type="button" className="edit" onClick={() => openExpense(item)} title="Editar"><FontAwesomeIcon icon={faPen} /></button><button type="button" className="delete" onClick={() => setDeleteTarget({ type: "expense", item })} title="Anular"><FontAwesomeIcon icon={faTrashCan} /></button></> : null}
                          </div></td>
                        </tr>
                      )) : <LoadingRows columns={8} loading={loading} message="No hay egresos registrados en el mes." />}
                    </tbody>
                  </table>
                ) : null}
              </div>
            </>
          )}
        </main>
      </div>

      <CrudModal open={incomeOpen} title={incomeForm.id_ingreso ? "Editar ingreso" : "Registrar ingreso"} subtitle="Ingreso ajeno a cuotas o inscripciones de socios." onClose={() => setIncomeOpen(false)} onSubmit={saveIncome} saving={saving} submitLabel="Guardar ingreso" wide>
        <div className="ct-form-grid">
          <label className="ct-field"><span>Fecha</span><input type="date" required value={incomeForm.fecha} onChange={(event) => setIncomeForm((current) => ({ ...current, fecha: event.target.value }))} /></label>
          <label className="ct-field"><span>Medio de pago</span><select required value={incomeForm.id_medio_pago} onChange={(event) => setIncomeForm((current) => ({ ...current, id_medio_pago: event.target.value }))}><option value="">SELECCIONE...</option>{catalogs.medios_pago.map((item) => <option key={item.id_medio_pago} value={item.id_medio_pago}>{item.nombre}</option>)}</select></label>
          <OptionSelect label="Persona / proveedor" value={incomeForm.id_proveedor} options={catalogs.opciones.PROVEEDOR} optionType="PROVEEDOR" onChange={(value) => setIncomeForm((current) => ({ ...current, id_proveedor: value }))} onRequestCreate={requestOption} />
          <OptionSelect label="Categoría" value={incomeForm.id_categoria} options={catalogs.opciones.CATEGORIA_INGRESO} optionType="CATEGORIA_INGRESO" onChange={(value) => setIncomeForm((current) => ({ ...current, id_categoria: value }))} onRequestCreate={requestOption} />
          <OptionSelect label="Descripción / concepto" value={incomeForm.id_concepto} options={catalogs.opciones.CONCEPTO_INGRESO} optionType="CONCEPTO_INGRESO" onChange={(value) => setIncomeForm((current) => ({ ...current, id_concepto: value }))} onRequestCreate={requestOption} />
          <label className="ct-field"><span>Importe (ARS)</span><input type="number" min="0.01" step="0.01" required value={incomeForm.importe} onChange={(event) => setIncomeForm((current) => ({ ...current, importe: event.target.value }))} /></label>
          <label className="ct-field ct-field--full"><span>Detalle opcional</span><textarea rows="3" maxLength="500" value={incomeForm.detalle} onChange={(event) => setIncomeForm((current) => ({ ...current, detalle: upper(event.target.value) }))} placeholder="ACLARACIÓN ADICIONAL DEL INGRESO" /></label>
        </div>
      </CrudModal>

      <CrudModal open={expenseOpen} title={expenseForm.id_egreso ? "Editar egreso" : "Registrar egreso"} subtitle="Registrá el gasto y adjuntá su comprobante cuando corresponda." onClose={() => setExpenseOpen(false)} onSubmit={saveExpense} saving={saving} submitLabel="Guardar egreso" wide>
        <div className="ct-form-grid">
          <label className="ct-field"><span>Fecha</span><input type="date" required value={expenseForm.fecha} onChange={(event) => setExpenseForm((current) => ({ ...current, fecha: event.target.value }))} /></label>
          <label className="ct-field"><span>Medio de pago</span><select required value={expenseForm.id_medio_pago} onChange={(event) => setExpenseForm((current) => ({ ...current, id_medio_pago: event.target.value }))}><option value="">SELECCIONE...</option>{catalogs.medios_pago.map((item) => <option key={item.id_medio_pago} value={item.id_medio_pago}>{item.nombre}</option>)}</select></label>
          <OptionSelect label="Categoría" value={expenseForm.id_categoria} options={catalogs.opciones.CATEGORIA_EGRESO} optionType="CATEGORIA_EGRESO" onChange={(value) => setExpenseForm((current) => ({ ...current, id_categoria: value }))} onRequestCreate={requestOption} />
          <label className="ct-field"><span>N.º de comprobante</span><input maxLength="120" value={expenseForm.numero_comprobante} onChange={(event) => setExpenseForm((current) => ({ ...current, numero_comprobante: upper(event.target.value) }))} placeholder="0001-00001234" /></label>
          <OptionSelect label="Proveedor" value={expenseForm.id_proveedor} options={catalogs.opciones.PROVEEDOR} optionType="PROVEEDOR" onChange={(value) => setExpenseForm((current) => ({ ...current, id_proveedor: value }))} onRequestCreate={requestOption} />
          <OptionSelect label="Descripción / concepto" value={expenseForm.id_concepto} options={catalogs.opciones.CONCEPTO_EGRESO} optionType="CONCEPTO_EGRESO" onChange={(value) => setExpenseForm((current) => ({ ...current, id_concepto: value }))} onRequestCreate={requestOption} />
          <label className="ct-field ct-field--full"><span>Importe (ARS)</span><input type="number" min="0.01" step="0.01" required value={expenseForm.importe} onChange={(event) => setExpenseForm((current) => ({ ...current, importe: event.target.value }))} /></label>
          <label className="ct-field ct-field--full"><span>Detalle opcional</span><textarea rows="3" maxLength="500" value={expenseForm.detalle} onChange={(event) => setExpenseForm((current) => ({ ...current, detalle: upper(event.target.value) }))} placeholder="ACLARACIÓN ADICIONAL DEL EGRESO" /></label>
          <div className="ct-upload ct-field--full" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files?.[0]); }}>
            <FontAwesomeIcon icon={faPaperclip} />
            <strong>{expenseForm.archivo_nombre_original || "Adjuntar comprobante"}</strong>
            <span>Arrastrá una imagen o PDF, o elegí un archivo. Máximo 10 MB.</span>
            <label className="ct-btn ct-btn--secondary">Elegir archivo<input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" onChange={(event) => chooseFile(event.target.files?.[0])} /></label>
            {expenseForm.archivo_nombre_original ? <button type="button" className="ct-upload__remove" onClick={() => setExpenseForm((current) => ({ ...current, archivo: null, archivo_nombre_original: "", eliminar_archivo: true }))}>Quitar comprobante</button> : null}
          </div>
        </div>
      </CrudModal>

      <CrudModal open={Boolean(optionModal)} title={`Agregar ${optionModal?.label || "opción"}`} subtitle="La nueva opción quedará disponible inmediatamente en este selector." onClose={() => setOptionModal(null)} onSubmit={saveOption} saving={saving} submitLabel="Agregar opción">
        <label className="ct-field"><span>Nombre</span><input autoFocus required maxLength="160" value={optionName} onChange={(event) => setOptionName(upper(event.target.value))} placeholder="ESCRIBÍ EL NOMBRE" /></label>
      </CrudModal>

      <ModalEliminarGlobal
        open={Boolean(deleteTarget)}
        operacion="advertencia"
        row={deleteTarget?.item}
        title={deleteTarget?.type === "income" ? "Anular ingreso" : "Anular egreso"}
        message="El movimiento dejará de sumar en los totales, pero se conservará en auditoría."
        warning="Esta acción no modifica cuotas ni cobros de socios."
        confirmLabel="Anular movimiento"
        successMessage="El movimiento se anuló correctamente."
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        details={deleteTarget ? [
          { label: "Fecha", value: formatDate(deleteTarget.item.fecha) },
          { label: "Concepto", value: deleteTarget.item.concepto },
          { label: "Importe", value: money(deleteTarget.item.importe) },
        ] : []}
      />

      <ModuleFeedback type={feedback?.type} message={feedback?.message} onClose={() => setFeedback(null)} />
    </div>
  );
}
