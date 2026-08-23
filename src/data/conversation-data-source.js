/** @typedef {{messageId: string, index: number, role: 'user', text: string, timestamp: null, domElement: Element|null}} PromptRecord */

window.CPN = window.CPN || {};
CPN.ConversationDataSource = class ConversationDataSource {
  /** @returns {PromptRecord[]} */
  getPrompts() {
    throw new Error('ConversationDataSource.getPrompts() must be implemented');
  }

  getStatus() {
    return { name: 'unknown', complete: false };
  }
};
