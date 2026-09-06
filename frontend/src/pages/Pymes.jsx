import React, { useState, useRef } from 'react';
import { pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBox, PageHeader, Badge, Modal, Button, IconButton, EmptyState, date } from '../components/ui';
import { IconPlus, IconEdit, IconTrash, IconMapPin, IconPhone, IconLogout } from '../components/Icons';
import { puede } from '../constants/permisos';

const ROL_LABELS = { OWNER: 'Dueño', VENDEDOR: 'Vendedor', INVENTARIO: 'Inventario', ANALISTA: 'Analista' };
const ROL_TONE = { OWNER: 'primary', VENDEDOR: 'success', INVENTARIO: 'warning', ANALISTA: 'default' };

const iniciales = (nombre) =>
  (nombre || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

const TIPO_LABELS = {
  MINIMARKET: 'Minimarket',
  TIENDA: 'Tienda',
  FERRETERIA: 'Ferretería',
  FARMACIA: 'Farmacia',
  PAPELERIA: 'Papelería',
  RESTAURANTE: 'Restaurante',
  CAFETERIA: 'Cafetería',
  PANADERIA: 'Panadería',
  LICORERA: 'Licorera',
  VETERINARIA: 'Veterinaria',
  OTRO: 'Otro',
};

const emptyForm = {
  nombre: '',
  tipo: 'TIENDA',
  sector: '',
  ciudad: '',
  direccion: '',
  telefono: '',
  descripcion: '',
};

export default function Pymes() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [toast, setToast] = useState(null);
  const formRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const { data, loading, error, run } = useAsync(() => pymesApi.list());

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setActionError(null);
    setModalOpen(true);
  };

  const openEdit = (pyme) => {
    setEditing(pyme);
    setForm({
      nombre: pyme.nombre,
      tipo: pyme.tipo,
      sector: pyme.sector || '',
      ciudad: pyme.ciudad || '',
      direccion: pyme.direccion || '',
      telefono: pyme.telefono || '',
      descripcion: pyme.descripcion || '',
    });
    setActionError(null);
    setModalOpen(true);
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return; // prevent double submit
    setSaving(true);
    setActionError(null);
    try {
      if (editing) {
        await pymesApi.update(editing.id, form);
      } else {
        await pymesApi.create(form);
      }
      setModalOpen(false);
      run();
      showToast(editing ? 'PYME actualizada con éxito' : 'PYME creada con éxito');
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pyme) => {
    if (!window.confirm(`¿Eliminar la PYME "${pyme.nombre}"?`)) return;
    try {
      await pymesApi.remove(pyme.id);
      run();
      showToast('PYME eliminada');
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleLeave = async (pyme) => {
    if (!window.confirm(`¿Abandonar "${pyme.nombre}"? Vas a perder el acceso hasta que te vuelvan a invitar.`)) return;
    try {
      await pymesApi.leave(pyme.id);
      run();
      showToast(`Saliste de ${pyme.nombre}`);
    } catch (err) {
      showToast(err.message);
    }
  };

  if (loading) return <Spinner label="Cargando PYMES..." />;
  if (error) return <ErrorBox error={error} />;

  return (
    <div>
      <PageHeader
        title="Mis PYMES"
        subtitle="Gestiona los negocios que administras."
        actions={<Button onClick={openCreate}><IconPlus size={15} /> Nueva PYME</Button>}
      />

      {!data?.pymes?.length ? (
        <div className="card"><EmptyState title="Sin PYMES" message="Crea tu primera PYME para empezar." /></div>
      ) : (
        <div className="pyme-grid">
          {data.pymes.map((p, i) => {
            const esOwner = puede(p.miRoles, 'gestionarPyme');
            return (
              <div key={p.id} className="pyme-card animate-fade-in-up" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
                <div className="pyme-card-head">
                  <span className="pyme-avatar" aria-hidden="true">{iniciales(p.nombre)}</span>
                  <div className="pyme-card-title">
                    <strong className="pyme-card-nombre">{p.nombre}</strong>
                  </div>
                  {esOwner ? (
                    <div className="row-actions">
                      <IconButton variant="outline" label={`Editar ${p.nombre}`} tooltip="Editar" onClick={() => openEdit(p)}>
                        <IconEdit size={14} aria-hidden="true" />
                      </IconButton>
                      <IconButton variant="danger-subtle" label={`Eliminar ${p.nombre}`} tooltip="Eliminar" onClick={() => handleDelete(p)}>
                        <IconTrash size={14} aria-hidden="true" />
                      </IconButton>
                    </div>
                  ) : (
                    <div className="row-actions">
                      <IconButton variant="danger-subtle" label={`Abandonar ${p.nombre}`} tooltip="Abandonar" onClick={() => handleLeave(p)}>
                        <IconLogout size={14} aria-hidden="true" />
                      </IconButton>
                    </div>
                  )}
                </div>

                <div className="pyme-card-body">
                  <div className="pyme-card-badges">
                    <Badge tone="primary">{TIPO_LABELS[p.tipo] || p.tipo}</Badge>
                    {!esOwner && (p.miRoles || []).map((rol) => (
                      <Badge key={rol} tone={ROL_TONE[rol] || 'default'}>{ROL_LABELS[rol] || rol}</Badge>
                    ))}
                  </div>

                  {p.ciudad && (
                    <div className="pyme-card-meta">
                      <span><IconMapPin size={13} aria-hidden="true" /> {p.ciudad}{p.direccion ? ` · ${p.direccion}` : ''}</span>
                    </div>
                  )}

                  <div className="pyme-card-stats">
                    <div className="pyme-card-stat">
                      <b>{p._count.productos}</b>
                      <span>producto{p._count.productos === 1 ? '' : 's'}</span>
                    </div>
                    <div className="pyme-card-stat">
                      <b>{p._count.ventas}</b>
                      <span>venta{p._count.ventas === 1 ? '' : 's'}</span>
                    </div>
                    <div className="pyme-card-stat">
                      <b>{date(p.createdAt)}</b>
                      <span>creada</span>
                    </div>
                  </div>

                  <div className="pyme-card-footer">
                    <IconPhone size={13} aria-hidden="true" />
                    {p.telefono || 'Sin teléfono'}
                  </div>
                </div>
              </div>
            );
          })}

          <button type="button" className="pyme-card-add" onClick={openCreate}>
            <span className="pyme-card-add-icon" aria-hidden="true"><IconPlus size={20} /></span>
            <span>Registrar otra PYME</span>
          </button>
        </div>
      )}

      <Modal open={modalOpen} title={editing ? 'Editar PYME' : 'Nueva PYME'} onClose={() => setModalOpen(false)}>
        <form ref={formRef} onSubmit={handleSubmit}>
          <ErrorBox error={actionError} />
          <div className="form-group">
            <label>Nombre</label>
            <input name="nombre" required value={form.nombre} onChange={handleChange} placeholder="Tienda La Esquina" />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Tipo de negocio</label>
              <select name="tipo" value={form.tipo} onChange={handleChange}>
                {Object.entries(TIPO_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Sector</label>
              <input name="sector" value={form.sector} onChange={handleChange} placeholder="Alimentos" />
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Ciudad</label>
              <input name="ciudad" value={form.ciudad} onChange={handleChange} placeholder="Bogotá" />
            </div>
            <div className="form-group">
              <label>Teléfono</label>
              <input name="telefono" value={form.telefono} onChange={handleChange} placeholder="300 000 0000" />
            </div>
          </div>

          <div className="form-group">
            <label>Dirección</label>
            <input name="direccion" value={form.direccion} onChange={handleChange} placeholder="Calle 10 # 5-20" />
          </div>

          <div className="form-group">
            <label>Descripción</label>
            <textarea name="descripcion" rows={2} value={form.descripcion} onChange={handleChange} />
          </div>

          <div className="form-row">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={saving} aria-busy={saving} aria-label={saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear PYME'}>
              {editing ? 'Guardar cambios' : 'Crear PYME'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
