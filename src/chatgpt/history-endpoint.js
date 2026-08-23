// The exact current endpoint is intentionally unconfigured until it is
// supplied from an authenticated Network capture. Keep that one fact here.
CPN.historyEndpoint = {
  // Experimentally verified against the current authenticated ChatGPT app.
  pathnameTemplate: '/backend-api/conversations/{conversationId}/messages',

  buildHistoryEndpoint({ conversationId }) {
    if (!this.pathnameTemplate) return null;
    if (!conversationId) return null;
    const pathname = this.pathnameTemplate.replace('{conversationId}', encodeURIComponent(conversationId));
    return { pathname, search: '?include_has_versions=true&num_turns=10' };
  },

  compareObserved(constructed, candidates = []) {
    if (!constructed) return 'unknown';
    if (!candidates.length) return 'unknown';
    try {
      const expected = new URL(constructed.pathname + constructed.search, location.origin);
      const match = candidates.some(candidate => {
        const observed = new URL(candidate.pathname + (candidate.search || ''), location.origin);
        return observed.pathname === expected.pathname
          && observed.searchParams.get('include_has_versions') === expected.searchParams.get('include_has_versions')
          && observed.searchParams.get('num_turns') === expected.searchParams.get('num_turns');
      });
      return match ? 'yes' : 'no';
    } catch (_) {
      return 'unknown';
    }
  },
};
