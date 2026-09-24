(function (root) {
  "use strict";
  async function formulaAdapter(question, result, container) {
    const input = root.THAA.queryFirst(container, root.THAA.SELECTORS.formulaInputs);
    if (!input) return { success: false, interactionType: "DIRECT_CONTROL", reason: "Formula input not found" };
    root.THAA.setNativeValue(input, result.expression);
    return { success: root.THAA.verifyInteraction(question, result, container), interactionType: "DIRECT_CONTROL", reason: "Formula value was not verified" };
  }
  root.THAA = root.THAA || {};
  root.THAA.formulaAdapter = formulaAdapter;
})(globalThis);
