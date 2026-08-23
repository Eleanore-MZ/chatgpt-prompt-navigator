CPN.HistoryConversationDataSource = class HistoryConversationDataSource extends CPN.ConversationDataSource {
  constructor({ requestPage, domSource }) {
    super();
    this.requestPage = requestPage;
    this.domSource = domSource;
    this.records = new Map();
    this.seenCursors = new Set();
    this.pagesFetched = 0;
    this.status = { name: 'History API', complete: false, phase: 'loading', stage: 'created', pagesFetched: 0 };
    this.loadGeneration = 0;
  }

  getPrompts() {
    const mountedById = new Map(this.domSource.getPrompts()
      .filter(prompt => !prompt.messageId.startsWith('dom-element-'))
      .map(prompt => [prompt.messageId, prompt.domElement]));
    return [...this.records.values()]
      .map(record => ({ ...record, domElement: mountedById.get(record.messageId) || null }))
      .sort((a, b) => a.index - b.index);
  }

  getStatus() { return { ...this.status }; }

  setDiagnostic(stage, message, details = {}) {
    this.status = { ...this.status, phase: 'loading', stage, error: message || null, details };
    console.info('[CPN] history stage', { stage, message, ...details });
  }

  seedMountedPrompts(prompts) {
    prompts.filter(prompt => typeof prompt.messageId === 'string' && !prompt.messageId.startsWith('dom-element-'))
      .forEach(prompt => {
        if (this.records.has(prompt.messageId)) return;
        this.records.set(prompt.messageId, {
          messageId: prompt.messageId,
          text: prompt.text,
          createdAt: null,
          index: this.records.size,
          role: 'user',
          timestamp: null,
          domElement: null,
        });
      });
  }

  async load(initialBoundary, onUpdate) {
    const generation = ++this.loadGeneration;
    this.seenCursors.clear();
    this.pagesFetched = 0;
    this.status = { ...this.status, name: 'History API', complete: false, phase: 'loading', stage: 'pagination', pagesFetched: 0, error: null };
    onUpdate?.();
    if (!initialBoundary || initialBoundary.startsWith('dom-element-')) {
      return this.fail('bootstrap-cursor-unavailable', 'No stable mounted message ID is available as a history boundary.');
    }

    let cursor = initialBoundary;
    try {
      while (cursor && !this.seenCursors.has(cursor)) {
        if (generation !== this.loadGeneration) return false;
        this.seenCursors.add(cursor);
        const page = await this.requestPage(cursor);
        if (generation !== this.loadGeneration) return false;
        validatePage(page);
        this.pagesFetched += 1;
        this.addUserMessages(page.messages);
        this.status.pagesFetched = this.pagesFetched;
        onUpdate?.();
        const info = page.page_info;
        if (info.has_previous_page !== true) {
          this.status = { ...this.status, name: 'History API', complete: true, phase: 'complete', stage: 'complete', pagesFetched: this.pagesFetched, error: null };
          onUpdate?.();
          return true;
        }
        if (!info.start_cursor || info.start_cursor === cursor || this.seenCursors.has(info.start_cursor)) {
          throw new Error('Pagination cursor repeated or missing.');
        }
        cursor = info.start_cursor;
      }
      throw new Error('Pagination stopped because a cursor repeated.');
    } catch (error) {
      this.fail('pagination-failed', error instanceof Error ? error.message : 'History pagination failed.');
      onUpdate?.();
      return false;
    }
  }

  async loadInitial(requestInitialPage, onUpdate) {
    const generation = ++this.loadGeneration;
    this.seenCursors.clear();
    this.pagesFetched = 0;
    this.status = { ...this.status, name: 'History API', complete: false, phase: 'loading', stage: 'initial-page-fetching', pagesFetched: 0, error: null };
    onUpdate?.();
    try {
      const page = await requestInitialPage();
      if (generation !== this.loadGeneration) return false;
      validatePage(page);
      this.pagesFetched = 1;
      this.addUserMessages(page.messages);
      this.status = { ...this.status, stage: 'initial-page-valid', pagesFetched: this.pagesFetched };
      onUpdate?.();
      if (page.page_info.has_previous_page !== true) {
        this.status = { ...this.status, complete: true, phase: 'complete', stage: 'history-complete' };
        onUpdate?.();
        return true;
      }
      const cursor = page.page_info.start_cursor;
      if (!cursor) {
        this.fail('bootstrap-cursor-unavailable', 'Initial history page has no start_cursor.');
        onUpdate?.();
        return false;
      }
      return this.paginate(cursor, generation, onUpdate);
    } catch (error) {
      const code = error.code || '';
      const stage = code.includes('HTTP') ? 'initial-page-http-error'
        : code.includes('SHAPE') || code.includes('JSON') ? 'initial-page-invalid-shape'
        : 'initial-page-fetch-error';
      this.fail(stage, error instanceof Error ? error.message : 'Initial history page failed.');
      onUpdate?.();
      return false;
    }
  }

  async paginate(cursor, generation, onUpdate) {
    this.status = { ...this.status, stage: 'pagination-loading', phase: 'loading' };
    onUpdate?.();
    try {
      while (cursor && !this.seenCursors.has(cursor)) {
        if (generation !== this.loadGeneration) return false;
        this.seenCursors.add(cursor);
        const page = await this.requestPage(cursor);
        if (generation !== this.loadGeneration) return false;
        validatePage(page);
        this.pagesFetched += 1;
        this.addUserMessages(page.messages);
        this.status.pagesFetched = this.pagesFetched;
        onUpdate?.();
        const info = page.page_info;
        if (info.has_previous_page !== true) {
          this.status = { ...this.status, complete: true, phase: 'complete', stage: 'history-complete', pagesFetched: this.pagesFetched };
          onUpdate?.();
          return true;
        }
        if (!info.start_cursor || info.start_cursor === cursor || this.seenCursors.has(info.start_cursor)) throw new Error('Pagination cursor repeated or missing.');
        cursor = info.start_cursor;
      }
      throw new Error('Pagination stopped because a cursor repeated.');
    } catch (error) {
      this.fail('pagination-failed', error instanceof Error ? error.message : 'History pagination failed.');
      onUpdate?.();
      return false;
    }
  }

  addUserMessages(messages) {
    messages.forEach(message => {
      if (message?.author?.role !== 'user' || typeof message.id !== 'string') return;
      const text = extractUserText(message.content);
      if (!text || this.records.has(message.id)) return;
      this.records.set(message.id, {
        messageId: message.id,
        text,
        createdAt: typeof message.create_time === 'number' ? message.create_time : null,
        index: this.records.size,
        role: 'user',
        timestamp: typeof message.create_time === 'number' ? message.create_time : null,
        domElement: null,
      });
    });
    const ordered = [...this.records.values()].sort((a, b) => (a.createdAt ?? Infinity) - (b.createdAt ?? Infinity));
    ordered.forEach((record, index) => { record.index = index; });
  }

  fail(stage, error, details = {}) {
    this.status = { ...this.status, name: 'History API', complete: false, phase: 'unavailable', stage, pagesFetched: this.pagesFetched, error, details };
    console.warn('[CPN] history stage failed', { stage, error, ...details });
  }
};

function extractUserText(content) {
  if (!content || !Array.isArray(content.parts)) return '';
  return content.parts.map(part => {
    if (typeof part === 'string') return part;
    if (part && typeof part.text === 'string') return part.text;
    return '';
  }).join('\n').replace(/\s+/g, ' ').trim();
}

function validatePage(page) {
  const info = page.page_info;
  if (!Array.isArray(page.messages) || !info || typeof info.has_previous_page !== 'boolean') {
    throw new Error('History response is missing messages or page_info.');
  }
  if (page.messages.length === 0) throw new Error('History response returned an empty page.');
  const firstId = page.messages[0]?.id;
  const lastId = page.messages[page.messages.length - 1]?.id;
  if (info.start_cursor && firstId && info.start_cursor !== firstId) throw new Error('History start cursor does not match the first message.');
  if (info.end_cursor && lastId && info.end_cursor !== lastId) throw new Error('History end cursor does not match the last message.');
}
