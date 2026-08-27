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
 * FIRST VIEWPORT: dos columnas se mantienen; izquierda el carrito (escaneo +
 *   líneas + total) con el total como número grande animado; derecha "Ventas
 *   recientes" como lista animada (no tabla).
 * FORM: dirección líder de la tirada de concept-seed (candidato #5 de la
 *   lista propia), seed key ventasredesign1. Recorte post-entrega: se quitó
 *   la franja de mini-barras de actividad (raise del reto "osciloscopio")
 *   por feedback directo del usuario — "difícil de entender" — sin sustituto,
 *   el resto de la dirección se mantiene intacto.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with
 *   the finish review, the verdict, DESIGN.md, and every shipping raster
 *   carrying its provenance.
 *
 * Carrito de venta (código de barras): la pistola USB emula teclado — tipea
 * el código y termina en Enter. No hay endpoint de "factura": cada línea del
 * carrito confirmada dispara su propio ventasApi.create() (mismo endpoint de
 * siempre), la agrupación visual es puramente de esta pantalla.
 */
import React, { useState, useRef } from 'react';
import { ventasApi, productosApi, pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBox, PageHeader, Button, EmptyState, money, date } from '../components/ui';
import { IconCamera } from '../components/Icons';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import { puedeEnAlguna } from '../constants/permisos';

export default function Ventas() {
  const [filtroPymeId, setFiltroPymeId] = useState('');
  const [filtroSedeId, setFiltroSedeId] = useState('');
  const [form, setForm] = useState({ productoId: '', cantidad: 1, precioUnitario: '' });
  const [carrito, setCarrito] = useState([]); // [{ productoId, nombre, codigo, cantidad, precioUnitario, stockActual }]
  const [scanValue, setScanValue] = useState('');
  const [scanError, setScanError] = useState(null);
  const [codigoSinAsignar, setCodigoSinAsignar] = useState(null); // último código escaneado sin producto — habilita "Asignar a un producto"
  const [productoParaAsignar, setProductoParaAsignar] = useState('');
  const [asignando, setAsignando] = useState(false);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [ventaNuevaIds, setVentaNuevaIds] = useState(new Set());
  const scanInputRef = useRef(null);

  const pymes = useAsync(() => pymesApi.list());
  const puedeVender = puedeEnAlguna(pymes.data?.pymes, 'crearVentas');
  const puedeGestionarProductos = puedeEnAlguna(pymes.data?.pymes, 'gestionarProductos');
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
    setCarrito([]);
  };

  const focusScan = () => {
    // el foco vuelve solo al campo de escaneo tras cada lectura/acción, para
    // no requerir clic entre ítems escaneados con la pistola.
    requestAnimationFrame(() => scanInputRef.current?.focus());
  };

  // Agrega una línea al carrito, o incrementa su cantidad si el producto ya
  // estaba (auto-incremento para códigos repetidos).
  const agregarLinea = (producto, cantidadAgregar) => {
    const stockActual = producto.inventario?.stockActual;
    const tieneStock = typeof stockActual === 'number';

    setCarrito((actual) => {
      const idx = actual.findIndex((l) => l.productoId === producto.id);
      if (idx >= 0) {
        const linea = actual[idx];
        const nuevaCantidad = linea.cantidad + cantidadAgregar;
        if (tieneStock && nuevaCantidad > stockActual) {
          setScanError(`Stock insuficiente: quedan ${stockActual} uds de ${producto.nombre}`);
          return actual;
        }
        const copia = [...actual];
        copia[idx] = { ...linea, cantidad: nuevaCantidad };
        return copia;
      }

      if (tieneStock && cantidadAgregar > stockActual) {
        setScanError(`Stock insuficiente: quedan ${stockActual} uds de ${producto.nombre}`);
        return actual;
      }

      return [
        ...actual,
        {
          productoId: producto.id,
          nombre: producto.nombre,
          codigo: producto.codigo,
          cantidad: cantidadAgregar,
          precioUnitario: producto.precioVenta,
          stockActual,
        },
      ];
    });
  };

  // Compartido entre la pistola (Enter en el input) y la cámara (código
  // detectado por @zxing/browser) — ambos terminan en el mismo lookup +
  // línea de carrito, solo cambia de dónde sale el texto del código.
  const procesarCodigoEscaneado = (codigoCrudo) => {
    const codigo = codigoCrudo.trim();
    if (!codigo) return;

    const producto = productos.data?.productos?.find((p) => p.codigo === codigo);
    if (!producto) {
      setScanError(`Código no reconocido: ${codigo}`);
      setCodigoSinAsignar(codigo);
      return;
    }

    setScanError(null);
    setCodigoSinAsignar(null);
    setSuccess(null);
    agregarLinea(producto, 1);
  };

  const handleAsignarCodigo = async () => {
    if (!codigoSinAsignar || !productoParaAsignar) return;
    const producto = productos.data?.productos?.find((p) => String(p.id) === productoParaAsignar);
    if (!producto) return;

    if (typeof producto.costo !== 'number' || typeof producto.precioVenta !== 'number') {
      setScanError('No tenés permiso para ver el costo de este producto, así que no se puede asignar el código desde acá. Hacelo desde Productos.');
      return;
    }

    setAsignando(true);
    try {
      await productosApi.update(producto.id, {
        pymeId: producto.pymeId,
        sedeId: producto.sedeId,
        nombre: producto.nombre,
        codigo: codigoSinAsignar,
        categoria: producto.categoria,
        precioVenta: producto.precioVenta,
        costo: producto.costo,
        leadTimeDias: producto.leadTimeDias,
        stockSeguridad: producto.stockSeguridad,
        estado: producto.estado,
      });
      setScanError(null);
      setSuccess(`Código ${codigoSinAsignar} asignado a ${producto.nombre}.`);
      agregarLinea({ ...producto, codigo: codigoSinAsignar }, 1);
      setCodigoSinAsignar(null);
      setProductoParaAsignar('');
      productos.run();
    } catch (err) {
      setScanError(err.message);
    } finally {
      setAsignando(false);
    }
  };

  const handleScanKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const codigo = scanValue;
    setScanValue('');
    procesarCodigoEscaneado(codigo);
    focusScan();
  };

  const handleCameraDetect = (codigo) => {
    // La cámara queda abierta (modo continuo del escáner) — se puede seguir
    // escaneando ítem tras ítem sin volver a abrirla; el carrito de abajo
    // se actualiza en vivo con cada uno.
    procesarCodigoEscaneado(codigo);
  };

  const actualizarCantidad = (productoId, delta) => {
    setCarrito((actual) =>
      actual.map((l) => {
        if (l.productoId !== productoId) return l;
        const nueva = l.cantidad + delta;
        if (nueva < 1) return l;
        if (typeof l.stockActual === 'number' && nueva > l.stockActual) return l;
        return { ...l, cantidad: nueva };
      })
    );
  };

  const quitarLinea = (productoId) => {
    setCarrito((actual) => actual.filter((l) => l.productoId !== productoId));
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    if (name === 'productoId') {
      const precioSugerido = productos.data?.productos?.find((p) => String(p.id) === value)?.precioVenta || '';
      setForm({ ...form, productoId: value, precioUnitario: precioSugerido });
    } else {
      setForm({ ...form, [name]: name === 'cantidad' ? Number(value) : value });
    }
  };

  const handleAgregarManual = (e) => {
    e.preventDefault();
    const producto = productos.data?.productos?.find((p) => String(p.id) === form.productoId);
    if (!producto) return;

    agregarLinea(
      { ...producto, precioVenta: Number(form.precioUnitario) || producto.precioVenta },
      Number(form.cantidad) || 1
    );
    setForm({ productoId: '', cantidad: 1, precioUnitario: '' });
  };

  const totalCarrito = carrito.reduce((acc, l) => acc + l.cantidad * l.precioUnitario, 0);

  const confirmarVenta = async () => {
    if (confirmando || carrito.length === 0) return;
    setConfirmando(true);
    setActionError(null);
    setSuccess(null);

    const nuevosIds = new Set();
    const pendientes = [...carrito];

    while (pendientes.length > 0) {
      const linea = pendientes[0];
      try {
        const res = await ventasApi.create({
          productoId: linea.productoId,
          cantidad: linea.cantidad,
          precioUnitario: linea.precioUnitario,
        });
        if (res?.venta?.id) nuevosIds.add(res.venta.id);
        pendientes.shift();
        setCarrito((actual) => actual.filter((l) => l.productoId !== linea.productoId));
      } catch (err) {
        setActionError(
          `${err.message} — se detuvo en "${linea.nombre}". Las líneas anteriores ya quedaron registradas.`
        );
        break;
      }
    }

    if (pendientes.length === 0) {
      setSuccess('Venta registrada. El stock se actualizó y se programó la predicción.');
    }
    setVentaNuevaIds(nuevosIds);
    ventas.run();
    productos.run(); // el stock mostrado (carrito, gauge) debe reflejar la venta recién hecha
    setConfirmando(false);
    focusScan();
  };

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
        subtitle="Escaneá o agregá productos al carrito; cada venta actualiza el inventario y alimenta el modelo de predicción."
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
          <div className="card-title">Carrito de venta</div>

          <ErrorBox error={actionError} />
          {success && <div className="alert alert-success">{success}</div>}

          <div className="form-group">
            <label htmlFor="scanInput">Escanear código de barras</label>
            <div className="venta-scan-row">
              <input
                id="scanInput"
                ref={scanInputRef}
                className="venta-scan-input"
                type="text"
                autoFocus
                placeholder="Enfocá acá y escaneá con la pistola..."
                value={scanValue}
                onChange={(e) => { setScanValue(e.target.value); setScanError(null); }}
                onKeyDown={handleScanKeyDown}
              />
              <Button
                type="button"
                variant={camaraAbierta ? 'primary' : 'secondary'}
                aria-pressed={camaraAbierta}
                onClick={() => { setScanError(null); setCamaraAbierta((v) => !v); }}
              >
                <IconCamera size={16} aria-hidden="true" /> {camaraAbierta ? 'Cerrar cámara' : 'Cámara'}
              </Button>
            </div>
            {scanError && <div className="alert alert-error" style={{ marginTop: 8 }}>{scanError}</div>}

            {codigoSinAsignar && puedeGestionarProductos && (
              <div className="venta-asignar-codigo">
                <label htmlFor="productoParaAsignar">Asignar {codigoSinAsignar} a un producto existente</label>
                <div className="venta-scan-row">
                  <select
                    id="productoParaAsignar"
                    value={productoParaAsignar}
                    onChange={(e) => setProductoParaAsignar(e.target.value)}
                  >
                    <option value="">Selecciona un producto</option>
                    {productos.data?.productos?.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}{p.codigo ? ` (código actual: ${p.codigo})` : ''}</option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="secondary"
                    loading={asignando}
                    disabled={!productoParaAsignar}
                    onClick={handleAsignarCodigo}
                  >
                    Asignar código
                  </Button>
                </div>
              </div>
            )}
          </div>

          <BarcodeScannerModal
            inline
            continuo
            open={camaraAbierta}
            onClose={() => { setCamaraAbierta(false); focusScan(); }}
            onDetect={handleCameraDetect}
          />

          <details style={{ marginBottom: 16 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>Agregar manualmente</summary>
            <div style={{ marginTop: 10 }}>
              <div className="form-group">
                <label htmlFor="productoId">Producto</label>
                <select id="productoId" name="productoId" value={form.productoId} onChange={handleFormChange}>
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
                    value={form.cantidad}
                    onChange={handleFormChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="precioUnitario">Precio unitario (COP)</label>
                  <input id="precioUnitario" name="precioUnitario" type="number" min="0" step="0.01" value={form.precioUnitario} onChange={handleFormChange} />
                </div>
              </div>

              {tieneStock && (
                <div className={`venta-stock-gauge${stockTone !== 'ok' ? ` venta-stock-gauge-${stockTone}` : ''}`}>
                  <div className="venta-stock-gauge-track" role="progressbar" aria-label="Stock restante tras agregar" aria-valuenow={stockRestante} aria-valuemin={0} aria-valuemax={stockActual}>
                    <div className="venta-stock-gauge-fill" style={{ transform: `scaleX(${stockPct / 100})` }} />
                  </div>
                  <div className="venta-stock-gauge-label">
                    <span>Quedan {stockRestante} uds tras agregar</span>
                    <span>{stockActual} en stock</span>
                  </div>
                </div>
              )}

              <Button type="button" variant="secondary" className="btn-block" onClick={handleAgregarManual} disabled={!form.productoId}>
                Agregar al carrito
              </Button>
            </div>
          </details>

          {carrito.length === 0 ? (
            <EmptyState title="Carrito vacío" message="Escaneá un código o agregá un producto manualmente." />
          ) : (
            <ul className="list-card venta-carrito-lista">
              {carrito.map((l) => (
                <li key={l.productoId} className="rank-item venta-carrito-linea">
                  <div className="rank-info">
                    <strong>{l.nombre}</strong>
                    <small>{money(l.precioUnitario)} c/u{l.codigo ? ` · ${l.codigo}` : ''}</small>
                  </div>
                  <div className="venta-carrito-cantidad">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => actualizarCantidad(l.productoId, -1)} aria-label={`Quitar una unidad de ${l.nombre}`}>−</button>
                    <span>{l.cantidad}</span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => actualizarCantidad(l.productoId, 1)} aria-label={`Agregar una unidad de ${l.nombre}`}>+</button>
                  </div>
                  <div className="dashboard-rank-metric">
                    <strong>{money(l.cantidad * l.precioUnitario)}</strong>
                  </div>
                  <button type="button" className="venta-carrito-quitar" onClick={() => quitarLinea(l.productoId)} aria-label={`Quitar ${l.nombre} del carrito`}>×</button>
                </li>
              ))}
            </ul>
          )}

          <div className="venta-total-row">
            <span className="venta-total-label">Total a cobrar</span>
            <strong key={totalCarrito} className="venta-total-ticker">{money(totalCarrito)}</strong>
          </div>

          <Button
            type="button"
            loading={confirmando}
            className="btn-block"
            disabled={carrito.length === 0}
            aria-busy={confirmando}
            aria-label={confirmando ? 'Registrando venta...' : 'Confirmar venta'}
            onClick={confirmarVenta}
          >
            Confirmar venta
          </Button>
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
                    className={`rank-item animate-slide-in-right${ventaNuevaIds.has(v.id) ? ' venta-feed-item-new' : ''}`}
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
