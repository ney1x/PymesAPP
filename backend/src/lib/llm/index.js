const LLMProvider = require('./provider');
const OllamaProvider = require('./ollama');
const env = require('../../config/env');

let _cachedProvider = null;

function createLLMProvider() {
  if (_cachedProvider) return _cachedProvider;

  const providerName = env.llmProvider || 'ollama';

  if (providerName !== 'ollama') {
    throw new Error(`Proveedor LLM no soportado: ${providerName}. Solo 'ollama' está disponible.`);
  }

  const baseUrl = env.ollamaUrl || 'http://ollama:11434/v1';
  const model = env.ollamaModel || 'qwen2.5:3b';

  _cachedProvider = new OllamaProvider(baseUrl, model);
  return _cachedProvider;
}

function getLLMProvider() {
  return _cachedProvider;
}

module.exports = { createLLMProvider, getLLMProvider, LLMProvider };