import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDollarSign,
  faFileExcel,
  faInbox,
  faPen,
  faPrint,
  faReceipt,
  faTrashCan,
  faUser,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import {
  ModulePage,
  useCompactModuleActions,
} from "../../Global/components/ModulePage";
import CrudModal from "../../Global/components/CrudModal";
import GlobalDivTable from "../../Global/components/GlobalDivTable";
import ModalEliminarGlobal from "../../Global/components/ModalEliminarGlobal";
import ModuleFeedback from "../../Global/components/ModuleFeedback";
import { FloatingField } from "../../Global/components/TabbedForm";
import { canWrite } from "../../Global/auth/session";
import { cuotasApi } from "../api/cuotasApi";
import { useCuotas } from "../hooks/useCuotas";
import ModalComprobantePago from "../../Global/Modales/ModalComprobantePago";
import {
  downloadPaymentReceiptPdf,
  openPaymentReceipt,
} from "../../../utils/comprobantePago";
import "./Cuotas.css";
import "./CuotasModal.css";

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};
const openDatePicker = (event) => {
  const input = event.currentTarget;
  if (typeof input.showPicker !== "function") return;

  try {
    input.showPicker();
  } catch {
    // El navegador mantiene el comportamiento nativo si no permite abrirlo.
  }
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
  const code = String(item.codigo || "").toUpperCase();
  const labels = {
    MENSUAL: "MENSUAL",
    PRIMERA_MITAD: "PRIMERA MITAD",
    SEGUNDA_MITAD: "SEGUNDA MITAD",
    CONTADO_ANUAL: "CONTADO ANUAL",
  };
  return labels[code] || item.nombre;
};
const money = (value) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    Number(value || 0),
  );
const debtItemPaymentLines = (item) =>
  (Array.isArray(item?.periodos_pendientes) ? item.periodos_pendientes : []).map(
    (period) => ({
      key: `${item.id_socio}-${item.id_categoria}-${period.anio}-${period.mes}`,
      id_socio: Number(item.id_socio),
      id_categoria: Number(item.id_categoria),
      anio: Number(period.anio),
      id_mes: Number(period.mes),
      socio: item.socio,
      dni: item.dni,
      categoria: item.categoria,
      familia: item.familia,
      porcentaje_descuento: Number(item.porcentaje_descuento || 0),
      periodo: period.label,
      monto_base: Number(period.monto_base || 0),
      monto: Number(period.monto || 0),
    }),
  );
const distributeCustomTotal = (lines, total) => {
  if (!Array.isArray(lines) || !lines.length) return [];
  const totalCents = Math.max(0, Math.round(Number(total || 0) * 100));
  const weights = lines.map((line) =>
    Math.max(0, Math.round(Number(line.monto || 0) * 100)),
  );
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  let remaining = totalCents;
  return lines.map((line, index) => {
    const cents =
      index === lines.length - 1
        ? remaining
        : weightTotal > 0
          ? Math.min(remaining, Math.floor((totalCents * weights[index]) / weightTotal))
          : 0;
    remaining -= cents;
    return { ...line, monto: cents / 100 };
  });
};
const percent = (value) =>
  `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(Number(value || 0))}%`;
const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : "—";
const formatDateTimeDate = (value) =>
  value ? formatDate(String(value).slice(0, 10)) : "—";
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
  incluir_inscripcion: false,
  id_categoria: "",
  anio: String(currentYear),
  seleccion: {},
  id_medio_pago: "",
  fecha_pago: today(),
  usar_saldo_favor: false,
  monto_recibido: "",
  usar_monto_libre: false,
  monto_libre: "",
  condonado: false,
  motivo_condonacion: "",
  observaciones: "",
  monto_inscripcion: "",
  descripcion_inscripcion: `INSCRIPCIÓN ${currentYear}`,
});

export default function Cuotas() {
  const writable = canWrite();
  const compactActions = useCompactModuleActions();
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
      mes:
        tab === "saldos" || (tab !== "deudores" && modality === "INSCRIPCION")
          ? ""
          : month,
      modalidad: ["deudores", "saldos"].includes(tab) ? "" : modality,
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
  const [paymentConcept, setPaymentConcept] = useState("CUOTAS");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentDetail, setPaymentDetail] = useState(null);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm());
  const [saving, setSaving] = useState(false);
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  const [paymentReceiptOpen, setPaymentReceiptOpen] = useState(false);
  const [paymentReceiptLoading, setPaymentReceiptLoading] = useState(false);
  const [deleteModal, setDeleteModal] = useState(null);
  const [balanceModal, setBalanceModal] = useState(null);
  const [balanceDeleteModal, setBalanceDeleteModal] = useState(null);
  const [balancePartnerSearch, setBalancePartnerSearch] = useState("");
  const [balanceForm, setBalanceForm] = useState({
    id_socio: "",
    monto: "",
    detalle: "",
  });
  const [balanceSaving, setBalanceSaving] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedPayments, setSelectedPayments] = useState({});
  const [multiPaymentOpen, setMultiPaymentOpen] = useState(false);
  const [multiPaymentSaving, setMultiPaymentSaving] = useState(false);
  const [multiPaymentForm, setMultiPaymentForm] = useState({
    fecha_pago: today(),
    id_medio_pago: "",
  });

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

  useEffect(() => {
    if (tab !== "deudores") {
      setMultiSelectMode(false);
      setSelectedPayments({});
      setMultiPaymentOpen(false);
    }
  }, [tab]);

  const balancePartnerOptions = useMemo(() => {
    const term = balancePartnerSearch.trim().toLocaleLowerCase("es-AR");
    if (!term) return fullCatalogs.socios;
    return fullCatalogs.socios.filter((partner) =>
      `${partner.apellido || ""} ${partner.nombre || ""} ${partner.dni || ""}`
        .toLocaleLowerCase("es-AR")
        .includes(term),
    );
  }, [fullCatalogs.socios, balancePartnerSearch]);

  const selectedBalancePartner = useMemo(
    () =>
      fullCatalogs.socios.find(
        (partner) => String(partner.id_socio) === String(balanceForm.id_socio),
      ) || null,
    [fullCatalogs.socios, balanceForm.id_socio],
  );

  const visibleDebtLines = useMemo(
    () =>
      tab === "deudores"
        ? items.flatMap((item) => debtItemPaymentLines(item))
        : [],
    [items, tab],
  );
  const selectedPaymentLines = useMemo(
    () => Object.values(selectedPayments),
    [selectedPayments],
  );
  const selectedPaymentTotal = useMemo(
    () =>
      selectedPaymentLines.reduce(
        (total, line) => total + Number(line.monto || 0),
        0,
      ),
    [selectedPaymentLines],
  );
  const allVisibleDebtsSelected =
    visibleDebtLines.length > 0 &&
    visibleDebtLines.every((line) => Boolean(selectedPayments[line.key]));

  const toggleDebtItemSelection = (item) => {
    const lines = debtItemPaymentLines(item);
    if (!lines.length) return;
    setSelectedPayments((current) => {
      const next = { ...current };
      const fullySelected = lines.every((line) => Boolean(next[line.key]));
      if (fullySelected) {
        lines.forEach((line) => delete next[line.key]);
        return next;
      }
      const missing = lines.filter((line) => !next[line.key]);
      if (Object.keys(next).length + missing.length > 500) {
        setFeedback({
          type: "error",
          message: "El pago múltiple admite hasta 500 cuotas por operación.",
        });
        return current;
      }
      missing.forEach((line) => {
        next[line.key] = line;
      });
      return next;
    });
  };

  const toggleAllVisibleDebts = () => {
    setSelectedPayments((current) => {
      const next = { ...current };
      if (allVisibleDebtsSelected) {
        visibleDebtLines.forEach((line) => delete next[line.key]);
        return next;
      }
      const missing = visibleDebtLines.filter((line) => !next[line.key]);
      const available = Math.max(0, 500 - Object.keys(next).length);
      missing.slice(0, available).forEach((line) => {
        next[line.key] = line;
      });
      if (missing.length > available) {
        setFeedback({
          type: "error",
          message: "Se seleccionaron las primeras 500 cuotas, que es el máximo por operación.",
        });
      }
      return next;
    });
  };

  const openMultiPayment = () => {
    if (!selectedPaymentLines.length) {
      setFeedback({ type: "error", message: "Seleccioná al menos una cuota." });
      return;
    }
    setMultiPaymentForm({
      fecha_pago: today(),
      id_medio_pago: String(fullCatalogs.medios_pago?.[0]?.id_medio_pago || ""),
    });
    setMultiPaymentOpen(true);
    setFeedback(null);
  };

  const saveMultiPayment = async (event) => {
    event.preventDefault();
    if (!selectedPaymentLines.length) return;
    if (!multiPaymentForm.id_medio_pago) {
      setFeedback({ type: "error", message: "Seleccioná un medio de pago." });
      return;
    }
    setMultiPaymentSaving(true);
    try {
      const response = await cuotasApi.registrarPagoMultiple({
        fecha_pago: multiPaymentForm.fecha_pago,
        id_medio_pago: multiPaymentForm.id_medio_pago,
        pagos: selectedPaymentLines.map(
          ({ id_socio, id_categoria, anio, id_mes }) => ({
            id_socio,
            id_categoria,
            anio,
            id_mes,
          }),
        ),
      });
      setMultiPaymentOpen(false);
      setMultiSelectMode(false);
      setSelectedPayments({});
      setFeedback({
        type: "success",
        message: `Pago múltiple registrado correctamente (${response.lineas || selectedPaymentLines.length} cuotas).`,
      });
      await cargar();

      if (response.codigo_operacion) {
        setPaymentReceiptLoading(true);
        try {
          const receipt = await cuotasApi.comprobante(response.codigo_operacion);
          setPaymentReceipt(receipt);
          setPaymentReceiptOpen(true);
        } catch {
          // El pago ya quedó registrado; el comprobante puede abrirse luego desde Pagados.
        } finally {
          setPaymentReceiptLoading(false);
        }
      }
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setMultiPaymentSaving(false);
    }
  };

  const openPayment = async (
    partnerId,
    initialCategory = "",
    initialPeriod = null,
  ) => {
    setPickerOpen(false);
    setPaymentOpen(true);
    setPaymentConcept("CUOTAS");
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
        usar_saldo_favor:
          !detail.familia && Number(detail.saldo_favor || 0) > 0,
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
      incluir_inscripcion: false,
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
      incluir_inscripcion: false,
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
            Number(period.id_socio) === Number(paymentDetail.socio.id_socio));
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
        incluir_inscripcion: false,
        usar_saldo_favor: checked
          ? false
          : !current.usar_monto_libre &&
            Number(paymentDetail?.saldo_favor || 0) > 0,
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
          paymentForm.seleccion[period.clave] && period.estado === "PENDIENTE",
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
  }, [paymentDetail, visiblePeriods, groupedPeriods, registrationRecipients]);

  const availableModalityCodes = useMemo(
    () => availableModalities.map((item) => item.codigo),
    [availableModalities],
  );

  const feeModalities = useMemo(
    () =>
      availableModalities.filter((item) => item.codigo !== "INSCRIPCION"),
    [availableModalities],
  );
  const feeModalityCodes = useMemo(
    () => feeModalities.map((item) => item.codigo),
    [feeModalities],
  );
  const registrationAvailable = availableModalityCodes.includes("INSCRIPCION");

  useEffect(() => {
    if (!paymentDetail || !feeModalityCodes.length) return;
    if (feeModalityCodes.includes(paymentForm.modalidad)) return;
    const fallback = feeModalityCodes.includes("MENSUAL")
      ? "MENSUAL"
      : feeModalityCodes[0];
    setPaymentForm((current) => ({
      ...current,
      modalidad: fallback,
      seleccion: {},
    }));
  }, [paymentDetail, feeModalityCodes, paymentForm.modalidad]);

  useEffect(() => {
    if (!paymentDetail) return;
    if (paymentConcept === "CUOTAS" && !feeModalities.length && registrationAvailable) {
      setPaymentConcept("INSCRIPCION");
    } else if (
      paymentConcept === "INSCRIPCION" &&
      !registrationAvailable &&
      feeModalities.length
    ) {
      setPaymentConcept("CUOTAS");
    }
  }, [paymentDetail, paymentConcept, feeModalities.length, registrationAvailable]);

  useEffect(() => {
    if (registrationAvailable || !paymentForm.incluir_inscripcion) return;
    setPaymentForm((current) => ({
      ...current,
      incluir_inscripcion: false,
    }));
  }, [registrationAvailable, paymentForm.incluir_inscripcion]);

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

  const isRegistrationMode = paymentConcept === "INSCRIPCION";
  const isPackageMode = Boolean(PACKAGE_MODALITY_MONTHS[paymentForm.modalidad]);
  const pendingRegistrationRecipients = useMemo(
    () =>
      registrationRecipients.filter((member) => member.estado === "PENDIENTE"),
    [registrationRecipients],
  );
  const registrationTotal = useMemo(
    () =>
      Number(paymentForm.monto_inscripcion || 0) *
      pendingRegistrationRecipients.length *
      (1 -
        Number(paymentDetail?.familia?.porcentaje_descuento || 0) / 100),
    [
      paymentForm.monto_inscripcion,
      pendingRegistrationRecipients.length,
      paymentDetail?.familia?.porcentaje_descuento,
    ],
  );
  const includedRegistrationTotal = paymentForm.incluir_inscripcion
    ? registrationTotal
    : 0;
  const paymentTotal = paymentForm.condonado
    ? 0
    : totals.final + includedRegistrationTotal;
  const hasPaymentSelection =
    selectedPeriods.length > 0 ||
    (paymentForm.incluir_inscripcion &&
      pendingRegistrationRecipients.length > 0);

  const availableBalance = Number(paymentDetail?.saldo_favor || 0);
  const freeAmount =
    paymentForm.monto_libre === ""
      ? null
      : Math.max(0, Number(String(paymentForm.monto_libre).replace(",", ".")) || 0);
  const freeAmountInvalid =
    paymentForm.usar_monto_libre &&
    (freeAmount === null ||
      freeAmount <= 0 ||
      paymentTotal <= 0 ||
      freeAmount + 0.005 >= paymentTotal);
  const receivedAmount =
    paymentForm.monto_recibido === ""
      ? null
      : Math.max(0, Number(String(paymentForm.monto_recibido).replace(",", ".")) || 0);
  const balanceAppliedPreview =
    paymentForm.condonado ||
    paymentForm.aplicar_familia ||
    paymentForm.usar_monto_libre ||
    !paymentForm.usar_saldo_favor
      ? 0
      : Math.min(
          availableBalance,
          receivedAmount === null
            ? paymentTotal
            : Math.max(0, paymentTotal - receivedAmount),
        );
  const cashReceivedPreview = paymentForm.condonado
    ? 0
    : paymentForm.usar_monto_libre
      ? freeAmount || 0
      : receivedAmount === null
        ? Math.max(0, paymentTotal - balanceAppliedPreview)
        : receivedAmount;
  const surplusPreview = paymentForm.usar_monto_libre
    ? 0
    : Math.max(
        0,
        cashReceivedPreview + balanceAppliedPreview - paymentTotal,
      );
  const paymentInsufficient =
    !paymentForm.condonado &&
    !paymentForm.usar_monto_libre &&
    cashReceivedPreview + balanceAppliedPreview + 0.005 < paymentTotal;
  const recordedPaymentTotal =
    paymentForm.usar_monto_libre && freeAmount !== null ? freeAmount : paymentTotal;

  const createPaymentReceiptDraft = (response = {}) => {
    const familyDiscount = Number(
      paymentDetail?.familia?.porcentaje_descuento || 0,
    );
    const selectedCategory = paymentDetail?.categorias?.find(
      (item) =>
        String(item.id_categoria) === String(paymentForm.id_categoria),
    );
    const paymentMethod = paymentDetail?.medios_pago?.find(
      (item) =>
        String(item.id_medio_pago) === String(paymentForm.id_medio_pago),
    );
    const feeLines = selectedPeriods.map((period) => ({
      id: period.clave,
      socio: period.socio,
      categoria: period.categoria || selectedCategory?.nombre || "—",
      periodo: period.periodo || `${period.mes} ${period.anio}`,
      monto_base: Number(period.monto_base || 0),
      porcentaje_descuento_familiar: familyDiscount,
      monto: paymentForm.condonado ? 0 : Number(period.monto || 0),
    }));
    const registrationBase = Number(paymentForm.monto_inscripcion || 0);
    const registrationLines = paymentForm.incluir_inscripcion
      ? pendingRegistrationRecipients.map((member) => ({
          id: `inscripcion-${member.id_socio}`,
          socio: member.socio,
          categoria: selectedCategory?.nombre || "—",
          periodo: paymentForm.descripcion_inscripcion,
          monto_base: registrationBase,
          porcentaje_descuento_familiar: familyDiscount,
          monto: paymentForm.condonado
            ? 0
            : registrationBase * (1 - familyDiscount / 100),
        }))
      : [];
    const rawLines = [...feeLines, ...registrationLines];
    const lineas = paymentForm.usar_monto_libre
      ? distributeCustomTotal(rawLines, recordedPaymentTotal)
      : rawLines;

    return {
      codigo_operacion:
        response.codigo_operacion ||
        response.operacion?.codigo_operacion ||
        response.codigo ||
        "",
      estado: paymentForm.condonado ? "CONDONADO" : "PAGADO",
      fecha_pago: paymentForm.fecha_pago,
      socios_label:
        [...new Set(lineas.map((line) => line.socio).filter(Boolean))].join(
          " · ",
        ) || paymentDetail?.socio?.socio,
      modalidad_label:
        availableModalities.find(
          (item) => item.codigo === paymentForm.modalidad,
        )?.nombre ||
        (paymentForm.incluir_inscripcion
          ? "INSCRIPCIÓN"
          : paymentForm.modalidad),
      medio_pago: paymentForm.condonado
        ? "CONDONACIÓN"
        : paymentMethod?.nombre || "—",
      monto_base: lineas.reduce(
        (total, line) => total + Number(line.monto_base || 0),
        0,
      ),
      monto: recordedPaymentTotal,
      es_monto_libre: paymentForm.usar_monto_libre,
      monto_saldo_favor_aplicado: Number(
        response.monto_saldo_favor_aplicado ?? balanceAppliedPreview,
      ),
      monto_cobrado_ahora: Number(
        response.monto_cobrado_ahora ?? cashReceivedPreview,
      ),
      sobrante_saldo_favor: Number(
        response.sobrante_saldo_favor ?? surplusPreview,
      ),
      motivo_condonacion: paymentForm.motivo_condonacion,
      observaciones: paymentForm.observaciones,
      lineas,
    };
  };

  const changePaymentConcept = (concept) => {
    if (concept === "INSCRIPCION" && registrationAvailable) {
      setPaymentConcept("INSCRIPCION");
      return;
    }
    if (concept === "CUOTAS" && feeModalities.length) {
      setPaymentConcept("CUOTAS");
    }
  };

  const savePayment = async (event) => {
    event.preventDefault();
    if (!paymentDetail) return;
    setSaving(true);
    try {
      if (!selectedPeriods.length && !paymentForm.incluir_inscripcion) {
        throw new Error("Seleccioná al menos una cuota o incluí la inscripción.");
      }
      if (
        paymentForm.incluir_inscripcion &&
        !pendingRegistrationRecipients.length
      ) {
        throw new Error(
          "La inscripción ya está registrada para todos los integrantes seleccionados.",
        );
      }
      if (freeAmountInvalid) {
        throw new Error(
          "El monto libre debe ser mayor a $ 0 y menor al importe normal del cobro.",
        );
      }
      if (paymentInsufficient) {
        throw new Error(
          "El monto recibido más el monto a favor aplicado no alcanza para cancelar el cobro.",
        );
      }

      const response = await cuotasApi.registrarCobro({
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
        incluir_inscripcion: paymentForm.incluir_inscripcion,
        id_categoria: paymentForm.id_categoria,
        anio: paymentForm.anio,
        descripcion: paymentForm.descripcion_inscripcion,
        id_medio_pago: paymentForm.id_medio_pago,
        fecha_pago: paymentForm.fecha_pago,
        usar_saldo_favor: paymentForm.usar_saldo_favor,
        monto_recibido: paymentForm.monto_recibido,
        usar_monto_libre: paymentForm.usar_monto_libre,
        monto_libre: paymentForm.monto_libre,
        condonado: paymentForm.condonado,
        motivo_condonacion: paymentForm.motivo_condonacion,
        observaciones: paymentForm.observaciones,
      });
      const receiptDraft = createPaymentReceiptDraft(response);
      setPaymentOpen(false);
      setFeedback(null);
      setPaymentReceipt(receiptDraft);
      setPaymentReceiptOpen(true);

      const operationCode = receiptDraft.codigo_operacion;
      if (operationCode) {
        setPaymentReceiptLoading(true);
        cuotasApi
          .comprobante(operationCode)
          .then((officialReceipt) => setPaymentReceipt(officialReceipt))
          .catch(() => {
            // El resumen local permanece disponible si falla la consulta extra.
          })
          .finally(() => setPaymentReceiptLoading(false));
      } else {
        setPaymentReceiptLoading(false);
      }
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const openReceiptOutput = (asPdf = false) => {
    if (!paymentReceipt) return;
    const completed = asPdf
      ? downloadPaymentReceiptPdf(paymentReceipt)
      : openPaymentReceipt(paymentReceipt, { openPrintDialog: true });
    if (!completed) {
      setFeedback({
        type: "error",
        message: asPdf
          ? "No se pudo generar el PDF del comprobante. Intentá nuevamente."
          : "El navegador bloqueó la ventana del comprobante. Habilitá las ventanas emergentes e intentá nuevamente.",
      });
    }
  };

  const openNewBalance = () => {
    setBalanceModal({ mode: "create" });
    setBalancePartnerSearch("");
    setBalanceForm({ id_socio: "", monto: "", detalle: "" });
    setFeedback(null);
  };

  const openBalanceEdit = (item) => {
    setBalanceModal({ mode: "edit", ...item });
    setBalancePartnerSearch("");
    setBalanceForm({
      id_socio: String(item.id_socio),
      monto: String(Number(item.saldo_favor || 0).toFixed(2)),
      detalle: "",
    });
    setFeedback(null);
  };

  const saveBalanceAdjustment = async (event) => {
    event.preventDefault();
    if (!balanceModal) return;
    const isEdit = balanceModal.mode === "edit";
    const partnerId = isEdit ? balanceModal.id_socio : balanceForm.id_socio;
    if (!partnerId) {
      setFeedback({ type: "error", message: "Seleccioná un socio activo." });
      return;
    }
    const amount = Number(String(balanceForm.monto).replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setFeedback({ type: "error", message: "Indicá un monto mayor a cero." });
      return;
    }
    setBalanceSaving(true);
    try {
      const response = await cuotasApi.ajustarSaldo({
        id_socio: partnerId,
        tipo: isEdit ? "FIJAR" : "CREDITO",
        monto: balanceForm.monto,
        detalle: balanceForm.detalle,
      });
      setBalanceModal(null);
      setBalancePartnerSearch("");
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setBalanceSaving(false);
    }
  };

  const confirmBalanceDelete = async () => {
    if (!balanceDeleteModal) return;
    const response = await cuotasApi.ajustarSaldo({
      id_socio: balanceDeleteModal.id_socio,
      tipo: "ELIMINAR",
      detalle: "Monto a favor eliminado manualmente",
    });
    await cargar();
    return response;
  };

  const confirmDelete = async () => {
    if (!deleteModal) return;
    const response = await cuotasApi.anular(
      deleteModal.codigo_operacion,
      deleteModal.lineas || [],
    );
    await cargar();
    return response;
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
      const saldoAplicado = Number(item.monto_saldo_favor_aplicado || 0);
      const recibidoAhora = Number(
        item.monto_cobrado_ahora ?? Number(item.monto || 0) - saldoAplicado,
      );
      const sobrante = Number(item.sobrante_saldo_favor || 0);
      const balanceDetail =
        saldoAplicado > 0 || sobrante > 0
          ? `<p class="foot"><b>Detalle del cobro:</b> ${saldoAplicado > 0 ? `Monto a favor aplicado ${escapeHtml(money(saldoAplicado))} · ` : ""}Recibido ahora ${escapeHtml(money(recibidoAhora))}${sobrante > 0 ? ` · Sobrante a monto a favor ${escapeHtml(money(sobrante))}` : ""}</p>`
          : "";
      printDocument(
        "Comprobante de pago",
        `<div class="head"><div><h1>${escapeHtml(response.organizacion)}</h1><p>Comprobante de ${escapeHtml(item.concepto.toLowerCase())}</p></div><div class="meta"><p>${escapeHtml(formatDate(item.fecha_pago))}</p><span class="badge">${escapeHtml(item.estado)}</span></div></div><div class="summary"><div><span>Socios</span><b>${escapeHtml(item.socios_label)}</b></div><div><span>Modalidad</span><b>${escapeHtml(item.modalidad_label || item.concepto)}</b></div><div><span>Medio</span><b>${escapeHtml(item.medio_pago)}</b></div><div><span>Total obligación</span><b>${escapeHtml(money(item.monto))}</b></div></div>${balanceDetail}${item.motivo_condonacion ? `<p><b>Motivo de condonación:</b> ${escapeHtml(item.motivo_condonacion)}</p>` : ""}<table><thead><tr><th>Socio</th><th>Categoría</th><th>Período</th><th class="right">Base</th><th class="right">Desc.</th><th class="right">Cancelado</th></tr></thead><tbody>${lines}</tbody></table>${item.observaciones ? `<p class="foot"><b>Observaciones:</b> ${escapeHtml(item.observaciones)}</p>` : ""}`,
        popup,
      );
    } catch (err) {
      popup.close();
      setFeedback({ type: "error", message: err.message });
    }
  };

  const rowsForOutput = () =>
    tab === "saldos"
      ? {
          headers: [
            "Socio",
            "DNI",
            "Estado",
            "Movimientos",
            "Último movimiento",
            "Monto a favor",
          ],
          rows: items.map((item) => [
            item.socio,
            item.dni,
            item.activo ? "ACTIVO" : "INACTIVO",
            item.cantidad_movimientos,
            formatDateTimeDate(item.fecha_ultimo_movimiento),
            money(item.saldo_favor),
          ]),
        }
      : tab === "deudores"
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
            tab === "pagados" ? "Monto pagado" : "Cobrado",
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
            item.es_monto_libre
              ? `${money(item.monto)} · Monto libre`
              : money(item.monto),
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
  const appliedFilterLabel =
    tab === "saldos"
      ? "MONTOS A FAVOR"
      : [
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
        if (["deudores", "saldos"].includes(value)) setModality("");
        setFeedback(null);
      },
      options: [
        { value: "pagados", label: "Pagados" },
        { value: "deudores", label: "Deudores" },
        { value: "condonados", label: "Condonados" },
        { value: "saldos", label: "Montos a favor" },
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
    ...(tab !== "saldos"
      ? [
          {
            key: "categoria",
            label: "Categoría",
            type: "select",
            className: "cuotas-category-filter",
            placeholder: "Todas",
            value: category,
            onChange: setCategory,
            options: (catalogos.categorias || []).map((item) => ({
              value: item.id_categoria,
              label: `${item.nombre}${item.activo ? "" : " (BAJA)"}`,
            })),
          },
        ]
      : []),
    ...(!["deudores", "saldos"].includes(tab)
      ? [
          {
            key: "modalidad",
            label: "Modalidad",
            type: "select",
            className: "cuotas-modality-filter",
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
    ...(tab !== "saldos"
      ? [
          {
            key: "anio",
            label: "Año",
            type: "select",
            className: "cuotas-year-filter",
            includeEmptyOption: false,
            value: year,
            onChange: setYear,
            options: (catalogos.anios || []).map((item) => ({
              value: item,
              label: item,
            })),
          },
        ]
      : []),
    ...(tab === "saldos" || (tab !== "deudores" && modality === "INSCRIPCION")
      ? []
      : [
          {
            key: "mes",
            label: "Mes",
            type: "select",
            className: "cuotas-month-filter",
            includeEmptyOption: false,
            value: month,
            onChange: setMonth,
            options: (catalogos.meses || []).map((item) => ({
              value: item.id_mes,
              label: item.nombre,
            })),
          },
        ]),
  ];

  const secondaryActions = [
    {
      key: "imprimir",
      label: "Imprimir",
      icon: faPrint,
      onClick: printTable,
      disabled: !items.length,
      className:
        "mov-btn--ghost cuotas-header-output-action cuotas-header-output-action--print",
    },
    ...(!compactActions
      ? [
          {
            key: "excel",
            label: "Excel",
            icon: faFileExcel,
            onClick: exportTable,
            disabled: !items.length,
            className: "mov-btn--excel",
          },
        ]
      : []),
  ];

  return (
    <>
      <ModulePage
        title="Cuotas"
        filters={pageFilters}
        tabsInTitle
        headFiltersClassName="cuotas-head-filters"
        secondaryActions={secondaryActions}
        primaryActionLabel="Agregar monto a favor"
        onPrimaryAction={tab === "saldos" && writable ? openNewBalance : undefined}
        canCreate={tab === "saldos" && writable}
        notice={
          !writable
            ? "Tu usuario tiene permiso de consulta. Los pagos y anulaciones están deshabilitados."
            : null
        }
      >
        <ModuleFeedback
          type={feedback?.type || "error"}
          message={feedback?.message || error}
          duration={feedback?.duration}
          onClose={() => setFeedback(null)}
        />

        {tab === "saldos" ? (
          <GlobalDivTable
            ariaLabel="Listado de montos a favor"
            bodyClassName="entity-table-wrap"
            className="cuotas-table"
            columns={[
              "Socio",
              "Estado",
              "Movimientos",
              "Último movimiento",
              "Monto a favor",
              "Acciones",
            ]}
            gridClassName="cuotas-balance-grid"
            loading={loading}
            loadingLabel="Cargando montos a favor..."
            skeletonActionCount={writable ? 2 : 0}
            skeletonColumnTypes={[
              "stacked",
              "chip",
              "line",
              "line",
              "line",
              "actions",
            ]}
            skeletonRows={8}
          >
            {!items.length ? (
              <div className="module-empty">
                <FontAwesomeIcon icon={faInbox} aria-hidden="true" />
                <strong>Sin montos a favor</strong>
                <span>No hay socios con saldo a favor para mostrar.</span>
              </div>
            ) : null}
            {items.map((item) => (
              <div
                className="mov-gridTable mov-gridTable--row global-divTable__row entity-table-row cuotas-balance-grid"
                role="row"
                key={`saldo-${item.id_socio}`}
              >
                <div className="mov-gridCell entity-main-cell">
                  <strong>{item.socio}</strong>
                  <small>DNI {item.dni}</small>
                </div>
                <div className="mov-gridCell is-center">
                  <span
                    className={`mov-chip ${item.activo ? "mov-chip--ok" : ""}`}
                  >
                    {item.activo ? "ACTIVO" : "INACTIVO"}
                  </span>
                </div>
                <div className="mov-gridCell is-center">
                  {item.cantidad_movimientos}
                </div>
                <div className="mov-gridCell is-center">
                  {formatDateTimeDate(item.fecha_ultimo_movimiento)}
                </div>
                <div className="mov-gridCell is-right is-strong cuotas-balance-amount">
                  {money(item.saldo_favor)}
                </div>
                <div className="mov-gridCell mov-gridCell--actions">
                  {writable ? (
                    <div className="mov-actionsInline">
                      <button
                        className="mov-iconBtn cuotas-pay-button"
                        type="button"
                        onClick={() => openBalanceEdit(item)}
                        title="Editar monto a favor"
                        aria-label={`Editar monto a favor de ${item.socio}`}
                      >
                        <FontAwesomeIcon icon={faPen} />
                      </button>
                      <button
                        className="mov-iconBtn mov-iconBtn--danger"
                        type="button"
                        onClick={() => setBalanceDeleteModal(item)}
                        title="Eliminar monto a favor"
                        aria-label={`Eliminar monto a favor de ${item.socio}`}
                      >
                        <FontAwesomeIcon icon={faTrashCan} />
                      </button>
                    </div>
                  ) : (
                    <span className="entity-readonly">CONSULTA</span>
                  )}
                </div>
              </div>
            ))}
          </GlobalDivTable>
        ) : tab === "deudores" ? (
          <GlobalDivTable
            ariaLabel="Listado de cuotas adeudadas"
            bodyClassName="entity-table-wrap"
            className="cuotas-table"
            columns={[
              "Socio",
              "Familia",
              "Categoría",
              "Desde",
              "Cuotas",
              "Monto base",
              "Descuento",
              "Total",
              "Acciones",
            ]}
            gridClassName="cuotas-debt-grid"
            loading={loading}
            loadingLabel="Calculando deudas..."
            skeletonActionCount={1}
            skeletonColumnTypes={[
              "stacked",
              "line",
              "line",
              "line",
              "chip",
              "line",
              "chip",
              "line",
              "actions",
            ]}
            skeletonRows={8}
          >
            {!items.length ? (
              <div className="module-empty">
                <FontAwesomeIcon icon={faInbox} aria-hidden="true" />
                <strong>Sin deudas para mostrar</strong>
                <span>
                  Todos los períodos visibles se encuentran pagos o condonados.
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
                  <div className="mov-gridCell is-strong is-center">
                    {item.categoria}
                  </div>
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
                      multiSelectMode ? (
                        <label
                          className="cuotas-multi-checkbox"
                          title={`Seleccionar cuotas de ${item.socio}`}
                        >
                          <input
                            type="checkbox"
                            checked={
                              debtItemPaymentLines(item).length > 0 &&
                              debtItemPaymentLines(item).every((line) =>
                                Boolean(selectedPayments[line.key]),
                              )
                            }
                            onChange={() => toggleDebtItemSelection(item)}
                            aria-label={`Seleccionar cuotas de ${item.socio}`}
                          />
                        </label>
                      ) : (
                        <button
                          className="mov-iconBtn cuotas-pay-button"
                          type="button"
                          onClick={() =>
                            openPayment(
                              item.id_socio,
                              item.id_categoria,
                              item.primer_periodo,
                            )
                          }
                          aria-label={`Pagar cuotas de ${item.socio}`}
                          title="Registrar pago"
                        >
                          <FontAwesomeIcon icon={faDollarSign} />
                        </button>
                      )
                    ) : (
                      <span className="entity-readonly">CONSULTA</span>
                    )}
                </div>
              </div>
            ))}
          </GlobalDivTable>
        ) : (
          <GlobalDivTable
            ariaLabel={`Listado de cuotas ${tab}`}
            bodyClassName="entity-table-wrap"
            className="cuotas-table"
            columns={[
              "Socio",
              "Modalidad / períodos",
              "Categorías",
              "Fecha",
              "Medio de pago",
              "Monto base",
              "Descuento",
              tab === "pagados" ? "Monto pagado" : "Cobrado",
              "Acciones",
            ]}
            gridClassName="cuotas-operation-grid"
            loading={loading}
            loadingLabel="Cargando registros..."
            skeletonActionCount={writable ? 2 : 1}
            skeletonColumnTypes={[
              "stacked",
              "stacked",
              "line",
              "line",
              "line",
              "line",
              "line",
              "line",
              "actions",
            ]}
            skeletonRows={8}
          >
            {!items.length ? (
              <div className="module-empty">
                <FontAwesomeIcon icon={faInbox} aria-hidden="true" />
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
                key={
                  item.fila_id ||
                  `operacion-${item.tipo_registro ?? "registro"}-${item.id_operacion ?? item.codigo_operacion ?? item.id_socio ?? item.socio ?? "socio"}-${item.fecha_pago ?? "fecha"}-${index}`
                }
              >
                  <div className="mov-gridCell entity-main-cell">
                    <strong>{item.socio}</strong>
                    <small>DNI {item.dni}</small>
                  </div>
                  <div className="mov-gridCell entity-main-cell">
                    <strong>{item.modalidad_label || item.concepto}</strong>
                    <small>{item.periodos_label}</small>
                  </div>
                  <div className="mov-gridCell is-center">
                    <span className="entity-wrap-text">
                      {item.categorias_label}
                    </span>
                  </div>
                  <div className="mov-gridCell entity-main-cell is-center">
                    <strong>{formatDate(item.fecha_pago)}</strong>
                  </div>
                  <div className="mov-gridCell is-center">
                    <span className="entity-wrap-text">{item.medio_pago}</span>
                  </div>
                  <div className="mov-gridCell is-strong">
                    {money(item.monto_base)}
                  </div>
                  <div className="mov-gridCell">{item.descuento_label}</div>
                  <div className="mov-gridCell entity-main-cell is-right">
                    <strong>{money(item.monto)}</strong>
                    {item.es_monto_libre ? (
                      <small className="cuotas-custom-amount-label">
                        Monto libre
                      </small>
                    ) : null}
                    {Number(item.monto_saldo_favor_aplicado || 0) > 0 ? (
                      <small>
                        Monto a favor {money(item.monto_saldo_favor_aplicado)} · Recibido {money(item.monto_cobrado_ahora)}
                      </small>
                    ) : null}
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
          </GlobalDivTable>
        )}

        {writable && tab === "deudores" && multiSelectMode ? (
          <div className="cuotas-multi-toolbar" role="region" aria-label="Selección múltiple">
            <div className="cuotas-multi-toolbar__summary">
              <strong>{selectedPaymentLines.length} seleccionadas</strong>
              <span>Total estimado: {money(selectedPaymentTotal)}</span>
            </div>
            <div className="cuotas-multi-toolbar__actions">
              <button className="mov-btn" type="button" onClick={toggleAllVisibleDebts}>
                {allVisibleDebtsSelected ? "Quitar visibles" : "Seleccionar todas"}
              </button>
              <button
                className="mov-btn"
                type="button"
                onClick={() => setSelectedPayments({})}
                disabled={!selectedPaymentLines.length}
              >
                Limpiar
              </button>
              <button
                className="mov-btn cuotas-output-button--primary"
                type="button"
                onClick={openMultiPayment}
                disabled={!selectedPaymentLines.length}
              >
                Continuar ({selectedPaymentLines.length})
              </button>
            </div>
          </div>
        ) : null}

        <div
          className="cuotas-output-actions--bottom"
          aria-label="Acciones de cuotas"
        >
          {writable && tab === "deudores" ? (
            <button
              className={`mov-btn cuotas-output-button${multiSelectMode ? " cuotas-output-button--active" : ""}`}
              type="button"
              onClick={() => {
                setMultiSelectMode((current) => {
                  if (current) setSelectedPayments({});
                  return !current;
                });
              }}
            >
              {multiSelectMode ? "Salir de selección" : "Selección múltiple"}
            </button>
          ) : null}
          {writable && tab !== "saldos" ? (
            <button
              className="mov-btn cuotas-output-button cuotas-output-button--primary"
              type="button"
              onClick={() => setPickerOpen(true)}
            >
              <FontAwesomeIcon icon={faWallet} />
              Registrar pago
            </button>
          ) : null}
          <button
            className="mov-btn cuotas-output-button"
            type="button"
            onClick={printTable}
            disabled={!items.length}
          >
            <FontAwesomeIcon icon={faPrint} />
            Imprimir
          </button>
          {compactActions ? (
            <button
              className="mov-btn mov-btn--excel mov-btn--compact"
              type="button"
              onClick={exportTable}
              disabled={!items.length}
            >
              <FontAwesomeIcon icon={faFileExcel} />
              Excel
            </button>
          ) : null}
        </div>
      </ModulePage>

      <CrudModal
        open={multiPaymentOpen}
        title="Registrar pago múltiple"
        subtitle="Todas las cuotas se validan nuevamente y se registran dentro de una única operación atómica."
        onClose={() => !multiPaymentSaving && setMultiPaymentOpen(false)}
        onSubmit={saveMultiPayment}
        saving={multiPaymentSaving}
        submitLabel={`Registrar ${selectedPaymentLines.length} pagos`}
        submitDisabled={
          !selectedPaymentLines.length ||
          !multiPaymentForm.fecha_pago ||
          !multiPaymentForm.id_medio_pago
        }
        wide
        modalClassName="cuotas-modal cuotas-modal--multi"
        footerStart={
          <div className="cuotas-payment-footer-total">
            <span>Total estimado</span>
            <strong>{money(selectedPaymentTotal)}</strong>
            <small>El backend recalcula importes y descuentos antes de confirmar.</small>
          </div>
        }
      >
        <div className="cuotas-multi-payment">
          <div className="cuotas-multi-payment__fields">
            <FloatingField label="Fecha de pago *" active>
              <input
                type="date"
                max={today()}
                value={multiPaymentForm.fecha_pago}
                onClick={openDatePicker}
                onChange={(event) =>
                  setMultiPaymentForm((current) => ({
                    ...current,
                    fecha_pago: event.target.value,
                  }))
                }
                required
              />
            </FloatingField>
            <FloatingField label="Medio de pago *" active>
              <select
                value={multiPaymentForm.id_medio_pago}
                onChange={(event) =>
                  setMultiPaymentForm((current) => ({
                    ...current,
                    id_medio_pago: event.target.value,
                  }))
                }
                required
              >
                <option value="">SELECCIONAR MEDIO</option>
                {fullCatalogs.medios_pago.map((item) => (
                  <option key={item.id_medio_pago} value={item.id_medio_pago}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </FloatingField>
          </div>

          <div className="cuotas-multi-payment__list">
            {selectedPaymentLines.map((line) => (
              <article className="cuotas-multi-payment__line" key={line.key}>
                <div>
                  <strong>{line.socio}</strong>
                  <small>DNI {line.dni} · {line.categoria}</small>
                </div>
                <div>
                  <strong>{line.periodo}</strong>
                  <small>Desc. familiar {percent(line.porcentaje_descuento)}</small>
                </div>
                <strong>{money(line.monto)}</strong>
              </article>
            ))}
          </div>
        </div>
      </CrudModal>

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
        modalClassName="cuotas-modal cuotas-modal--picker"
      >
        <section className="cuotas-picker-card">
          <span className="cuotas-picker-card__icon">
            <FontAwesomeIcon icon={faUser} />
          </span>
          <div className="cuotas-picker-card__content">
            <div>
              <small>Primer paso</small>
              <strong>Seleccioná un socio</strong>
              <p>
                Se consultarán sus categorías, períodos pendientes y grupo
                familiar antes de registrar el cobro.
              </p>
            </div>
            <FloatingField label="Socio *" active>
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
            </FloatingField>
          </div>
        </section>
      </CrudModal>

      <CrudModal
        open={paymentOpen}
        title="Registrar pago"
        subtitle={paymentLoading ? "Consultando cuotas pendientes..." : null}
        onClose={() => setPaymentOpen(false)}
        onSubmit={savePayment}
        saving={saving}
        submitLabel={paymentForm.condonado ? "Condonar" : "Pagar"}
        submitDisabled={
          !hasPaymentSelection || paymentInsufficient || freeAmountInvalid
        }
        wide
        hideCancel
        hideSubmit={
          paymentLoading || !paymentDetail || !availableModalities.length
        }
        footerStart={
          paymentDetail ? (
            <div className="cuotas-payment-footer-total">
              <span>{paymentForm.usar_monto_libre ? "Monto libre" : "Total"}</span>
              <strong>{money(recordedPaymentTotal)}</strong>
              {paymentForm.usar_monto_libre ? (
                <small>Valor normal del cobro: {money(paymentTotal)}</small>
              ) : null}
              {!paymentForm.condonado && balanceAppliedPreview > 0 ? (
                <small>
                  Monto a favor aplicado: {money(balanceAppliedPreview)} · Recibido ahora: {money(cashReceivedPreview)}
                </small>
              ) : null}
              {!paymentForm.condonado && surplusPreview > 0 ? (
                <small>Sobrante a favor: {money(surplusPreview)}</small>
              ) : null}
              {paymentDetail.familia && !paymentForm.condonado ? (
                <small>
                  Incluye {percent(paymentDetail.familia.porcentaje_descuento)}
                  de descuento familiar
                </small>
              ) : null}
            </div>
          ) : null
        }
        modalClassName="cuotas-modal cuotas-modal--payment"
      >
        {paymentLoading ? (
          <p className="entity-confirm-text">
            Cargando socio, familia, categorías y pagos anteriores...
          </p>
        ) : null}
        {paymentDetail ? (
          <div className="cuotas-payment-form">
            <section className="cuotas-payment-person">
              <div className="cuotas-payment-person__identity">
                <span>Socio</span>
                <strong>{paymentDetail.socio.socio}</strong>
                <small>DNI {paymentDetail.socio.dni}</small>
              </div>

              {paymentDetail.familia ? (
                <div className="cuotas-payment-person__family">
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
                      Descuento: {percent(
                        paymentDetail.familia.porcentaje_descuento,
                      )}
                    </small>
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={paymentForm.aplicar_familia}
                      onChange={(event) =>
                        changeFamilyScope(event.target.checked)
                      }
                    />
                    Cobrar a todo el grupo
                  </label>
                </div>
              ) : (
                <span className="cuotas-payment-person__single">
                  Sin grupo familiar · Sin descuento
                </span>
              )}
            </section>

            <div
              className="cuotas-payment-concept-tabs"
              role="tablist"
              aria-label="Concepto del pago"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!isRegistrationMode}
                className={!isRegistrationMode ? "is-active" : ""}
                onClick={() => changePaymentConcept("CUOTAS")}
                disabled={!feeModalities.length}
              >
                Cuotas
                {selectedPeriods.length ? (
                  <small>{selectedPeriods.length}</small>
                ) : null}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isRegistrationMode}
                className={isRegistrationMode ? "is-active" : ""}
                onClick={() => changePaymentConcept("INSCRIPCION")}
                disabled={!registrationAvailable}
              >
                Inscripción
                {paymentForm.incluir_inscripcion ? <small>✓</small> : null}
              </button>
            </div>

            <div className="cuotas-payment-content">
              <div
                className={`entity-form__grid cuotas-payment-controls cuotas-payment-controls--compact ${!isRegistrationMode && feeModalities.length > 1 ? "has-modality" : ""}`}
              >
                <FloatingField label="Categoría" active>
                  <select
                    value={paymentForm.id_categoria}
                    onChange={(event) =>
                      changePaymentCategory(event.target.value)
                    }
                    required
                  >
                    {paymentDetail.categorias.map((item) => (
                      <option
                        key={item.id_categoria}
                        value={item.id_categoria}
                      >
                        {item.nombre}
                      </option>
                    ))}
                  </select>
                </FloatingField>

                <FloatingField label="Año" active>
                  <select
                    value={paymentForm.anio}
                    onChange={(event) =>
                      changePaymentYear(event.target.value)
                    }
                  >
                    {paymentDetail.anios.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </FloatingField>

                {!isRegistrationMode && feeModalities.length > 1 ? (
                  <FloatingField
                    label="Modalidad"
                    active
                    className="cuotas-payment-modality-field"
                  >
                    <select
                      value={paymentForm.modalidad}
                      onChange={(event) =>
                        changePaymentModality(event.target.value)
                      }
                    >
                      {feeModalities.map((item) => (
                        <option key={item.codigo} value={item.codigo}>
                          {modalityOptionLabel(item)}
                        </option>
                      ))}
                    </select>
                  </FloatingField>
                ) : null}
              </div>

              {!availableModalities.length ? (
                <div className="module-notice">
                  No hay cuotas ni inscripciones pendientes para esta categoría
                  y año.
                </div>
              ) : !isRegistrationMode ? (
                <>
                  {isPackageMode ? (
                    <div className="cuotas-package-notice">
                      <strong>
                        {feeModalities.find(
                          (item) => item.codigo === paymentForm.modalidad,
                        )?.nombre || "PAGO AGRUPADO"}
                      </strong>
                      <span>Los meses incluidos se marcaron automáticamente.</span>
                    </div>
                  ) : null}

                  <div className="cuotas-period-list">
                    {groupedPeriods.map((group) => (
                      <section
                        className="cuotas-period-group"
                        key={group.id_socio}
                      >
                        <header>
                          <strong>{group.socio}</strong>
                          {paymentDetail.familia ? (
                            <span>
                              {percent(
                                paymentDetail.familia.porcentaje_descuento,
                              )}
                            </span>
                          ) : null}
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
                        No hay períodos pendientes para esta categoría y año.
                      </p>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="cuotas-registration-box">
                  <label
                    className={`cuotas-registration-choice ${paymentForm.incluir_inscripcion ? "is-selected" : ""} ${!pendingRegistrationRecipients.length ? "is-disabled" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={paymentForm.incluir_inscripcion}
                      onChange={(event) =>
                        updateForm("incluir_inscripcion", event.target.checked)
                      }
                      disabled={!pendingRegistrationRecipients.length}
                    />
                    <div>
                      <span>Incluir inscripción en este pago</span>
                      <strong>{money(registrationTotal)}</strong>
                      <small>
                        {pendingRegistrationRecipients.length} integrante
                        {pendingRegistrationRecipients.length === 1 ? "" : "s"}
                      </small>
                    </div>
                  </label>
                  <div className="cuotas-registration-members">
                    {registrationRecipients.map((member) => {
                      const pending = member.estado === "PENDIENTE";
                      const status =
                        pending && paymentForm.incluir_inscripcion
                          ? "INCLUIDA"
                          : member.estado;
                      return (
                        <article key={member.id_socio}>
                          <strong>{member.socio}</strong>
                          <span
                            className={`mov-chip ${status === "INCLUIDA" || status === "PAGADO" ? "mov-chip--ok" : status === "CONDONADO" ? "mov-chip--danger" : ""}`}
                          >
                            {status}
                          </span>
                        </article>
                      );
                    })}
                    {!registrationRecipients.length ? (
                      <p className="entity-help">
                        Ningún integrante seleccionado tiene esta categoría en
                        el año indicado.
                      </p>
                    ) : null}
                  </div>
                </div>
              )}

              <section className="cuotas-payment-data cuotas-payment-data--compact">
                {!paymentForm.condonado ? (
                  <>
                    {availableBalance > 0 ? (
                      <div className="cuotas-balance-payment">
                        <div className="cuotas-balance-payment__head">
                          <div>
                            <span>Monto a favor disponible</span>
                            <strong>{money(availableBalance)}</strong>
                          </div>
                          <label
                            className={
                              paymentForm.aplicar_familia ||
                              paymentForm.usar_monto_libre
                                ? "is-disabled"
                                : ""
                            }
                          >
                            <input
                              type="checkbox"
                              checked={paymentForm.usar_saldo_favor}
                              disabled={
                                paymentForm.aplicar_familia ||
                                paymentForm.usar_monto_libre
                              }
                              onChange={(event) =>
                                updateForm(
                                  "usar_saldo_favor",
                                  event.target.checked,
                                )
                              }
                            />
                            Usar monto a favor
                          </label>
                        </div>

                        {paymentForm.aplicar_familia ? (
                          <small>
                            El monto a favor es individual. Para usarlo, desactivá
                            el cobro a todo el grupo familiar.
                          </small>
                        ) : paymentForm.usar_monto_libre ? (
                          <small>
                            El monto a favor no se combina con un monto libre.
                          </small>
                        ) : paymentForm.usar_saldo_favor ? (
                          <small>
                            Se aplicará automáticamente hasta cubrir el importe
                            necesario del cobro.
                          </small>
                        ) : (
                          <small>
                            Desmarcado: el saldo queda disponible para un próximo
                            pago.
                          </small>
                        )}
                      </div>
                    ) : null}

                    <div className="cuotas-free-payment-toggle">
                      <label>
                        <input
                          type="checkbox"
                          checked={paymentForm.usar_monto_libre}
                          onChange={(event) =>
                            setPaymentForm((current) => ({
                              ...current,
                              usar_monto_libre: event.target.checked,
                              monto_libre: event.target.checked
                                ? current.monto_libre
                                : "",
                              usar_saldo_favor: event.target.checked
                                ? false
                                : !current.aplicar_familia &&
                                  availableBalance > 0,
                              monto_recibido: event.target.checked
                                ? ""
                                : current.monto_recibido,
                            }))
                          }
                        />
                        Usar monto personalizado
                      </label>
                    </div>

                    {paymentForm.usar_monto_libre ? (
                      <div className="cuotas-free-payment is-active">
                        <div className="cuotas-free-payment__head">
                          <div>
                            <span>Monto libre</span>
                            <strong>Pago personalizado</strong>
                          </div>
                        </div>

                        <div className="cuotas-free-payment__fields">
                          <FloatingField
                            label="Monto libre *"
                            active={paymentForm.monto_libre !== ""}
                          >
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              max={Math.max(0, paymentTotal - 0.01)}
                              placeholder=" "
                              value={paymentForm.monto_libre}
                              onChange={(event) =>
                                updateForm("monto_libre", event.target.value)
                              }
                              required
                            />
                          </FloatingField>
                          <div className="cuotas-balance-payment__summary">
                            <span>Valor normal: <b>{money(paymentTotal)}</b></span>
                            <span>Se registra: <b>{money(freeAmount || 0)}</b></span>
                            <span>Estado: <b>PAGADO</b></span>
                            <span>Tipo: <b>Monto libre</b></span>
                          </div>
                        </div>
                        <small>
                          El importe indicado se acepta como pago completo de lo
                          seleccionado. La cuota queda PAGADA y en Contable se
                          identifica como “Monto personalizado”.
                        </small>
                        {freeAmountInvalid ? (
                          <small className="cuotas-balance-payment__error">
                            El monto libre debe ser mayor a $ 0 y menor al importe
                            normal del cobro. Para cobrar de más, usá “Monto
                            recibido”.
                          </small>
                        ) : null}
                      </div>
                    ) : null}

                    {!paymentForm.usar_monto_libre ? (
                      <div className="cuotas-payment-amount-row">
                        <div className="cuotas-balance-payment__fields">
                          <FloatingField
                            label="Monto recibido"
                            active={paymentForm.monto_recibido !== ""}
                          >
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder=" "
                              value={paymentForm.monto_recibido}
                              onChange={(event) =>
                                updateForm("monto_recibido", event.target.value)
                              }
                            />
                          </FloatingField>
                          <div className="cuotas-balance-payment__summary">
                            <span>Se cancela: <b>{money(paymentTotal)}</b></span>
                            {availableBalance > 0 ? (
                              <span>
                                Saldo aplicado: <b>{money(balanceAppliedPreview)}</b>
                              </span>
                            ) : null}
                            <span>
                              Recibido ahora: <b>{money(cashReceivedPreview)}</b>
                            </span>
                            {surplusPreview > 0 ? (
                              <span className="is-positive">
                                Sobrante a favor: <b>{money(surplusPreview)}</b>
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <small>
                          Dejá “Monto recibido” vacío para cobrar exactamente lo
                          necesario. Si ingresás más, el sobrante queda guardado como
                          monto a favor.
                        </small>
                        {paymentInsufficient ? (
                          <small className="cuotas-balance-payment__error">
                            El monto recibido más el monto a favor aplicado no alcanza
                            para cancelar el cobro. Si querés aceptar un pago menor,
                            activá “Monto libre”.
                          </small>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}

                <div className="entity-form__grid">
                  <FloatingField label="Fecha *" active>
                    <input
                      type="date"
                      max={today()}
                      value={paymentForm.fecha_pago}
                      onClick={openDatePicker}
                      onChange={(event) =>
                        updateForm("fecha_pago", event.target.value)
                      }
                      required
                    />
                  </FloatingField>

                  {!paymentForm.condonado ? (
                    <FloatingField label="Medio de pago *" active>
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
                    </FloatingField>
                  ) : (
                    <FloatingField
                      label="Motivo de condonación *"
                      active={Boolean(paymentForm.motivo_condonacion)}
                    >
                      <input
                        placeholder=" "
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
                    </FloatingField>
                  )}
                </div>

                <label className="cuotas-condone-toggle cuotas-condone-toggle--compact">
                  <input
                    type="checkbox"
                    checked={paymentForm.condonado}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        condonado: event.target.checked,
                        usar_saldo_favor: false,
                        monto_recibido: "",
                        usar_monto_libre: false,
                        monto_libre: "",
                      }))
                    }
                  />
                  <span>Condonar en lugar de cobrar</span>
                </label>
              </section>
            </div>
          </div>
        ) : null}
      </CrudModal>

      <CrudModal
        open={Boolean(balanceModal)}
        title={balanceModal?.mode === "edit" ? "Editar monto a favor" : "Agregar monto a favor"}
        subtitle={
          balanceModal?.mode === "edit"
            ? `${balanceModal.socio} · Saldo actual ${money(balanceModal.saldo_favor)}`
            : "Seleccioná un socio activo e indicá el monto que querés agregar."
        }
        onClose={() => {
          setBalanceModal(null);
          setBalancePartnerSearch("");
        }}
        onSubmit={saveBalanceAdjustment}
        saving={balanceSaving}
        submitLabel={balanceModal?.mode === "edit" ? "Guardar cambios" : "Agregar monto"}
        submitDisabled={balanceModal?.mode !== "edit" && !balanceForm.id_socio}
        modalClassName="cuotas-modal cuotas-modal--balance"
      >
        {balanceModal ? (
          <div className="cuotas-balance-adjustment">
            {balanceModal.mode === "create" ? (
              <>
                <FloatingField
                  label="Buscar socio"
                  active={Boolean(balancePartnerSearch)}
                >
                  <input
                    type="search"
                    placeholder=" "
                    value={balancePartnerSearch}
                    onChange={(event) => {
                      setBalancePartnerSearch(event.target.value);
                      setBalanceForm((current) => ({ ...current, id_socio: "" }));
                    }}
                    autoComplete="off"
                  />
                </FloatingField>
                <FloatingField label="Socio activo *" active={Boolean(balanceForm.id_socio)}>
                  <select
                    value={balanceForm.id_socio}
                    onChange={(event) =>
                      setBalanceForm((current) => ({
                        ...current,
                        id_socio: event.target.value,
                      }))
                    }
                    required
                  >
                    <option value="">Seleccioná un socio</option>
                    {balancePartnerOptions.map((partner) => (
                      <option key={partner.id_socio} value={partner.id_socio}>
                        {`${partner.apellido}, ${partner.nombre} · DNI ${partner.dni}`}
                      </option>
                    ))}
                  </select>
                </FloatingField>
                {balancePartnerSearch && !balancePartnerOptions.length ? (
                  <small className="entity-help">
                    No hay socios activos que coincidan con la búsqueda.
                  </small>
                ) : null}
                {selectedBalancePartner ? (
                  <small className="entity-help">
                    El monto se agregará al saldo a favor actual del socio.
                  </small>
                ) : null}
              </>
            ) : (
              <div className="cuotas-balance-adjustment__current">
                <span>Monto a favor actual</span>
                <strong>{money(balanceModal.saldo_favor)}</strong>
              </div>
            )}

            <FloatingField
              label={balanceModal.mode === "edit" ? "Nuevo monto a favor *" : "Monto a agregar *"}
              active={Boolean(balanceForm.monto)}
            >
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder=" "
                value={balanceForm.monto}
                onChange={(event) =>
                  setBalanceForm((current) => ({
                    ...current,
                    monto: event.target.value,
                  }))
                }
                required
              />
            </FloatingField>
            <FloatingField label="Detalle" active={Boolean(balanceForm.detalle)}>
              <textarea
                placeholder=" "
                maxLength={500}
                value={balanceForm.detalle}
                onChange={(event) =>
                  setBalanceForm((current) => ({
                    ...current,
                    detalle: event.target.value.toLocaleUpperCase("es-AR"),
                  }))
                }
              />
            </FloatingField>
            {balanceModal.mode === "edit" ? (
              <small className="entity-help">
                Guardar reemplaza el saldo actual por el nuevo monto indicado. Para dejarlo en cero, usá Eliminar.
              </small>
            ) : null}
          </div>
        ) : null}
      </CrudModal>

      {paymentReceipt ? (
        <ModalComprobantePago
          open={paymentReceiptOpen}
          comprobante={paymentReceipt}
          loading={paymentReceiptLoading}
          onClose={() => setPaymentReceiptOpen(false)}
          onPrint={() => openReceiptOutput(false)}
          onExportPdf={() => openReceiptOutput(true)}
        />
      ) : null}

      <ModalEliminarGlobal
        open={Boolean(balanceDeleteModal)}
        operacion="eliminar"
        row={balanceDeleteModal}
        title="Eliminar monto a favor"
        message="El saldo disponible del socio quedará en $ 0,00 y dejará de aparecer en Montos a favor."
        warning="Se conservará el historial de movimientos para auditoría."
        details={
          balanceDeleteModal
            ? [
                { label: "Socio", value: balanceDeleteModal.socio },
                { label: "DNI", value: balanceDeleteModal.dni },
                { label: "Monto a favor", value: money(balanceDeleteModal.saldo_favor) },
              ]
            : []
        }
        onClose={() => setBalanceDeleteModal(null)}
        onConfirm={confirmBalanceDelete}
        onToast={(type, message, duration) =>
          setFeedback({ type, message, duration })
        }
        confirmLabel="Eliminar monto a favor"
        loadingMessage="Eliminando monto a favor…"
        successMessage="Monto a favor eliminado correctamente."
        errorMessage="No se pudo eliminar el monto a favor."
      />

      <ModalEliminarGlobal
        open={Boolean(deleteModal)}
        operacion="eliminar"
        row={deleteModal}
        title={
          deleteModal?.estado === "CONDONADO"
            ? "Eliminar condonación"
            : "Eliminar pago"
        }
        message={
          deleteModal?.cobro_combinado
            ? "Se anularán juntas las cuotas y la inscripción incluidas en este cobro."
            : deleteModal?.es_paquete
              ? "Se anulará el paquete completo y todos sus períodos volverán a quedar pendientes."
              : "Se anularán las líneas incluidas en esta operación y los períodos volverán a quedar pendientes."
        }
        warning="La auditoría de la operación se conservará."
        details={
          deleteModal
            ? [
                { label: "Socio", value: deleteModal.socio },
                {
                  label: "Modalidad",
                  value: deleteModal.modalidad_label || deleteModal.concepto,
                },
                { label: "Períodos", value: deleteModal.periodos_label },
                {
                  label: "Líneas incluidas",
                  value: deleteModal.cantidad_lineas || 0,
                },
                { label: "Monto", value: money(deleteModal.monto) },
              ]
            : []
        }
        onClose={() => setDeleteModal(null)}
        onConfirm={confirmDelete}
        onToast={(type, message, duration) =>
          setFeedback({ type, message, duration })
        }
        confirmLabel="Eliminar registro"
        loadingMessage={
          deleteModal?.estado === "CONDONADO"
            ? "Eliminando la condonación…"
            : "Eliminando el pago…"
        }
        successMessage={
          deleteModal?.estado === "CONDONADO"
            ? "Condonación eliminada correctamente."
            : "Pago eliminado correctamente."
        }
        errorMessage={
          deleteModal?.estado === "CONDONADO"
            ? "No se pudo eliminar la condonación."
            : "No se pudo eliminar el pago."
        }
        extraContent={
          deleteModal?.cobro_combinado ? (
            <div className="cuotas-delete-package-warning">
              <strong>Este pago incluye cuotas e inscripción.</strong>
              <p className="entity-confirm-text">
                La operación es única: al eliminarla volverán a quedar
                pendientes tanto la inscripción como los meses cobrados.
              </p>
            </div>
          ) : deleteModal?.es_paquete ? (
            <div className="cuotas-delete-package-warning">
              <strong>
                Este registro corresponde a {deleteModal.modalidad_label}.
              </strong>
              <p className="entity-confirm-text">
                Aunque hayas abierto la acción desde un mes puntual, se anulará
                el paquete completo de {deleteModal.cantidad_lineas || 0} meses.
              </p>
            </div>
          ) : null
        }
      />
    </>
  );
}
