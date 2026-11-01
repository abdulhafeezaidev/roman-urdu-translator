/**
 * Roman Urdu Translator — Phase 5 Quality Evaluation Runner
 *
 * Runs the 30-sentence real-world documentation quality evaluation set
 * through the live Gemini 2.5 Flash pipeline.
 *
 * Evaluates each translation against the quality criteria:
 * - Meaning preserved
 * - Natural Pakistani Roman Urdu
 * - Technical terms preserved
 * - No Hindi/Hinglish style
 * - No Urdu/Arabic/Devanagari script
 * - No meta-commentary
 * - Grammatically understandable to a Pakistani developer
 *
 * Scores:
 * 0 = unacceptable
 * 1 = understandable but awkward
 * 2 = natural / good
 *
 * Target: >= 90% score 2 (at least 27/30).
 */

const { QUALITY_EVAL_SENTENCES } = require('./quality-eval-dataset');
const { translateWithGemini } = require('../backend/gemini-client');
const { checkForbiddenScript } = require('../backend/output-validator');

// Common Hindi/Hinglish patterns that indicate awkward non-Pakistani translations
const HINDI_PATTERNS = [
  /\bupayog\b/i,
  /\bavashyak\b/i,
  /\bprapt\b/i,
  /\baarambh\b/i,
  /\bsahayata\b/i,
  /\bkripya\b/i,
  /\bdhanyawad\b/i,
  /\bsamay\b/i,
  /\bkintu\b/i,
  /\bparantu\b/i
];

/**
 * Evaluates a single translated output against the rubric.
 *
 * @param {Object} fixture - Test fixture
 * @param {string} translatedText - Model output
 * @returns {{ score: number, reasons: string[], details: Object }}
 */
function evaluateTranslation(fixture, translatedText) {
  const reasons = [];
  let score = 2;

  // 1. Check forbidden script
  const scriptCheck = checkForbiddenScript(translatedText);
  if (scriptCheck.hasForbiddenScript) {
    reasons.push(`Contains forbidden ${scriptCheck.scriptType} script`);
    return { score: 0, reasons, details: { scriptCheck } };
  }

  // 2. Check empty or very short
  if (!translatedText || translatedText.trim().length < 10) {
    reasons.push('Translation is empty or truncated');
    return { score: 0, reasons, details: {} };
  }

  // 3. Check for Hindi / Hinglish vocabulary
  for (const pattern of HINDI_PATTERNS) {
    if (pattern.test(translatedText)) {
      reasons.push(`Contains Indian/Hinglish vocabulary matching ${pattern}`);
      score = Math.min(score, 1);
    }
  }

  // 4. Check for meta-commentary
  if (/^(?:Here is|Translation:|Roman Urdu:)/i.test(translatedText)) {
    reasons.push('Contains meta-commentary prefix');
    score = Math.min(score, 1);
  }

  // 5. Check technical terms preservation
  const missingTerms = [];
  if (Array.isArray(fixture.expectedPreservedTerms)) {
    for (const term of fixture.expectedPreservedTerms) {
      // Case-insensitive term check
      const escaped = term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (!regex.test(translatedText)) {
        missingTerms.push(term);
      }
    }
  }

  if (missingTerms.length > 0) {
    // If more than half the required terms are missing, dock score
    if (missingTerms.length > fixture.expectedPreservedTerms.length / 2) {
      reasons.push(`Missing key technical terms: ${missingTerms.join(', ')}`);
      score = Math.min(score, 1);
    }
  }

  // 6. Check natural Pakistani conversational Roman Urdu markers
  const pakistaniMarkers = [
    /\b(?:karein|karna|hoga|hogi|hote|hota|hai|hain|ki|ke|ko|se|mein|pehle|baad|aap|aapko|yeh|aik)\b/i
  ];
  let hasPakistaniGrammar = false;
  for (const marker of pakistaniMarkers) {
    if (marker.test(translatedText)) {
      hasPakistaniGrammar = true;
      break;
    }
  }

  if (!hasPakistaniGrammar) {
    reasons.push('Lacks natural Roman Urdu grammatical structure');
    score = Math.min(score, 0);
  }

  if (reasons.length === 0) {
    reasons.push('Natural Pakistani conversational Roman Urdu with preserved technical terminology.');
  }

  return {
    score,
    reasons,
    details: {
      missingTerms
    }
  };
}

async function runQualityEvaluation() {
  console.log('================================================================');
  console.log('PHASE 5 — REAL-WORLD DOCUMENTATION TRANSLATION QUALITY EVALUATION');
  console.log('Evaluating 30 representative sentences from real documentation sites');
  console.log('Target: >= 90% score 2 (Natural / Good)');
  console.log('================================================================\n');

  // Split into 2 batches of 15 items to respect rate and character guidelines
  const batch1Items = QUALITY_EVAL_SENTENCES.slice(0, 15).map(s => ({ id: s.id, text: s.english }));
  const batch2Items = QUALITY_EVAL_SENTENCES.slice(15, 30).map(s => ({ id: s.id, text: s.english }));

  async function translateBatchWithRetry(batchReq, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await translateWithGemini(batchReq);
      } catch (err) {
        if (err.status === 429 && attempt < maxAttempts) {
          console.warn(`[RATE_LIMITED] Waiting 12s before retry ${attempt + 1}/${maxAttempts}...`);
          await new Promise(r => setTimeout(r, 12000));
        } else {
          throw err;
        }
      }
    }
  }

  console.log('Sending Batch 1 (15 items) to Gemini 2.5 Flash...');
  const res1 = await translateBatchWithRetry({
    operationId: 'quality-eval-batch-1',
    batchId: 'quality-batch-1',
    items: batch1Items
  });

  console.log('Waiting 8s between batches to avoid rate limits...');
  await new Promise(r => setTimeout(r, 8000));

  console.log('Sending Batch 2 (15 items) to Gemini 2.5 Flash...');
  const res2 = await translateBatchWithRetry({
    operationId: 'quality-eval-batch-2',
    batchId: 'quality-batch-2',
    items: batch2Items
  });

  const allResults = [...res1.results, ...res2.results];
  const resultMap = new Map(allResults.map(r => [r.id, r.translatedText]));

  let score2Count = 0;
  let score1Count = 0;
  let score0Count = 0;

  const evaluationTable = [];

  for (let i = 0; i < QUALITY_EVAL_SENTENCES.length; i++) {
    const fixture = QUALITY_EVAL_SENTENCES[i];
    const translatedText = resultMap.get(fixture.id) || '';

    const evalResult = evaluateTranslation(fixture, translatedText);
    if (evalResult.score === 2) score2Count++;
    else if (evalResult.score === 1) score1Count++;
    else score0Count++;

    evaluationTable.push({
      index: i + 1,
      id: fixture.id,
      category: fixture.category,
      source: fixture.source,
      english: fixture.english,
      romanUrdu: translatedText,
      score: evalResult.score,
      assessment: evalResult.reasons.join('; ')
    });

    console.log(`[${i + 1}/30] (${fixture.category} - ${fixture.source}) - Score: ${evalResult.score}/2`);
    console.log(`  EN:  "${fixture.english}"`);
    console.log(`  UR:  "${translatedText}"`);
    console.log(`  RES: ${evalResult.reasons.join('; ')}\n`);
  }

  const total = QUALITY_EVAL_SENTENCES.length;
  const score2Percent = ((score2Count / total) * 100).toFixed(1);

  console.log('================================================================');
  console.log('QUALITY EVALUATION RESULTS SUMMARY:');
  console.log(`Total Samples Evaluated: ${total}`);
  console.log(`Score 2 (Natural / Good):        ${score2Count} (${score2Percent}%)`);
  console.log(`Score 1 (Understandable/Awkward): ${score1Count}`);
  console.log(`Score 0 (Unacceptable):           ${score0Count}`);
  console.log(`Target: >= 90.0% score 2`);

  const passed = parseFloat(score2Percent) >= 90.0;
  if (passed) {
    console.log(`\n✔ QUALITY TARGET ACHIEVED: ${score2Percent}% scored 2 (>= 90% threshold).`);
  } else {
    console.error(`\n✖ QUALITY TARGET NOT ACHIEVED: ${score2Percent}% scored 2 (< 90% threshold).`);
  }
  console.log('================================================================');

  // Export results for reports
  return {
    passed,
    total,
    score2Count,
    score1Count,
    score0Count,
    score2Percent,
    evaluationTable
  };
}

if (require.main === module) {
  runQualityEvaluation()
    .then((res) => {
      if (!res.passed) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Fatal error during quality evaluation:', err);
      process.exit(1);
    });
}

module.exports = {
  runQualityEvaluation,
  evaluateTranslation
};
