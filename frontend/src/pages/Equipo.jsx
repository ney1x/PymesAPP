import React, { useState, useMemo } from 'react';
import { pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBox, PageHeader, Badge, Modal, Button, IconButton, EmptyState, date } from '../components/ui';
import { IconPlus, IconEdit, IconTrash, IconMail, IconMapPin, IconCheck, IconAlert } from '../components/Icons';

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

const ROLES_ASIGNABLES = ['VENDEDOR', 'INVENTARIO', 'ANALISTA'];

const emptyInvite = { email: '', roles: ['VENDEDOR'], sedeId: '' };
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

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const pymes = useAsync(() => pymesApi.list());

  const pymeActual = useMemo(() => {
    const lista = pymes.data?.pymes || [];
    if (!lista.length) return null;
    return lista.find((p) => String(p.id) === pymeId) || lista[0];
  }, [pymes.data, pymeId]);

  const esOwner = !!pymeActual?.miRoles?.includes('OWNER');

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

  const toggleInviteRol = (rol) => {
    setInviteForm((prev) => ({
      ...prev,
      roles: prev.roles.includes(rol)
        ? prev.roles.filter((r) => r !== rol)
        : [...prev.roles, rol],
    }));
  };

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    if (saving || inviteForm.roles.length === 0) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await pymesApi.miembros.invite(pymeActual.id, {
        email: inviteForm.email,
        roles: inviteForm.roles,
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

  const handleRolesChange = async (miembro, roles) => {
    if (roles.length === 0) return;
    try {
      const res = await pymesApi.miembros.update(pymeActual.id, miembro.id, { roles });
      // Actualiza solo este miembro en el propio estado en vez de volver a
      // pedir la lista completa: miembros.run() prende el spinner de carga,
      // que reemplaza toda la tabla/tarjetas por un instante y devuelve el
      // scroll arriba — justo lo que rompía tocar un rol a mitad de la lista.
      miembros.setData((prev) => prev && {
        ...prev,
        miembros: prev.miembros.map((m) => (m.id === miembro.id ? { ...m, ...res.membresia } : m)),
      });
      showToast('Rol actualizado');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const toggleMiembroRol = (miembro, rol) => {
    const actuales = [miembro.rol, ...miembro.rolesExtra.map((r) => r.rol)];
    const nuevos = actuales.includes(rol) ? actuales.filter((r) => r !== rol) : [...actuales, rol];
    handleRolesChange(miembro, nuevos);
  };

  const handleSedeAsignada = async (miembro, sedeId) => {
    try {
      const res = await pymesApi.miembros.update(pymeActual.id, miembro.id, { sedeId: sedeId ? Number(sedeId) : null });
      miembros.setData((prev) => prev && {
        ...prev,
        miembros: prev.miembros.map((m) => (m.id === miembro.id ? { ...m, ...res.membresia } : m)),
      });
      showToast('Acceso a sede actualizado');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRemoveMiembro = async (miembro) => {
    if (!window.confirm(`¿Quitar a ${miembro.user.nombre} del equipo?`)) return;
    try {
      await pymesApi.miembros.remove(pymeActual.id, miembro.id);
      miembros.setData((prev) => prev && {
        ...prev,
        miembros: prev.miembros.filter((m) => m.id !== miembro.id),
      });
      showToast('Miembro eliminado');
    } catch (err) {
      showToast(err.message, 'error');
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
      showToast(err.message, 'error');
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

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'error' ? <IconAlert size={16} /> : <IconCheck size={16} />}
          </span>
          <span>{toast.msg}</span>
        </div>
      )}

      {sedes.loading ? <Spinner label="Cargando sedes..." /> : !sedes.data?.sedes?.length && !esOwner ? (
        <p className="muted" style={{ marginBottom: 28 }}>Esta PYME aún no tiene sedes registradas.</p>
      ) : (
        <div className="sede-pill-row">
          {sedes.data?.sedes?.map((s, i) => (
            <div key={s.id} className="sede-pill animate-fade-in" style={{ animationDelay: `${i * 40}ms` }}>
              <IconMapPin size={14} aria-hidden="true" />
              <span className="sede-pill-name">{s.nombre}</span>
              {s.ciudad && <span className="sede-pill-meta">{s.ciudad}</span>}
              {esOwner && (
                <div className="sede-pill-actions">
                  <IconButton variant="ghost" label={`Editar sede ${s.nombre}`} tooltip="Editar" onClick={() => openEditSede(s)}>
                    <IconEdit size={13} aria-hidden="true" />
                  </IconButton>
                  <IconButton variant="danger-subtle" label={`Eliminar sede ${s.nombre}`} tooltip="Eliminar" onClick={() => handleDeleteSede(s)}>
                    <IconTrash size={13} aria-hidden="true" />
                  </IconButton>
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

      <div className="card animate-fade-in-up">
        <div className="card-title equipo-card-header">
          <div className="equipo-titulo-row">
            <span>Equipo de {pymeActual?.nombre}</span>
            {esOwner && !miembros.loading && miembrosOrdenados.length > 0 && (
              <span className="equipo-conteo">
                <Badge tone="success">{conteoActivos} activo{conteoActivos === 1 ? '' : 's'}</Badge>
                {conteoPendientes > 0 && (
                  <Badge tone="warning">{conteoPendientes} pendiente{conteoPendientes === 1 ? '' : 's'}</Badge>
                )}
              </span>
            )}
          </div>
          {esOwner && (
            <div className="equipo-header-actions">
              <Button variant="outline" onClick={abrirMensajeParaRol}><IconMail size={14} /> Mensaje por rol</Button>
              <Button onClick={openInvite}><IconPlus size={14} /> Invitar miembro</Button>
            </div>
          )}
        </div>

        {!esOwner ? (
          <EmptyState title="Acceso restringido" message="Solo el dueño de la PYME puede gestionar el equipo." />
        ) : miembros.loading ? <Spinner label="Cargando equipo..." /> : !miembrosOrdenados.length ? (
          <EmptyState title="Sin miembros" message="Invita a tu primer colaborador." />
        ) : (
          <>
            {/* Desktop/tablet: tabla densa, uso con mouse. A 800px de ancho
                mínimo (6 columnas) no cabe en un viewport móvil sin scroll
                horizontal permanente — por eso existe la vista de tarjetas
                de abajo, no es la misma tabla encogida. */}
            <div className="table-wrap equipo-table-view">
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
                  {miembrosOrdenados.map((m, i) => (
                    <tr
                      key={m.id}
                      className={`animate-fade-in${m.estado === 'RECHAZADA' ? ' member-row-rechazada' : ''}${m.estado === 'PENDIENTE' ? ' member-row-pendiente' : ''}`}
                      style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                    >
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
                          <div className="member-roles-checkboxes">
                            {ROLES_ASIGNABLES.map((rol) => {
                              const roles = [m.rol, ...m.rolesExtra.map((r) => r.rol)];
                              const marcado = roles.includes(rol);
                              return (
                                <label key={rol} className="member-rol-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={marcado}
                                    disabled={marcado && roles.length === 1}
                                    onChange={() => toggleMiembroRol(m, rol)}
                                  />
                                  {ROL_LABELS[rol]}
                                </label>
                              );
                            })}
                          </div>
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
                        <div className="row-actions">
                          {m.rol !== 'OWNER' && m.estado === 'ACEPTADA' && (
                            <IconButton variant="outline" label={`Enviar mensaje a ${m.user.nombre}`} tooltip="Mensaje" onClick={() => abrirMensajeParaMiembro(m)}>
                              <IconMail size={14} aria-hidden="true" />
                            </IconButton>
                          )}
                          {m.rol !== 'OWNER' && (
                            <IconButton variant="danger-subtle" label={`Quitar a ${m.user.nombre} del equipo`} tooltip="Quitar" onClick={() => handleRemoveMiembro(m)}>
                              <IconTrash size={14} aria-hidden="true" />
                            </IconButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: una tarjeta por persona. Mismos datos y handlers que
                la tabla — solo cambia cómo se acomodan en un viewport
                angosto. Botones con texto visible en vez de solo-ícono: en
                touch no hay hover que muestre el tooltip. */}
            <div className="equipo-card-view">
              {miembrosOrdenados.map((m, i) => (
                <div
                  key={m.id}
                  className={`equipo-member-card animate-fade-in${m.estado === 'RECHAZADA' ? ' member-row-rechazada' : ''}${m.estado === 'PENDIENTE' ? ' member-row-pendiente' : ''}`}
                  style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                >
                  <div className="equipo-member-card-head">
                    <div className="member-cell">
                      <span className="member-avatar">{iniciales(m.user.nombre)}</span>
                      <div className="member-name-line">
                        <strong>{m.user.nombre}</strong>
                        <span className="member-email">{m.user.email}</span>
                      </div>
                    </div>
                    <Badge tone={ESTADO_TONE[m.estado]}>{ESTADO_LABELS[m.estado] || m.estado}</Badge>
                  </div>

                  <div className="equipo-member-card-section">
                    <span className="equipo-member-card-label">Rol</span>
                    {m.rol === 'OWNER' ? (
                      <div><Badge tone={ROL_TONE[m.rol]}>{ROL_LABELS[m.rol]}</Badge></div>
                    ) : (
                      <div className="member-roles-checkboxes">
                        {ROLES_ASIGNABLES.map((rol) => {
                          const roles = [m.rol, ...m.rolesExtra.map((r) => r.rol)];
                          const marcado = roles.includes(rol);
                          return (
                            <label key={rol} className="member-rol-checkbox">
                              <input
                                type="checkbox"
                                checked={marcado}
                                disabled={marcado && roles.length === 1}
                                onChange={() => toggleMiembroRol(m, rol)}
                              />
                              {ROL_LABELS[rol]}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="equipo-member-card-section">
                    <span className="equipo-member-card-label">Sede con acceso</span>
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
                  </div>

                  <div className="equipo-member-card-footer">
                    <span className="muted">Desde {date(m.createdAt)}</span>
                    {m.rol !== 'OWNER' && (
                      <div className="equipo-member-card-actions">
                        {m.estado === 'ACEPTADA' && (
                          <Button size="sm" variant="outline" onClick={() => abrirMensajeParaMiembro(m)}>
                            <IconMail size={14} aria-hidden="true" /> Mensaje
                          </Button>
                        )}
                        <Button size="sm" variant="danger-subtle" onClick={() => handleRemoveMiembro(m)}>
                          <IconTrash size={14} aria-hidden="true" /> Quitar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
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
                <label>Rol (puedes elegir más de uno)</label>
                <div className="member-roles-checkboxes">
                  {ROLES_ASIGNABLES.map((rol) => (
                    <label key={rol} className="member-rol-checkbox">
                      <input
                        type="checkbox"
                        checked={inviteForm.roles.includes(rol)}
                        onChange={() => toggleInviteRol(rol)}
                      />
                      {ROL_LABELS[rol]}
                    </label>
                  ))}
                </div>
                {inviteForm.roles.length === 0 && <span className="hint">Selecciona al menos un rol.</span>}
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
              <Button type="submit" loading={saving} disabled={inviteForm.roles.length === 0}>Invitar</Button>
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
