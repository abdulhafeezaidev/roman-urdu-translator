# Roman Urdu Translator — Security Specification

## 1. API Keys

Never hardcode production API keys inside:

* JavaScript source files
* HTML
* CSS
* manifest.json
* Git repositories
* Chrome extension distributed files

Secrets must be stored using environment variables or a secure backend secret mechanism.

---

## 2. Backend

The production architecture should place AI API credentials behind a backend.

The browser extension communicates with the backend rather than exposing the provider secret directly.

---

## 3. User Privacy

The extension should only process webpage text necessary for translation.

It must not:

* record keystrokes
* capture screenshots
* collect browsing history
* collect unrelated page content
* monitor other tabs unnecessarily
* store translated webpage content permanently without a clear reason

---

## 4. Data Minimization

Only eligible text required for translation should be sent to the translation provider.

Do not send:

* source code
* passwords
* form contents
* hidden DOM data
* unnecessary metadata

---

## 5. Permissions

Request the minimum Chrome permissions necessary.

Do not request broad permissions merely because they may be useful in the future.

---

## 6. Logging

Do not log:

* API keys
* full webpage contents
* sensitive user content

Development logs should contain only information required for debugging.

---

## 7. Production Security

Before public release, review:

* API abuse prevention
* rate limiting
* authentication strategy
* backend access control
* quota protection
* secret management
* privacy policy
* Chrome Web Store requirements
