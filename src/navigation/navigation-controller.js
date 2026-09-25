CPN.NavigationController = class NavigationController {
  constructor({ getConversationId, onAttempt } = {}) {
    this.getConversationId = getConversationId || (() => null);
    this.onAttempt = onAttempt || (() => {});
    const urlTarget = new URL(location.href).searchParams.get('message');
    this.diagnostics = {
      strategy: 'same-document message route',
      targetMessageId: urlTarget || null,
      targetConversationId: this.getConversationId(),
      targetMounted: 'unknown',
      deepLinkAttempted: urlTarget ? 'yes' : 'no',
      result: urlTarget ? 'Deep link loaded; checking ChatGPT positioning.' : 'No navigation attempted.',
    };
  }

  getDiagnostics() { return { ...this.diagnostics }; }

  goToPrompt(prompt) {
    const conversationId = this.getConversationId();
    const messageId = prompt?.messageId;
    const currentUrl = new URL(location.href);
    const validTarget = typeof messageId === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(messageId)
      && !messageId.startsWith('dom-element-')
      && typeof conversationId === 'string'
      && CPN.getConversationId(currentUrl.href) === conversationId;
    this.diagnostics = {
      strategy: 'same-document message route',
      targetMessageId: typeof messageId === 'string' ? messageId : null,
      targetConversationId: conversationId || null,
      targetMounted: prompt?.domElement?.isConnected ? 'yes' : 'no',
      deepLinkAttempted: validTarget ? 'yes' : 'no',
      result: validTarget ? 'Same-document message route requested.' : 'No valid message ID or current conversation route.',
    };
    this.onAttempt(this.diagnostics);
    if (!validTarget) return false;

    const debugEnabled = currentUrl.searchParams.get('cpnDebug') === '1';
    currentUrl.search = '';
    if (debugEnabled) currentUrl.searchParams.set('cpnDebug', '1');
    currentUrl.searchParams.set('message', messageId);
    currentUrl.hash = '';
    history.pushState(null, '', currentUrl.href);
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    return true;
  }
};
