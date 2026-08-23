CPN.NavigationRail = class NavigationRail {
  constructor({ onSelect }) {
    this.onSelect = onSelect;
    this.root = document.createElement('aside');
    this.root.id = 'cpn-navigation-rail';
    this.root.innerHTML = `
      <div class="cpn-header"><span>Prompts</span><button class="cpn-toggle" type="button" aria-label="Collapse prompt navigator">−</button></div>
      <div class="cpn-status" aria-live="polite"></div>
      <nav class="cpn-list" aria-label="User prompts"></nav>`;
    this.root.querySelector('.cpn-toggle').addEventListener('click', () => {
      this.root.classList.toggle('cpn-collapsed');
    });
    document.documentElement.append(this.root);
  }

  render(prompts, status, conversationId) {
    const list = this.root.querySelector('.cpn-list');
    const existing = new Map([...list.children].map(node => [node.dataset.promptId, node]));
    const fragment = document.createDocumentFragment();
    prompts.forEach((prompt, index) => {
      const button = existing.get(prompt.messageId) || document.createElement('button');
      button.className = 'cpn-entry';
      button.type = 'button';
      button.dataset.promptId = prompt.messageId;
      button.title = prompt.text;
      button.textContent = `${index + 1}. ${prompt.text}`;
      button.onclick = () => this.onSelect(prompt);
      fragment.append(button);
    });
    list.replaceChildren(fragment);
    const mounted = prompts.filter(prompt => prompt.domElement?.isConnected).length;
    this.root.querySelector('.cpn-status').textContent =
      `Data source: ${status.name} · Prompts indexed: ${prompts.length} · Mounted: ${mounted} · Full history: ${status.complete ? 'yes' : 'unknown'}` +
      (conversationId ? ` · ${conversationId.slice(0, 12)}` : '');
  }

  destroy() { this.root.remove(); }
};
