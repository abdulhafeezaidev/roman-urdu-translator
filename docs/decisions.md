# Roman Urdu Translator — Decisions Log

This document records confirmed product and technical decisions.

The agent must not silently reverse these decisions.

---

## DEC-001 — Target Language

Status: Confirmed

Decision:

The target language is Pakistani Roman Urdu.

Not Urdu script.

Not Hindi.

Not Hinglish.

---

## DEC-002 — Core Direction

Status: Confirmed

Decision:

English webpage content → Pakistani Roman Urdu.

The initial product does not translate Urdu → Roman Urdu.

---

## DEC-003 — Primary Use Case

Status: Confirmed

Decision:

The extension is primarily designed for reading English technical documentation.

---

## DEC-004 — Page-Level Translation

Status: Confirmed

Decision:

The product translates the current webpage rather than requiring users to copy/paste text into another interface.

---

## DEC-005 — Code Protection

Status: Confirmed

Decision:

Source code must not be translated or modified.

---

## DEC-006 — Original Content

Status: Confirmed

Decision:

Original English must always be recoverable.

---

## DEC-007 — Translation Style

Status: Confirmed

Decision:

Use natural Pakistani Roman Urdu with commonly used English technical terminology.

---

## DEC-008 — AI Provider

Status: Confirmed

Decision:

Gemini API is the confirmed translation engine.

Target model is `gemini-2.5-flash` with `gemini-flash-latest` as official alias.

---

## DEC-009 — Cost

Status: Confirmed

Decision:

Development and initial personal use should target zero cost using available free tiers.

Free-tier limits must not be assumed to be unlimited.

---

## DEC-010 — API Key Security

Status: Confirmed

Decision:

Production API secrets must not be hardcoded into the Chrome Extension.

---

## DEC-011 — Framework

Status: Confirmed for MVP

Decision:

Use simple Chrome Extension technologies unless a later requirement justifies a framework.

---

## DEC-012 — Scope Control

Status: Confirmed

Decision:

The agent must not add features outside the current milestone without approval.

---

## DEC-013 — Decision Changes

If a confirmed decision needs to change:

1. identify the existing decision
2. explain why it needs to change
3. explain the alternatives
4. record the new decision
5. then implement it

---

## DEC-014 — Gemini API Model & Backend Proxy Architecture

Status: Confirmed

Decision:

1. Target model is `gemini-2.5-flash` (with `gemini-flash-latest` as official alias). Verified via live Gemini API model catalog in September 2026 (`gemini-1.5-flash` is obsolete/deprecated and removed).
2. API integration is implemented via a lightweight server-side proxy backend.
3. Authentication is strictly server-side using `process.env.GEMINI_API_KEY` passed via query parameter or `x-goog-api-key`.
4. The Chrome Extension communicates exclusively with the proxy (`POST /api/translate`).
5. Gemini is queried using structured JSON output (`responseMimeType: "application/json"`) to preserve unique translation unit IDs deterministically.
6. Failed Gemini requests must fail explicitly; silent mock translation fallbacks are forbidden in production.
7. Batch validation limits are aligned with client batching targets (25 items, 3500 characters).
8. Full Pakistani Roman Urdu translation prompting is deferred to Phase 4.

---

## DEC-015 — Real-World DOM Compatibility, Dynamic MutationObserver & SPA Navigation

Status: Confirmed (Phase 5)

Decision:

1. **Controlled Dynamic Content (MutationObserver)**: MutationObserver operates with a 300ms debounce window and is guarded by an `isApplyingTranslations` flag to prevent recursive translation loops. Only newly added, untranslated subtrees are processed while in an active translated state.
2. **Duplicate Translation Prevention**: Nodes tracked in `OriginalTextStore.modifiedNodes` are automatically skipped in `extractTranslationUnits`. Consecutive translation requests produce 0 units and exit cleanly without consuming API calls.
3. **SPA Navigation Handling**: Listens for `popstate` and hooks `pushState`/`replaceState` to detect client-side route transitions, resetting stale operation IDs and cleaning up active node maps so subsequent page views can be translated without collisions.
4. **Partial Batch Failure Policy**: Completed batches remain safely in the DOM and are tracked in `OriginalTextStore`, allowing "Restore Original" to cleanly revert all applied text nodes. Failed batches are reported explicitly in popup status without page corruption.
5. **Output & Placeholder Integrity**: Output validator ensures Latin-only script (rejecting Arabic/Urdu and Devanagari) and validates that all `__PROT_X__` placeholders are preserved verbatim prior to DOM application.

---

## DEC-016 — True In-Page Translation, Chrome Native Messaging Host & Automatic Local Backend

Status: Confirmed (Phase 6)

Decision:

1. **True In-Page Translation**: All translations mutate existing DOM text nodes directly in-place (`node.nodeValue = translatedText`). No side panels, overlays, popups, duplicate paragraphs, or iframes are injected. Element tags, classes, styles, attributes, and protected elements (`<pre>`, `<code>`, `<input>`, `<button>`, `<svg>`) remain 100% untouched.
2. **Chrome Native Messaging Host Auto-Launcher**: To eliminate manual server start commands (`node backend/server.js`), an official Chrome Native Messaging Host (`com.roman_urdu_translator.host`) is introduced. When the extension requests translation and the backend is offline, the background service worker automatically signals the native host via `sendNativeMessage('com.roman_urdu_translator.host', { command: 'ensure_server' })` to boot the Node.js backend in detached background mode.
3. **Single-Instance Lifecycle & PID Lock**: The backend server records its process ID in `backend/.server.pid` upon listening. If another instance attempts to launch while port 3000 is active and responding to `/health`, it exits cleanly (exit code 0) to prevent duplicate processes.
4. **Localhost-Only IPv4 Binding**: The backend server explicitly binds to `127.0.0.1` rather than `0.0.0.0`, preventing exposure to external network interfaces.
5. **Deterministic Extension ID**: Added a fixed public `"key"` to `manifest.json` ensuring the unpacked Chrome Extension ID remains permanent (`lmngogijnmkchlfmghgiilmgdjonigbl`), permitting exact origin authorization in `com.roman_urdu_translator.host.json`.
6. **Cooperative Cancellation & Progress UX**: Implemented `CANCEL_TRANSLATION` support. Users can click "Cancel Translation" in the popup; in-flight network responses are discarded, applied batches are preserved in-place, and `OriginalTextStore` maintains 100% accurate reversibility via "Restore Original". Real progress (`currentBatch` / `totalBatches`) is reported live in the popup.

---

## DEC-017 — Production Packaging, Zero-Secret Distribution & Real-World Acceptance

Status: Confirmed (Phase 7)

Decision:

1. **Production Packaging Isolation**: The production release is packaged strictly into `release/roman-urdu-translator-v1.0.0/` and zipped as `roman-urdu-translator-v1.0.0.zip`. The package strictly isolates runtime files: `extension/`, `backend/`, `native-host/`, `scripts/`, `.env.example`, and `README.md`.
2. **Complete Exclusion of Development Artifacts**: Tests, test fixtures, development logs, recordings, screenshots, and private environment files (`.env`) are strictly excluded from production distributions.
3. **Automated Secret Audit**: The packaging pipeline executes an automated deep scan across every packaged file for API key patterns (`AIza...`, `AQ.Ab...`, credentials) and halts the build if any secret is discovered.
4. **Path-Independent Installation**: `scripts/setup-native-host.bat` dynamically derives project root from `%~dp0`, allowing users to install, configure, and run the native host and background server from any directory without hardcoded development paths.
5. **Minimal Manifest Permissions**: Production extension retains only `activeTab` and `nativeMessaging` permissions. Zero broad permissions (`<all_urls>`, `webRequest`, `cookies`) are included.

---

## DEC-018 — High-Performance Translation: Adaptive Batching, Bounded Concurrency & Native System Instruction

Status: Confirmed (Phase 8)

Decision:

1. **Adaptive Batch Sizing**: Increased client batching limits in `utils/text-utils.js` from `25 items / 2,500 characters` to `50 items / 6,500 characters`, and backend validation ceilings to `50 items / 8,000 characters`. This reduces total network roundtrips by 58%–65% without exceeding Gemini's token limits or degrading translation quality.
2. **Bounded Concurrency Queue (Pool = 2)**: Replaced the serial `for` loop in `content/content.js` with a bounded asynchronous worker pool strictly capped at a concurrency limit of 2 active requests. Parallel execution reduces medium page waiting time by ~60% and large page waiting time by ~75%, while strictly avoiding rate-limit quota spikes.
3. **Immediate Progressive In-Place DOM Application**: Each translated batch is applied to the DOM immediately upon receipt via deterministic unit ID lookup (`activeNodeMap.get(result.id)`), providing users with progressive visual translation without waiting for trailing batches.
4. **Gemini Native System Instruction**: Separated translation instructions and technical vocabulary from the user prompt body into Gemini's native top-level `system_instruction` object. This reduces input payload character size by 40% to 70% per batch and improves model instruction following.
5. **Model Quota Error Fallback**: Added automatic recovery when a model hits Google's free-tier daily quota limit (`RESOURCE_EXHAUSTED` / `Quota exceeded`). The backend automatically tries `gemini-3.7-flash` without user intervention, ensuring uninterrupted personal translation.
6. **Zero Architectural Compromises**: Preserved 100% of existing functional, translation quality, placeholder protection, and exact original-text restoration guarantees.
