// Unidades de venta a granel. Espejo de backend/src/lib/unidades.util.js.
//
// El stock y `venta.cantidad` de un producto granel viven SIEMPRE en la
// unidad base (gramos para peso, mililitros para volumen), como entero.
// `producto.unidadVenta` es solo la unidad en la que el comerciante piensa
// el precio y teclea las cantidades.
//
// libra = 500 g (la de la tienda, no la de 453,592 g). onza = 500/16 = 31,25 g.

export const GRAMOS_POR = { kg: 1000, lb: 500, oz: 31.25, g: 1 };
export const ML_POR = { L: 1000, ml: 1 };
export const FACTOR_BASE = { ...GRAMOS_POR, ...ML_POR };

export const UNIDADES_PESO = Object.keys(GRAMOS_POR); // ['kg','lb','oz','g']
export const UNIDADES_VOLUMEN = Object.keys(ML_POR); // ['L','ml']
export const UNIDADES_GRANEL = [...UNIDADES_PESO, ...UNIDADES_VOLUMEN];

// Múltiplo al que se redondea el total de una venta a granel POR MEDIDA.
export const REDONDEO_GRANEL = 50;

export const ETIQUETA_UNIDAD = {
  kg: 'kilo', lb: 'libra', oz: 'onza', g: 'gramo', L: 'litro', ml: 'mililitro',
};

// Cómo se vende el producto, en texto corto para etiquetas y avisos:
// "por unidad" / "por libra" / "por litro"…
export const modoVentaTexto = (producto) =>
  producto?.granel && producto?.unidadVenta
    ? `por ${ETIQUETA_UNIDAD[producto.unidadVenta] || producto.unidadVenta}`
    : 'por unidad';

export const esVolumen = (u) => u in ML_POR;
export const dimensionDe = (u) => (u in ML_POR ? 'VOLUMEN' : u in GRAMOS_POR ? 'PESO' : null);
export const unidadBaseDe = (u) => (esVolumen(u) ? 'ml' : 'g');
export const factorBase = (u) => FACTOR_BASE[u] ?? null;

// Unidades que el cajero puede usar para teclear una medida de un producto
// cuya unidad de venta es `unidadVenta` (misma dimensión).
export const unidadesCompatibles = (unidadVenta) =>
  (dimensionDe(unidadVenta) === 'VOLUMEN' ? UNIDADES_VOLUMEN : UNIDADES_PESO);

// $ por unidad base (g/ml), a partir del precio por `unidadVenta`.
export const precioPorBase = (precioVenta, unidadVenta) => {
  const f = factorBase(unidadVenta);
  return f ? precioVenta / f : precioVenta;
};

// valor en `unidad` -> unidad base (g/ml), entero
export const aBase = (valorEnUnidad, unidad) => {
  const f = factorBase(unidad);
  const n = Number(valorEnUnidad);
  return f && Number.isFinite(n) ? Math.round(n * f) : null;
};

// unidad base (g/ml, entero) -> texto legible: 750 -> "1,5 lb"
export function formatDesdeBase(base, unidadVenta, { conUnidad = true, maxDecimales = 3 } = {}) {
  const f = factorBase(unidadVenta);
  if (!f || base == null || Number.isNaN(Number(base))) return '—';
  const v = base / f;
  const txt = (Number.isInteger(v) ? String(v) : Number(v.toFixed(maxDecimales)).toString()).replace('.', ',');
  return conUnidad ? `${txt} ${unidadVenta}` : txt;
}

// Resuelve una línea de carrito a granel en el front (mismo cálculo que
// backend/src/services/facturas.service.js resolverLineaGranel) para la
// vista previa en vivo y la validación de stock antes de confirmar.
export function calcularGranel({ modo, valor, unidad, unidadVenta, precioVenta }) {
  const v = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) return { base: 0, total: 0, invalido: true };

  const precioBase = precioPorBase(precioVenta, unidadVenta);
  if (modo === 'IMPORTE') {
    const total = Math.round(v);
    return { base: Math.max(1, Math.round(v / precioBase)), total };
  }

  const unidadEntrada =
    unidad && dimensionDe(unidad) === dimensionDe(unidadVenta) ? unidad : unidadVenta;
  const base = Math.max(1, aBase(v, unidadEntrada));
  const total = Math.round((base * precioBase) / REDONDEO_GRANEL) * REDONDEO_GRANEL;
  return { base, total };
}
