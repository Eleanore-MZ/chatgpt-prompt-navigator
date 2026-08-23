# ChatGPT internals investigation notes

Status: initial implementation, 2026-08-23. These notes deliberately distinguish what this repository implements from what still needs observation in an authenticated ChatGPT session.

## Verified in this repository

- The extension is a Manifest V3 unpacked content script for `chatgpt.com` and legacy `chat.openai.com`.
- `DomConversationDataSource` reads only elements matching `[data-message-author-role="user"]`. It returns normalized prompt records and keeps the element reference separate from the UI.
- A `MutationObserver` refreshes the rail when ChatGPT mounts more DOM. A route observer watches `pushState`, `replaceState`, `popstate`, and a small URL poll for SPA changes.
- The status intentionally says `Full history: unknown`. DOM count is not treated as conversation count.
- Navigation currently uses `scrollIntoView()` only when the target element is mounted. An unloaded historical message is not falsely reported as navigable.

## Not verified yet

No authenticated ChatGPT browser session or current network trace was available during this session. Therefore this project does **not** assert a current endpoint, application-state object, message schema, pagination behavior, tree traversal rule, or direct jump API. It also does not copy tokens, use guessed endpoints, or add a network permission.

## Browser investigation checklist

With DevTools open on an authenticated conversation:

1. Note the URL and conversation ID after opening a conversation. Turn on the extension's `DEBUG` flag and record route/count diagnostics, without recording prompt text.
2. In the Network panel, reload the conversation and filter Fetch/XHR. Identify requests whose response contains the conversation ID or message IDs. Save a redacted response shape, request method, URL path, and whether older messages absent from the initial DOM are present. Do not copy cookies or authorization headers.
3. Inspect response fields for role, message ID, timestamps, parent/branch relationships, ordering, and pagination. ChatGPT may represent edited/regenerated messages as a tree; normalize the active UI path rather than blindly flattening every node.
4. Compare the full response message IDs with `[data-message-author-role="user"]` elements before and after scrolling upward.
5. For an older prompt, inspect the host application's own navigation controls and scroll behavior. Determine whether it uses a stable message anchor, a message ID, a virtualizer API, or incremental scrolling. Test whether dispatching the same observed action causes the target range to mount.

## Future implementation boundary

If a same-origin payload is available only to page JavaScript, keep any MAIN-world bridge tiny and schema-validated: request only the current conversation ID, return only normalized message metadata, and use a private, narrowly tagged event/message format. Do not place credentials in extension storage or expose a general `window.postMessage` relay. Add a second `ConversationDataSource` only after the request and response have been observed in the current application.

Full-history indexing (Problem A) and jumping to an initially unmounted prompt (Problem B) are separate deliverables. The next implementation step should be a redacted network/application-state capture from the user's browser, followed by a tested active-path normalizer and an observed navigation mechanism.
