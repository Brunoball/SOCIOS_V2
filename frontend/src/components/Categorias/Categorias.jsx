import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClockRotateLeft,
  faPen,
  faRotateLeft,
  faToggleOff,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../Global/components/ModulePage";
import CrudModal from "../Global/components/CrudModal";
import ModuleFeedback from "../Global/components/ModuleFeedback";
import { canWrite } from "../Global/auth/session";
import { categoriasApi } from "./api/categoriasApi";
import { useCategorias } from "./hooks/useCategorias";
import { useDescuentosFamiliares } from "./hooks/useDescuentosFamiliares";
import "./Categorias.css";

const dateToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};

const upper = (value) => value.toLocaleUpperCase("es-AR");
const money = (value) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    Number(value || 0),
  );
const percentage = (value) =>
  `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(Number(value || 0))}%`;
const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : "ACTUAL";

const emptyCategoryForm = () => ({
  id_categoria: "",
  nombre: "",
  descripcion: "",
  monto_actual: "",
  vigente_desde: dateToday(),
  motivo_precio: "",
});

const emptyDiscountForm = () => ({
  id_descuento_familiar: "",
  cantidad_integrantes: "2",
  porcentaje_descuento: "",
});

function CategoryForm({ form, setForm }) {
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="entity-form">
      <div className="entity-form__grid">
        <label className="entity-field">
          <span>Nombre *</span>
          <input
            value={form.nombre}
            onChange={(event) => update("nombre", upper(event.target.value))}
            required
            maxLength={120}
          />
        </label>
        <label className="entity-field">
          <span>Monto mensual *</span>
          <input
            type="number"
            min="0"
            max="9999999999.99"
            step="0.01"
            value={form.monto_actual}
            onChange={(event) => update("monto_actual", event.target.value)}
            required
          />
        </label>
        <label className="entity-field entity-field--wide">
          <span>Descripción</span>
          <textarea
            value={form.descripcion}
            onChange={(event) =>
              update("descripcion", upper(event.target.value))
            }
            rows={3}
            maxLength={500}
          />
        </label>
        <label className="entity-field">
          <span>Vigente desde *</span>
          <input
            type="date"
            value={form.vigente_desde}
            max={dateToday()}
            onChange={(event) => update("vigente_desde", event.target.value)}
            required
          />
        </label>
        <label className="entity-field">
          <span>Motivo del precio</span>
          <input
            value={form.motivo_precio}
            onChange={(event) =>
              update("motivo_precio", upper(event.target.value))
            }
            maxLength={255}
            placeholder={
              form.id_categoria
                ? "EJ.: ACTUALIZACIÓN DE CUOTA"
                : "PRECIO INICIAL"
            }
          />
        </label>
      </div>
      <p className="entity-help">
        La categoría tiene un único precio mensual. Los períodos de 6 y 12 meses
        se calculan automáticamente desde este importe.
      </p>
    </div>
  );
}

function DiscountForm({ form, setForm }) {
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="entity-form">
      <div className="entity-form__grid entity-form__grid--single">
        <label className="entity-field">
          <span>Cantidad mínima de integrantes *</span>
          <input
            type="number"
            min="2"
            max="50"
            step="1"
            value={form.cantidad_integrantes}
            onChange={(event) =>
              update("cantidad_integrantes", event.target.value)
            }
            required
          />
        </label>
        <label className="entity-field">
          <span>Porcentaje de descuento *</span>
          <input
            type="number"
            min="0.01"
            max="100"
            step="0.01"
            value={form.porcentaje_descuento}
            onChange={(event) =>
              update("porcentaje_descuento", event.target.value)
            }
            required
          />
        </label>
      </div>
      <p className="entity-help">
        La regla se aplica desde esa cantidad hasta el siguiente umbral
        configurado. El porcentaje es global: no depende de una categoría.
      </p>
    </div>
  );
}

export default function Categorias() {
  const writable = canWrite();
  const [section, setSection] = useState("categorias");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const filters = useMemo(
    () => ({ buscar: search, estado: status }),
    [search, status],
  );
  const { items, loading, error, cargar } = useCategorias(filters);
  const {
    items: discounts,
    loading: discountsLoading,
    error: discountsError,
    cargar: cargarDescuentos,
  } = useDescuentosFamiliares();

  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm());
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [discountForm, setDiscountForm] = useState(emptyDiscountForm());
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [stateModal, setStateModal] = useState(null);
  const [deleteDiscountModal, setDeleteDiscountModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const openNewCategory = () => {
    setCategoryForm(emptyCategoryForm());
    setCategoryModalOpen(true);
  };

  const openEditCategory = (item) => {
    setCategoryForm({
      id_categoria: item.id_categoria,
      nombre: item.nombre,
      descripcion: item.descripcion || "",
      monto_actual: item.monto_actual,
      vigente_desde: dateToday(),
      motivo_precio: "",
    });
    setCategoryModalOpen(true);
  };

  const openNewDiscount = () => {
    setDiscountForm(emptyDiscountForm());
    setDiscountModalOpen(true);
  };

  const openEditDiscount = (item) => {
    setDiscountForm({
      id_descuento_familiar: item.id_descuento_familiar,
      cantidad_integrantes: String(item.cantidad_integrantes),
      porcentaje_descuento: String(item.porcentaje_descuento),
    });
    setDiscountModalOpen(true);
  };

  const saveCategory = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await categoriasApi.guardar(categoryForm);
      setCategoryModalOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const saveDiscount = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response =
        await categoriasApi.guardarDescuentoFamiliar(discountForm);
      setDiscountModalOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await cargarDescuentos();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const changeCategoryState = async (event) => {
    event.preventDefault();
    if (!stateModal) return;
    setSaving(true);
    try {
      const response = stateModal.activo
        ? await categoriasApi.darBaja(stateModal.id_categoria)
        : await categoriasApi.reactivar(stateModal.id_categoria);
      setStateModal(null);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const deleteDiscount = async (event) => {
    event.preventDefault();
    if (!deleteDiscountModal) return;
    setSaving(true);
    try {
      const response = await categoriasApi.eliminarDescuentoFamiliar(
        deleteDiscountModal.id_descuento_familiar,
      );
      setDeleteDiscountModal(null);
      setFeedback({ type: "success", message: response.mensaje });
      await cargarDescuentos();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (item) => {
    setHistoryModal(item);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const response = await categoriasApi.historial(item.id_categoria);
      setHistory(response.items || []);
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
      setHistoryModal(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const activeError = section === "categorias" ? error : discountsError;
  const activeLoading = section === "categorias" ? loading : discountsLoading;
  const primaryAction =
    section === "categorias" ? openNewCategory : openNewDiscount;
  const primaryLabel =
    section === "categorias" ? "Nueva categoría" : "Nuevo descuento";
  const pageFilters = [
    {
      key: "seccion",
      label: "Sección",
      type: "tabs",
      ariaLabel: "Configuración de categorías",
      value: section,
      onChange: (value) => {
        setSection(value);
        setFeedback(null);
      },
      options: [
        { value: "categorias", label: "Categorías" },
        { value: "descuentos", label: "Descuentos familiares" },
      ],
    },
    ...(section === "categorias"
      ? [
          {
            key: "buscar",
            label: "Búsqueda",
            type: "search",
            placeholder: " ",
            value: search,
            onChange: setSearch,
          },
          {
            key: "estado",
            label: "Estado",
            type: "select",
            placeholder: "Todas",
            value: status,
            onChange: setStatus,
            options: [
              { value: "activo", label: "Activas" },
              { value: "inactivo", label: "Dadas de baja" },
            ],
          },
        ]
      : []),
  ];

  return (
    <>
      <ModulePage
        title="Categorías"
        filters={pageFilters}
        tabsInTitle
        primaryActionLabel={primaryLabel}
        onPrimaryAction={primaryAction}
        canCreate={writable}
        notice={
          !writable
            ? "Tu usuario tiene permiso de consulta. Las modificaciones están deshabilitadas."
            : null
        }
      >
        <ModuleFeedback
          type={feedback?.type || "error"}
          message={feedback?.message || activeError}
          onClose={() => setFeedback(null)}
        />

        {section === "descuentos" ? (
          <div className="module-notice categorias-discountNotice">
            Las reglas son globales y se aplican por cantidad de integrantes
            activos. Se usa el mayor umbral alcanzado: si configurás 2 = 10% y 3
            = 15%, una familia de 4 recibe 15%.
          </div>
        ) : null}

        {section === "categorias" ? (
          <div
            className="global-divTable categorias-table"
            role="table"
            aria-label="Listado de categorías"
          >
            <div
              className="mov-tableWrap global-divTable__wrap entity-table-wrap"
              role="rowgroup"
            >
              <div
                className="mov-gridTable mov-gridTable--head global-divTable__head categorias-grid"
                role="row"
              >
                {[
                  "Categoría",
                  "Descripción",
                  "Monto mensual",
                  "Socios",
                  "Estado",
                  "Actualización",
                  "Acciones",
                ].map((column) => (
                  <div className="mov-gridCell--head" key={column}>
                    {column}
                  </div>
                ))}
              </div>
              {loading && !items.length ? (
                <div className="module-empty">
                  <strong>Cargando categorías...</strong>
                  <span>Consultando precios e historial.</span>
                </div>
              ) : null}
              {!loading && !error && !items.length ? (
                <div className="module-empty">
                  <strong>Sin categorías para mostrar</strong>
                  <span>Creá la primera categoría o cambiá los filtros.</span>
                </div>
              ) : null}
              {items.map((item) => (
                <div
                  className="mov-gridTable mov-gridTable--row global-divTable__row entity-table-row categorias-grid"
                  role="row"
                  key={item.id_categoria}
                >
                  <div className="mov-gridCell is-strong">{item.nombre}</div>
                  <div className="mov-gridCell">
                    <span className="entity-wrap-text">
                      {item.descripcion || "—"}
                    </span>
                  </div>
                  <div className="mov-gridCell is-strong">
                    {money(item.monto_actual)}
                  </div>
                  <div className="mov-gridCell is-center">
                    <span className="mov-chip">{item.cantidad_socios}</span>
                  </div>
                  <div className="mov-gridCell">
                    <span
                      className={`mov-chip ${item.activo ? "mov-chip--ok" : "mov-chip--danger"}`}
                    >
                      {item.activo ? "ACTIVA" : "BAJA"}
                    </span>
                  </div>
                  <div className="mov-gridCell">
                    {formatDate(item.updated_at?.slice(0, 10))}
                  </div>
                  <div className="mov-gridCell mov-gridCell--actions">
                    <div className="mov-actionsInline">
                      <button
                        className="mov-iconBtn"
                        type="button"
                        title="Ver historial de precios"
                        onClick={() => openHistory(item)}
                      >
                        <FontAwesomeIcon icon={faClockRotateLeft} />
                      </button>
                      {writable ? (
                        <>
                          <button
                            className="mov-iconBtn"
                            type="button"
                            title="Editar"
                            onClick={() => openEditCategory(item)}
                          >
                            <FontAwesomeIcon icon={faPen} />
                          </button>
                          <button
                            className={`mov-iconBtn ${item.activo ? "mov-iconBtn--danger" : ""}`}
                            type="button"
                            title={item.activo ? "Dar de baja" : "Reactivar"}
                            onClick={() => setStateModal(item)}
                          >
                            <FontAwesomeIcon
                              icon={item.activo ? faToggleOff : faRotateLeft}
                            />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            className="global-divTable categorias-discountsTable"
            role="table"
            aria-label="Descuentos familiares"
          >
            <div
              className="mov-tableWrap global-divTable__wrap entity-table-wrap"
              role="rowgroup"
            >
              <div
                className="mov-gridTable mov-gridTable--head global-divTable__head categorias-discountsGrid"
                role="row"
              >
                {[
                  "Desde integrantes",
                  "Descuento",
                  "Alcance",
                  "Actualización",
                  "Acciones",
                ].map((column) => (
                  <div className="mov-gridCell--head" key={column}>
                    {column}
                  </div>
                ))}
              </div>
              {discountsLoading && !discounts.length ? (
                <div className="module-empty">
                  <strong>Cargando descuentos...</strong>
                  <span>Consultando las reglas familiares.</span>
                </div>
              ) : null}
              {!discountsLoading && !discountsError && !discounts.length ? (
                <div className="module-empty">
                  <strong>Sin descuentos configurados</strong>
                  <span>
                    Si no agregás reglas, no se aplicará descuento familiar.
                  </span>
                </div>
              ) : null}
              {discounts.map((item, index) => {
                const nextQuantity = discounts[index + 1]?.cantidad_integrantes;
                const reach = nextQuantity
                  ? `DE ${item.cantidad_integrantes} A ${nextQuantity - 1} INTEGRANTES`
                  : `DESDE ${item.cantidad_integrantes} INTEGRANTES`;
                return (
                  <div
                    className="mov-gridTable mov-gridTable--row global-divTable__row entity-table-row categorias-discountsGrid"
                    role="row"
                    key={item.id_descuento_familiar}
                  >
                    <div className="mov-gridCell is-strong">
                      {item.cantidad_integrantes} INTEGRANTES
                    </div>
                    <div className="mov-gridCell">
                      <span className="mov-chip mov-chip--ok">
                        {percentage(item.porcentaje_descuento)}
                      </span>
                    </div>
                    <div className="mov-gridCell">{reach}</div>
                    <div className="mov-gridCell">
                      {formatDate(item.updated_at?.slice(0, 10))}
                    </div>
                    <div className="mov-gridCell mov-gridCell--actions">
                      {writable ? (
                        <div className="mov-actionsInline">
                          <button
                            className="mov-iconBtn"
                            type="button"
                            title="Editar descuento"
                            onClick={() => openEditDiscount(item)}
                          >
                            <FontAwesomeIcon icon={faPen} />
                          </button>
                          <button
                            className="mov-iconBtn mov-iconBtn--danger"
                            type="button"
                            title="Eliminar descuento"
                            onClick={() => setDeleteDiscountModal(item)}
                          >
                            <FontAwesomeIcon icon={faTrashCan} />
                          </button>
                        </div>
                      ) : (
                        <span className="entity-readonly">CONSULTA</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeLoading &&
        ((section === "categorias" && items.length) ||
          (section === "descuentos" && discounts.length)) ? (
          <span className="entity-readonly categorias-updating">
            ACTUALIZANDO...
          </span>
        ) : null}
      </ModulePage>

      <CrudModal
        open={categoryModalOpen}
        title={
          categoryForm.id_categoria ? "Editar categoría" : "Nueva categoría"
        }
        subtitle="Un precio mensual por categoría, con historial de cambios."
        onClose={() => setCategoryModalOpen(false)}
        onSubmit={saveCategory}
        saving={saving}
        submitLabel={
          categoryForm.id_categoria ? "Guardar cambios" : "Crear categoría"
        }
        wide
      >
        <CategoryForm form={categoryForm} setForm={setCategoryForm} />
      </CrudModal>

      <CrudModal
        open={discountModalOpen}
        title={
          discountForm.id_descuento_familiar
            ? "Editar descuento familiar"
            : "Nuevo descuento familiar"
        }
        subtitle="Definí un umbral de integrantes y el porcentaje global."
        onClose={() => setDiscountModalOpen(false)}
        onSubmit={saveDiscount}
        saving={saving}
        submitLabel={
          discountForm.id_descuento_familiar
            ? "Guardar cambios"
            : "Crear descuento"
        }
      >
        <DiscountForm form={discountForm} setForm={setDiscountForm} />
      </CrudModal>

      <CrudModal
        open={Boolean(stateModal)}
        title={
          stateModal?.activo
            ? "Dar de baja la categoría"
            : "Reactivar categoría"
        }
        subtitle={stateModal?.nombre || ""}
        onClose={() => setStateModal(null)}
        onSubmit={changeCategoryState}
        saving={saving}
        submitLabel={stateModal?.activo ? "Confirmar baja" : "Reactivar"}
        danger={Boolean(stateModal?.activo)}
      >
        <p className="entity-confirm-text">
          {stateModal?.activo
            ? "La categoría no podrá asignarse ni cobrarse en nuevas operaciones. Se conservarán socios, precios y pagos históricos."
            : "La categoría volverá a estar disponible para asignaciones y cobros."}
        </p>
      </CrudModal>

      <CrudModal
        open={Boolean(deleteDiscountModal)}
        title="Eliminar descuento familiar"
        subtitle={
          deleteDiscountModal
            ? `DESDE ${deleteDiscountModal.cantidad_integrantes} INTEGRANTES · ${percentage(deleteDiscountModal.porcentaje_descuento)}`
            : ""
        }
        onClose={() => setDeleteDiscountModal(null)}
        onSubmit={deleteDiscount}
        saving={saving}
        submitLabel="Eliminar regla"
        danger
      >
        <p className="entity-confirm-text">
          La regla dejará de aplicarse en los próximos cálculos. Los pagos
          históricos conservarán el porcentaje usado en su momento.
        </p>
      </CrudModal>

      <CrudModal
        open={Boolean(historyModal)}
        title="Historial de precios"
        subtitle={historyModal?.nombre || ""}
        onClose={() => setHistoryModal(null)}
        onSubmit={(event) => {
          event.preventDefault();
          setHistoryModal(null);
        }}
        submitLabel="Cerrar"
      >
        {historyLoading ? (
          <p className="entity-confirm-text">Cargando historial...</p>
        ) : (
          <div className="entity-history">
            {history.map((entry) => (
              <article key={entry.id_historial}>
                <div>
                  <strong>{money(entry.monto_nuevo)}</strong>
                  <span>
                    {formatDate(entry.vigente_desde)} —{" "}
                    {formatDate(entry.vigente_hasta)}
                  </span>
                </div>
                <p>{entry.motivo || "SIN MOTIVO"}</p>
                {entry.monto_anterior !== null ? (
                  <small>Anterior: {money(entry.monto_anterior)}</small>
                ) : (
                  <small>Precio inicial</small>
                )}
              </article>
            ))}
            {!history.length ? (
              <p className="entity-help">
                No hay precios históricos registrados.
              </p>
            ) : null}
          </div>
        )}
      </CrudModal>
    </>
  );
}
