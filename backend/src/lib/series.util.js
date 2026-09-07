// Primitivas puras para agrupar registros con fecha en series temporales
// (día / semana / mes). Compartidas entre dashboard.service.js (ventas por
// rango rodante) y contabilidad.service.js (ingresos vs. egresos por rango
// de fechas arbitrario). Sin dependencias — solo aritmética de fechas en UTC.

const DIA_MS = 24 * 60 * 60 * 1000;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const claveDiaUTC = (f) => f.toISOString().slice(0, 10);
const claveMesUTC = (f) => f.toISOString().slice(0, 7);

// Lunes (00:00 UTC) de la semana que contiene `f`.
const lunesUTC = (f) => {
  const d = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // 0 = lunes
  return d;
};

const etiquetaDia = (f) => `${String(f.getUTCDate()).padStart(2, '0')} ${MESES[f.getUTCMonth()]}`;

/**
 * Agrupa `registros` ({ fecha: Date, ...campos numéricos }) en buckets
 * temporales entre `desde` y `hasta`. La granularidad se elige por el ancho
 * del rango: días (<= 45), semanas (<= 180) o meses. Cada bucket devuelve la
 * suma de cada campo listado en `campos` (default: ['ingresos', 'egresos']).
 * Los buckets sin registros se rellenan en cero para que la gráfica no tenga
 * huecos.
 */
function agruparPorPeriodo(registros, desde, hasta, campos = ['ingresos', 'egresos']) {
  const spanDias = Math.max(1, Math.round((hasta - desde) / DIA_MS));
  const granularidad = spanDias <= 45 ? 'dia' : spanDias <= 180 ? 'semana' : 'mes';

  const claveDe = (fecha) => {
    if (granularidad === 'dia') return claveDiaUTC(fecha);
    if (granularidad === 'semana') return claveDiaUTC(lunesUTC(fecha));
    return claveMesUTC(fecha);
  };

  const vacio = () => Object.fromEntries(campos.map((c) => [c, 0]));
  const acum = new Map();
  for (const r of registros) {
    const k = claveDe(new Date(r.fecha));
    const cur = acum.get(k) || vacio();
    for (const c of campos) cur[c] += Number(r[c]) || 0;
    acum.set(k, cur);
  }

  // Esqueleto de buckets contiguos entre desde y hasta.
  const buckets = [];
  const cursor = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()));
  const fin = new Date(hasta.getTime());
  if (granularidad === 'semana') cursor.setTime(lunesUTC(cursor).getTime());
  if (granularidad === 'mes') cursor.setUTCDate(1);

  let guard = 0;
  while (cursor <= fin && guard++ < 400) {
    const key = claveDe(cursor);
    const label =
      granularidad === 'mes'
        ? `${MESES[cursor.getUTCMonth()]} ${String(cursor.getUTCFullYear()).slice(2)}`
        : etiquetaDia(cursor);
    buckets.push({ key, label, ...(acum.get(key) || vacio()) });

    if (granularidad === 'dia') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (granularidad === 'semana') cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return { granularidad, buckets };
}

module.exports = {
  DIA_MS,
  MESES,
  claveDiaUTC,
  claveMesUTC,
  lunesUTC,
  etiquetaDia,
  agruparPorPeriodo,
};
