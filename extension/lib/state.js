(function (root) {
  "use strict";
  const QUESTION_TYPES = Object.freeze([
    "SINGLE_CHOICE", "MULTIPLE_SELECT", "WORD_ANSWER", "LONG_ANSWER", "NUMERIC",
    "FORMULA", "SORTING", "MATCHING", "UNSUPPORTED", "UNKNOWN"
  ]);
  const FAILURE_CATEGORIES = Object.freeze([
    "DETECTION_FAILED", "PARSING_FAILED", "UNSUPPORTED_TYPE", "UNKNOWN_TYPE", "API_FAILED",
    "API_TIMEOUT", "INVALID_API_RESPONSE", "ANSWER_FAILED", "INTERACTION_FAILED",
    "INTERACTION_UNSUPPORTED", "INTERACTION_VERIFICATION_FAILED", "LOGIN_REQUIRED",
    "QUESTION_EXPIRED", "QUESTION_CHANGED", "STALE_RESULT_IGNORED", "SESSION_STOPPED"
  ]);
  function typeStats() {
    return Object.fromEntries(QUESTION_TYPES.map((type) => [type, {
      detected: 0, answerSuccess: 0, answerFailed: 0,
      interactionSuccess: 0, interactionFailed: 0, interactionUnsupported: 0
    }]));
  }
  function freshStatistics() {
    return {
      totalUniqueQuestions: 0, processed: 0, duplicatesIgnored: 0,
      answer: { success: 0, failed: 0, unsupported: 0 },
      interaction: { success: 0, failed: 0, unsupported: 0 },
      questionsChangedBeforeCompletion: 0, staleResultsIgnored: 0,
      loginInterruptions: 0, apiRetries: 0,
      apiUsage: { requests: 0, retries: 0, failures: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, available: false },
      byType: typeStats()
    };
  }
  function defaultState() {
    return {
      schemaVersion: 1,
      enabled: true,
      settings: {
        targetUrl: "https://app.tophat.com/e/847921/lecture",
        answerMode: "random",
        hasApiKey: false,
        mockFallbackEnabled: true
      },
      session: { id: null, running: false, startedAt: null, endedAt: null, durationMs: 0 },
      targetTabId: null,
      pageState: "NOT_FOUND",
      authState: "UNKNOWN",
      currentQuestion: null,
      statistics: freshStatistics(),
      logs: [],
      processedQuestions: {},
      finalReport: null
    };
  }
  function mergeState(saved) {
    const base = defaultState();
    if (!saved || saved.schemaVersion !== base.schemaVersion) return base;
    return {
      ...base, ...saved,
      settings: { ...base.settings, ...(saved.settings || {}) },
      session: { ...base.session, ...(saved.session || {}) },
      statistics: {
        ...base.statistics, ...(saved.statistics || {}),
        apiUsage: { ...base.statistics.apiUsage, ...(saved.statistics?.apiUsage || {}) },
        byType: { ...base.statistics.byType, ...(saved.statistics?.byType || {}) }
      },
      logs: Array.isArray(saved.logs) ? saved.logs.slice(-1000) : [],
      processedQuestions: saved.processedQuestions || {}
    };
  }
  root.THAA = root.THAA || {};
  Object.assign(root.THAA, { QUESTION_TYPES, FAILURE_CATEGORIES, freshStatistics, defaultState, mergeState });
})(globalThis);
