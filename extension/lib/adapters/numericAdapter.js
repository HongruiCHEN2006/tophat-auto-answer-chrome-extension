(function (root) {
  "use strict";
  async function numericAdapter(question, result, container) {
    const input = root.THAA.queryFirst(container, root.THAA.SELECTORS.numericInputs);
    if (!input) return { success: false, interactionType: "DIRECT_CONTROL", reason: "Numeric input not found" };
    root.THAA.setNativeValue(input, result.value);
    return { success: root.THAA.verifyInteraction(question, result, container), interactionType: "DIRECT_CONTROL", reason: "Numeric value was not verified" };
  }
  root.THAA = root.THAA || {};
  root.THAA.numericAdapter = numericAdapter;
})(globalThis);
