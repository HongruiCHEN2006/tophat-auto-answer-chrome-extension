(function (root) {
  "use strict";
  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function stableContent(question) {
    const list = (items) => (items || []).map((x) => `${x.id}:${normalizeText(x.text)}`).sort().join("|");
    return [
      question.type || "UNKNOWN",
      normalizeText(question.prompt),
      list(question.options),
      list(question.items),
      list(question.left),
      list(question.right),
      (question.variables || []).map(normalizeText).join("|")
    ].join("||");
  }
  function fnv1a(input) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  function fingerprintQuestion(question) {
    return fnv1a(stableContent(question));
  }
  root.THAA = root.THAA || {};
  Object.assign(root.THAA, { normalizeText, stableContent, fingerprintQuestion });
})(globalThis);
