(function (root) {
  "use strict";
  function selectedIds(container, selector) {
    return root.THAA.queryAll(container, selector).filter((x) => x.checked || x.getAttribute("aria-checked") === "true").map((x, i) => String(x.dataset?.optionId || x.value || i));
  }
  function verifyInteraction(question, result, container) {
    if (question.type === "SINGLE_CHOICE") return selectedIds(container, root.THAA.SELECTORS.radioOptions).includes(result.selected[0]);
    if (question.type === "MULTIPLE_SELECT") {
      const actual = selectedIds(container, root.THAA.SELECTORS.checkboxOptions);
      return result.selected.length === actual.length && result.selected.every((x) => actual.includes(x));
    }
    if (["WORD_ANSWER", "LONG_ANSWER", "NUMERIC", "FORMULA"].includes(question.type)) {
      const selectors = question.type === "NUMERIC" ? root.THAA.SELECTORS.numericInputs : question.type === "FORMULA" ? root.THAA.SELECTORS.formulaInputs : root.THAA.SELECTORS.textInputs;
      const input = root.THAA.queryFirst(container, selectors);
      const expected = question.type === "NUMERIC" ? String(result.value) : question.type === "FORMULA" ? result.expression : result.text;
      return Boolean(input) && String(input.value) === String(expected);
    }
    if (question.type === "SORTING") {
      const scope = root.THAA.queryFirst(container, root.THAA.SELECTORS.sortingContainers) || container;
      const actual = root.THAA.queryAll(scope, root.THAA.SELECTORS.sortingItems).map((node, i) => root.THAA.itemId(node, i, "I"));
      return actual.join("|") === result.order.join("|") && (scope.dataset.thaaVerifiedOrder || result.order.join("|")) === result.order.join("|");
    }
    if (question.type === "MATCHING") {
      const scope = root.THAA.queryFirst(container, root.THAA.SELECTORS.matchingContainers) || container;
      const selects = root.THAA.queryAll(scope, root.THAA.SELECTORS.matchingSelects);
      if (selects.length) return result.pairs.every(([left, right]) => selects.some((s) => String(s.dataset.matchFor) === left && String(s.value) === right));
      return result.pairs.every(([left, right]) => {
        const node = root.THAA.queryAll(scope, root.THAA.SELECTORS.matchingLeftItems).find((x, i) => root.THAA.itemId(x, i, "L") === left);
        return node?.dataset?.matchedRight === right;
      });
    }
    return false;
  }
  root.THAA = root.THAA || {};
  Object.assign(root.THAA, { verifyInteraction });
})(globalThis);
