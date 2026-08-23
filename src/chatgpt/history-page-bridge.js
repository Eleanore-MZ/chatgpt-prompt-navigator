// MAIN-world bridge. It discovers only the current page's observed messages
// request and fetches that same-origin URL with the browser's session.
(function () {
  const REQUEST = 'CPN_HISTORY_REQUEST';
  const RESPONSE = 'CPN_HISTORY_RESPONSE';

  function validId(value) {
    return typeof value === 'string' && value.length > 0 && value.length < 200;
  }

  function describe(url) {
    return { pathname: url.pathname, search: url.search };
  }

  function findObservedUrls() {
    const found = [];
    const entries = performance.getEntriesByType('resource');
    for (const entry of entries.reverse()) {
      try {
        const url = new URL(entry.name);
        if (url.origin !== location.origin) continue;
        if (!/(^|\/)messages(?:$|[/?])/i.test(url.pathname)) continue;
        if (!found.some(candidate => candidate.href === url.href)) found.push(url);
      } catch (_) { /* Ignore malformed resource entries. */ }
    }
    return found;
  }

  function isMessagesPath(pathname) {
    return /(^|\/)messages(?:$|[/?])/i.test(pathname);
  }

  function reply(requestId, payload) {
    window.postMessage({ type: RESPONSE, requestId, ...payload }, location.origin);
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.type !== REQUEST || !validId(data.requestId)) return;

    if (data.action === 'init') {
      reply(data.requestId, { ok: true, ready: true });
      return;
    }

    if (data.action === 'discover' || data.action === 'inspect-resources') {
      const candidates = findObservedUrls();
      reply(data.requestId, { ok: true, candidates: candidates.map(describe) });
      return;
    }

    if ((data.action === 'fetch-initial' || data.action === 'fetch-page') && data.endpoint) {
      const endpoint = data.endpoint;
      if (typeof endpoint.pathname !== 'string' || !isMessagesPath(endpoint.pathname)) {
        reply(data.requestId, { ok: false, errorCode: 'ENDPOINT_INVALID', error: 'Constructed endpoint is not a messages path.' });
        return;
      }
      let url;
      try {
        url = new URL(endpoint.pathname + (endpoint.search || ''), location.origin);
      } catch (_) {
        reply(data.requestId, { ok: false, errorCode: 'ENDPOINT_INVALID', error: 'Constructed endpoint URL is invalid.' });
        return;
      }
      if (data.action === 'fetch-page') {
        if (typeof data.before !== 'string' || !data.before) {
          reply(data.requestId, { ok: false, errorCode: 'BOOTSTRAP_CURSOR_UNAVAILABLE', error: 'A before cursor is required for a history page.' });
          return;
        }
        url.searchParams.set('before', data.before);
      } else {
        url.searchParams.delete('before');
      }
      url.searchParams.set('include_has_versions', 'true');
      url.searchParams.set('num_turns', '10');
      try {
        const response = await fetch(url.href, { credentials: 'include', headers: { Accept: 'application/json' } });
        if (!response.ok) {
          reply(data.requestId, { ok: false, errorCode: data.action === 'fetch-initial' ? 'INITIAL_PAGE_HTTP_ERROR' : 'HISTORY_HTTP_ERROR', error: `History request returned HTTP ${response.status}.` });
          return;
        }
        let body;
        try { body = await response.json(); } catch (_) {
          reply(data.requestId, { ok: false, errorCode: data.action === 'fetch-initial' ? 'INITIAL_PAGE_INVALID_JSON' : 'HISTORY_INVALID_JSON', error: 'History response was not valid JSON.' });
          return;
        }
        if (!body || !Array.isArray(body.messages) || !body.page_info) {
          reply(data.requestId, { ok: false, errorCode: data.action === 'fetch-initial' ? 'INITIAL_PAGE_INVALID_SHAPE' : 'HISTORY_INVALID_SHAPE', error: 'History response did not contain the expected messages/page_info shape.' });
          return;
        }
        reply(data.requestId, { ok: true, page: body });
      } catch (error) {
        reply(data.requestId, { ok: false, errorCode: data.action === 'fetch-initial' ? 'INITIAL_PAGE_FETCH_ERROR' : 'HISTORY_FETCH_ERROR', error: error instanceof Error ? error.message : 'History request failed.' });
      }
      return;
    }
  });
  document.documentElement?.setAttribute('data-cpn-history-bridge-ready', 'true');
})();
