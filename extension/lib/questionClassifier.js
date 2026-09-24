(function (root) {
  "use strict";
  const TYPE_ALIASES = Object.freeze({
    "single-choice": "SINGLE_CHOICE", "multiple-choice": "SINGLE_CHOICE", radio: "SINGLE_CHOICE",
    "multiple-select": "MULTIPLE_SELECT", checkbox: "MULTIPLE_SELECT",
    word: "WORD_ANSWER", "word-answer": "WORD_ANSWER", text: "WORD_ANSWER",
    long: "LONG_ANSWER", "long-answer": "LONG_ANSWER", essay: "LONG_ANSWER",
    numeric: "NUMERIC", number: "NUMERIC", formula: "FORMULA",
    sorting: "SORTING", ordering: "SORTING", matching: "MATCHING",
    "click-target": "UNSUPPORTED", geogebra: "UNSUPPORTED", graph: "UNSUPPORTED", canvas: "UNSUPPORTED"
  });
  function has(scope, selectors) { return Boolean(root.THAA.queryFirst(scope, selectors)); }
  function classifyQuestion(container) {
    if (!container) return "UNKNOWN";
    const declared = String(container.dataset?.questionType || container.getAttribute?.("data-type") || "").toLowerCase();
    if (TYPE_ALIASES[declared]) return TYPE_ALIASES[declared];
    const S = root.THAA.SELECTORS;
    if (has(container, S.graphicalIndicators)) return "UNSUPPORTED";
    if (has(container, S.matchingContainers) || (has(container, S.matchingLeftItems) && has(container, S.matchingRightItems))) return "MATCHING";
    if (has(container, S.sortingContainers)) return "SORTING";
    if (has(container, S.checkboxOptions)) return "MULTIPLE_SELECT";
    if (has(container, S.radioOptions)) return "SINGLE_CHOICE";
    if (has(container, S.formulaInputs)) return "FORMULA";
    if (has(container, S.numericInputs)) return "NUMERIC";
    const textarea = container.querySelector?.("textarea");
    if (textarea) return (textarea.rows || 0) >= 3 || textarea.dataset.answerType === "long" ? "LONG_ANSWER" : "WORD_ANSWER";
    if (has(container, S.textInputs)) return "WORD_ANSWER";
    return "UNKNOWN";
  }
  root.THAA = root.THAA || {};
  Object.assign(root.THAA, { TYPE_ALIASES, classifyQuestion });
})(globalThis);
