const LLMProvider = require('./provider');

class OllamaProvider extends LLMProvider {
  constructor(baseUrl, model = 'qwen2.5:3b') {
    super();
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.model = model;
  }

  async chat(messages, tools) {
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

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
  }
}

module.exports = OllamaProvider;
