const test = require('node:test');
const assert = require('node:assert/strict');
const chatService = require('./chat.service');

const {
  detectarIntencion,
  extraerProductoDecision,
  extraerProductoAclaracion,
  normalizarTexto,
  esConsultaProductoSimple,
  confianzaProducto,
  parsearClasificacion,
  extraerProductoPorRuido,
  parseMessage,
  validateParsedIntent,
} = chatService.__testables;

test('clasifica saludos y conversación sin buscar productos', () => {
  assert.equal(detectarIntencion('hola'), 'greeting');
  assert.equal(detectarIntencion('hola, cómo estás?'), 'greeting');
  assert.equal(detectarIntencion('gracias'), 'conversational');
});

test('clasifica consultas de stock y extrae el producto', () => {
  assert.equal(detectarIntencion('¿cuánto stock tengo de arroz?'), 'stock_query');
  assert.equal(detectarIntencion('¿cuánto tengo de gaseosa?'), 'stock_query');
  assert.equal(detectarIntencion('¿cuánta gaseosa tengo?'), 'stock_query');
  assert.equal(detectarIntencion('¿y la gaseosa?'), 'stock_query');
});

test('clasifica decisiones de compra sin confundir más con un producto', () => {
  assert.equal(detectarIntencion('¿debería comprar más arroz?'), 'purchase_decision');
  assert.equal(detectarIntencion('¿debería comprar más?'), 'purchase_decision');
  assert.equal(extraerProductoDecision('¿debería comprar más?'), null);
  assert.equal(extraerProductoAclaracion('de arroz'), 'arroz');
  assert.equal(extraerProductoAclaracion('más'), null);
  assert.equal(detectarIntencion('¿qué debería comprar?'), 'reorder_alerts');
});

test('clasifica reposición y resumen', () => {
  assert.equal(detectarIntencion('¿qué productos necesitan reposición?'), 'reorder_alerts');
  assert.equal(detectarIntencion('hazme un resumen'), 'dashboard_summary');
});

test('clasifica ventas contextuales', () => {
  assert.equal(detectarIntencion('¿y cuánto vendí?'), 'sales_summary');
});

test('normaliza variantes y prepara matching fuzzy de productos', () => {
  assert.equal(normalizarTexto(' ¿CUÁNTO  tengo de Gaseósa? '), 'cuanto tengo de gaseosa?');
  assert.equal(esConsultaProductoSimple('gasesosa'), true);
  assert.equal(esConsultaProductoSimple('¿debería comprar arroz?'), false);
  assert.ok(confianzaProducto('gasesosa', 'Gaseosa 1.5L') >= 0.78);
});

test('valida la salida estructurada del clasificador semántico', () => {
  assert.deepEqual(parsearClasificacion('{"intent":"stock","product_query":"arroz","confidence":0.96}'), {
    intent: 'stock', product_query: 'arroz', confidence: 0.96,
  });
  assert.equal(parsearClasificacion('respuesta no JSON').intent, 'unknown');
});

test('separa entidad de producto de palabras funcionales', () => {
  assert.equal(extraerProductoPorRuido('tengo gaseosa?'), 'gaseosa');
  assert.equal(extraerProductoPorRuido('cuánto stock tengo de gaseosa'), 'gaseosa');
  assert.equal(extraerProductoPorRuido('tengo gaseosa 1.5L?'), 'gaseosa 1.5l');
  assert.equal(extraerProductoPorRuido('stock'), null);
  assert.equal(extraerProductoPorRuido('más'), null);
});

test('parsea intención y entidad como campos independientes', () => {
  assert.deepEqual(parseMessage('tengo gaseosa?'), {
    intent: 'consultar_stock', productQuery: 'gaseosa', confidence: 0.95, usesContext: false,
  });
  assert.equal(parseMessage('¿qué debo reordenar?').intent, 'consultar_reorden');
  assert.equal(parseMessage('¿qué debo reordenar?').productQuery, null);
  assert.equal(parseMessage('¿debería comprar más?').productQuery, null);
  assert.equal(validateParsedIntent({ intent: 'consultar_stock', productQuery: 'reordering product' }).productQuery, null);
});
