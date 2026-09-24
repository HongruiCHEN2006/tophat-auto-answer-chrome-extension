(function (root) {
  "use strict";
  function isAuthorizedMock(url = location.href) {
    try { return url === chrome.runtime.getURL("mock/index.html") || url.startsWith(`${chrome.runtime.getURL("mock/index.html")}#`); }
    catch (_) { return false; }
  }
  async function interactionRouter(question, result, container, options = {}) {
    if (!isAuthorizedMock()) return { success: false, status: "INTERACTION_UNSUPPORTED", interactionType: question.type === "SORTING" || question.type === "MATCHING" ? root.THAA.detectDragInteractionType(container) : "ASSISTANCE_ONLY", reason: "Automatic interaction is disabled on real Top Hat pages" };
    const adapters = {
      SINGLE_CHOICE: root.THAA.singleChoiceAdapter,
      MULTIPLE_SELECT: root.THAA.multipleSelectAdapter,
      WORD_ANSWER: root.THAA.textAdapter,
      LONG_ANSWER: root.THAA.textAdapter,
      NUMERIC: root.THAA.numericAdapter,
      FORMULA: root.THAA.formulaAdapter,
      SORTING: root.THAA.sortingAdapter,
      MATCHING: root.THAA.matchingAdapter
    };
    const adapter = adapters[question.type];
    if (!adapter) return { success: false, status: "INTERACTION_UNSUPPORTED", interactionType: "NONE", reason: "No adapter for question type" };
    try {
      const outcome = await adapter(question, result, container, { allowTestFallback: options.allowTestFallback !== false });
      outcome.status = outcome.success ? "INTERACTION_SUCCESS" : outcome.verificationFailed ? "INTERACTION_VERIFICATION_FAILED" : "INTERACTION_FAILED";
      const submit = root.THAA.queryFirst(container, root.THAA.SELECTORS.submitButtons);
      if (submit && !submit.disabled) submit.click();
      else if (outcome.success) { outcome.success = false; outcome.status = "INTERACTION_FAILED"; outcome.reason = "Submit button not found or disabled"; }
      return outcome;
    } catch (error) {
      return { success: false, status: "INTERACTION_FAILED", interactionType: "UNKNOWN_DRAG", reason: error.message };
    }
  }
  root.THAA = root.THAA || {};
  Object.assign(root.THAA, { isAuthorizedMock, interactionRouter });
})(globalThis);
