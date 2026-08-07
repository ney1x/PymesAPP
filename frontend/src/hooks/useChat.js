import { useState, useCallback, useRef, useEffect } from 'react';
import { chatApi } from '../api';

export function useChat() {
  const [mensajes, setMensajes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const enviar = useCallback(async (texto) => {
    if (!texto.trim()) return;

    const mensajeUsuario = { id: Date.now(), rol: 'user', contenido: texto };
    setMensajes((prev) => [...prev, mensajeUsuario]);
    setCargando(true);
    setError(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const { respuesta } = await chatApi.enviar(texto);
      const mensajeAsistente = {
        id: Date.now() + 1,
        rol: 'assistant',
        contenido: respuesta,
      };
      setMensajes((prev) => [...prev, mensajeAsistente]);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        const mensajeError = {
          id: Date.now() + 1,
          rol: 'assistant',
          contenido: `❌ ${err.message}`,
        };
        setMensajes((prev) => [...prev, mensajeError]);
      }
    } finally {
      setCargando(false);
    }
  }, []);

  const limpiar = useCallback(async () => {
    try {
      await chatApi.limpiarHistorial();
      setMensajes([]);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const cancelar = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setCargando(false);
  }, []);

  return { mensajes, cargando, error, enviar, limpiar, cancelar };
}