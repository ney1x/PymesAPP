import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { inventarioApi, productosApi, pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBox, Badge, Modal, Button, IconButton, EmptyState } from '../components/ui';
import { IconPlus, IconEdit, IconTrash, IconSearch, IconCheck, IconAlert, IconCamera, IconChevronLeft, IconChevronRight } from '../components/Icons';
import { categoriasComunesPorTipo } from '../constants/categorias';
import ImportarProductosModal from '../components/ImportarProductosModal';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import { puede, puedeEnAlguna } from '../constants/permisos';
import { usePymeFilter } from '../context/PymeFilterContext';

const PAGE_SIZE = 10;

const OTRA_CATEGORIA = '__otra__';

export default function Inventario() {
  const { pymeSeleccionada: filtroPymeId } = usePymeFilter();
  const [search, setSearch] = useState('');
  const [filtroSedeId, setFiltroSedeId] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    nombre: '', codigo: '', categoria: '', precioVenta: '', costo: '',
    unidadesPorCaja: '', codigoCaja: '', precioCaja: '', costoCaja: '',
    stockActual: 0, stockMinimo: 5, leadTimeDias: 7, stockSeguridad: 0,
  });
  const [otraCategoria, setOtraCategoria] = useState(false);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [toast, setToast] = useState(null);
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

  // La PYME se elige desde el switcher del rail (Layout.jsx), no acá.
  useEffect(() => {
    setFiltroSedeId('');
    setFiltroCategoria('');
    setPage(1);
  }, [filtroPymeId]);

  const inventarios = data?.inventarios || [];
  const tienePymes = (pymes.data?.pymes?.length ?? 0) > 0;
  const rolPorPyme = useMemo(
    () => new Map((pymes.data?.pymes || []).map((p) => [p.id, p.miRoles])),
    [pymes.data]
  );
  const puedeGestionarProductos = puedeEnAlguna(pymes.data?.pymes, 'gestionarProductos');

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

  // Conteo por categoría sobre el inventario ya filtrado por PYME/sede (antes
  // de aplicar búsqueda o la propia categoría), para que la barra de chips
  // muestre cuánto hay en cada una sin importar qué esté buscando el usuario.
  const categoriasConteo = useMemo(() => {
    const conteo = new Map();
    inventarios.forEach((inv) => {
      const cat = inv.producto.categoria || 'Sin categoría';
      conteo.set(cat, (conteo.get(cat) || 0) + 1);
    });
    return Array.from(conteo.entries())
      .map(([categoria, cantidad]) => ({ categoria, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad || a.categoria.localeCompare(b.categoria));
  }, [inventarios]);

  const filtered = inventarios.filter((inv) => {
    if (filtroCategoria) {
      const cat = inv.producto.categoria || 'Sin categoría';
      if (cat !== filtroCategoria) return false;
    }
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
      unidadesPorCaja: '', codigoCaja: '', precioCaja: '', costoCaja: '',
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
      unidadesPorCaja: inv.producto.unidadesPorCaja ?? '',
      codigoCaja: inv.producto.codigoCaja ?? '',
      precioCaja: inv.producto.precioCaja ?? '',
      costoCaja: inv.producto.costoCaja ?? '',
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

    // Caja opcional: si no hay factor válido, se manda todo en null para que
    // el backend limpie cualquier configuración previa de caja.
    const usaCaja = Number(form.unidadesPorCaja) >= 2;
    const camposCaja = {
      unidadesPorCaja: usaCaja ? Math.floor(Number(form.unidadesPorCaja)) : null,
      codigoCaja: usaCaja ? (form.codigoCaja || '').trim() || null : null,
      precioCaja: usaCaja && form.precioCaja !== '' ? Number(form.precioCaja) : null,
      costoCaja: usaCaja && form.costoCaja !== '' ? Number(form.costoCaja) : null,
    };

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
          ...camposCaja,
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
          ...camposCaja,
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

      <div className="inv-toolbar">
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
        {filtroPymeId && (sedes.data?.sedes?.length ?? 0) > 1 && (
          <select
            value={filtroSedeId}
            onChange={(e) => { setFiltroSedeId(e.target.value); setFiltroCategoria(''); setPage(1); }}
          >
            <option value="">Todas las sedes</option>
            {sedes.data.sedes.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        )}
        <span className="inv-toolbar-stat">
          {filtered.length} producto{filtered.length === 1 ? '' : 's'} · {categoriasConteo.length} categoría{categoriasConteo.length === 1 ? '' : 's'}
        </span>
      </div>

      {categoriasConteo.length > 0 && (
        <div className="inv-category-filter" role="group" aria-label="Filtrar por categoría">
          <button
            type="button"
            className={`inv-category-chip${filtroCategoria === '' ? ' inv-category-chip-active' : ''}`}
            onClick={() => { setFiltroCategoria(''); setPage(1); }}
          >
            Todas
          </button>
          {categoriasConteo.map(({ categoria, cantidad }) => (
            <button
              type="button"
              key={categoria}
              className={`inv-category-chip${filtroCategoria === categoria ? ' inv-category-chip-active' : ''}`}
              onClick={() => { setFiltroCategoria(filtroCategoria === categoria ? '' : categoria); setPage(1); }}
            >
              {categoria} <span className="inv-category-chip-count">{cantidad}</span>
            </button>
          ))}
        </div>
      )}

      {paginated.length === 0 ? (
        <div className="card"><EmptyState title="Sin productos" message="Añade tu primer producto al inventario." /></div>
      ) : (
        <>
          {/* Desktop/tablet: tabla densa, uso con mouse. Igual que Equipo,
              7 columnas no caben en un viewport móvil sin scroll horizontal
              permanente (~860px de contenido contra ~280px visibles). */}
          <div className="table-wrap table-wrap--catalogo inv-table-view animate-fade-in-up">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Código</th>
                  <th>Categoría</th>
                  <th>Stock</th>
                  <th>Estado</th>
                  {puedeGestionarProductos && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {paginated.map((inv, i) => {
                  const alerta = inv.stockActual <= inv.stockMinimo;
                  const enAlerta = inv.stockActual <= inv.stockMinimo * 1.5;
                  const techoStock = inv.stockMaximo || Math.max(inv.stockActual, inv.stockMinimo * 2, 1);
                  const stockPct = Math.max(0, Math.min(100, (inv.stockActual / techoStock) * 100));
                  const stockTone = alerta ? 'danger' : enAlerta ? 'warning' : 'ok';
                  const rol = rolPorPyme.get(inv.producto.pymeId);
                  const puedeGestionarFila = puede(rol, 'gestionarProductos');
                  const upc = Number(inv.producto.unidadesPorCaja) >= 2 ? Number(inv.producto.unidadesPorCaja) : null;
                  return (
                    <tr
                      key={inv.id}
                      tabIndex={0}
                      className={`animate-fade-in${focusedRowIndex === i ? ' inv-row-selected' : ''}`}
                      onClick={() => setFocusedRowIndex(i)}
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <td><strong>{inv.producto.nombre}</strong></td>
                      <td className="inv-cell-codigo">{inv.producto.codigo || '—'}</td>
                      <td><span className="inv-badge-categoria"><Badge tone="default">{inv.producto.categoria || 'Sin categoría'}</Badge></span></td>
                      <td>
                        <div className="inv-stock-cell">
                          <span className={`inv-stock-cell-value${alerta ? ' cell-stock-critico' : ''}`}>{inv.stockActual}</span>
                          <span className={`inv-stock-bar inv-stock-bar-${stockTone}`} role="progressbar" aria-label={`Stock de ${inv.producto.nombre}`} aria-valuenow={inv.stockActual} aria-valuemin={0} aria-valuemax={techoStock}>
                            <span className="inv-stock-bar-fill" style={{ transform: `scaleX(${stockPct / 100})` }} />
                          </span>
                          <span className="inv-stock-cell-min">
                            mín. {inv.stockMinimo}
                            {upc ? ` · ≈ ${Math.floor(inv.stockActual / upc)} cajas de ${upc}` : ''}
                          </span>
                        </div>
                      </td>
                      <td>
                        {alerta ? (
                          <Badge tone="danger">Bajo stock</Badge>
                        ) : (
                          <Badge tone="success">OK</Badge>
                        )}
                      </td>
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
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: una tarjeta por producto. Mismos datos y handlers que
              la tabla (incluida la venta rápida inline). */}
          <div className="inv-card-view">
            {paginated.map((inv, i) => {
              const alerta = inv.stockActual <= inv.stockMinimo;
              const enAlerta = inv.stockActual <= inv.stockMinimo * 1.5;
              const techoStock = inv.stockMaximo || Math.max(inv.stockActual, inv.stockMinimo * 2, 1);
              const stockPct = Math.max(0, Math.min(100, (inv.stockActual / techoStock) * 100));
              const stockTone = alerta ? 'danger' : enAlerta ? 'warning' : 'ok';
              const rol = rolPorPyme.get(inv.producto.pymeId);
              const puedeGestionarFila = puede(rol, 'gestionarProductos');
              const upc = Number(inv.producto.unidadesPorCaja) >= 2 ? Number(inv.producto.unidadesPorCaja) : null;
              return (
                <div key={inv.id} className="inv-product-card animate-fade-in" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                  <div className="inv-product-card-head">
                    <div className="inv-product-card-title">
                      <strong>{inv.producto.nombre}</strong>
                      <span className="inv-cell-codigo">{inv.producto.codigo || '—'}</span>
                    </div>
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
                  </div>

                  <div className="inv-product-card-badges">
                    <span className="inv-badge-categoria"><Badge tone="default">{inv.producto.categoria || 'Sin categoría'}</Badge></span>
                    {alerta ? <Badge tone="danger">Bajo stock</Badge> : <Badge tone="success">OK</Badge>}
                  </div>

                  <div className="inv-stock-cell">
                    <span className={`inv-stock-cell-value${alerta ? ' cell-stock-critico' : ''}`}>{inv.stockActual}</span>
                    <span className={`inv-stock-bar inv-stock-bar-${stockTone}`} role="progressbar" aria-label={`Stock de ${inv.producto.nombre}`} aria-valuenow={inv.stockActual} aria-valuemin={0} aria-valuemax={techoStock}>
                      <span className="inv-stock-bar-fill" style={{ transform: `scaleX(${stockPct / 100})` }} />
                    </span>
                    <span className="inv-stock-cell-min">
                      mín. {inv.stockMinimo}
                      {upc ? ` · ≈ ${Math.floor(inv.stockActual / upc)} cajas de ${upc}` : ''}
                    </span>
                  </div>

                </div>
              );
            })}
          </div>
        </>
      )}

      {filtered.length > PAGE_SIZE && (
        <nav className="pagination" style={{ justifyContent: 'center', marginTop: 16 }} aria-label="Paginación de productos">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Página anterior">
            <IconChevronLeft size={15} aria-hidden="true" />
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            let p;
            if (totalPages <= 5) p = i + 1;
            else if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
            return (
              <button
                type="button"
                key={p}
                className={p === page ? 'active' : ''}
                onClick={() => setPage(p)}
                aria-label={`Página ${p}`}
                aria-current={p === page ? 'page' : undefined}
              >
                {p}
              </button>
            );
          })}
          {totalPages > 5 && <span aria-hidden="true">...</span>}
          <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Página siguiente">
            <IconChevronRight size={15} aria-hidden="true" />
          </button>
        </nav>
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

          <details className="form-advanced" open={Number(form.unidadesPorCaja) >= 2}>
            <summary>Venta por caja (opcional)</summary>
            <p className="muted" style={{ marginTop: 8 }}>
              Si también lo vendés por caja, indicá cuántas unidades trae. El stock
              es uno solo (en unidades): vender una caja descuenta esa cantidad.
              Dejalo vacío si solo lo vendés por unidad.
            </p>
            <div className="form-row" style={{ marginTop: 12 }}>
              <div className="form-group">
                <label htmlFor="inv-unidadesPorCaja">Unidades por caja</label>
                <input id="inv-unidadesPorCaja" name="unidadesPorCaja" type="number" min="2" step="1" value={form.unidadesPorCaja} onChange={handleChange} placeholder="p. ej. 40" />
              </div>
              <div className="form-group">
                <label htmlFor="inv-codigoCaja">Código de barras de la caja</label>
                <input id="inv-codigoCaja" name="codigoCaja" value={form.codigoCaja} onChange={handleChange} placeholder="Código de la caja" disabled={Number(form.unidadesPorCaja) < 2} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="inv-precioCaja">Precio de la caja (COP)</label>
                <input id="inv-precioCaja" name="precioCaja" type="number" step="0.01" min="0" value={form.precioCaja} onChange={handleChange} placeholder={form.precioVenta && form.unidadesPorCaja ? String(Number(form.precioVenta) * Number(form.unidadesPorCaja)) : 'precio × unidades'} disabled={Number(form.unidadesPorCaja) < 2} />
              </div>
              <div className="form-group">
                <label htmlFor="inv-costoCaja">Costo de la caja (COP)</label>
                <input id="inv-costoCaja" name="costoCaja" type="number" step="0.01" min="0" value={form.costoCaja} onChange={handleChange} placeholder={form.costo && form.unidadesPorCaja ? String(Number(form.costo) * Number(form.unidadesPorCaja)) : 'costo × unidades'} disabled={Number(form.unidadesPorCaja) < 2} />
              </div>
            </div>
          </details>

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
