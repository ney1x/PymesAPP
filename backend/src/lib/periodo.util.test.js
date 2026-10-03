const test = require('node:test');
const assert = require('node:assert/strict');
const { resolverRango } = require('./periodo.util');

const hoy = new Date();

test('por defecto: este mes desde el día 1', () => {
  const r = resolverRango();
  assert.equal(r.etiqueta, 'Este mes');
  assert.equal(r.desde.getDate(), 1);
  assert.equal(r.desde.getMonth(), hoy.getMonth());
});

test('mes-pasado: del 1 al último día del mes anterior', () => {
  const r = resolverRango({ rango: 'mes-pasado' });
  const esperadoFin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
  assert.equal(r.etiqueta, 'Mes pasado');
  assert.equal(r.desde.getDate(), 1);
  assert.equal(r.hasta.getDate(), esperadoFin.getDate());
  assert.equal(r.hasta.getHours(), 23);
});

test('trimestre y año retroceden 2 y 11 meses', () => {
  const t = resolverRango({ rango: 'trimestre' });
  const a = resolverRango({ rango: 'anio' });
  assert.equal(t.desde.getTime(), new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1).getTime());
  assert.equal(a.desde.getTime(), new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1).getTime());
});

test('desde/hasta explícitos ganan sobre el preset', () => {
  const r = resolverRango({ rango: 'anio', desde: '2026-01-01', hasta: '2026-01-31' });
  assert.equal(r.etiqueta, 'Período personalizado');
  assert.equal(r.desde.toISOString().slice(0, 10), '2026-01-01');
  assert.equal(r.hasta.toISOString().slice(0, 10), '2026-01-31');
});

test('rango desconocido cae a este mes', () => {
  assert.equal(resolverRango({ rango: 'xyz' }).etiqueta, 'Este mes');
});
