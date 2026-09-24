(function (root) {
  "use strict";
  function sessionId() {
    return globalThis.crypto?.randomUUID?.() || `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  function startSessionState(state) {
    state.session = { id: sessionId(), running: true, startedAt: Date.now(), endedAt: null, durationMs: 0 };
    state.targetTabId = null;
    state.pageState = "NOT_FOUND";
    state.authState = "UNKNOWN";
    state.currentQuestion = null;
    state.statistics = root.THAA.freshStatistics();
    state.logs = [];
    state.processedQuestions = {};
    state.finalReport = null;
    root.THAA.appendLog(state, "SESSION", "Started");
    return state;
  }
  function durationText(ms) {
    const total = Math.max(0, Math.floor((ms || 0) / 1000));
    const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60;
    return `${hours ? `${hours}h ` : ""}${minutes}m ${seconds}s`;
  }
  function generateReport(state) {
    const s = state.statistics, failures = Object.values(state.processedQuestions).filter((q) =>
      q.answerStatus !== "SUCCESS" || !["INTERACTION_SUCCESS", "INTERACTION_UNSUPPORTED"].includes(q.interaction?.status)
    );
    const lines = [
      "SESSION REPORT", "", `Session ID: ${state.session.id || "—"}`,
      `Started: ${state.session.startedAt ? new Date(state.session.startedAt).toLocaleString() : "—"}`,
      `Ended: ${state.session.endedAt ? new Date(state.session.endedAt).toLocaleString() : "—"}`,
      `Duration: ${durationText(state.session.durationMs)}`, "", "────────────────────────", "",
      `Unique Questions: ${s.totalUniqueQuestions}`, `Processed: ${s.processed}`, `Duplicates Ignored: ${s.duplicatesIgnored}`, "",
      "Answer Generation:", `Success: ${s.answer.success}`, `Failed: ${s.answer.failed}`, `Unsupported: ${s.answer.unsupported}`, "",
      "Interaction:", `Success: ${s.interaction.success}`, `Failed: ${s.interaction.failed}`, `Unsupported: ${s.interaction.unsupported}`, "",
      `Questions Changed Before Completion: ${s.questionsChangedBeforeCompletion}`,
      `Stale Results Ignored: ${s.staleResultsIgnored}`, `Login Interruptions: ${s.loginInterruptions}`, `API Retries: ${s.apiRetries}`, "",
      "API USAGE", "", `Requests: ${s.apiUsage?.requests || 0}`, `Retries: ${s.apiUsage?.retries || 0}`, `Failures: ${s.apiUsage?.failures || 0}`,
      s.apiUsage?.available ? `Input Tokens: ${s.apiUsage.inputTokens.toLocaleString()}\nCached Input Tokens: ${s.apiUsage.cachedInputTokens.toLocaleString()}\nOutput Tokens: ${s.apiUsage.outputTokens.toLocaleString()}` : "Token usage: unavailable", "",
      "────────────────────────", "", "BY TYPE", ""
    ];
    for (const type of root.THAA.QUESTION_TYPES) {
      const t = s.byType[type];
      if (!t.detected) continue;
      lines.push(type, `Detected: ${t.detected}`, `Answer success: ${t.answerSuccess}`, `Answer failed: ${t.answerFailed}`,
        `Interaction success: ${t.interactionSuccess}`, `Interaction failed: ${t.interactionFailed}`, `Interaction unsupported: ${t.interactionUnsupported}`, "");
    }
    lines.push("────────────────────────", "", "FAILURES", "");
    if (!failures.length) lines.push("None");
    for (const q of failures) {
      lines.push(`#${q.sequence} ${q.type}`, `Answer: ${q.answerStatus}`, `Interaction: ${q.interaction?.status || "NOT_ATTEMPTED"}`,
        `Drag type: ${q.interaction?.type || "—"}`, `Reason: ${q.interaction?.reason || q.failureReason || "—"}`, q.result ? `Generated result: ${JSON.stringify(q.result)}` : "", "");
    }
    return { generatedAt: Date.now(), text: lines.join("\n"), summary: { sessionId: state.session.id, durationMs: state.session.durationMs, statistics: s } };
  }
  function stopSessionState(state) {
    if (!state.session.running) return state;
    state.session.running = false;
    state.session.endedAt = Date.now();
    state.session.durationMs = state.session.endedAt - state.session.startedAt;
    if (state.currentQuestion?.status === "PROCESSING") {
      state.currentQuestion.status = "SESSION_STOPPED";
      const record = state.processedQuestions[state.currentQuestion.fingerprint];
      if (record) { record.status = "SESSION_STOPPED"; record.finalStatus = "SESSION_STOPPED"; }
    }
    root.THAA.appendLog(state, "SESSION", "Stopped");
    state.finalReport = generateReport(state);
    return state;
  }
  root.THAA = root.THAA || {};
  Object.assign(root.THAA, { sessionId, startSessionState, stopSessionState, generateReport, durationText });
})(globalThis);
