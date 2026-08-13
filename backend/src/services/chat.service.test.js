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
  extraerProductoVentas,
  limpiarProducto,
  interpretarMensaje,
  parseMessage,
  validateParsedIntent,
} = chatService.__testables;

test('clasifica saludos y conversacion sin buscar productos', () => {
  assert.equal(detectarIntencion('hola'), 'greeting');
  assert.equal(detectarIntencion('hola, como estas?'), 'greeting');
  assert.equal(detectarIntencion('gracias'), 'conversational');
});

test('clasifica consultas de stock y extrae producto', () => {
  assert.equal(detectarIntencion('cuanto stock tengo de arroz?'), 'stock_query');
  assert.equal(detectarIntencion('cuanto tengo de gaseosa?'), 'stock_query');
  assert.equal(detectarIntencion('cuanta gaseosa tengo?'), 'stock_query');
  assert.equal(detectarIntencion('y la gaseosa?'), 'unknown');
});

test('clasifica decisiones de compra sin confundir mas con producto', () => {
  assert.equal(detectarIntencion('deberia comprar mas arroz?'), 'purchase_decision');
  assert.equal(detectarIntencion('deberia comprar mas?'), 'purchase_decision');
  assert.equal(extraerProductoDecision('deberia comprar mas?'), null);
  assert.equal(extraerProductoAclaracion('de arroz'), 'arroz');
  assert.equal(extraerProductoAclaracion('mas'), null);
  assert.equal(detectarIntencion('que deberia comprar?'), 'reorder_alerts');
});

test('clasifica reposicion y resumen', () => {
  assert.equal(detectarIntencion('que productos necesitan reposicion?'), 'reorder_alerts');
  assert.equal(detectarIntencion('hazme un resumen'), 'dashboard_summary');
});

test('clasifica ventas contextuales', () => {
  assert.equal(detectarIntencion('y cuanto vendi?'), 'sales_summary');
});

test('normaliza variantes y prepara matching fuzzy de productos', () => {
  assert.equal(normalizarTexto(' CUANTO  tengo de Gaseosa? '), 'cuanto tengo de gaseosa?');
  assert.equal(esConsultaProductoSimple('gasesosa'), true);
  assert.equal(esConsultaProductoSimple('deberia comprar arroz?'), false);
  assert.ok(confianzaProducto('gasesosa', 'Gaseosa 1.5L') >= 0.78);
});

test('valida salida estructurada del clasificador semantico', () => {
  assert.deepEqual(parsearClasificacion('{"intent":"stock","product_query":"arroz","confidence":0.96}'), {
    intent: 'stock', product_query: 'arroz', confidence: 0.96,
  });
  assert.equal(parsearClasificacion('respuesta no JSON').intent, 'unknown');
});

test('separa entidad de producto de palabras funcionales', () => {
  assert.equal(extraerProductoPorRuido('tengo gaseosa?'), 'gaseosa');
  assert.equal(extraerProductoPorRuido('cuanto stock tengo de gaseosa'), 'gaseosa');
  assert.equal(extraerProductoPorRuido('tengo gaseosa 1.5L?'), 'gaseosa 1.5l');
  assert.equal(extraerProductoPorRuido('stock'), null);
  assert.equal(extraerProductoPorRuido('mas'), null);
});

test('parsea intencion y entidad como campos independientes', () => {
  assert.deepEqual(parseMessage('tengo gaseosa?'), {
    intent: 'consultar_stock', productQuery: 'gaseosa', confidence: 0.95, usesContext: false,
  });
  assert.equal(parseMessage('que debo reordenar?').intent, 'consultar_reorden');
  assert.equal(parseMessage('que debo reordenar?').productQuery, null);
  assert.equal(parseMessage('deberia comprar mas?').productQuery, null);
  assert.equal(validateParsedIntent({ intent: 'consultar_stock', productQuery: 'reordering product' }).productQuery, null);
});

test('extrae ventas explicitas sin heredar intencion previa', () => {
  assert.equal(extraerProductoVentas('cuanto he vendido de gaseosa?'), 'gaseosa');
  const parsed = interpretarMensaje('cuanto he vendido de gaseosa?', {
    intent: 'REORDER',
    nombre: 'Gaseosa 1.5L',
    tool: 'decidir_compra',
  });
  assert.equal(parsed.intent, 'SALES');
  assert.equal(parsed.productName, 'gaseosa');
  assert.equal(parsed.productSource, 'explicit');
  assert.equal(parsed.tool, 'consultar_ventas_producto');
  assert.equal(parsed.contextUsed, false);
});

test('usa contexto solo para producto faltante', () => {
  const reorderContext = { intent: 'REORDER', nombre: 'Gaseosa 1.5L', tool: 'decidir_compra' };
  const sales = interpretarMensaje('cuanto vendi?', reorderContext);
  assert.equal(sales.intent, 'SALES');
  assert.equal(sales.productName, 'Gaseosa 1.5L');
  assert.equal(sales.productSource, 'context');

  const reorder = interpretarMensaje('deberia comprar mas?', { intent: 'SALES', nombre: 'Gaseosa 1.5L' });
  assert.equal(reorder.intent, 'REORDER');
  assert.equal(reorder.productName, 'Gaseosa 1.5L');
  assert.equal(reorder.productSource, 'context');
  assert.equal(reorder.tool, 'decidir_compra');
});

test('resuelve continuaciones como cambio de producto', () => {
  const sales = { intent: 'SALES', nombre: 'Gaseosa 1.5L' };
  const salesCases = [
    ['y cuanto de arroz?', 'arroz'],
    ['y de gaseosa?', 'gaseosa'],
    ['y de nuevo de gaseosa?', 'gaseosa'],
  ];
  for (const [message, product] of salesCases) {
    const parsed = interpretarMensaje(message, sales);
    assert.equal(parsed.intent, 'SALES', message);
    assert.equal(parsed.intentSource, 'context', message);
    assert.equal(parsed.productName, product, message);
    assert.equal(parsed.productSource, 'explicit', message);
    assert.equal(parsed.continuation, true, message);
  }

  const stock = interpretarMensaje('y de arroz?', { intent: 'STOCK', nombre: 'Gaseosa 1.5L' });
  assert.equal(stock.intent, 'STOCK');
  assert.equal(stock.productName, 'arroz');

  const reorder = interpretarMensaje('y de arroz?', { intent: 'REORDER', nombre: 'Gaseosa 1.5L' });
  assert.equal(reorder.intent, 'REORDER');
  assert.equal(reorder.scope, 'PRODUCT');
  assert.equal(reorder.productName, 'arroz');
  assert.equal(reorder.tool, 'decidir_compra');
});

test('continuacion sin producto conserva solo contexto faltante', () => {
  const parsed = interpretarMensaje('y cuanto?', { intent: 'STOCK', nombre: 'Arroz 1kg' });
  assert.equal(parsed.intent, 'STOCK');
  assert.equal(parsed.intentSource, 'context');
  assert.equal(parsed.productName, 'Arroz 1kg');
  assert.equal(parsed.productSource, 'context');
  assert.equal(parsed.continuation, true);
  assert.equal(parsed.contextUsed, true);
});

test('no convierte labels internos en productos', () => {
  assert.equal(limpiarProducto('reordering product'), null);
  assert.equal(limpiarProducto('sales product'), null);
  assert.equal(interpretarMensaje('que debo reordenar?').intent, 'REORDER');
  assert.equal(interpretarMensaje('que debo reordenar?').productName, null);
  assert.equal(interpretarMensaje('que productos necesito comprar?').tool, 'sugerir_reorden');
  assert.equal(interpretarMensaje('que productos necesito comprar?').productName, null);
});

test('interpreta regresiones minimas solicitadas', () => {
  const context = { intent: 'SALES', nombre: 'Gaseosa 1.5L' };
  const cases = [
    ['hola', 'GREETING', null],
    ['cuanto stock tengo de arroz?', 'STOCK', 'arroz'],
    ['tengo arroz?', 'STOCK', 'arroz'],
    ['cuanto he vendido de gaseosa?', 'SALES', 'gaseosa'],
    ['cuanto vendi?', 'SALES', 'Gaseosa 1.5L'],
    ['deberia comprar mas?', 'REORDER', 'Gaseosa 1.5L'],
    ['que debo reordenar?', 'REORDER', null],
    ['que productos necesito comprar?', 'REORDER', null],
    ['tengo gasesosa?', 'STOCK', 'gasesosa'],
    ['cuanto he vendido de gasesosa?', 'SALES', 'gasesosa'],
    ['deberia comprar mas gasesosa?', 'REORDER', 'gasesosa'],
    ['y la gaseosa?', 'SALES', 'gaseosa'],
    ['que producto he vendido mas?', 'SUMMARY', null],
    ['como estan mis ventas?', 'SUMMARY', null],
  ];

  for (const [message, intent, productName] of cases) {
    const parsed = interpretarMensaje(message, context);
    assert.equal(parsed.intent, intent, message);
    assert.equal(parsed.productName, productName, message);
    assert.equal(typeof parsed.contextUsed, 'boolean', message);
  }
});
