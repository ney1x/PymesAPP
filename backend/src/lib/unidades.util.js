/**
 * Unidades de venta a granel.
 *
 * El stock (`inventario.stockActual`) y `venta.cantidad` de un producto
 * granel se guardan SIEMPRE en la unidad base — gramos para peso,
 * mililitros para volumen — como entero. `producto.unidadVenta` es solo la
 * unidad en la que el comerciante piensa el precio y teclea las cantidades;
 * la conversión a unidad base es puramente de presentación/entrada.
 *
 * `libra` = 500 g (como se usa en la tienda de barrio, no la libra de
 * 453,592 g). `onza` = 500/16 = 31,25 g para que "libra y 4 onzas" = 625 g
 * exactos.
 */

const GRAMOS_POR = { kg: 1000, lb: 500, oz: 31.25, g: 1 };
const ML_POR = { L: 1000, ml: 1 };

const UNIDADES_PESO = Object.keys(GRAMOS_POR); // ['kg','lb','oz','g']
const UNIDADES_VOLUMEN = Object.keys(ML_POR); // ['L','ml']
const UNIDADES_GRANEL = [...UNIDADES_PESO, ...UNIDADES_VOLUMEN];

const FACTOR_BASE = { ...GRAMOS_POR, ...ML_POR };

// Múltiplo al que se redondea el total de una venta a granel POR MEDIDA
// (la venta por importe cobra exacto lo que teclea el cajero).
const REDONDEO_GRANEL = 50;

const esUnidadGranel = (u) => UNIDADES_GRANEL.includes(u);
const dimensionDe = (u) =>
  ML_POR[u] !== undefined ? 'VOLUMEN' : GRAMOS_POR[u] !== undefined ? 'PESO' : null;
const unidadBaseDe = (u) => (dimensionDe(u) === 'VOLUMEN' ? 'ml' : 'g');

// Cuántas unidades base (g / ml) vale 1 `unidad`.
const factorBase = (unidad) => FACTOR_BASE[unidad] ?? null;

// unidad base (g/ml, entero) -> texto legible en `unidadVenta`: 750 -> "1,5 lb"
const formatDesdeBase = (base, unidadVenta, { conUnidad = true } = {}) => {
  const f = factorBase(unidadVenta);
  if (!f || base == null) return String(base ?? '—');
  const v = base / f;
  const txt = (Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, '')).replace('.', ',');
  return conUnidad ? `${txt} ${unidadVenta}` : txt;
};

module.exports = {
  GRAMOS_POR,
  ML_POR,
  UNIDADES_PESO,
  UNIDADES_VOLUMEN,
  UNIDADES_GRANEL,
  FACTOR_BASE,
  REDONDEO_GRANEL,
  esUnidadGranel,
  dimensionDe,
  unidadBaseDe,
  factorBase,
  formatDesdeBase,
};
