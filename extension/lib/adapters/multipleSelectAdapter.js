(function (root) {
  "use strict";
  async function multipleSelectAdapter(question, result, container) {
    const wanted = new Set(result.selected.map(String));
    for (const [i, input] of root.THAA.queryAll(container, root.THAA.SELECTORS.checkboxOptions).entries()) {
      const id = String(input.dataset?.optionId || input.value || i);
      if (Boolean(input.checked) !== wanted.has(id)) input.click();
    }
    return { success: root.THAA.verifyInteraction(question, result, container), interactionType: "DIRECT_CONTROL", reason: "Checkbox state was not verified" };
  }
  root.THAA = root.THAA || {};
  root.THAA.multipleSelectAdapter = multipleSelectAdapter;
})(globalThis);
