import React, { useState, useMemo } from 'react';
import { pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBox, PageHeader, Badge, Modal, Button, EmptyState, date } from '../components/ui';
import { IconPlus, IconEdit, IconTrash, IconMail, IconMapPin } from '../components/Icons';

const ESTADO_ORDEN = { PENDIENTE: 0, ACEPTADA: 1, RECHAZADA: 2 };

const iniciales = (nombre) =>
  (nombre || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

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

const ESTADO_LABELS = { PENDIENTE: 'Pendiente', ACEPTADA: 'Activo', RECHAZADA: 'Rechazó' };
const ESTADO_TONE = { PENDIENTE: 'warning', ACEPTADA: 'success', RECHAZADA: 'danger' };

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

  const [mensajeOpen, setMensajeOpen] = useState(false);
  const [mensajeDestino, setMensajeDestino] = useState(null); // { tipo: 'miembro', miembro } | { tipo: 'rol', rol }
  const [mensajeTexto, setMensajeTexto] = useState('');
  const [mensajePrioridad, setMensajePrioridad] = useState('NORMAL');
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);
  const [mensajeError, setMensajeError] = useState(null);
  const [mensajeEnviado, setMensajeEnviado] = useState(false);

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

  // Pendientes primero (necesitan seguimiento del owner), rechazados al final
  // (informativos, ya no requieren acción) — el resto por antigüedad.
  const miembrosOrdenados = useMemo(() => {
    const lista = miembros.data?.miembros || [];
    return [...lista].sort((a, b) => ESTADO_ORDEN[a.estado] - ESTADO_ORDEN[b.estado]);
  }, [miembros.data]);

  const conteoActivos = miembrosOrdenados.filter((m) => m.estado === 'ACEPTADA').length;
  const conteoPendientes = miembrosOrdenados.filter((m) => m.estado === 'PENDIENTE').length;

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

  const abrirMensajeParaMiembro = (miembro) => {
    setMensajeDestino({ tipo: 'miembro', miembro });
    setMensajeTexto('');
    setMensajePrioridad('NORMAL');
    setMensajeError(null);
    setMensajeEnviado(false);
    setMensajeOpen(true);
  };

  const abrirMensajeParaRol = () => {
    setMensajeDestino({ tipo: 'rol', rol: 'VENDEDOR' });
    setMensajeTexto('');
    setMensajePrioridad('NORMAL');
    setMensajeError(null);
    setMensajeEnviado(false);
    setMensajeOpen(true);
  };

  const handleEnviarMensaje = async (e) => {
    e.preventDefault();
    if (enviandoMensaje || !mensajeTexto.trim()) return;
    setEnviandoMensaje(true);
    setMensajeError(null);
    try {
      const payload = mensajeDestino.tipo === 'miembro'
        ? { destinatarioId: mensajeDestino.miembro.userId, contenido: mensajeTexto.trim(), prioridad: mensajePrioridad }
        : { rol: mensajeDestino.rol, contenido: mensajeTexto.trim(), prioridad: mensajePrioridad };
      await pymesApi.mensajes.enviar(pymeActual.id, payload);
      setMensajeEnviado(true);
    } catch (err) {
      setMensajeError(err.message);
    } finally {
      setEnviandoMensaje(false);
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

      {sedes.loading ? <Spinner label="Cargando sedes..." /> : !sedes.data?.sedes?.length && !esOwner ? (
        <p className="muted" style={{ marginBottom: 28 }}>Esta PYME aún no tiene sedes registradas.</p>
      ) : (
        <div className="sede-pill-row">
          {sedes.data?.sedes?.map((s) => (
            <div key={s.id} className="sede-pill">
              <IconMapPin size={14} aria-hidden="true" />
              <span className="sede-pill-name">{s.nombre}</span>
              {s.ciudad && <span className="sede-pill-meta">{s.ciudad}</span>}
              {esOwner && (
                <div className="sede-pill-actions">
                  <button type="button" onClick={() => openEditSede(s)} aria-label={`Editar sede ${s.nombre}`}>
                    <IconEdit size={13} />
                  </button>
                  <button type="button" className="danger" onClick={() => handleDeleteSede(s)} aria-label={`Eliminar sede ${s.nombre}`}>
                    <IconTrash size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {esOwner && (
            <button type="button" className="sede-pill-add" onClick={openCreateSede}>
              <IconPlus size={14} /> Nueva sede
            </button>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span>Equipo de {pymeActual?.nombre}</span>
            {esOwner && !miembros.loading && miembrosOrdenados.length > 0 && (
              <span className="muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12.5 }}>
                {conteoActivos} activo{conteoActivos === 1 ? '' : 's'}
                {conteoPendientes > 0 ? ` · ${conteoPendientes} pendiente${conteoPendientes === 1 ? '' : 's'}` : ''}
              </span>
            )}
          </div>
          {esOwner && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="outline" onClick={abrirMensajeParaRol}><IconMail size={14} /> Mensaje por rol</Button>
              <Button onClick={openInvite}><IconPlus size={14} /> Invitar miembro</Button>
            </div>
          )}
        </div>

        {!esOwner ? (
          <EmptyState title="Acceso restringido" message="Solo el dueño de la PYME puede gestionar el equipo." />
        ) : miembros.loading ? <Spinner label="Cargando equipo..." /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Miembro</th>
                  <th>Estado</th>
                  <th>Rol</th>
                  <th>Sede con acceso</th>
                  <th>Desde</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {!miembrosOrdenados.length ? (
                  <tr><td colSpan="6"><EmptyState title="Sin miembros" message="Invita a tu primer colaborador." /></td></tr>
                ) : (
                  miembrosOrdenados.map((m) => (
                    <tr key={m.id} className={m.estado === 'RECHAZADA' ? 'member-row-rechazada' : undefined}>
                      <td>
                        <div className="member-cell">
                          <span className="member-avatar">{iniciales(m.user.nombre)}</span>
                          <div className="member-name-line">
                            <strong>{m.user.nombre}</strong>
                            <span className="member-email">{m.user.email}</span>
                          </div>
                        </div>
                      </td>
                      <td><Badge tone={ESTADO_TONE[m.estado]}>{ESTADO_LABELS[m.estado] || m.estado}</Badge></td>
                      <td>
                        {m.rol === 'OWNER' ? (
                          <Badge tone={ROL_TONE[m.rol]}>{ROL_LABELS[m.rol]}</Badge>
                        ) : (
                          <select className="table-inline-select" value={m.rol} onChange={(e) => handleRolChange(m, e.target.value)}>
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
                          <select className="table-inline-select" value={m.sedeId ?? ''} onChange={(e) => handleSedeAsignada(m, e.target.value)}>
                            <option value="">Todas las sedes</option>
                            {sedes.data?.sedes?.map((s) => (
                              <option key={s.id} value={s.id}>{s.nombre}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>{date(m.createdAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {m.rol !== 'OWNER' && m.estado === 'ACEPTADA' && (
                            <Button variant="outline" onClick={() => abrirMensajeParaMiembro(m)} aria-label={`Enviar mensaje a ${m.user.nombre}`}>
                              <IconMail size={14} />
                            </Button>
                          )}
                          {m.rol !== 'OWNER' && (
                            <Button variant="danger" onClick={() => handleRemoveMiembro(m)}><IconTrash size={14} /> Quitar</Button>
                          )}
                        </div>
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
              Invitación enviada a <strong>{inviteResult.membresia.user.email}</strong>. Queda pendiente hasta que la acepte.
            </div>
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
              <span className="hint">La persona debe tener una cuenta ya creada en la plataforma.</span>
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

      <Modal
        open={mensajeOpen}
        title={mensajeDestino?.tipo === 'miembro' ? `Mensaje para ${mensajeDestino.miembro.user.nombre}` : 'Mensaje por rol'}
        onClose={() => setMensajeOpen(false)}
      >
        {mensajeEnviado ? (
          <div>
            <div className="alert alert-success">Mensaje enviado con éxito</div>
            <div className="form-row">
              <Button onClick={() => setMensajeOpen(false)}>Cerrar</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleEnviarMensaje}>
            <ErrorBox error={mensajeError} />
            {mensajeDestino?.tipo === 'rol' && (
              <div className="form-group">
                <label>Enviar a todos los</label>
                <select
                  value={mensajeDestino.rol}
                  onChange={(e) => setMensajeDestino({ ...mensajeDestino, rol: e.target.value })}
                >
                  {Object.entries(ROL_LABELS).filter(([k]) => k !== 'OWNER').map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Prioridad</label>
              <select value={mensajePrioridad} onChange={(e) => setMensajePrioridad(e.target.value)}>
                <option value="ALTA">Alta</option>
                <option value="NORMAL">Normal</option>
                <option value="BAJA">Baja</option>
              </select>
            </div>
            <div className="form-group">
              <label>Mensaje</label>
              <textarea
                rows={4}
                required
                value={mensajeTexto}
                onChange={(e) => setMensajeTexto(e.target.value)}
                placeholder="Escribe tu mensaje..."
              />
            </div>
            <div className="form-row">
              <Button type="button" variant="ghost" onClick={() => setMensajeOpen(false)}>Cancelar</Button>
              <Button type="submit" loading={enviandoMensaje}>Enviar</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
