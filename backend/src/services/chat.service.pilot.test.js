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

function makeMockLLM(responses) {
  let callCount = 0;
  const calls = [];
  return {
    async chat(messages, tools) {
      callCount += 1;
      const userMsg = messages[messages.length - 1].content;
      calls.push({ userMsg, systemMsgCount: messages.filter((m) => m.role === 'system').length });
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
  const mockLLM = makeMockLLM({
    '¿Cuánto tengo de gaseosa?': toolCallStock('gaseosa'),
    '¿Y debería comprar más?': sinToolCall('no es stock'),
  });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    await chatService.procesarMensaje(TEST_USER, '¿Cuánto tengo de gaseosa?');
    assert.equal(mockLLM.callCount, 1);

    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Y debería comprar más?');
    assert.match(r2, /Gaseosa/i);
    assert.equal(mockLLM.callCount, 2, 'REORDER explicito no migrado: el piloto igual intenta Ollama antes de ceder');

    const r3 = await chatService.procesarMensaje(TEST_USER, '¿Y de arroz?');
    assert.equal(r3, '¿Quieres saber cuánto stock tienes de arroz o si deberías comprar más?');
    assert.equal(mockLLM.callCount, 2, 'la aclaracion no debe llamar a Ollama');
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
  const mockLLM = makeMockLLM({ '¿Debería comprar más de gaseosa?': sinToolCall('no es stock') });
  const originalLLM = chatService.llm;
  chatService.llm = mockLLM;
  chatService.limpiarHistorial(TEST_USER.id);

  try {
    const r1 = await chatService.procesarMensaje(TEST_USER, '¿Debería comprar más de gaseosa?');
    assert.match(r1, /Gaseosa/i);
    assert.equal(mockLLM.callCount, 1);

    const r2 = await chatService.procesarMensaje(TEST_USER, '¿Y de arroz?');
    assert.equal(r2, '¿Quieres saber cuánto stock tienes de arroz o si deberías comprar más?');
    assert.equal(mockLLM.callCount, 1, 'la aclaracion no debe llamar a Ollama');
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
