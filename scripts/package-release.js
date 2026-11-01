/**
 * Roman Urdu Translator — Production Release Packager (Phase 7)
 *
 * Copies runtime-only files into a clean release directory:
 *   release/roman-urdu-translator-v1.0.0/
 * Creates a release zip:
 *   release/roman-urdu-translator-v1.0.0.zip
 *
 * Performs strict secret and hygiene audit:
 * - 0 test files (*.test.js)
 * - 0 test fixtures
 * - 0 screenshots / recordings (*.webp, *.png)
 * - 0 private environment files (.env)
 * - 0 API keys / secrets / credentials
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VERSION = '1.0.0';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const RELEASE_BASE = path.join(PROJECT_ROOT, 'release');
const PACKAGE_NAME = `roman-urdu-translator-v${VERSION}`;
const PACKAGE_DIR = path.join(RELEASE_BASE, PACKAGE_NAME);
const ZIP_PATH = path.join(RELEASE_BASE, `${PACKAGE_NAME}.zip`);

console.log(`\n================================================================`);
console.log(`Packaging Roman Urdu Translator v${VERSION} for Production`);
console.log(`================================================================\n`);

// 1. Clean release directory safely
try {
  const pidFile = path.join(PACKAGE_DIR, 'backend', '.server.pid');
  if (fs.existsSync(pidFile)) {
    const data = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
    if (data && data.pid) {
      try { process.kill(data.pid, 'SIGTERM'); } catch (e) { }
    }
  }
} catch (e) { }

if (fs.existsSync(PACKAGE_DIR)) {
  try {
    fs.rmSync(PACKAGE_DIR, { recursive: true, force: true });
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EBUSY') {
      try {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
      } catch (sleepErr) { }
      fs.rmSync(PACKAGE_DIR, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
}
if (fs.existsSync(ZIP_PATH)) {
  fs.rmSync(ZIP_PATH, { force: true });
}
fs.mkdirSync(PACKAGE_DIR, { recursive: true });

// 2. Define production files mapping
const copyMap = [
  // Extension Files
  { src: 'manifest.json', dest: 'extension/manifest.json' },
  { src: 'popup/popup.html', dest: 'extension/popup/popup.html' },
  { src: 'popup/popup.css', dest: 'extension/popup/popup.css' },
  { src: 'popup/popup.js', dest: 'extension/popup/popup.js' },
  { src: 'content/content.js', dest: 'extension/content/content.js' },
  { src: 'background/service-worker.js', dest: 'extension/background/service-worker.js' },
  { src: 'utils/text-utils.js', dest: 'extension/utils/text-utils.js' },

  // Backend Proxy Files (Zero npm dependencies)
  { src: 'backend/server.js', dest: 'backend/server.js' },
  { src: 'backend/config.js', dest: 'backend/config.js' },
  { src: 'backend/validator.js', dest: 'backend/validator.js' },
  { src: 'backend/gemini-client.js', dest: 'backend/gemini-client.js' },
  { src: 'backend/hf-client.js', dest: 'backend/hf-client.js' },
  { src: 'backend/groq-client.js', dest: 'backend/groq-client.js' },
  { src: 'backend/provider-pool.js', dest: 'backend/provider-pool.js' },
  { src: 'backend/placeholder-utils.js', dest: 'backend/placeholder-utils.js' },
  { src: 'backend/output-validator.js', dest: 'backend/output-validator.js' },
  { src: 'backend/prompt-builder.js', dest: 'backend/prompt-builder.js' },
  { src: 'backend/package.json', dest: 'backend/package.json' },

  // Native Messaging Host Files
  { src: 'native-host/com.roman_urdu_translator.host.json', dest: 'native-host/com.roman_urdu_translator.host.json' },
  { src: 'native-host/host-launcher.bat', dest: 'native-host/host-launcher.bat' },
  { src: 'native-host/host.js', dest: 'native-host/host.js' },

  // Setup and Utility Scripts
  { src: 'scripts/setup-native-host.bat', dest: 'scripts/setup-native-host.bat' },
  { src: 'scripts/uninstall-native-host.bat', dest: 'scripts/uninstall-native-host.bat' },

  // Configuration Templates & Documentation
  { src: '.env.example', dest: '.env.example' },
  { src: 'README.md', dest: 'README.md' }
];

let totalFiles = 0;
let totalBytes = 0;

for (const item of copyMap) {
  const fullSrc = path.join(PROJECT_ROOT, item.src);
  const fullDest = path.join(PACKAGE_DIR, item.dest);

  if (!fs.existsSync(fullSrc)) {
    throw new Error(`Required production source file missing: ${fullSrc}`);
  }

  const destDir = path.dirname(fullDest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.copyFileSync(fullSrc, fullDest);
  const stats = fs.statSync(fullDest);
  totalFiles++;
  totalBytes += stats.size;
  console.log(`  [COPIED] ${item.src} -> ${item.dest} (${stats.size} bytes)`);
}

console.log(`\nCopied ${totalFiles} production files (${(totalBytes / 1024).toFixed(1)} KB total).\n`);

// 3. Secret & Hygiene Audit on Package
console.log(`--- Running Automated Secret & Hygiene Audit on Package ---`);

const FORBIDDEN_NAME_PATTERNS = [
  /^\.env$/,
  /\.env\.(local|production|development)$/,
  /\.test\.js$/,
  /\.spec\.js$/,
  /\.git/,
  /\.webp$/,
  /\.png$/,
  /\.log$/,
  /\.pid$/
];

const SECRET_CONTENT_PATTERNS = [
  /AIza[0-9A-Za-z-_]{35}/,                         // Google API Key standard format
  /AQ\.[0-9A-Za-z-_]{20,}/,                        // Alternate Google key format
  /GEMINI_API_KEY\s*=\s*(?!your_)[a-zA-Z0-9_-]{15,}/, // Real API key assignment
  /x-goog-api-key['"]?\s*:\s*['"][a-zA-Z0-9_-]{20,}['"]/ // Inlined API key header
];

function auditDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(PACKAGE_DIR, fullPath);

    // 1. Name checks
    for (const pattern of FORBIDDEN_NAME_PATTERNS) {
      if (pattern.test(entry.name)) {
        throw new Error(`HYGIENE VIOLATION: Forbidden file/directory present in release package: ${relPath}`);
      }
    }

    if (entry.isDirectory()) {
      auditDirectory(fullPath);
    } else {
      // 2. Content checks
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of SECRET_CONTENT_PATTERNS) {
        if (pattern.test(content)) {
          throw new Error(`SECURITY VIOLATION: Potential secret detected in packaged file ${relPath} (matched ${pattern})`);
        }
      }
    }
  }
}

auditDirectory(PACKAGE_DIR);
console.log(`  PASS: Zero secrets, test artifacts, or private credentials detected in package.\n`);

// 4. Create ZIP archive
console.log(`--- Creating Production Archive: ${PACKAGE_NAME}.zip ---`);
try {
  // Use PowerShell Compress-Archive for native, standard Windows zip creation
  const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${PACKAGE_DIR}\\*' -DestinationPath '${ZIP_PATH}' -Force"`;
  execSync(psCmd, { stdio: 'pipe' });

  const zipStats = fs.statSync(ZIP_PATH);
  console.log(`  PASS: Created ${path.basename(ZIP_PATH)} (${(zipStats.size / 1024).toFixed(1)} KB)\n`);
} catch (err) {
  console.error(`  ERROR creating zip archive:`, err.message);
  throw err;
}

console.log(`================================================================`);
console.log(`PRODUCTION PACKAGING SUCCESSFUL:`);
console.log(`  Directory: release/${PACKAGE_NAME}/`);
console.log(`  Archive:   release/${PACKAGE_NAME}.zip`);
console.log(`================================================================\n`);
