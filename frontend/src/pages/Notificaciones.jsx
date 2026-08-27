import React, { useState } from 'react';
import { invitacionesApi, mensajesApi, notificacionesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { useNotificaciones } from '../context/NotificacionesContext';
import { Spinner, ErrorBox, PageHeader, Badge, Modal, Button, EmptyState } from '../components/ui';
import { IconCheck, IconX } from '../components/Icons';

const ROL_LABELS = { OWNER: 'Dueño', VENDEDOR: 'Vendedor', INVENTARIO: 'Inventario', ANALISTA: 'Analista' };
// Un miembro puede tener más de un rol (rol + rolesExtra) — junta las
// etiquetas de todos para mostrarlas en una sola frase.
const rolesLabel = (item) =>
  [item.rol, ...(item.rolesExtra || []).map((r) => r.rol)]
    .map((r) => ROL_LABELS[r] || r)
    .join(' + ');
const DECISION_LABELS = { ACEPTADA: 'Aceptó', RECHAZADA: 'Rechazó' };

const iniciales = (nombre) =>
  (nombre || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

const tiempoRelativo = (fecha) => {
  const segundos = Math.floor((Date.now() - new Date(fecha).getTime()) / 1000);
  if (segundos < 60) return 'ahora';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
};

export default function Notificaciones() {
  const [tab, setTab] = useState('invitaciones');
  const [prioridadFiltro, setPrioridadFiltro] = useState('');
  const [pendiente, setPendiente] = useState(null); // { invitacion, tipo: 'aceptar'|'rechazar' }
  const [confirmando, setConfirmando] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const { refrescar } = useNotificaciones();

  const invitaciones = useAsync(() => invitacionesApi.list());
  const decisiones = useAsync(() => notificacionesApi.decisiones());
  const mensajes = useAsync(
    () => mensajesApi.list(prioridadFiltro ? { prioridad: prioridadFiltro } : {}),
    [prioridadFiltro]
  );

  const totalInvitaciones = (invitaciones.data?.invitaciones?.length || 0) + (decisiones.data?.decisiones?.length || 0);
  const totalMensajesNoLeidos = mensajes.data?.mensajes?.filter((m) => !m.leido).length || 0;

  const abrirConfirmacion = (invitacion, tipo) => {
    setConfirmError(null);
    setPendiente({ invitacion, tipo });
  };

  const confirmarDecision = async () => {
    if (!pendiente || confirmando) return;
    setConfirmando(true);
    setConfirmError(null);
    try {
      if (pendiente.tipo === 'aceptar') {
        await invitacionesApi.aceptar(pendiente.invitacion.id);
      } else {
        await invitacionesApi.rechazar(pendiente.invitacion.id);
      }
      setPendiente(null);
      invitaciones.run();
      refrescar();
    } catch (err) {
      setConfirmError(err.message);
    } finally {
      setConfirmando(false);
    }
  };

  const marcarLeido = async (mensaje) => {
    if (mensaje.leido) return;
    try {
      await mensajesApi.marcarLeido(mensaje.id);
      mensajes.run();
      refrescar();
    } catch {
      // silencioso
    }
  };

  const descartarDecision = async (decision) => {
    try {
      await notificacionesApi.descartarDecision(decision.id);
      decisiones.run();
      refrescar();
    } catch {
      // silencioso
    }
  };

  return (
    <div>
      <PageHeader
        title="Notificaciones"
        subtitle="Invitaciones a PYMES y mensajes de tu equipo."
      />

      <div className="notif-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'invitaciones'}
          className={`notif-tab${tab === 'invitaciones' ? ' active' : ''}`}
          onClick={() => setTab('invitaciones')}
        >
          Invitaciones
          {totalInvitaciones > 0 && <span className="notif-tab-count">{totalInvitaciones}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mensajes'}
          className={`notif-tab${tab === 'mensajes' ? ' active' : ''}`}
          onClick={() => setTab('mensajes')}
        >
          Mensajes
          {totalMensajesNoLeidos > 0 && <span className="notif-tab-count">{totalMensajesNoLeidos}</span>}
        </button>
      </div>

      {tab === 'invitaciones' && (
        <div>
          {invitaciones.loading ? (
            <Spinner label="Cargando invitaciones..." />
          ) : invitaciones.error ? (
            <ErrorBox error={invitaciones.error} />
          ) : !invitaciones.data?.invitaciones?.length ? (
            <div className="card">
              <EmptyState title="Sin invitaciones pendientes" message="Aquí aparecerán las invitaciones a PYMES que recibas." />
            </div>
          ) : (
            invitaciones.data.invitaciones.map((inv) => (
              <div key={inv.id} className="invite-card">
                <div className="invite-card-head">
                  <span className="invite-card-pyme">{inv.pyme.nombre}</span>
                  <span className="notif-entry-time">{tiempoRelativo(inv.createdAt)}</span>
                </div>
                <div className="invite-card-body">
                  {inv.invitadoPor?.nombre} te invitó como <strong>{rolesLabel(inv)}</strong>
                  {inv.sede ? ` en la sede ${inv.sede.nombre}` : ''}.
                </div>
                <div className="invite-card-actions">
                  <Button size="sm" onClick={() => abrirConfirmacion(inv, 'aceptar')}>
                    <IconCheck size={13} /> Aceptar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => abrirConfirmacion(inv, 'rechazar')}>
                    <IconX size={13} /> Rechazar
                  </Button>
                </div>
              </div>
            ))
          )}

          {(decisiones.data?.decisiones?.length ?? 0) > 0 && (
            <div className="card" style={{ marginTop: 24 }}>
              <div className="card-title">Respuestas a tus invitaciones</div>
              <div className="notif-timeline">
                {decisiones.data.decisiones.map((dec) => (
                  <div key={dec.id} className="notif-entry">
                    <span className={`notif-timeline-dot notif-timeline-dot-${dec.estado === 'ACEPTADA' ? 'success' : 'danger'}`} aria-hidden="true" />
                    <div className="notif-entry-head">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong>{dec.user.nombre}</strong>
                        <Badge tone={dec.estado === 'ACEPTADA' ? 'success' : 'danger'}>
                          {DECISION_LABELS[dec.estado] || dec.estado}
                        </Badge>
                      </div>
                      <span className="notif-entry-time">{tiempoRelativo(dec.respondidoAt)}</span>
                    </div>
                    <div className="notif-entry-body">
                      {DECISION_LABELS[dec.estado] || dec.estado} tu invitación a <strong>{dec.pyme.nombre}</strong> como {rolesLabel(dec)}.
                    </div>
                    <div className="notif-entry-actions">
                      <Button size="sm" variant="ghost" onClick={() => descartarDecision(dec)}>Descartar</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'mensajes' && (
        <div>
          <div className="priority-filter" style={{ marginBottom: 18 }}>
            {[
              { value: '', label: 'Todas', tone: 'default' },
              { value: 'ALTA', label: 'Alta', tone: 'danger' },
              { value: 'NORMAL', label: 'Normal', tone: 'primary' },
              { value: 'BAJA', label: 'Baja', tone: 'default' },
            ].map((opt) => (
              <button
                key={opt.value || 'todas'}
                type="button"
                className={`priority-chip${prioridadFiltro === opt.value ? ` active${opt.tone ? ` tone-${opt.tone}` : ''}` : ''}`}
                onClick={() => setPrioridadFiltro(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="card">
            {mensajes.loading ? (
              <Spinner label="Cargando mensajes..." />
            ) : mensajes.error ? (
              <ErrorBox error={mensajes.error} />
            ) : !mensajes.data?.mensajes?.length ? (
              <EmptyState title="Sin mensajes" message="Aquí aparecerán los mensajes que te envíe tu equipo." />
            ) : (
              <div className="notif-timeline">
                {mensajes.data.mensajes.map((msg) => (
                  <div key={msg.id} className={`notif-entry${msg.leido ? '' : ' unread'}`}>
                    <span className={`notif-timeline-dot${msg.leido ? '' : ' notif-timeline-dot-unread'}`} aria-hidden="true" />
                    <div className="notif-entry-head">
                      <div className="member-cell">
                        <span className="member-avatar">{iniciales(msg.remitente?.nombre)}</span>
                        <div className="member-name-line">
                          <strong>
                            {!msg.leido && <span className="notif-unread-dot" aria-hidden="true" />}
                            {msg.remitente?.nombre}
                          </strong>
                          <span className="member-email">{msg.pyme?.nombre}</span>
                        </div>
                      </div>
                      <span className="notif-entry-time">{tiempoRelativo(msg.createdAt)}</span>
                    </div>
                    <div className="notif-entry-meta">
                      <Badge tone={msg.rolDestino ? 'default' : 'primary'}>
                        {msg.rolDestino ? `Para ${ROL_LABELS[msg.rolDestino] || msg.rolDestino}` : 'Personal'}
                      </Badge>
                      {msg.prioridad === 'ALTA' && <Badge tone="danger">Alta prioridad</Badge>}
                    </div>
                    <div className="notif-entry-body">{msg.contenido}</div>
                    {!msg.leido && (
                      <div className="notif-entry-actions">
                        <Button size="sm" variant="ghost" onClick={() => marcarLeido(msg)}>Marcar leído</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        open={!!pendiente}
        title={pendiente?.tipo === 'aceptar' ? 'Confirmar invitación' : 'Confirmar rechazo'}
        onClose={() => !confirmando && setPendiente(null)}
      >
        {pendiente && (
          <div>
            <ErrorBox error={confirmError} />
            <p>
              {pendiente.tipo === 'aceptar' ? (
                <>¿Confirmas que quieres unirte a <strong>{pendiente.invitacion.pyme.nombre}</strong> como <strong>{rolesLabel(pendiente.invitacion)}</strong>?</>
              ) : (
                <>¿Confirmas que quieres rechazar la invitación a <strong>{pendiente.invitacion.pyme.nombre}</strong>? Esta acción se puede revertir si te vuelven a invitar.</>
              )}
            </p>
            <div className="form-row">
              <Button type="button" variant="ghost" onClick={() => setPendiente(null)} disabled={confirmando}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant={pendiente.tipo === 'aceptar' ? 'primary' : 'danger'}
                loading={confirmando}
                onClick={confirmarDecision}
              >
                {pendiente.tipo === 'aceptar' ? 'Sí, unirme' : 'Sí, rechazar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
