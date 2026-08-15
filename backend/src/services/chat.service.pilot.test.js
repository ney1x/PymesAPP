/**
 * Tests de integracion del piloto STOCK (Fase 2).
 * Requieren DB alcanzable (DATABASE_URL) con datos semilla (npm run seed):
 * usan el usuario comerciante y sus productos reales via el pipeline
 * completo (procesarMensaje -> tool_consultarStock -> Prisma).
 *
 * Ollama se reemplaza por un mock inyectado en chatService.llm, asi que
 * estos tests NO requieren un Ollama real corriendo. Lo que si miden es
 * cuantas veces se invoco ese mock: eso es literalmente ollama_ms=0 vs >0,
 * sin depender de timings de red reales.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const chatService = require('./chat.service');

const TEST_USER = { id: 2, rol: 'COMERCIANTE' };

// NOTA: tras agregar el resolver de ambiguedad de intencion heredada,
// "¿Y de <producto>?" (sin verbo propio) tras un contexto de UN solo
// intent ya no resuelve directo al viejo intent — pasa a pedir aclaracion
// (ver Casos A-F mas abajo). Los tests de esta seccion que necesitan
// verificar "cambio EXPLICITO de producto llama a Ollama" usan frases con
// intencion propia explicita (ej. "¿Cuánto tengo de X?"), no el patron
// "¿Y de X?", para no confundir ambos mecanismos.

function makeMockLLM(responses, opts = {}) {
  let callCount = 0;
  const calls = [];
  return {
    async chat(messages, tools, signal) {
      callCount += 1;
      const userMsg = messages[messages.length - 1].content;
      calls.push({ userMsg, systemMsgCount: messages.filter((m) => m.role === 'system').length });
      if (opts.delayMs) await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
      const respuesta = responses[userMsg];
      if (!respuesta) {
        throw new Error(`Mock LLM: sin respuesta programada para "${userMsg}"`);
      }
      return respuesta;
    },
    get callCount() { return callCount; },
    get calls() { return calls; },
  };
}

function toolCallStock(producto) {
  return {
    content: '',
    toolCalls: [{ id: `call_${producto}`, function: { name: 'consultar_stock', arguments: JSON.stringify({ producto }) } }],
  };
}

function toolCall(name, args) {
  return {
    content: '',
    toolCalls: [{ id: `call_${name}`, function: { name, arguments: JSON.stringify(args) } }],
  };
}

function sinToolCall(texto) {
  return { content: texto, toolCalls: [] };
}

test('conversacion multi-turno: continuacion contextual de STOCK no llama a Ollama', async () => {
  const mockLLM = makeMockLLM({
    '¿Cuánto stock tengo de arroz?': toolCallStock('arroz'),
    '¿Cuánto tengo de gaseosa?': toolCallStock('gaseosa'),
  });

  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    // Turno 1: producto explicito -> Ollama SI debe interpretar.
    const r1 = await chatService.procesarMensaje(TEST_USER, '¿Cuánto stock tengo de arroz?');
    assert.match(r1, /Arroz/i);
    assert.equal(mockLLM.callCount, 1, 'turno 1 (producto explicito) debe llamar a Ollama exactamente una vez');

    // Turno 2: continuacion contextual pura, sin nombrar producto -> NO debe
    // llamar a Ollama. El count debe seguir en 1 (ollama_ms=0 para este turno).
    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Y cuánto queda?');
    assert.match(r2, /Arroz/i, 'debe resolver sobre el mismo producto del turno anterior');
    assert.equal(mockLLM.callCount, 1, 'continuacion contextual NO debe incrementar las llamadas a Ollama');

    // Turno 3: otra continuacion contextual equivalente, mismo resultado.
    const r3 = await chatService.procesarMensaje(TEST_USER, 'cuanto queda?');
    assert.match(r3, /Arroz/i);
    assert.equal(mockLLM.callCount, 1, 'segunda continuacion contextual tampoco debe llamar a Ollama');

    // Turno 4: cambio EXPLICITO de producto (con intencion propia, "cuanto
    // tengo de X") -> debe volver a interpretar con Ollama.
    const r4 = await chatService.procesarMensaje(TEST_USER, '¿Cuánto tengo de gaseosa?');
    assert.match(r4, /Gaseosa/i);
    assert.equal(mockLLM.callCount, 2, 'cambio explicito de producto debe llamar a Ollama de nuevo');

    // Turno 5: continuacion contextual otra vez, ahora sobre el nuevo producto (gaseosa).
    const r5 = await chatService.procesarMensaje(TEST_USER, '¿y cuanto hay?');
    assert.match(r5, /Gaseosa/i, 'la continuacion debe seguir al producto mas reciente (gaseosa), no al primero (arroz)');
    assert.equal(mockLLM.callCount, 2, 'tercera continuacion contextual tampoco debe llamar a Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

/**
 * Casos A-F: resolucion de ambiguedad de intencion heredada.
 * Bug reproducible: "cuanto tengo de gaseosa?" -> "y deberia comprar mas?" ->
 * "y de arroz?" terminaba heredando REORDER para arroz sin que el usuario lo
 * pidiera. Estos tests verifican que ahora se pide aclaracion en vez de
 * ejecutar una tool, y que la aclaracion se resuelve sin llamar a Ollama.
 */

test('Caso A: continuacion pura tras STOCK resuelve el mismo producto sin llamar a Ollama', async () => {
  const mockLLM = makeMockLLM({ '¿Cuánto tengo de gaseosa?': toolCallStock('gaseosa') });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r1 = await chatService.procesarMensaje(TEST_USER, '¿Cuánto tengo de gaseosa?');
    assert.match(r1, /Gaseosa/i);
    assert.equal(mockLLM.callCount, 1);

    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Y cuánto queda?');
    assert.match(r2, /Gaseosa/i);
    assert.equal(mockLLM.callCount, 1, 'ollama_ms=0 esperado: continuacion inequivoca no debe llamar a Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('Caso B: producto nuevo sin intencion explicita tras STOCK pide aclaracion, no ejecuta ninguna tool', async () => {
  const mockLLM = makeMockLLM({ '¿Cuánto tengo de gaseosa?': toolCallStock('gaseosa') });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    await chatService.procesarMensaje(TEST_USER, '¿Cuánto tengo de gaseosa?');
    assert.equal(mockLLM.callCount, 1);

    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Y de arroz?');
    assert.equal(r2, '¿Quieres saber cuánto stock tienes de arroz o si deberías comprar más?');
    assert.equal(mockLLM.callCount, 1, 'pedir aclaracion no debe llamar a Ollama (ollama_ms=0)');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('Caso C: ambiguedad en el tercer mensaje cuando la intencion heredada es REORDER', async () => {
  // '¿Y debería comprar más?' resuelve REORDER de forma inequivoca por regex
  // (esDecisionCompra + contexto), asi que ya NO debe pagar el piloto de
  // Ollama (fix de latencia de esta ronda) — por eso el mock no necesita
  // programar respuesta para ese mensaje: si algo lo llamara, el test fallaria.
  const mockLLM = makeMockLLM({ '¿Cuánto tengo de gaseosa?': toolCallStock('gaseosa') });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    await chatService.procesarMensaje(TEST_USER, '¿Cuánto tengo de gaseosa?');
    assert.equal(mockLLM.callCount, 1);

    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Y debería comprar más?');
    assert.match(r2, /Gaseosa/i);
    assert.equal(mockLLM.callCount, 1, 'REORDER inequivoco por regex ya no debe llamar a Ollama (fix de latencia)');

    const r3 = await chatService.procesarMensaje(TEST_USER, '¿Y de arroz?');
    assert.equal(r3, '¿Quieres saber cuánto stock tienes de arroz o si deberías comprar más?');
    assert.equal(mockLLM.callCount, 1, 'la aclaracion no debe llamar a Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('Caso D: la aclaracion se completa como STOCK cuando el usuario responde "cuanto tengo"', async () => {
  const mockLLM = makeMockLLM({ '¿Cuánto tengo de gaseosa?': toolCallStock('gaseosa') });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    await chatService.procesarMensaje(TEST_USER, '¿Cuánto tengo de gaseosa?');
    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Y de arroz?');
    assert.equal(r2, '¿Quieres saber cuánto stock tienes de arroz o si deberías comprar más?');
    assert.equal(mockLLM.callCount, 1);

    const r3 = await chatService.procesarMensaje(TEST_USER, '¿Cuánto tengo?');
    assert.match(r3, /Arroz/i, 'debe resolver STOCK sobre arroz, el producto de la ambiguedad, no gaseosa');
    assert.equal(mockLLM.callCount, 1, 'resolver la aclaracion no debe llamar a Ollama (ollama_ms=0)');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('Caso E: la aclaracion se completa como REORDER cuando el usuario responde "deberia comprar"', async () => {
  const mockLLM = makeMockLLM({ '¿Cuánto tengo de gaseosa?': toolCallStock('gaseosa') });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    await chatService.procesarMensaje(TEST_USER, '¿Cuánto tengo de gaseosa?');
    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Y de arroz?');
    assert.equal(r2, '¿Quieres saber cuánto stock tienes de arroz o si deberías comprar más?');
    assert.equal(mockLLM.callCount, 1);

    const r3 = await chatService.procesarMensaje(TEST_USER, '¿Debería comprar más?');
    assert.match(r3, /Arroz/i, 'debe resolver REORDER sobre arroz, no gaseosa');
    assert.match(r3, /comprar|reorden/i);
    assert.equal(mockLLM.callCount, 1, 'resolver la aclaracion no debe llamar a Ollama (ollama_ms=0)');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('Caso F: ambiguedad tambien aplica cuando el turno previo fue REORDER explicito desde el inicio', async () => {
  // '¿Debería comprar más de gaseosa?' es REORDER inequivoco (intent Y
  // producto explicitos) -> ya no pasa por el piloto de Ollama.
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r1 = await chatService.procesarMensaje(TEST_USER, '¿Debería comprar más de gaseosa?');
    assert.match(r1, /Gaseosa/i);
    assert.equal(mockLLM.callCount, 0, 'REORDER inequivoco por regex ya no debe llamar a Ollama');

    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Y de arroz?');
    assert.equal(r2, '¿Quieres saber cuánto stock tienes de arroz o si deberías comprar más?');
    assert.equal(mockLLM.callCount, 0, 'la aclaracion no debe llamar a Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('primera pregunta de STOCK sin contexto previo si llama a Ollama (no hay lastProduct que usar)', async () => {
  const mockLLM = makeMockLLM({
    '¿Y cuánto queda?': { content: '¿De qué producto quieres saber el stock?', toolCalls: [] },
  });

  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    // Sin turno previo, sin lastProduct: el resolver deterministico no tiene
    // nada de que partir (productSource no puede ser 'context'), asi que
    // cede a Ollama igual que cualquier mensaje ambiguo nuevo.
    await chatService.procesarMensaje(TEST_USER, '¿Y cuánto queda?');
    assert.equal(mockLLM.callCount, 1, 'sin contexto previo, debe llamar a Ollama (no hay lastProduct)');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

/**
 * Casos A-I: TOP_PRODUCT / BOTTOM_PRODUCT.
 * mockLLM SIN respuestas programadas: si algun caso llamara a Ollama por
 * error, el mock lanza excepcion y el test falla ruidosamente — es una
 * aserción mas fuerte que solo revisar callCount al final.
 */

test('Caso A: producto mas vendido -> TOP_PRODUCT/GLOBAL, ollama_ms=0', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r = await chatService.procesarMensaje(TEST_USER, '¿Cuál es el producto más vendido?');
    assert.match(r, /mas vendido|más vendido/i);
    assert.equal(mockLLM.callCount, 0, 'TOP_PRODUCT resuelve por regex, nunca deberia llamar a Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('Caso B: "¿Y el menos?" tras TOP_PRODUCT -> BOTTOM_PRODUCT/GLOBAL sin Ollama', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r1 = await chatService.procesarMensaje(TEST_USER, '¿Cuál es el producto más vendido?');
    assert.match(r1, /mas vendido|más vendido/i);

    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Y el menos?');
    assert.match(r2, /menos vendido/i);
    assert.notEqual(r1, r2, 'debe responder algo distinto del turno anterior, no repetir el mas vendido');
    assert.equal(mockLLM.callCount, 0, 'ollama_ms=0: la continuacion inequivoca no debe llamar a Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('Caso C/D/E: variantes de "menos vendido" -> BOTTOM_PRODUCT/GLOBAL, nunca product matching', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;

  try {
    for (const m of ['¿Cuál es el producto menos vendido?', 'producto menos vendido', '¿Qué producto vende menos?']) {
      chatService.limpiarHistorial(TEST_USER.id);
      const r = await chatService.procesarMensaje(TEST_USER, m);
      assert.match(r, /menos vendido/i, m);
      assert.doesNotMatch(r, /No encuentro/i, `${m}: no debe intentar buscarlo como nombre de producto`);
    }
    assert.equal(mockLLM.callCount, 0, 'ninguna variante de "menos vendido" debe llamar a Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('Caso F: TOP -> BOTTOM -> TOP', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r1 = await chatService.procesarMensaje(TEST_USER, '¿Cuál es el producto más vendido?');
    assert.match(r1, /^El producto mas vendido/i);

    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Y el menos?');
    assert.match(r2, /^El producto menos vendido/i);

    const r3 = await chatService.procesarMensaje(TEST_USER, '¿Y el más?');
    assert.match(r3, /^El producto mas vendido/i);

    assert.equal(mockLLM.callCount, 0, 'toda la cadena TOP->BOTTOM->TOP debe resolverse sin Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('Caso G: BOTTOM -> TOP', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r1 = await chatService.procesarMensaje(TEST_USER, '¿Cuál es el producto menos vendido?');
    assert.match(r1, /^El producto menos vendido/i);

    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Y el más?');
    assert.match(r2, /^El producto mas vendido/i);

    assert.equal(mockLLM.callCount, 0, 'la cadena BOTTOM->TOP debe resolverse sin Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('Caso H: una consulta de producto real (STOCK) sigue funcionando exactamente igual', async () => {
  const mockLLM = makeMockLLM({ '¿Cuánto stock tengo de arroz?': toolCallStock('arroz') });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r = await chatService.procesarMensaje(TEST_USER, '¿Cuánto stock tengo de arroz?');
    assert.match(r, /Arroz/i);
    assert.equal(mockLLM.callCount, 1, 'STOCK explicito sigue usando el piloto de Ollama como antes');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('Caso I: una ambiguedad real sigue pidiendo aclaracion, no inventa intencion (ni la confunde con ranking)', async () => {
  const mockLLM = makeMockLLM({ '¿Cuánto tengo de gaseosa?': toolCallStock('gaseosa') });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    await chatService.procesarMensaje(TEST_USER, '¿Cuánto tengo de gaseosa?');
    const r = await chatService.procesarMensaje(TEST_USER, '¿Y de arroz?');
    assert.equal(r, '¿Quieres saber cuánto stock tienes de arroz o si deberías comprar más?');
    assert.equal(mockLLM.callCount, 1, 'la aclaracion no debe llamar a Ollama de nuevo');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

/**
 * Palabras conversacionales ("ok", "vale", ...) no deben convertirse en
 * productName ni disparar una busqueda de producto fallida en medio de una
 * conversacion de ranking.
 */
test('"ok" en medio de una conversacion de ranking no se busca como producto ni rompe el contexto', async () => {
  const mockLLM = makeMockLLM({ ok: sinToolCall('¡De nada! ¿Algo más?') });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r1 = await chatService.procesarMensaje(TEST_USER, '¿Cuál es el producto más vendido?');
    assert.match(r1, /^El producto mas vendido/i);
    assert.equal(mockLLM.callCount, 0, 'TOP_PRODUCT no llama a Ollama');

    // "ok" es UNKNOWN generico: si le sobra contexto ambiguo, todavia puede
    // caer al fallback de Ollama (comportamiento correcto para input no
    // clasificable) — pero NUNCA debe intentar buscarlo como producto.
    const r2 = await chatService.procesarMensaje(TEST_USER, 'ok');
    assert.doesNotMatch(r2, /No encuentro/i, '"ok" no debe tratarse como nombre de producto');
    assert.doesNotMatch(r2, /"ok"/i);

    // El contexto de ranking (Panela, TOP_PRODUCT) debe seguir intacto:
    // "¿y el menos?" debe seguir resolviendo BOTTOM_PRODUCT, sin Ollama.
    const callsAfterOk = mockLLM.callCount;
    const r3 = await chatService.procesarMensaje(TEST_USER, '¿Y el menos?');
    assert.match(r3, /^El producto menos vendido/i);
    assert.equal(mockLLM.callCount, callsAfterOk, 'la continuacion de ranking tras "ok" sigue sin llamar a Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

/**
 * Fix de latencia: si el regex ya resolvio con confianza una intencion que
 * NO es STOCK (SUMMARY, REORDER global), el piloto de Ollama debe saltarse
 * por completo — antes se llamaba igual y se descartaba el resultado.
 */
test('SUMMARY no llama al piloto de Ollama (intencion ya resuelta por regex)', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r = await chatService.procesarMensaje(TEST_USER, 'Dame un resumen del negocio');
    assert.match(r, /Resumen/i);
    assert.equal(mockLLM.callCount, 0, 'SUMMARY es inequivoco por regex, no debe tocar Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

/**
 * Gate de mensajes conversacionales minimos: deben resolverse en <100ms,
 * SIN llamar a Ollama (mock vacio -> lanza si se le llama) y SIN pasar por
 * ninguna tool de DB (el gate retorna antes de tocar inventarioService,
 * ventasService, etc. — no hay infraestructura de spy sobre Prisma en este
 * repo, asi que lo verificamos por forma de la respuesta: es exactamente el
 * texto fijo del gate, nunca "No encuentro..." ni datos reales de catalogo).
 */
for (const palabra of ['ok', 'okey', 'vale', 'bien', 'perfecto', 'gracias', 'entendido']) {
  test(`conversacional minimo "${palabra}": <100ms, sin DB, sin Ollama`, async () => {
    const mockLLM = makeMockLLM({});
    const originalLLM = chatService.llm;
    chatService.llm = mockLLM;
    chatService.limpiarHistorial(TEST_USER.id);

    try {
      const startedAt = Date.now();
      const r = await chatService.procesarMensaje(TEST_USER, palabra);
      const elapsedMs = Date.now() - startedAt;

      assert.equal(r, '¡Entendido! ¿Necesitas algo más?', palabra);
      assert.doesNotMatch(r, /No encuentro/i, `${palabra}: no debe intentar buscarlo como producto`);
      assert.equal(mockLLM.callCount, 0, `${palabra}: no debe llamar a Ollama`);
      assert.ok(elapsedMs < 100, `${palabra}: tardo ${elapsedMs}ms, se esperaba <100ms`);
    } finally {
      chatService.llm = originalLLM;
      chatService.limpiarHistorial(TEST_USER.id);
    }
  });
}

test('el gate conversacional no interfiere con una consulta real de STOCK en el mismo turno', async () => {
  const mockLLM = makeMockLLM({ '¿Cuánto stock tengo de arroz?': toolCallStock('arroz') });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r1 = await chatService.procesarMensaje(TEST_USER, 'ok');
    assert.equal(r1, '¡Entendido! ¿Necesitas algo más?');
    assert.equal(mockLLM.callCount, 0);

    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Cuánto stock tengo de arroz?');
    assert.match(r2, /Arroz/i);
    assert.equal(mockLLM.callCount, 1, 'una consulta real de STOCK debe seguir usando el piloto de Ollama normalmente');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('REORDER global ("que debo reordenar") no llama al piloto de Ollama', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r = await chatService.procesarMensaje(TEST_USER, '¿Qué debo reordenar?');
    assert.equal(typeof r, 'string');
    assert.ok(r.length > 0);
    assert.equal(mockLLM.callCount, 0, 'REORDER global es inequivoco por regex, no debe tocar Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

/**
 * Caso reportado: "ok y el menos?" como UN SOLO mensaje (no dos turnos).
 * mockLLM vacio: si Ollama fuera llamado, el test falla ruidosamente.
 */
test('caso reportado: "ok y el menos?" en un solo mensaje resuelve BOTTOM_PRODUCT sin Ollama ni "No encuentro"', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r1 = await chatService.procesarMensaje(TEST_USER, '¿Cuál es el producto más vendido?');
    assert.match(r1, /^El producto mas vendido/i);
    assert.equal(mockLLM.callCount, 0);

    const r2 = await chatService.procesarMensaje(TEST_USER, 'ok y el menos?');
    assert.match(r2, /^El producto menos vendido/i);
    assert.doesNotMatch(r2, /No encuentro/i, 'no debe buscar "ok" como producto');
    assert.equal(mockLLM.callCount, 0, 'debe resolverse por contexto, sin Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

/**
 * Bug 1: "¿Cuál es el producto más rentable?" no debe extraer "es rentable"
 * como nombre de producto ni consultar el catalogo. mockLLM vacio: si Ollama
 * fuera llamado, el test falla ruidosamente.
 */
test('"¿Cuál es el producto más rentable?" resuelve TOP_PROFIT_PRODUCT real, sin "No encuentro", sin Ollama', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r = await chatService.procesarMensaje(TEST_USER, '¿Cuál es el producto más rentable?');
    assert.match(r, /^El producto mas rentable/i);
    assert.doesNotMatch(r, /No encuentro/i, 'no debe tratar "es rentable" como nombre de producto');
    assert.doesNotMatch(r, /"es rentable"/i);
    assert.equal(mockLLM.callCount, 0, 'TOP_PROFIT_PRODUCT es inequivoco por regex, no debe tocar Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('"¿Cuál es el producto menos rentable?" resuelve BOTTOM_PROFIT_PRODUCT real, distinto de producto_menos_vendido, sin Ollama', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r = await chatService.procesarMensaje(TEST_USER, '¿Cuál es el producto menos rentable?');
    assert.match(r, /^El producto menos rentable/i);
    assert.doesNotMatch(r, /menos vendido/i, 'no debe confundirse con el eje de unidades vendidas');
    assert.equal(mockLLM.callCount, 0, 'BOTTOM_PROFIT_PRODUCT es inequivoco por regex, no debe tocar Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

/**
 * Bug reportado: "¿Cuál es mi mejor producto?" (frase vaga, sin la palabra
 * "rentable") no clasifica por regex -> pasa por _resolverConLLM, que elige
 * la tool `producto_mas_rentable`. El bug era que la continuacion "¿Y el
 * menos?" volvia a devolver el MISMO resultado top en vez de voltear a
 * BOTTOM_PROFIT_PRODUCT: PROFIT_INTENTS solo contenia TOP_PROFIT_PRODUCT y
 * el flip de interpretarMensaje no lo cubria, asi que la herencia de
 * contexto dejaba el intent fijo en TOP_PROFIT_PRODUCT sin voltear nunca.
 *
 * Traza esperada:
 * 1. Turno 1 (LLM): intent=UNKNOWN -> Ollama elige producto_mas_rentable ->
 *    productContext queda {intent: 'TOP_PROFIT_PRODUCT', tool:
 *    'producto_mas_rentable', nombre: <top real>}.
 * 2. Turno 2 "¿Y el menos?": interpretarMensaje ve current.intent=UNKNOWN +
 *    continuation=true + lastIntent='TOP_PROFIT_PRODUCT' (heredado) ->
 *    direccionRanking('y el menos')='MIN' -> como PROFIT_INTENTS.has(lastIntent)
 *    es true, voltea a 'BOTTOM_PROFIT_PRODUCT' (nunca a BOTTOM_PRODUCT).
 * 3. El dispatch determinista PROFIT_INTENTS ejecuta producto_menos_rentable
 *    de NUEVO contra la DB (no reusa el resultado del turno 1) y NO llama a
 *    Ollama por segunda vez.
 */
test('BUG: "¿Cuál es mi mejor producto?" (vago, via LLM) -> "¿Y el menos?" debe voltear a BOTTOM_PROFIT_PRODUCT, no repetir el top', async () => {
  const mockLLM = makeMockLLM({
    '¿Cuál es mi mejor producto?': toolCall('producto_mas_rentable', {}),
  });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    // Turno 1: frase vaga, sin señal lexica de rentabilidad -> pasa por Ollama.
    const r1 = await chatService.procesarMensaje(TEST_USER, '¿Cuál es mi mejor producto?');
    assert.match(r1, /^El producto mas rentable/i);
    assert.equal(mockLLM.callCount, 1, 'turno 1 (frase vaga) SI debe llamar a Ollama');

    const ctxTurno1 = chatService.productContext.get(TEST_USER.id);
    assert.equal(ctxTurno1.intent, 'TOP_PROFIT_PRODUCT', 'el resolver de Ollama debe guardar el eje correcto en el contexto');
    assert.equal(ctxTurno1.tool, 'producto_mas_rentable');

    // Turno 2: continuacion generica ("el menos") sobre contexto heredado.
    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Y el menos?');
    assert.match(r2, /^El producto menos rentable/i, 'debe voltear al eje de rentabilidad, direccion MIN');
    assert.doesNotMatch(r2, /menos vendido/i, 'NUNCA debe cruzar al eje de unidades vendidas');
    assert.notEqual(r1, r2, 'debe ejecutar el ranking inverso, no repetir el resultado del turno anterior');
    assert.equal(mockLLM.callCount, 1, 'la continuacion es inequivoca por contexto: NO debe volver a llamar a Ollama');

    const ctxTurno2 = chatService.productContext.get(TEST_USER.id);
    assert.equal(ctxTurno2.intent, 'BOTTOM_PROFIT_PRODUCT');
    assert.equal(ctxTurno2.tool, 'producto_menos_rentable');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

/**
 * Caso reportado: con la FRASE EXPLICITA ("más rentable", no la vaga "mejor
 * producto" del test anterior) la continuacion "¿Y el menos?" debia voltear
 * TOP_PROFIT_PRODUCT -> BOTTOM_PROFIT_PRODUCT igual que ya funciona
 * TOP_PRODUCT -> BOTTOM_PRODUCT (ver "Caso F" mas abajo para el eje ventas).
 * Espejo exacto de "Caso F", eje rentabilidad en vez de ventas. mockLLM
 * vacio: si algo llamara a Ollama, el test falla ruidosamente (toda la
 * cadena es determinista por regex + interpretarMensaje).
 */
test('Caso rentabilidad F: TOP_PROFIT_PRODUCT -> BOTTOM_PROFIT_PRODUCT -> TOP_PROFIT_PRODUCT (frase explicita, sin Ollama)', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r1 = await chatService.procesarMensaje(TEST_USER, '¿Cuál es el producto más rentable?');
    assert.match(r1, /^El producto mas rentable/i);

    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Y el menos?');
    assert.match(r2, /^El producto menos rentable/i, 'debe voltear a BOTTOM_PROFIT_PRODUCT, no repetir el top');
    assert.doesNotMatch(r2, /vendido/i, 'nunca debe cruzar al eje de unidades vendidas');
    assert.notEqual(r1, r2);

    const r3 = await chatService.procesarMensaje(TEST_USER, '¿Y el más?');
    assert.match(r3, /^El producto mas rentable/i);
    assert.doesNotMatch(r3, /vendido/i);

    assert.equal(mockLLM.callCount, 0, 'toda la cadena TOP->BOTTOM->TOP de rentabilidad debe resolverse sin Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('Caso rentabilidad G: BOTTOM_PROFIT_PRODUCT -> TOP_PROFIT_PRODUCT (espejo de "Caso G" del eje ventas)', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r1 = await chatService.procesarMensaje(TEST_USER, '¿Cuál es el producto menos rentable?');
    assert.match(r1, /^El producto menos rentable/i);

    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Y el más?');
    assert.match(r2, /^El producto mas rentable/i);
    assert.doesNotMatch(r2, /vendido/i);

    assert.equal(mockLLM.callCount, 0, 'la cadena BOTTOM->TOP de rentabilidad debe resolverse sin Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('los ejes ventas y rentabilidad nunca se cruzan en la continuacion generica "¿Y el menos?"', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;

  try {
    // Eje ventas: TOP_PRODUCT -> "¿Y el menos?" debe seguir en ventas, nunca mencionar rentabilidad/margen.
    chatService.limpiarHistorial(TEST_USER.id);
    await chatService.procesarMensaje(TEST_USER, '¿Cuál es el producto más vendido?');
    const ventasMenos = await chatService.procesarMensaje(TEST_USER, '¿Y el menos?');
    assert.match(ventasMenos, /^El producto menos vendido/i);
    assert.doesNotMatch(ventasMenos, /rentable|margen/i, 'la continuacion sobre ventas no debe cruzar al eje de rentabilidad');

    // Eje rentabilidad: TOP_PROFIT_PRODUCT -> "¿Y el menos?" debe seguir en rentabilidad, nunca mencionar "vendido".
    chatService.limpiarHistorial(TEST_USER.id);
    await chatService.procesarMensaje(TEST_USER, '¿Cuál es el producto más rentable?');
    const rentableMenos = await chatService.procesarMensaje(TEST_USER, '¿Y el menos?');
    assert.match(rentableMenos, /^El producto menos rentable/i);
    assert.doesNotMatch(rentableMenos, /vendido/i, 'la continuacion sobre rentabilidad no debe cruzar al eje de ventas');

    assert.equal(mockLLM.callCount, 0, 'ambos ejes son deterministas por regex, ninguno debe tocar Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

/**
 * Bug 2: "si"/"no" tras "¿Necesitas algo más?" se resuelven por contexto
 * (CONFIRM_CONTINUE pendiente), no repiten el mismo acuse de recibo.
 */
test('"si" tras "¿Necesitas algo más?" continua la conversacion, sin DB ni Ollama', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r1 = await chatService.procesarMensaje(TEST_USER, 'ok');
    assert.equal(r1, '¡Entendido! ¿Necesitas algo más?');

    const startedAt = Date.now();
    const r2 = await chatService.procesarMensaje(TEST_USER, 'si');
    const elapsedMs = Date.now() - startedAt;

    assert.equal(r2, '¡Genial! ¿Qué necesitas?');
    assert.notEqual(r2, r1, 'no debe repetir el mismo acuse de recibo');
    assert.ok(elapsedMs < 100, `tardo ${elapsedMs}ms, se esperaba <100ms`);
    assert.equal(mockLLM.callCount, 0, 'no debe llamar a Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('"no" tras "¿Necesitas algo más?" cierra cordialmente, sin DB ni Ollama', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r1 = await chatService.procesarMensaje(TEST_USER, 'vale');
    assert.equal(r1, '¡Entendido! ¿Necesitas algo más?');

    const startedAt = Date.now();
    const r2 = await chatService.procesarMensaje(TEST_USER, 'no');
    const elapsedMs = Date.now() - startedAt;

    assert.equal(r2, '¡Perfecto! Que tengas un buen día.');
    assert.ok(elapsedMs < 100, `tardo ${elapsedMs}ms, se esperaba <100ms`);
    assert.equal(mockLLM.callCount, 0, 'no debe llamar a Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('"si"/"no" SIN una pregunta de confirmacion pendiente caen al gate generico', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    // Sin turno previo que pregunte "¿Necesitas algo más?": no hay pendiente,
    // "si" se trata como acuse de recibo generico (comportamiento anterior).
    const r = await chatService.procesarMensaje(TEST_USER, 'si');
    assert.equal(r, '¡Entendido! ¿Necesitas algo más?');
    assert.equal(mockLLM.callCount, 0);
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('CONFIRM_CONTINUE pendiente no interfiere si el usuario sigue con una consulta real', async () => {
  const mockLLM = makeMockLLM({ '¿Cuánto stock tengo de arroz?': toolCallStock('arroz') });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    await chatService.procesarMensaje(TEST_USER, 'ok');

    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Cuánto stock tengo de arroz?');
    assert.match(r2, /Arroz/i);
    assert.equal(mockLLM.callCount, 1, 'debe seguir resolviendo la consulta real normalmente');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

/**
 * ============================================================
 * REFACTOR: resolver unico de Ollama (elimina _clasificarSemantico +
 * fallback final con historial completo). Bug real que motivo esto:
 * "¿Cuántas son mis ganancias?" tardaba ~20s y Ollama pedia datos que
 * ya existen en dashboard.service.js.
 * ============================================================
 */

// --- GLOBAL: variantes naturales de "ganancias" -> resumen_dashboard,
// UNA sola llamada a Ollama (antes: hasta 3 secuenciales), sin regex
// nueva por frase — es el mismo intent UNKNOWN de siempre, resuelto por
// el resolver unico en vez de la cascada de 3 mecanismos.
for (const mensaje of ['¿Cuáles son mis ganancias?', '¿Cuánto gané?', '¿Cuál es mi margen?']) {
  test(`GLOBAL: "${mensaje}" usa resumen_dashboard via Ollama en UNA sola llamada`, async () => {
    const mockLLM = makeMockLLM({ [mensaje]: toolCall('resumen_dashboard', {}) });
    const originalLLM = chatService.llm;
    chatService.llm = mockLLM;
    chatService.limpiarHistorial(TEST_USER.id);

    try {
      const r = await chatService.procesarMensaje(TEST_USER, mensaje);
      assert.match(r, /ingresos|margen/i, mensaje);
      assert.doesNotMatch(r, /No encuentro/i, `${mensaje}: no debe tratar la pregunta como busqueda de producto`);
      assert.equal(mockLLM.callCount, 1, `${mensaje}: una sola llamada a Ollama (antes hasta 3 secuenciales)`);
    } finally {
      chatService.llm = originalLLM;
      chatService.limpiarHistorial(TEST_USER.id);
    }
  });
}

test('GLOBAL: "¿Cuál es el menos vendido?" (sin la palabra "producto") sigue siendo BOTTOM_PRODUCT/GLOBAL', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r = await chatService.procesarMensaje(TEST_USER, '¿Cuál es el menos vendido?');
    assert.match(r, /^El producto menos vendido/i);
    assert.equal(mockLLM.callCount, 0, 'resuelve por regex, no toca Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

// --- PRODUCT: consultas puntuales de catalogo, incluyendo el typo real
// "gasesosa" que antes se resolvia con la heuristica esConsultaProductoSimple
// (retirada) y ahora pasa por el resolver unico de Ollama.
test('PRODUCT: "tengo gaseosa?" resuelve STOCK real via Ollama', async () => {
  const mockLLM = makeMockLLM({ 'tengo gaseosa?': toolCallStock('gaseosa') });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r = await chatService.procesarMensaje(TEST_USER, 'tengo gaseosa?');
    assert.match(r, /Gaseosa/i);
    assert.equal(mockLLM.callCount, 1);
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('PRODUCT: "gasesosa" (typo, palabra suelta) pasa por el resolver de Ollama y el fuzzy matching real la encuentra', async () => {
  const mockLLM = makeMockLLM({ gasesosa: toolCallStock('gasesosa') });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r = await chatService.procesarMensaje(TEST_USER, 'gasesosa');
    assert.match(r, /Gaseosa/i, 'el matching fuzzy real (Levenshtein) debe encontrar "Gaseosa 1.5L"');
    assert.equal(mockLLM.callCount, 1, 'palabra suelta sin intent regex es UNKNOWN -> pasa por el resolver de Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('PRODUCT: "¿Cuánto he vendido de arroz/gaseosa?" resuelve SALES por regex, sin Ollama', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;

  try {
    for (const [mensaje, esperado] of [
      ['¿Cuánto he vendido de arroz?', /Arroz/i],
      ['¿Cuánto he vendido de gaseosa?', /Gaseosa/i],
    ]) {
      chatService.limpiarHistorial(TEST_USER.id);
      const r = await chatService.procesarMensaje(TEST_USER, mensaje);
      assert.match(r, esperado, mensaje);
    }
    assert.equal(mockLLM.callCount, 0, 'SALES con producto explicito es inequivoco por regex, no debe tocar Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

// --- CONTEXTO: secuencia exacta pedida — STOCK explicito, continuacion
// pura, cambio de producto sin intencion propia (ambiguo), y resolucion
// de esa ambiguedad como REORDER. Nada de este mecanismo se toco en el
// refactor de hoy; se re-verifica que sigue intacto.
test('CONTEXTO: secuencia completa arroz -> queda -> de gaseosa (ambiguo) -> deberia comprar mas', async () => {
  const mockLLM = makeMockLLM({ '¿Cuánto stock tengo de arroz?': toolCallStock('arroz') });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r1 = await chatService.procesarMensaje(TEST_USER, '¿Cuánto stock tengo de arroz?');
    assert.match(r1, /Arroz/i);
    assert.equal(mockLLM.callCount, 1);

    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Y cuánto queda?');
    assert.match(r2, /Arroz/i, 'continuacion pura: mismo producto');
    assert.equal(mockLLM.callCount, 1, 'ollama_ms=0 para la continuacion');

    const r3 = await chatService.procesarMensaje(TEST_USER, '¿Y de gaseosa?');
    assert.equal(r3, '¿Quieres saber cuánto stock tienes de gaseosa o si deberías comprar más?', 'producto nuevo sin verbo propio: ambiguo, pide aclaracion');
    assert.equal(mockLLM.callCount, 1, 'la aclaracion no debe llamar a Ollama');

    const r4 = await chatService.procesarMensaje(TEST_USER, '¿Y debería comprar más?');
    assert.match(r4, /Gaseosa/i, 'resuelve la ambiguedad como REORDER sobre gaseosa');
    assert.equal(mockLLM.callCount, 1, 'resolver la ambiguedad tampoco llama a Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

// --- CONVERSACIÓN: secuencia exacta pedida.
test('CONVERSACIÓN: hola / gracias / ok, ninguno toca DB ni Ollama', async () => {
  const mockLLM = makeMockLLM({});
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;

  try {
    for (const mensaje of ['hola', 'gracias', 'ok']) {
      chatService.limpiarHistorial(TEST_USER.id);
      const r = await chatService.procesarMensaje(TEST_USER, mensaje);
      assert.equal(typeof r, 'string');
      assert.ok(r.length > 0, mensaje);
    }
    assert.equal(mockLLM.callCount, 0, 'saludo/agradecimiento/acuse de recibo nunca deben tocar Ollama');
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

// --- SEGURIDAD
test('SEGURIDAD: una pregunta GLOBAL nunca busca "producto"/"ganancias"/"son ganancias" como nombre de producto', async () => {
  const mockLLM = makeMockLLM({
    '¿Cuáles son mis ganancias?': toolCall('resumen_dashboard', {}),
    '¿Cuál es el producto más rentable?': toolCall('producto_mas_rentable', {}),
  });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;

  try {
    for (const mensaje of ['¿Cuáles son mis ganancias?', '¿Cuál es el producto más rentable?', '¿Cuál es el producto más vendido?']) {
      chatService.limpiarHistorial(TEST_USER.id);
      const r = await chatService.procesarMensaje(TEST_USER, mensaje);
      assert.doesNotMatch(r, /No encuentro/i, mensaje);
      assert.doesNotMatch(r, /"producto"|"ganancias"|"son ganancias"|"es rentable"/i, mensaje);
    }
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('SEGURIDAD: si Ollama responde texto libre sin tool_call, NUNCA se acepta como dato de negocio', async () => {
  const textoAlucinado = 'Para poder calcular tus ganancias, necesitaría información sobre los precios de venta y costo de tus productos.';
  const mockLLM = makeMockLLM({ '¿Cuáles son mis ganancias?': sinToolCall(textoAlucinado) });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r = await chatService.procesarMensaje(TEST_USER, '¿Cuáles son mis ganancias?');
    assert.notEqual(r, textoAlucinado, 'el texto libre de Ollama nunca debe llegar tal cual al usuario');
    assert.doesNotMatch(r, /necesitaría información sobre los precios/i);
    assert.match(r, /No logré identificar/i, 'debe caer en la aclaracion generica y segura, no en la alucinacion de Ollama');
    assert.equal(mockLLM.callCount, 1);
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});

test('SEGURIDAD: dos requests concurrentes del mismo usuario se serializan y no mezclan respuestas', async () => {
  const mockLLM = makeMockLLM(
    {
      '¿Cuánto stock tengo de arroz?': toolCallStock('arroz'),
      '¿Cuánto tengo de gaseosa?': toolCallStock('gaseosa'),
    },
    { delayMs: 60 }
  );
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const startedAt = Date.now();
    const p1 = chatService.procesarMensaje(TEST_USER, '¿Cuánto stock tengo de arroz?');
    const p2 = chatService.procesarMensaje(TEST_USER, '¿Cuánto tengo de gaseosa?');
    const [r1, r2] = await Promise.all([p1, p2]);
    const elapsedMs = Date.now() - startedAt;

    assert.match(r1, /Arroz/i, 'respuesta 1 debe ser sobre arroz');
    assert.doesNotMatch(r1, /Gaseosa/i, 'respuesta 1 no debe mezclarse con la 2');
    assert.match(r2, /Gaseosa/i, 'respuesta 2 debe ser sobre gaseosa');
    assert.doesNotMatch(r2, /Arroz/i, 'respuesta 2 no debe mezclarse con la 1');
    assert.equal(mockLLM.callCount, 2, 'ambas preguntas necesitan su propia llamada a Ollama');
    assert.ok(elapsedMs >= 110, `elapsed=${elapsedMs}ms: deben serializarse (suma de delays ~120ms), no correr en paralelo (~60ms)`);
  } finally {
    chatService.llm = originalLLM;
    chatService.limpiarHistorial(TEST_USER.id);
  }
});
