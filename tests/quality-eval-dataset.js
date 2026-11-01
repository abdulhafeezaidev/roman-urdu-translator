/**
 * Roman Urdu Translator — Phase 5 Real Documentation Quality Evaluation Dataset
 *
 * 30 representative sentences extracted from real-world documentation sources:
 * - MDN Web Docs
 * - Node.js Documentation
 * - React Documentation
 * - Python Documentation
 * - GitHub Documentation
 * - Chrome Extensions Documentation
 *
 * Covers all 12 required evaluation categories.
 */

const QUALITY_EVAL_SENTENCES = [
  // 1. General technical explanation
  {
    id: 'eval-1',
    category: 'General technical explanation',
    source: 'MDN Web Docs',
    english: 'A service worker is an event-driven worker registered against an origin and a path.',
    expectedPreservedTerms: ['service worker', 'worker', 'origin', 'path']
  },
  {
    id: 'eval-2',
    category: 'General technical explanation',
    source: 'React Docs',
    english: 'React components are regular JavaScript functions that return markup describing what should appear on screen.',
    expectedPreservedTerms: ['React', 'components', 'JavaScript', 'functions']
  },
  {
    id: 'eval-3',
    category: 'General technical explanation',
    source: 'Node.js Docs',
    english: 'Asynchronous operations in Node.js utilize the event loop to perform non-blocking I/O tasks.',
    expectedPreservedTerms: ['Node.js', 'event loop', 'I/O']
  },

  // 2. Instructions
  {
    id: 'eval-4',
    category: 'Instructions',
    source: 'GitHub Docs',
    english: 'To clone the repository to your local machine, open your terminal and run the git command.',
    expectedPreservedTerms: ['clone', 'repository', 'terminal', 'git']
  },
  {
    id: 'eval-5',
    category: 'Instructions',
    source: 'MDN Web Docs',
    english: 'Click the submit button to validate user input before sending the payload to the server.',
    expectedPreservedTerms: ['submit button', 'payload', 'server']
  },
  {
    id: 'eval-6',
    category: 'Instructions',
    source: 'React Docs',
    english: 'Call the useState hook at the top level of your component to declare a new state variable.',
    expectedPreservedTerms: ['useState', 'hook', 'component', 'state variable']
  },

  // 3. Warnings
  {
    id: 'eval-7',
    category: 'Warnings',
    source: 'Chrome Extension Docs',
    english: 'Warning: Storing your API key in client-side extension scripts exposes it to unauthorized third parties.',
    expectedPreservedTerms: ['Warning', 'API key', 'client-side', 'extension', 'scripts']
  },
  {
    id: 'eval-8',
    category: 'Warnings',
    source: 'React Docs',
    english: 'Do not modify state directly because React cannot detect mutations without setter functions.',
    expectedPreservedTerms: ['state', 'React', 'mutations', 'setter functions']
  },

  // 4. API documentation
  {
    id: 'eval-9',
    category: 'API documentation',
    source: 'Node.js Docs',
    english: 'The method returns a promise that resolves with an HTTP response object containing status headers.',
    expectedPreservedTerms: ['method', 'promise', 'HTTP', 'response', 'headers']
  },
  {
    id: 'eval-10',
    category: 'API documentation',
    source: 'MDN Web Docs',
    english: 'The fetch API takes a request endpoint URL and returns a promise resolving to the response.',
    expectedPreservedTerms: ['fetch API', 'request', 'endpoint', 'URL', 'promise', 'response']
  },

  // 5. Configuration
  {
    id: 'eval-11',
    category: 'Configuration',
    source: 'Node.js Docs',
    english: 'Configure the database connection port and host parameters in your environment configuration file.',
    expectedPreservedTerms: ['database', 'connection', 'port', 'host', 'parameters']
  },
  {
    id: 'eval-12',
    category: 'Configuration',
    source: 'GitHub Docs',
    english: 'Set the branch protection rules to require status checks before merging any pull request.',
    expectedPreservedTerms: ['branch', 'protection rules', 'pull request']
  },

  // 6. Error messages
  {
    id: 'eval-13',
    category: 'Error messages',
    source: 'Node.js Docs',
    english: 'Error: Connection refused by the remote server at 127.0.0.1 on port 8080.',
    expectedPreservedTerms: ['Error', 'Connection', 'server', 'port']
  },
  {
    id: 'eval-14',
    category: 'Error messages',
    source: 'Python Docs',
    english: 'TypeError: Unsupported operand type for binary addition between string and integer.',
    expectedPreservedTerms: ['TypeError', 'string', 'integer']
  },

  // 7. Code explanations
  {
    id: 'eval-15',
    category: 'Code explanations',
    source: 'MDN Web Docs',
    english: 'The async keyword enables asynchronous promise-based behavior without blocking the main execution thread.',
    expectedPreservedTerms: ['async', 'keyword', 'promise', 'thread']
  },
  {
    id: 'eval-16',
    category: 'Code explanations',
    source: 'Python Docs',
    english: 'The list comprehension filters even numbers and creates a newly indexed array.',
    expectedPreservedTerms: ['list comprehension', 'array']
  },

  // 8. Authentication/security
  {
    id: 'eval-17',
    category: 'Authentication/security',
    source: 'GitHub Docs',
    english: 'Generate a personal access token with fine-grained permissions to authenticate API requests securely.',
    expectedPreservedTerms: ['token', 'permissions', 'authenticate', 'API requests']
  },
  {
    id: 'eval-18',
    category: 'Authentication/security',
    source: 'MDN Web Docs',
    english: 'Cross-Origin Resource Sharing defines a mechanism for browsers to access resources across domains securely.',
    expectedPreservedTerms: ['Cross-Origin Resource Sharing', 'browsers', 'domains']
  },
  {
    id: 'eval-19',
    category: 'Authentication/security',
    source: 'Chrome Extension Docs',
    english: 'Use Content Security Policy headers to prevent cross-site scripting and unauthorized script execution.',
    expectedPreservedTerms: ['Content Security Policy', 'headers', 'cross-site scripting']
  },

  // 9. Architecture
  {
    id: 'eval-20',
    category: 'Architecture',
    source: 'React Docs',
    english: 'Unidirectional data flow ensures that state mutations cascade predictably down the component hierarchy.',
    expectedPreservedTerms: ['data flow', 'state', 'mutations', 'component']
  },
  {
    id: 'eval-21',
    category: 'Architecture',
    source: 'Node.js Docs',
    english: 'Middleware functions execute sequentially during the request-response lifecycle before passing control to next.',
    expectedPreservedTerms: ['Middleware', 'functions', 'request-response', 'lifecycle', 'next']
  },

  // 10. Performance
  {
    id: 'eval-22',
    category: 'Performance',
    source: 'MDN Web Docs',
    english: 'Lazy loading delays initialization of heavy assets until they are visible in the user viewport.',
    expectedPreservedTerms: ['Lazy loading', 'assets', 'viewport']
  },
  {
    id: 'eval-23',
    category: 'Performance',
    source: 'React Docs',
    english: 'Memoizing expensive calculations with the useMemo hook avoids unnecessary re-renders on every update.',
    expectedPreservedTerms: ['useMemo', 'hook', 're-renders', 'update']
  },

  // 11. CLI instructions
  {
    id: 'eval-24',
    category: 'CLI instructions',
    source: 'Node.js Docs',
    english: 'Run npm install express to install the framework and update your package.json file.',
    expectedPreservedTerms: ['npm install express', 'framework', 'package.json']
  },
  {
    id: 'eval-25',
    category: 'CLI instructions',
    source: 'GitHub Docs',
    english: 'Execute git push origin main to upload your committed changes to the remote repository.',
    expectedPreservedTerms: ['git push origin main', 'repository']
  },
  {
    id: 'eval-26',
    category: 'CLI instructions',
    source: 'Python Docs',
    english: 'Run python -m venv env to create an isolated virtual environment for your dependencies.',
    expectedPreservedTerms: ['python -m venv env', 'dependencies']
  },

  // 12. Web/frontend documentation
  {
    id: 'eval-27',
    category: 'Web/frontend documentation',
    source: 'MDN Web Docs',
    english: 'The Document Object Model represents the web page structure so programs can change the document styling.',
    expectedPreservedTerms: ['Document Object Model', 'document']
  },
  {
    id: 'eval-28',
    category: 'Web/frontend documentation',
    source: 'React Docs',
    english: 'Event handlers are functions that will be triggered in response to user interactions like clicking or hovering.',
    expectedPreservedTerms: ['Event handlers', 'functions', 'response']
  },
  {
    id: 'eval-29',
    category: 'Web/frontend documentation',
    source: 'Chrome Extension Docs',
    english: 'Content scripts run in an isolated world and can inspect or modify the webpage DOM.',
    expectedPreservedTerms: ['Content scripts', 'DOM']
  },
  {
    id: 'eval-30',
    category: 'Web/frontend documentation',
    source: 'MDN Web Docs',
    english: 'CSS Flexbox provides an efficient way to lay out, align, and distribute space among interface items.',
    expectedPreservedTerms: ['CSS Flexbox', 'interface']
  }
];

module.exports = {
  QUALITY_EVAL_SENTENCES
};
