import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPen,
  faRotateLeft,
  faToggleOff,
} from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../../Global/components/ModulePage";
import CrudModal from "../../Global/components/CrudModal";
import ModalEliminarGlobal from "../../Global/components/ModalEliminarGlobal";
import ModuleFeedback from "../../Global/components/ModuleFeedback";
import { canWrite } from "../../Global/auth/session";
import { familiasApi } from "../api/familiasApi";
import { useFamilias } from "../hooks/useFamilias";
import "./Familias.css";
import "./FamiliasModal.css";

const upper = (value) => value.toLocaleUpperCase("es-AR");
const emptyForm = () => ({
  id_familia: "",
  nombre: "",
  descripcion: "",
  integrante_ids: [],
});

function FamilyForm({ form, setForm, partners }) {
  const [memberSearch, setMemberSearch] = useState("");
  const visible = partners.filter(
    (partner) =>
      (partner.activo !== false ||
        form.integrante_ids.includes(partner.id_socio)) &&
      `${partner.apellido} ${partner.nombre} ${partner.dni}`
        .toLowerCase()
        .includes(memberSearch.toLowerCase()),
  );
  const toggle = (id) =>
    setForm((current) => ({
      ...current,
      integrante_ids: current.integrante_ids.includes(id)
        ? current.integrante_ids.filter((item) => item !== id)
        : [...current.integrante_ids, id],
    }));
  return (
    <div className="entity-form familias-modal__form">
      <div className="entity-form__grid entity-form__grid--single">
        <label className="entity-field">
          <span>Nombre de la familia *</span>
          <input
            value={form.nombre}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                nombre: upper(e.target.value),
              }))
            }
            required
            maxLength={150}
            placeholder="EJ.: FAMILIA GONZÁLEZ"
          />
        </label>
        <label className="entity-field">
          <span>Descripción</span>
          <textarea
            value={form.descripcion}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                descripcion: upper(e.target.value),
              }))
            }
            rows={3}
            maxLength={500}
          />
        </label>
      </div>
      <fieldset className="entity-checks familias-modal__members">
        <legend>Integrantes *</legend>
        <input
          className="entity-modal-input familias-modal__member-search"
          type="search"
          value={memberSearch}
          onChange={(e) => setMemberSearch(e.target.value)}
          placeholder="Buscar socio por nombre o DNI"
        />
        <div className="familias-modal__member-list">
          {visible.map((partner) => {
            const belongsElsewhere =
              partner.id_familia &&
              partner.familia_activa !== false &&
              partner.id_familia !== Number(form.id_familia || 0);
            const selected = form.integrante_ids.includes(partner.id_socio);
            const inactive = partner.activo === false;
            return (
              <label
                key={partner.id_socio}
                className={`entity-check-option ${selected ? "is-selected" : ""}`.trim()}
                title={
                  belongsElsewhere
                    ? `Ya pertenece a ${partner.familia}`
                    : inactive
                      ? "Socio dado de baja"
                      : ""
                }
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={Boolean(
                    belongsElsewhere || (inactive && !selected),
                  )}
                  onChange={() => toggle(partner.id_socio)}
                />
                <span>
                  {partner.apellido}, {partner.nombre} · DNI {partner.dni}
                  {belongsElsewhere ? ` · ${partner.familia}` : ""}
                  {inactive ? " · SOCIO DADO DE BAJA" : ""}
                </span>
              </label>
            );
          })}
          {!visible.length ? (
            <p className="entity-help">
              No hay socios disponibles con esa búsqueda.
            </p>
          ) : null}
        </div>
      </fieldset>
    </div>
  );
}

export default function Familias() {
  const writable = canWrite();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("activo");
  const filters = useMemo(
    () => ({ buscar: search, estado: status }),
    [search, status],
  );
  const { items, catalogos, loading, error, cargar } = useFamilias(filters);
  const [form, setForm] = useState(emptyForm());
  const [modalOpen, setModalOpen] = useState(false);
  const [stateModal, setStateModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const filtersUi = [
    {
      key: "estado",
      label: "Estado",
      type: "tabs",
      ariaLabel: "Estado de las familias",
      value: status,
      onChange: setStatus,
      options: [
        { value: "activo", label: "Activas" },
        { value: "inactivo", label: "Bajas" },
      ],
    },
    {
      key: "buscar",
      label: "Búsqueda",
      type: "search",
      placeholder: " ",
      value: search,
      onChange: setSearch,
    },
  ];
  const openNew = () => {
    setForm(emptyForm());
    setModalOpen(true);
  };
  const openEdit = (item) => {
    setForm({
      id_familia: item.id_familia,
      nombre: item.nombre,
      descripcion: item.descripcion || "",
      integrante_ids: item.integrante_ids || [],
    });
    setModalOpen(true);
  };
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await familiasApi.guardar(form);
      setModalOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };
  const changeState = async () => {
    if (!stateModal) return;
    const response = stateModal.activo
      ? await familiasApi.darBaja(stateModal.id_familia)
      : await familiasApi.reactivar(stateModal.id_familia);
    await cargar();
    return response;
  };
  return (
    <>
      <ModulePage
        title="Familias"
        filters={filtersUi}
        tabsInTitle
        primaryActionLabel="Nueva familia"
        onPrimaryAction={openNew}
        canCreate={writable}
        notice={
          !writable
            ? "Tu usuario tiene permiso de consulta. Las modificaciones están deshabilitadas."
            : null
        }
      >
        <ModuleFeedback
          type={feedback?.type || "error"}
          message={feedback?.message || error}
          duration={feedback?.duration}
          onClose={() => setFeedback(null)}
        />
        <div
          className="global-divTable familias-table"
          role="table"
          aria-label="Listado de familias"
        >
          <div
            className="mov-tableWrap global-divTable__wrap entity-table-wrap"
            role="rowgroup"
          >
            <div
              className="mov-gridTable mov-gridTable--head global-divTable__head familias-grid"
              role="row"
            >
              {[
                "Familia",
                "Descripción",
                "Integrantes",
                "Cantidad",
                "Estado",
                "Acciones",
              ].map((column) => (
                <div className="mov-gridCell--head" key={column}>
                  {column}
                </div>
              ))}
            </div>
            {loading && !items.length ? (
              <div className="module-empty">
                <strong>Cargando familias...</strong>
                <span>Consultando los grupos de la organización.</span>
              </div>
            ) : null}
            {!loading && !error && !items.length ? (
              <div className="module-empty">
                <strong>Sin familias para mostrar</strong>
                <span>Creá la primera familia o cambiá los filtros.</span>
              </div>
            ) : null}
            {items.map((item) => (
              <div
                className="mov-gridTable mov-gridTable--row global-divTable__row entity-table-row familias-grid"
                role="row"
                key={item.id_familia}
              >
                <div className="mov-gridCell is-strong">{item.nombre}</div>
                <div className="mov-gridCell">
                  <span className="entity-wrap-text">
                    {item.descripcion || "—"}
                  </span>
                </div>
                <div className="mov-gridCell">
                  <span className="entity-wrap-text">
                    {(item.integrantes || [])
                      .map(
                        (member) =>
                          `${member.apellido}, ${member.nombre}${member.activo === false ? " (BAJA)" : ""}`,
                      )
                      .join(" · ") || "SIN INTEGRANTES"}
                  </span>
                </div>
                <div className="mov-gridCell is-center">
                  <span className="mov-chip">{item.cantidad_integrantes}</span>
                </div>
                <div className="mov-gridCell">
                  <span
                    className={`mov-chip ${item.activo ? "mov-chip--ok" : "mov-chip--danger"}`}
                  >
                    {item.activo ? "ACTIVA" : "BAJA"}
                  </span>
                </div>
                <div className="mov-gridCell mov-gridCell--actions">
                  {writable ? (
                    <div className="mov-actionsInline">
                      <button
                        className="mov-iconBtn"
                        type="button"
                        title="Editar"
                        onClick={() => openEdit(item)}
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
                    </div>
                  ) : (
                    <span className="entity-readonly">CONSULTA</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ModulePage>

      <CrudModal
        open={modalOpen}
        title={form.id_familia ? "Editar familia" : "Nueva familia"}
        subtitle="Definí el grupo y elegí sus integrantes activos."
        onClose={() => setModalOpen(false)}
        onSubmit={save}
        saving={saving}
        submitLabel={form.id_familia ? "Guardar cambios" : "Crear familia"}
        modalClassName="familias-modal familias-modal--form"
        wide
      >
        <FamilyForm
          form={form}
          setForm={setForm}
          partners={catalogos.socios || []}
        />
      </CrudModal>
      <ModalEliminarGlobal
        open={Boolean(stateModal)}
        operacion={stateModal?.activo ? "baja" : "alta"}
        row={stateModal}
        title={
          stateModal?.activo ? "Dar de baja la familia" : "Reactivar familia"
        }
        message={
          stateModal?.activo
            ? "La familia quedará inactiva. Los pagos históricos no se modificarán."
            : "La familia volverá a estar disponible con los integrantes que no hayan sido reasignados."
        }
        warning={
          stateModal?.activo
            ? "Sus integrantes podrán asignarse a otra familia."
            : ""
        }
        details={
          stateModal
            ? [
                { label: "Familia", value: stateModal.nombre },
                {
                  label: "Integrantes",
                  value: stateModal.cantidad_integrantes,
                },
                {
                  label: "Estado actual",
                  value: stateModal.activo ? "ACTIVA" : "BAJA",
                },
              ]
            : []
        }
        onClose={() => setStateModal(null)}
        onConfirm={changeState}
        onToast={(type, message, duration) =>
          setFeedback({ type, message, duration })
        }
        confirmLabel={stateModal?.activo ? "Dar de baja" : "Reactivar"}
        loadingMessage={
          stateModal?.activo
            ? "Dando de baja la familia…"
            : "Reactivando la familia…"
        }
        successMessage={
          stateModal?.activo
            ? "Familia dada de baja correctamente."
            : "Familia reactivada correctamente."
        }
        errorMessage={
          stateModal?.activo
            ? "No se pudo dar de baja la familia."
            : "No se pudo reactivar la familia."
        }
      />
    </>
  );
}
