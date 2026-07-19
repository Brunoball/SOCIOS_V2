import { apiGet, apiPost } from "../../Global/api/apiClient";

export const configuracionApi = {
  obtener: () => apiGet("configuracion_obtener"),
  guardarParametros: (payload) => apiPost("configuracion_guardar_parametros", payload),
  guardarItem: (payload) => apiPost("configuracion_lista_guardar", payload),
  eliminarItem: (lista, id) => apiPost("configuracion_lista_eliminar", { lista, id }),
  reactivarItem: (lista, id) => apiPost("configuracion_lista_reactivar", { lista, id }),
};
