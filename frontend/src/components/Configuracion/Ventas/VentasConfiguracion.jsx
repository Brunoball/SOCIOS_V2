import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCashRegister,
  faChartLine,
  faPen,
  faToggleOff,
  faToggleOn,
  faUserCheck,
} from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../../Global/components/ModulePage";
import ModuleFeedback from "../../Global/components/ModuleFeedback";
import { canWrite } from "../../Global/auth/session";
import { ventasApi } from "../../Ventas/api/ventasApi";
import { apiPost } from "../../Global/api/apiClient";
import { uppercaseConfigText } from "../../Ventas/utils/textCase";
import ConfiguracionVentaModal from "./modales/ConfiguracionVentaModal";
import ConfiguracionAccionesModal from "./modales/ConfiguracionAccionesModal";
import "../../Ventas/shared/Ventas.css";

const emptyConfig = () => ({
  id_configuracion: "",
  nombre: "",
  descripcion: "",
  impacta_contable: true,
  id_proveedor_contable: "",
  id_categoria_contable: "",
  id_concepto_contable: "",
  permite_precio_manual: false,
  solicita_comprador: false,
});

function Empty({ loading }) {
  return (
    <div className="sales-empty">
      <FontAwesomeIcon icon={faCashRegister} />
      <strong>{loading ? "Cargando configuración..." : "No hay cajas configuradas"}</strong>
      <span>
        {loading
          ? "Consultando las cajas, sedes y canales de venta."
          : "Creá una caja, sede, punto o canal para poder registrar ventas."}
      </span>
    </div>
  );
}

function StatusBadge({ active }) {
  return (
    <span className={`sales-status sales-status--${active ? "activa" : "inactiva"}`}>
      {active ? "ACTIVA" : "INACTIVA"}
    </span>
  );
}

function ActionButton({ icon, label, onClick, tone = "", disabled = false }) {
  return (
    <button
      type="button"
      className={`sales-iconButton ${tone ? `sales-iconButton--${tone}` : ""}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  );
}

export default function VentasConfiguracion({ onBack }) {
  const writable = canWrite();
  const [catalogs, setCatalogs] = useState({
    configuraciones: [],
    opciones_contables: {
      PROVEEDOR: [],
      CATEGORIA_INGRESO: [],
      CONCEPTO_INGRESO: [],
    },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [actionItem, setActionItem] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ventasApi.catalogos();
      setCatalogs({
        configuraciones: data.configuraciones || [],
        opciones_contables: data.opciones_contables || {},
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.message || "No se pudo cargar la configuración de ventas.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const active = catalogs.configuraciones.filter((item) => item.activo);
    return [
      {
        label: "Cajas activas",
        value: active.length,
        detail: `${catalogs.configuraciones.length} configuradas en total`,
        icon: faCashRegister,
      },
      {
        label: "Con impacto contable",
        value: active.filter((item) => item.impacta_contable).length,
        detail: "Generan ingreso al confirmar",
        icon: faChartLine,
      },
      {
        label: "Comprador obligatorio",
        value: active.filter((item) => item.solicita_comprador).length,
        detail: "No permiten venta anónima",
        icon: faUserCheck,
      },
    ];
  }, [catalogs.configuraciones]);

  const edit = (item) => {
    setForm({
      ...emptyConfig(),
      ...uppercaseConfigText(item),
      id_configuracion: String(item.id_configuracion),
      id_proveedor_contable: item.id_proveedor_contable
        ? String(item.id_proveedor_contable)
        : "",
      id_categoria_contable: item.id_categoria_contable
        ? String(item.id_categoria_contable)
        : "",
      id_concepto_contable: item.id_concepto_contable
        ? String(item.id_concepto_contable)
        : "",
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const payload = uppercaseConfigText(form);
      await ventasApi.guardarConfiguracion(payload);
      setForm(null);
      await load();
      setFeedback({ type: "success", message: "Configuración de ventas guardada correctamente." });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.message || "No se pudo guardar la configuración de ventas.",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (item) => {
    setSaving(true);
    setFeedback(null);
    try {
      await ventasApi.estadoConfiguracion(item.id_configuracion, !item.activo);
      await load();
      setFeedback({
        type: "success",
        message: item.activo ? "Configuración dada de baja." : "Configuración reactivada.",
      });
      return true;
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.message || "No se pudo cambiar el estado de la configuración.",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    setSaving(true);
    setFeedback(null);
    try {
      await apiPost("ventas_configuracion_eliminar", {
        id_configuracion: item.id_configuracion,
      });
      await load();
      setFeedback({
        type: "success",
        message: "Configuración de ventas eliminada definitivamente.",
      });
      return true;
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.message || "No se pudo eliminar la configuración de ventas.",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ModulePage
        title="Configuración de ventas"
        description="Administrá las cajas, sedes, puntos o canales usados al registrar ventas."
        stats={stats}
        primaryActionLabel="Nueva configuración"
        onPrimaryAction={() => setForm(emptyConfig())}
        canCreate={writable}
        secondaryActions={[{
          key: "volver",
          label: "Volver a configuración",
          icon: faArrowLeft,
          onClick: onBack,
        }]}
        notice={
          !writable
            ? "Tu usuario tiene permiso de consulta. Las modificaciones están deshabilitadas."
            : "El medio de pago no se configura acá: se selecciona individualmente al registrar cada venta."
        }
      >
        {loading ? <Empty loading /> : null}
        {!loading && !catalogs.configuraciones.length ? <Empty /> : null}
        {!loading && catalogs.configuraciones.length ? (
          <div className="sales-cardGrid">
            {catalogs.configuraciones.map((item) => (
              <article
                className={`sales-configCard ${!item.activo ? "is-inactive" : ""}`}
                key={item.id_configuracion}
              >
                <header>
                  <span className="sales-cardIcon">
                    <FontAwesomeIcon icon={faCashRegister} />
                  </span>
                  <div>
                    <h3>{item.nombre}</h3>
                    <StatusBadge active={Boolean(item.activo)} />
                  </div>
                  {writable ? (
                    <div className="sales-actions">
                      <ActionButton
                        icon={faPen}
                        label="Editar"
                        onClick={() => edit(item)}
                        disabled={saving}
                      />
                      <ActionButton
                        icon={item.activo ? faToggleOff : faToggleOn}
                        label={item.activo ? "Dar de baja o eliminar" : "Reactivar o eliminar"}
                        tone={item.activo ? "danger" : "success"}
                        onClick={() => setActionItem(item)}
                        disabled={saving}
                      />
                    </div>
                  ) : null}
                </header>
                <p>{item.descripcion || "Sin descripción."}</p>
                <dl>
                  <div>
                    <dt>Impacto contable</dt>
                    <dd>{item.impacta_contable ? "AUTOMÁTICO" : "DESACTIVADO"}</dd>
                  </div>
                  <div>
                    <dt>Categoría / concepto</dt>
                    <dd>
                      {item.impacta_contable
                        ? `${item.categoria_nombre || "—"} · ${item.concepto_nombre || "—"}`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Comprador</dt>
                    <dd>{item.solicita_comprador ? "OBLIGATORIO" : "OPCIONAL"}</dd>
                  </div>
                  <div>
                    <dt>Precio manual</dt>
                    <dd>{item.permite_precio_manual ? "PERMITIDO" : "BLOQUEADO"}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : null}
      </ModulePage>

      <ConfiguracionVentaModal
        form={form}
        setForm={setForm}
        catalogs={catalogs}
        saving={saving}
        onSubmit={submit}
      />

      <ConfiguracionAccionesModal
        item={actionItem}
        saving={saving}
        onClose={() => !saving && setActionItem(null)}
        onChangeStatus={toggle}
        onDelete={remove}
      />

      <ModuleFeedback
        type={feedback?.type}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />
    </>
  );
}
