import { apiGet, apiPost } from "../../Global/api/apiClient";
export const botWhatsappApi = {
  estado: () => apiGet("whatsapp_estado"),
  guardarConfiguracion: (payload) => apiPost("whatsapp_configuracion_guardar", payload),
};
