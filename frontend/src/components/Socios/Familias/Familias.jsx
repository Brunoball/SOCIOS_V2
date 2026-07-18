import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faRotateLeft, faToggleOff } from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../../Global/components/ModulePage";
import CrudModal from "../../Global/components/CrudModal";
import ModuleFeedback from "../../Global/components/ModuleFeedback";
import { canWrite } from "../../Global/auth/session";
import { familiasApi } from "../api/familiasApi";
import { useFamilias } from "../hooks/useFamilias";

const upper = (value) => value.toLocaleUpperCase("es-AR");
const emptyForm = () => ({ id_familia: "", nombre: "", descripcion: "", integrante_ids: [] });

function FamilyForm({ form, setForm, partners }) {
  const [memberSearch, setMemberSearch] = useState("");
  const visible = partners.filter((partner) => (
    (partner.activo !== false || form.integrante_ids.includes(partner.id_socio))
    && `${partner.apellido} ${partner.nombre} ${partner.dni}`.toLowerCase().includes(memberSearch.toLowerCase())
  ));
  const toggle = (id) => setForm((current) => ({
    ...current,
    integrante_ids: current.integrante_ids.includes(id)
      ? current.integrante_ids.filter((item) => item !== id)
      : [...current.integrante_ids, id],
  }));
  return (
    <div className="entity-form">
      <div className="entity-form__grid entity-form__grid--single">
        <label className="entity-field"><span>Nombre de la familia *</span><input value={form.nombre} onChange={(e) => setForm((current) => ({ ...current, nombre: upper(e.target.value) }))} required maxLength={150} placeholder="EJ.: FAMILIA GONZÁLEZ" /></label>
        <label className="entity-field"><span>Descripción</span><textarea value={form.descripcion} onChange={(e) => setForm((current) => ({ ...current, descripcion: upper(e.target.value) }))} rows={3} maxLength={500} /></label>
      </div>
      <fieldset className="entity-checks entity-checks--members">
        <legend>Integrantes *</legend>
        <input className="entity-member-search" type="search" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Buscar socio por nombre o DNI" />
        <div className="entity-checks__scroll">
          {visible.map((partner) => {
            const belongsElsewhere = partner.id_familia && partner.id_familia !== Number(form.id_familia || 0);
            const selected = form.integrante_ids.includes(partner.id_socio);
            const inactive = partner.activo === false;
            return (
              <label key={partner.id_socio} className={selected ? "is-selected" : ""} title={belongsElsewhere ? `Ya pertenece a ${partner.familia}` : inactive ? "Socio dado de baja" : ""}>
                <input type="checkbox" checked={selected} disabled={Boolean(belongsElsewhere || (inactive && !selected))} onChange={() => toggle(partner.id_socio)} />
                <span>{partner.apellido}, {partner.nombre} · DNI {partner.dni}{belongsElsewhere ? ` · ${partner.familia}` : ""}{inactive ? " · SOCIO DADO DE BAJA" : ""}</span>
              </label>
            );
          })}
          {!visible.length ? <p className="entity-help">No hay socios disponibles con esa búsqueda.</p> : null}
        </div>
      </fieldset>
    </div>
  );
}

export default function Familias() {
  const writable = canWrite();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("activo");
  const filters = useMemo(() => ({ buscar: search, estado: status }), [search, status]);
  const { items, catalogos, loading, error, cargar } = useFamilias(filters);
  const [form, setForm] = useState(emptyForm());
  const [modalOpen, setModalOpen] = useState(false);
  const [stateModal, setStateModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const filtersUi = [
    { key: "buscar", label: "Buscar familia", type: "search", placeholder: "Familia, socio o DNI", value: search, onChange: setSearch },
  ];
  const openNew = () => { setForm(emptyForm()); setModalOpen(true); };
  const openEdit = (item) => {
    setForm({ id_familia: item.id_familia, nombre: item.nombre, descripcion: item.descripcion || "", integrante_ids: item.integrante_ids || [] });
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
    } finally { setSaving(false); }
  };
  const changeState = async (event) => {
    event.preventDefault();
    if (!stateModal) return;
    setSaving(true);
    try {
      const response = stateModal.activo ? await familiasApi.darBaja(stateModal.id_familia) : await familiasApi.reactivar(stateModal.id_familia);
      setStateModal(null);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally { setSaving(false); }
  };
  const template = "minmax(190px,1.1fr) minmax(220px,1.4fr) minmax(260px,1.7fr) minmax(100px,.55fr) minmax(105px,.6fr) minmax(96px,.55fr)";

  return (
    <>
      <ModulePage title="Familias" description="Agrupación de socios para consulta y descuentos familiares." filters={filtersUi} primaryActionLabel="Nueva familia" onPrimaryAction={openNew} canCreate={writable} notice={!writable ? "Tu usuario tiene permiso de consulta. Las modificaciones están deshabilitadas." : null}>
        <div className="mov-tabsBar">
          <div className="mov-tabs" role="tablist" aria-label="Estado de las familias">
            <button type="button" role="tab" aria-selected={status === "activo"} className={`mov-tab ${status === "activo" ? "is-active" : ""}`} onClick={() => setStatus("activo")}>Activas</button>
            <button type="button" role="tab" aria-selected={status === "inactivo"} className={`mov-tab ${status === "inactivo" ? "is-active" : ""}`} onClick={() => setStatus("inactivo")}>Dadas de baja</button>
          </div>
        </div>
        <ModuleFeedback type={feedback?.type || "error"} message={feedback?.message || error} onClose={() => setFeedback(null)} />
        <div className="mov-tableWrap global-divTable__wrap entity-table-wrap">
          <div className="mov-gridTable mov-gridTable--head" style={{ gridTemplateColumns: template, minWidth: 1050 }}>
            {["Familia", "Descripción", "Integrantes", "Cantidad", "Estado", "Acciones"].map((column) => <div className="mov-gridCell--head" key={column}>{column}</div>)}
          </div>
          {loading && !items.length ? <div className="module-empty"><strong>Cargando familias...</strong><span>Consultando los grupos de la organización.</span></div> : null}
          {!loading && !items.length ? <div className="module-empty"><strong>Sin familias para mostrar</strong><span>Creá la primera familia o cambiá los filtros.</span></div> : null}
          {items.map((item) => (
            <div className="mov-gridTable mov-gridTable--row entity-table-row" style={{ gridTemplateColumns: template, minWidth: 1050 }} key={item.id_familia}>
              <div className="mov-gridCell is-strong">{item.nombre}</div>
              <div className="mov-gridCell"><span className="entity-wrap-text">{item.descripcion || "—"}</span></div>
              <div className="mov-gridCell"><span className="entity-wrap-text">{(item.integrantes || []).map((member) => `${member.apellido}, ${member.nombre}${member.activo === false ? " (BAJA)" : ""}`).join(" · ") || "SIN INTEGRANTES"}</span></div>
              <div className="mov-gridCell is-center"><span className="mov-chip">{item.cantidad_integrantes}</span></div>
              <div className="mov-gridCell"><span className={`mov-chip ${item.activo ? "mov-chip--ok" : "mov-chip--danger"}`}>{item.activo ? "ACTIVA" : "BAJA"}</span></div>
              <div className="mov-gridCell mov-gridCell--actions">
                {writable ? <div className="mov-actionsInline">
                  <button className="mov-iconBtn" type="button" title="Editar" onClick={() => openEdit(item)}><FontAwesomeIcon icon={faPen} /></button>
                  <button className={`mov-iconBtn ${item.activo ? "mov-iconBtn--danger" : ""}`} type="button" title={item.activo ? "Dar de baja" : "Reactivar"} onClick={() => setStateModal(item)}><FontAwesomeIcon icon={item.activo ? faToggleOff : faRotateLeft} /></button>
                </div> : <span className="entity-readonly">CONSULTA</span>}
              </div>
            </div>
          ))}
        </div>
      </ModulePage>

      <CrudModal open={modalOpen} title={form.id_familia ? "Editar familia" : "Nueva familia"} subtitle="Definí el grupo y elegí sus integrantes activos." onClose={() => setModalOpen(false)} onSubmit={save} saving={saving} submitLabel={form.id_familia ? "Guardar cambios" : "Crear familia"} wide>
        <FamilyForm form={form} setForm={setForm} partners={catalogos.socios || []} />
      </CrudModal>
      <CrudModal open={Boolean(stateModal)} title={stateModal?.activo ? "Dar de baja la familia" : "Reactivar familia"} subtitle={stateModal?.nombre || ""} onClose={() => setStateModal(null)} onSubmit={changeState} saving={saving} submitLabel={stateModal?.activo ? "Confirmar baja" : "Reactivar"} danger={Boolean(stateModal?.activo)}>
        <p className="entity-confirm-text">{stateModal?.activo ? "La familia dejará de estar disponible para nuevas operaciones, pero conservará sus integrantes y pagos históricos." : "La familia volverá a estar disponible para nuevas operaciones."}</p>
      </CrudModal>
    </>
  );
}
