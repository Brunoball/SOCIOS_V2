import { apiGet, apiPost } from "../../Global/api/apiClient";

export const cuotasApi = {
  listar: (params) => apiGet("cuotas_listar", params),
  guardar: (payload) => apiPost("cuotas_guardar", payload),
  eliminar: (id) => apiPost("cuotas_eliminar", { id }),
};
