/**
 * Roman Urdu Translator — Golden Translation Test Dataset (Phase 4)
 *
 * 50+ representative technical documentation test cases covering:
 * - General technical sentences & concepts
 * - API documentation & network requests
 * - Browser & service worker documentation
 * - JavaScript & asynchronous documentation
 * - Code-inline sentences
 * - URLs & web links
 * - Terminal commands (CLI)
 * - File paths & endpoints
 * - Instructions & step-by-step guidance
 * - Warnings & cautions
 * - Definitions & explanations
 * - Conditional statements
 * - Multi-sentence paragraphs
 * - Repetitive technical terms
 * - Style risk sentences (preventing Hindi/Hinglish and formal Urdu)
 */

const GOLDEN_FIXTURES = [
  // --- 1. General Technical Sentences ---
  {
    id: 'tech-01',
    category: 'General Technical',
    english: 'The client sends a request to the server and waits for the response.',
    expectedPreservedTerms: ['client', 'request', 'server', 'response'],
    naturalMarkers: ['ko', 'aik', 'karta hai', 'intezar']
  },
  {
    id: 'tech-02',
    category: 'General Technical',
    english: 'A framework provides a foundation for building scalable web applications.',
    expectedPreservedTerms: ['framework', 'applications'],
    naturalMarkers: ['provide karta hai', 'ke liye', 'karein']
  },
  {
    id: 'tech-03',
    category: 'General Technical',
    english: 'You can inspect network requests using the browser developer tools.',
    expectedPreservedTerms: ['network requests', 'browser developer tools'],
    naturalMarkers: ['kar sakte hain', 'ki madad se']
  },
  {
    id: 'tech-04',
    category: 'General Technical',
    english: 'The database stores user profiles and authentication tokens.',
    expectedPreservedTerms: ['database', 'tokens'],
    naturalMarkers: ['store karta hai', 'aur']
  },

  // --- 2. API Documentation ---
  {
    id: 'api-01',
    category: 'API Documentation',
    english: 'Before using the API, you need to create an API key.',
    expectedPreservedTerms: ['API', 'API key'],
    naturalMarkers: ['use karne se pehle', 'aapko', 'create karni hogi']
  },
  {
    id: 'api-02',
    category: 'API Documentation',
    english: 'Send a POST request to the authentication endpoint with your credentials.',
    expectedPreservedTerms: ['POST request', 'endpoint', 'credentials'],
    naturalMarkers: ['send karein', 'ke sath']
  },
  {
    id: 'api-03',
    category: 'API Documentation',
    english: 'The endpoint returns a JSON payload containing the user object.',
    expectedPreservedTerms: ['endpoint', 'JSON payload', 'object'],
    naturalMarkers: ['return karta hai', 'rakhne wala']
  },
  {
    id: 'api-04',
    category: 'API Documentation',
    english: 'If the token has expired, the API responds with a 401 Unauthorized status.',
    expectedPreservedTerms: ['token', 'API', 'status'],
    naturalMarkers: ['agar', 'expire', 'ho jaye', 'respond karta hai']
  },
  {
    id: 'api-05',
    category: 'API Documentation',
    english: 'Ensure the Content-Type header is set to application/json.',
    expectedPreservedTerms: ['Content-Type header', 'application/json'],
    naturalMarkers: ['make sure karein', 'set ho']
  },

  // --- 3. Browser & Service Worker Documentation ---
  {
    id: 'browser-01',
    category: 'Browser & Service Worker',
    english: 'A service worker is an event-driven worker registered in the browser.',
    expectedPreservedTerms: ['service worker', 'browser'],
    naturalMarkers: ['register hone wala', 'hai']
  },
  {
    id: 'browser-02',
    category: 'Browser & Service Worker',
    english: 'Service workers can intercept network requests and serve cached assets.',
    expectedPreservedTerms: ['Service workers', 'network requests', 'cached assets'],
    naturalMarkers: ['kar sakte hain', 'intercept', 'serve']
  },
  {
    id: 'browser-03',
    category: 'Browser & Service Worker',
    english: 'The DOM represents the document as a tree of nodes.',
    expectedPreservedTerms: ['DOM', 'document', 'nodes'],
    naturalMarkers: ['represent karta hai', 'tree']
  },
  {
    id: 'browser-04',
    category: 'Browser & Service Worker',
    english: 'When the HTML document has finished loading, the browser fires the DOMContentLoaded event.',
    expectedPreservedTerms: ['HTML document', 'browser', 'DOMContentLoaded event'],
    naturalMarkers: ['load hone ke baad', 'fire karta hai']
  },
  {
    id: 'browser-05',
    category: 'Browser & Service Worker',
    english: 'You should register an event listener to handle user interactions.',
    expectedPreservedTerms: ['event listener'],
    naturalMarkers: ['register karna chahiye', 'handle karne ke liye']
  },

  // --- 4. JavaScript & Asynchronous Documentation ---
  {
    id: 'js-01',
    category: 'JavaScript & Async',
    english: 'An async function always returns a promise that resolves with a value.',
    expectedPreservedTerms: ['async function', 'promise'],
    naturalMarkers: ['hamesha', 'return karti hai', 'resolve']
  },
  {
    id: 'js-02',
    category: 'JavaScript & Async',
    english: 'Use the await keyword to pause execution until the promise settles.',
    expectedPreservedTerms: ['await keyword', 'promise'],
    naturalMarkers: ['use karein', 'pause karne ke liye', 'tak']
  },
  {
    id: 'js-03',
    category: 'JavaScript & Async',
    english: 'Callback functions allow you to run code after an asynchronous operation completes.',
    expectedPreservedTerms: ['Callback functions'],
    naturalMarkers: ['allow karti hain', 'complete hone ke baad', 'run karne']
  },
  {
    id: 'js-04',
    category: 'JavaScript & Async',
    english: 'Declare variables using const when their reference will not be reassigned.',
    expectedPreservedTerms: ['variables', 'const'],
    naturalMarkers: ['declare karein', 'jab', 'na ho']
  },
  {
    id: 'js-05',
    category: 'JavaScript & Async',
    english: 'TypeScript provides static typing on top of JavaScript.',
    expectedPreservedTerms: ['TypeScript', 'static typing', 'JavaScript'],
    naturalMarkers: ['provide karta hai', 'par']
  },

  // --- 5. Code-Inline Sentences (Protected Content) ---
  {
    id: 'code-01',
    category: 'Code-Inline',
    english: 'Call the `getUserData()` function after the page has initialized.',
    protectedElements: ['`getUserData()`'],
    expectedPreservedTerms: ['function']
  },
  {
    id: 'code-02',
    category: 'Code-Inline',
    english: 'Read the API secret from `process.env.API_KEY` on the server.',
    protectedElements: ['`process.env.API_KEY`'],
    expectedPreservedTerms: ['API secret', 'server']
  },
  {
    id: 'code-03',
    category: 'Code-Inline',
    english: 'The function takes an `id` parameter and returns an object.',
    protectedElements: ['`id`'],
    expectedPreservedTerms: ['function', 'parameter', 'object']
  },
  {
    id: 'code-04',
    category: 'Code-Inline',
    english: 'Pass the configuration object `options` into the constructor.',
    protectedElements: ['`options`'],
    expectedPreservedTerms: ['constructor']
  },

  // --- 6. URLs & Web Links (Protected Content) ---
  {
    id: 'url-01',
    category: 'URLs & Links',
    english: 'For more information, visit https://developer.mozilla.org/en-US/docs/Web.',
    protectedElements: ['https://developer.mozilla.org/en-US/docs/Web']
  },
  {
    id: 'url-02',
    category: 'URLs & Links',
    english: 'Clone the repository from https://github.com/example/project.git to get started.',
    protectedElements: ['https://github.com/example/project.git'],
    expectedPreservedTerms: ['repository']
  },
  {
    id: 'url-03',
    category: 'URLs & Links',
    english: 'Send your webhook notifications to https://api.example.com/v1/webhooks.',
    protectedElements: ['https://api.example.com/v1/webhooks'],
    expectedPreservedTerms: ['webhook notifications']
  },

  // --- 7. Terminal Commands (Protected Content) ---
  {
    id: 'cmd-01',
    category: 'Terminal Commands',
    english: 'Run npm install express to install the required package.',
    protectedElements: ['npm install express'],
    expectedPreservedTerms: ['package']
  },
  {
    id: 'cmd-02',
    category: 'Terminal Commands',
    english: 'Use git clone https://github.com/example/repo.git to download the project.',
    protectedElements: ['git clone https://github.com/example/repo.git'],
    expectedPreservedTerms: ['project']
  },
  {
    id: 'cmd-03',
    category: 'Terminal Commands',
    english: 'Start the local development server with npm run dev.',
    protectedElements: ['npm run dev'],
    expectedPreservedTerms: ['server']
  },
  {
    id: 'cmd-04',
    category: 'Terminal Commands',
    english: 'Execute npx build to generate the production bundle.',
    protectedElements: ['npx build'],
    expectedPreservedTerms: ['production bundle']
  },

  // --- 8. File Paths & Endpoints (Protected Content) ---
  {
    id: 'path-01',
    category: 'File Paths & Endpoints',
    english: 'Configure your environment variables inside the /backend/config.js file.',
    protectedElements: ['/backend/config.js'],
    expectedPreservedTerms: ['environment variables']
  },
  {
    id: 'path-02',
    category: 'File Paths & Endpoints',
    english: 'Send authentication requests to the /api/v1/auth/login endpoint.',
    protectedElements: ['/api/v1/auth/login'],
    expectedPreservedTerms: ['requests', 'endpoint']
  },
  {
    id: 'path-03',
    category: 'File Paths & Endpoints',
    english: 'Store temporary data in the /tmp/scratch directory.',
    protectedElements: ['/tmp/scratch'],
    expectedPreservedTerms: ['directory']
  },

  // --- 9. Instructions & Steps ---
  {
    id: 'inst-01',
    category: 'Instructions',
    english: 'Follow the steps below to initialize the SDK in your application.',
    expectedPreservedTerms: ['SDK', 'application'],
    naturalMarkers: ['steps', 'follow karein']
  },
  {
    id: 'inst-02',
    category: 'Instructions',
    english: 'First, install the package, then configure your secret key.',
    expectedPreservedTerms: ['package', 'key'],
    naturalMarkers: ['pehle', 'phir', 'configure karein']
  },
  {
    id: 'inst-03',
    category: 'Instructions',
    english: 'Verify the installation by running the test suite.',
    expectedPreservedTerms: ['test suite'],
    naturalMarkers: ['run karke', 'verify karein']
  },

  // --- 10. Warnings & Cautions ---
  {
    id: 'warn-01',
    category: 'Warnings',
    english: 'Do not expose your production API key in client-side code.',
    expectedPreservedTerms: ['API key', 'client-side code'],
    naturalMarkers: ['expose na karein', 'hargiz']
  },
  {
    id: 'warn-02',
    category: 'Warnings',
    english: 'Modifying the DOM directly can cause unexpected layout shifts.',
    expectedPreservedTerms: ['DOM'],
    naturalMarkers: ['directly modify karne se', 'ho sakta hai']
  },
  {
    id: 'warn-03',
    category: 'Warnings',
    english: 'Warning: Calling this function multiple times will trigger redundant network requests.',
    expectedPreservedTerms: ['function', 'network requests'],
    naturalMarkers: ['multiple times call karne se', 'trigger']
  },

  // --- 11. Definitions & Explanations ---
  {
    id: 'def-01',
    category: 'Definitions',
    english: 'An API key is a unique identifier used to authenticate requests.',
    expectedPreservedTerms: ['API key', 'identifier', 'authenticate', 'requests'],
    naturalMarkers: ['hota hai', 'jo use hota hai']
  },
  {
    id: 'def-02',
    category: 'Definitions',
    english: 'A compiler translates source code into machine-readable bytecode.',
    expectedPreservedTerms: ['compiler', 'source code', 'bytecode'],
    naturalMarkers: ['translate karta hai', 'mein']
  },
  {
    id: 'def-03',
    category: 'Definitions',
    english: 'Node.js is an open-source, cross-platform JavaScript runtime environment.',
    expectedPreservedTerms: ['Node.js', 'JavaScript runtime environment'],
    naturalMarkers: ['hai', 'aik']
  },

  // --- 12. Conditional Statements ---
  {
    id: 'cond-01',
    category: 'Conditionals',
    english: 'If the network connection drops, the application displays an offline indicator.',
    expectedPreservedTerms: ['network connection', 'application', 'offline indicator'],
    naturalMarkers: ['agar', 'drop ho jaye to', 'display karegi']
  },
  {
    id: 'cond-02',
    category: 'Conditionals',
    english: 'Unless explicitly disabled, automatic caching is enabled by default.',
    expectedPreservedTerms: ['caching', 'default'],
    naturalMarkers: ['jab tak', 'enable rehta hai']
  },
  {
    id: 'cond-03',
    category: 'Conditionals',
    english: 'When the token expires, the client must request a refreshed token from the authorization server.',
    expectedPreservedTerms: ['token', 'client', 'authorization server'],
    naturalMarkers: ['jab', 'expire ho', 'request karni hogi']
  },

  // --- 13. Multi-Sentence Technical Paragraphs ---
  {
    id: 'para-01',
    category: 'Paragraphs',
    english: 'Before sending a request, initialize the client with your credentials. If the credentials are valid, the server will issue an access token. Use this token for subsequent API calls.',
    expectedPreservedTerms: ['request', 'client', 'credentials', 'server', 'access token', 'token', 'API calls'],
    naturalMarkers: ['pehle', 'agar', 'valid hon to', 'use karein']
  },
  {
    id: 'para-02',
    category: 'Paragraphs',
    english: 'The manifest file defines extension metadata and permissions. In Manifest V3, background scripts run as service workers. Content scripts execute in the context of the webpage.',
    expectedPreservedTerms: ['manifest', 'metadata', 'permissions', 'Manifest V3', 'background scripts', 'service workers', 'Content scripts', 'webpage'],
    naturalMarkers: ['define karta hai', 'ke tor par run hote hain', 'execute hote hain']
  },

  // --- 14. Repetitive Technical Terms ---
  {
    id: 'rep-01',
    category: 'Repetitive Terms',
    english: 'The service worker intercepts every request. If the request is cached, the service worker returns the response immediately.',
    expectedPreservedTerms: ['service worker', 'request', 'cached', 'response'],
    naturalMarkers: ['intercept karta hai', 'agar', 'return karta hai']
  },
  {
    id: 'rep-02',
    category: 'Repetitive Terms',
    english: 'Pass the callback to the function so the callback can execute when the function finishes.',
    expectedPreservedTerms: ['callback', 'function'],
    naturalMarkers: ['pass karein', 'takeh', 'finish hone par', 'execute ho sake']
  },

  // --- 15. Style Risk Sentences (Avoid Hindi/Hinglish and Formal Urdu) ---
  {
    id: 'style-01',
    category: 'Style Risks',
    english: 'Please ensure that the required configuration settings are applied.',
    // Must NOT sound like Hindi (e.g. kripya sunishchit karein)
    // Must sound like Pakistani Roman Urdu (make sure karein / ensure karein ke required settings apply ho chuki hain)
    expectedPreservedTerms: ['configuration settings'],
    naturalMarkers: ['karein', 'zaroori']
  },
  {
    id: 'style-02',
    category: 'Style Risks',
    english: 'You can easily configure the options to match your project requirements.',
    expectedPreservedTerms: ['options', 'project requirements'],
    naturalMarkers: ['asaani se', 'configure kar sakte hain', 'match karne ke liye']
  },
  {
    id: 'style-03',
    category: 'Style Risks',
    english: 'This mechanism allows developers to deploy applications without downtime.',
    expectedPreservedTerms: ['developers', 'deploy', 'applications', 'downtime'],
    naturalMarkers: ['allow karta hai', 'ke baghair']
  }
];

module.exports = {
  GOLDEN_FIXTURES
};
