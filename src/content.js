const DEBUG = true;
const log = (...args) => DEBUG && console.debug('[CPN]', ...args);

let rail;
let dataSource;
let navigation;
let mutationObserver;
let refreshTimer;
let currentConversationId;

function refresh(reason = 'refresh') {
  if (!rail || !dataSource) return;
  const prompts = dataSource.getPrompts();
  rail.render(prompts, dataSource.getStatus(), currentConversationId);
  log(reason, { conversationId: currentConversationId, prompts: prompts.length });
}

function scheduleRefresh(reason) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh(reason), 80);
}

function resetForRoute(url) {
  currentConversationId = CPN.getConversationId(url);
  log('route changed', currentConversationId);
  // Keep one rail and one observer; clear/re-read the source on SPA changes.
  refresh('route refresh');
}

function start() {
  if (document.getElementById('cpn-navigation-rail')) return;
  dataSource = new CPN.DomConversationDataSource();
  navigation = new CPN.NavigationController({
    onAttempt: prompt => log('navigation attempt', prompt.messageId),
  });
  rail = new CPN.NavigationRail({ onSelect: prompt => navigation.goToPrompt(prompt) });
  currentConversationId = CPN.getConversationId();
  mutationObserver = new MutationObserver(() => scheduleRefresh('DOM mutation'));
  mutationObserver.observe(document.body, { childList: true, subtree: true });
  CPN.observeRoute(resetForRoute);
  refresh('initial refresh');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
