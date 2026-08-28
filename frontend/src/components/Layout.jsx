import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { IconBox, IconChart, IconUser, IconLogout, IconStore, IconTrendUp, IconGrid, IconAlert, IconInfo, IconUsers } from './Icons';
import { ChatWidget } from './ChatWidget';
import NotificationBell from './NotificationBell';
import { pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { puede, puedeEnAlguna } from '../constants/permisos';
import { usePymeFilter } from '../context/PymeFilterContext';

const NAV_LEFT = [
  { to: '/pymes', label: 'Mis PYMES', icon: IconStore },
  { to: '/dashboard', label: 'Dashboard', icon: IconGrid, requiere: 'verDashboard' },
  { to: '/inventario', label: 'Inventario', icon: IconBox, requiere: 'verInventario' },
  { to: '/ventas', label: 'Ventas', icon: IconTrendUp, requiere: 'verVentas' },
  { to: '/predicciones', label: 'Predicción', icon: IconChart, requiere: 'verPredicciones' },
  { to: '/equipo', label: 'Equipo', icon: IconUsers, requiere: 'gestionarMiembros' },
];

const NAV_RIGHT = [
  { to: '/alertas', label: 'Alertas', icon: IconAlert },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const pymes = useAsync(() => pymesApi.list());
  const { pymeSeleccionada, setPymeSeleccionada } = usePymeFilter();

  // Selector de PYME vive acá (rail, siempre visible) y no dentro de cada
  // página — así nunca desaparece si la página de adentro tira error (p.ej.
  // un 403 de una PYME donde no tenés esta pantalla): siempre podés volver a
  // elegir otra sin quedar atrapado. Con una PYME puntual elegida, cada link
  // se habilita según el rol en ESA PYME, no un OR entre todas — evita que
  // alguien vea una pantalla habilitada por una PYME distinta a la que tiene
  // filtrada (el hueco real detrás del bug de sorrypepa).
  useEffect(() => {
    if (!pymeSeleccionada && pymes.data?.pymes?.length === 1) {
      setPymeSeleccionada(String(pymes.data.pymes[0].id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pymes.data]);

  const pymeActual = pymes.data?.pymes?.find((p) => String(p.id) === String(pymeSeleccionada));

  const navItems = NAV_LEFT.filter((item) => {
    if (!item.requiere) return true;
    if (pymeSeleccionada) return puede(pymeActual?.miRoles, item.requiere);
    return puedeEnAlguna(pymes.data?.pymes, item.requiere);
  });

  const handleLogout = () => {
    setProfileOpen(false);
    logout();
    navigate('/login');
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setProfileOpen(false);
      }
      // Cmd/Ctrl + K for search/command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"][placeholder*="Buscar" i], input[placeholder*="buscar" i]');
        searchInput?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handlePointerDown = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const iniciales = (user?.nombre || 'Comerciante')
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Saltar al contenido principal</a>
      <nav className="rail" aria-label="Navegación principal">
        <button type="button" className="rail-brand" onClick={() => navigate('/dashboard')}>
          <span className="brand-logo">IN</span>
          <strong>Inventario</strong>
        </button>

        {(pymes.data?.pymes?.length ?? 0) > 0 && (
          <div className="rail-pyme-switch">
            <label htmlFor="railPymeSelect">PYME</label>
            <select
              id="railPymeSelect"
              value={pymeSeleccionada}
              onChange={(e) => setPymeSeleccionada(e.target.value)}
            >
              <option value="">Todas mis PYMES</option>
              {pymes.data.pymes.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
        )}

        <div className="rail-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `rail-item${isActive ? ' active' : ''}`}
              title={item.label}
            >
              <item.icon size={16} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="rail-nav rail-nav-secondary">
          {NAV_RIGHT.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `rail-item${isActive ? ' active' : ''}`}
              title={item.label}
            >
              <item.icon size={16} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          ))}
          <NotificationBell />
        </div>

        <div className="rail-profile" ref={profileMenuRef}>
          <button
            className="rail-profile-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((open) => !open)}
          >
            <span className="rail-avatar">{iniciales}</span>
            <span className="rail-profile-name">{user?.nombre || 'Comerciante'}</span>
            <IconUser size={14} aria-hidden="true" />
          </button>
          {profileOpen && (
            <div className="rail-dropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                className="rail-dropdown-item"
                onClick={() => {
                  setProfileOpen(false);
                  navigate('/perfil');
                }}
              >
                <IconUser size={16} aria-hidden="true" />
                <span>Perfil</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="rail-dropdown-item"
                onClick={() => {
                  setProfileOpen(false);
                  navigate('/about');
                }}
              >
                <IconInfo size={16} aria-hidden="true" />
                <span>Términos de uso</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="rail-dropdown-item"
                onClick={handleLogout}
              >
                <IconLogout size={16} aria-hidden="true" />
                <span>Salir</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      <div className="content-col">
        <main className="main" id="main-content" role="main">
          <Outlet context={{ pymes }} />
        </main>
      </div>

      <ChatWidget />
    </div>
  );
}
