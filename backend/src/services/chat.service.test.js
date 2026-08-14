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
  detectarAmbiguedadIntencion,
  direccionRanking,
  esConsultaRankingVentas,
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

test('elegibilidad del resolver deterministico de STOCK: solo productSource=context habilita bypass de Ollama', () => {
  const stockContext = { intent: 'STOCK', nombre: 'Arroz 1kg' };

  // Continuaciones inequivocas: sin producto explicito en el mensaje, deben
  // resolver con productSource='context' -> el resolver deterministico las
  // atiende sin llamar a Ollama (ollama_ms=0).
  const continuacionesInequivocas = ['y cuanto queda?', 'cuanto queda?', 'y cuanto hay?', 'y cuanto?'];
  for (const mensaje of continuacionesInequivocas) {
    const parsed = interpretarMensaje(mensaje, stockContext);
    assert.equal(parsed.intent, 'STOCK', mensaje);
    assert.equal(parsed.productSource, 'context', mensaje);
    assert.equal(parsed.productName, 'Arroz 1kg', mensaje);
  }

  // Cambio explicito de producto: NO debe calificar para el resolver
  // deterministico (productSource='explicit'), debe seguir yendo a Ollama.
  const cambiosExplicitos = ['y de gaseosa?', 'cuanto tengo de gaseosa?', 'stock de gaseosa'];
  for (const mensaje of cambiosExplicitos) {
    const parsed = interpretarMensaje(mensaje, stockContext);
    assert.equal(parsed.intent, 'STOCK', mensaje);
    assert.equal(parsed.productSource, 'explicit', mensaje);
    assert.notEqual(parsed.productName, 'Arroz 1kg', mensaje);
  }

  // Cambio explicito de intencion (REORDER): no es STOCK, tampoco califica.
  const cambioIntencion = interpretarMensaje('deberia comprar mas?', stockContext);
  assert.equal(cambioIntencion.intent, 'REORDER');
});

test('detecta ambiguedad de intencion heredada: producto explicito nuevo + intencion no explicita', () => {
  const gaseosaStock = { intent: 'STOCK', nombre: 'Gaseosa 1.5L' };
  const gaseosaReorder = { intent: 'REORDER', nombre: 'Gaseosa 1.5L' };

  // Bug reproducible: "y de arroz?" no trae ningun verbo/intencion propia,
  // solo un producto nuevo. Sea cual sea la intencion heredada (STOCK o
  // REORDER), debe marcarse ambiguo, no ejecutarse automaticamente.
  const casoStock = interpretarMensaje('y de arroz?', gaseosaStock);
  assert.deepEqual(detectarAmbiguedadIntencion(casoStock, gaseosaStock), { producto: 'arroz', intentHeredado: 'STOCK' });

  const casoReorder = interpretarMensaje('y de arroz?', gaseosaReorder);
  assert.deepEqual(detectarAmbiguedadIntencion(casoReorder, gaseosaReorder), { producto: 'arroz', intentHeredado: 'REORDER' });

  // Continuacion pura sin producto nuevo: NO es ambigua (la resuelve
  // _resolverContinuacionStock via productSource='context').
  const continuacionPura = interpretarMensaje('y cuanto queda?', gaseosaStock);
  assert.equal(detectarAmbiguedadIntencion(continuacionPura, gaseosaStock), null);

  // Intencion explicita en el propio mensaje: NO es ambigua (regla 6,
  // la intencion explicita del mensaje prevalece sobre la heredada).
  const intencionExplicita = interpretarMensaje('cuanto stock tengo de arroz?', gaseosaReorder);
  assert.equal(detectarAmbiguedadIntencion(intencionExplicita, gaseosaReorder), null);

  // Sin contexto previo: nada de que ser ambiguo.
  const sinContexto = interpretarMensaje('y de arroz?', {});
  assert.equal(detectarAmbiguedadIntencion(sinContexto, {}), null);
});

test('TOP_PRODUCT / BOTTOM_PRODUCT: siempre GLOBAL, nunca intentan matching de producto', () => {
  // Caso A
  const a = interpretarMensaje('¿Cuál es el producto más vendido?', {});
  assert.equal(a.intent, 'TOP_PRODUCT');
  assert.equal(a.scope, 'GLOBAL');
  assert.equal(a.productName, null);

  // Caso B: continuacion tras TOP_PRODUCT voltea a BOTTOM_PRODUCT sin producto
  const b = interpretarMensaje('¿Y el menos?', { intent: 'TOP_PRODUCT', nombre: 'Panela' });
  assert.equal(b.intent, 'BOTTOM_PRODUCT');
  assert.equal(b.scope, 'GLOBAL');
  assert.equal(b.productName, null);

  // Caso C, D, E: variantes de "menos vendido" desde cero, nunca product matching
  for (const m of ['¿Cuál es el producto menos vendido?', 'producto menos vendido', '¿Qué producto vende menos?', '¿Cuál tiene menos ventas?', '¿Cuál es el que menos se vende?']) {
    const parsed = interpretarMensaje(m, {});
    assert.equal(parsed.intent, 'BOTTOM_PRODUCT', m);
    assert.equal(parsed.scope, 'GLOBAL', m);
    assert.equal(parsed.productName, null, m);
  }

  // Caso F: TOP -> BOTTOM -> TOP
  const f1 = interpretarMensaje('¿Cuál es el producto más vendido?', {});
  assert.equal(f1.intent, 'TOP_PRODUCT');
  const f2 = interpretarMensaje('¿Y el menos?', { intent: f1.intent, nombre: 'Panela' });
  assert.equal(f2.intent, 'BOTTOM_PRODUCT');
  const f3 = interpretarMensaje('¿Y el más?', { intent: f2.intent, nombre: 'Aceite' });
  assert.equal(f3.intent, 'TOP_PRODUCT');

  // Caso G: BOTTOM -> TOP
  const g1 = interpretarMensaje('¿Cuál es el producto menos vendido?', {});
  assert.equal(g1.intent, 'BOTTOM_PRODUCT');
  const g2 = interpretarMensaje('¿Y el más?', { intent: g1.intent, nombre: 'Aceite' });
  assert.equal(g2.intent, 'TOP_PRODUCT');

  // Caso H: una consulta de producto real sigue igual, no la toca el ranking
  const h = interpretarMensaje('¿Cuánto stock tengo de arroz?', {});
  assert.equal(h.intent, 'STOCK');
  assert.equal(h.productName, 'arroz');
  assert.equal(h.scope, null);

  // Ventas de un producto puntual con "vendido" NO deben clasificarse como
  // ranking solo por tener la palabra "vendido" (falta la señal de direccion).
  const ventaProducto = interpretarMensaje('cuanto he vendido de gaseosa?', {});
  assert.equal(ventaProducto.intent, 'SALES');
  assert.equal(ventaProducto.productName, 'gaseosa');
});

test('direccionRanking / esConsultaRankingVentas: señales genericas, no listas por frase', () => {
  assert.equal(direccionRanking('el producto mas vendido'), 'MAX');
  assert.equal(direccionRanking('el producto menos vendido'), 'MIN');
  assert.equal(direccionRanking('y el mas'), 'MAX');
  assert.equal(direccionRanking('y el menos'), 'MIN');
  assert.equal(direccionRanking('cuanto stock tengo'), null);

  assert.equal(esConsultaRankingVentas('producto mas vendido'), true);
  assert.equal(esConsultaRankingVentas('producto menos vendido'), true);
  assert.equal(esConsultaRankingVentas('deberia comprar mas arroz'), false, 'sin tema de ventas no es ranking');
  assert.equal(esConsultaRankingVentas('cuanto he vendido de gaseosa'), false, 'sin palabra comparativa no es ranking');
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
    ['que producto he vendido mas?', 'TOP_PRODUCT', null],
    ['como estan mis ventas?', 'SUMMARY', null],
  ];

  for (const [message, intent, productName] of cases) {
    const parsed = interpretarMensaje(message, context);
    assert.equal(parsed.intent, intent, message);
    assert.equal(parsed.productName, productName, message);
    assert.equal(typeof parsed.contextUsed, 'boolean', message);
  }
});
