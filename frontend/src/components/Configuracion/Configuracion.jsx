import React from "react";
import { faBuilding, faGear, faPalette, faUserShield } from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../Global/components/ModulePage";

const stats = [
  { label: "Institución", value: "Pendiente", detail: "Datos generales", icon: faBuilding },
  { label: "Usuarios", value: "0", detail: "Sin usuarios reales", icon: faUserShield },
  { label: "Apariencia", value: "Base", detail: "Diseño heredado", icon: faPalette },
  { label: "Sistema", value: "Inicial", detail: "Sin backend conectado", icon: faGear },
];
export default function Configuracion() {
  return <ModulePage title="Configuración" description="Parámetros generales, usuarios, identidad y opciones del SaaS." stats={stats} filters={[]} primaryActionLabel="Guardar configuración" notice="La pantalla queda reservada para implementar configuración institucional y de usuarios."><div className="module-empty"><FontAwesomeIconPlaceholder /></div></ModulePage>;
}
function FontAwesomeIconPlaceholder() {
  return <><strong>Configuración pendiente</strong><span>Los formularios se crearán cuando se definan los campos de la base de datos y los permisos.</span></>;
}
