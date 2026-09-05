/*
 * IMPECCABLE DIRECTION CONTRACT (bolder pass — POS/caja)
 * THESIS: Ventas deja de leer como "card de formulario + card de tabla"
 *   idéntica a cualquier otra pantalla del sistema, y pasa a leerse como una
 *   caja registradora real: un único panel de operación en tres franjas
 *   apiladas — escanear (navy) → carrito (papel/recibo) → cobrar (navy,
 *   jerarquía máxima) — en el mismo orden en que ocurre la venta. El
 *   historial reciente queda deliberadamente aparte y sin relieve, para que
 *   nunca compita con la operación en curso.
 * OWN-WORLD: se hereda el sistema "Ledger digital" sin cambios — navy
 *   #122a47, amber/petrol #c97a0c, Fraunces Display para números grandes,
 *   font-mono para montos tabulares. Ninguna paleta, tipografía ni radio
 *   nuevo; el botón "accent" reutiliza --primary, el mismo par ya usado en
 *   .brand-logo, sólo que ahora también como superficie de botón.
 * STORY: el vendedor escanea, ve el carrito crecer como una cinta de papel,
 *   y el total — el número más grande de toda la pantalla — le dice cuánto
 *   cobrar antes de tocar el único botón sólido en amber de la vista.
 * FIRST VIEWPORT: panel de operación (1.7fr) + costado de ventas recientes
 *   (1fr) plano y sin sombra. En mobile (`<900px`) se apila: panel completo
 *   primero, historial después.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with
 *   the finish review, the verdict, DESIGN.md, and every shipping raster
 *   carrying its provenance.
 *
 * Carrito de venta (código de barras): la pistola USB emula teclado — tipea
 * el código y termina en Enter. Al confirmar, el carrito entero se manda de
 * una vez a facturasApi.create() — una factura con todas las líneas, no una
 * venta suelta por línea.
 */
import React, { useState, useRef, useEffect } from 'react';
import { facturasApi, productosApi, pymesApi } from '../api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBox, PageHeader, Button, EmptyState, money, date } from '../components/ui';
import { IconCamera, IconPlus, IconMinus, IconClose, IconChevronRight, IconCheck } from '../components/Icons';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import { puede } from '../constants/permisos';
import { usePymeFilter } from '../context/PymeFilterContext';

// Wheel sobre un input[type=number] es inconsistente entre navegadores: a
// veces cambia el valor Y scrollea la página al mismo tiempo. Se engancha
// el listener nativo (no el onWheel de React, que va como passive y no
// deja hacer preventDefault) y solo se actúa si el input tiene foco — ahí
// se bloquea el scroll de la página y se aplica el paso a mano. Sin foco
// no hace nada: la rueda scrollea la página como siempre.
function useWheelStep(ref, step, onStep) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const handler = (e) => {
      if (document.activeElement !== el) return;
      e.preventDefault();
      onStep(e.deltaY < 0 ? step : -step);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  });
}

export default function Ventas() {
  const { pymeSeleccionada: filtroPymeId } = usePymeFilter();
  const [filtroSedeId, setFiltroSedeId] = useState('');
  const [form, setForm] = useState({ productoId: '', cantidad: 1, precioUnitario: '', presentacion: 'UNIDAD' });
  // Una línea por (producto + presentación): el mismo producto puede estar en
  // el carrito como UNIDAD y como CAJA a la vez. `factor` = unidades base por
  // cada `cantidad` (1 para UNIDAD, unidadesPorCaja para CAJA); el stock se
  // valida siempre en unidades base.
  const [carrito, setCarrito] = useState([]); // [{ key, productoId, nombre, codigo, presentacion, factor, cantidad, precioUnitario, stockActual }]
  const [montoRecibido, setMontoRecibido] = useState(''); // efectivo con el que paga el cliente, para calcular el vuelto
  const [scanValue, setScanValue] = useState('');
  const [scanError, setScanError] = useState(null);
  const [codigoSinAsignar, setCodigoSinAsignar] = useState(null); // último código escaneado sin producto — habilita "Asignar a un producto"
  const [productoParaAsignar, setProductoParaAsignar] = useState('');
  const [asignando, setAsignando] = useState(false);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [ventaConfirmada, setVentaConfirmada] = useState(null); // { id, total } — recibo recién sellado
  const [facturaNuevaId, setFacturaNuevaId] = useState(null);
  const [facturasExpandidas, setFacturasExpandidas] = useState(new Set());
  const scanInputRef = useRef(null);
  const cantidadInputRef = useRef(null);
  const precioInputRef = useRef(null);
  const montoRecibidoInputRef = useRef(null);

  // El sello de "venta registrada" se retira solo: es una acción que se repite
  // decenas de veces por turno, no debe acumularse ni pedir que lo cierren.
  useEffect(() => {
    if (!ventaConfirmada) return undefined;
    const t = setTimeout(() => setVentaConfirmada(null), 4200);
    return () => clearTimeout(t);
  }, [ventaConfirmada]);

  const pymes = useAsync(() => pymesApi.list());

  // Vender es una acción de UNA pyme puntual (la factura entera se resuelve
  // a un solo pymeId — ver facturasService.create en el backend), así que
  // "puedo vender" no puede ser un OR entre todas mis pymes: alguien
  // ANALISTA en "Hola" y VENDEDOR en "Tienda la esquina" vería el panel de
  // venta con productos de las dos mezclados en "todas mis pymes", y la
  // pantalla se comporta como si pudiera vender ahí también. Se resuelve
  // contra la PYME puntual elegida en el switcher del rail (Layout.jsx) —
  // si está en "Todas mis PYMES", no se muestra.
  const pymesConVenta = (pymes.data?.pymes || []).filter((p) => puede(p.miRoles, 'crearVentas'));
  const pymeFiltrada = pymes.data?.pymes?.find((p) => String(p.id) === String(filtroPymeId));
  const puedeVender = !!filtroPymeId && puede(pymeFiltrada?.miRoles, 'crearVentas');
  const puedeGestionarProductos = !!filtroPymeId && puede(pymeFiltrada?.miRoles, 'gestionarProductos');
  const sedes = useAsync(
    () => (filtroPymeId ? pymesApi.sedes.list(filtroPymeId) : Promise.resolve({ sedes: [] })),
    [filtroPymeId]
  );
  const productos = useAsync(
    () => productosApi.list({ ...(filtroPymeId ? { pymeId: filtroPymeId } : {}), ...(filtroSedeId ? { sedeId: filtroSedeId } : {}) }),
    [filtroPymeId, filtroSedeId]
  );
  const facturas = useAsync(
    () => {
      const desde = new Date();
      desde.setDate(desde.getDate() - 7);
      return facturasApi.list({
        desde: desde.toISOString(),
        ...(filtroPymeId ? { pymeId: filtroPymeId } : {}),
        ...(filtroSedeId ? { sedeId: filtroSedeId } : {}),
      });
    },
    [filtroPymeId, filtroSedeId]
  );

  const toggleFactura = (id) => {
    setFacturasExpandidas((actual) => {
      const copia = new Set(actual);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  };

  // La PYME se elige desde el switcher del rail (Layout.jsx), no acá — al
  // cambiar, un carrito/form armado contra la PYME anterior ya no aplica
  // (productos de otra PYME, otro pymeId de destino para la factura).
  useEffect(() => {
    setFiltroSedeId('');
    setForm({ productoId: '', cantidad: 1, precioUnitario: '', presentacion: 'UNIDAD' });
    setCarrito([]);
  }, [filtroPymeId]);

  const focusScan = () => {
    // el foco vuelve solo al campo de escaneo tras cada lectura/acción, para
    // no requerir clic entre ítems escaneados con la pistola.
    requestAnimationFrame(() => scanInputRef.current?.focus());
  };

  const factorCajaDe = (producto) =>
    Number(producto.unidadesPorCaja) >= 2 ? Number(producto.unidadesPorCaja) : null;

  // Agrega una línea al carrito, o incrementa su cantidad si esa MISMA
  // presentación del producto ya estaba. El stock se valida en unidades base
  // sumando todas las presentaciones del producto (1 caja + 5 sueltas de un
  // producto con 8 en stock no puede pasar).
  const agregarLinea = (producto, cantidadAgregar, presentacion = 'UNIDAD', precioOverride = null) => {
    const stockActual = producto.inventario?.stockActual;
    const tieneStock = typeof stockActual === 'number';
    const factorCaja = factorCajaDe(producto);
    const esCaja = presentacion === 'CAJA' && !!factorCaja;
    const factor = esCaja ? factorCaja : 1;
    const key = `${producto.id}-${esCaja ? 'CAJA' : 'UNIDAD'}`;
    const precio =
      precioOverride !== null && precioOverride !== '' && Number.isFinite(Number(precioOverride))
        ? Number(precioOverride)
        : esCaja
        ? producto.precioCaja ?? producto.precioVenta * factor
        : producto.precioVenta;

    setCarrito((actual) => {
      const baseOtras = actual
        .filter((l) => l.productoId === producto.id && l.key !== key)
        .reduce((acc, l) => acc + l.cantidad * l.factor, 0);
      const idx = actual.findIndex((l) => l.key === key);
      const cantidadActual = idx >= 0 ? actual[idx].cantidad : 0;
      const nuevaCantidad = cantidadActual + cantidadAgregar;

      if (tieneStock && baseOtras + nuevaCantidad * factor > stockActual) {
        setScanError(`Stock insuficiente: quedan ${stockActual} unidades de ${producto.nombre}`);
        return actual;
      }

      if (idx >= 0) {
        const copia = [...actual];
        copia[idx] = { ...copia[idx], cantidad: nuevaCantidad };
        return copia;
      }

      return [
        ...actual,
        {
          key,
          productoId: producto.id,
          nombre: producto.nombre,
          codigo: esCaja ? producto.codigoCaja || producto.codigo : producto.codigo,
          presentacion: esCaja ? 'CAJA' : 'UNIDAD',
          factor,
          cantidad: cantidadAgregar,
          precioUnitario: precio,
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

    const producto = productos.data?.productos?.find(
      (p) => p.codigo === codigo || p.codigoCaja === codigo
    );
    if (!producto) {
      setScanError(`Código no reconocido: ${codigo}`);
      setCodigoSinAsignar(codigo);
      return;
    }

    setScanError(null);
    setCodigoSinAsignar(null);
    setSuccess(null);
    setVentaConfirmada(null);
    const esCaja = producto.codigoCaja === codigo && Number(producto.unidadesPorCaja) >= 2;
    agregarLinea(producto, 1, esCaja ? 'CAJA' : 'UNIDAD');
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

  const actualizarCantidad = (key, delta) => {
    setCarrito((actual) => {
      const linea = actual.find((l) => l.key === key);
      if (!linea) return actual;
      const nueva = linea.cantidad + delta;
      if (nueva < 1) return actual;
      if (typeof linea.stockActual === 'number') {
        const baseOtras = actual
          .filter((l) => l.productoId === linea.productoId && l.key !== key)
          .reduce((acc, l) => acc + l.cantidad * l.factor, 0);
        if (baseOtras + nueva * linea.factor > linea.stockActual) return actual;
      }
      return actual.map((l) => (l.key === key ? { ...l, cantidad: nueva } : l));
    });
  };

  const quitarLinea = (key) => {
    setCarrito((actual) => actual.filter((l) => l.key !== key));
  };

  const precioSugeridoPara = (producto, presentacion) => {
    if (!producto) return '';
    const factor = factorCajaDe(producto);
    if (presentacion === 'CAJA' && factor) return producto.precioCaja ?? producto.precioVenta * factor;
    return producto.precioVenta;
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    if (name === 'productoId') {
      const prod = productos.data?.productos?.find((p) => String(p.id) === value);
      setForm({ ...form, productoId: value, presentacion: 'UNIDAD', precioUnitario: precioSugeridoPara(prod, 'UNIDAD') || '' });
    } else if (name === 'presentacion') {
      const prod = productos.data?.productos?.find((p) => String(p.id) === form.productoId);
      setForm({ ...form, presentacion: value, precioUnitario: precioSugeridoPara(prod, value) || '' });
    } else {
      setForm({ ...form, [name]: name === 'cantidad' ? Number(value) : value });
    }
  };

  const handleAgregarManual = (e) => {
    e.preventDefault();
    const producto = productos.data?.productos?.find((p) => String(p.id) === form.productoId);
    if (!producto) return;

    agregarLinea(producto, Number(form.cantidad) || 1, form.presentacion, form.precioUnitario);
    setForm({ productoId: '', cantidad: 1, precioUnitario: '', presentacion: 'UNIDAD' });
  };

  const totalCarrito = carrito.reduce((acc, l) => acc + l.cantidad * l.precioUnitario, 0);
  const vuelto = montoRecibido === '' ? null : Number(montoRecibido) - totalCarrito;

  const confirmarVenta = async () => {
    if (confirmando || carrito.length === 0 || montoRecibido === '' || vuelto < 0) return;
    setConfirmando(true);
    setActionError(null);
    setSuccess(null);
    setVentaConfirmada(null);

    try {
      const res = await facturasApi.create({
        lineas: carrito.map((l) => ({
          productoId: l.productoId,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          presentacion: l.presentacion,
        })),
        ...(montoRecibido !== '' ? { montoRecibido: Number(montoRecibido) } : {}),
      });
      setVentaConfirmada({ id: res?.factura?.id ?? null, total: res?.factura?.total ?? totalCarrito });
      setFacturaNuevaId(res?.factura?.id ?? null);
      setCarrito([]);
      setMontoRecibido('');
      facturas.run();
      productos.run(); // el stock mostrado (carrito, gauge) debe reflejar la venta recién hecha
    } catch (err) {
      setActionError(err.message);
    } finally {
      setConfirmando(false);
      focusScan();
    }
  };

  const productoSeleccionado = productos.data?.productos?.find((p) => String(p.id) === form.productoId);
  const factorCajaSeleccionado = productoSeleccionado ? factorCajaDe(productoSeleccionado) : null;
  const manualEsCaja = form.presentacion === 'CAJA' && !!factorCajaSeleccionado;
  const factorManual = manualEsCaja ? factorCajaSeleccionado : 1;
  const stockActual = productoSeleccionado?.inventario?.stockActual;
  const tieneStock = typeof stockActual === 'number';
  const baseAgregar = Number(form.cantidad || 0) * factorManual;
  const stockRestante = tieneStock ? Math.max(0, stockActual - baseAgregar) : 0;
  const stockPct = tieneStock && stockActual > 0 ? Math.max(0, Math.min(100, (stockRestante / stockActual) * 100)) : 0;
  const stockTone = stockPct <= 15 ? 'danger' : stockPct <= 40 ? 'warning' : 'ok';

  useWheelStep(cantidadInputRef, 1, (delta) => {
    setForm((f) => {
      const max = tieneStock ? Math.floor(stockActual / factorManual) : Infinity;
      return { ...f, cantidad: Math.min(max, Math.max(1, Number(f.cantidad || 0) + delta)) };
    });
  });

  useWheelStep(precioInputRef, 0.01, (delta) => {
    setForm((f) => ({ ...f, precioUnitario: Math.max(0, Math.round((Number(f.precioUnitario || 0) + delta) * 100) / 100) }));
  });

  useWheelStep(montoRecibidoInputRef, 0.01, (delta) => {
    setMontoRecibido((v) => {
      const actual = v === '' ? 0 : Number(v);
      return String(Math.max(0, Math.round((actual + delta) * 100) / 100));
    });
  });

  // Mismo criterio que el resto de la app (ver Inventario.jsx): un spinner
  // de página completa mientras carga lo esencial, para no confundir "todavía
  // está cargando" con "no hay nada" (el EmptyState de abajo se ve idéntico).
  if (pymes.loading || productos.loading || facturas.loading) {
    return <Spinner label="Cargando ventas..." />;
  }
  if (productos.error) return <ErrorBox error={productos.error} />;
  if (facturas.error) return <ErrorBox error={facturas.error} />;

  return (
    <div data-impeccable-seed="ventasredesign1">
      <PageHeader
        title="Registrar venta"
        subtitle="Escaneá o agregá productos al carrito; cada venta actualiza el inventario y alimenta el modelo de predicción."
        actions={
          filtroPymeId && (sedes.data?.sedes?.length ?? 0) > 1 && (
            <select value={filtroSedeId} onChange={(e) => setFiltroSedeId(e.target.value)}>
              <option value="">Todas las sedes</option>
              {sedes.data.sedes.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          )
        }
      />

      <div className={puedeVender ? 'venta-pos' : undefined}>
        {!filtroPymeId && pymesConVenta.length > 1 && (
          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            Elegí una PYME puntual en el selector de la izquierda para poder vender — con "Todas mis PYMES" solo se muestra el historial.
          </div>
        )}
        {puedeVender && (
        <div className="venta-pos-main">
          <div className="venta-scan-deck">
            <div className="venta-scan-deck-head">
              <h2 className="venta-scan-deck-title">Escanear producto</h2>
              <Button
                type="button"
                variant={camaraAbierta ? 'accent' : 'outline'}
                aria-pressed={camaraAbierta}
                onClick={() => { setScanError(null); setCamaraAbierta((v) => !v); }}
              >
                <IconCamera size={16} aria-hidden="true" /> {camaraAbierta ? 'Cerrar cámara' : 'Cámara'}
              </Button>
            </div>

            <div className="form-group">
              <label htmlFor="scanInput">Código de barras</label>
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
                      variant="outline"
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

            <details className="venta-manual-add">
              <summary>Agregar manualmente</summary>
              <div className="venta-manual-add-body">
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

                {factorCajaSeleccionado && (
                  <div className="form-group">
                    <label htmlFor="presentacion">Presentación</label>
                    <select id="presentacion" name="presentacion" value={form.presentacion} onChange={handleFormChange}>
                      <option value="UNIDAD">Unidad</option>
                      <option value="CAJA">Caja ({factorCajaSeleccionado} unidades)</option>
                    </select>
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="cantidad">{manualEsCaja ? 'Cajas' : 'Cantidad'}</label>
                    <input
                      id="cantidad"
                      name="cantidad"
                      type="number"
                      min="1"
                      max={tieneStock ? Math.floor(stockActual / factorManual) : undefined}
                      value={form.cantidad}
                      onChange={handleFormChange}
                      ref={cantidadInputRef}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="precioUnitario">Precio {manualEsCaja ? 'por caja' : 'unitario'} (COP)</label>
                    <input id="precioUnitario" name="precioUnitario" type="number" min="0" step="0.01" value={form.precioUnitario} onChange={handleFormChange} ref={precioInputRef} />
                  </div>
                </div>

                {tieneStock && (
                  <div className={`venta-stock-gauge${stockTone !== 'ok' ? ` venta-stock-gauge-${stockTone}` : ''}`}>
                    <div className="venta-stock-gauge-track" role="progressbar" aria-label="Stock restante tras agregar" aria-valuenow={stockRestante} aria-valuemin={0} aria-valuemax={stockActual}>
                      <div className="venta-stock-gauge-fill" style={{ transform: `scaleX(${stockPct / 100})` }} />
                    </div>
                    <div className="venta-stock-gauge-label">
                      <span>Quedan {stockRestante} uds tras agregar{manualEsCaja ? ` (${form.cantidad || 0} caja${Number(form.cantidad) === 1 ? '' : 's'} = ${baseAgregar} u)` : ''}</span>
                      <span>{stockActual} en stock</span>
                    </div>
                  </div>
                )}

                <Button type="button" variant="outline" className="btn-block" onClick={handleAgregarManual} disabled={!form.productoId}>
                  Agregar al carrito
                </Button>
              </div>
            </details>
          </div>

          <div className="venta-cart-tape">
            <ErrorBox error={actionError} />
            {success && <div className="alert alert-success">{success}</div>}
            {ventaConfirmada && (
              <div className="venta-receipt-confirm" role="status">
                <span className="venta-receipt-stamp" aria-hidden="true"><IconCheck size={16} /></span>
                <div className="venta-receipt-body">
                  <strong className="venta-receipt-title">
                    Venta registrada{ventaConfirmada.id ? ` · N.º ${ventaConfirmada.id}` : ''}
                  </strong>
                  <span className="venta-receipt-monto">{money(ventaConfirmada.total)}</span>
                  <ul className="venta-receipt-checklist">
                    <li><IconCheck size={12} aria-hidden="true" /> Stock actualizado</li>
                    <li><IconCheck size={12} aria-hidden="true" /> Predicción programada</li>
                  </ul>
                </div>
              </div>
            )}

            {carrito.length === 0 ? (
              <EmptyState className="empty--compact" title="Carrito vacío" message="Escaneá un código o agregá un producto manualmente." />
            ) : (
              <ul className="list-card venta-carrito-lista list-card-preview">
                {carrito.map((l) => {
                  const esCaja = l.presentacion === 'CAJA';
                  const unidadLabel = esCaja ? 'caja' : 'unidad';
                  return (
                  <li key={l.key} className="rank-item venta-carrito-linea">
                    <div className="rank-info">
                      <strong>
                        {l.nombre}
                        {esCaja && <span className="badge badge-default" style={{ marginLeft: 6 }}>caja × {l.factor}</span>}
                      </strong>
                      <small>
                        {money(l.precioUnitario)} / {esCaja ? 'caja' : 'u'}
                        {esCaja ? ` · ${l.cantidad * l.factor} u` : ''}
                        {l.codigo ? ` · ${l.codigo}` : ''}
                      </small>
                    </div>
                    <div className="venta-carrito-cantidad">
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => actualizarCantidad(l.key, -1)} aria-label={`Quitar una ${unidadLabel} de ${l.nombre}`}><IconMinus size={14} aria-hidden="true" /></button>
                      <span>{l.cantidad}</span>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => actualizarCantidad(l.key, 1)} aria-label={`Agregar una ${unidadLabel} de ${l.nombre}`}><IconPlus size={14} aria-hidden="true" /></button>
                    </div>
                    <div className="dashboard-rank-metric">
                      <strong>{money(l.cantidad * l.precioUnitario)}</strong>
                    </div>
                    <button type="button" className="venta-carrito-quitar" onClick={() => quitarLinea(l.key)} aria-label={`Quitar ${l.nombre} del carrito`}><IconClose size={14} aria-hidden="true" /></button>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="venta-checkout-bar">
            <div className="venta-checkout-cash">
              <div className="form-group venta-checkout-cash-input">
                <label htmlFor="montoRecibido">Pagó con</label>
                <input
                  id="montoRecibido"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={montoRecibido}
                  onChange={(e) => setMontoRecibido(e.target.value)}
                  ref={montoRecibidoInputRef}
                />
                {montoRecibido === '' && carrito.length > 0 && (
                  <small className="venta-checkout-cash-hint">Cargá con cuánto pagó para poder confirmar</small>
                )}
              </div>
              <div className={`venta-checkout-vuelto${vuelto !== null && vuelto < 0 ? ' venta-checkout-vuelto-falta' : ''}`}>
                <span>Vuelto</span>
                <strong>{vuelto !== null ? money(Math.max(vuelto, 0)) : '—'}</strong>
                {vuelto !== null && vuelto < 0 && <small>Faltan {money(Math.abs(vuelto))}</small>}
              </div>
            </div>

            <div className="venta-checkout-row">
              <div className="venta-checkout-total">
                <span className="venta-checkout-total-label">Total a cobrar</span>
                <strong key={totalCarrito} className="venta-checkout-total-value">{money(totalCarrito)}</strong>
              </div>
              <Button
                type="button"
                variant="accent"
                loading={confirmando}
                className="venta-checkout-confirm"
                disabled={carrito.length === 0 || montoRecibido === '' || vuelto < 0}
                aria-busy={confirmando}
                aria-label={
                  confirmando
                    ? 'Registrando venta...'
                    : montoRecibido === ''
                    ? 'Cargá con cuánto pagó el cliente para confirmar la venta'
                    : vuelto < 0
                    ? 'El monto pagado no alcanza para cubrir el total'
                    : 'Confirmar venta'
                }
                onClick={confirmarVenta}
              >
                Confirmar venta
              </Button>
            </div>
          </div>
        </div>
        )}

        <div className={puedeVender ? 'venta-pos-recientes' : 'card'}>
          <div className={puedeVender ? 'venta-pos-recientes-head' : 'card-title'}>Ventas recientes</div>

          <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
            {!facturas.data?.facturas?.length ? (
              <EmptyState title="Sin ventas" message="Registra tu primera venta." />
            ) : (
              <ul className="list-card">
                {facturas.data.facturas.slice(0, 200).map((f, i) => {
                  const expandida = facturasExpandidas.has(f.id);
                  const cantidadProductos = f.ventas.length;
                  const esExpandible = cantidadProductos > 1;
                  return (
                    <li
                      key={f.id}
                      className={`rank-item venta-factura-item animate-slide-in-right${f.id === facturaNuevaId ? ' venta-feed-item-new' : ''}`}
                      style={{ animationDelay: `${Math.min(i, 6) * 40}ms`, cursor: esExpandible ? 'pointer' : 'default' }}
                      onClick={esExpandible ? () => toggleFactura(f.id) : undefined}
                      onKeyDown={esExpandible ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleFactura(f.id);
                        }
                      } : undefined}
                      role={esExpandible ? 'button' : undefined}
                      tabIndex={esExpandible ? 0 : undefined}
                      aria-expanded={esExpandible ? expandida : undefined}
                    >
                      <div className="venta-factura-row">
                        <div className="rank-info">
                          <strong className="venta-factura-titulo">
                            {esExpandible ? `${cantidadProductos} productos` : f.ventas[0]?.producto.nombre}
                            {esExpandible && (
                              <IconChevronRight
                                size={14}
                                aria-hidden="true"
                                className={`venta-factura-chevron${expandida ? ' venta-factura-chevron-abierto' : ''}`}
                              />
                            )}
                          </strong>
                          <small>{date(f.fecha)} · {f.ventas.reduce((acc, v) => acc + v.cantidad * (v.factorPresentacion ?? 1), 0)} uds</small>
                        </div>
                        <div className="dashboard-rank-metric">
                          <strong>{money(f.total)}</strong>
                          {typeof f.montoRecibido === 'number' && (
                            <small>Pagó {money(f.montoRecibido)} · Vuelto {money(Math.max(f.montoRecibido - f.total, 0))}</small>
                          )}
                        </div>
                      </div>

                      {cantidadProductos > 1 && expandida && (
                        <ul className="venta-factura-detalle">
                          {f.ventas.map((v) => (
                            <li key={v.id}>
                              <span>
                                {v.producto.nombre} × {v.cantidad}
                                {v.presentacion === 'CAJA' ? ` caja${v.cantidad === 1 ? '' : 's'} (${v.cantidad * (v.factorPresentacion ?? 1)} u)` : ''}
                              </span>
                              <span>{money(v.total)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
