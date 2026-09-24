"use strict";
importScripts(
  "lib/state.js", "lib/storage.js", "lib/logger.js", "lib/sessionManager.js",
  "lib/randomProvider.js", "lib/openaiProvider.js", "lib/answerEngine.js"
);

const T = globalThis.THAA;
let statePromise = T.initializeStorage();
let mutationQueue = Promise.resolve();

function mutate(fn) {
  mutationQueue = mutationQueue.then(async () => {
    const state = await statePromise;
    await fn(state);
    await T.saveState(state);
    return state;
  }).catch((error) => console.error("[THAA][ERROR] state mutation", T.safeMessage?.(error.message) || error));
  return mutationQueue;
}
function publicState(state) {
  return JSON.parse(JSON.stringify(state));
}
function isTopHatUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "app.tophat.com" && /^\/e\/[^/?#]+(?:\/lecture)?\/?$/.test(u.pathname);
  } catch (_) { return false; }
}
function mockUrl() { return chrome.runtime.getURL("mock/index.html"); }
function isValidTargetUrl(value) { return isTopHatUrl(value) || value === mockUrl(); }
function targetMatches(candidate, target) {
  try {
    const a = new URL(candidate), b = new URL(target);
    if (a.origin !== b.origin) return false;
    const ap = a.pathname.replace(/\/$/, ""), bp = b.pathname.replace(/\/$/, "");
    return ap === bp || (bp.match(/^\/e\/[^/]+$/) && ap === `${bp}/lecture`);
  } catch (_) { return false; }
}
async function sendToTab(tabId, message) {
  if (!tabId) return null;
  try { return await chrome.tabs.sendMessage(tabId, message); } catch (_) { return null; }
}
async function findAndAttach(state) {
  const tabs = await chrome.tabs.query({});
  const target = tabs.find((tab) => tab.url && targetMatches(tab.url, state.settings.targetUrl));
  if (!target) {
    state.targetTabId = null; state.pageState = "NOT_FOUND";
    T.appendLog(state, "TAB", "Target page not found");
    return null;
  }
  state.targetTabId = target.id; state.pageState = "CONNECTED";
  T.appendLog(state, "TAB", "Target page connected");
  try { await chrome.tabs.update(target.id, { autoDiscardable: false }); } catch (_) {}
  await sendToTab(target.id, { type: "START_MONITOR", sessionId: state.session.id });
  return target;
}
function markUnsupported(state, record, reason) {
  record.status = "UNSUPPORTED"; record.answerStatus = "UNSUPPORTED_TYPE"; record.finalStatus = "UNSUPPORTED_TYPE"; record.failureReason = reason;
  state.statistics.answer.unsupported += 1;
  state.statistics.interaction.unsupported += 1;
  state.statistics.byType[record.type].answerFailed += 1;
  state.statistics.byType[record.type].interactionUnsupported += 1;
  state.currentQuestion = { fingerprint: record.fingerprint, type: record.type, status: "UNSUPPORTED", result: null, interactionStatus: "INTERACTION_UNSUPPORTED" };
}
async function processQuestion(fingerprint) {
  const state = await statePromise;
  const initial = state.processedQuestions[fingerprint];
  if (!initial) return;
  let outcome;
  try {
    const apiKey = state.settings.answerMode === "openai" ? await T.getApiKey() : "";
    outcome = await T.generateAnswer(initial.question, state.settings.answerMode, apiKey, {
      onRequest: () => void mutate((s) => { s.statistics.apiUsage.requests += 1; }),
      onUsage: (usage) => {
        if (!usage) return;
        void mutate((s) => {
          s.statistics.apiUsage.available = true;
          s.statistics.apiUsage.inputTokens += usage.inputTokens;
          s.statistics.apiUsage.outputTokens += usage.outputTokens;
          s.statistics.apiUsage.cachedInputTokens += usage.cachedInputTokens;
        });
      },
      onRetry: () => {
        void mutate((s) => { s.statistics.apiRetries += 1; s.statistics.apiUsage.retries += 1; T.appendLog(s, "OPENAI", "Retrying once after provider failure"); });
      }
    });
  } catch (error) {
    await mutate((s) => {
      const record = s.processedQuestions[fingerprint]; if (!record) return;
      record.processedAt = Date.now(); record.status = "FAILED"; record.answerStatus = error.category || "ANSWER_FAILED";
      record.failureReason = T.safeMessage(error.message); record.finalStatus = "ANSWER_FAILED";
      if (record.answerEngine === "OPENAI") s.statistics.apiUsage.failures += 1;
      s.statistics.processed += 1; s.statistics.answer.failed += 1; s.statistics.byType[record.type].answerFailed += 1;
      if (s.currentQuestion?.fingerprint === fingerprint) s.currentQuestion = { ...s.currentQuestion, status: "FAILED", failure: record.answerStatus };
      T.appendLog(s, "ERROR", `${record.answerStatus}: ${record.failureReason}`);
    });
    return;
  }
  let tabId, question, result, shouldInteract = false, authorizedTopHat = false, allowTestFallback = false;
  await mutate((s) => {
    const record = s.processedQuestions[fingerprint]; if (!record) return;
    if (!s.session.running || s.currentQuestion?.fingerprint !== fingerprint) {
      const terminal = record.status === "QUESTION_EXPIRED" || record.status === "SESSION_STOPPED" ? record.status : "STALE_RESULT_IGNORED";
      record.status = terminal; record.answerStatus = "STALE_RESULT_IGNORED"; record.finalStatus = terminal;
      s.statistics.staleResultsIgnored += 1;
      if (terminal !== "SESSION_STOPPED") s.statistics.questionsChangedBeforeCompletion += 1;
      T.appendLog(s, "ANSWER", "STALE_RESULT_IGNORED"); return;
    }
    record.processedAt = Date.now(); record.status = "READY"; record.answerStatus = "SUCCESS"; record.result = outcome.result; record.answerEngine = outcome.engine;
    s.statistics.processed += 1; s.statistics.answer.success += 1; s.statistics.byType[record.type].answerSuccess += 1;
    s.currentQuestion = { fingerprint, type: record.type, status: "READY", result: outcome.result, engine: outcome.engine, interactionStatus: "INTERACTION_PENDING" };
    T.appendLog(s, "ANSWER", "Answer ready");
    tabId = s.targetTabId; question = record.question; result = outcome.result;
    const isMock = s.settings.targetUrl === mockUrl();
    authorizedTopHat = s.settings.authorizedTopHatAutomation === true && isTopHatUrl(s.settings.targetUrl);
    allowTestFallback = isMock && s.settings.mockFallbackEnabled !== false;
    shouldInteract = isMock || authorizedTopHat;
    if (!shouldInteract) {
      record.interaction = { type: ["SORTING", "MATCHING"].includes(record.type) ? "UNKNOWN_DRAG" : "ASSISTANCE_ONLY", status: "INTERACTION_UNSUPPORTED", attempts: 0, reason: "Authorized Top Hat automation is disabled for this target" };
      record.finalStatus = "ANSWER_READY"; s.statistics.interaction.unsupported += 1; s.statistics.byType[record.type].interactionUnsupported += 1;
      s.currentQuestion.interactionStatus = "INTERACTION_UNSUPPORTED";
    }
  });
  if (!shouldInteract || !tabId) return;
  const response = await sendToTab(tabId, {
    type: "APPLY_ANSWER", fingerprint, question, result,
    authorizedTopHat,
    allowTestFallback
  });
  await mutate((s) => {
    const record = s.processedQuestions[fingerprint]; if (!record) return;
    const interaction = response?.interaction || { success: false, status: "INTERACTION_FAILED", interactionType: "UNKNOWN_DRAG", reason: "Content script did not return an interaction result" };
    record.interaction = { type: interaction.interactionType || "UNKNOWN_DRAG", status: interaction.status || (interaction.success ? "INTERACTION_SUCCESS" : "INTERACTION_FAILED"), attempts: 1, reason: interaction.reason, fallbackUsed: Boolean(interaction.fallbackUsed), initialFailureReason: interaction.initialFailureReason };
    record.finalStatus = interaction.success ? "SUCCESS" : "INTERACTION_FAILED";
    if (interaction.success) { s.statistics.interaction.success += 1; s.statistics.byType[record.type].interactionSuccess += 1; }
    else { s.statistics.interaction.failed += 1; s.statistics.byType[record.type].interactionFailed += 1; }
    if (s.currentQuestion?.fingerprint === fingerprint) s.currentQuestion.interactionStatus = record.interaction.status;
    T.appendLog(s, "INTERACTION", `${record.interaction.status}${interaction.fallbackUsed ? " (test fallback used)" : ""}`);
  });
}
async function handleQuestion(message, sender) {
  let process = false, fp = message.fingerprint;
  await mutate((state) => {
    if (!state.session.running || sender.tab?.id !== state.targetTabId) return;
    if (state.authState === "LOGIN_REQUIRED") return;
    if (state.processedQuestions[fp]) {
      state.statistics.duplicatesIgnored += 1;
      T.appendLog(state, "QUESTION", `Duplicate ignored: ${fp}`);
      return;
    }
    const type = T.QUESTION_TYPES.includes(message.question?.type) ? message.question.type : "UNKNOWN";
    const record = {
      id: `question-${state.statistics.totalUniqueQuestions + 1}`, sequence: state.statistics.totalUniqueQuestions + 1,
      fingerprint: fp, type, detectedAt: Date.now(), processedAt: null, question: message.question,
      answerEngine: state.settings.answerMode.toUpperCase(), answerStatus: "PROCESSING", result: null,
      interaction: { type: "NONE", status: "INTERACTION_PENDING", attempts: 0 }, finalStatus: "PROCESSING", status: "PROCESSING"
    };
    state.processedQuestions[fp] = record; state.statistics.totalUniqueQuestions += 1; state.statistics.byType[type].detected += 1;
      state.currentQuestion = { fingerprint: fp, type, status: "PROCESSING", result: null, engine: record.answerEngine, interactionStatus: "INTERACTION_PENDING", timer: message.timer || { remainingSeconds: null } };
    T.appendLog(state, "QUESTION", `${type} detected`); T.appendLog(state, "QUESTION", `fingerprint=${fp}`);
    if (type === "UNSUPPORTED" || type === "UNKNOWN") markUnsupported(state, record, type === "UNSUPPORTED" ? "Graphical or intentionally unsupported question" : message.parseError || "Question type could not be determined");
    else process = true;
  });
  if (process) void processQuestion(fp);
}

chrome.runtime.onInstalled.addListener(() => { void T.initializeStorage(); });
chrome.runtime.onStartup.addListener(() => { void statePromise.then((s) => s.session.running && mutate(findAndAttach)); });
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const state = await statePromise;
    if (message.type === "GET_STATE") return { ok: true, state: publicState(state), mockUrl: mockUrl() };
    if (message.type === "SAVE_SETTINGS") {
      if (!isValidTargetUrl(message.settings?.targetUrl)) return { ok: false, error: "Use a Top Hat course/lecture URL or the packaged mock URL." };
      if (!["openai", "random"].includes(message.settings.answerMode)) return { ok: false, error: "Invalid answer mode." };
      if (message.settings.authorizedTopHatAutomation === true && !isTopHatUrl(message.settings.targetUrl)) return { ok: false, error: "Authorized Top Hat automation requires an exact Top Hat course/lecture URL." };
      if (message.settings.clearApiKey) await T.setApiKey("");
      else if (typeof message.settings.apiKey === "string") await T.setApiKey(message.settings.apiKey);
      const hasApiKey = Boolean(await T.getApiKey());
      await mutate((s) => { s.settings = { ...s.settings, targetUrl: message.settings.targetUrl, answerMode: message.settings.answerMode, hasApiKey, authorizedTopHatAutomation: message.settings.authorizedTopHatAutomation === true, mockFallbackEnabled: message.settings.mockFallbackEnabled !== false }; T.appendLog(s, "STATE", `Settings saved; authorized Top Hat automation ${message.settings.authorizedTopHatAutomation === true ? "enabled" : "disabled"}`); });
      return { ok: true };
    }
    if (message.type === "START_SESSION") {
      if (!isValidTargetUrl(state.settings.targetUrl)) return { ok: false, error: "Save a valid target URL first." };
      if (state.settings.answerMode === "openai" && !(await T.getApiKey())) return { ok: false, error: "Add an OpenAI API key or select Random mode." };
      await mutate(async (s) => { T.startSessionState(s); await findAndAttach(s); });
      return { ok: true };
    }
    if (message.type === "STOP_SESSION") {
      const tabId = state.targetTabId; await sendToTab(tabId, { type: "STOP_MONITOR" }); await mutate((s) => T.stopSessionState(s)); return { ok: true };
    }
    if (message.type === "OPEN_MOCK") {
      const url = mockUrl(); const tab = await chrome.tabs.create({ url });
      await mutate((s) => { s.settings.targetUrl = url; s.targetTabId = tab.id; s.pageState = "CONNECTED"; });
      return { ok: true, url };
    }
    if (message.type === "CONTENT_HELLO") {
      if (state.session.running && sender.tab?.url && targetMatches(sender.tab.url, state.settings.targetUrl)) {
        await mutate((s) => { s.targetTabId = sender.tab.id; s.pageState = "CONNECTED"; T.appendLog(s, "TAB", "Content script connected"); });
        return { ok: true, start: true, sessionId: state.session.id };
      }
      return { ok: true, start: false };
    }
    if (message.type === "PAGE_STATUS") {
      await mutate((s) => {
        if (!s.session.running || sender.tab?.id !== s.targetTabId) return;
        s.pageState = message.pageState || "CONNECTED";
        const old = s.authState; s.authState = message.authState || "UNKNOWN";
        if (old !== s.authState) {
          T.appendLog(s, "AUTH", s.authState === "LOGIN_REQUIRED" ? "Login required; processing paused" : s.authState === "AUTHENTICATED" ? "Authenticated; monitoring resumed" : "Authentication unknown");
          if (s.authState === "LOGIN_REQUIRED" && old !== "LOGIN_REQUIRED") s.statistics.loginInterruptions += 1;
        }
        if (s.currentQuestion && message.timer) s.currentQuestion.timer = message.timer;
      }); return { ok: true };
    }
    if (message.type === "QUESTION_DETECTED") { await handleQuestion(message, sender); return { ok: true }; }
    if (message.type === "QUESTION_GONE") {
      await mutate((s) => {
        if (!s.session.running || sender.tab?.id !== s.targetTabId || !s.currentQuestion) return;
        const record = s.processedQuestions[s.currentQuestion.fingerprint];
        if (record?.status === "PROCESSING") { record.status = "QUESTION_EXPIRED"; record.finalStatus = "QUESTION_EXPIRED"; T.appendLog(s, "QUESTION", "Question expired before completion"); }
        s.currentQuestion = null;
      });
      return { ok: true };
    }
    return { ok: false, error: "Unknown message" };
  })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: T.safeMessage(error.message) }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => { void mutate((s) => { if (s.targetTabId === tabId) { s.targetTabId = null; s.pageState = "NOT_FOUND"; T.appendLog(s, "TAB", "Target tab closed"); } }); });
chrome.tabs.onUpdated.addListener((tabId, change, tab) => { void statePromise.then((s) => {
  if (!s.session.running || !change.url) return;
  if (targetMatches(tab.url, s.settings.targetUrl)) void mutate(async (next) => { next.targetTabId = tabId; next.pageState = "CONNECTED"; try { await chrome.tabs.update(tabId, { autoDiscardable: false }); } catch (_) {} await sendToTab(tabId, { type: "START_MONITOR", sessionId: next.session.id }); });
  else if (s.targetTabId === tabId) void mutate((next) => { next.pageState = "NOT_FOUND"; next.authState = /login|sign-in/i.test(tab.url || "") ? "LOGIN_REQUIRED" : "UNKNOWN"; T.appendLog(next, "MONITOR", "Target route disappeared; paused"); });
}); });

void statePromise.then((s) => { if (s.session.running) void mutate(findAndAttach); });
