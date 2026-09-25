// MAIN-world bridge. Access tokens never leave this module.
(function () {
  const REQUEST = 'CPN_HISTORY_REQUEST';
  const RESPONSE = 'CPN_HISTORY_RESPONSE';
  let accessToken = null;

  function validId(value) {
    return typeof value === 'string' && value.length > 0 && value.length < 200;
  }

  function describe(url) {
    return { pathname: url.pathname, search: url.search };
  }

  function findObservedUrls() {
    const found = [];
    for (const entry of performance.getEntriesByType('resource').reverse()) {
      try {
        const url = new URL(entry.name);
        if (url.origin !== location.origin || !/(^|\/)messages(?:$|[/?])/i.test(url.pathname)) continue;
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

  function currentConversationId() {
    return new URL(location.href).pathname.match(/(?:^|\/)c\/([^/]+)(?:\/|$)/)?.[1] || null;
  }

  function validEndpoint(endpoint, conversationId) {
    if (!endpoint || typeof endpoint.pathname !== 'string' || !isMessagesPath(endpoint.pathname)) return false;
    const expected = `/backend-api/conversations/${encodeURIComponent(conversationId)}/messages`;
    return endpoint.pathname === expected && currentConversationId() === conversationId;
  }

  async function getAccessToken(forceRefresh = false) {
    if (accessToken && !forceRefresh) return accessToken;
    const response = await fetch('/api/auth/session', { credentials: 'include', headers: { Accept: 'application/json' } });
    if (!response.ok) throw Object.assign(new Error(`Auth session returned HTTP ${response.status}.`), { code: 'AUTH_SESSION_HTTP_ERROR' });
    let session;
    try { session = await response.json(); } catch (_) {
      throw Object.assign(new Error('Auth session response was not valid JSON.'), { code: 'AUTH_SESSION_INVALID_SHAPE' });
    }
    if (typeof session?.accessToken !== 'string' || !session.accessToken) {
      throw Object.assign(new Error('Auth session response did not contain accessToken.'), { code: 'AUTH_SESSION_INVALID_SHAPE' });
    }
    accessToken = session.accessToken;
    return accessToken;
  }

  function normalizeUserMessages(messages) {
    return messages.filter(message => message?.author?.role === 'user' && typeof message.id === 'string')
      .map(message => ({
        id: message.id,
        author: { role: 'user' },
        create_time: typeof message.create_time === 'number' ? message.create_time : null,
        content: { content_type: 'text', parts: normalizeParts(message.content) },
      }));
  }

  function normalizeParts(content) {
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    const text = parts.map(part => {
      if (typeof part === 'string') return part;
      if (part && typeof part.text === 'string') return part.text;
      return '';
    }).filter(Boolean).join('\n').replace(/\s+/g, ' ').trim();
    return [text || '[non-text user message]'];
  }

  function normalizePage(body) {
    if (!body || !Array.isArray(body.messages) || !body.page_info || typeof body.page_info !== 'object') {
      throw Object.assign(new Error('History response did not contain the expected messages/page_info shape.'), { code: 'HISTORY_INVALID_SHAPE' });
    }
    return {
      messages: normalizeUserMessages(body.messages),
      rawMessageCount: body.messages.length,
      boundary: {
        firstMessageId: typeof body.messages[0]?.id === 'string' ? body.messages[0].id : null,
        lastMessageId: typeof body.messages[body.messages.length - 1]?.id === 'string' ? body.messages[body.messages.length - 1].id : null,
      },
      page_info: {
        start_cursor: typeof body.page_info.start_cursor === 'string' ? body.page_info.start_cursor : null,
        end_cursor: typeof body.page_info.end_cursor === 'string' ? body.page_info.end_cursor : null,
        has_previous_page: body.page_info.has_previous_page,
        has_next_page: body.page_info.has_next_page,
      },
    };
  }

  async function fetchHistoryPage(endpoint, conversationId, before) {
    const url = new URL(endpoint.pathname + (endpoint.search || ''), location.origin);
    if (before) url.searchParams.set('before', before);
    else url.searchParams.delete('before');
    url.searchParams.set('include_has_versions', 'true');
    url.searchParams.set('num_turns', '10');

    async function request(token) {
      return fetch(url.href, {
        credentials: 'include',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
    }

    let token = await getAccessToken();
    let response = await request(token);
    if (response.status === 401) {
      accessToken = null;
      token = await getAccessToken(true);
      response = await request(token);
      if (response.status === 401) throw Object.assign(new Error('History request returned HTTP 401 after token refresh.'), { code: 'HISTORY_HTTP_401_RETRY_FAILED' });
    }
    if (!response.ok) throw Object.assign(new Error(`History request returned HTTP ${response.status}.`), { code: before ? 'HISTORY_HTTP_ERROR' : 'INITIAL_PAGE_HTTP_ERROR' });
    let body;
    try { body = await response.json(); } catch (_) {
      throw Object.assign(new Error('History response was not valid JSON.'), { code: before ? 'HISTORY_INVALID_JSON' : 'INITIAL_PAGE_INVALID_JSON' });
    }
    try { return normalizePage(body); } catch (error) {
      error.code = before ? 'HISTORY_INVALID_SHAPE' : 'INITIAL_PAGE_INVALID_SHAPE';
      throw error;
    }
  }

  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.type !== REQUEST || !validId(data.requestId)) return;

    if (data.action === 'init') {
      reply(data.requestId, { ok: true, ready: true });
      return;
    }
    if (data.action === 'inspect-resources') {
      reply(data.requestId, { ok: true, candidates: findObservedUrls().map(describe) });
      return;
    }
    if (data.action === 'auth-check') {
      try { await getAccessToken(); reply(data.requestId, { ok: true, authReady: true }); }
      catch (error) { reply(data.requestId, { ok: false, errorCode: error.code || 'AUTH_SESSION_ERROR', error: error.message }); }
      return;
    }
    if (data.action !== 'fetch-initial' && data.action !== 'fetch-page') return;
    if (!validEndpoint(data.endpoint, data.conversationId)) {
      reply(data.requestId, { ok: false, errorCode: 'ENDPOINT_INVALID', error: 'History endpoint does not match the current conversation.' });
      return;
    }
    if (data.action === 'fetch-page' && !validId(data.before)) {
      reply(data.requestId, { ok: false, errorCode: 'BOOTSTRAP_CURSOR_UNAVAILABLE', error: 'A before cursor is required for a history page.' });
      return;
    }
    try {
      const page = await fetchHistoryPage(data.endpoint, data.conversationId, data.action === 'fetch-page' ? data.before : null);
      reply(data.requestId, { ok: true, page });
    } catch (error) {
      reply(data.requestId, { ok: false, errorCode: error.code || 'HISTORY_FETCH_ERROR', error: error.message || 'History request failed.' });
    }
  });

  document.documentElement?.setAttribute('data-cpn-history-bridge-ready', 'true');
})();
