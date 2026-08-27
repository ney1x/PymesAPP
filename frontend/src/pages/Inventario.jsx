import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { inventarioApi, productosApi, pymesApi, ventasApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBox, Badge, Modal, Button, IconButton, EmptyState } from '../components/ui';
import { IconPlus, IconEdit, IconTrash, IconSearch, IconCheck, IconAlert, IconCamera } from '../components/Icons';
import { categoriasComunesPorTipo } from '../constants/categorias';
import ImportarProductosModal from '../components/ImportarProductosModal';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import { puede, puedeEnAlguna } from '../constants/permisos';

const PAGE_SIZE = 10;

const OTRA_CATEGORIA = '__otra__';

export default function Inventario() {
  const [search, setSearch] = useState('');
  const [filtroPymeId, setFiltroPymeId] = useState('');
  const [filtroSedeId, setFiltroSedeId] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    nombre: '', codigo: '', categoria: '', precioVenta: '', costo: '',
    stockActual: 0, stockMinimo: 5, leadTimeDias: 7, stockSeguridad: 0,
  });
  const [otraCategoria, setOtraCategoria] = useState(false);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [toast, setToast] = useState(null);
  const [ventaInputs, setVentaInputs] = useState({});
  const [vendiendoId, setVendiendoId] = useState(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState(-1);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const modalFormRef = useRef(null);

  const pymes = useAsync(() => pymesApi.list());
  const sedes = useAsync(
    () => (filtroPymeId ? pymesApi.sedes.list(filtroPymeId) : Promise.resolve({ sedes: [] })),
    [filtroPymeId]
  );
  const { data, loading, error, run } = useAsync(
    () => inventarioApi.list({ ...(filtroPymeId ? { pymeId: filtroPymeId } : {}), ...(filtroSedeId ? { sedeId: filtroSedeId } : {}) }),
    [filtroPymeId, filtroSedeId]
  );

  const inventarios = data?.inventarios || [];
  const tienePymes = (pymes.data?.pymes?.length ?? 0) > 0;
  const rolPorPyme = useMemo(
    () => new Map((pymes.data?.pymes || []).map((p) => [p.id, p.miRoles])),
    [pymes.data]
  );
  const puedeGestionarProductos = puedeEnAlguna(pymes.data?.pymes, 'gestionarProductos');
  const puedeVenderAlguna = puedeEnAlguna(pymes.data?.pymes, 'crearVentas');

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

  // Borrar, buscar o filtrar puede dejar la página actual fuera de rango
  // (p. ej. borrás el único producto de la página 3) — sin este ajuste se ve
  // "Sin productos" aunque sí haya, solo que en una página anterior.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
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
      } else if (e.key === 'Enter' && focusedRowIndex >= 0 && paginated[focusedRowIndex]) {
        e.preventDefault();
        const fila = paginated[focusedRowIndex];
        if (puede(rolPorPyme.get(fila.producto.pymeId), 'gestionarProductos')) {
          openEdit(fila);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [paginated, rolPorPyme, focusedRowIndex, modalOpen]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      nombre: '', codigo: `PROD-${Date.now()}`, categoria: '', precioVenta: '', costo: '',
      stockActual: 0, stockMinimo: 5, leadTimeDias: 7, stockSeguridad: 0,
      pymeId: pymes.data?.pymes?.[0]?.id || '',
    });
    setOtraCategoria(false);
    setCamaraAbierta(false);
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
    setCamaraAbierta(false);
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
      showToast(`No puedes vender ${cantidad} unidades, solo quedan ${inv.stockActual}.`, 'error');
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
      showToast(err.message, 'error');
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
          codigo: form.codigo?.trim(),
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
          codigo: form.codigo?.trim() || `PROD-${Date.now()}`,
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
        showToast('Producto añadido con éxito');
      }
      setModalOpen(false);
      run();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (inv) => {
    setDeleteError(null);
    setDeleting(inv);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await productosApi.remove(deleting.producto.id);
      showToast('Producto eliminado');
      setDeleting(null);
      run();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleteLoading(false);
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
            puedeGestionarProductos && (
            <>
              <Button variant="primary" onClick={openCreate}><IconPlus size={15} /> Añadir producto</Button>{' '}
              <Button variant="outline" onClick={() => setImportOpen(true)}>Importar / Exportar</Button>
            </>
            )
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
            aria-label="Buscar producto o categoría"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        {tienePymes && (
          <select
            value={filtroPymeId}
            onChange={(e) => { setFiltroPymeId(e.target.value); setFiltroSedeId(''); setPage(1); }}
          >
            <option value="">Todas mis PYMES</option>
            {pymes.data?.pymes?.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        )}
        {filtroPymeId && (sedes.data?.sedes?.length ?? 0) > 1 && (
          <select
            value={filtroSedeId}
            onChange={(e) => { setFiltroSedeId(e.target.value); setPage(1); }}
          >
            <option value="">Todas las sedes</option>
            {sedes.data.sedes.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        )}
      </div>

      <div className="table-wrap animate-fade-in-up">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Stock actual</th>
              <th>Stock mínimo</th>
              <th>Estado</th>
              {puedeVenderAlguna && <th>Vendido</th>}
              {puedeGestionarProductos && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={5 + (puedeVenderAlguna ? 1 : 0) + (puedeGestionarProductos ? 1 : 0)}>
                  <EmptyState title="Sin productos" message="Añade tu primer producto al inventario." />
                </td>
              </tr>
            ) : (
              paginated.map((inv, i) => {
                const alerta = inv.stockActual <= inv.stockMinimo;
                const rol = rolPorPyme.get(inv.producto.pymeId);
                const puedeVenderFila = puede(rol, 'crearVentas');
                const puedeGestionarFila = puede(rol, 'gestionarProductos');
                return (
                  <tr
                    key={inv.id}
                    tabIndex={0}
                    className="animate-fade-in"
                    onClick={() => setFocusedRowIndex(i)}
                    style={{ animationDelay: `${i * 40}ms`, backgroundColor: focusedRowIndex === i ? 'var(--primary-soft)' : undefined }}
                  >
                    <td><strong>{inv.producto.nombre}</strong></td>
                    <td>{inv.producto.categoria || '—'}</td>
                    <td className={alerta ? 'cell-stock-critico' : undefined}>{inv.stockActual}</td>
                    <td>{inv.stockMinimo}</td>
                    <td>
                      {alerta ? (
                        <Badge tone="danger">Bajo stock</Badge>
                      ) : (
                        <Badge tone="success">OK</Badge>
                      )}
                    </td>
                    {puedeVenderAlguna && (
                      <td>
                        {puedeVenderFila && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input
                              type="number"
                              min="1"
                              max={inv.stockActual}
                              placeholder="uds"
                              aria-label={`Cantidad a vender de ${inv.producto.nombre}`}
                              style={{ width: 70 }}
                              value={ventaInputs[inv.id] || ''}
                              onChange={(e) => handleVenderChange(inv.id, e.target.value)}
                              disabled={inv.stockActual <= 0}
                            />
                            <Button
                              variant="success"
                              size="sm"
                              loading={vendiendoId === inv.id}
                              disabled={inv.stockActual <= 0 || !ventaInputs[inv.id]}
                              onClick={() => handleVender(inv)}
                            >
                              Vender
                            </Button>
                          </div>
                        )}
                      </td>
                    )}
                    {puedeGestionarProductos && (
                      <td>
                        {puedeGestionarFila && (
                          <div className="row-actions">
                            <IconButton variant="outline" label={`Editar ${inv.producto.nombre}`} tooltip="Editar" onClick={() => openEdit(inv)}>
                              <IconEdit size={14} aria-hidden="true" />
                            </IconButton>
                            <IconButton variant="danger-subtle" label={`Eliminar ${inv.producto.nombre}`} tooltip="Eliminar" onClick={() => handleDelete(inv)}>
                              <IconTrash size={14} aria-hidden="true" />
                            </IconButton>
                          </div>
                        )}
                      </td>
                    )}
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
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'error' ? <IconAlert size={16} /> : <IconCheck size={16} />}
          </span>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Modal Confirmar eliminación */}
      <Modal open={!!deleting} title="Eliminar producto" onClose={() => setDeleting(null)}>
        {deleting && (
          <div>
            <ErrorBox error={deleteError} />
            <p>
              ¿Eliminar <strong>"{deleting.producto.nombre}"</strong>? Quedan{' '}
              <strong>{deleting.stockActual}</strong> unidades en stock. Esta acción no se puede deshacer.
            </p>
            <div className="form-row">
              <Button type="button" variant="ghost" onClick={() => setDeleting(null)}>Cancelar</Button>
              <Button type="button" variant="danger" loading={deleteLoading} onClick={confirmDelete}>Eliminar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Añadir / Editar */}
      <Modal open={modalOpen} title={editing ? 'Editar producto' : 'Añadir producto'} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit}>
          <ErrorBox error={actionError} />

          {!editing && (
            <div className="form-group">
              <label htmlFor="inv-pymeId">PYME</label>
              <select id="inv-pymeId" name="pymeId" value={form.pymeId || ''} onChange={handleChange} required>
                <option value="">Selecciona una PYME</option>
                {pymes.data?.pymes?.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="inv-nombre">Nombre</label>
            <input id="inv-nombre" name="nombre" required value={form.nombre} onChange={handleChange} placeholder="Nombre del producto" />
          </div>

          <div className="form-group">
            <label htmlFor="inv-codigo">Código de barras</label>
            <div className="venta-scan-row">
              <input
                id="inv-codigo"
                name="codigo"
                required
                value={form.codigo}
                onChange={handleChange}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                placeholder="Escaneá o escribí el código"
              />
              <Button type="button" variant="secondary" onClick={() => setCamaraAbierta((v) => !v)}>
                <IconCamera size={16} aria-hidden="true" /> Cámara
              </Button>
            </div>
            {!editing && (
              <p className="muted" style={{ marginTop: 4, marginBottom: 0, fontSize: 12.5 }}>
                Se rellenó uno automático — reemplazalo escaneando el código real del producto si lo tiene.
              </p>
            )}
            <BarcodeScannerModal
              inline
              open={camaraAbierta}
              onClose={() => setCamaraAbierta(false)}
              onDetect={(codigo) => { setForm((f) => ({ ...f, codigo })); setCamaraAbierta(false); }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="inv-categoria">Categoría</label>
            <select
              id="inv-categoria"
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
                aria-label="Nombre de la nueva categoría"
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
              <label htmlFor="inv-precioVenta">Precio de venta (COP)</label>
              <input
                id="inv-precioVenta"
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
              <label htmlFor="inv-costo">Costo (COP)</label>
              <input
                id="inv-costo"
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
              <label htmlFor="inv-stockActual">Stock Actual</label>
              <input id="inv-stockActual" name="stockActual" type="number" min="0" required value={form.stockActual} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="inv-stockMinimo">Stock mínimo</label>
              <input id="inv-stockMinimo" name="stockMinimo" type="number" min="0" required value={form.stockMinimo} onChange={handleChange} />
            </div>
          </div>

          <details className="form-advanced">
            <summary>Opciones de reabastecimiento</summary>
            <div className="form-row" style={{ marginTop: 12 }}>
              <div className="form-group">
                <label htmlFor="inv-leadTimeDias">Tiempo de entrega del proveedor (días)</label>
                <input id="inv-leadTimeDias" name="leadTimeDias" type="number" min="0" value={form.leadTimeDias} onChange={handleChange} placeholder="7" />
              </div>
              <div className="form-group">
                <label htmlFor="inv-stockSeguridad">Stock de seguridad</label>
                <input id="inv-stockSeguridad" name="stockSeguridad" type="number" min="0" value={form.stockSeguridad} onChange={handleChange} placeholder="0" />
              </div>
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>
              Se usan para calcular cuándo y cuánto reabastecer en la
              sección de Alertas.
            </p>
          </details>

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
