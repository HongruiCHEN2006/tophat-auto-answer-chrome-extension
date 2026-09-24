(function (root) {
  "use strict";
  function cleanExtractedText(value) {
    return String(value || "")
      .replace(/\b(?:submit|not answered|unanswered)\b\s*$/i, "")
      .replace(/\b\d{1,2}:\d{2}\s*$/i, "")
      .replace(/\s+/g, " ").trim();
  }
  const text = (node) => cleanExtractedText(node?.innerText || node?.textContent || node?.value || "");
  function promptFor(container) {
    return text(root.THAA.queryFirst(container, root.THAA.SELECTORS.promptCandidates)) ||
      text(container.getAttribute?.("aria-label")) || "Question prompt unavailable";
  }
  function labelFor(input, container) {
    if (input.labels?.length) return text(input.labels[0]);
    const id = input.id;
    if (id) {
      try { const label = container.querySelector(`label[for="${CSS.escape(id)}"]`); if (label) return text(label); } catch (_) {}
    }
    return text(input.closest?.("label")) || text(input.parentElement) || String(input.value || "");
  }
  function optionsFor(container, selector) {
    return root.THAA.queryAll(container, selector).map((input, index) => ({
      id: String(input.dataset?.optionId || input.value || index),
      text: labelFor(input, container) || `Option ${index + 1}`
    }));
  }
  function itemId(node, index, side) {
    return String(node.dataset?.sortId || node.dataset?.matchLeftId || node.dataset?.matchRightId ||
      node.dataset?.leftId || node.dataset?.rightId || node.dataset?.itemId || node.id || `${side || "I"}${index}`);
  }
  function itemsFor(scope, selectors, side) {
    return root.THAA.queryAll(scope, selectors).map((node, index) => ({ id: itemId(node, index, side), text: text(node) }));
  }
  function parseQuestion(container, forcedType) {
    if (!container) throw new Error("PARSING_FAILED: no question container");
    const type = forcedType || root.THAA.classifyQuestion(container);
    const question = { type, prompt: promptFor(container) };
    if (type === "SINGLE_CHOICE") question.options = optionsFor(container, root.THAA.SELECTORS.radioOptions);
    else if (type === "MULTIPLE_SELECT") question.options = optionsFor(container, root.THAA.SELECTORS.checkboxOptions);
    else if (type === "WORD_ANSWER" || type === "LONG_ANSWER") {
      question.options = [];
      const input = root.THAA.queryFirst(container, root.THAA.SELECTORS.textInputs);
      const wordLimit = Number(container.dataset?.wordLimit || input?.dataset?.wordLimit || 0);
      const characterLimit = Number(input?.maxLength > 0 ? input.maxLength : container.dataset?.characterLimit || 0);
      if (wordLimit > 0) question.wordLimit = wordLimit;
      if (characterLimit > 0) question.characterLimit = characterLimit;
    }
    else if (type === "FORMULA") {
      const raw = container.dataset?.variables || root.THAA.queryFirst(container, root.THAA.SELECTORS.formulaInputs)?.dataset?.variables || "";
      question.variables = raw.split(",").map((x) => x.trim()).filter(Boolean);
    } else if (type === "SORTING") {
      const scope = root.THAA.queryFirst(container, root.THAA.SELECTORS.sortingContainers) || container;
      question.items = itemsFor(scope, root.THAA.SELECTORS.sortingItems, "I");
    } else if (type === "MATCHING") {
      const scope = root.THAA.queryFirst(container, root.THAA.SELECTORS.matchingContainers) || container;
      question.left = itemsFor(scope, root.THAA.SELECTORS.matchingLeftItems, "L");
      question.right = itemsFor(scope, root.THAA.SELECTORS.matchingRightItems, "R");
      if (!question.right.length) {
        const select = root.THAA.queryFirst(scope, root.THAA.SELECTORS.matchingSelects);
        if (select) question.right = Array.from(select.options).filter((o) => o.value).map((o, i) => ({ id: String(o.value || `R${i}`), text: text(o) }));
      }
    }
    const required = {
      SINGLE_CHOICE: question.options?.length, MULTIPLE_SELECT: question.options?.length,
      SORTING: question.items?.length, MATCHING: question.left?.length && question.right?.length
    };
    if (Object.hasOwn(required, type) && !required[type]) throw new Error(`PARSING_FAILED: missing ${type} answer content`);
    return question;
  }
  root.THAA = root.THAA || {};
  Object.assign(root.THAA, { parseQuestion, promptFor, labelFor, itemId, cleanExtractedText });
})(globalThis);
