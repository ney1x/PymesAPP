import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button, PageHeader, Badge, ErrorBox } from '../components/ui';
import { IconMail, IconPhone, IconLock, IconUser } from '../components/Icons';

const ROL_LABELS = { ADMIN: 'Administrador', COMERCIANTE: 'Comerciante' };

// user.nombre guarda nombre + apellido en un solo campo (así lo escribe
// Register al crear la cuenta) — se separan acá solo para editar cómodo y
// se vuelven a unir al guardar.
const splitNombre = (nombreCompleto) => {
  const partes = (nombreCompleto || '').trim().split(/\s+/);
  return { nombre: partes[0] || '', apellido: partes.slice(1).join(' ') };
};

const iniciales = (nombre) =>
  (nombre || 'U')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

export default function Perfil() {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState({
    ...splitNombre(user?.nombre),
    email: user?.email || '',
    telefono: user?.telefono || '',
  });
  const [passwordForm, setPasswordForm] = useState({
    passwordActual: '',
    password: '',
    confirmPassword: '',
  });

  const [savingInfo, setSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState(null);
  const [infoSaved, setInfoSaved] = useState(false);

  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const handleInfoChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setInfoSaved(false);
  };

  const handlePasswordChange = (e) => {
    setPasswordForm({ ...passwordForm, [e.target.name]: e.target.value });
    setPasswordSaved(false);
  };

  const handleInfoSubmit = async (e) => {
    e.preventDefault();
    if (savingInfo) return;
    setInfoError(null);
    setSavingInfo(true);
    try {
      await updateProfile({
        nombre: `${form.nombre} ${form.apellido}`.trim(),
        email: form.email,
        telefono: form.telefono || null,
      });
      setInfoSaved(true);
      setTimeout(() => setInfoSaved(false), 3000);
    } catch (err) {
      setInfoError(err.message);
    } finally {
      setSavingInfo(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (savingPassword) return;
    setPasswordError(null);

    if (passwordForm.password.length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      setPasswordError('Las contraseñas no coinciden');
      return;
    }

    setSavingPassword(true);
    try {
      await updateProfile({
        passwordActual: passwordForm.passwordActual,
        password: passwordForm.password,
      });
      setPasswordForm({ passwordActual: '', password: '', confirmPassword: '' });
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 3000);
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div>
      <PageHeader title="Perfil" subtitle="Administra tu información personal y tu seguridad." />

      <div className="card profile-header">
        <span className="profile-avatar">{iniciales(user?.nombre)}</span>
        <div className="profile-header-info">
          <h2>{user?.nombre || 'Usuario'}</h2>
          <div className="profile-header-meta">
            <span className="muted">{user?.email}</span>
            <Badge tone={user?.rol === 'ADMIN' ? 'primary' : 'default'}>
              {ROL_LABELS[user?.rol] || user?.rol}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Información personal</div>
          <form onSubmit={handleInfoSubmit}>
            <ErrorBox error={infoError} />
            {infoSaved && <div className="alert alert-success">Perfil actualizado con éxito</div>}

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="nombre">Nombre</label>
                <div className="field-icon">
                  <IconUser size={15} />
                  <input id="nombre" name="nombre" required value={form.nombre} onChange={handleInfoChange} placeholder="Tu nombre" />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="apellido">Apellido</label>
                <input id="apellido" name="apellido" value={form.apellido} onChange={handleInfoChange} placeholder="Tu apellido" />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="email">Correo</label>
              <div className="field-icon">
                <IconMail size={15} />
                <input id="email" name="email" type="email" required value={form.email} onChange={handleInfoChange} placeholder="tu@correo.com" />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="telefono">Teléfono</label>
              <div className="field-icon">
                <IconPhone size={15} />
                <input id="telefono" name="telefono" value={form.telefono} onChange={handleInfoChange} placeholder="300 000 0000" />
              </div>
            </div>

            <Button type="submit" loading={savingInfo} aria-busy={savingInfo} aria-label={savingInfo ? 'Guardando...' : 'Guardar cambios'}>
              Guardar cambios
            </Button>
          </form>
        </div>

        <div className="card">
          <div className="card-title">Seguridad</div>
          <p className="form-section-hint">Deja los campos vacíos si no quieres cambiar tu contraseña.</p>
          <form onSubmit={handlePasswordSubmit}>
            <ErrorBox error={passwordError} />
            {passwordSaved && <div className="alert alert-success">Contraseña actualizada con éxito</div>}

            <div className="form-group">
              <label htmlFor="passwordActual">Contraseña actual</label>
              <div className="field-icon">
                <IconLock size={15} />
                <input id="passwordActual" name="passwordActual" type="password" value={passwordForm.passwordActual} onChange={handlePasswordChange} placeholder="Tu contraseña actual" />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Nueva contraseña</label>
              <div className="field-icon">
                <IconLock size={15} />
                <input id="password" name="password" type="password" value={passwordForm.password} onChange={handlePasswordChange} placeholder="Mínimo 6 caracteres" />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirmar nueva contraseña</label>
              <div className="field-icon">
                <IconLock size={15} />
                <input id="confirmPassword" name="confirmPassword" type="password" value={passwordForm.confirmPassword} onChange={handlePasswordChange} placeholder="Repite la nueva contraseña" />
              </div>
            </div>

            <Button
              type="submit"
              variant="outline"
              loading={savingPassword}
              disabled={!passwordForm.password && !passwordForm.confirmPassword && !passwordForm.passwordActual}
              aria-busy={savingPassword}
              aria-label={savingPassword ? 'Actualizando...' : 'Actualizar contraseña'}
            >
              Actualizar contraseña
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
