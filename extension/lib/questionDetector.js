(function (root) {
  "use strict";
  const S = () => root.THAA.SELECTORS;
  const queryFirst = (scope, selectors) => {
    for (const selector of selectors) {
      try { const found = scope.querySelector(selector); if (found) return found; } catch (_) {}
    }
    return null;
  };
  const queryAll = (scope, selectors) => {
    const seen = new Set();
    const result = [];
    for (const selector of selectors) {
      try {
        for (const node of scope.querySelectorAll(selector)) {
          if (!seen.has(node)) { seen.add(node); result.push(node); }
        }
      } catch (_) {}
    }
    return result;
  };
  function isVisible(node) {
    if (!node || node.hidden || node.getAttribute?.("aria-hidden") === "true") return false;
    if (node.closest?.("[hidden], [aria-hidden='true']")) return false;
    const style = root.getComputedStyle ? root.getComputedStyle(node) : null;
    return !style || (style.display !== "none" && style.visibility !== "hidden");
  }
  function detectQuestionContainer(doc = document) {
    const candidates = queryAll(doc, S().questionContainers).filter(isVisible);
    return candidates.find((node) =>
      queryFirst(node, [...S().radioOptions, ...S().checkboxOptions, ...S().textInputs, ...S().numericInputs,
        ...S().formulaInputs, ...S().sortingContainers, ...S().matchingContainers, ...S().graphicalIndicators])
    ) || candidates[0] || null;
  }
  function detectAuthState(doc = document, url = location.href) {
    if (/\/(login|signin|sign-in|auth)(\/|\?|$)/i.test(url)) return "LOGIN_REQUIRED";
    if (queryAll(doc, S().loginIndicators).some(isVisible)) return "LOGIN_REQUIRED";
    return detectQuestionContainer(doc) || /\/e\/[^/]+(?:\/lecture)?(?:[?#]|$)/i.test(url) ? "AUTHENTICATED" : "UNKNOWN";
  }
  function parseTimerText(text) {
    const value = String(text || "");
    const colon = value.match(/\b(\d{1,2}):(\d{2})\b/);
    if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
    const units = value.match(/(?:(\d+)\s*m(?:in)?\s*)?(\d+)\s*s(?:ec)?/i);
    if (units) return Number(units[1] || 0) * 60 + Number(units[2]);
    return null;
  }
  function detectTimer(doc = document) {
    const node = queryFirst(doc, S().timerCandidates);
    return { remainingSeconds: node ? parseTimerText(node.textContent || node.getAttribute("aria-label")) : null };
  }
  root.THAA = root.THAA || {};
  Object.assign(root.THAA, { queryFirst, queryAll, isVisible, detectQuestionContainer, detectAuthState, parseTimerText, detectTimer });
})(globalThis);
