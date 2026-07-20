import { apiGet, apiPost } from "../../Global/api/apiClient";

export const sociosApi = {
  listar: (params) => apiGet("socios_listar", params),
  obtener: (id) => apiGet("socios_obtener", { id }),
  historial: (id) => apiGet("socios_historial", { id }),
  guardar: (payload) => apiPost("socios_guardar", payload),
  darBaja: (payload) => apiPost("socios_eliminar", payload),
  reactivar: (id) => apiPost("socios_reactivar", { id }),
};
