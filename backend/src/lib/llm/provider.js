class LLMProvider {
  async chat(messages, tools, signal) {
    throw new Error('Not implemented');
  }
}

module.exports = LLMProvider;