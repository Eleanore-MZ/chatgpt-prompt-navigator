CPN.NavigationRail = class NavigationRail {
  constructor({ onSelect }) {
    this.onSelect = onSelect;
    this.root = document.createElement('aside');
    this.root.id = 'cpn-navigation-rail';
    this.root.innerHTML = `<div class="cpn-header"><span>Prompts</span><button class="cpn-toggle" type="button" aria-label="Collapse prompt navigator">-</button></div><div class="cpn-status" aria-live="polite"></div><div class="cpn-debug"></div><nav class="cpn-list" aria-label="User prompts"></nav>`;
    this.root.querySelector('.cpn-toggle').addEventListener('click', () => this.root.classList.toggle('cpn-collapsed'));
    document.documentElement.append(this.root);
  }

  render(prompts, status, conversationId) {
    const list = this.root.querySelector('.cpn-list');
    const existing = new Map([...list.children].map(node => [node.dataset.promptId, node]));
    const fragment = document.createDocumentFragment();
    prompts.forEach((prompt, index) => {
      const button = existing.get(prompt.messageId) || document.createElement('button');
      button.className = 'cpn-entry'; button.type = 'button'; button.dataset.promptId = prompt.messageId;
      button.title = prompt.text; button.textContent = `${index + 1}. ${prompt.text}`;
      button.onclick = () => { if (!this.onSelect(prompt)) this.root.querySelector('.cpn-status').textContent = 'Target not currently rendered; history is indexed.'; };
      fragment.append(button);
    });
    list.replaceChildren(fragment);
    const mounted = prompts.filter(prompt => prompt.domElement?.isConnected).length;
    const phase = status.phase === 'loading' ? 'no' : status.complete ? 'yes' : 'no';
    const error = status.error ? ` - ${status.error}` : '';
    this.root.querySelector('.cpn-status').textContent = `Data source: ${status.name} | Stage: ${status.stage || 'unknown'} | Prompts indexed: ${prompts.length} | DOM mounted: ${mounted} | History complete: ${phase} | Pages: ${status.pagesFetched || 0}${error}`;
    const details = status.details || {};
    const candidates = (details.candidates || []).map(candidate => `${candidate.pathname}${candidate.search || ''}`).join(' ; ') || 'none observed';
    const ids = (details.mountedMessageIds || []).join(', ') || 'none';
    this.root.querySelector('.cpn-debug').textContent = `URL: ${location.href} | Conversation: ${conversationId || 'none'} | Mounted IDs: ${ids} | Candidate history URLs: ${candidates}`;
  }
  destroy() { this.root.remove(); }
};
