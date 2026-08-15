const test = require('node:test');
const assert = require('node:assert/strict');
const OllamaProvider = require('./ollama');

function withMockFetch(fn) {
  const originalFetch = global.fetch;
  return async () => {
    try {
      await fn();
    } finally {
      global.fetch = originalFetch;
    }
  };
}

test('OllamaProvider.chat pasa el signal externo a fetch', withMockFetch(async () => {
  let capturedInit = null;
  global.fetch = async (url, init) => {
    capturedInit = init;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok', tool_calls: [] } }] }),
    };
  };

  const provider = new OllamaProvider('http://ollama:11434/v1', 'qwen2.5:3b');
  const controller = new AbortController();
  await provider.chat([{ role: 'user', content: 'hola' }], [], controller.signal);

  assert.ok(capturedInit.signal, 'fetch debe recibir un signal');
  assert.equal(capturedInit.signal.aborted, false);
}));

test('OllamaProvider.chat aborta fetch si el signal externo ya esta abortado', withMockFetch(async () => {
  let capturedInit = null;
  global.fetch = async (url, init) => {
    capturedInit = init;
    if (init.signal?.aborted) {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok', tool_calls: [] } }] }) };
  };

  const provider = new OllamaProvider('http://ollama:11434/v1', 'qwen2.5:3b');
  const controller = new AbortController();
  controller.abort(new Error('cliente desconectado'));

  await assert.rejects(
    () => provider.chat([{ role: 'user', content: 'hola' }], [], controller.signal),
    /aborted/i
  );
  assert.ok(capturedInit.signal.aborted, 'el signal pasado a fetch debe estar abortado');
}));

test('OllamaProvider.chat funciona sin signal (uso existente, sin romper compatibilidad)', withMockFetch(async () => {
  global.fetch = async (url, init) => {
    assert.ok(init.signal, 'siempre debe pasar algun signal (el del timeout interno)');
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok', tool_calls: [] } }] }) };
  };

  const provider = new OllamaProvider('http://ollama:11434/v1', 'qwen2.5:3b');
  const result = await provider.chat([{ role: 'user', content: 'hola' }], []);
  assert.equal(result.content, 'ok');
}));
