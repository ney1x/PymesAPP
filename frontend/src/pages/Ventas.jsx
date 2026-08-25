/*
 * IMPECCABLE DIRECTION CONTRACT (revisado tras feedback de usuario)
 * THESIS: Ventas deja de ser "formulario arriba, historial abajo" y se
 *   vuelve un panel de venta en vivo: cada acción tiene una reacción visible
 *   al instante — total animado, stock que se vacía en tiempo real, historial
 *   con entrada animada y la venta recién hecha resaltada un momento.
 * OWN-WORLD: se hereda el sistema "Ledger digital" sin cambios — navy
 *   #122a47, cards blancas, badges por tono, Fraunces Display para números
 *   grandes. Ninguna paleta, tipografía ni componente nuevo.
 * STORY: el vendedor ve de un vistazo cuánto va a cobrar y cuánto stock le
 *   queda antes de confirmar, y ve su venta aparecer al instante en la lista
 *   — refuerza que cada venta cuenta y ya quedó registrada.
 * FIRST VIEWPORT: dos columnas se mantienen; izquierda el formulario con el
 *   total como número grande animado y una barra de stock viva bajo la
 *   cantidad; derecha "Ventas recientes" como lista animada (no tabla).
 * FORM: dirección líder de la tirada de concept-seed (candidato #5 de la
 *   lista propia), seed key ventasredesign1. Recorte post-entrega: se quitó
 *   la franja de mini-barras de actividad (raise del reto "osciloscopio")
 *   por feedback directo del usuario — "difícil de entender" — sin sustituto,
 *   el resto de la dirección se mantiene intacto.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with
 *   the finish review, the verdict, DESIGN.md, and every shipping raster
 *   carrying its provenance.
 */
import React, { useState, useRef } from 'react';
import { ventasApi, productosApi, pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBox, PageHeader, Button, EmptyState, money, date } from '../components/ui';
import { puedeEnAlguna } from '../constants/permisos';

export default function Ventas() {
  const [filtroPymeId, setFiltroPymeId] = useState('');
  const [filtroSedeId, setFiltroSedeId] = useState('');
  const [form, setForm] = useState({ productoId: '', cantidad: 1, precioUnitario: '' });
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [ventaNuevaId, setVentaNuevaId] = useState(null);
  const formRef = useRef(null);

  const pymes = useAsync(() => pymesApi.list());
  const puedeVender = puedeEnAlguna(pymes.data?.pymes, 'crearVentas');
  const sedes = useAsync(
    () => (filtroPymeId ? pymesApi.sedes.list(filtroPymeId) : Promise.resolve({ sedes: [] })),
    [filtroPymeId]
  );
  const productos = useAsync(
    () => productosApi.list({ ...(filtroPymeId ? { pymeId: filtroPymeId } : {}), ...(filtroSedeId ? { sedeId: filtroSedeId } : {}) }),
    [filtroPymeId, filtroSedeId]
  );
  const ventas = useAsync(
    () => ventasApi.list({ ...(filtroPymeId ? { pymeId: filtroPymeId } : {}), ...(filtroSedeId ? { sedeId: filtroSedeId } : {}) }),
    [filtroPymeId, filtroSedeId]
  );

  const handleFiltroPyme = (value) => {
    setFiltroPymeId(value);
    setFiltroSedeId('');
    setForm({ productoId: '', cantidad: 1, precioUnitario: '' });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'productoId') {
      const precioSugerido = productos.data?.productos?.find((p) => String(p.id) === value)?.precioVenta || '';
      setForm({ ...form, productoId: value, precioUnitario: precioSugerido });
    } else {
      setForm({ ...form, [name]: name === 'cantidad' ? Number(value) : value });
    }
    setSuccess(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return; // prevent double submit
    setSaving(true);
    setActionError(null);
    setSuccess(null);
    try {
      const res = await ventasApi.create({
        productoId: Number(form.productoId),
        cantidad: Number(form.cantidad),
        precioUnitario: Number(form.precioUnitario),
      });
      setSuccess('Venta registrada. El stock se actualizó y se programó la predicción.');
      setForm({ productoId: '', cantidad: 1, precioUnitario: '' });
      setVentaNuevaId(res?.venta?.id ?? null);
      ventas.run();
      productos.run(); // el stock mostrado (selector, barra en vivo) debe reflejar la venta recién hecha
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const total = Number(form.precioUnitario || 0) * Number(form.cantidad || 0);

  const productoSeleccionado = productos.data?.productos?.find((p) => String(p.id) === form.productoId);
  const stockActual = productoSeleccionado?.inventario?.stockActual;
  const tieneStock = typeof stockActual === 'number';
  const stockRestante = tieneStock ? Math.max(0, stockActual - Number(form.cantidad || 0)) : 0;
  const stockPct = tieneStock && stockActual > 0 ? Math.max(0, Math.min(100, (stockRestante / stockActual) * 100)) : 0;
  const stockTone = stockPct <= 15 ? 'danger' : stockPct <= 40 ? 'warning' : 'ok';

  return (
    <div data-impeccable-seed="ventasredesign1">
      <PageHeader
        title="Registrar venta"
        subtitle="Cada venta actualiza el inventario y alimenta el modelo de predicción."
        actions={
          (pymes.data?.pymes?.length ?? 0) > 0 && (
            <>
              <select value={filtroPymeId} onChange={(e) => handleFiltroPyme(e.target.value)}>
                <option value="">Todas mis PYMES</option>
                {pymes.data?.pymes?.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              {filtroPymeId && (sedes.data?.sedes?.length ?? 0) > 1 && (
                <select value={filtroSedeId} onChange={(e) => setFiltroSedeId(e.target.value)}>
                  <option value="">Todas las sedes</option>
                  {sedes.data.sedes.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              )}
            </>
          )
        }
      />

      <div className={puedeVender ? 'grid-2' : undefined}>
        {puedeVender && (
        <div className="card">
          <div className="card-title">Nueva venta</div>
          <form ref={formRef} onSubmit={handleSubmit}>
            <ErrorBox error={actionError} />
            {success && <div className="alert alert-success">{success}</div>}

            <div className="form-group">
              <label htmlFor="productoId">Producto</label>
              <select id="productoId" name="productoId" value={form.productoId} onChange={handleChange} required>
                <option value="">Selecciona un producto</option>
                {productos.data?.productos?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.inventario?.stockActual ?? 0} uds)
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="cantidad">Cantidad</label>
                <input
                  id="cantidad"
                  name="cantidad"
                  type="number"
                  min="1"
                  max={tieneStock ? stockActual : undefined}
                  required
                  value={form.cantidad}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="precioUnitario">Precio unitario (COP)</label>
                <input id="precioUnitario" name="precioUnitario" type="number" min="0" step="0.01" required value={form.precioUnitario} onChange={handleChange} />
              </div>
            </div>

            {tieneStock && (
              <div className={`venta-stock-gauge${stockTone !== 'ok' ? ` venta-stock-gauge-${stockTone}` : ''}`}>
                <div className="venta-stock-gauge-track" role="progressbar" aria-label="Stock restante tras esta venta" aria-valuenow={stockRestante} aria-valuemin={0} aria-valuemax={stockActual}>
                  <div className="venta-stock-gauge-fill" style={{ transform: `scaleX(${stockPct / 100})` }} />
                </div>
                <div className="venta-stock-gauge-label">
                  <span>Quedan {stockRestante} uds tras esta venta</span>
                  <span>{stockActual} en stock</span>
                </div>
              </div>
            )}

            <div className="venta-total-row">
              <span className="venta-total-label">Total a cobrar</span>
              <strong key={total} className="venta-total-ticker">{money(total)}</strong>
            </div>

            <Button type="submit" loading={saving} className="btn-block" aria-busy={saving} aria-label={saving ? 'Registrando venta...' : 'Registrar venta'}>Registrar venta</Button>
          </form>
        </div>
        )}

        <div className="card">
          <div className="card-title">Ventas recientes</div>

          <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
            {!ventas.data?.ventas?.length ? (
              <EmptyState title="Sin ventas" message="Registra tu primera venta." />
            ) : (
              <ul className="list-card">
                {ventas.data.ventas.slice(0, 15).map((v, i) => (
                  <li
                    key={v.id}
                    className={`rank-item animate-slide-in-right${v.id === ventaNuevaId ? ' venta-feed-item-new' : ''}`}
                    style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                  >
                    <div className="rank-info">
                      <strong>{v.producto.nombre}</strong>
                      <small>{date(v.fecha)} · {v.cantidad} uds</small>
                    </div>
                    <div className="dashboard-rank-metric">
                      <strong>{money(v.total)}</strong>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
