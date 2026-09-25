# ChatGPT internals investigation notes

Status: history-backed implementation added 2026-08-23 and verified in an authenticated browser on 2026-09-25.

## Verified response shape

The observed request is shaped like:

```text
messages?before=<message UUID>&include_has_versions=true&num_turns=10
```

Its response contains `messages`, URL arrays, and `page_info` with `start_cursor`, `end_cursor`, `has_previous_page`, and `has_next_page`. The messages array includes system, user, assistant, tool, commentary, tool-call, reasoning, and recap records. Genuine navigation records are filtered strictly by `message.author.role === "user"` and a non-empty `message.content.parts` text value.

The supplied capture showed the first and last message IDs matching `start_cursor` and `end_cursor`, and showed `has_previous_page: false` with `has_next_page: true` for a request made with `before`. That strongly supports `has_previous_page === false` meaning the oldest page has been reached, while newer pages still exist.

Authenticated request behavior is also experimentally verified for the current web application:

- `/api/auth/session` with browser credentials returns a JSON `session.accessToken`.
- Browser cookies alone returned HTTP 401 for the history endpoint.
- The history request succeeds with `Authorization: Bearer <accessToken>`.
- The no-`before` request returns the newest page.
- `page_info.start_cursor` is the first raw message ID and is the cursor for the next older-page request.
- A tested request using that cursor returned a strictly older, non-overlapping page.

These are observations of the current private web implementation, not a documented public API guarantee.

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

- `HistoryConversationDataSource` is the canonical source after deterministic endpoint resolution; Resource Timing is not a prerequisite.
- Once the endpoint module is configured, it first requests the endpoint without `before`, validates that newest page, uses its `start_cursor` as the first backward cursor, and advances to `page_info.start_cursor` while `has_previous_page` is true.
- It validates non-empty pages, required pagination fields, cursor/message endpoint alignment, repeated cursors, duplicate message IDs, and route-generation cancellation.
- It sorts normalized prompts oldest-to-newest by `create_time`, with insertion order as the implicit tie-breaker.
- It retains only `messageId`, text, role, timestamp/createdAt, index, and a temporary current `domElement` reference. DOM element identity is never used as canonical identity.
- The DOM source remains a visible fallback and is used to re-bind currently mounted targets after virtualization changes.

## Authenticated execution

`src/chatgpt/history-page-bridge.js` runs in the page's MAIN world. It obtains `/api/auth/session` with browser credentials, holds `accessToken` only in a module-scoped in-memory variable, and uses it for the narrowly scoped initial/page history operations. The token is never logged, sent through `window.postMessage`, returned to the isolated content script, or persisted. A 401 discards the token, refreshes the session once, retries once, and then reports failure. The bridge returns normalized user records plus page metadata and raw page boundary IDs; it does not expose arbitrary authenticated fetch.

## Pagination behavior

The authenticated browser reached `history-complete` after two pages and indexed all eight user prompts in the tested project conversation without manual scrolling. A second conversation populated 28 prompt markers over six pages. The source stops on repeated cursors, empty pages, malformed page metadata, request errors, or a route change.

## Message deep-link navigation experiment

Verified in the authenticated Chrome conversation on 2026-09-25: a full-page navigation to `/c/{conversationId}?message={backendMessageId}` mounted and positioned the requested user prompt near the top of the viewport. This worked for the oldest previously unmounted prompt (`dfdaaa26-16f1-48c6-8051-a68f4d2209ed`) and the newest prompt (`f703ddd5-08f2-4629-a33a-62c675c2caf6`). The old target's rendered prompt occupied roughly y=-7 to 81 px, and the newest roughly y=-4 to 113 px at a 794 px viewport height. Both were directly reachable without manual scrolling. ChatGPT removed `message` from the address and canonicalized the direct `/c/` link to the project conversation route. A deep link using the existing project conversation pathname also worked; after it, the extension reached `history-complete` with 8 prompts over 2 pages.

The rail now uses a same-document route change for clicks through `NavigationController`: it pushes the URL with `message={backendMessageId}` and dispatches `popstate`. In a live experiment, this mounted and positioned the oldest previously unmounted prompt without replacing the document. It preserves the current conversation pathname and only retains the extension's `cpnDebug=1` flag from the old query string. ChatGPT removes `message` after positioning the target. This is observed private ChatGPT behavior, not a documented API contract.

The earlier full-page click path was tested from a fresh page with the oldest prompt absent from mounted DOM: clicking its marker loaded that exact prompt near the viewport top. Repeated marker clicks newest → oldest → middle → newest also reached each target, with history indexing returning to `history-complete` and eight markers after each reload. A nonexistent UUID left the conversation usable and indexing complete, but ChatGPT retained that invalid `message` query and did not show a target. A separate conversation completed history indexing with 28 markers over six pages.

The final same-document implementation was tested from a fresh load with the oldest prompt unmounted. Clicking it placed that exact prompt around y=20 px without restarting the extension content script or dropping the eight indexed markers. Subsequent in-page clicks reached the newest and middle prompts around y=72 px while history stayed at `history-complete`. Browser Back stepped from middle to newest to oldest, positioning each prompt around y=20 px. ChatGPT still fetches or reconstructs message content internally; the available browser debug surface does not expose a complete request trace. The extension retains the clicked selected marker on Back because ChatGPT removes the `message` parameter, so that highlight may not describe the Back destination.

The available browser debug surface showed the existing history `/messages` endpoint in the extension's diagnostics on some loads and no Resource Timing candidate on others. It did not provide a complete request-by-request network trace for ChatGPT's target loading, so no message-specific endpoint or cursor pattern is inferred here.

## UI and diagnostics

The normal UI is a fixed 32 px right-edge marker rail. Hovering or focusing it opens a prompt preview list with a 420 px height cap and internal scrolling. The list uses normalized user prompt text and message IDs already supplied by the data source. Add `?cpnDebug=1` to the conversation URL to display the separate diagnostic panel; normal mode does not render that panel.

## Bootstrap diagnostics

The fresh-load bootstrap now reports a stage rather than collapsing errors into `History bridge failed`:

- `main-world-injection-failed`: no bridge-ready marker or response was observed, so the MAIN-world content script may not have injected.
- `bridge-communication-failed`: the bridge marker exists but the isolated-world request timed out.
- Resource Timing candidates may be empty on a fresh load; this is now diagnostic only and cannot block history bootstrap.
- The MAIN-world bridge validates both direct `/c/{id}` and project `/g/{project}/c/{id}` conversation routes. Initial and older-page requests carry the constructed endpoint and conversation ID; fallback diagnostics retain that endpoint when a request fails.
- `endpoint-unconfigured`: configuration is missing or the current route has no parsed conversation ID.
- `endpoint-resolution`: the debug panel shows the parsed conversation ID, constructed endpoint, observed candidates, and `Match: yes/no/unknown`.
- `initial-page-fetching` / `initial-page-valid`: the independent no-`before` bootstrap request is in progress or validated.
- `initial-page-http-error` / `initial-page-invalid-shape`: the independent bootstrap request failed at HTTP or response validation.
- `bootstrap-cursor-unavailable`: no stable `data-message-id` was available among mounted user messages.
- `history-fetch-http-error`: an older-page request returned a non-2xx response.
- `history-response-invalid-shape`: the response was not JSON or lacked the expected `messages`/`page_info` fields.
- `pagination-failed`: cursor or page validation stopped pagination.

The debug panel includes the current URL, parsed conversation ID, stable mounted message IDs, observed candidate URL paths/query strings, constructed endpoint, and match result. The console also logs stage transitions and failures under `[CPN]`; prompt bodies are not logged. Any initial request failure is reported as an `initial-page-*` diagnostic.
