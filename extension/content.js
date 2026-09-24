(function (root) {
  "use strict";
  if (root.__THAA_MONITOR__) {
    void root.__THAA_MONITOR__.hello();
    return;
  }
  const T = root.THAA;
  class PageMonitor {
    constructor() {
      this.running = false;
      this.sessionId = null;
      this.observer = null;
      this.scanTimer = null;
      this.debounceTimer = null;
      this.inspecting = false;
      this.pendingInspection = false;
      this.lastUrl = location.href;
      this.boundNavigation = () => this.scheduleInspection("navigation");
      this.patchHistory();
      root.addEventListener("popstate", this.boundNavigation);
      root.addEventListener("hashchange", this.boundNavigation);
    }
    async send(message) {
      try { return await chrome.runtime.sendMessage(message); }
      catch (_) { return null; }
    }
    async hello() {
      const response = await this.send({ type: "CONTENT_HELLO", url: location.href });
      if (response?.start) this.start(response.sessionId);
    }
    patchHistory() {
      if (root.__THAA_HISTORY_PATCHED__) return;
      root.__THAA_HISTORY_PATCHED__ = true;
      for (const method of ["pushState", "replaceState"]) {
        const original = history[method];
        try {
          history[method] = function (...args) {
            const result = original.apply(this, args);
            root.dispatchEvent(new CustomEvent("thaa:navigation"));
            return result;
          };
        } catch (_) {}
      }
      root.addEventListener("thaa:navigation", this.boundNavigation);
    }
    start(sessionId) {
      if (this.running && this.sessionId === sessionId) return;
      this.stop();
      this.running = true; this.sessionId = sessionId;
      const observe = () => {
        if (!document.documentElement || this.observer) return;
        this.observer = new MutationObserver(() => this.scheduleInspection("mutation"));
        this.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      };
      observe();
      this.scanTimer = setInterval(() => { if (location.href !== this.lastUrl) this.lastUrl = location.href; void this.inspectPage("fallback"); }, 3000);
      void this.inspectPage("start");
    }
    stop() {
      this.running = false; this.sessionId = null;
      this.observer?.disconnect(); this.observer = null;
      if (this.scanTimer) clearInterval(this.scanTimer); this.scanTimer = null;
      if (this.debounceTimer) clearTimeout(this.debounceTimer); this.debounceTimer = null;
    }
    scheduleInspection() {
      if (!this.running) return;
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => void this.inspectPage("mutation"), 250);
    }
    async inspectPage(source) {
      if (!this.running) return;
      if (this.inspecting) { this.pendingInspection = true; return; }
      this.inspecting = true;
      try {
        const authState = T.detectAuthState(document, location.href);
        const timer = T.detectTimer(document);
        const container = T.detectQuestionContainer(document);
        await this.send({ type: "PAGE_STATUS", pageState: "CONNECTED", authState, timer, url: location.href, source });
        if (authState === "LOGIN_REQUIRED") return;
        if (!container) { await this.send({ type: "QUESTION_GONE", source }); return; }
        try {
          const type = T.classifyQuestion(container);
          const question = T.parseQuestion(container, type);
          const fingerprint = T.fingerprintQuestion(question);
          await this.send({ type: "QUESTION_DETECTED", fingerprint, question, timer, source });
        } catch (error) {
          const question = { type: "UNKNOWN", prompt: T.promptFor(container) || "Unable to parse question" };
          await this.send({ type: "QUESTION_DETECTED", fingerprint: T.fingerprintQuestion(question), question, timer, source, parseError: String(error.message || error) });
        }
      } finally {
        this.inspecting = false;
        if (this.pendingInspection) { this.pendingInspection = false; this.scheduleInspection("pending"); }
      }
    }
    async applyAnswer(message) {
      if (!this.running) return { interaction: { success: false, status: "SESSION_STOPPED", reason: "Session is not running" } };
      const container = T.detectQuestionContainer(document);
      if (!container) return { interaction: { success: false, status: "QUESTION_EXPIRED", reason: "Question container is no longer present" } };
      let current;
      try { current = T.parseQuestion(container, T.classifyQuestion(container)); }
      catch (error) { return { interaction: { success: false, status: "PARSING_FAILED", reason: error.message } }; }
      if (T.fingerprintQuestion(current) !== message.fingerprint) return { interaction: { success: false, status: "QUESTION_CHANGED", reason: "Visible question changed before interaction" } };
      const interaction = await T.interactionRouter(message.question, message.result, container, { allowTestFallback: true });
      return { interaction };
    }
  }
  const monitor = new PageMonitor();
  root.__THAA_MONITOR__ = monitor;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "START_MONITOR") { monitor.start(message.sessionId); sendResponse({ ok: true }); return false; }
    if (message.type === "STOP_MONITOR") { monitor.stop(); sendResponse({ ok: true }); return false; }
    if (message.type === "APPLY_ANSWER") { void monitor.applyAnswer(message).then(sendResponse); return true; }
    return false;
  });
  if (T.isAuthorizedMock?.()) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.appState) return;
      const state = changes.appState.newValue;
      if (state?.session?.running && state.settings?.targetUrl === location.href) monitor.start(state.session.id);
      else if (!state?.session?.running) monitor.stop();
    });
  }
  void monitor.hello();
})(globalThis);
