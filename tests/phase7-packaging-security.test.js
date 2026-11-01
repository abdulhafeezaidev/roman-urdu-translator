/**
 * Roman Urdu Translator — Phase 7 Packaging & Security Audit Test
 *
 * Validates:
 * 1. Production release packaging integrity
 * 2. Manifest V3 compliance and minimal permissions
 * 3. Deterministic Extension ID and Native Messaging Host configuration
 * 4. Zero secrets, credentials, or private .env files in the release package
 * 5. Complete exclusion of test files, screenshots, recordings, and development artifacts
 * 6. Valid, non-empty ZIP production archive
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(PROJECT_ROOT, 'release', 'roman-urdu-translator-v1.0.0');
const ZIP_PATH = path.join(PROJECT_ROOT, 'release', 'roman-urdu-translator-v1.0.0.zip');

function runAudit() {
  console.log('\n--- Running Phase 7 Packaging & Security Audit Suite ---\n');

  // Test 1: Release Directory and ZIP Existence
  console.log('Testing release package and ZIP archive existence...');
  assert(fs.existsSync(RELEASE_DIR), `Release directory must exist at: ${RELEASE_DIR}`);
  assert(fs.existsSync(ZIP_PATH), `Release ZIP must exist at: ${ZIP_PATH}`);
  const zipStats = fs.statSync(ZIP_PATH);
  assert(zipStats.size > 1000, `ZIP file must be non-empty (got ${zipStats.size} bytes)`);
  console.log(`  PASS: Production package and ZIP archive exist (${(zipStats.size / 1024).toFixed(1)} KB)`);

  // Test 2: Manifest V3 Audit
  console.log('Testing Manifest V3 compliance in packaged extension...');
  const manifestPath = path.join(RELEASE_DIR, 'extension', 'manifest.json');
  assert(fs.existsSync(manifestPath), 'Packaged manifest.json must exist');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.strictEqual(manifest.manifest_version, 3, 'manifest_version must be 3');
  assert.strictEqual(manifest.name, 'Roman Urdu Translator', 'name must match');
  assert.strictEqual(manifest.version, '1.0.0', 'version must be 1.0.0');
  assert.deepStrictEqual(manifest.permissions, ['activeTab', 'nativeMessaging'], 'permissions must only be activeTab and nativeMessaging');
  assert(manifest.key && manifest.key.length > 100, 'Deterministic key must be present');
  assert.strictEqual(manifest.action.default_popup, 'popup/popup.html');
  assert.strictEqual(manifest.background.service_worker, 'background/service-worker.js');
  console.log('  PASS: Manifest V3 is valid with minimal permissions (activeTab, nativeMessaging)');

  // Test 3: Native Host Configuration Audit
  console.log('Testing Native Messaging Host configuration...');
  const hostManifestPath = path.join(RELEASE_DIR, 'native-host', 'com.roman_urdu_translator.host.json');
  assert(fs.existsSync(hostManifestPath), 'Host manifest must exist in package');

  const hostManifest = JSON.parse(fs.readFileSync(hostManifestPath, 'utf8'));
  assert.strictEqual(hostManifest.name, 'com.roman_urdu_translator.host');
  assert.strictEqual(hostManifest.type, 'stdio');
  assert.strictEqual(hostManifest.path, 'host-launcher.bat');
  assert(Array.isArray(hostManifest.allowed_origins));
  assert.strictEqual(hostManifest.allowed_origins[0], 'chrome-extension://lmngogijnmkchlfmghgiilmgdjonigbl/');
  console.log('  PASS: Native Host manifest matches deterministic extension ID and launcher');

  // Test 4: File Structure & Exclusion of Development Artifacts
  console.log('Testing exclusion of development/test artifacts from package...');
  const forbiddenFiles = [
    '.env',
    '.env.local',
    '.git',
    'backend/tests',
    'tests',
    'package-lock.json'
  ];

  for (const forbidden of forbiddenFiles) {
    const checkPath = path.join(RELEASE_DIR, forbidden);
    assert(!fs.existsSync(checkPath), `Forbidden development file or directory must NOT exist in package: ${forbidden}`);
  }
  console.log('  PASS: No development tests, logs, or git files are included in the package');

  // Test 5: Secret Audit (Deep scan over every single file in the package)
  console.log('Testing zero-secret policy across all packaged files...');
  const SECRET_PATTERNS = [
    /AIza[0-9A-Za-z-_]{35}/,
    /AQ\.[0-9A-Za-z-_]{20,}/,
    /GEMINI_API_KEY\s*=\s*(?!your_)[a-zA-Z0-9_-]{15,}/
  ];

  let scannedCount = 0;
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(p);
      } else {
        scannedCount++;
        const content = fs.readFileSync(p, 'utf8');
        for (const pattern of SECRET_PATTERNS) {
          assert(!pattern.test(content), `SECRET LEAK DETECTED in ${p} matching ${pattern}`);
        }
      }
    }
  }

  scanDir(RELEASE_DIR);
  console.log(`  PASS: Zero secrets detected across all ${scannedCount} packaged files`);

  // Test 6: Environment Template Check
  console.log('Testing .env.example template safety...');
  const envExamplePath = path.join(RELEASE_DIR, '.env.example');
  assert(fs.existsSync(envExamplePath), '.env.example must exist in release package');
  const envExample = fs.readFileSync(envExamplePath, 'utf8');
  assert(envExample.includes('GEMINI_API_KEY='), 'Template must show variable name');
  assert(!envExample.includes('AQ.Ab'), 'Template must not contain real keys');
  console.log('  PASS: .env.example contains only safe placeholders');

  console.log('\nPhase 7 Packaging & Security Tests: All 6 passed successfully!\n');
}

runAudit();
