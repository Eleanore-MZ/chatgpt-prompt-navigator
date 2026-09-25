CPN.NavigationRail = class NavigationRail {
  constructor({ onSelect }) {
    this.onSelect = onSelect;
    this.prompts = [];
    this.selectedId = new URL(location.href).searchParams.get('message');
    this.closeTimer = null;
    this.root = document.createElement('aside');
    this.root.id = 'cpn-navigation-rail';
    this.root.className = 'cpn-rail';
    this.root.tabIndex = 0;
    this.root.setAttribute('aria-label', 'Prompt navigator');
    this.root.setAttribute('aria-expanded', 'false');
    this.root.innerHTML = `<div class="cpn-markers" aria-hidden="true"></div><nav class="cpn-preview" aria-label="User prompts" inert><div class="cpn-preview-list"></div><p class="cpn-feedback" role="status" hidden></p></nav>`;
    this.markers = this.root.querySelector('.cpn-markers');
    this.preview = this.root.querySelector('.cpn-preview');
    this.list = this.root.querySelector('.cpn-preview-list');
    this.feedback = this.root.querySelector('.cpn-feedback');
    this.root.addEventListener('pointerenter', () => { this.pointerInside = true; this.open(); });
    this.root.addEventListener('pointerleave', () => { this.pointerInside = false; this.scheduleClose(); });
    this.root.addEventListener('focusin', () => this.open());
    this.root.addEventListener('focusout', event => {
      if (!this.root.contains(event.relatedTarget)) this.scheduleClose();
    });
    this.root.addEventListener('keydown', event => {
      if (event.key === 'Escape') { this.root.blur(); this.close(); }
    });
    this.root.addEventListener('click', event => {
      const target = event.target.closest('[data-cpn-index]');
      if (!target || !this.root.contains(target)) return;
      const prompt = this.prompts[Number(target.dataset.cpnIndex)];
      if (!prompt) return;
      this.selectedId = prompt.messageId;
      this.updateSelection();
      if (!this.onSelect(prompt)) {
        this.feedback.textContent = 'Target not currently rendered; history is indexed.';
        this.feedback.hidden = false;
      } else {
        this.feedback.hidden = true;
      }
    });
    document.documentElement.append(this.root);
  }

  open() {
    clearTimeout(this.closeTimer);
    this.root.classList.add('cpn-open');
    this.root.setAttribute('aria-expanded', 'true');
    this.preview.inert = false;
  }

  scheduleClose() {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      if (!this.pointerInside && !this.root.contains(document.activeElement)) this.close();
    }, 160);
  }

  close() {
    clearTimeout(this.closeTimer);
    this.root.classList.remove('cpn-open');
    this.root.setAttribute('aria-expanded', 'false');
    this.preview.inert = true;
  }

  render(prompts, status, conversationId, navigationDiagnostics) {
    const urlTarget = new URL(location.href).searchParams.get('message');
    if (conversationId !== this.conversationId) {
      this.conversationId = conversationId;
      this.selectedId = urlTarget || null;
    }
    if (urlTarget && prompts.some(prompt => prompt.messageId === urlTarget)) this.selectedId = urlTarget;
    const changed = prompts.length !== this.prompts.length || prompts.some((prompt, index) =>
      prompt.messageId !== this.prompts[index].messageId || prompt.text !== this.prompts[index].text);
    this.prompts = prompts;
    if (changed) {
      const markers = document.createDocumentFragment();
      const rows = document.createDocumentFragment();
      prompts.forEach((prompt, index) => {
        const marker = document.createElement('span');
        marker.className = 'cpn-marker';
        marker.dataset.cpnIndex = index;
        marker.dataset.promptId = prompt.messageId;
        markers.append(marker);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'cpn-preview-row';
        row.dataset.cpnIndex = index;
        row.dataset.promptId = prompt.messageId;
        row.textContent = prompt.text;
        row.title = prompt.text;
        row.setAttribute('aria-label', prompt.text);
        rows.append(row);
      });
      this.markers.replaceChildren(markers);
      this.list.replaceChildren(rows);
      this.root.classList.toggle('cpn-many', prompts.length > 50);
      this.root.classList.toggle('cpn-dense', prompts.length > 150);
      this.feedback.hidden = true;
      this.updateSelection();
    }
    this.root.hidden = prompts.length === 0;
    this.renderDebug(prompts, status, conversationId, navigationDiagnostics);
  }

  updateSelection() {
    for (const node of this.root.querySelectorAll('.cpn-marker-active, .cpn-preview-row-active')) {
      node.classList.remove('cpn-marker-active', 'cpn-preview-row-active');
    }
    if (!this.selectedId) return;
    const index = this.prompts.findIndex(prompt => prompt.messageId === this.selectedId);
    if (index < 0) return;
    this.markers.children[index]?.classList.add('cpn-marker-active');
    this.list.children[index]?.classList.add('cpn-preview-row-active');
  }

  renderDebug(prompts, status, conversationId, navigationDiagnostics = {}) {
    const enabled = new URL(location.href).searchParams.get('cpnDebug') === '1';
    if (!enabled) { this.debugPanel?.remove(); this.debugPanel = null; return; }
    if (!this.debugPanel) {
      this.debugPanel = document.createElement('aside');
      this.debugPanel.className = 'cpn-debug-panel';
      this.debugPanel.innerHTML = '<div class="cpn-debug-status"></div><div class="cpn-debug-details"></div><div class="cpn-debug-navigation"></div>';
      document.documentElement.append(this.debugPanel);
    }
    const mounted = prompts.filter(prompt => prompt.domElement?.isConnected).length;
    const phase = status.phase === 'loading' ? 'no' : status.complete ? 'yes' : 'no';
    const error = status.error ? ` - ${status.error}` : '';
    this.debugPanel.querySelector('.cpn-debug-status').textContent = `Data source: ${status.name} | Stage: ${status.stage || 'unknown'} | Prompts indexed: ${prompts.length} | DOM mounted: ${mounted} | History complete: ${phase} | Pages: ${status.pagesFetched || 0}${error}`;
    const details = status.details || {};
    const candidates = (details.candidates || []).map(candidate => `${candidate.pathname}${candidate.search || ''}`).join(' ; ') || 'none';
    const constructed = details.constructed ? `${details.constructed.pathname}${details.constructed.search || ''}` : 'none';
    const ids = (details.mountedMessageIds || []).join(', ') || 'none';
    this.debugPanel.querySelector('.cpn-debug-details').textContent = `URL: ${location.href} | Conversation: ${conversationId || 'none'} | Mounted IDs: ${ids} | Observed history endpoint: ${candidates} | Constructed history endpoint: ${constructed} | Match: ${details.match || 'unknown'}`;
    this.debugPanel.querySelector('.cpn-debug-navigation').textContent = `Navigation strategy: ${navigationDiagnostics.strategy || 'none'} | Target message ID: ${navigationDiagnostics.targetMessageId || 'none'} | Target conversation ID: ${navigationDiagnostics.targetConversationId || 'none'} | Target mounted: ${navigationDiagnostics.targetMounted || 'unknown'} | Deep-link attempted: ${navigationDiagnostics.deepLinkAttempted || 'no'} | Navigation result: ${navigationDiagnostics.result || 'none'}`;
  }

  destroy() { clearTimeout(this.closeTimer); this.debugPanel?.remove(); this.root.remove(); }
};
