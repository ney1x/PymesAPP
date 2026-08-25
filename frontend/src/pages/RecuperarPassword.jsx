import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import { ErrorBox } from '../components/ui';
import { IconCheck, IconChevronLeft } from '../components/Icons';

// Flujo de 3 pasos: pedir el codigo por correo, escribirlo junto a la
// contraseña nueva, y confirmar. Un solo componente controla el paso
// actual en vez de 3 rutas — evita perder el email escrito al ir y venir.
export default function RecuperarPassword() {
  const navigate = useNavigate();
  const [paso, setPaso] = useState('email'); // 'email' | 'codigo' | 'listo'
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSolicitarCodigo = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await authApi.forgotPassword({ email });
      setPaso('codigo');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Vuelve a corregir el correo sin perder lo ya escrito en este paso, para
  // el caso mas comun de quedar atascado: te equivocaste de correo y el
  // codigo nunca va a llegar. No invalida el codigo ya enviado — con
  // pedir uno nuevo alcanza.
  const handleVolver = () => {
    setPaso('email');
    setCodigo('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
  };

  const handleRestablecer = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword({ email, codigo, password });
      setPaso('listo');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-side">
        <span className="brand-logo">IN</span>
        <strong>Inventario</strong>
        <p>Predicción de demanda e inteligencia de inventario para PYMES.</p>
      </div>

      <div className="auth-form-wrap">
        {paso === 'email' && (
          <form className="auth-card" onSubmit={handleSolicitarCodigo}>
            <h2>Recuperar contraseña</h2>
            <p className="subtitle">Te mandamos un código de 6 dígitos a tu correo.</p>

            <ErrorBox error={error} />

            <div className="form-group">
              <label htmlFor="email">Correo</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading} aria-busy={loading} aria-label={loading ? 'Enviando código...' : 'Enviar código'}>
              {loading ? 'Enviando...' : 'Enviar código'}
            </button>

            <p className="auth-footer">
              <Link to="/login">Volver a iniciar sesión</Link>
            </p>
          </form>
        )}

        {paso === 'codigo' && (
          <form className="auth-card" onSubmit={handleRestablecer}>
            <button type="button" className="auth-back" onClick={handleVolver} disabled={loading}>
              <IconChevronLeft size={14} aria-hidden="true" /> Corregir correo
            </button>
            <h2>Escribe el código</h2>
            <p className="subtitle">Enviado a <strong>{email}</strong>. Expira en 15 minutos.</p>

            <ErrorBox error={error} />

            <div className="form-group">
              <label htmlFor="codigo">Código de 6 dígitos</label>
              <input
                id="codigo"
                name="codigo"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                style={{ letterSpacing: '4px', fontFamily: 'var(--font-mono)' }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Contraseña nueva</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirmar contraseña</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading} aria-busy={loading} aria-label={loading ? 'Guardando...' : 'Restablecer contraseña'}>
              {loading ? 'Guardando...' : 'Restablecer contraseña'}
            </button>

            <p className="auth-footer">
              ¿No te llegó? <button type="button" className="btn btn-ghost btn-sm" onClick={handleSolicitarCodigo} disabled={loading}>Reenviar código</button>
            </p>
          </form>
        )}

        {paso === 'listo' && (
          <div className="auth-card">
            <h2>Contraseña actualizada</h2>
            <div className="alert alert-success">
              <IconCheck size={15} aria-hidden="true" /> Ya podés iniciar sesión con tu contraseña nueva.
            </div>
            <button type="button" className="btn btn-primary btn-block" onClick={() => navigate('/login')}>
              Ir a iniciar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
