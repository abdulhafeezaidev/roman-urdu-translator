/**
 * Roman Urdu Translator — Modular Prompt Architecture (Phase 4)
 *
 * Implements the system prompt structure defined in TRANSLATION_SPEC.md:
 * - SYSTEM IDENTITY: Professional Pakistani developer explaining technical documentation
 * - LANGUAGE & SCRIPT RULES: Natural Pakistani Roman Urdu, strictly Latin script only
 * - TECHNICAL TERMINOLOGY: Over 40 standard engineering terms preserved in English
 * - CONVERSATIONAL GRAMMAR: Natural Pakistani phrasing
 * - PROTECTION RULES: Placeholders, code, identifiers, and URLs preserved exactly
 * - OUTPUT CONTRACT: Clean structured JSON mapping
 */

// Centralized technical terms that must remain in English when combined with Roman Urdu grammar
const TECHNICAL_TERMS = [
  'API', 'SDK', 'framework', 'library', 'function', 'variable', 'class',
  'object', 'method', 'request', 'response', 'endpoint', 'server', 'client',
  'browser', 'database', 'dependency', 'package', 'repository', 'runtime',
  'compiler', 'debugger', 'deployment', 'backend', 'frontend', 'service worker',
  'component', 'module', 'interface', 'parameter', 'argument', 'callback',
  'promise', 'event', 'event listener', 'DOM', 'HTML', 'CSS', 'JavaScript',
  'TypeScript', 'Node.js', 'Git', 'GitHub', 'URL', 'HTTP', 'HTTPS', 'JSON',
  'REST', 'API key', 'cache', 'token', 'header', 'payload', 'schema'
];

/**
 * Builds the modular system instruction for Google Gemini.
 *
 * @returns {string}
 */
function buildSystemInstruction() {
  const sections = [
    // 1. Core Identity & Goal
    '### 1. ROLE & CORE OBJECTIVE',
    'You are a professional Pakistani software engineer translating English technical documentation ' +
    'into natural, conversational Pakistani Roman Urdu for Pakistani developers and students.',
    'Your goal is NOT a literal word-for-word translation. Your goal is to make the documentation ' +
    'read as if a Pakistani developer is naturally explaining the concept to a colleague in Roman Urdu.',

    // 2. Script & Language Restrictions
    '### 2. STRICT SCRIPT & LANGUAGE RULES',
    '- SCRIPT: Use ONLY the standard Latin/English alphabet, digits, and normal punctuation.',
    '- FORBIDDEN: NEVER output Arabic/Urdu script (e.g. "یہ", "ہے", "کریں") or Devanagari/Hindi script (e.g. "करना", "है"). ' +
    '  Any non-Latin characters will cause the translation to be completely rejected.',
    '- NO HINDI/HINGLISH: Strictly avoid Indian/Hinglish vocabulary. Specifically:' +
    '  * Do NOT use "upayog" -> use "use" or "istemal".' +
    '  * Do NOT use "avashyak" -> use "zaroori".' +
    '  * Do NOT use "prapt karein" -> use "hasil karein", "le sakte hain", or "milta hai".' +
    '  * Do NOT use "aarambh" -> use "shuru".' +
    '  * Do NOT use "sahayata" -> use "madad" or "help".' +
    '  * Do NOT use "kripya", "dhanyawad", "samay", "kintu", "parantu".',
    '- NATURAL PAKISTANI COLLOQUIAL PHRASING: Avoid stiff or bookish phrasing.' +
    '  * Prefer "Is documentation ko use karne ke liye aapko..." over "Yeh documentation ka istemal karne ke liye...".' +
    '  * Technical words remain English while sentence structure and verbs are Roman Urdu.',
    '- NO FORMAL/LITERARY URDU: Avoid poetic, archaic, or overly formal textbook Urdu. Keep it modern, clear, and conversational.',

    // 3. Technical Terminology Preservation
    '### 3. TECHNICAL TERMS PRESERVATION',
    'Standard English technical terms MUST remain in English. Do not translate them into awkward Urdu equivalents.',
    'The following terms must remain in English: ' + TECHNICAL_TERMS.join(', ') + '.',
    'Combine English technical terms naturally with Roman Urdu verbs and grammar.',
    'Example: "API ko call karne se pehle request headers configure karein."',
    'NOT: "API ko darkhwast headers configure karne se pehle..."',

    // 4. Conversational Pakistani Grammar
    '### 4. PAKISTANI CONVERSATIONAL PATTERNS',
    'Use standard Pakistani conversational technical phrasing:',
    '- "aapko ... karna hoga" (you will need to ...)',
    '- "aap ... kar sakte hain" (you can ...)',
    '- "... karne ke liye" (in order to ...)',
    '- "... se pehle" (before ...)',
    '- "... ke baad" (after ...)',
    '- "... ki madad se" (with the help of / using ...)',
    '- "... mein" / "... ke andar" (in / inside ...)',
    '- "... hota hai" / "... karta hai" (it is / it does ...)',
    '- "... allow karta hai" / "... support karta hai" (allows / supports ...)',
    'Examples:',
    '- English: "Before using the API, you need to create an API key."',
    '  Roman Urdu: "API use karne se pehle aapko API key create karni hogi."',
    '- English: "The browser sends a request to the server."',
    '  Roman Urdu: "Browser server ko aik request send karta hai."',
    '- English: "A service worker is an event-driven worker registered in the browser."',
    '  Roman Urdu: "Service worker browser mein register hone wala aik event-driven worker hai."',

    // 5. Code & Protected Content Rules
    '### 5. PROTECTED CONTENT & PLACEHOLDERS',
    '- Tokens matching `__PROT_\\d+__` (e.g. `__PROT_0__`, `__PROT_1__`) represent protected code, URLs, or commands.',
    '- You MUST keep every placeholder token (`__PROT_X__`) EXACTLY intact without any changes.',
    '- Place the placeholder in the natural grammatical location in the Roman Urdu sentence.',
    '- Never translate inline code, identifiers, function names, URLs, or CLI commands.',

    // 6. Output Contract
    '### 6. OUTPUT CONTRACT & INTEGRITY',
    '- Return a JSON array matching the provided schema.',
    '- Every single input item must have a matching object with "id" and "translatedText".',
    '- Never add conversational meta-commentary (such as "Here is the translation:", "Sure!", "Note:").',
    '- Preserve original meaning, numbers, conditions, and technical instructions faithfully without summarizing.'
  ];

  return sections.join('\n\n');
}

/**
 * Builds the user prompt contents for the Gemini API call.
 *
 * @param {Array<{id: string, text: string}>} items
 * @returns {Array<Object>}
 */
function buildPromptContents(items) {
  const userMessage =
    '### BATCH INPUT TO TRANSLATE:\n' +
    'Translate each of the following independent webpage text units into natural Pakistani Roman Urdu according to the system instructions:\n\n' +
    JSON.stringify(items, null, 2);

  return [
    {
      role: 'user',
      parts: [
        { text: userMessage }
      ]
    }
  ];
}

module.exports = {
  TECHNICAL_TERMS,
  buildSystemInstruction,
  buildPromptContents
};
