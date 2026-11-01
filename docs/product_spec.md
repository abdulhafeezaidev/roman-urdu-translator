# Roman Urdu Translator — Product Specification

## 1. Translation Scope

The extension translates human-readable webpage text.

It should generally translate:

* headings
* paragraphs
* list items
* table text
* blockquotes
* labels
* descriptive text
* documentation explanations
* navigation text when appropriate

It should generally NOT translate:

* source code
* code blocks
* inline code identifiers
* URLs
* email addresses
* file paths
* command-line commands
* programming language syntax
* API identifiers
* CSS selectors
* HTML tags
* mathematical expressions
* technical identifiers

---

## 2. Page Preservation

The extension must not redesign the webpage.

The following should remain unchanged whenever possible:

* layout
* CSS
* images
* links
* buttons
* navigation
* code formatting
* tables
* page functionality
* interactive elements

Only eligible text content should change.

---

## 3. Original Text Preservation

Every translated text unit must have a recoverable original value.

The system must never permanently destroy the original English text.

Restore Original must return the page to its previous English state.

---

## 4. Translation Activation

The popup should initially provide:

Roman Urdu Translator

Status: Ready

[ Translate Page ]

[ Restore Original ]

During translation:

Status: Translating...

After successful translation:

Status: Translation complete

If translation fails:

Status: Translation failed

The user must receive a meaningful error message.

---

## 5. Translation Scope

MVP should initially translate the current document.

It should not automatically translate every browser tab.

Future versions may provide a global automatic mode.

---

## 6. Dynamic Content

Documentation websites frequently load content dynamically.

The extension should eventually detect newly inserted eligible text using a controlled DOM observation mechanism.

New content must not be translated repeatedly.

The implementation must avoid infinite translation loops.

---

## 7. Duplicate Prevention

The same DOM text must not be translated repeatedly.

The extension should maintain an internal state indicating whether a text node has already been processed.

---

## 8. Performance

The extension should:

* avoid unnecessary DOM traversal
* avoid sending tiny individual requests
* batch text efficiently
* avoid translating hidden elements
* avoid translating excluded elements
* avoid blocking the webpage
* avoid freezing the browser

---

## 9. User Control

The user must always be able to:

* start translation
* restore English
* stop/cancel an in-progress translation when technically feasible

Future versions may add:

* translation language
* Roman Urdu style
* translation speed
* automatic translation
* per-site settings

These are not MVP requirements.
