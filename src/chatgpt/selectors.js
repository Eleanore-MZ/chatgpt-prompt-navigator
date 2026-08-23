// ChatGPT-specific DOM assumptions live in this file.
window.CPN = window.CPN || {};
CPN.selectors = {
  // Primary selector for the current milestone; verify against the user's
  // current ChatGPT markup before adding any complete-history source.
  userMessages: '[data-message-author-role="user"]',
  messageIdAttributes: ['data-message-id'],
};

CPN.findUserMessageElements = (root = document) => [...root.querySelectorAll(CPN.selectors.userMessages)];

CPN.getMessageId = (element) => {
  for (const attribute of CPN.selectors.messageIdAttributes) {
    const value = element.getAttribute(attribute);
    if (value) return value;
  }
  return element.getAttribute('data-message-id') || null;
};

CPN.getMessageText = (element) => {
  // innerText reflects what the user can read and avoids copying hidden markup.
  return (element.innerText || element.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
};
