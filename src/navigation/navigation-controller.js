CPN.NavigationController = class NavigationController {
  constructor({ onAttempt } = {}) {
    this.onAttempt = onAttempt || (() => {});
  }

  goToPrompt(prompt) {
    this.onAttempt(prompt);
    if (!prompt?.domElement?.isConnected) return false;
    prompt.domElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    prompt.domElement.classList.add('cpn-navigation-target');
    window.setTimeout(() => prompt.domElement?.classList.remove('cpn-navigation-target'), 1200);
    return true;
  }
};
