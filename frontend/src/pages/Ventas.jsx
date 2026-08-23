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
      await ventasApi.create({
        productoId: Number(form.productoId),
        cantidad: Number(form.cantidad),
        precioUnitario: Number(form.precioUnitario),
      });
      setSuccess('Venta registrada. El stock se actualizó y se programó la predicción.');
      setForm({ productoId: '', cantidad: 1, precioUnitario: '' });
      ventas.run();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const total = Number(form.precioUnitario || 0) * Number(form.cantidad || 0);

  return (
    <div>
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
                <input id="cantidad" name="cantidad" type="number" min="1" required value={form.cantidad} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="precioUnitario">Precio unitario (COP)</label>
                <input id="precioUnitario" name="precioUnitario" type="number" min="0" step="0.01" required value={form.precioUnitario} onChange={handleChange} />
              </div>
            </div>

            <div className="alert alert-info">
              <strong>Total: {money(total)}</strong>
            </div>

            <Button type="submit" loading={saving} className="btn-block" aria-busy={saving} aria-label={saving ? 'Registrando venta...' : 'Registrar venta'}>Registrar venta</Button>
          </form>
        </div>
        )}

        <div className="card">
          <div className="card-title">Ventas recientes</div>
          <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
            <table>
              <thead>
                <tr><th>Fecha</th><th>Producto</th><th>Cant.</th><th>Total</th></tr>
              </thead>
              <tbody>
                {!ventas.data?.ventas?.length ? (
                  <tr><td colSpan="4"><EmptyState title="Sin ventas" message="Registra tu primera venta." /></td></tr>
                ) : (
                  ventas.data.ventas.slice(0, 15).map((v) => (
                    <tr key={v.id}>
                      <td>{date(v.fecha)}</td>
                      <td>{v.producto.nombre}</td>
                      <td>{v.cantidad}</td>
                      <td>{money(v.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
