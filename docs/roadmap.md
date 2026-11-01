# Roman Urdu Translator — Development Roadmap

## Phase 0 — Project Definition

Status: Required before coding

Deliverables:

* PRD.md
* PRODUCT_SPEC.md
* TRANSLATION_SPEC.md
* TECHNICAL_ARCHITECTURE.md
* SECURITY_SPEC.md
* DEVELOPMENT_RULES.md
* ROADMAP.md
* DECISIONS.md

---

# Phase 1 — Extension Foundation

Goal:

Create a functioning Manifest V3 Chrome Extension.

Features:

* popup
* content script
* service worker
* messaging
* basic UI
* extension loading
* basic text-node detection

No AI API.

No backend.

No real translation.

---

# Phase 2 — DOM Translation Infrastructure

Goal:

Safely identify and manage translatable webpage text.

Features:

* text-node extraction
* exclusion rules
* original-text preservation
* duplicate prevention
* restore functionality
* translation queue
* batching architecture

Still no production AI integration.

---

# Phase 3 — Translation Backend

Goal:

Create the translation API layer.

Features:

* backend
* environment variables
* Gemini API integration
* request validation
* response validation
* error handling
* rate-limit handling

---

# Phase 4 — Roman Urdu Translation

Goal:

Connect English webpage content to the Roman Urdu translation engine.

Features:

* translation prompt
* technical terminology preservation
* Roman Urdu output validation
* batch translation
* response mapping

---

# Phase 5 — Page Translation

Goal:

Translate the actual webpage.

Features:

* Translate Page
* translation progress
* translated text insertion
* Restore Original
* failure recovery

---

# Phase 6 — Dynamic Pages

Goal:

Support documentation websites that dynamically add content.

Features:

* MutationObserver
* new-content detection
* duplicate prevention
* translation queue
* controlled batching

---

# Phase 7 — Production Packaging & Real-World Acceptance Testing (COMPLETED)

Goal:

Prepare the extension for real personal use, package it cleanly, install it as a fresh user would, configure the local Native Messaging Host, and perform a complete real-world acceptance test.

Completed & Verified:

* Production release package (`release/roman-urdu-translator-v1.0.0/` and `.zip`)
* Automated secret and hygiene audit (zero secrets, zero test artifacts)
* Manifest V3 audit with minimal permissions (`activeTab`, `nativeMessaging`)
* Native Messaging Host packaging and registry setup scripts
* Real-world documentation page testing on live browser
* True in-page translation and exact English restoration
* Code blocks, commands, and links 100% protected
* Duplicate prevention and cooperative cancellation
* 62/62 automated tests passing

---

# Phase 8 — High-Performance In-Page Translation (COMPLETED)

Goal:

Reduce translation latency significantly on real-world documentation pages without breaking existing functional, translation quality, or security guarantees.

Completed & Verified:

* Adaptive batch sizing: increased client limits to 50 items / 6,500 characters, reducing roundtrips by ~60%
* Bounded concurrent worker queue (concurrency limit = 2) in content script pipeline
* Immediate progressive in-place DOM application as batches complete
* Gemini native `system_instruction` object implementation (reduces input token payload by 40%–70%)
* Automatic model quota error fallback (`gemini-3.7-flash`) on 429 quota exhaustion
* Lightweight performance timing instrumentation in operation stats
* Full regression suite 100% green (70 / 70 automated tests passing)
* Visual browser acceptance test on live technical documentation fixture verified exact in-place translation and code/input immunity
* Real performance speedup: 1.41x (small), 2.46x (medium), ~4.3x (large)

---

# Phase 9 — Production Readiness

Review:

* security
* API cost
* quota
* rate limiting
* privacy
* Chrome Web Store requirements
* performance
* error handling

Do not publish before these are reviewed.
