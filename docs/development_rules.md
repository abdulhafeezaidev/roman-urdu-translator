# Roman Urdu Translator — Development Rules

## 1. Source of Truth

Before making implementation decisions, read:

1. PRD.md
2. PRODUCT_SPEC.md
3. TRANSLATION_SPEC.md
4. TECHNICAL_ARCHITECTURE.md
5. SECURITY_SPEC.md
6. ROADMAP.md
7. DECISIONS.md

These documents are the primary project requirements.

---

## 2. Do Not Invent Requirements

The agent MUST NOT invent product features.

If a feature is not specified:

* do not implement it automatically
* do not assume it is required
* do not expand the scope

Ask the user when the decision materially affects architecture or product behavior.

---

## 3. Do Not Overengineer

Prefer simple implementations.

Do not introduce:

* React
* databases
* authentication
* complex state-management libraries
* unnecessary dependencies
* microservices
* unnecessary build systems

unless explicitly required by the current project stage.

---

## 4. Preserve Existing Decisions

Do not change an architectural or product decision simply because another approach appears interesting.

If a change appears necessary:

1. identify the conflict
2. explain the reason
3. propose the change
4. wait for approval if it materially changes the architecture

---

## 5. No Silent Scope Expansion

Never add:

* new UI features
* new APIs
* new permissions
* new cloud services
* analytics
* authentication
* payment systems
* unrelated optimizations

without a requirement.

---

## 6. Verify Before Assuming

If a technical behavior is uncertain:

* inspect official documentation
* inspect the existing code
* test the behavior
* then implement

Do not fabricate APIs, browser APIs, SDK behavior, or configuration.

---

## 7. Official Documentation Preference

For technical implementation questions, prefer official documentation from:

* Chrome Developers
* Google AI / Gemini documentation
* Node.js
* MDN
* relevant official SDK documentation

Do not rely on outdated tutorials when official documentation is available.

---

## 8. Small Milestones

Implement one milestone at a time.

After each milestone:

1. run tests
2. inspect errors
3. verify behavior
4. report what changed
5. wait for the next milestone

Do not implement the entire roadmap at once.

---

## 9. Before Coding

Before coding a milestone, the agent must state:

* what requirement it is implementing
* which files it will change
* why those files need changes
* what behavior will exist after the change

Keep this explanation concise.

---

## 10. After Coding

After implementation, report:

* files changed
* features implemented
* tests performed
* test results
* known limitations
* unresolved issues

---

## 11. Never Hide Errors

If something fails, clearly report it.

Do not claim something works without testing it.

Do not mark a task complete merely because code was written.

---

## 12. Code Quality

Use:

* clear naming
* modular functions
* small responsibilities
* comments only where useful
* defensive error handling

Avoid unnecessary abstraction.

---

## 13. Translation Rules Are Product Rules

Never modify Roman Urdu translation behavior without checking TRANSLATION_SPEC.md.

The target language is Pakistani Roman Urdu.

Do not silently change the translation style to:

* Urdu script
* Hindi
* Hinglish
* formal Urdu
* literal machine translation

---

## 14. Security Rules

Never expose API keys.

Never commit secrets.

Never add unnecessary Chrome permissions.

Never send excluded content to the translation provider.

---

## 15. Final Rule

When uncertain, do not guess.

Identify the uncertainty and ask for a decision when it materially affects the product or architecture.
