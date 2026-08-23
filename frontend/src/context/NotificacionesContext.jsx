import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { notificacionesApi } from '../api';
import { useAuth } from './AuthContext';

// Contador compartido entre la campanita del rail y la pagina /notificaciones
// — sin esto, aceptar/rechazar/leer algo en la pagina no actualiza el badge
// del rail hasta el proximo poll (hasta 30s de desfase).
const NotificacionesContext = createContext(null);

export function NotificacionesProvider({ children }) {
  const { user } = useAuth();
  const [resumen, setResumen] = useState({ total: 0 });

  const refrescar = useCallback(async () => {
    if (!user) return;
    try {
      const res = await notificacionesApi.resumen();
      setResumen(res);
    } catch {
      // silencioso: no debe romper el resto de la app
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setResumen({ total: 0 });
      return;
    }
    refrescar();
    const interval = setInterval(refrescar, 30000);
    return () => clearInterval(interval);
  }, [user, refrescar]);

  return (
    <NotificacionesContext.Provider value={{ resumen, refrescar }}>
      {children}
    </NotificacionesContext.Provider>
  );
}

export function useNotificaciones() {
  const ctx = useContext(NotificacionesContext);
  if (!ctx) throw new Error('useNotificaciones debe usarse dentro de NotificacionesProvider');
  return ctx;
}
