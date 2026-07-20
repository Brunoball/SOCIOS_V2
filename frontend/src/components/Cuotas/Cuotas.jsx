import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileExcel,
  faPrint,
  faReceipt,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../Global/components/ModulePage";
import CrudModal from "../Global/components/CrudModal";
import ModuleFeedback from "../Global/components/ModuleFeedback";
import { canWrite } from "../Global/auth/session";
import { cuotasApi } from "./api/cuotasApi";
import { useCuotas } from "./hooks/useCuotas";
import "./Cuotas.css";
import "./CuotasModal.css";

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};
const currentDate = new Date();
const currentYear = currentDate.getFullYear();
const currentMonth = currentDate.getMonth() + 1;
const PACKAGE_MODALITY_MONTHS = {
  PRIMERA_MITAD: [1, 2, 3, 4, 5, 6],
  SEGUNDA_MITAD: [7, 8, 9, 10, 11, 12],
  CONTADO_ANUAL: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};
const FALLBACK_MODALITIES = [
  { codigo: "MENSUAL", nombre: "CUOTAS MENSUALES" },
  { codigo: "PRIMERA_MITAD", nombre: "PRIMERA MITAD" },
  { codigo: "SEGUNDA_MITAD", nombre: "SEGUNDA MITAD" },
  { codigo: "CONTADO_ANUAL", nombre: "CONTADO ANUAL" },
  { codigo: "INSCRIPCION", nombre: "INSCRIPCIÓN" },
];
const modalityOptionLabel = (item) => {
  switch (item.codigo) {
    case "PRIMERA_MITAD":
      return `${item.nombre} · ENERO A JUNIO`;
    case "SEGUNDA_MITAD":
      return `${item.nombre} · JULIO A DICIEMBRE`;
    case "CONTADO_ANUAL":
      return `${item.nombre} · ENERO A DICIEMBRE`;
    default:
      return item.nombre;
  }
};
const money = (value) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    Number(value || 0),
  );
const percent = (value) =>
  `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(Number(value || 0))}%`;
const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : "—";
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#039;",
        '"': "&quot;",
      })[character],
  );

function printDocument(title, content, targetWindow = null) {
  const popup =
    targetWindow || window.open("", "_blank", "width=1050,height=760");
  if (!popup) return null;
  popup.document.open();
  popup.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#29201e;margin:0}h1{margin:0 0 4px;font-size:22px}p{margin:3px 0;color:#6f625e}.head{display:flex;justify-content:space-between;gap:20px;padding-bottom:14px;border-bottom:2px solid #3a2e2b}.meta{text-align:right}.summary{display:flex;gap:18px;margin:14px 0;padding:12px;background:#f8f3ed;border-radius:10px}.summary b{display:block;font-size:17px}.summary span{font-size:11px;color:#6f625e}table{width:100%;border-collapse:collapse;margin-top:14px;font-size:11px}th{padding:9px 7px;text-align:left;color:#fff;background:#3a2e2b}td{padding:8px 7px;border-bottom:1px solid #ddd;vertical-align:top}.right{text-align:right}.badge{display:inline-block;padding:4px 7px;border-radius:999px;background:#f4e4ca;font-weight:bold}.foot{margin-top:22px;padding-top:12px;border-top:1px solid #ddd;font-size:10px;color:#766}.no-print{margin:15px 0}@media print{.no-print{display:none}}
  </style></head><body><button class="no-print" onclick="window.print()">Imprimir</button>${content}</body></html>`);
  popup.document.close();
  popup.focus();
  return popup;
}

function excelDownload(filename, headers, rows) {
  const table = `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const blob = new Blob(
    [
      "\ufeff",
      `<html><head><meta charset="utf-8"></head><body>${table}</body></html>`,
    ],
    { type: "application/vnd.ms-excel;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filename}.xls`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const emptyPaymentForm = () => ({
  modalidad: "MENSUAL",
  aplicar_familia: false,
  id_categoria: "",
  anio: String(currentYear),
  seleccion: {},
  id_medio_pago: "",
  fecha_pago: today(),
  condonado: false,
  motivo_condonacion: "",
  observaciones: "",
  monto_inscripcion: "",
  descripcion_inscripcion: `INSCRIPCIÓN ${currentYear}`,
});

export default function Cuotas() {
  const writable = canWrite();
  const [tab, setTab] = useState("deudores");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [year, setYear] = useState(String(currentYear));
  const [month, setMonth] = useState(String(currentMonth));
  const [modality, setModality] = useState("");
  const filters = useMemo(
    () => ({
      pestana: tab,
      buscar: search,
      categoria: category,
      anio: year,
      mes: month,
      modalidad: tab === "deudores" ? "" : modality,
    }),
    [tab, search, category, year, month, modality],
  );
  const { items, catalogos, loading, error, cargar } = useCuotas(filters);
  const [fullCatalogs, setFullCatalogs] = useState({
    socios: [],
    categorias: [],
    medios_pago: [],
  });
  const [feedback, setFeedback] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedPartner, setPickedPartner] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentDetail, setPaymentDetail] = useState(null);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm());
  const [saving, setSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState(null);

  useEffect(() => {
    let active = true;
    cuotasApi
      .catalogos()
      .then((response) => {
        if (active)
          setFullCatalogs({
            socios: response.socios || [],
            categorias: response.categorias || [],
            medios_pago: response.medios_pago || [],
          });
      })
      .catch(
        (err) => active && setFeedback({ type: "error", message: err.message }),
      );
    return () => {
      active = false;
    };
  }, []);

  const openPayment = async (
    partnerId,
    initialCategory = "",
    initialPeriod = null,
  ) => {
    setPickerOpen(false);
    setPaymentOpen(true);
    setPaymentLoading(true);
    setPaymentDetail(null);
    setFeedback(null);
    try {
      const detail = await cuotasApi.detalleSocio(partnerId);
      if (!detail.categorias?.length)
        throw new Error("El socio no tiene categorías activas asignadas.");
      const selectedCategory = String(
        initialCategory || detail.categorias?.[0]?.id_categoria || "",
      );
      const selectedYear = String(initialPeriod?.anio || currentYear);
      const initialSelection = {};
      if (initialPeriod && initialCategory) {
        const initialPeriods = (detail.periodos || []).filter(
          (period) =>
            Number(period.id_categoria) === Number(initialCategory) &&
            Number(period.anio) === Number(initialPeriod.anio) &&
            Number(period.id_mes) === Number(initialPeriod.mes) &&
            period.estado === "PENDIENTE",
        );
        initialPeriods.forEach((period) => {
          initialSelection[period.clave] = true;
        });
      }
      setPaymentDetail(detail);
      setPaymentForm({
        ...emptyPaymentForm(),
        aplicar_familia: Boolean(detail.familia),
        id_categoria: selectedCategory,
        anio: selectedYear,
        seleccion: initialSelection,
        id_medio_pago: String(detail.medios_pago?.[0]?.id_medio_pago || ""),
        monto_inscripcion: String(detail.monto_inscripcion ?? ""),
      });
    } catch (err) {
      setPaymentOpen(false);
      setFeedback({ type: "error", message: err.message });
    } finally {
      setPaymentLoading(false);
    }
  };

  const changePaymentYear = (value) => {
    setPaymentForm((current) => ({
      ...current,
      anio: value,
      modalidad: "MENSUAL",
      seleccion: {},
      descripcion_inscripcion: `INSCRIPCIÓN ${value}`,
    }));
  };

  const updateForm = (key, value) =>
    setPaymentForm((current) => ({ ...current, [key]: value }));

  const changePaymentCategory = (value) =>
    setPaymentForm((current) => ({
      ...current,
      id_categoria: value,
      modalidad: "MENSUAL",
      seleccion: {},
    }));

  const changeFamilyScope = (checked) => {
    setPaymentForm((current) => {
      if (!paymentDetail) return { ...current, aplicar_familia: checked };

      const selectedMonths = new Set(
        paymentDetail.periodos
          .filter(
            (period) =>
              current.seleccion[period.clave] &&
              String(period.id_categoria) === String(current.id_categoria) &&
              String(period.anio) === String(current.anio),
          )
          .map((period) => Number(period.id_mes)),
      );
      const selection = {};
      paymentDetail.periodos.forEach((period) => {
        const isVisible =
          String(period.id_categoria) === String(current.id_categoria) &&
          String(period.anio) === String(current.anio) &&
          (checked ||
            Number(period.id_socio) ===
              Number(paymentDetail.socio.id_socio));
        if (
          isVisible &&
          period.estado === "PENDIENTE" &&
          selectedMonths.has(Number(period.id_mes))
        ) {
          selection[period.clave] = true;
        }
      });
      return {
        ...current,
        aplicar_familia: checked,
        modalidad: "MENSUAL",
        seleccion: selection,
      };
    });
  };

  const visiblePeriods = useMemo(() => {
    if (!paymentDetail) return [];
    return paymentDetail.periodos.filter(
      (period) =>
        String(period.id_categoria) === String(paymentForm.id_categoria) &&
        String(period.anio) === String(paymentForm.anio) &&
        (paymentForm.aplicar_familia ||
          Number(period.id_socio) === Number(paymentDetail.socio.id_socio)),
    );
  }, [
    paymentDetail,
    paymentForm.id_categoria,
    paymentForm.anio,
    paymentForm.aplicar_familia,
  ]);

  const groupedPeriods = useMemo(() => {
    const groups = {};
    visiblePeriods.forEach((period) => {
      if (!groups[period.id_socio])
        groups[period.id_socio] = {
          id_socio: period.id_socio,
          socio: period.socio,
          periods: [],
        };
      groups[period.id_socio].periods.push(period);
    });
    return Object.values(groups);
  }, [visiblePeriods]);

  const selectedPeriods = useMemo(
    () =>
      visiblePeriods.filter(
        (period) =>
          paymentForm.seleccion[period.clave] &&
          period.estado === "PENDIENTE",
      ),
    [visiblePeriods, paymentForm.seleccion],
  );

  const totals = useMemo(
    () =>
      selectedPeriods.reduce(
        (result, period) => ({
          base: result.base + Number(period.monto_base || 0),
          final: result.final + Number(period.monto || 0),
        }),
        { base: 0, final: 0 },
      ),
    [selectedPeriods],
  );

  const togglePeriod = (selectedPeriod) =>
    setPaymentForm((current) => {
      const matching = current.aplicar_familia
        ? visiblePeriods.filter(
            (period) =>
              period.estado === "PENDIENTE" &&
              Number(period.id_mes) === Number(selectedPeriod.id_mes),
          )
        : [selectedPeriod];
      const allSelected = matching.every(
        (period) => current.seleccion[period.clave],
      );
      const selection = { ...current.seleccion };
      matching.forEach((period) => {
        selection[period.clave] = !allSelected;
      });
      return { ...current, seleccion: selection };
    });

  const selectVisible = (predicate) =>
    setPaymentForm((current) => {
      const selection = { ...current.seleccion };
      visiblePeriods.forEach((period) => {
        if (period.estado === "PENDIENTE" && predicate(period))
          selection[period.clave] = true;
      });
      return { ...current, seleccion: selection };
    });

  const clearVisible = () =>
    setPaymentForm((current) => {
      const selection = { ...current.seleccion };
      visiblePeriods.forEach((period) => {
        delete selection[period.clave];
      });
      return { ...current, seleccion: selection };
    });

  const registrationRecipients = useMemo(() => {
    if (!paymentDetail) return [];
    const allowedMembers = paymentDetail.integrantes.filter(
      (member) => paymentForm.aplicar_familia || member.es_principal,
    );
    return allowedMembers
      .map((member) => {
        const hasCategory = paymentDetail.periodos.some(
          (period) =>
            Number(period.id_socio) === Number(member.id_socio) &&
            String(period.id_categoria) === String(paymentForm.id_categoria) &&
            String(period.anio) === String(paymentForm.anio),
        );
        const registered = paymentDetail.inscripciones.find(
          (registration) =>
            Number(registration.id_socio) === Number(member.id_socio) &&
            String(registration.id_categoria) ===
              String(paymentForm.id_categoria) &&
            String(registration.anio) === String(paymentForm.anio),
        );
        return {
          ...member,
          hasCategory,
          estado: registered?.estado || "PENDIENTE",
        };
      })
      .filter((member) => member.hasCategory);
  }, [
    paymentDetail,
    paymentForm.aplicar_familia,
    paymentForm.id_categoria,
    paymentForm.anio,
  ]);

  const availableModalities = useMemo(() => {
    if (!paymentDetail) return [];
    const configured = paymentDetail.modalidades?.length
      ? paymentDetail.modalidades
      : FALLBACK_MODALITIES;
    const hasPendingMonthly = visiblePeriods.some(
      (period) => period.estado === "PENDIENTE",
    );
    const hasAnyRegisteredMonth = visiblePeriods.some(
      (period) => period.estado !== "PENDIENTE",
    );
    const pendingRegistration = registrationRecipients.some(
      (member) => member.estado === "PENDIENTE",
    );
    const packageAvailable = (code) => {
      const months = PACKAGE_MODALITY_MONTHS[code] || [];
      if (!months.length || !groupedPeriods.length) return false;
      if (
        ["PRIMERA_MITAD", "CONTADO_ANUAL"].includes(code) &&
        hasAnyRegisteredMonth
      ) {
        return false;
      }
      return groupedPeriods.every((group) => {
        const periodsByMonth = new Map(
          group.periods.map((period) => [Number(period.id_mes), period]),
        );
        return months.every(
          (monthNumber) =>
            periodsByMonth.get(monthNumber)?.estado === "PENDIENTE",
        );
      });
    };

    return configured
      .map((item) => ({
        ...item,
        codigo: String(item.codigo || "").toUpperCase(),
        nombre:
          String(item.codigo || "").toUpperCase() === "MENSUAL"
            ? "CUOTAS MENSUALES"
            : item.nombre,
      }))
      .filter((item) => {
        if (item.codigo === "MENSUAL") return hasPendingMonthly;
        if (item.codigo === "INSCRIPCION") return pendingRegistration;
        return packageAvailable(item.codigo);
      });
  }, [
    paymentDetail,
    visiblePeriods,
    groupedPeriods,
    registrationRecipients,
  ]);

  const availableModalityCodes = useMemo(
    () => availableModalities.map((item) => item.codigo),
    [availableModalities],
  );

  useEffect(() => {
    if (!paymentDetail || !availableModalityCodes.length) return;
    if (availableModalityCodes.includes(paymentForm.modalidad)) return;
    const fallback = availableModalityCodes.includes("MENSUAL")
      ? "MENSUAL"
      : availableModalityCodes[0];
    setPaymentForm((current) => ({
      ...current,
      modalidad: fallback,
      seleccion: {},
    }));
  }, [
    paymentDetail,
    availableModalityCodes,
    paymentForm.modalidad,
  ]);

  const changePaymentModality = (code) => {
    const months = PACKAGE_MODALITY_MONTHS[code] || [];
    const selection = {};
    if (months.length) {
      const allowedMonths = new Set(months);
      visiblePeriods.forEach((period) => {
        if (
          period.estado === "PENDIENTE" &&
          allowedMonths.has(Number(period.id_mes))
        ) {
          selection[period.clave] = true;
        }
      });
    }
    setPaymentForm((current) => ({
      ...current,
      modalidad: code,
      seleccion: selection,
    }));
  };

  const isRegistrationMode = paymentForm.modalidad === "INSCRIPCION";
  const isPackageMode = Boolean(
    PACKAGE_MODALITY_MONTHS[paymentForm.modalidad],
  );

  const savePayment = async (event) => {
    event.preventDefault();
    if (!paymentDetail) return;
    setSaving(true);
    try {
      let response;
      if (!isRegistrationMode) {
        if (!selectedPeriods.length)
          throw new Error("Seleccioná al menos un mes pendiente.");
        response = await cuotasApi.registrarPago({
          id_socio: paymentDetail.socio.id_socio,
          aplicar_familia: paymentForm.aplicar_familia,
          modalidad: paymentForm.modalidad,
          obligaciones: selectedPeriods.map(
            ({ id_socio, id_categoria, anio, id_mes }) => ({
              id_socio,
              id_categoria,
              anio,
              id_mes,
            }),
          ),
          id_medio_pago: paymentForm.id_medio_pago,
          fecha_pago: paymentForm.fecha_pago,
          condonado: paymentForm.condonado,
          motivo_condonacion: paymentForm.motivo_condonacion,
          observaciones: paymentForm.observaciones,
        });
      } else {
        if (!registrationRecipients.length)
          throw new Error(
            "No hay integrantes con esa categoría para registrar la inscripción.",
          );
        if (
          registrationRecipients.every(
            (member) => member.estado !== "PENDIENTE",
          )
        )
          throw new Error(
            "La inscripción ya está registrada para todos los integrantes seleccionados.",
          );
        response = await cuotasApi.registrarInscripcion({
          id_socio: paymentDetail.socio.id_socio,
          aplicar_familia: paymentForm.aplicar_familia,
          id_categoria: paymentForm.id_categoria,
          anio: paymentForm.anio,
          monto_base: paymentForm.monto_inscripcion,
          descripcion: paymentForm.descripcion_inscripcion,
          id_medio_pago: paymentForm.id_medio_pago,
          fecha_pago: paymentForm.fecha_pago,
          condonado: paymentForm.condonado,
          motivo_condonacion: paymentForm.motivo_condonacion,
          observaciones: paymentForm.observaciones,
        });
      }
      setPaymentOpen(false);
      setFeedback({
        type: "success",
        message: response.mensaje,
      });
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (event) => {
    event.preventDefault();
    if (!deleteModal) return;
    setSaving(true);
    try {
      const response = await cuotasApi.anular(
        deleteModal.codigo_operacion,
        deleteModal.lineas || [],
      );
      setDeleteModal(null);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const printReceipt = async (operation) => {
    const popup = window.open("", "_blank", "width=900,height=720");
    if (!popup) {
      setFeedback({
        type: "error",
        message: "El navegador bloqueó la ventana de impresión.",
      });
      return;
    }
    popup.document.write(
      "<p style='font-family:Arial;padding:20px'>Preparando comprobante...</p>",
    );
    try {
      const response = await cuotasApi.comprobante(operation.codigo_operacion);
      const item = response.operacion;
      const lines = (item.lineas || [])
        .map(
          (line) =>
            `<tr><td>${escapeHtml(line.socio)}</td><td>${escapeHtml(line.categoria)}</td><td>${escapeHtml(line.periodo)}</td><td class="right">${escapeHtml(money(line.monto_base))}</td><td class="right">${escapeHtml(percent(line.porcentaje_descuento_familiar))}</td><td class="right">${escapeHtml(money(line.monto))}</td></tr>`,
        )
        .join("");
      printDocument(
        "Comprobante de pago",
        `<div class="head"><div><h1>${escapeHtml(response.organizacion)}</h1><p>Comprobante de ${escapeHtml(item.concepto.toLowerCase())}</p></div><div class="meta"><p>${escapeHtml(formatDate(item.fecha_pago))}</p><span class="badge">${escapeHtml(item.estado)}</span></div></div><div class="summary"><div><span>Socios</span><b>${escapeHtml(item.socios_label)}</b></div><div><span>Modalidad</span><b>${escapeHtml(item.modalidad_label || item.concepto)}</b></div><div><span>Medio</span><b>${escapeHtml(item.medio_pago)}</b></div><div><span>Total cobrado</span><b>${escapeHtml(money(item.monto))}</b></div></div>${item.motivo_condonacion ? `<p><b>Motivo de condonación:</b> ${escapeHtml(item.motivo_condonacion)}</p>` : ""}<table><thead><tr><th>Socio</th><th>Categoría</th><th>Período</th><th class="right">Base</th><th class="right">Desc.</th><th class="right">Cobrado</th></tr></thead><tbody>${lines}</tbody></table>${item.observaciones ? `<p class="foot"><b>Observaciones:</b> ${escapeHtml(item.observaciones)}</p>` : ""}`,
        popup,
      );
    } catch (err) {
      popup.close();
      setFeedback({ type: "error", message: err.message });
    }
  };

  const rowsForOutput = () =>
    tab === "deudores"
      ? {
          headers: [
            "Socio",
            "DNI",
            "Familia",
            "Categoría",
            "Desde",
            "Cuotas",
            "Descuento",
            "Total",
          ],
          rows: items.map((item) => [
            item.socio,
            item.dni,
            item.familia || "SIN FAMILIA",
            item.categoria,
            item.primer_periodo?.label,
            item.cantidad_periodos,
            percent(item.porcentaje_descuento),
            money(item.monto),
          ]),
        }
      : {
          headers: [
            "Socio",
            "DNI",
            "Modalidad",
            "Períodos",
            "Categorías",
            "Fecha",
            "Medio de pago",
            "Base",
            "Descuento",
            "Cobrado",
          ],
          rows: items.map((item) => [
            item.socio,
            item.dni,
            item.modalidad_label || item.concepto,
            item.periodos_label,
            item.categorias_label,
            formatDate(item.fecha_pago),
            item.medio_pago,
            money(item.monto_base),
            item.descuento_label,
            money(item.monto),
          ]),
        };

  const selectedMonthLabel =
    (catalogos.meses || []).find(
      (item) => String(item.id_mes) === String(month),
    )?.nombre || "";
  const selectedModalityLabel =
    (catalogos.modalidades || []).find(
      (item) => String(item.codigo) === String(modality),
    )?.nombre || "";
  const appliedFilterLabel = [
    `AÑO ${year}`,
    selectedMonthLabel,
    tab !== "deudores" && selectedModalityLabel
      ? selectedModalityLabel
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const printTable = () => {
    const output = rowsForOutput();
    const rows = output.rows
      .map(
        (row) =>
          `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
      )
      .join("");
    printDocument(
      `Cuotas - ${tab}`,
      `<div class="head"><div><h1>Cuotas — ${escapeHtml(tab.toUpperCase())}</h1><p>${escapeHtml(appliedFilterLabel)} · Registros visibles: ${items.length}</p></div><div class="meta"><p>${escapeHtml(formatDate(today()))}</p></div></div><table><thead><tr>${output.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`,
    );
  };

  const exportTable = () => {
    const output = rowsForOutput();
    excelDownload(
      `cuotas_${tab}_${year}_${month}_${today()}`,
      output.headers,
      output.rows,
    );
  };

  const pageFilters = [
    {
      key: "estado",
      label: "Estado",
      type: "tabs",
      ariaLabel: "Estado de las cuotas",
      value: tab,
      onChange: (value) => {
        setTab(value);
        if (value === "deudores") setModality("");
        setFeedback(null);
      },
      options: [
        { value: "pagados", label: "Pagados" },
        { value: "deudores", label: "Deudores" },
        { value: "condonados", label: "Condonados" },
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
    {
      key: "categoria",
      label: "Categoría",
      type: "select",
      placeholder: "Todas",
      value: category,
      onChange: setCategory,
      options: (catalogos.categorias || []).map((item) => ({
        value: item.id_categoria,
        label: `${item.nombre}${item.activo ? "" : " (BAJA)"}`,
      })),
    },
    ...(tab !== "deudores"
      ? [
          {
            key: "modalidad",
            label: "Concepto / modalidad",
            type: "select",
            placeholder: "Todos",
            value: modality,
            onChange: setModality,
            options: (catalogos.modalidades || FALLBACK_MODALITIES).map(
              (item) => ({
                value: item.codigo,
                label: modalityOptionLabel({
                  ...item,
                  nombre:
                    item.codigo === "MENSUAL"
                      ? "CUOTAS MENSUALES"
                      : item.nombre,
                }),
              }),
            ),
          },
        ]
      : []),
    {
      key: "anio",
      label: "Año aplicado",
      type: "select",
      includeEmptyOption: false,
      value: year,
      onChange: setYear,
      options: (catalogos.anios || []).map((item) => ({
        value: item,
        label: item,
      })),
    },
    {
      key: "mes",
      label: "Mes aplicado",
      type: "select",
      includeEmptyOption: false,
      value: month,
      onChange: setMonth,
      options: (catalogos.meses || []).map((item) => ({
        value: item.id_mes,
        label: item.nombre,
      })),
    },
  ];

  const secondaryActions = [
    {
      key: "imprimir",
      label: "Imprimir",
      icon: faPrint,
      onClick: printTable,
      disabled: !items.length,
      className: "mov-btn--ghost cuotas-header-output-action",
    },
    {
      key: "excel",
      label: "Excel",
      icon: faFileExcel,
      onClick: exportTable,
      disabled: !items.length,
      className: "mov-btn--ghost cuotas-header-output-action",
    },
  ];

  return (
    <>
      <ModulePage
        title="Cuotas"
        filters={pageFilters}
        tabsInTitle
        secondaryActions={secondaryActions}
        primaryActionLabel="Registrar pago"
        onPrimaryAction={() => setPickerOpen(true)}
        canCreate={writable}
        notice={
          !writable
            ? "Tu usuario tiene permiso de consulta. Los pagos y anulaciones están deshabilitados."
            : null
        }
      >
        <ModuleFeedback
          type={feedback?.type || "error"}
          message={feedback?.message || error}
          onClose={() => setFeedback(null)}
        />

        {tab === "deudores" ? (
          <div
            className="global-divTable cuotas-table"
            role="table"
            aria-label="Listado de cuotas adeudadas"
          >
            <div
              className="mov-tableWrap global-divTable__wrap entity-table-wrap"
              role="rowgroup"
            >
              <div
                className="mov-gridTable mov-gridTable--head global-divTable__head cuotas-debt-grid"
                role="row"
              >
                {[
                  "Socio",
                  "Familia",
                  "Categoría",
                  "Desde",
                  "Cuotas",
                  "Monto base",
                  "Descuento",
                  "Total",
                  "Acciones",
                ].map((column) => (
                  <div className="mov-gridCell--head" key={column}>
                    {column}
                  </div>
                ))}
              </div>
              {loading && !items.length ? (
                <div className="module-empty">
                  <strong>Calculando deudas...</strong>
                  <span>
                    Revisando desde la fecha de ingreso y los pagos registrados.
                  </span>
                </div>
              ) : null}
              {!loading && !items.length ? (
                <div className="module-empty">
                  <strong>Sin deudas para mostrar</strong>
                  <span>
                    Todos los períodos visibles se encuentran pagos o
                    condonados.
                  </span>
                </div>
              ) : null}
              {items.map((item, index) => (
                <div
                  className="mov-gridTable mov-gridTable--row global-divTable__row entity-table-row cuotas-debt-grid"
                  role="row"
                  key={`deuda-${item.id_socio ?? item.socio ?? "socio"}-${item.id_categoria ?? item.categoria ?? "categoria"}-${item.primer_periodo?.anio ?? year}-${item.primer_periodo?.mes ?? month}-${index}`}
                >
                  <div className="mov-gridCell entity-main-cell">
                    <strong>{item.socio}</strong>
                    <small>DNI {item.dni}</small>
                  </div>
                  <div className="mov-gridCell">
                    <span className="entity-wrap-text">
                      {item.familia || "SIN FAMILIA"}
                    </span>
                  </div>
                  <div className="mov-gridCell is-strong">{item.categoria}</div>
                  <div className="mov-gridCell">
                    {item.primer_periodo?.label}
                  </div>
                  <div className="mov-gridCell is-center">
                    <span className="mov-chip">{item.cantidad_periodos}</span>
                  </div>
                  <div className="mov-gridCell is-strong">
                    {money(item.monto_base)}
                  </div>
                  <div className="mov-gridCell">
                    <span className="mov-chip mov-chip--ok">
                      {percent(item.porcentaje_descuento)}
                    </span>
                  </div>
                  <div className="mov-gridCell is-strong">
                    {money(item.monto)}
                  </div>
                  <div className="mov-gridCell mov-gridCell--actions">
                    {writable ? (
                      <button
                        className="mov-btn mov-btn--primary cuotas-pay-button"
                        type="button"
                        onClick={() =>
                          openPayment(
                            item.id_socio,
                            item.id_categoria,
                            item.primer_periodo,
                          )
                        }
                      >
                        Pagar
                      </button>
                    ) : (
                      <span className="entity-readonly">CONSULTA</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            className="global-divTable cuotas-table"
            role="table"
            aria-label={`Listado de cuotas ${tab}`}
          >
            <div
              className="mov-tableWrap global-divTable__wrap entity-table-wrap"
              role="rowgroup"
            >
              <div
                className="mov-gridTable mov-gridTable--head global-divTable__head cuotas-operation-grid"
                role="row"
              >
                {[
                  "Socio",
                  "Modalidad / períodos",
                  "Categorías",
                  "Fecha",
                  "Medio de pago",
                  "Monto base",
                  "Descuento",
                  tab === "condonados" ? "Cobrado" : "Total",
                  "Acciones",
                ].map((column) => (
                  <div className="mov-gridCell--head" key={column}>
                    {column}
                  </div>
                ))}
              </div>
              {loading && !items.length ? (
                <div className="module-empty">
                  <strong>Cargando registros...</strong>
                  <span>Consultando operaciones y comprobantes.</span>
                </div>
              ) : null}
              {!loading && !items.length ? (
                <div className="module-empty">
                  <strong>Sin registros para mostrar</strong>
                  <span>
                    No hay operaciones en esta pestaña con los filtros
                    seleccionados.
                  </span>
                </div>
              ) : null}
              {items.map((item, index) => (
                <div
                  className="mov-gridTable mov-gridTable--row global-divTable__row entity-table-row cuotas-operation-grid"
                  role="row"
                  key={item.fila_id || `operacion-${item.tipo_registro ?? "registro"}-${item.id_operacion ?? item.codigo_operacion ?? item.id_socio ?? item.socio ?? "socio"}-${item.fecha_pago ?? "fecha"}-${index}`}
                >
                  <div className="mov-gridCell entity-main-cell">
                    <strong>{item.socio}</strong>
                    <small>DNI {item.dni}</small>
                  </div>
                  <div className="mov-gridCell entity-main-cell">
                    <strong>{item.modalidad_label || item.concepto}</strong>
                    <small>{item.periodos_label}</small>
                  </div>
                  <div className="mov-gridCell">
                    <span className="entity-wrap-text">
                      {item.categorias_label}
                    </span>
                  </div>
                  <div className="mov-gridCell entity-main-cell">
                    <strong>{formatDate(item.fecha_pago)}</strong>
                  </div>
                  <div className="mov-gridCell">
                    <span className="entity-wrap-text">{item.medio_pago}</span>
                  </div>
                  <div className="mov-gridCell is-strong">
                    {money(item.monto_base)}
                  </div>
                  <div className="mov-gridCell">{item.descuento_label}</div>
                  <div className="mov-gridCell is-strong">
                    {money(item.monto)}
                  </div>
                  <div className="mov-gridCell mov-gridCell--actions">
                    <div className="mov-actionsInline">
                      <button
                        className="mov-iconBtn"
                        type="button"
                        title="Imprimir comprobante"
                        onClick={() => printReceipt(item)}
                      >
                        <FontAwesomeIcon icon={faReceipt} />
                      </button>
                      {writable ? (
                        <button
                          className="mov-iconBtn mov-iconBtn--danger"
                          type="button"
                          title="Eliminar registro"
                          onClick={() => setDeleteModal(item)}
                        >
                          <FontAwesomeIcon icon={faTrashCan} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          className="cuotas-output-actions--bottom"
          aria-label="Acciones de exportación"
        >
          <button
            className="mov-btn cuotas-output-button"
            type="button"
            onClick={printTable}
            disabled={!items.length}
          >
            <FontAwesomeIcon icon={faPrint} />
            Imprimir
          </button>
          <button
            className="mov-btn cuotas-output-button"
            type="button"
            onClick={exportTable}
            disabled={!items.length}
          >
            <FontAwesomeIcon icon={faFileExcel} />
            Excel
          </button>
        </div>
      </ModulePage>

      <CrudModal
        open={pickerOpen}
        title="Registrar pago"
        subtitle="Elegí el socio para consultar todos sus períodos y su grupo familiar."
        onClose={() => setPickerOpen(false)}
        onSubmit={(event) => {
          event.preventDefault();
          if (pickedPartner) openPayment(pickedPartner);
        }}
        submitLabel="Continuar"
      >
        <div className="entity-form">
          <label className="entity-field">
            <span>Socio *</span>
            <select
              value={pickedPartner}
              onChange={(event) => setPickedPartner(event.target.value)}
              required
            >
              <option value="">SELECCIONAR SOCIO</option>
              {fullCatalogs.socios.map((socio) => (
                <option key={socio.id_socio} value={socio.id_socio}>
                  {socio.apellido}, {socio.nombre} · DNI {socio.dni}
                  {socio.familia ? ` · ${socio.familia}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </CrudModal>

      <CrudModal
        open={paymentOpen}
        title="Registrar pago o condonación"
        subtitle={
          paymentDetail
            ? `${paymentDetail.socio.socio} · DNI ${paymentDetail.socio.dni}`
            : "Consultando estado de cuotas..."
        }
        onClose={() => setPaymentOpen(false)}
        onSubmit={savePayment}
        saving={saving}
        submitLabel={
          paymentForm.condonado ? "Registrar condonación" : "Registrar pago"
        }
        wide
        hideSubmit={
          paymentLoading || !paymentDetail || !availableModalities.length
        }
      >
        {paymentLoading ? (
          <p className="entity-confirm-text">
            Cargando socio, familia, categorías y pagos anteriores...
          </p>
        ) : null}
        {paymentDetail ? (
          <div className="cuotas-payment-form">
            {paymentDetail.familia ? (
              <section className="cuotas-family-box">
                <div>
                  <strong>
                    Grupo familiar: {paymentDetail.familia.nombre}
                  </strong>
                  <span>
                    {paymentDetail.integrantes
                      .map((member) => member.socio)
                      .join(" · ")}
                  </span>
                  <small>
                    Descuento familiar:{" "}
                    {percent(paymentDetail.familia.porcentaje_descuento)}. Se
                    aplica aunque cobres solamente a este socio.
                  </small>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={paymentForm.aplicar_familia}
                    onChange={(event) =>
                      changeFamilyScope(event.target.checked)
                    }
                  />{" "}
                  Incluir a todo el grupo familiar
                </label>
              </section>
            ) : (
              <div className="module-notice">
                El socio no pertenece a un grupo familiar; no se aplica
                descuento.
              </div>
            )}

            <section className="cuotas-modality-selector" aria-label="Modalidad de cobro">
              <label className="entity-field">
                <span>Concepto / modalidad de cobro *</span>
                <select
                  value={paymentForm.modalidad}
                  onChange={(event) =>
                    changePaymentModality(event.target.value)
                  }
                  required
                  disabled={!availableModalities.length}
                >
                  {!availableModalities.length ? (
                    <option value="">SIN MODALIDADES DISPONIBLES</option>
                  ) : null}
                  {availableModalities.map((item) => (
                    <option key={item.codigo} value={item.codigo}>
                      {modalityOptionLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
              <small>
                Acá elegís CUOTAS MENSUALES, INSCRIPCIÓN, PRIMERA MITAD,
                SEGUNDA MITAD o CONTADO ANUAL. Las opciones que no
                corresponden para el socio y el año seleccionado se ocultan.
              </small>
            </section>

            <div className="entity-form__grid cuotas-payment-controls">
              <label className="entity-field">
                <span>Categoría</span>
                <select
                  value={paymentForm.id_categoria}
                  onChange={(event) =>
                    changePaymentCategory(event.target.value)
                  }
                  required
                >
                  {paymentDetail.categorias.map((item) => (
                    <option key={item.id_categoria} value={item.id_categoria}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <div className="cuotas-year-control">
                <label className="entity-field">
                  <span>Año</span>
                  <select
                    value={paymentForm.anio}
                    onChange={(event) => changePaymentYear(event.target.value)}
                  >
                    {paymentDetail.anios.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="cuotas-year-enabled">
                  AÑO {paymentDetail.anio_maximo_habilitado} HABILITADO
                </span>
              </div>
            </div>

            <div className="cuotas-modality-help">
              {availableModalities.length ? (
                <span>
                  Las modalidades se habilitan según la fecha de ingreso y los
                  pagos del año. Las opciones que ya no corresponden no se
                  muestran.
                </span>
              ) : (
                <strong>
                  No hay pagos o inscripciones pendientes para esta categoría
                  y año.
                </strong>
              )}
            </div>

            {!isRegistrationMode ? (
              <>
                {isPackageMode ? (
                  <div className="cuotas-package-notice">
                    <strong>
                      {availableModalities.find(
                        (item) => item.codigo === paymentForm.modalidad,
                      )?.nombre || "PAGO AGRUPADO"}
                    </strong>
                    <span>
                      Los meses incluidos se seleccionan automáticamente y el
                      registro se elimina siempre como un paquete completo.
                    </span>
                  </div>
                ) : (
                  <div className="cuotas-quick-actions">
                    <button
                      type="button"
                      onClick={() =>
                        selectVisible(
                          (period) =>
                            period.id_mes === new Date().getMonth() + 1,
                        )
                      }
                    >
                      Mes actual
                    </button>
                    <button
                      type="button"
                      onClick={() => selectVisible(() => true)}
                    >
                      Todos los pendientes
                    </button>
                    <button type="button" onClick={clearVisible}>
                      Limpiar selección
                    </button>
                  </div>
                )}
                <div className="cuotas-period-list">
                  {groupedPeriods.map((group) => (
                    <section
                      className="cuotas-period-group"
                      key={group.id_socio}
                    >
                      <header>
                        <strong>{group.socio}</strong>
                        <span>
                          {paymentDetail.familia
                            ? percent(
                                paymentDetail.familia.porcentaje_descuento,
                              )
                            : "SIN DESCUENTO"}
                        </span>
                      </header>
                      <div className="cuotas-month-grid">
                        {group.periods.map((period) => (
                          <button
                            type="button"
                            key={period.clave}
                            disabled={
                              period.estado !== "PENDIENTE" || isPackageMode
                            }
                            className={`${paymentForm.seleccion[period.clave] ? "is-selected" : ""} ${period.estado !== "PENDIENTE" ? "is-disabled" : ""} ${isPackageMode ? "is-package" : ""}`}
                            onClick={() => togglePeriod(period)}
                          >
                            <strong>{period.mes.slice(0, 3)}</strong>
                            <span>
                              {period.estado === "PENDIENTE"
                                ? money(period.monto)
                                : period.estado}
                            </span>
                            {period.es_futuro &&
                            period.estado === "PENDIENTE" ? (
                              <small>ANTICIPADA</small>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                  {!groupedPeriods.length ? (
                    <p className="entity-help">
                      No hay períodos para esta categoría y año.
                    </p>
                  ) : null}
                </div>
                <div className="cuotas-selection-summary">
                  <div>
                    <span>{isPackageMode ? "Meses incluidos" : "Meses seleccionados"}</span>
                    <strong>{selectedPeriods.length}</strong>
                  </div>
                  <div>
                    <span>Monto base</span>
                    <strong>{money(totals.base)}</strong>
                  </div>
                  <div>
                    <span>Total con descuento</span>
                    <strong>{money(totals.final)}</strong>
                  </div>
                  <div>
                    <span>A cobrar</span>
                    <strong>
                      {money(paymentForm.condonado ? 0 : totals.final)}
                    </strong>
                  </div>
                </div>
              </>
            ) : (
              <div className="cuotas-registration-box">
                <div className="entity-form__grid">
                  <label className="entity-field">
                    <span>Monto base por integrante *</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={paymentForm.monto_inscripcion}
                      onChange={(event) =>
                        updateForm("monto_inscripcion", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label className="entity-field">
                    <span>Descripción</span>
                    <input
                      value={paymentForm.descripcion_inscripcion}
                      onChange={(event) =>
                        updateForm(
                          "descripcion_inscripcion",
                          event.target.value.toLocaleUpperCase("es-AR"),
                        )
                      }
                      maxLength={255}
                    />
                  </label>
                </div>
                <div className="cuotas-registration-members">
                  {registrationRecipients.map((member) => (
                    <article key={member.id_socio}>
                      <strong>{member.socio}</strong>
                      <span
                        className={`mov-chip ${member.estado === "PENDIENTE" ? "" : member.estado === "PAGADO" ? "mov-chip--ok" : "mov-chip--danger"}`}
                      >
                        {member.estado}
                      </span>
                    </article>
                  ))}
                  {!registrationRecipients.length ? (
                    <p className="entity-help">
                      Ningún integrante seleccionado tiene esta categoría en el
                      año indicado.
                    </p>
                  ) : null}
                </div>
                <div className="cuotas-selection-summary">
                  <div>
                    <span>Integrantes</span>
                    <strong>
                      {
                        registrationRecipients.filter(
                          (member) => member.estado === "PENDIENTE",
                        ).length
                      }
                    </strong>
                  </div>
                  <div>
                    <span>Base total</span>
                    <strong>
                      {money(
                        Number(paymentForm.monto_inscripcion || 0) *
                          registrationRecipients.filter(
                            (member) => member.estado === "PENDIENTE",
                          ).length,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Descuento familiar</span>
                    <strong>
                      {percent(
                        paymentDetail.familia?.porcentaje_descuento || 0,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>A cobrar</span>
                    <strong>
                      {money(
                        paymentForm.condonado
                          ? 0
                          : Number(paymentForm.monto_inscripcion || 0) *
                              registrationRecipients.filter(
                                (member) => member.estado === "PENDIENTE",
                              ).length *
                              (1 -
                                Number(
                                  paymentDetail.familia?.porcentaje_descuento ||
                                    0,
                                ) /
                                  100),
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            <section className="cuotas-payment-data">
              <label className="cuotas-condone-toggle">
                <input
                  type="checkbox"
                  checked={paymentForm.condonado}
                  onChange={(event) =>
                    updateForm("condonado", event.target.checked)
                  }
                />
                <span>
                  <strong>Condonar este registro</strong>
                  <small>
                    Se guarda el importe teórico, pero el monto cobrado será $0.
                  </small>
                </span>
              </label>
              <div className="entity-form__grid">
                <label className="entity-field">
                  <span>Fecha *</span>
                  <input
                    type="date"
                    max={today()}
                    value={paymentForm.fecha_pago}
                    onChange={(event) =>
                      updateForm("fecha_pago", event.target.value)
                    }
                    required
                  />
                </label>
                {!paymentForm.condonado ? (
                  <label className="entity-field">
                    <span>Medio de pago *</span>
                    <select
                      value={paymentForm.id_medio_pago}
                      onChange={(event) =>
                        updateForm("id_medio_pago", event.target.value)
                      }
                      required
                    >
                      {paymentDetail.medios_pago.map((item) => (
                        <option
                          key={item.id_medio_pago}
                          value={item.id_medio_pago}
                        >
                          {item.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="entity-field">
                    <span>Motivo de condonación *</span>
                    <input
                      value={paymentForm.motivo_condonacion}
                      onChange={(event) =>
                        updateForm(
                          "motivo_condonacion",
                          event.target.value.toLocaleUpperCase("es-AR"),
                        )
                      }
                      maxLength={500}
                      required
                    />
                  </label>
                )}
                <label className="entity-field entity-field--wide">
                  <span>Observaciones</span>
                  <textarea
                    value={paymentForm.observaciones}
                    onChange={(event) =>
                      updateForm(
                        "observaciones",
                        event.target.value.toLocaleUpperCase("es-AR"),
                      )
                    }
                    rows={2}
                    maxLength={500}
                  />
                </label>
              </div>
            </section>
          </div>
        ) : null}
      </CrudModal>

      <CrudModal
        open={Boolean(deleteModal)}
        title={
          deleteModal?.estado === "CONDONADO"
            ? "Eliminar condonación"
            : "Eliminar pago"
        }
        subtitle={
          deleteModal
            ? `${deleteModal.modalidad_label || deleteModal.concepto} · ${deleteModal.periodos_label}`
            : ""
        }
        onClose={() => setDeleteModal(null)}
        onSubmit={confirmDelete}
        saving={saving}
        submitLabel="Eliminar registro"
        danger
      >
        {deleteModal?.es_paquete ? (
          <div className="cuotas-delete-package-warning">
            <strong>
              Este registro corresponde a {deleteModal.modalidad_label}.
            </strong>
            <p className="entity-confirm-text">
              Al eliminarlo se anulará el paquete completo de {deleteModal.cantidad_lineas || 0}{" "}
              meses, aunque hayas abierto la acción desde un mes puntual. Todos
              esos meses volverán a quedar pendientes.
            </p>
          </div>
        ) : (
          <p className="entity-confirm-text">
            Se anularán las {deleteModal?.cantidad_lineas || 0} líneas incluidas
            en esta fila y se conservará la auditoría. Esos períodos volverán a
            quedar pendientes y podrán pagarse nuevamente.
          </p>
        )}
      </CrudModal>
    </>
  );
}
