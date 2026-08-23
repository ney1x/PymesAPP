import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { IconBox, IconChart, IconUser, IconLogout, IconStore, IconTrendUp, IconGrid, IconAlert, IconInfo, IconUsers } from './Icons';
import { ChatWidget } from './ChatWidget';

const NAV_LEFT = [
  { to: '/pymes', label: 'Mis PYMES', icon: IconStore },
  { to: '/dashboard', label: 'Dashboard', icon: IconGrid },
  { to: '/inventario', label: 'Inventario', icon: IconBox },
  { to: '/ventas', label: 'Ventas', icon: IconTrendUp },
  { to: '/predicciones', label: 'Predicción', icon: IconChart },
  { to: '/equipo', label: 'Equipo', icon: IconUsers },
];

const NAV_RIGHT = [
  { to: '/alertas', label: 'Alertas', icon: IconAlert },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef(null);

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

        <div className="rail-nav">
          {NAV_LEFT.map((item) => (
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
          <Outlet />
        </main>
      </div>

      <ChatWidget />
    </div>
  );
}
