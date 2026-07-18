import React from "react";
import { faBullhorn, faComments, faLink, faMessage } from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../Global/components/ModulePage";

const stats = [
  { label: "Estado", value: "Sin conectar", detail: "API pendiente", icon: faLink },
  { label: "Contactos", value: "0", detail: "Sin sincronizar", icon: faComments },
  { label: "Plantillas", value: "0", detail: "Sin configurar", icon: faMessage },
  { label: "Campañas", value: "0", detail: "Sin envíos", icon: faBullhorn },
];

export default function BotWhatsapp() {
  return (
    <ModulePage title="Panel de bot de WhatsApp" description="Base visual para conexión, plantillas, mensajes y campañas." stats={stats} filters={[]} primaryActionLabel="Configurar conexión" notice="No se incluye integración con Meta ni envío de mensajes: solo la estructura del módulo.">
      <div className="bot-grid">
        <section className="bot-panel"><h2>Conexión de WhatsApp</h2><p>Acá se mostrarán el número conectado, el estado del webhook y la información de la cuenta.</p><div className="bot-status"><strong>Conexión no configurada</strong><span>La implementación se realizará cuando estén definidos los datos y credenciales del proveedor.</span></div></section>
        <section className="bot-panel"><h2>Accesos del módulo</h2><p>Plantillas, conversaciones, campañas y automatizaciones quedarán organizadas dentro de esta sección.</p><div className="bot-status"><strong>Estructura limpia</strong><span>Sin código heredado ni llamadas externas activas.</span></div></section>
      </div>
    </ModulePage>
  );
}
