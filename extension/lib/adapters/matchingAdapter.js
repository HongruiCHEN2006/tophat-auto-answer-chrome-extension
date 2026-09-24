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
    } else if (options.allowTestFallback) {
      for (const [left, right] of result.pairs) {
        const node = root.THAA.queryAll(scope, root.THAA.SELECTORS.matchingLeftItems).find((x, i) => root.THAA.itemId(x, i, "L") === left);
        if (node) node.dataset.matchedRight = right;
      }
      scope.dispatchEvent(new CustomEvent("thaa:matched", { bubbles: true, detail: { pairs: result.pairs } }));
    }
    const success = root.THAA.verifyInteraction(question, result, container);
    return { success, interactionType, fallbackUsed: !selects.length && success, reason: success ? undefined : "Unable to verify one-to-one matching state", verificationFailed: true };
  }
  root.THAA = root.THAA || {};
  root.THAA.matchingAdapter = matchingAdapter;
})(globalThis);
