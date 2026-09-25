# ChatGPT Prompt Navigator

Small, personal-use Chrome MV3 extension. It indexes the current ChatGPT conversation's user messages through authenticated history pagination and displays them in a navigation rail. On the tested project conversation, full-history indexing completed without scrolling. The DOM source remains a fallback when the history request is unavailable.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this project directory (`chatgpt-prompt-navigator`).
5. Open or refresh ChatGPT.

After source changes, return to `chrome://extensions`, click **Reload** on this extension, then refresh the ChatGPT tab. No build or dependency installation is needed.

The extension requests no special permissions. Its page-context bridge obtains the existing ChatGPT session token and keeps it in memory for same-origin history requests; it does not copy credentials into extension storage or contact an external service. Debug logging is disabled in `src/content.js` (`DEBUG = false`); set it to `true` while developing and inspect the ChatGPT page console.

The history data source, DOM fallback, UI, and navigation code are separated under `src/data`, `src/ui`, and `src/navigation`. ChatGPT-specific selectors, route assumptions, and the narrow MAIN-world bridge are under `src/chatgpt`.

The normal navigator is a compact right-edge marker rail. Hover over it or focus it with the keyboard to open prompt previews. Add `?cpnDebug=1` to the conversation URL to show the detailed diagnostic panel during development; remove the flag to return to the normal view.

See [`docs/chatgpt-internals.md`](docs/chatgpt-internals.md) for the observed history response shape, diagnostic stages, and tested same-document message navigation behavior.
