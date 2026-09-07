// Presets de período compartidos entre el panel de Contabilidad y el listado
// de Gastos, para que `?rango=este-mes` signifique exactamente lo mismo en
// ambos endpoints. `desde`/`hasta` explícitos (ISO) siempre ganan.

const ETIQUETAS = {
  'este-mes': 'Este mes',
  'mes-pasado': 'Mes pasado',
  trimestre: 'Últimos 3 meses',
  anio: 'Últimos 12 meses',
};

function resolverRango({ rango, desde, hasta } = {}) {
  const hoy = new Date();
  let desdeD;
  let hastaD = hasta ? new Date(hasta) : new Date();

  if (desde) {
    desdeD = new Date(desde);
    if (!hasta) hastaD = new Date();
  } else if (rango === 'mes-pasado') {
    desdeD = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    hastaD = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59, 999);
  } else if (rango === 'trimestre') {
    desdeD = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);
  } else if (rango === 'anio') {
    desdeD = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1);
  } else {
    desdeD = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  }

  const etiqueta = desde
    ? 'Período personalizado'
    : ETIQUETAS[rango] || ETIQUETAS['este-mes'];

  return { desde: desdeD, hasta: hastaD, etiqueta };
}

module.exports = { resolverRango, ETIQUETAS };
