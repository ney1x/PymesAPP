import React, { useState, useMemo } from 'react';
import { pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBox, PageHeader, Badge, Modal, Button, EmptyState, date } from '../components/ui';
import { IconPlus, IconEdit, IconTrash } from '../components/Icons';

const ROL_LABELS = {
  OWNER: 'Dueño',
  VENDEDOR: 'Vendedor',
  INVENTARIO: 'Inventario',
  ANALISTA: 'Analista',
};

const ROL_TONE = {
  OWNER: 'primary',
  VENDEDOR: 'success',
  INVENTARIO: 'warning',
  ANALISTA: 'default',
};

const emptyInvite = { email: '', rol: 'VENDEDOR', sedeId: '' };
const emptySede = { nombre: '', direccion: '', ciudad: '' };

export default function Equipo() {
  const [pymeId, setPymeId] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState(emptyInvite);
  const [inviteResult, setInviteResult] = useState(null);
  const [sedeModalOpen, setSedeModalOpen] = useState(false);
  const [editingSede, setEditingSede] = useState(null);
  const [sedeForm, setSedeForm] = useState(emptySede);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const pymes = useAsync(() => pymesApi.list());

  const pymeActual = useMemo(() => {
    const lista = pymes.data?.pymes || [];
    if (!lista.length) return null;
    return lista.find((p) => String(p.id) === pymeId) || lista[0];
  }, [pymes.data, pymeId]);

  const esOwner = pymeActual?.miRol === 'OWNER';

  const sedes = useAsync(
    () => (pymeActual ? pymesApi.sedes.list(pymeActual.id) : Promise.resolve({ sedes: [] })),
    [pymeActual?.id]
  );

  const miembros = useAsync(
    () => (pymeActual && esOwner ? pymesApi.miembros.list(pymeActual.id) : Promise.resolve({ miembros: [] })),
    [pymeActual?.id, esOwner]
  );

  const openInvite = () => {
    setInviteForm(emptyInvite);
    setInviteResult(null);
    setActionError(null);
    setInviteOpen(true);
  };

  const handleInviteChange = (e) => setInviteForm({ ...inviteForm, [e.target.name]: e.target.value });

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await pymesApi.miembros.invite(pymeActual.id, {
        email: inviteForm.email,
        rol: inviteForm.rol,
        ...(inviteForm.sedeId ? { sedeId: Number(inviteForm.sedeId) } : {}),
      });
      setInviteResult(res);
      miembros.run();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRolChange = async (miembro, rol) => {
    try {
      await pymesApi.miembros.update(pymeActual.id, miembro.id, { rol });
      miembros.run();
      showToast('Rol actualizado');
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleSedeAsignada = async (miembro, sedeId) => {
    try {
      await pymesApi.miembros.update(pymeActual.id, miembro.id, { sedeId: sedeId ? Number(sedeId) : null });
      miembros.run();
      showToast('Acceso a sede actualizado');
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleRemoveMiembro = async (miembro) => {
    if (!window.confirm(`¿Quitar a ${miembro.user.nombre} del equipo?`)) return;
    try {
      await pymesApi.miembros.remove(pymeActual.id, miembro.id);
      miembros.run();
      showToast('Miembro eliminado');
    } catch (err) {
      showToast(err.message);
    }
  };

  const openCreateSede = () => {
    setEditingSede(null);
    setSedeForm(emptySede);
    setActionError(null);
    setSedeModalOpen(true);
  };

  const openEditSede = (sede) => {
    setEditingSede(sede);
    setSedeForm({ nombre: sede.nombre, direccion: sede.direccion || '', ciudad: sede.ciudad || '' });
    setActionError(null);
    setSedeModalOpen(true);
  };

  const handleSedeChange = (e) => setSedeForm({ ...sedeForm, [e.target.name]: e.target.value });

  const handleSedeSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setActionError(null);
    try {
      if (editingSede) {
        await pymesApi.sedes.update(pymeActual.id, editingSede.id, sedeForm);
      } else {
        await pymesApi.sedes.create(pymeActual.id, sedeForm);
      }
      setSedeModalOpen(false);
      sedes.run();
      showToast(editingSede ? 'Sede actualizada' : 'Sede creada');
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSede = async (sede) => {
    if (!window.confirm(`¿Eliminar la sede "${sede.nombre}"?`)) return;
    try {
      await pymesApi.sedes.remove(pymeActual.id, sede.id);
      sedes.run();
      showToast('Sede eliminada');
    } catch (err) {
      showToast(err.message);
    }
  };

  if (pymes.loading) return <Spinner label="Cargando..." />;
  if (pymes.error) return <ErrorBox error={pymes.error} />;

  if (!pymes.data?.pymes?.length) {
    return <EmptyState title="Sin PYMES" message="Crea una PYME primero para poder invitar a tu equipo." />;
  }

  return (
    <div>
      <PageHeader
        title="Equipo y sedes"
        subtitle="Invita a tu equipo, asígnale un rol y limita a qué sede tiene acceso."
        actions={
          <select value={pymeActual?.id ?? ''} onChange={(e) => setPymeId(e.target.value)}>
            {pymes.data.pymes.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        }
      />

      {toast && <div className="alert alert-success">{toast}</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Sedes de {pymeActual?.nombre}</span>
          {esOwner && <Button onClick={openCreateSede}><IconPlus size={14} /> Nueva sede</Button>}
        </div>

        {sedes.loading ? <Spinner label="Cargando sedes..." /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Ciudad</th>
                  <th>Dirección</th>
                  {esOwner && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {!sedes.data?.sedes?.length ? (
                  <tr><td colSpan={esOwner ? 4 : 3}><EmptyState title="Sin sedes" message="Aún no hay sedes registradas." /></td></tr>
                ) : (
                  sedes.data.sedes.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.nombre}</strong></td>
                      <td>{s.ciudad || '—'}</td>
                      <td>{s.direccion || '—'}</td>
                      {esOwner && (
                        <td>
                          <Button variant="outline" onClick={() => openEditSede(s)}><IconEdit size={14} /></Button>{' '}
                          <Button variant="danger" onClick={() => handleDeleteSede(s)}><IconTrash size={14} /></Button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Equipo de {pymeActual?.nombre}</span>
          {esOwner && <Button onClick={openInvite}><IconPlus size={14} /> Invitar miembro</Button>}
        </div>

        {!esOwner ? (
          <EmptyState title="Acceso restringido" message="Solo el dueño de la PYME puede gestionar el equipo." />
        ) : miembros.loading ? <Spinner label="Cargando equipo..." /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Sede con acceso</th>
                  <th>Desde</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {!miembros.data?.miembros?.length ? (
                  <tr><td colSpan="6"><EmptyState title="Sin miembros" message="Invita a tu primer colaborador." /></td></tr>
                ) : (
                  miembros.data.miembros.map((m) => (
                    <tr key={m.id}>
                      <td><strong>{m.user.nombre}</strong></td>
                      <td>{m.user.email}</td>
                      <td>
                        {m.rol === 'OWNER' ? (
                          <Badge tone={ROL_TONE[m.rol]}>{ROL_LABELS[m.rol]}</Badge>
                        ) : (
                          <select value={m.rol} onChange={(e) => handleRolChange(m, e.target.value)}>
                            {Object.entries(ROL_LABELS).filter(([k]) => k !== 'OWNER').map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        {m.rol === 'OWNER' ? (
                          <span className="muted">Todas las sedes</span>
                        ) : (
                          <select value={m.sedeId ?? ''} onChange={(e) => handleSedeAsignada(m, e.target.value)}>
                            <option value="">Todas las sedes</option>
                            {sedes.data?.sedes?.map((s) => (
                              <option key={s.id} value={s.id}>{s.nombre}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>{date(m.createdAt)}</td>
                      <td>
                        {m.rol !== 'OWNER' && (
                          <Button variant="danger" onClick={() => handleRemoveMiembro(m)}><IconTrash size={14} /> Quitar</Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={inviteOpen} title="Invitar miembro" onClose={() => setInviteOpen(false)}>
        {inviteResult ? (
          <div>
            <div className="alert alert-success">
              Miembro invitado: <strong>{inviteResult.membresia.user.email}</strong>
            </div>
            {inviteResult.claveTemporal && (
              <p>
                Es un usuario nuevo. Clave temporal: <code>{inviteResult.claveTemporal}</code>
                <br /><span className="muted">Compártela para que inicie sesión y la cambie luego.</span>
              </p>
            )}
            <div className="form-row">
              <Button onClick={() => setInviteOpen(false)}>Cerrar</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInviteSubmit}>
            <ErrorBox error={actionError} />
            <div className="form-group">
              <label>Correo</label>
              <input type="email" name="email" required value={inviteForm.email} onChange={handleInviteChange} placeholder="vendedor@correo.com" />
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label>Rol</label>
                <select name="rol" value={inviteForm.rol} onChange={handleInviteChange}>
                  {Object.entries(ROL_LABELS).filter(([k]) => k !== 'OWNER').map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Sede con acceso</label>
                <select name="sedeId" value={inviteForm.sedeId} onChange={handleInviteChange}>
                  <option value="">Todas las sedes</option>
                  {sedes.data?.sedes?.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)}>Cancelar</Button>
              <Button type="submit" loading={saving}>Invitar</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={sedeModalOpen} title={editingSede ? 'Editar sede' : 'Nueva sede'} onClose={() => setSedeModalOpen(false)}>
        <form onSubmit={handleSedeSubmit}>
          <ErrorBox error={actionError} />
          <div className="form-group">
            <label>Nombre</label>
            <input name="nombre" required value={sedeForm.nombre} onChange={handleSedeChange} placeholder="Sucursal Norte" />
          </div>
          <div className="form-group">
            <label>Ciudad</label>
            <input name="ciudad" value={sedeForm.ciudad} onChange={handleSedeChange} placeholder="Medellín" />
          </div>
          <div className="form-group">
            <label>Dirección</label>
            <input name="direccion" value={sedeForm.direccion} onChange={handleSedeChange} placeholder="Cra 45 # 10-20" />
          </div>
          <div className="form-row">
            <Button type="button" variant="ghost" onClick={() => setSedeModalOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={saving}>{editingSede ? 'Guardar cambios' : 'Crear sede'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
