/**
 * Recall Test Cases for Semantic Memory Trigger
 *
 * These test cases validate the semantic trigger policy against the
 * keyword-based legacy system. Cases marked with expectedWithFix: true
 * are known bugs in the legacy system that the semantic trigger should fix.
 */

export interface RecallTestCase {
  id: string
  text: string
  context?: string
  expected: "recall" | "shadow" | "skip"
  expectedWithFix?: boolean
  bugId?: string
  reason?: string
}

export interface RecallTestSuite {
  shouldRecall: RecallTestCase[]
  shouldSkip: RecallTestCase[]
}

export const RECALL_TEST_CASES: RecallTestSuite = {
  /**
   * Cases that MUST trigger recall
   * (Legacy system fails on most of these due to missing Italian keywords)
   */
  shouldRecall: [
    {
      id: "motherboard-discussion-recall",
      text: "suggeriscimi delle schede madri",
      context: "User discussed motherboards yesterday",
      expected: "recall",
      expectedWithFix: true,
      bugId: "italian-keyword-missing",
      reason: "Topic semantic similarity with recent episode about motherboards",
    },
    {
      id: "italian-conversazione-reference",
      text: "rispetto alla nostra recente conversazione",
      context: "User mentioned conversazione context",
      expected: "recall",
      expectedWithFix: true,
      bugId: "italian-keyword-missing",
      reason: "Direct reference to recent conversation",
    },
    {
      id: "italian-recente-discussione",
      text: "di cosa abbiamo discusso di recente sulle schede madri",
      context: "Recent discussion about motherboards",
      expected: "recall",
      expectedWithFix: true,
      bugId: "italian-keyword-missing",
      reason: "Italian query about recent discussion",
    },
    {
      id: "motherboard-English-recall",
      text: "recommend some motherboards",
      context: "User previously discussed MSI and ASUS ROG motherboards",
      expected: "recall",
      reason: "English query semantically related to past discussion",
    },
    {
      id: "italian-consigliami",
      text: "consigliami delle schede madri per gaming",
      context: "Previous discussion about gaming PC components",
      expected: "recall",
      expectedWithFix: true,
      bugId: "italian-keyword-missing",
      reason: "Italian recommendation request related to past topic",
    },
    {
      id: "project-context-reference",
      text: "continue where we left off on the backend",
      context: "Previous session about backend development",
      expected: "recall",
      reason: "Continuation request from past session",
    },
    {
      id: "feedback-reference",
      text: "remember what feedback i gave on the API design",
      context: "User gave feedback on API design last session",
      expected: "recall",
      reason: "Explicit reference to past feedback",
    },
    {
      id: "preference-reference",
      text: "use my previous preferences for the database schema",
      context: "User expressed preferences about database design",
      expected: "recall",
      expectedWithFix: true,
      bugId: "preference-keyword-missing",
      reason: "Preference reuse signal",
    },
    {
      id: "italian-ultime-sessioni",
      text: "cosa abbiamo fatto nelle ultime sessioni",
      context: "Multiple past sessions exist",
      expected: "recall",
      expectedWithFix: true,
      bugId: "italian-keyword-missing",
      reason: "Italian query about recent sessions",
    },
    {
      id: "english-recall-explicit",
      text: "what did we talk about in previous sessions",
      context: "Previous sessions exist",
      expected: "recall",
      reason: "English explicit recall signal",
    },
    {
      id: "italian-preferenze",
      text: "in base alle mie preferenze, scegli il framework",
      context: "User preferences stored in memory",
      expected: "recall",
      expectedWithFix: true,
      bugId: "preference-keyword-missing",
      reason: "Italian preference-based request",
    },
    {
      id: "cross-lingual-semantic",
      text: "we discussed the motherboard issue before",
      context: "Past episode about motherboard problems",
      expected: "recall",
      reason: "Cross-lingual semantic similarity",
    },
  ],

  /**
   * Cases that MUST NOT trigger recall
   * (Pure coding tasks with no memory relevance)
   */
  shouldSkip: [
    {
      id: "pure-coding-fix-lint",
      text: "fix lint errors in src/index.ts",
      expected: "skip",
      reason: "Pure coding task, no memory context needed",
    },
    {
      id: "pure-coding-api-handler",
      text: "implement the API handler for retries",
      expected: "skip",
      reason: "Pure coding task",
    },
    {
      id: "pure-coding-json-parser",
      text: "write a function to parse JSON",
      expected: "skip",
      reason: "Pure coding task",
    },
    {
      id: "pure-coding-typescript",
      text: "add TypeScript types to this module",
      expected: "skip",
      reason: "Pure coding task",
    },
    {
      id: "pure-coding-git",
      text: "git commit -m 'fix bug'",
      expected: "skip",
      reason: "Git command, no memory context",
    },
    {
      id: "pure-coding-npm-install",
      text: "npm install express",
      expected: "skip",
      reason: "Package installation",
    },
    {
      id: "pure-coding-file-create",
      text: "create a new file called utils.ts",
      expected: "skip",
      reason: "Simple file creation",
    },
    {
      id: "pure-coding-debug",
      text: "debug why the test is failing",
      expected: "skip",
      reason: "Debugging task without memory reference",
    },
    {
      id: "italian-pure-coding",
      text: "crea un file chiamato test.ts",
      expected: "skip",
      reason: "Italian command but pure coding task",
    },
    {
      id: "english-general-coding",
      text: "write a sorting algorithm",
      expected: "skip",
      reason: "General coding task",
    },
  ],
}

/**
 * BM25 Fallback test cases
 * These verify the fallback mechanism when LM Studio is unavailable
 */
export const BM25_FALLBACK_TEST_CASES: RecallTestCase[] = [
  {
    id: "bm25-exact-term-match",
    text: "installare Node.js",
    context: "Episode about Node.js installation",
    expected: "recall",
    expectedWithFix: true,
    bugId: "bm25-fallback-needed",
    reason: "BM25 should catch exact term match when vector unavailable",
  },
  {
    id: "bm25-partial-match",
    text: "schede madri",
    context: "Episode with 'schede madri' exact phrase",
    expected: "recall",
    expectedWithFix: true,
    bugId: "bm25-fallback-needed",
    reason: "BM25 fallback for Italian terms",
  },
]

/**
 * Threshold calibration test cases
 * Used to tune the recall and shadow thresholds
 */
export const THRESHOLD_CALIBRATION_CASES: Array<{
  query: string
  context: string
  expectedScore: number
  note: string
}> = [
  {
    query: "suggeriscimi delle schede madri",
    context: "discussione su schede madri",
    expectedScore: 0.6,
    note: "High similarity - same topic",
  },
  {
    query: "recommend some motherboards",
    context: "discussione su schede madri",
    expectedScore: 0.5,
    note: "Cross-lingual similarity",
  },
  {
    query: "fix the bug in index.ts",
    context: "discussione su backend API",
    expectedScore: 0.15,
    note: "Unrelated - pure coding",
  },
  {
    query: "continue the project",
    context: "discussione su progetto backend",
    expectedScore: 0.45,
    note: "Contextual continuation",
  },
]
