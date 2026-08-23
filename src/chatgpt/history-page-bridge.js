// MAIN-world bridge. It discovers only the current page's observed messages
// request and fetches that same-origin URL with the browser's session.
(function () {
  const REQUEST = 'CPN_HISTORY_REQUEST';
  const RESPONSE = 'CPN_HISTORY_RESPONSE';
  let discoveredUrl = null;

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

  function isUsableHistoryUrl(url) {
    return url.searchParams.has('before') && url.searchParams.has('include_has_versions') && url.searchParams.has('num_turns');
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

    if (data.action === 'discover') {
      const candidates = findObservedUrls();
      const url = candidates.find(isUsableHistoryUrl) || null;
      discoveredUrl = url;
      reply(data.requestId, {
        ok: Boolean(url),
        url: url ? describe(url) : null,
        candidates: candidates.map(describe),
        errorCode: url ? null : 'NO_HISTORY_ENDPOINT',
        error: url ? null : 'No observed history endpoint was found in Resource Timing entries.',
      });
      return;
    }

    if (data.action !== 'fetch-page' || !validId(data.before)) return;
    const base = discoveredUrl || findObservedUrls().find(isUsableHistoryUrl);
    if (!base || base.origin !== location.origin) {
      reply(data.requestId, { ok: false, errorCode: 'NO_HISTORY_ENDPOINT', error: 'No observed same-origin history request is available.' });
      return;
    }
    const url = new URL(base.href);
    url.searchParams.set('before', data.before);
    url.searchParams.set('include_has_versions', 'true');
    url.searchParams.set('num_turns', '10');
    try {
      const response = await fetch(url.href, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!response.ok) {
        reply(data.requestId, { ok: false, errorCode: 'HISTORY_HTTP_ERROR', error: `History request returned HTTP ${response.status}.` });
        return;
      }
      let body;
      try { body = await response.json(); } catch (_) {
        reply(data.requestId, { ok: false, errorCode: 'HISTORY_INVALID_JSON', error: 'History response was not valid JSON.' });
        return;
      }
      if (!body || !Array.isArray(body.messages) || !body.page_info) {
        reply(data.requestId, { ok: false, errorCode: 'HISTORY_INVALID_SHAPE', error: 'History response did not contain the expected messages/page_info shape.' });
        return;
      }
      reply(data.requestId, { ok: true, page: body });
    } catch (error) {
      reply(data.requestId, { ok: false, errorCode: 'HISTORY_FETCH_ERROR', error: error instanceof Error ? error.message : 'History request failed.' });
    }
  });
  document.documentElement?.setAttribute('data-cpn-history-bridge-ready', 'true');
})();
