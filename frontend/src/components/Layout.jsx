import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { IconBox, IconChart, IconUser, IconLogout, IconStore, IconTrendUp, IconGrid, IconAlert } from './Icons';
import { ChatWidget } from './ChatWidget';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: IconGrid },
  { to: '/pymes', label: 'Mis PYMES', icon: IconStore },
  { to: '/inventario', label: 'Inventario', icon: IconBox },
  { to: '/ventas', label: 'Ventas', icon: IconTrendUp },
  { to: '/predicciones', label: 'Predicción', icon: IconChart },
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand" onClick={() => navigate('/dashboard')}>
          <span className="brand-logo"><IconStore size={17} /></span>
          <strong>Inventario</strong>
        </div>

        <nav className="topbar-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `topbar-icon${isActive ? ' active' : ''}`}
              title={item.label}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <button
          className="btn btn-ghost logout-btn"
          onClick={handleLogout}
          title="Cerrar sesión"
        >
          <IconLogout size={16} />
          <span>Salir</span>
        </button>
      </header>

      <main className="main">
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
          <IconStore size={16} />
        </div>
      </footer>

      <ChatWidget />
    </div>
  );
}
