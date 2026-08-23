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
    return { name: 'DOM', complete: false };
  }

  fallbackId(element) {
    if (!this.fallbackIds.has(element)) {
      this.fallbackIds.set(element, `dom-element-${++this.nextFallbackId}`);
    }
    return this.fallbackIds.get(element);
  }
};
