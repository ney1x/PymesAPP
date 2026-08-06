const { mlServiceUrl } = require('../config/env');

const DEFAULT_TIMEOUT = 8000;

const request = async (path, { method = 'GET', body } = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const res = await fetch(`${mlServiceUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`ML service responded ${res.status}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
};

const predict = async (payload) => {
  const result = await request('/predict', { method: 'POST', body: payload });
  return result;
};

const health = async () => {
  return request('/health');
};

module.exports = { predict, health, request };
