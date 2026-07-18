import { useCallback, useEffect, useState } from "react";
import { contableApi } from "../api/contableApi";

export function useContable(filtros = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cargar = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await contableApi.listar(filtros);
      setData(response.items || []);
    } catch (err) {
      setError(err.message || "No se pudo cargar el módulo.");
    } finally { setLoading(false); }
  }, [JSON.stringify(filtros)]);
  useEffect(() => { /* Activar cargar() al conectar el backend. */ }, [cargar]);
  return { data, loading, error, cargar };
}
