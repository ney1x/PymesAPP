import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui';

export default function Perfil() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    nombre: user?.nombre || '',
    apellido: '',
    email: user?.email || '',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }, 800);
  };

  return (
    <div>
      <h1>Perfil</h1>
      <p className="muted" style={{ marginBottom: 24 }}>Administra tu información personal.</p>

      <div className="card" style={{ maxWidth: 500 }}>
        {saved && <div className="alert alert-success">Perfil actualizado con éxito</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre</label>
            <input name="nombre" value={form.nombre} onChange={handleChange} placeholder="Tu nombre" />
          </div>

          <div className="form-group">
            <label>Apellido</label>
            <input name="apellido" value={form.apellido} onChange={handleChange} placeholder="Tu apellido" />
          </div>

          <div className="form-group">
            <label>Correo</label>
            <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="tu@correo.com" />
          </div>

          <div className="form-group">
            <label>Contraseña</label>
            <input name="password" type="password" value={form.password} onChange={handleChange} placeholder="Dejar vacío para no cambiar" />
          </div>

          <Button type="submit" loading={saving}>Guardar</Button>
        </form>
      </div>
    </div>
  );
}
