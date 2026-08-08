import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorBox } from '../components/ui';
import { IconCheck } from '../components/Icons';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const formRef = useRef(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return; // prevent double submit
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (!form.acceptTerms) {
      setError('Debes aceptar los términos y condiciones');
      return;
    }

    setLoading(true);
    try {
      await register({
        nombre: `${form.nombre} ${form.apellido}`.trim(),
        email: form.email,
        password: form.password,
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-side" style={{ flexDirection: 'column', alignItems: 'flex-start', paddingLeft: '80px' }}>
        <div className="success-msgs">
          <div className="success-msg">
            <span className="icon"><IconCheck size={13} /></span>
            <div>
              <strong>Predicción de demanda</strong>
              <span>El modelo analiza tu histórico de ventas para estimar qué vender.</span>
            </div>
          </div>
          <div className="success-msg">
            <span className="icon"><IconCheck size={13} /></span>
            <div>
              <strong>Control de inventario</strong>
              <span>Alertas automáticas de stock mínimo y sobrestock.</span>
            </div>
          </div>
          <div className="success-msg">
            <span className="icon"><IconCheck size={13} /></span>
            <div>
              <strong>Rentabilidad por producto</strong>
              <span>Identifica qué productos conviene mantener o descontinuar.</span>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-form-wrap">
        <form className="auth-card" ref={formRef} onSubmit={handleSubmit}>
          <h2>Crear cuenta</h2>

          <ErrorBox error={error} />

          <div className="form-group">
            <label htmlFor="nombre">Nombre</label>
            <input id="nombre" name="nombre" type="text" required value={form.nombre} onChange={handleChange} placeholder="Tu nombre" />
          </div>

          <div className="form-group">
            <label htmlFor="apellido">Apellido</label>
            <input id="apellido" name="apellido" type="text" required value={form.apellido} onChange={handleChange} placeholder="Tu apellido" />
          </div>

          <div className="form-group">
            <label htmlFor="email">Correo</label>
            <input id="email" name="email" type="email" required value={form.email} onChange={handleChange} placeholder="tu@correo.com" />
          </div>

          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input id="password" name="password" type="password" required minLength={6} value={form.password} onChange={handleChange} placeholder="Mínimo 6 caracteres" />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirmar contraseña</label>
            <input id="confirmPassword" name="confirmPassword" type="password" required value={form.confirmPassword} onChange={handleChange} placeholder="Repite tu contraseña" />
          </div>

          <div className="checkbox-row">
            <input
              type="checkbox"
              name="acceptTerms"
              checked={form.acceptTerms}
              onChange={handleChange}
              required
            />
            <span>
              He leído y acepto los términos y condiciones del
              <a href="#!" style={{ marginLeft: 4 }}>Servicio</a>,
              <a href="#!" style={{ marginLeft: 4 }}>Privacidad</a>,
              <a href="#!" style={{ marginLeft: 4 }}>Condiciones</a>.
            </span>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading} aria-busy={loading} aria-label={loading ? 'Registrando...' : 'Registrarse'} style={{ marginTop: 16 }}>
            {loading ? 'Registrando...' : 'Registrarse'}
          </button>

          <p className="auth-footer">
            ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
