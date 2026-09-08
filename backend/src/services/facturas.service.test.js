const test = require('node:test');
const assert = require('node:assert/strict');
const { resolverLineaPresentacion } = require('./facturas.service');

// --- Producto por unidad (comportamiento existente) ---
const arroz = { id: 1, nombre: 'Arroz 1kg', precioVenta: 4500, costo: 3200 };

test('unidad: cantidad y total directos', () => {
  const r = resolverLineaPresentacion(arroz, { cantidad: 3, precioUnitario: 4500, presentacion: 'UNIDAD' });
  assert.equal(r.presentacion, 'UNIDAD');
  assert.equal(r.cantidad, 3);
  assert.equal(r.unidadesBase, 3);
  assert.equal(r.total, 13500);
});

test('unidad: cantidad inválida es rechazada', () => {
  assert.throws(() => resolverLineaPresentacion(arroz, { cantidad: 0 }), /Cantidad inválida/);
});

// --- Caja (comportamiento existente) ---
const gaseosa = { id: 2, nombre: 'Gaseosa', precioVenta: 3000, costo: 2000, unidadesPorCaja: 12, precioCaja: 32000, costoCaja: 22000 };

test('caja: descuenta factor unidades y usa precio de caja', () => {
  const r = resolverLineaPresentacion(gaseosa, { cantidad: 2, presentacion: 'CAJA' });
  assert.equal(r.presentacion, 'CAJA');
  assert.equal(r.factor, 12);
  assert.equal(r.unidadesBase, 24);
  assert.equal(r.precioUnitario, 32000);
  assert.equal(r.total, 64000);
});

// --- Granel por peso ---
const arrozGranel = { id: 3, nombre: 'Arroz a granel', precioVenta: 2800, costo: 2100, granel: true, unidadVenta: 'lb' };

test('granel/medida: libra y media descuenta 750 g y cobra por peso (redondeo $50)', () => {
  const r = resolverLineaPresentacion(arrozGranel, { presentacion: 'GRANEL', granel: { modo: 'MEDIDA', valor: 1.5, unidad: 'lb' } });
  assert.equal(r.presentacion, 'GRANEL');
  assert.equal(r.factor, 1);
  assert.equal(r.cantidad, 750); // 1.5 lb * 500 g
  assert.equal(r.unidadesBase, 750);
  assert.equal(r.precioUnitario, 2800 / 500); // $ por gramo
  assert.equal(r.total, 4200); // 750 * 5.6 = 4200
});

test('granel/medida: el cajero puede teclear en otra unidad de la misma dimensión', () => {
  // producto por libra, cajero teclea 250 g
  const r = resolverLineaPresentacion(arrozGranel, { presentacion: 'GRANEL', granel: { modo: 'MEDIDA', valor: 250, unidad: 'g' } });
  assert.equal(r.cantidad, 250);
  assert.equal(r.total, 1400); // 250 * 5.6
});

test('granel/medida: unidad incompatible cae a la del producto', () => {
  const r = resolverLineaPresentacion(arrozGranel, { presentacion: 'GRANEL', granel: { modo: 'MEDIDA', valor: 1, unidad: 'ml' } });
  assert.equal(r.cantidad, 500); // interpretado como 1 lb
});

test('granel/importe: "$2000 de arroz" cobra exacto y deriva el peso', () => {
  const r = resolverLineaPresentacion(arrozGranel, { presentacion: 'GRANEL', granel: { modo: 'IMPORTE', valor: 2000 } });
  assert.equal(r.total, 2000);
  assert.equal(r.cantidad, Math.round(2000 / (2800 / 500))); // 357 g
});

test('granel/importe con precio no divisible: total exacto, peso redondeado', () => {
  const pollo = { id: 4, nombre: 'Pollo', precioVenta: 6000, costo: 4800, granel: true, unidadVenta: 'kg' };
  const r = resolverLineaPresentacion(pollo, { presentacion: 'GRANEL', granel: { modo: 'IMPORTE', valor: 1000 } });
  assert.equal(r.total, 1000);
  assert.equal(r.cantidad, Math.round(1000 / 6)); // 167 g
});

test('granel: valor <= 0 es rechazado', () => {
  assert.throws(
    () => resolverLineaPresentacion(arrozGranel, { presentacion: 'GRANEL', granel: { modo: 'MEDIDA', valor: 0, unidad: 'lb' } }),
    /Cantidad inválida/
  );
});

test('granel/volumen: aceite por litro, "$2000"', () => {
  const aceite = { id: 5, nombre: 'Aceite a granel', precioVenta: 12500, costo: 9800, granel: true, unidadVenta: 'L' };
  const r = resolverLineaPresentacion(aceite, { presentacion: 'GRANEL', granel: { modo: 'IMPORTE', valor: 2000 } });
  assert.equal(r.total, 2000);
  assert.equal(r.cantidad, 160); // 2000 / (12500/1000) = 160 ml
});

test('granel sin unidadVenta válida se comporta como unidad', () => {
  const roto = { id: 6, nombre: 'Roto', precioVenta: 1000, costo: 500, granel: true, unidadVenta: null };
  const r = resolverLineaPresentacion(roto, { cantidad: 2, presentacion: 'UNIDAD' });
  assert.equal(r.presentacion, 'UNIDAD');
  assert.equal(r.total, 2000);
});
