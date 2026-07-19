import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRotateLeft,
  faCashRegister,
  faGear,
  faLocationDot,
  faMoneyBillTransfer,
  faPen,
  faPlus,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../Global/components/ModulePage";
import CrudModal from "../Global/components/CrudModal";
import ModuleFeedback from "../Global/components/ModuleFeedback";
import { canWrite } from "../Global/auth/session";
import { configuracionApi } from "./api/configuracionApi";
import { useConfiguracion } from "./hooks/useConfiguracion";
import "./Configuracion.css";

const upper = (value) => value.toLocaleUpperCase("es-AR");
const money = (value) => new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
}).format(Number(value || 0));

const emptyListForm = (lista = "medios_pago") => ({
  lista,
  id: "",
  nombre: "",
  codigo_postal: "",
});

function SettingsCard({ icon, title, description, badge, children, action }) {
  return (
    <article className="config-card">
      <header className="config-card__header">
        <span className="config-card__icon"><FontAwesomeIcon icon={icon} /></span>
        <div className="config-card__heading">
          <div className="config-card__titleRow">
            <h2>{title}</h2>
            {badge ? <span className="config-card__badge">{badge}</span> : null}
          </div>
          <p>{description}</p>
        </div>
        {action}
      </header>
      <div className="config-card__body">{children}</div>
    </article>
  );
}

function ConfigList({
  items,
  listKey,
  emptyText,
  writable,
  onEdit,
  onState,
}) {
  if (!items.length) return <div className="config-list__empty">{emptyText}</div>;

  return (
    <div className="config-list">
      {items.map((item) => {
        const id = item.id_medio_pago || item.id_localidad;
        const usageCount = Number(item.cantidad_usos || 0);
        const stateAction = item.activo || usageCount === 0 ? "eliminar" : "reactivar";
        return (
          <article className={`config-list__item ${item.activo ? "" : "is-inactive"}`} key={id}>
            <div className="config-list__main">
              <strong>{item.nombre}</strong>
              <span>
                {listKey === "localidades" && item.codigo_postal
                  ? `CP ${item.codigo_postal} · `
                  : ""}
                {item.cantidad_usos
                  ? `${item.cantidad_usos} uso${item.cantidad_usos === 1 ? "" : "s"}`
                  : "Sin uso"}
              </span>
            </div>
            <span className={`config-status ${item.activo ? "is-active" : "is-inactive"}`}>
              {item.activo ? "ACTIVO" : "INACTIVO"}
            </span>
            {writable ? (
              <div className="config-list__actions">
                <button
                  type="button"
                  className="config-iconButton"
                  onClick={() => onEdit(listKey, item)}
                  title="Editar"
                  aria-label={`Editar ${item.nombre}`}
                >
                  <FontAwesomeIcon icon={faPen} />
                </button>
                <button
                  type="button"
                  className={`config-iconButton ${stateAction === "eliminar" ? "is-danger" : "is-success"}`}
                  onClick={() => onState(listKey, item, stateAction)}
                  title={stateAction === "eliminar" ? "Eliminar" : "Reactivar"}
                  aria-label={`${stateAction === "eliminar" ? "Eliminar" : "Reactivar"} ${item.nombre}`}
                >
                  <FontAwesomeIcon icon={stateAction === "eliminar" ? faTrashCan : faArrowRotateLeft} />
                </button>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export default function Configuracion() {
  const writable = canWrite();
  const { parametros, listas, resumen, loading, error, cargar } = useConfiguracion();
  const [amount, setAmount] = useState("");
  const [listForm, setListForm] = useState(emptyListForm());
  const [listModalOpen, setListModalOpen] = useState(false);
  const [stateModal, setStateModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const configured = Number(parametros.monto_inscripcion || 0);
    setAmount(configured > 0 ? String(parametros.monto_inscripcion) : "");
  }, [parametros.monto_inscripcion]);

  const saveAmount = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const response = await configuracionApi.guardarParametros({ monto_inscripcion: amount });
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const openNewItem = (lista) => {
    setListForm(emptyListForm(lista));
    setListModalOpen(true);
  };

  const openEditItem = (lista, item) => {
    setListForm({
      lista,
      id: String(item.id_medio_pago || item.id_localidad),
      nombre: item.nombre || "",
      codigo_postal: item.codigo_postal || "",
    });
    setListModalOpen(true);
  };

  const saveListItem = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const response = await configuracionApi.guardarItem({
        ...listForm,
        id: listForm.id || null,
      });
      setListModalOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const confirmState = async (event) => {
    event.preventDefault();
    if (!stateModal) return;
    const id = stateModal.item.id_medio_pago || stateModal.item.id_localidad;
    setSaving(true);
    setFeedback(null);
    try {
      const response = stateModal.action === "eliminar"
        ? await configuracionApi.eliminarItem(stateModal.lista, id)
        : await configuracionApi.reactivarItem(stateModal.lista, id);
      setStateModal(null);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (err) {
      setStateModal(null);
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const listLabel = listForm.lista === "localidades" ? "localidad" : "medio de pago";

  return (
    <>
      <ModulePage
        title="Configuración"
        description="Administrá parámetros generales y listas reutilizables del sistema."
        canCreate={false}
        onRefresh={cargar}
        refreshing={loading}
        notice={!writable ? "Tu usuario tiene permiso de consulta. Las modificaciones están deshabilitadas." : null}
      >
        <ModuleFeedback
          type={feedback?.type || "error"}
          message={feedback?.message || error}
          onClose={() => setFeedback(null)}
        />

        <div className="config-overview">
          <div><FontAwesomeIcon icon={faGear} /><span>Parámetros centralizados</span><strong>1</strong></div>
          <div><FontAwesomeIcon icon={faMoneyBillTransfer} /><span>Medios de pago activos</span><strong>{resumen.medios_pago_activos || 0}</strong></div>
          <div><FontAwesomeIcon icon={faLocationDot} /><span>Localidades activas</span><strong>{resumen.localidades_activas || 0}</strong></div>
        </div>

        <div className="config-grid">
          <SettingsCard
            icon={faCashRegister}
            title="Monto de inscripción"
            description="Importe base por integrante que Cuotas completa automáticamente al registrar una inscripción."
            badge="CUOTAS"
          >
            <form className="config-amountForm" onSubmit={saveAmount}>
              <label className="entity-field">
                <span>Monto predeterminado *</span>
                <input
                  type="number"
                  min="0.01"
                  max="9999999999.99"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0,00"
                  required
                  disabled={!writable || saving}
                />
              </label>
              <div className="config-amountPreview">
                <small>VALOR ACTUAL</small>
                <strong>{money(parametros.monto_inscripcion)}</strong>
              </div>
              {writable ? (
                <button className="mov-btn mov-btn--primary" type="submit" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar monto"}
                </button>
              ) : null}
            </form>
            <p className="config-help">El importe queda como valor inicial en el pago. Puede ajustarse manualmente para una excepción sin modificar la configuración general.</p>
          </SettingsCard>

          <SettingsCard
            icon={faMoneyBillTransfer}
            title="Medios de pago"
            description="Opciones disponibles al cobrar cuotas e inscripciones."
            badge={`${resumen.medios_pago_activos || 0} ACTIVOS`}
            action={writable ? (
              <button className="config-addButton" type="button" onClick={() => openNewItem("medios_pago")}>
                <FontAwesomeIcon icon={faPlus} /> Agregar
              </button>
            ) : null}
          >
            <ConfigList
              items={listas.medios_pago || []}
              listKey="medios_pago"
              emptyText="Todavía no hay medios de pago configurados."
              writable={writable}
              onEdit={openEditItem}
              onState={(lista, item, action) => setStateModal({ lista, item, action })}
            />
          </SettingsCard>

          <SettingsCard
            icon={faLocationDot}
            title="Localidades"
            description="Localidades disponibles para el domicilio de los socios."
            badge={`${resumen.localidades_activas || 0} ACTIVAS`}
            action={writable ? (
              <button className="config-addButton" type="button" onClick={() => openNewItem("localidades")}>
                <FontAwesomeIcon icon={faPlus} /> Agregar
              </button>
            ) : null}
          >
            <ConfigList
              items={listas.localidades || []}
              listKey="localidades"
              emptyText="Todavía no hay localidades configuradas."
              writable={writable}
              onEdit={openEditItem}
              onState={(lista, item, action) => setStateModal({ lista, item, action })}
            />
          </SettingsCard>
        </div>
      </ModulePage>

      <CrudModal
        open={listModalOpen}
        title={`${listForm.id ? "Editar" : "Agregar"} ${listLabel}`}
        subtitle={listForm.lista === "localidades"
          ? "La localidad quedará disponible en Socios."
          : "El medio quedará disponible en los pagos del módulo Cuotas."}
        onClose={() => setListModalOpen(false)}
        onSubmit={saveListItem}
        saving={saving}
        submitLabel={listForm.id ? "Guardar cambios" : "Agregar"}
      >
        <div className="entity-form">
          <div className="entity-form__grid entity-form__grid--single">
            <label className="entity-field">
              <span>Nombre *</span>
              <input
                value={listForm.nombre}
                onChange={(event) => setListForm((current) => ({ ...current, nombre: upper(event.target.value) }))}
                maxLength={120}
                required
                autoFocus
              />
            </label>
            {listForm.lista === "localidades" ? (
              <label className="entity-field">
                <span>Código postal</span>
                <input
                  value={listForm.codigo_postal}
                  onChange={(event) => setListForm((current) => ({ ...current, codigo_postal: upper(event.target.value) }))}
                  maxLength={20}
                />
              </label>
            ) : null}
          </div>
        </div>
      </CrudModal>

      <CrudModal
        open={Boolean(stateModal)}
        title={stateModal?.action === "eliminar" ? "Eliminar opción" : "Reactivar opción"}
        subtitle={stateModal?.item?.nombre || ""}
        onClose={() => setStateModal(null)}
        onSubmit={confirmState}
        saving={saving}
        submitLabel={stateModal?.action === "eliminar" ? "Eliminar" : "Reactivar"}
        danger={stateModal?.action === "eliminar"}
      >
        <p className="entity-confirm-text">
          {stateModal?.action === "eliminar"
            ? Number(stateModal?.item?.cantidad_usos || 0) === 0
              ? "La opción no tiene registros asociados y se eliminará definitivamente de la base de datos."
              : "La opción tiene registros asociados. Para conservar el historial no se borrará: quedará inactiva y dejará de aparecer en los formularios nuevos."
            : "La opción volverá a estar disponible en los formularios del sistema."}
        </p>
      </CrudModal>
    </>
  );
}
