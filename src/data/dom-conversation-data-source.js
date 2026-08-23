CPN.DomConversationDataSource = class DomConversationDataSource extends CPN.ConversationDataSource {
  constructor() {
    super();
    this.fallbackIds = new WeakMap();
    this.nextFallbackId = 0;
  }

  getPrompts() {
    return CPN.findUserMessageElements().map((element, index) => ({
      messageId: CPN.getMessageId(element) || this.fallbackId(element),
      index,
      role: 'user',
      text: CPN.getMessageText(element),
      timestamp: null,
      domElement: element,
    })).filter(prompt => prompt.text);
  }

  getStatus() {
    return { name: 'DOM', complete: false, phase: 'incomplete', stage: this.failureDetails?.stage || 'dom-fallback', pagesFetched: 0, error: this.failure || null, details: this.failureDetails || {} };
  }

  getDiagnostics() {
    const prompts = this.getPrompts();
    return {
      mountedCount: prompts.length,
      mountedMessageIds: prompts.filter(prompt => !prompt.messageId.startsWith('dom-element-')).map(prompt => prompt.messageId),
    };
  }

  fallbackId(element) {
    if (!this.fallbackIds.has(element)) {
      this.fallbackIds.set(element, `dom-element-${++this.nextFallbackId}`);
    }
    return this.fallbackIds.get(element);
  }
};
