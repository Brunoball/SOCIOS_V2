import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPen,
  faRotateLeft,
  faUserSlash,
} from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../Global/components/ModulePage";
import CrudModal from "../Global/components/CrudModal";
import ModuleFeedback from "../Global/components/ModuleFeedback";
import { canWrite } from "../Global/auth/session";
import { sociosApi } from "./api/sociosApi";
import { useSocios } from "./hooks/useSocios";

const dateToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const upper = (value) => value.toLocaleUpperCase("es-AR");
const formatDate = (value) => value ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : "—";

function emptyForm(catalogos) {
  return {
    id_socio: "",
    nombre: "",
    apellido: "",
    dni: "",
    fecha_nacimiento: "",
    sexo: "NO_INFORMA",
    domicilio: "",
    id_localidad: catalogos?.localidades?.[0]?.id_localidad ? String(catalogos.localidades[0].id_localidad) : "__new__",
    localidad_nueva: "",
    telefono: "",
    email: "",
    fecha_ingreso: dateToday(),
    observaciones: "",
    categoria_ids: [],
  };
}

function SocioForm({ form, setForm, catalogos }) {
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleCategory = (id) => setForm((current) => ({
    ...current,
    categoria_ids: current.categoria_ids.includes(id)
      ? current.categoria_ids.filter((item) => item !== id)
      : [...current.categoria_ids, id],
  }));
  return (
    <div className="entity-form">
      <div className="entity-form__grid">
        <label className="entity-field"><span>Apellido *</span><input value={form.apellido} onChange={(e) => update("apellido", upper(e.target.value))} required maxLength={120} /></label>
        <label className="entity-field"><span>Nombre *</span><input value={form.nombre} onChange={(e) => update("nombre", upper(e.target.value))} required maxLength={120} /></label>
        <label className="entity-field"><span>DNI *</span><input value={form.dni} onChange={(e) => update("dni", e.target.value.replace(/[^0-9A-Za-z.-]/g, ""))} required maxLength={20} inputMode="numeric" /></label>
        <label className="entity-field"><span>Fecha de nacimiento</span><input type="date" value={form.fecha_nacimiento} max={dateToday()} onChange={(e) => update("fecha_nacimiento", e.target.value)} /></label>
        <label className="entity-field"><span>Sexo</span><select value={form.sexo} onChange={(e) => update("sexo", e.target.value)}><option value="NO_INFORMA">NO INFORMA</option><option value="MASCULINO">MASCULINO</option><option value="FEMENINO">FEMENINO</option><option value="OTRO">OTRO</option></select></label>
        <label className="entity-field"><span>Fecha de ingreso *</span><input type="date" value={form.fecha_ingreso} max={dateToday()} onChange={(e) => update("fecha_ingreso", e.target.value)} required /></label>
        <label className="entity-field entity-field--wide"><span>Domicilio</span><input value={form.domicilio} onChange={(e) => update("domicilio", upper(e.target.value))} maxLength={255} /></label>
        <label className="entity-field">
          <span>Localidad *</span>
          <select value={form.id_localidad} onChange={(e) => update("id_localidad", e.target.value)} required>
            {(catalogos.localidades || []).map((item) => <option key={item.id_localidad} value={item.id_localidad}>{item.nombre}</option>)}
            <option value="__new__">+ AGREGAR LOCALIDAD</option>
          </select>
        </label>
        {form.id_localidad === "__new__" ? <label className="entity-field"><span>Nueva localidad *</span><input value={form.localidad_nueva} onChange={(e) => update("localidad_nueva", upper(e.target.value))} required maxLength={120} /></label> : null}
        <label className="entity-field"><span>Teléfono</span><input value={form.telefono} onChange={(e) => update("telefono", e.target.value)} maxLength={50} /></label>
        <label className="entity-field"><span>Email</span><input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} maxLength={190} /></label>
        <label className="entity-field entity-field--wide"><span>Observaciones</span><textarea value={form.observaciones} onChange={(e) => update("observaciones", upper(e.target.value))} rows={3} maxLength={5000} /></label>
      </div>
      <fieldset className="entity-checks">
        <legend>Categorías del socio</legend>
        {(catalogos.categorias || []).length ? (catalogos.categorias || []).map((category) => (
          <label key={category.id_categoria} className={form.categoria_ids.includes(category.id_categoria) ? "is-selected" : ""}>
            <input type="checkbox" checked={form.categoria_ids.includes(category.id_categoria)} onChange={() => toggleCategory(category.id_categoria)} />
            <span>{category.nombre}</span>
          </label>
        )) : <p className="entity-help">Primero creá una categoría para poder asignarla.</p>}
      </fieldset>
    </div>
  );
}

export default function Socios() {
  const writable = canWrite();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("activo");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const filters = useMemo(() => ({ buscar: search, estado: status, categoria: category, localidad: location }), [search, status, category, location]);
  const { items, catalogos, loading, error, cargar } = useSocios(filters);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm({}));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [stateModal, setStateModal] = useState(null);
  const [stateForm, setStateForm] = useState({ fecha_baja: dateToday(), motivo_baja: "" });

  const openNew = () => {
    setForm(emptyForm(catalogos));
    setModalOpen(true);
  };
  const openEdit = (item) => {
    setForm({
      ...emptyForm(catalogos),
      ...item,
      id_socio: item.id_socio,
      id_localidad: String(item.id_localidad),
      fecha_nacimiento: item.fecha_nacimiento || "",
      categoria_ids: item.categoria_ids || [],
    });
    setModalOpen(true);
  };
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        id_localidad: form.id_localidad === "__new__" ? null : Number(form.id_localidad),
        localidad_nueva: form.id_localidad === "__new__" ? form.localidad_nueva : null,
      };
      const response = await sociosApi.guardar(payload);
      setModalOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };
  const changeState = async (event) => {
    event.preventDefault();
    if (!stateModal) return;
    setSaving(true);
    try {
      const response = stateModal.activo
        ? await sociosApi.darBaja({ id: stateModal.id_socio, ...stateForm })
        : await sociosApi.reactivar(stateModal.id_socio);
      setStateModal(null);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const pageFilters = [
    { key: "buscar", label: "Buscar socio", type: "search", placeholder: "Nombre, DNI o teléfono", value: search, onChange: setSearch },
    { key: "categoria", label: "Categoría", type: "select", placeholder: "Todas", value: category, onChange: setCategory, options: (catalogos.categorias || []).map((item) => ({ value: item.id_categoria, label: item.nombre })) },
    { key: "localidad", label: "Localidad", type: "select", placeholder: "Todas", value: location, onChange: setLocation, options: (catalogos.localidades || []).map((item) => ({ value: item.id_localidad, label: item.nombre })) },
  ];
  const template = "minmax(190px,1.4fr) minmax(110px,.65fr) minmax(160px,1fr) minmax(140px,.9fr) minmax(160px,1fr) minmax(110px,.7fr) minmax(90px,.6fr) minmax(96px,.55fr)";

  return (
    <>
      <ModulePage title="Socios" description="Alta, consulta y administración general de socios." filters={pageFilters} primaryActionLabel="Nuevo socio" onPrimaryAction={openNew} canCreate={writable} notice={!writable ? "Tu usuario tiene permiso de consulta. Las modificaciones están deshabilitadas." : null}>
        <div className="mov-tabsBar">
          <div className="mov-tabs" role="tablist" aria-label="Estado de los socios">
            <button type="button" role="tab" aria-selected={status === "activo"} className={`mov-tab ${status === "activo" ? "is-active" : ""}`} onClick={() => setStatus("activo")}>Activos</button>
            <button type="button" role="tab" aria-selected={status === "inactivo"} className={`mov-tab ${status === "inactivo" ? "is-active" : ""}`} onClick={() => setStatus("inactivo")}>Bajas</button>
          </div>
        </div>
        <ModuleFeedback type={feedback?.type || "error"} message={feedback?.message || error} onClose={() => setFeedback(null)} />
        <div className="mov-tableWrap global-divTable__wrap entity-table-wrap">
          <div className="mov-gridTable mov-gridTable--head" style={{ gridTemplateColumns: template, minWidth: 1180 }}>
            {["Socio", "DNI", "Categorías", "Familia", "Contacto", "Ingreso", "Estado", "Acciones"].map((column) => <div className="mov-gridCell--head" key={column}>{column}</div>)}
          </div>
          {loading && !items.length ? <div className="module-empty"><strong>Cargando socios...</strong><span>Consultando el padrón de la organización.</span></div> : null}
          {!loading && !items.length ? <div className="module-empty"><strong>Sin socios para mostrar</strong><span>Creá el primer socio o cambiá los filtros aplicados.</span></div> : null}
          {items.map((item) => (
            <div className="mov-gridTable mov-gridTable--row entity-table-row" style={{ gridTemplateColumns: template, minWidth: 1180 }} key={item.id_socio}>
              <div className="mov-gridCell entity-main-cell"><strong>{item.apellido}, {item.nombre}</strong><small>{item.localidad}{item.domicilio ? ` · ${item.domicilio}` : ""}</small></div>
              <div className="mov-gridCell is-strong">{item.dni}</div>
              <div className="mov-gridCell"><span className="entity-wrap-text">{item.categorias || "SIN CATEGORÍA"}</span></div>
              <div className="mov-gridCell">{item.familia || "—"}</div>
              <div className="mov-gridCell entity-main-cell"><span>{item.telefono || "—"}</span><small>{item.email || ""}</small></div>
              <div className="mov-gridCell">{formatDate(item.fecha_ingreso)}</div>
              <div className="mov-gridCell"><span className={`mov-chip ${item.activo ? "mov-chip--ok" : "mov-chip--danger"}`}>{item.activo ? "ACTIVO" : "BAJA"}</span></div>
              <div className="mov-gridCell mov-gridCell--actions">
                {writable ? <div className="mov-actionsInline">
                  <button className="mov-iconBtn" type="button" title="Editar" onClick={() => openEdit(item)}><FontAwesomeIcon icon={faPen} /></button>
                  <button className={`mov-iconBtn ${item.activo ? "mov-iconBtn--danger" : ""}`} type="button" title={item.activo ? "Dar de baja" : "Reactivar"} onClick={() => { setStateForm({ fecha_baja: dateToday(), motivo_baja: "" }); setStateModal(item); }}><FontAwesomeIcon icon={item.activo ? faUserSlash : faRotateLeft} /></button>
                </div> : <span className="entity-readonly">CONSULTA</span>}
              </div>
            </div>
          ))}
        </div>
      </ModulePage>

      <CrudModal open={modalOpen} title={form.id_socio ? "Editar socio" : "Nuevo socio"} subtitle="Completá la ficha personal y sus categorías." onClose={() => setModalOpen(false)} onSubmit={save} saving={saving} submitLabel={form.id_socio ? "Guardar cambios" : "Crear socio"} wide>
        <SocioForm form={form} setForm={setForm} catalogos={catalogos} />
      </CrudModal>

      <CrudModal open={Boolean(stateModal)} title={stateModal?.activo ? "Dar de baja al socio" : "Reactivar socio"} subtitle={stateModal ? `${stateModal.apellido}, ${stateModal.nombre}` : ""} onClose={() => setStateModal(null)} onSubmit={changeState} saving={saving} submitLabel={stateModal?.activo ? "Confirmar baja" : "Reactivar"} danger={Boolean(stateModal?.activo)}>
        {stateModal?.activo ? <div className="entity-form__grid entity-form__grid--single">
          <label className="entity-field"><span>Fecha de baja *</span><input type="date" value={stateForm.fecha_baja} min={stateModal.fecha_ingreso} max={dateToday()} onChange={(e) => setStateForm((current) => ({ ...current, fecha_baja: e.target.value }))} required /></label>
          <label className="entity-field"><span>Motivo de baja *</span><textarea value={stateForm.motivo_baja} onChange={(e) => setStateForm((current) => ({ ...current, motivo_baja: upper(e.target.value) }))} rows={3} required maxLength={500} /></label>
        </div> : <p className="entity-confirm-text">El socio volverá a estar disponible para nuevas categorías y operaciones.</p>}
      </CrudModal>
    </>
  );
}
