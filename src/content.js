const DEBUG = false;
const log = (...args) => DEBUG && console.debug('[CPN]', ...args);

let rail;
let dataSource;
let navigation;
let mutationObserver;
let refreshTimer;
let currentConversationId;
let historyLoadGeneration = 0;

function refresh(reason = 'refresh') {
  if (!rail || !dataSource) return;
  const prompts = dataSource.getPrompts();
  rail.render(prompts, dataSource.getStatus(), currentConversationId);
  log(reason, { conversationId: currentConversationId, prompts: prompts.length, status: dataSource.getStatus() });
}

function scheduleRefresh(reason) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh(reason), 80);
}

function resetForRoute(url) {
  currentConversationId = CPN.getConversationId(url);
  historyLoadGeneration += 1;
  startHistoryLoad(historyLoadGeneration);
  log('route changed', currentConversationId);
  // Keep one rail and one observer; clear/re-read the source on SPA changes.
  refresh('route refresh');
}

function start() {
  if (document.getElementById('cpn-navigation-rail')) return;
  const domSource = new CPN.DomConversationDataSource();
  dataSource = domSource;
  navigation = new CPN.NavigationController({
    onAttempt: prompt => log('navigation attempt', prompt.messageId),
  });
  rail = new CPN.NavigationRail({ onSelect: prompt => navigation.goToPrompt(prompt) });
  currentConversationId = CPN.getConversationId();
  mutationObserver = new MutationObserver(() => scheduleRefresh('DOM mutation'));
  mutationObserver.observe(document.body, { childList: true, subtree: true });
  CPN.observeRoute(resetForRoute);
  refresh('initial refresh');
  startHistoryLoad(++historyLoadGeneration);
}

function bridgeRequest(action, fields = {}) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const listener = event => {
      const data = event.data;
      if (event.source !== window || event.origin !== location.origin || data?.type !== 'CPN_HISTORY_RESPONSE' || data.requestId !== requestId) return;
      clearTimeout(timeout); window.removeEventListener('message', listener);
      if (data.ok) resolve(data);
      else {
        const error = new Error(data.error || 'History bridge request failed.');
        error.code = data.errorCode || 'BRIDGE_REQUEST_FAILED';
        error.details = data;
        reject(error);
      }
    };
    const timeout = setTimeout(() => {
      window.removeEventListener('message', listener);
      const error = new Error(document.documentElement.hasAttribute('data-cpn-history-bridge-ready')
        ? 'Bridge response communication timed out.'
        : 'MAIN-world bridge did not initialize; script injection may have failed.');
      error.code = document.documentElement.hasAttribute('data-cpn-history-bridge-ready')
        ? 'BRIDGE_COMMUNICATION_TIMEOUT' : 'MAIN_WORLD_INJECTION_FAILED';
      reject(error);
    }, 10000);
    window.addEventListener('message', listener);
    window.postMessage({ type: 'CPN_HISTORY_REQUEST', requestId, action, ...fields }, location.origin);
  });
}

async function startHistoryLoad(generation) {
  if (!rail || !dataSource) return;
  const domSource = dataSource instanceof CPN.DomConversationDataSource ? dataSource : dataSource.domSource;
  const mounted = domSource.getPrompts();
  const endpoint = CPN.historyEndpoint.buildHistoryEndpoint({ conversationId: currentConversationId });
  let resolutionDetails = null;
  const history = new CPN.HistoryConversationDataSource({
    domSource,
    requestPage: async before => (await bridgeRequest('fetch-page', { endpoint, conversationId: currentConversationId, before })).page,
  });
  dataSource = history;
  history.seedMountedPrompts(mounted);
  const domDiagnostics = domSource.getDiagnostics();
  history.setDiagnostic('bridge-initializing', 'Initializing MAIN-world history bridge.', {
    url: location.href,
    conversationId: currentConversationId,
    mountedMessageIds: domDiagnostics.mountedMessageIds,
  });
  refresh('history loading');
  try {
    await bridgeRequest('init');
    history.setDiagnostic('bridge-ready', 'MAIN-world bridge initialized.');
    refresh('bridge ready');
    const observed = await bridgeRequest('inspect-resources');
    if (generation !== historyLoadGeneration) return;
    const match = CPN.historyEndpoint.compareObserved(endpoint, observed.candidates || []);
    resolutionDetails = {
      url: location.href,
      conversationId: currentConversationId,
      constructed: endpoint,
      candidates: observed.candidates || [],
      match,
      mountedMessageIds: domDiagnostics.mountedMessageIds,
    };
    if (!endpoint) {
      history.fail('endpoint-unconfigured', 'The current history endpoint is not configured; no route is guessed.', resolutionDetails);
      domSource.failure = 'endpoint-unconfigured: current history endpoint is not configured.';
      domSource.failureDetails = resolutionDetails;
      dataSource = domSource; refresh('endpoint unconfigured');
      return;
    }
    history.setDiagnostic('endpoint-resolved', 'History endpoint constructed from the current conversation ID.', {
      ...resolutionDetails,
    });
    refresh('endpoint resolved');
    history.setDiagnostic('auth-session-fetching', 'Fetching the authenticated page session.');
    refresh('auth session fetching');
    await bridgeRequest('auth-check');
    history.setDiagnostic('auth-ready', 'Authenticated history session is ready.');
    refresh('auth ready');
    const loaded = await history.loadInitial(
      async () => (await bridgeRequest('fetch-initial', { endpoint, conversationId: currentConversationId })).page,
      () => { if (generation === historyLoadGeneration) refresh('history update'); },
    );
    if (!loaded && generation === historyLoadGeneration) {
      domSource.failure = history.getStatus().error || 'History API unavailable.';
      domSource.failureDetails = { ...resolutionDetails, stage: history.getStatus().stage, ...(history.getStatus().details || {}) };
      dataSource = domSource; refresh('history fallback');
    }
  } catch (error) {
    if (generation !== historyLoadGeneration) return;
    const stage = error.code === 'NO_HISTORY_ENDPOINT' ? 'no-history-endpoint'
      : error.code === 'HISTORY_HTTP_ERROR' ? 'history-fetch-http-error'
      : error.code === 'HISTORY_INVALID_JSON' || error.code === 'HISTORY_INVALID_SHAPE' ? 'history-response-invalid-shape'
      : error.code === 'AUTH_SESSION_HTTP_ERROR' ? 'auth-session-http-error'
      : error.code === 'AUTH_SESSION_INVALID_SHAPE' || error.code === 'AUTH_SESSION_ERROR' ? 'auth-session-invalid-shape'
      : error.code === 'HISTORY_HTTP_401_RETRY_FAILED' ? 'initial-page-http-error'
      : error.code === 'BRIDGE_COMMUNICATION_TIMEOUT' ? 'bridge-communication-failed'
      : error.code === 'MAIN_WORLD_INJECTION_FAILED' ? 'main-world-injection-failed'
      : 'bridge-request-failed';
    const details = { ...(resolutionDetails || {}), ...(error.details?.candidates ? { candidates: error.details.candidates } : {}) };
    details.url = location.href;
    details.conversationId = currentConversationId;
    details.mountedMessageIds = domDiagnostics.mountedMessageIds;
    history.fail(stage, error.message, details);
    console.warn('[CPN] history bootstrap stopped', { stage, message: error.message, conversationId: currentConversationId, ...details });
    domSource.failure = `${stage}: ${error.message}`;
    domSource.failureDetails = { stage, ...details };
    dataSource = domSource; refresh('history unavailable');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
