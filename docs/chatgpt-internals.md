# ChatGPT internals investigation notes

Status: history-backed implementation added 2026-08-23. These notes separate the authenticated-browser evidence supplied for this task from facts that still require a live capture in the user's browser.

## Verified response shape

The observed request is shaped like:

```text
messages?before=<message UUID>&include_has_versions=true&num_turns=10
```

Its response contains `messages`, URL arrays, and `page_info` with `start_cursor`, `end_cursor`, `has_previous_page`, and `has_next_page`. The messages array includes system, user, assistant, tool, commentary, tool-call, reasoning, and recap records. Genuine navigation records are filtered strictly by `message.author.role === "user"` and a non-empty `message.content.parts` text value.

The supplied capture showed the first and last message IDs matching `start_cursor` and `end_cursor`, and showed `has_previous_page: false` with `has_next_page: true` for a request made with `before`. That strongly supports `has_previous_page === false` meaning the oldest page has been reached, while newer pages still exist.

## Exact request path

The full pathname was not included in the supplied evidence, and no authenticated browser session was available to this development environment. The extension therefore does not guess a route copied from an older project. The MAIN-world bridge discovers the actual current same-origin resource URL from the page's Resource Timing entries, requiring the observed `before`, `include_has_versions`, and `num_turns` query parameters and a `messages` pathname. It then changes only the `before` cursor for subsequent requests.

When testing locally, DevTools Network should be used to record the actual current pathname (without cookies, authorization headers, or response secrets) and compare it with the bridge's discovered URL. The conversation ID is expected to be encoded in that observed request's path or query, but this repository does not assume which one until the page supplies the URL.

## Current implementation

- `HistoryConversationDataSource` is the canonical source once the observed request is discoverable.
- It starts from the oldest stable message ID currently present in the DOM, fetches pages with `before=<cursor>`, and advances to `page_info.start_cursor` while `has_previous_page` is true.
- It validates non-empty pages, required pagination fields, cursor/message endpoint alignment, repeated cursors, duplicate message IDs, and route-generation cancellation.
- It sorts normalized prompts oldest-to-newest by `create_time`, with insertion order as the implicit tie-breaker.
- It retains only `messageId`, text, role, timestamp/createdAt, index, and a temporary current `domElement` reference. DOM element identity is never used as canonical identity.
- The DOM source remains a visible fallback and is used to re-bind currently mounted targets after virtualization changes.

## Authenticated execution

`src/chatgpt/history-page-bridge.js` runs in the page's MAIN world. It accepts only two narrow operations: discover the observed history URL, or fetch a page before a supplied message ID. It allows only same-origin URLs discovered from the page and uses `fetch(..., { credentials: 'include' })`, so no token or cookie is copied into extension storage. The isolated content script communicates using a tagged, request-ID-correlated `window.postMessage` schema and validates response shape before using it.

## Pagination testing still required

The implementation follows the supported direction indicated by the supplied capture, but consecutive-request behavior must still be verified in the authenticated browser. Confirm that `request B: before=response A.start_cursor` returns records older than response A, that cursors progress, and that the terminal page has `has_previous_page: false`. The source stops on repeated cursors, empty pages, malformed page metadata, request errors, or a route change.

## Separate unresolved problem: unloaded navigation

Complete enumeration (knowing every prompt exists) is now separate from rendering/navigation (making an unmounted prompt visible). Mounted targets still use `scrollIntoView()`. An indexed but unmounted target reports `Target not currently rendered; history is indexed.` No brittle renderer or private navigation API is assumed yet.

## Testing result for this environment

No authenticated session was available here, so the number of pages/prompts retrieved is currently **not measured**. The extension can report pages and prompt counts in its rail once loaded in the user's browser. Full-history indexing without manually scrolling is expected when the current page has already made an observable history request and the supplied pagination semantics hold; that claim still needs live confirmation.

## Bootstrap diagnostics

The fresh-load bootstrap now reports a stage rather than collapsing errors into `History bridge failed`:

- `main-world-injection-failed`: no bridge-ready marker or response was observed, so the MAIN-world content script may not have injected.
- `bridge-communication-failed`: the bridge marker exists but the isolated-world request timed out.
- `no-history-endpoint`: the bridge initialized, but no same-origin Resource Timing candidate matching the observed query shape was found. This is the expected diagnostic when ChatGPT has not yet made its older-history request; it is not silently treated as complete history.
- `bootstrap-cursor-unavailable`: no stable `data-message-id` was available among mounted user messages.
- `history-fetch-http-error`: the observed endpoint returned a non-2xx response.
- `history-response-invalid-shape`: the response was not JSON or lacked the expected `messages`/`page_info` fields.
- `pagination-failed`: cursor or page validation stopped pagination.

The rail's development detail line includes the current URL, parsed conversation ID, stable mounted message IDs, and sanitized candidate history URL paths/query strings. The console also logs stage transitions and failures under `[CPN]`; prompt bodies are not logged. Resource-entry discovery is diagnostic/fallback only at this point. The exact bootstrap request path, conversation-ID placement, and first cursor still require one captured current request from the authenticated browser before an independent fresh-load bootstrap can be implemented without guessing.
