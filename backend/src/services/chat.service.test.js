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
  extraerProductoPorRuido,
  extraerProductoVentas,
  limpiarProducto,
  interpretarMensaje,
  parseMessage,
  validateParsedIntent,
  detectarAmbiguedadIntencion,
  direccionRanking,
  esConsultaRankingVentas,
  esConversacionalMinimo,
  despojarMuletillaInicial,
  esConsultaRankingRentabilidad,
  resolverConfirmacionContinuar,
  productoDesdeResultado,
  INTENT_BY_TOOL,
  TOOL_BY_INTENT,
  formatearResultadoTool,
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

test('palabras conversacionales ("ok", "vale", ...) nunca se convierten en productName', () => {
  for (const palabra of ['ok', 'vale', 'listo', 'dale', 'bueno', 'perfecto', 'si', 'no']) {
    assert.equal(esConsultaProductoSimple(palabra), false, palabra);
    assert.equal(limpiarProducto(palabra), null, palabra);

    const trasStock = interpretarMensaje(palabra, { intent: 'STOCK', nombre: 'Arroz 1kg' });
    assert.equal(trasStock.productName, null, `${palabra} tras STOCK`);

    const trasRanking = interpretarMensaje(palabra, { intent: 'TOP_PRODUCT', nombre: 'Panela' });
    assert.equal(trasRanking.productName, null, `${palabra} tras TOP_PRODUCT`);
    assert.notEqual(trasRanking.intent, 'BOTTOM_PRODUCT', `${palabra} no debe voltear el ranking (no es señal de direccion)`);
  }

  // Un nombre de producto real parecido no debe verse afectado.
  assert.equal(esConsultaProductoSimple('gasesosa'), true);
  assert.equal(limpiarProducto('gasesosa'), 'gasesosa');
});

test('esConversacionalMinimo: gate unico para acuses de recibo (ok, vale, gracias, entendido...)', () => {
  for (const m of ['ok', 'okey', 'okay', 'vale', 'bien', 'perfecto', 'gracias', 'entendido', 'listo', 'dale', 'claro', 'muchas gracias', 'te agradezco']) {
    assert.equal(esConversacionalMinimo(m), true, m);
    assert.equal(esConversacionalMinimo(`${m}!`), true, `${m}! (con puntuacion)`);
  }

  // No debe atrapar mensajes reales que solo contienen alguna de estas
  // palabras como parte de una consulta real.
  for (const m of ['ok pero cuanto stock tengo de arroz?', 'gracias, cuanto vendi de gaseosa?', 'bien, y el producto mas vendido?']) {
    assert.equal(esConversacionalMinimo(m), false, m);
  }
});

test('despojarMuletillaInicial: quita un prefijo conversacional, deja intacto el resto', () => {
  assert.equal(despojarMuletillaInicial('ok y el menos?'), 'y el menos?');
  assert.equal(despojarMuletillaInicial('vale, y el mas?'), 'y el mas?');
  assert.equal(despojarMuletillaInicial('bien y de arroz?'), 'y de arroz?');
  assert.equal(despojarMuletillaInicial('gracias y cuanto vendi?'), 'y cuanto vendi?');
  // 'si'/'no' no se despojan como prefijo: cargan significado real.
  assert.equal(despojarMuletillaInicial('no tengo arroz'), 'no tengo arroz');
  // Mensaje puramente conversacional, sin nada despues: no aplica (lo cubre esConversacionalMinimo).
  assert.equal(despojarMuletillaInicial('ok'), 'ok');
  // Primera palabra real (no muletilla): sin cambios.
  assert.equal(despojarMuletillaInicial('cuanto tengo de arroz?'), 'cuanto tengo de arroz?');
});

test('caso reportado: "ok y el menos?" en un solo mensaje resuelve BOTTOM_PRODUCT/GLOBAL, no busca "ok" como producto', () => {
  const ctxTop = { intent: 'TOP_PRODUCT', nombre: 'Panela' };
  const p1 = interpretarMensaje('ok y el menos?', ctxTop);
  assert.equal(p1.intent, 'BOTTOM_PRODUCT');
  assert.equal(p1.scope, 'GLOBAL');
  assert.equal(p1.productName, null);

  const ctxBottom = { intent: 'BOTTOM_PRODUCT', nombre: 'Galletas' };
  const p2 = interpretarMensaje('vale, y el mas?', ctxBottom);
  assert.equal(p2.intent, 'TOP_PRODUCT');
  assert.equal(p2.scope, 'GLOBAL');
  assert.equal(p2.productName, null);

  const p3 = interpretarMensaje('bien y de arroz?', { intent: 'STOCK', nombre: 'Gaseosa 1.5L' });
  assert.equal(p3.intent, 'STOCK');
  assert.equal(p3.productName, 'arroz');
});

test('TOP_PROFIT_PRODUCT: "producto mas rentable" es GLOBAL, nunca extrae "es rentable" como producto', () => {
  for (const m of ['¿Cuál es el producto más rentable?', 'producto mas rentable', '¿Qué producto tiene mejor margen?', '¿Cuál da más ganancia?', '¿Cuál tiene más utilidad?']) {
    const parsed = interpretarMensaje(m, {});
    assert.equal(parsed.intent, 'TOP_PROFIT_PRODUCT', m);
    assert.equal(parsed.scope, 'GLOBAL', m);
    assert.equal(parsed.productName, null, m);
  }

  assert.equal(esConsultaRankingRentabilidad('cual es el producto mas rentable'), true);
  // Sin tema de rentabilidad: no se confunde con el eje de unidades vendidas.
  assert.equal(esConsultaRankingRentabilidad('cual es el producto mas vendido'), false);

  // No debe interferir con TOP_PRODUCT (eje de unidades) ni con una consulta real.
  assert.equal(interpretarMensaje('¿Cuál es el producto más vendido?', {}).intent, 'TOP_PRODUCT');
  assert.equal(interpretarMensaje('¿Cuánto stock tengo de arroz?', {}).intent, 'STOCK');
});

test('BOTTOM_PROFIT_PRODUCT: "producto menos rentable" es el eje de MARGEN, no el de unidades vendidas', () => {
  // Bug reportado: "cual es el producto menos rentable" caia a UNKNOWN y de
  // ahi terminaba resuelto (via el LLM) como producto_menos_vendido, porque
  // no existia ninguna tool/intent para "menos rentable". Debe rankear por
  // margen (rentabilidad), igual que TOP_PROFIT_PRODUCT pero direccion ASC.
  for (const m of ['¿Cuál es el producto menos rentable?', 'producto menos rentable', '¿Qué producto tiene peor margen?', '¿Cuál da menos ganancia?', '¿Cuál tiene menos utilidad?']) {
    const parsed = interpretarMensaje(m, {});
    assert.equal(parsed.intent, 'BOTTOM_PROFIT_PRODUCT', m);
    assert.equal(parsed.scope, 'GLOBAL', m);
    assert.equal(parsed.productName, null, m);
  }

  assert.equal(esConsultaRankingRentabilidad('cual es el producto menos rentable'), true);
  assert.equal(direccionRanking('cual es el producto menos rentable'), 'MIN');

  // No debe confundirse con BOTTOM_PRODUCT (eje de unidades vendidas): son
  // ejes distintos, cada uno con su propia tool.
  assert.equal(TOOL_BY_INTENT.BOTTOM_PROFIT_PRODUCT, 'producto_menos_rentable');
  assert.notEqual(TOOL_BY_INTENT.BOTTOM_PROFIT_PRODUCT, TOOL_BY_INTENT.BOTTOM_PRODUCT);
});

test('continuacion de rentabilidad preserva el EJE (margen) y solo voltea la DIRECCION', () => {
  // "¿Cuál es mi producto más rentable?" -> "¿Y el menos?" debe pasar a
  // BOTTOM_PROFIT_PRODUCT (rentabilidad + asc), NUNCA a BOTTOM_PRODUCT
  // (ventas + asc) — ese era el riesgo si PROFIT_INTENTS compartiera el
  // mismo flip que RANKING_INTENTS.
  const top = interpretarMensaje('¿Cuál es mi producto más rentable?', {});
  assert.equal(top.intent, 'TOP_PROFIT_PRODUCT');

  const bottom = interpretarMensaje('¿Y el menos?', { intent: top.intent, nombre: 'Panela' });
  assert.equal(bottom.intent, 'BOTTOM_PROFIT_PRODUCT');
  assert.equal(bottom.scope, 'GLOBAL');
  assert.equal(bottom.productName, null);

  // Y de vuelta: BOTTOM_PROFIT_PRODUCT -> "¿y el mas?" -> TOP_PROFIT_PRODUCT,
  // sigue sin cruzar al eje de unidades vendidas.
  const topDeNuevo = interpretarMensaje('¿Y el más?', { intent: bottom.intent, nombre: 'Galletas' });
  assert.equal(topDeNuevo.intent, 'TOP_PROFIT_PRODUCT');

  // Contraste: el mismo flip sobre el eje de VENTAS nunca debe terminar en
  // un intent de rentabilidad.
  const topVentas = interpretarMensaje('¿Cuál es el producto más vendido?', {});
  const bottomVentas = interpretarMensaje('¿Y el menos?', { intent: topVentas.intent, nombre: 'Panela' });
  assert.equal(bottomVentas.intent, 'BOTTOM_PRODUCT');
  assert.notEqual(bottomVentas.intent, 'BOTTOM_PROFIT_PRODUCT');
});

test('formatearResultadoTool: producto_menos_rentable reporta margen, no unidades vendidas', () => {
  const resultado = {
    success: true,
    data: {
      bottom: { nombre: 'Galletas', margen: 120, margenPorcentual: 8.5, unidades: 340 },
      ranking: [
        { nombre: 'Galletas', margen: 120, margenPorcentual: 8.5, unidades: 340 },
        { nombre: 'Aceite', margen: 300, margenPorcentual: 12, unidades: 90 },
      ],
      categoria: null,
      dias: null,
    },
  };
  const texto = formatearResultadoTool('producto_menos_rentable', resultado, {});
  assert.match(texto, /menos rentable/i);
  assert.match(texto, /Galletas/);
  assert.match(texto, /margen de \$120/);
  assert.doesNotMatch(texto, /vendido/i);
});

test('productoDesdeResultado: producto_menos_rentable extrae bottom, igual que producto_menos_vendido', () => {
  assert.deepEqual(
    productoDesdeResultado('producto_menos_rentable', { success: true, data: { bottom: { nombre: 'Galletas' } } }),
    { nombre: 'Galletas' }
  );
});

test('INTENT_BY_TOOL cubre producto_menos_rentable', () => {
  assert.equal(INTENT_BY_TOOL.producto_menos_rentable, 'BOTTOM_PROFIT_PRODUCT');
});

test('resolverConfirmacionContinuar: "si"/"no" resuelven por contexto, no como acuse de recibo generico', () => {
  assert.equal(resolverConfirmacionContinuar('si'), '¡Genial! ¿Qué necesitas?');
  assert.equal(resolverConfirmacionContinuar('sí'), '¡Genial! ¿Qué necesitas?');
  assert.equal(resolverConfirmacionContinuar('Sí!'), '¡Genial! ¿Qué necesitas?');
  assert.equal(resolverConfirmacionContinuar('no'), '¡Perfecto! Que tengas un buen día.');
  assert.equal(resolverConfirmacionContinuar('No.'), '¡Perfecto! Que tengas un buen día.');
  // Cualquier otra cosa: no resuelve, cede al flujo normal.
  assert.equal(resolverConfirmacionContinuar('tal vez'), null);
  assert.equal(resolverConfirmacionContinuar('cuanto stock tengo de arroz?'), null);
});

test('INTENT_BY_TOOL es el inverso exacto de TOOL_BY_INTENT (derivado, no duplicado)', () => {
  assert.equal(INTENT_BY_TOOL.consultar_stock, 'STOCK');
  assert.equal(INTENT_BY_TOOL.consultar_ventas_producto, 'SALES');
  assert.equal(INTENT_BY_TOOL.sugerir_reorden, 'REORDER');
  assert.equal(INTENT_BY_TOOL.predecir_demanda, 'PREDICTION');
  assert.equal(INTENT_BY_TOOL.resumen_dashboard, 'SUMMARY');
  assert.equal(INTENT_BY_TOOL.producto_mas_vendido, 'TOP_PRODUCT');
  assert.equal(INTENT_BY_TOOL.producto_menos_vendido, 'BOTTOM_PRODUCT');
  assert.equal(INTENT_BY_TOOL.producto_mas_rentable, 'TOP_PROFIT_PRODUCT');
});

test('productoDesdeResultado: extrae el producto a recordar segun la forma de cada tool', () => {
  assert.deepEqual(
    productoDesdeResultado('consultar_stock', { success: true, data: [{ producto: 'Arroz 1kg' }] }),
    { producto: 'Arroz 1kg' } // data es array: cae en la rama Array.isArray -> data[0]
  );
  assert.deepEqual(
    productoDesdeResultado('consultar_ventas_producto', { success: true, data: { producto: 'Gaseosa 1.5L' } }),
    { producto: 'Gaseosa 1.5L' }
  );
  assert.deepEqual(
    productoDesdeResultado('producto_mas_vendido', { success: true, data: { top: { nombre: 'Panela' } } }),
    { nombre: 'Panela' }
  );
  assert.deepEqual(
    productoDesdeResultado('producto_menos_vendido', { success: true, data: { bottom: { nombre: 'Galletas' } } }),
    { nombre: 'Galletas' }
  );
  assert.deepEqual(
    productoDesdeResultado('producto_mas_rentable', { success: true, data: { top: { nombre: 'Panela' } } }),
    { nombre: 'Panela' }
  );
  // Tools de lista/agregado: nunca hay UN producto que recordar.
  assert.equal(productoDesdeResultado('resumen_dashboard', { success: true, data: {} }), null);
  assert.equal(productoDesdeResultado('alertas_stock', { success: true, data: [{ producto: 'x' }] }), null);
  assert.equal(productoDesdeResultado('sugerir_reorden', { success: true, data: [{ producto: 'x' }] }), null);
  // Resultado fallido: nunca recordar nada.
  assert.equal(productoDesdeResultado('consultar_stock', { success: false }), null);
});

test('formatearResultadoTool cubre resumen_dashboard/alertas_stock/info_producto (antes requerian una 2a llamada a Ollama)', () => {
  const resumen = formatearResultadoTool('resumen_dashboard', {
    success: true,
    data: {
      resumen: { ingresos: 1505800, margenBruto: 358900, unidadesVendidas: 169, numeroProductos: 5, alertasStock: 1 },
      alertasStock: [],
      topProductos: [{ nombre: 'Panela', unidades: 76 }],
      rankingRentabilidad: [],
    },
  }, {});
  assert.match(resumen, /ingresos \$1505800/);
  assert.match(resumen, /margen bruto \$358900/);

  const alertas = formatearResultadoTool('alertas_stock', {
    success: true,
    data: [{ producto: 'Aceite Vegetal 1L', stockActual: 6, stockMinimo: 12, deficit: 6 }],
  }, {});
  assert.match(alertas, /Aceite Vegetal 1L/);
  assert.match(alertas, /faltan 6/);

  const alertasVacias = formatearResultadoTool('alertas_stock', { success: true, data: [] }, {});
  assert.match(alertasVacias, /No hay productos con stock bajo/i);

  const info = formatearResultadoTool('info_producto', {
    success: true,
    data: [{ nombre: 'Arroz 1kg', codigo: 'ARZ1', precioVenta: 5000, costo: 3000, margen: 2000, stockActual: 94, stockMinimo: 30, categoria: 'Granos', proveedor: null }],
  }, {});
  assert.match(info, /Arroz 1kg/);
  assert.match(info, /margen \$2000/);
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
