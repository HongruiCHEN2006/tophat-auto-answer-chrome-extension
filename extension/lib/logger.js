(function (root) {
  "use strict";
  const DEBUG = false;
  const ALLOWED = new Set(["SESSION", "TAB", "MONITOR", "AUTH", "QUESTION", "PARSER", "ANSWER", "OPENAI", "RANDOM", "INTERACTION", "STATE", "ERROR"]);
  function safeMessage(message) {
    return String(message || "").replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]").slice(0, 1000);
  }
  function appendLog(state, category, message, data) {
    const entry = {
      at: Date.now(), category: ALLOWED.has(category) ? category : "STATE",
      message: safeMessage(message)
    };
    if (data !== undefined) entry.data = JSON.parse(JSON.stringify(data, (key, value) => /key|token|cookie|password/i.test(key) ? "[REDACTED]" : value));
    state.logs.push(entry);
    if (state.logs.length > 1000) state.logs.splice(0, state.logs.length - 1000);
    if (DEBUG) console.debug(`[THAA][${entry.category}]`, entry.message, entry.data || "");
    return entry;
  }
  root.THAA = root.THAA || {};
  Object.assign(root.THAA, { DEBUG, appendLog, safeMessage });
})(globalThis);
