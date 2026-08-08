import React, { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { IconBox, IconChart, IconUser, IconLogout, IconStore, IconTrendUp, IconGrid, IconAlert } from './Icons';
import { ChatWidget } from './ChatWidget';

const NAV_LEFT = [
  { to: '/pymes', label: 'Mis PYMES', icon: IconStore },
  { to: '/dashboard', label: 'Dashboard', icon: IconGrid },
  { to: '/inventario', label: 'Inventario', icon: IconBox },
  { to: '/ventas', label: 'Ventas', icon: IconTrendUp },
  { to: '/predicciones', label: 'Predicción', icon: IconChart },
];

const NAV_RIGHT = [
  { to: '/alertas', label: 'Alertas', icon: IconAlert },
  { to: '/perfil', label: 'Perfil', icon: IconUser },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
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

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Saltar al contenido principal</a>
      <header className="topbar">
        <div className="topbar-brand" onClick={() => navigate('/dashboard')}>
          <span className="brand-logo"><IconStore size={17} /></span>
          <strong>Inventario</strong>
        </div>

        <nav className="topbar-nav" role="navigation" aria-label="Navegación principal">
          {NAV_LEFT.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `topbar-icon${isActive ? ' active' : ''}`}
              title={item.label}
            >
              <item.icon size={16} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <nav className="topbar-nav topbar-nav-right" role="navigation" aria-label="Navegación secundaria">
          {NAV_RIGHT.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `topbar-icon${isActive ? ' active' : ''}`}
              title={item.label}
            >
              <item.icon size={16} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <button
          className="btn btn-ghost logout-btn"
          onClick={handleLogout}
          title="Cerrar sesión"
        >
          <IconLogout size={16} aria-hidden="true" />
          <span>Salir</span>
        </button>
      </header>

      <main className="main" id="main-content" role="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="footer-left">
          <div className="footer-col">
            <strong>Contactos</strong>
            <span>Whatsapp</span>
            <span>Correo</span>
            <span>Chat</span>
            <span>Ayuda</span>
          </div>
          <div className="footer-col">
            <strong>Acerca de</strong>
            <span onClick={() => navigate('/about')} style={{ cursor: 'pointer' }}>
              Términos de uso
            </span>
          </div>
        </div>
        <div className="footer-brand">
          <IconStore size={16} aria-hidden="true" />
        </div>
      </footer>

      <ChatWidget />
    </div>
  );
}
