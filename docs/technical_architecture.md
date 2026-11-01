# Roman Urdu Translator — Technical Architecture

## 1. Architecture Goal

Build a modular Chrome Extension that separates:

* webpage interaction
* text extraction
* translation
* state management
* UI
* API communication

Do not place all functionality inside one JavaScript file.

---

## 2. High-Level Architecture

```text
Chrome Webpage
      |
      v
Content Script
      |
      v
Text Extraction / DOM Processing
      |
      v
Translation Queue
      |
      v
Background / API Layer
      |
      v
Translation Backend
      |
      v
Gemini API
      |
      v
Roman Urdu Translation
      |
      v
Content Script
      |
      v
Webpage
```

---

## 3. Extension Components

### Popup

Responsible for:

* user controls
* translation status
* translate action
* restore action

Popup must NOT directly manipulate webpage DOM.

---

### Content Script

Responsible for:

* reading eligible webpage text
* identifying translatable text
* preserving original text
* applying translations
* restoring original text
* detecting dynamic content

---

### Service Worker

Responsible for:

* extension-level message routing
* lifecycle events
* coordination between popup and content script
* API communication when appropriate

---

## 4. Translation Backend

The extension should not expose a permanent unrestricted API secret to webpage JavaScript.

The preferred production architecture is:

```text
Extension
    ↓
Backend
    ↓
Gemini API
```

API secrets must be stored server-side using environment variables or equivalent secure secret storage.

---

## 5. Translation Batching

Do not send every text node as a separate API request.

Instead:

```text
Text Node 1
Text Node 2
Text Node 3
Text Node 4
        ↓
Translation Batch
        ↓
API
```

The batching system must maintain a deterministic mapping between input text and output text.

---

## 6. DOM Safety

The extension must avoid modifying:

* script
* style
* code
* pre
* textarea
* input
* select
* SVG
* canvas
* video
* audio

The exclusion list must be centralized rather than duplicated throughout the codebase.

---

## 7. State

The extension must maintain enough state to:

* know whether a page has been translated
* restore original text
* prevent duplicate translations
* track translation progress
* identify failed batches

---

## 8. Error Handling

Failures must not corrupt the webpage.

If a translation request fails:

* preserve original text
* report the failure
* allow retry
* do not insert partial invalid data

---

## 9. Architecture Rule

Do not introduce frameworks, databases, authentication systems, or infrastructure unless the current milestone requires them.

Prefer the simplest architecture that satisfies the current requirement.

Future architecture may evolve as requirements become clearer.
