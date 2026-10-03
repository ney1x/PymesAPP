const test = require('node:test');
const assert = require('node:assert/strict');
const u = require('./unidades.util');

test('factorBase: conversiones fijas a unidad base', () => {
  assert.equal(u.factorBase('kg'), 1000);
  assert.equal(u.factorBase('lb'), 500); // libra de tienda, no 453,592 g
  assert.equal(u.factorBase('oz'), 31.25);
  assert.equal(u.factorBase('L'), 1000);
  assert.equal(u.factorBase('ml'), 1);
  assert.equal(u.factorBase('caja'), null);
});

test('libra y 4 onzas = 625 g exactos', () => {
  assert.equal(u.factorBase('lb') + 4 * u.factorBase('oz'), 625);
});

test('dimensionDe / unidadBaseDe distinguen peso y volumen', () => {
  assert.equal(u.dimensionDe('kg'), 'PESO');
  assert.equal(u.dimensionDe('L'), 'VOLUMEN');
  assert.equal(u.dimensionDe('xyz'), null);
  assert.equal(u.unidadBaseDe('lb'), 'g');
  assert.equal(u.unidadBaseDe('ml'), 'ml');
});

test('esUnidadGranel', () => {
  for (const x of ['kg', 'lb', 'oz', 'g', 'L', 'ml']) assert.ok(u.esUnidadGranel(x));
  assert.equal(u.esUnidadGranel('unidad'), false);
});

test('formatDesdeBase: texto legible con coma decimal', () => {
  assert.equal(u.formatDesdeBase(750, 'lb'), '1,5 lb');
  assert.equal(u.formatDesdeBase(1000, 'kg'), '1 kg');
  assert.equal(u.formatDesdeBase(625, 'lb', { conUnidad: false }), '1,25');
  assert.equal(u.formatDesdeBase(333, 'kg'), '0,333 kg');
});

test('formatDesdeBase: valores inválidos no revientan', () => {
  assert.equal(u.formatDesdeBase(null, 'kg'), '—');
  assert.equal(u.formatDesdeBase(500, 'caja'), '500');
});
