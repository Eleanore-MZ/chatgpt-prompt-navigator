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

The exact current endpoint has now been experimentally verified in an authenticated ChatGPT session:

```text
/c/<conversationId>
        |
        v
/backend-api/conversations/<conversationId>/messages
```

`src/chatgpt/history-endpoint.js` is the sole endpoint-construction module and now uses `/backend-api/conversations/{conversationId}/messages`. Resource Timing is queried only to display observed candidates and compare them with the constructed descriptor; it does not control whether history bootstrap starts.

When testing locally, DevTools Network should be used to record the actual current pathname (without cookies, authorization headers, or response secrets) and compare it with the bridge's discovered URL. The conversation ID is expected to be encoded in that observed request's path or query, but this repository does not assume which one until the page supplies the URL.

## Current implementation

- `HistoryConversationDataSource` is the canonical source once the observed request is discoverable.
- Once the endpoint module is configured, it first requests the endpoint without `before`, validates that newest page, uses its `start_cursor` as the first backward cursor, and advances to `page_info.start_cursor` while `has_previous_page` is true.
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

No authenticated session was available here, so the number of pages/prompts retrieved is currently **not measured**. The endpoint is now configured for fresh-load bootstrap; the user's browser will report either `history-complete` or a precise `initial-page-*` failure in the rail and console. Full-history indexing without manually scrolling still requires that live test.

## Bootstrap diagnostics

The fresh-load bootstrap now reports a stage rather than collapsing errors into `History bridge failed`:

- `main-world-injection-failed`: no bridge-ready marker or response was observed, so the MAIN-world content script may not have injected.
- `bridge-communication-failed`: the bridge marker exists but the isolated-world request timed out.
- `no-history-endpoint`: the bridge initialized, but no same-origin Resource Timing candidate matching the observed query shape was found. This is the expected diagnostic when ChatGPT has not yet made its older-history request; it is not silently treated as complete history.
- `endpoint-unconfigured`: configuration is missing or the current route has no parsed conversation ID.
- `endpoint-resolution`: the rail shows the parsed conversation ID, constructed endpoint, observed candidates, and `Match: yes/no/unknown`.
- `initial-page-fetching` / `initial-page-valid`: the independent no-`before` bootstrap request is in progress or validated.
- `initial-page-http-error` / `initial-page-invalid-shape`: the independent bootstrap request failed at HTTP or response validation.
- `bootstrap-cursor-unavailable`: no stable `data-message-id` was available among mounted user messages.
- `history-fetch-http-error`: the observed endpoint returned a non-2xx response.
- `history-response-invalid-shape`: the response was not JSON or lacked the expected `messages`/`page_info` fields.
- `pagination-failed`: cursor or page validation stopped pagination.

The rail's development detail line includes the current URL, parsed conversation ID, stable mounted message IDs, observed candidate URL paths/query strings, constructed endpoint, and match result. The console also logs stage transitions and failures under `[CPN]`; prompt bodies are not logged. The remaining live check is whether `GET /backend-api/conversations/{conversationId}/messages?include_has_versions=true&num_turns=10` succeeds without `before`; any failure is reported as an `initial-page-*` diagnostic rather than replaced with a guessed bootstrap method.
