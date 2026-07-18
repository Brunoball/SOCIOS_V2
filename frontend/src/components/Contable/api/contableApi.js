import { apiGet, apiPost } from "../../Global/api/apiClient";

export const contableApi = {
  listar: (params) => apiGet("contable_listar", params),
  guardar: (payload) => apiPost("contable_guardar", payload),
  eliminar: (id) => apiPost("contable_eliminar", { id }),
};
