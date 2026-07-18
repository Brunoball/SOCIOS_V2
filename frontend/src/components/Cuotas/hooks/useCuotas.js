import { useCallback, useEffect, useState } from "react";
import { cuotasApi } from "../api/cuotasApi";

export function useCuotas(filtros = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cargar = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await cuotasApi.listar(filtros);
      setData(response.items || []);
    } catch (err) {
      setError(err.message || "No se pudo cargar el módulo.");
    } finally { setLoading(false); }
  }, [JSON.stringify(filtros)]);
  useEffect(() => { /* Activar cargar() al conectar el backend. */ }, [cargar]);
  return { data, loading, error, cargar };
}
