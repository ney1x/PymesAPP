import React from 'react';
import { NavLink } from 'react-router-dom';
import { useNotificaciones } from '../context/NotificacionesContext';
import { IconBell } from './Icons';

// Enlace de navegación normal (no dropdown): abre /notificaciones. El
// contador viene de NotificacionesContext (compartido con la página) para
// que se actualice al instante cuando ahí se acepta/rechaza/lee algo, sin
// esperar al próximo poll de 30s.
export default function NotificationBell() {
  const { resumen } = useNotificaciones();

  return (
    <NavLink
      to="/notificaciones"
      className={({ isActive }) => `rail-item notif-trigger${isActive ? ' active' : ''}`}
      title="Notificaciones"
    >
      <IconBell size={16} aria-hidden="true" />
      <span>Notificaciones</span>
      {resumen.total > 0 && <span className="notif-badge">{resumen.total > 9 ? '9+' : resumen.total}</span>}
    </NavLink>
  );
}
