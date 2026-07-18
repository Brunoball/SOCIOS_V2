import React from "react";
import { faArrowTrendDown, faArrowTrendUp, faScaleBalanced, faWallet } from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../Global/components/ModulePage";
import DataTablePlaceholder from "../Global/components/DataTablePlaceholder";

const stats = [
    { label: "Ingresos", value: "$ 0,00", detail: "Período actual", icon: faArrowTrendUp },
{ label: "Egresos", value: "$ 0,00", detail: "Período actual", icon: faArrowTrendDown },
{ label: "Balance", value: "$ 0,00", detail: "Resultado neto", icon: faScaleBalanced },
{ label: "Caja", value: "$ 0,00", detail: "Saldo disponible", icon: faWallet }
];
const filters = [
    { label: "Buscar movimiento", type: "search", placeholder: "Concepto o comprobante" },
{ label: "Tipo", type: "select", placeholder: "Todos" },
{ label: "Período", type: "select", placeholder: "Período actual" }
];

export default function Contable() {
  return (
    <ModulePage title="Contable" description="Registro resumido de ingresos, egresos, caja y balances." stats={stats} filters={filters} primaryActionLabel="Nuevo movimiento" notice="Módulo visual preparado. La lógica y persistencia se implementarán en la siguiente etapa.">
      <DataTablePlaceholder columns={["Fecha", "Tipo", "Concepto", "Medio de pago", "Comprobante", "Importe", "Acciones"]} message="La estructura está lista para conectar ingresos, egresos y conciliación de cuotas." />
    </ModulePage>
  );
}
