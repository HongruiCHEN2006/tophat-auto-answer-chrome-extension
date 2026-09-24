(function (root) {
  "use strict";
  function findOption(container, selectors, id) {
    return root.THAA.queryAll(container, selectors).find((node, i) => String(node.dataset?.optionId || node.value || i) === String(id));
  }
  async function singleChoiceAdapter(question, result, container) {
    const input = findOption(container, root.THAA.SELECTORS.radioOptions, result.selected[0]);
    if (!input) return { success: false, interactionType: "DIRECT_CONTROL", reason: "Option element not found" };
    input.click();
    return { success: root.THAA.verifyInteraction(question, result, container), interactionType: "DIRECT_CONTROL", reason: "Selected state was not verified" };
  }
  root.THAA = root.THAA || {};
  Object.assign(root.THAA, { findOption, singleChoiceAdapter });
})(globalThis);
