import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorBox } from '../components/ui';
import { IconStore } from '../components/Icons';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(form);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-side">
        <span className="brand-logo"><IconStore size={26} /></span>
        <strong>Inventario</strong>
        <p>Predicción de demanda e inteligencia de inventario para PYMES.</p>
      </div>

      <div className="auth-form-wrap">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h2>Iniciar sesión</h2>

          <ErrorBox error={error} />

          <div className="form-group">
            <label htmlFor="email">Usuario</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={form.email}
              onChange={handleChange}
              placeholder="tu@correo.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>

          <p className="auth-footer">
            ¿No tienes cuenta? <Link to="/register">Crea una</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
