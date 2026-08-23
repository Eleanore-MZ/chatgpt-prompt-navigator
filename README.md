# ChatGPT Prompt Navigator

Small, personal-use Chrome MV3 extension. The current milestone indexes user messages mounted in the ChatGPT DOM and provides a restrained navigation rail. It intentionally reports `Full history: unknown`; this version does not claim to solve ChatGPT's lazy-rendered full-history problem.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this project directory (`chatgpt-prompt-navigator`).
5. Open or refresh ChatGPT.

After source changes, return to `chrome://extensions`, click **Reload** on this extension, then refresh the ChatGPT tab. No build or dependency installation is needed.

The extension requests no special permissions. Its page-context bridge makes only the observed same-origin ChatGPT history request, using the existing browser session; it does not copy credentials or contact an external service. Debug logging is disabled in `src/content.js` (`DEBUG = false`); set it to `true` while developing and inspect the ChatGPT page console.

The history data source, DOM fallback, UI, and navigation code are separated under `src/data`, `src/ui`, and `src/navigation`. ChatGPT-specific selectors, route assumptions, and the narrow MAIN-world bridge are under `src/chatgpt`.

See [`docs/chatgpt-internals.md`](docs/chatgpt-internals.md) for verified scope, unresolved full-history work, and a browser investigation checklist.
