import { useState, useCallback, useRef, useEffect } from 'react';
import { chatApi } from '../api';

const MIN_RESPONSE_FEEDBACK_MS = 400;

function esperarRitmoRespuesta(delay, signal) {
  if (delay <= 0 || signal.aborted) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const limpiar = () => signal.removeEventListener('abort', cancelarEspera);
    const timer = setTimeout(() => {
      limpiar();
      resolve();
    }, delay);
    const cancelarEspera = () => {
      clearTimeout(timer);
      limpiar();
      const error = new Error('Request aborted');
      error.name = 'AbortError';
      reject(error);
    };
    signal.addEventListener('abort', cancelarEspera, { once: true });
  });
}

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
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

    try {
      const { respuesta } = await chatApi.enviar(texto, {
        signal: controller.signal,
      });
      const reducedMotion = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const remainingDelay = reducedMotion
        ? 0
        : MIN_RESPONSE_FEEDBACK_MS - (now - requestStartedAt);

      await esperarRitmoRespuesta(remainingDelay, controller.signal);
      if (controller.signal.aborted) return;

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
