import React, { useMemo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { productosApi, pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBox, PageHeader, Badge, Modal, Button, EmptyState, money, date } from '../components/ui';
import { IconPlus, IconEdit, IconTrash } from '../components/Icons';
import { categoriasComunesPorTipo } from '../constants/categorias';

const emptyForm = {
  pymeId: '',
  nombre: '',
  codigo: '',
  categoria: '',
  precioVenta: '',
  costo: '',
  inventario: { stockActual: 0, stockMinimo: 5, stockMaximo: 100, ubicacion: '' },
};

const OTRA_CATEGORIA = '__otra__';

export default function Productos() {
  const [pymeId, setPymeId] = useState('');
  const [sedeId, setSedeId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [otraCategoria, setOtraCategoria] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [toast, setToast] = useState(null);
  const formRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const pymes = useAsync(() => pymesApi.list());
  const sedes = useAsync(
    () => (pymeId ? pymesApi.sedes.list(pymeId) : Promise.resolve({ sedes: [] })),
    [pymeId]
  );
  const { data, loading, error, run } = useAsync(
    () => productosApi.list({ ...(pymeId ? { pymeId } : {}), ...(sedeId ? { sedeId } : {}) }),
    [pymeId, sedeId]
  );

  const handleFiltroPyme = (value) => {
    setPymeId(value);
    setSedeId('');
  };

  const tienePymes = (pymes.data?.pymes?.length ?? 0) > 0;
  const selectedPyme = pymeId || pymes.data?.pymes?.[0]?.id || '';

  const categoriasDisponibles = useMemo(() => {
    const formPymeId = form.pymeId ? Number(form.pymeId) : null;
    const pyme = pymes.data?.pymes?.find((p) => p.id === formPymeId);
    const comunes = categoriasComunesPorTipo(pyme?.tipo);
    const usadas = (data?.productos || [])
      .filter((p) => !formPymeId || p.pymeId === formPymeId)
      .map((p) => p.categoria)
      .filter(Boolean);
    return Array.from(new Set([...comunes, ...usadas])).sort((a, b) => a.localeCompare(b));
  }, [data, form.pymeId, pymes.data]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, pymeId: selectedPyme });
    setOtraCategoria(false);
    setActionError(null);
    setModalOpen(true);
  };

  const openEdit = (prod) => {
    setEditing(prod);
    setForm({
      pymeId: prod.pymeId,
      nombre: prod.nombre,
      codigo: prod.codigo,
      categoria: prod.categoria || '',
      precioVenta: prod.precioVenta,
      costo: prod.costo,
      inventario: {
        stockActual: prod.inventario?.stockActual ?? 0,
        stockMinimo: prod.inventario?.stockMinimo ?? 5,
        stockMaximo: prod.inventario?.stockMaximo ?? 100,
        ubicacion: prod.inventario?.ubicacion || '',
      },
    });
    setOtraCategoria(false);
    setActionError(null);
    setModalOpen(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('inv.')) {
      const key = name.replace('inv.', '');
      setForm({ ...form, inventario: { ...form.inventario, [key]: Number(value) } });
    } else if (name === 'pymeId') {
      setOtraCategoria(false);
      setForm({ ...form, pymeId: value, categoria: '' });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleCategoriaSelect = (e) => {
    const { value } = e.target;
    if (value === OTRA_CATEGORIA) {
      setOtraCategoria(true);
      setForm({ ...form, categoria: '' });
    } else {
      setOtraCategoria(false);
      setForm({ ...form, categoria: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return; // prevent double submit
    setSaving(true);
    setActionError(null);
    const payload = {
      ...form,
      precioVenta: Number(form.precioVenta),
      costo: Number(form.costo),
      pymeId: Number(form.pymeId),
      inventario: { ...form.inventario },
    };
    try {
      if (editing) {
        await productosApi.update(editing.id, payload);
      } else {
        await productosApi.create(payload);
      }
      setModalOpen(false);
      run();
      showToast(editing ? 'Producto actualizado con éxito' : 'Producto creado con éxito');
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (prod) => {
    if (!window.confirm(`¿Eliminar "${prod.nombre}"?`)) return;
    try {
      await productosApi.remove(prod.id);
      run();
      showToast('Producto eliminado');
    } catch (err) {
      showToast(err.message);
    }
  };

  if (loading) return <Spinner label="Cargando productos..." />;
  if (error) return <ErrorBox error={error} />;

  return (
    <div>
      <PageHeader
        title="Productos"
        subtitle="Catalogo de tu negocio. El margen = precio venta − costo."
        actions={
          tienePymes ? (
            <Button onClick={openCreate}><IconPlus size={15} /> Nuevo producto</Button>
          ) : (
            <Link to="/pymes" className="btn btn-primary">
              <IconPlus size={15} /> Crea tu primera PYME
            </Link>
          )
        }
      />

      {!pymes.loading && !tienePymes && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          Todavía no tienes ninguna PYME registrada. Un producto siempre pertenece a
          una PYME (así puedes manejar varios negocios con la misma cuenta) — crea
          una primero en <Link to="/pymes">Mis PYMES</Link> para poder agregar productos.
        </div>
      )}

      <div className="card">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="filterPyme">Filtrar por PYME</label>
            <select id="filterPyme" value={pymeId} onChange={(e) => handleFiltroPyme(e.target.value)}>
              <option value="">Todas mis PYMES</option>
              {pymes.data?.pymes?.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          {pymeId && (sedes.data?.sedes?.length ?? 0) > 1 && (
            <div className="form-group">
              <label htmlFor="filterSede">Filtrar por sede</label>
              <select id="filterSede" value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
                <option value="">Todas las sedes</option>
                {sedes.data.sedes.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Precio</th>
              <th>Costo</th>
              <th>Margen</th>
              <th>Stock</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!data?.productos?.length ? (
              <tr><td colSpan="8"><EmptyState title="Sin productos" message="Agrega tu primer producto." /></td></tr>
            ) : (
              data.productos.map((p) => {
                const margen = p.precioVenta - p.costo;
                return (
                  <tr key={p.id}>
                    <td>{p.codigo}</td>
                    <td><strong>{p.nombre}</strong></td>
                    <td>{p.categoria || '—'}</td>
                    <td>{money(p.precioVenta)}</td>
                    <td>{money(p.costo)}</td>
                    <td>
                      <Badge tone={margen > 0 ? 'success' : 'danger'}>{money(margen)}</Badge>
                    </td>
                    <td>
                      {p.inventario ? (
                        <Badge tone={p.inventario.stockActual <= p.inventario.stockMinimo ? 'danger' : 'default'}>
                          {p.inventario.stockActual} uds
                        </Badge>
                      ) : '—'}
                    </td>
                    <td>
                      <Button variant="outline" onClick={() => openEdit(p)} aria-label={`Editar ${p.nombre}`}><IconEdit size={14} aria-hidden="true" /> Editar</Button>{' '}
                      <Button variant="danger" onClick={() => handleDelete(p)} aria-label={`Eliminar ${p.nombre}`}><IconTrash size={14} aria-hidden="true" /> Eliminar</Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} title={editing ? 'Editar producto' : 'Nuevo producto'} onClose={() => setModalOpen(false)}>
        <form ref={formRef} onSubmit={handleSubmit}>
          <ErrorBox error={actionError} />

          <div className="form-group">
            <label>PYME</label>
            <select name="pymeId" value={form.pymeId} onChange={handleChange} required>
              <option value="">Selecciona una PYME</option>
              {pymes.data?.pymes?.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Nombre</label>
              <input name="nombre" required value={form.nombre} onChange={handleChange} placeholder="Arroz 1kg" />
            </div>
            <div className="form-group">
              <label>Código</label>
              <input name="codigo" required value={form.codigo} onChange={handleChange} placeholder="ARZ-001" />
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Categoría</label>
              <select
                value={otraCategoria ? OTRA_CATEGORIA : form.categoria}
                onChange={handleCategoriaSelect}
              >
                <option value="">Sin categoría</option>
                {categoriasDisponibles.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value={OTRA_CATEGORIA}>+ Otra (nueva)...</option>
              </select>
              {otraCategoria && (
                <input
                  name="categoria"
                  value={form.categoria}
                  onChange={handleChange}
                  placeholder="Escribe la nueva categoría"
                  style={{ marginTop: 8 }}
                  autoFocus
                />
              )}
            </div>
            <div className="form-group">
              <label>Precio de venta (COP)</label>
              <input name="precioVenta" type="number" step="0.01" min="0" required value={form.precioVenta} onChange={handleChange} placeholder="4500" />
            </div>
          </div>

          <div className="form-group">
            <label>Costo (COP)</label>
            <input name="costo" type="number" step="0.01" min="0" required value={form.costo} onChange={handleChange} placeholder="3200" />
          </div>

          <div className="card-title" style={{ marginTop: 8 }}>Inventario inicial</div>
          <div className="form-row">
            <div className="form-group">
              <label>Stock actual</label>
              <input name="inv.stockActual" type="number" min="0" value={form.inventario.stockActual} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Stock mínimo</label>
              <input name="inv.stockMinimo" type="number" min="0" value={form.inventario.stockMinimo} onChange={handleChange} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Stock máximo</label>
              <input name="inv.stockMaximo" type="number" min="0" value={form.inventario.stockMaximo} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Ubicación</label>
              <input name="inv.ubicacion" value={form.inventario.ubicacion} onChange={handleChange} placeholder="Estante A" />
            </div>
          </div>

          <div className="form-row">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={saving} aria-busy={saving} aria-label={saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear producto'}>
              {editing ? 'Guardar cambios' : 'Crear producto'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
