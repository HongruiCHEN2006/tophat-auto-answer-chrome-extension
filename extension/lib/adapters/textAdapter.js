(function (root) {
  "use strict";
  function setNativeValue(input, value) {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(input, String(value)); else input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async function textAdapter(question, result, container) {
    const input = root.THAA.queryFirst(container, root.THAA.SELECTORS.textInputs);
    if (!input) return { success: false, interactionType: "DIRECT_CONTROL", reason: "Text input not found" };
    setNativeValue(input, result.text);
    return { success: root.THAA.verifyInteraction(question, result, container), interactionType: "DIRECT_CONTROL", reason: "Text value was not verified" };
  }
  root.THAA = root.THAA || {};
  Object.assign(root.THAA, { setNativeValue, textAdapter });
})(globalThis);
