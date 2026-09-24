(function (root) {
  "use strict";
  async function matchingAdapter(question, result, container, options = {}) {
    const scope = root.THAA.queryFirst(container, root.THAA.SELECTORS.matchingContainers) || container;
    const interactionType = root.THAA.detectDragInteractionType(scope);
    const selects = root.THAA.queryAll(scope, root.THAA.SELECTORS.matchingSelects);
    if (selects.length) {
      for (const [left, right] of result.pairs) {
        const select = selects.find((x) => String(x.dataset.matchFor) === left);
        if (select) { select.value = right; select.dispatchEvent(new Event("change", { bubbles: true })); }
      }
    } else if (["NATIVE_HTML5_DRAG", "POINTER_EVENT_DRAG", "MOUSE_EVENT_DRAG", "FRAMEWORK_MANAGED_DRAG"].includes(interactionType)) {
      const leftNodes = root.THAA.queryAll(scope, root.THAA.SELECTORS.matchingLeftItems);
      const rightNodes = root.THAA.queryAll(scope, root.THAA.SELECTORS.matchingRightItems);
      for (const [left, right] of result.pairs) {
        const source = leftNodes.find((node, i) => root.THAA.itemId(node, i, "L") === left);
        const target = rightNodes.find((node, i) => root.THAA.itemId(node, i, "R") === right);
        await root.THAA.performDrag(source, target, interactionType);
      }
    }
    if (!root.THAA.verifyInteraction(question, result, container) && options.allowTestFallback) {
      for (const [left, right] of result.pairs) {
        const node = root.THAA.queryAll(scope, root.THAA.SELECTORS.matchingLeftItems).find((x, i) => root.THAA.itemId(x, i, "L") === left);
        if (node) node.dataset.matchedRight = right;
      }
      scope.dispatchEvent(new CustomEvent("thaa:matched", { bubbles: true, detail: { pairs: result.pairs } }));
    }
    const success = root.THAA.verifyInteraction(question, result, container);
    return { success, interactionType, fallbackUsed: !selects.length && options.allowTestFallback && success, reason: success ? undefined : "Unable to verify one-to-one matching state", verificationFailed: true };
  }
  root.THAA = root.THAA || {};
  root.THAA.matchingAdapter = matchingAdapter;
})(globalThis);
