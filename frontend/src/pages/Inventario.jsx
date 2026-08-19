import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { inventarioApi, productosApi, pymesApi, ventasApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBox, Badge, Modal, Button, EmptyState } from '../components/ui';
import { IconPlus, IconEdit, IconTrash, IconSearch, IconCheck } from '../components/Icons';
import { categoriasComunesPorTipo } from '../constants/categorias';
import ImportarProductosModal from '../components/ImportarProductosModal';

const PAGE_SIZE = 10;

const OTRA_CATEGORIA = '__otra__';

export default function Inventario() {
  const [search, setSearch] = useState('');
  const [filtroPymeId, setFiltroPymeId] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    nombre: '', categoria: '', precioVenta: '', costo: '',
    stockActual: 0, stockMinimo: 5, leadTimeDias: 7, stockSeguridad: 0,
  });
  const [otraCategoria, setOtraCategoria] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [toast, setToast] = useState(null);
  const [ventaInputs, setVentaInputs] = useState({});
  const [vendiendoId, setVendiendoId] = useState(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState(-1);
  const modalFormRef = useRef(null);

  const pymes = useAsync(() => pymesApi.list());
  const { data, loading, error, run } = useAsync(
    () => inventarioApi.list(filtroPymeId ? { pymeId: filtroPymeId } : {}),
    [filtroPymeId]
  );

  const inventarios = data?.inventarios || [];
  const tienePymes = (pymes.data?.pymes?.length ?? 0) > 0;

  const categoriasDisponibles = useMemo(() => {
    const pymeId = form.pymeId ? Number(form.pymeId) : null;
    const pyme = pymes.data?.pymes?.find((p) => p.id === pymeId);
    const comunes = categoriasComunesPorTipo(pyme?.tipo);
    const usadas = inventarios
      .filter((inv) => !pymeId || inv.producto.pymeId === pymeId)
      .map((inv) => inv.producto.categoria)
      .filter(Boolean);
    return Array.from(new Set([...comunes, ...usadas])).sort((a, b) => a.localeCompare(b));
  }, [inventarios, form.pymeId, pymes.data]);

  const filtered = inventarios.filter((inv) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      inv.producto.nombre.toLowerCase().includes(s) ||
      (inv.producto.categoria || '').toLowerCase().includes(s)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Keyboard navigation for table rows
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (modalOpen || e.target.closest('input, select, textarea, button')) {
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedRowIndex(prev => Math.min(prev + 1, paginated.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedRowIndex(prev => Math.max(prev - 1, -1));
      } else if (e.key === 'Enter' && focusedRowIndex >= 0) {
        e.preventDefault();
        // Could trigger edit on focused row
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [paginated.length, focusedRowIndex, modalOpen]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      nombre: '', categoria: '', precioVenta: '', costo: '',
      stockActual: 0, stockMinimo: 5, leadTimeDias: 7, stockSeguridad: 0,
      pymeId: pymes.data?.pymes?.[0]?.id || '',
    });
    setOtraCategoria(false);
    setActionError(null);
    setModalOpen(true);
  };

  const openEdit = (inv) => {
    setEditing(inv);
    setForm({
      nombre: inv.producto.nombre,
      codigo: inv.producto.codigo,
      categoria: inv.producto.categoria || '',
      precioVenta: inv.producto.precioVenta,
      costo: inv.producto.costo,
      stockActual: inv.stockActual,
      stockMinimo: inv.stockMinimo,
      leadTimeDias: inv.producto.leadTimeDias ?? 7,
      stockSeguridad: inv.producto.stockSeguridad ?? 0,
      pymeId: inv.producto.pymeId,
    });
    setOtraCategoria(false);
    setActionError(null);
    setModalOpen(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'pymeId') {
      setOtraCategoria(false);
      setForm({ ...form, pymeId: value, categoria: '' });
      return;
    }
    setForm({ ...form, [name]: value });
  };

  const handleVenderChange = (invId, value) => {
    setVentaInputs({ ...ventaInputs, [invId]: value });
  };

  const handleVender = async (inv) => {
    const cantidad = Number(ventaInputs[inv.id]);
    if (!cantidad || cantidad <= 0) return;
    if (cantidad > inv.stockActual) {
      showToast(`No puedes vender ${cantidad} unidades, solo quedan ${inv.stockActual}.`);
      return;
    }
    if (vendiendoId === inv.id) return; // prevent double click
    setVendiendoId(inv.id);
    try {
      await ventasApi.create({
        productoId: inv.producto.id,
        cantidad,
        precioUnitario: inv.producto.precioVenta,
      });
      setVentaInputs({ ...ventaInputs, [inv.id]: '' });
      showToast(`Venta registrada: ${cantidad} uds de ${inv.producto.nombre}`);
      run();
    } catch (err) {
      showToast(err.message);
    } finally {
      setVendiendoId(null);
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
    setSaving(true);
    setActionError(null);
    try {
      if (editing) {
        await productosApi.update(editing.producto.id, {
          pymeId: Number(form.pymeId),
          nombre: form.nombre,
          codigo: form.codigo,
          categoria: form.categoria,
          precioVenta: Number(form.precioVenta),
          costo: Number(form.costo),
          leadTimeDias: Number(form.leadTimeDias),
          stockSeguridad: Number(form.stockSeguridad),
          inventario: {
            stockActual: Number(form.stockActual),
            stockMinimo: Number(form.stockMinimo),
          },
        });
        showToast('Producto actualizado con éxito');
      } else {
        const pymeId = form.pymeId || pymes.data?.pymes?.[0]?.id;
        if (!pymeId) {
          setActionError('Debes crear una PYME primero');
          setSaving(false);
          return;
        }
        await productosApi.create({
          pymeId: Number(pymeId),
          nombre: form.nombre,
          codigo: `PROD-${Date.now()}`,
          categoria: form.categoria,
          precioVenta: Number(form.precioVenta),
          costo: Number(form.costo),
          leadTimeDias: Number(form.leadTimeDias),
          stockSeguridad: Number(form.stockSeguridad),
          inventario: {
            stockActual: Number(form.stockActual),
            stockMinimo: Number(form.stockMinimo),
          },
        });
        showToast('Producto exitoso');
      }
      setModalOpen(false);
      run();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (inv) => {
    if (!window.confirm(`¿Eliminar "${inv.producto.nombre}"?`)) return;
    try {
      await productosApi.remove(inv.producto.id);
      showToast('Producto eliminado');
      run();
    } catch (err) {
      window.alert(err.message);
    }
  };

  if (loading) return <Spinner label="Cargando inventario..." />;
  if (error) return <ErrorBox error={error} />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Mi inventario</h1>
          <p className="muted">Controla el stock actual y mínimo de cada producto.</p>
        </div>
        <div className="page-actions">
          {tienePymes ? (
            <>
              <Button variant="outline" onClick={openCreate}><IconPlus size={15} /> Añadir producto</Button>{' '}
              <Button variant="outline" onClick={() => setImportOpen(true)}>Importar / Exportar</Button>
            </>
          ) : (
            <Link to="/pymes" className="btn btn-outline">
              <IconPlus size={15} /> Crea tu primera PYME
            </Link>
          )}
        </div>
      </div>

      {!pymes.loading && !tienePymes && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          Todavía no tienes ninguna PYME registrada. Un producto siempre pertenece a
          una PYME — crea una primero en <Link to="/pymes">Mis PYMES</Link> para poder
          añadir productos al inventario.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="search-box">
          <IconSearch size={15} />
          <input
            type="text"
            placeholder="Buscar producto o categoría..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        {tienePymes && (
          <select
            value={filtroPymeId}
            onChange={(e) => { setFiltroPymeId(e.target.value); setPage(1); }}
          >
            <option value="">Todas mis PYMES</option>
            {pymes.data?.pymes?.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Stock actual</th>
              <th>Stock mínimo</th>
              <th>Estado</th>
              <th>Vendido</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan="7">
                  <EmptyState title="Sin productos" message="Añade tu primer producto al inventario." />
                </td>
              </tr>
            ) : (
              paginated.map((inv) => {
                const alerta = inv.stockActual <= inv.stockMinimo;
                return (
                  <tr key={inv.id}>
                    <td><strong>{inv.producto.nombre}</strong></td>
                    <td>{inv.producto.categoria || '—'}</td>
                    <td>{inv.stockActual}</td>
                    <td>{inv.stockMinimo}</td>
                    <td>
                      {alerta ? (
                        <Badge tone="danger">Bajo stock</Badge>
                      ) : (
                        <Badge tone="success">OK</Badge>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="number"
                          min="1"
                          max={inv.stockActual}
                          placeholder="uds"
                          style={{ width: 70 }}
                          value={ventaInputs[inv.id] || ''}
                          onChange={(e) => handleVenderChange(inv.id, e.target.value)}
                          disabled={inv.stockActual <= 0}
                        />
                        <Button
                          variant="outline"
                          loading={vendiendoId === inv.id}
                          disabled={inv.stockActual <= 0 || !ventaInputs[inv.id]}
                          onClick={() => handleVender(inv)}
                        >
                          Vender
                        </Button>
                      </div>
                    </td>
                    <td>
                      <Button variant="outline" onClick={() => openEdit(inv)}><IconEdit size={14} /> Editar</Button>{' '}
                      <Button variant="danger" onClick={() => handleDelete(inv)}><IconTrash size={14} /> Eliminar</Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="pagination" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            let p;
            if (totalPages <= 5) p = i + 1;
            else if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
            return (
              <button key={p} className={p === page ? 'active' : ''} onClick={() => setPage(p)}>
                {p}
              </button>
            );
          })}
          {totalPages > 5 && <span>...</span>}
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast toast-success">
          <span className="toast-icon"><IconCheck size={16} /></span>
          <span>{toast}</span>
        </div>
      )}

      {/* Modal Añadir / Editar */}
      <Modal open={modalOpen} title={editing ? 'Editar producto' : 'Añadir producto'} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit}>
          <ErrorBox error={actionError} />

          {!editing && (
            <div className="form-group">
              <label>PYME</label>
              <select name="pymeId" value={form.pymeId || ''} onChange={handleChange} required>
                <option value="">Selecciona una PYME</option>
                {pymes.data?.pymes?.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>Nombre</label>
            <input name="nombre" required value={form.nombre} onChange={handleChange} placeholder="Nombre del producto" />
          </div>

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

          <div className="form-row">
            <div className="form-group">
              <label>Precio de venta (COP)</label>
              <input
                name="precioVenta"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.precioVenta}
                onChange={handleChange}
                placeholder="4500"
              />
            </div>
            <div className="form-group">
              <label>Costo (COP)</label>
              <input
                name="costo"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.costo}
                onChange={handleChange}
                placeholder="3200"
              />
            </div>
          </div>
          <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
            Este precio queda guardado en el producto y se usa automáticamente
            al registrar una venta — no hay que volver a escribirlo cada vez.
          </p>

          <div className="form-row">
            <div className="form-group">
              <label>Stock Actual</label>
              <input name="stockActual" type="number" min="0" required value={form.stockActual} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Stock mínimo</label>
              <input name="stockMinimo" type="number" min="0" required value={form.stockMinimo} onChange={handleChange} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Lead time (días del proveedor)</label>
              <input name="leadTimeDias" type="number" min="0" value={form.leadTimeDias} onChange={handleChange} placeholder="7" />
            </div>
            <div className="form-group">
              <label>Stock de seguridad</label>
              <input name="stockSeguridad" type="number" min="0" value={form.stockSeguridad} onChange={handleChange} placeholder="0" />
            </div>
          </div>
          <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
            Se usan para calcular cuándo y cuánto reabastecer en la
            sección de Alertas.
          </p>

          <div className="form-row">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={saving}>{editing ? 'Guardar' : 'Añadir'}</Button>
          </div>
        </form>
      </Modal>

      <ImportarProductosModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        pymes={pymes.data?.pymes || []}
        onImported={(resumen) => {
          setImportOpen(false);
          showToast(`Importación: ${resumen.creados} producto(s) creado(s)${resumen.errores.length ? `, ${resumen.errores.length} con error` : ''}`);
          run();
        }}
      />
    </div>
  );
}
