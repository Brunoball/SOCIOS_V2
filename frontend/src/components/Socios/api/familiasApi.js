import { apiGet, apiPost } from "../../Global/api/apiClient";
export const familiasApi = {
  listar: (params) => apiGet("familias_listar", params),
  obtener: (id) => apiGet("familias_obtener", { id }),
  guardar: (payload) => apiPost("familias_guardar", payload),
  darBaja: (id) => apiPost("familias_eliminar", { id }),
  reactivar: (id) => apiPost("familias_reactivar", { id }),
};
