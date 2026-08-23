CPN.getConversationId = (url = location.href) => {
  const match = new URL(url).pathname.match(/\/c\/([^/]+)/);
  return match ? match[1] : null;
};

CPN.observeRoute = (onChange) => {
  let lastUrl = location.href;
  const notify = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onChange(location.href);
    }
  };
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  history.pushState = function (...args) { const result = originalPush.apply(this, args); notify(); return result; };
  history.replaceState = function (...args) { const result = originalReplace.apply(this, args); notify(); return result; };
  addEventListener('popstate', notify);
  const timer = setInterval(notify, 500);
  return () => {
    clearInterval(timer);
    removeEventListener('popstate', notify);
    history.pushState = originalPush;
    history.replaceState = originalReplace;
  };
};
