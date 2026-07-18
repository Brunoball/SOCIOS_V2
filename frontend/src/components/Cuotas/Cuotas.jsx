import React from "react";
import { faCircleCheck, faClock, faMoneyBillWave, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../Global/components/ModulePage";
import DataTablePlaceholder from "../Global/components/DataTablePlaceholder";

const stats = [
    { label: "Recaudado", value: "$ 0,00", detail: "Período actual", icon: faMoneyBillWave },
{ label: "Pendientes", value: "0", detail: "Sin cuotas generadas", icon: faClock },
{ label: "Pagadas", value: "0", detail: "Sin pagos cargados", icon: faCircleCheck },
{ label: "Vencidas", value: "0", detail: "Sin vencimientos", icon: faTriangleExclamation }
];
const filters = [
    { label: "Buscar socio", type: "search", placeholder: "Nombre o documento" },
{ label: "Período", type: "select", placeholder: "Período actual" },
{ label: "Estado", type: "select", placeholder: "Todos" }
];

export default function Cuotas() {
  return (
    <ModulePage title="Cuotas" description="Generación, seguimiento y registro de pagos de cuotas." stats={stats} filters={filters} primaryActionLabel="Generar cuotas" notice="Módulo visual preparado. La lógica y persistencia se implementarán en la siguiente etapa.">
      <DataTablePlaceholder columns={["Socio", "Período", "Categoría", "Importe", "Vencimiento", "Estado", "Acciones"]} message="La tabla quedará conectada a la generación y cobranza de cuotas." />
    </ModulePage>
  );
}
