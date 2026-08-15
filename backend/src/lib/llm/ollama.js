const LLMProvider = require('./provider');

const REQUEST_TIMEOUT_MS = 120_000;

class OllamaProvider extends LLMProvider {
  constructor(baseUrl, model = 'qwen2.5:3b') {
    super();
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.model = model;
  }

  async chat(messages, tools, signal) {
    const body = {
      model: this.model,
      messages: messages.map((m) => {
        const message = {
          role: m.role,
          content: m.content || '',
        };

        if (m.tool_calls) message.tool_calls = m.tool_calls;
        if (m.tool_call_id) message.tool_call_id = m.tool_call_id;

        return message;
      }),
      temperature: 0.1,
      stream: false,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      }));
      body.tool_choice = 'auto';
    }

    // Timeout de seguridad + cancelacion real si el caller aborta (ej. el
    // cliente HTTP cerro la conexion). Sin esto un request huerfano puede
    // quedar corriendo indefinidamente contra Ollama (lo reprodujimos: un
    // curl cortado a los 60s en el cliente siguio vivo en el servidor).
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(new Error(`Ollama timeout tras ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS);
    const onExternalAbort = () => timeoutController.abort(signal.reason);
    if (signal) {
      if (signal.aborted) timeoutController.abort(signal.reason);
      else signal.addEventListener('abort', onExternalAbort);
    }

    try {
      const resp = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: timeoutController.signal,
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Ollama error ${resp.status}: ${errText}`);
      }

      const data = await resp.json();
      const choice = data.choices?.[0];
      if (!choice) {
        throw new Error('Ollama: respuesta vacía');
      }

      return {
        content: choice.message?.content || '',
        toolCalls: choice.message?.tool_calls || [],
      };
    } finally {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

module.exports = OllamaProvider;
