import React, { useState, useRef } from 'react';
import { pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBox, PageHeader, Badge, Modal, Button, IconButton, EmptyState, date } from '../components/ui';
import { IconPlus, IconEdit, IconTrash } from '../components/Icons';

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

  if (loading) return <Spinner label="Cargando PYMES..." />;
  if (error) return <ErrorBox error={error} />;

  return (
    <div>
      <PageHeader
        title="Mis PYMES"
        subtitle="Gestiona los negocios que administras."
        actions={<Button onClick={openCreate}><IconPlus size={15} /> Nueva PYME</Button>}
      />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Ciudad</th>
              <th>Teléfono</th>
              <th>Productos</th>
              <th>Creada</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!data?.pymes?.length ? (
              <tr><td colSpan="7"><EmptyState title="Sin PYMES" message="Crea tu primera PYME para empezar." /></td></tr>
            ) : (
              data.pymes.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.nombre}</strong></td>
                  <td><Badge tone="primary">{TIPO_LABELS[p.tipo] || p.tipo}</Badge></td>
                  <td>{p.ciudad || '—'}</td>
                  <td>{p.telefono || '—'}</td>
                  <td>{p._count.productos}</td>
                  <td>{date(p.createdAt)}</td>
                  <td>
                    <div className="row-actions">
                      <IconButton variant="outline" label={`Editar ${p.nombre}`} tooltip="Editar" onClick={() => openEdit(p)}>
                        <IconEdit size={14} aria-hidden="true" />
                      </IconButton>
                      <IconButton variant="danger-subtle" label={`Eliminar ${p.nombre}`} tooltip="Eliminar" onClick={() => handleDelete(p)}>
                        <IconTrash size={14} aria-hidden="true" />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
