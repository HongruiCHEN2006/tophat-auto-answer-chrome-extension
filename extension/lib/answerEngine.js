(function (root) {
  "use strict";
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  function validateAnswer(question, result) {
    if (!result || typeof result !== "object" || Array.isArray(result)) return { valid: false, reason: "Result is not an object" };
    const optionIds = (question.options || []).map((x) => x.id);
    if (question.type === "SINGLE_CHOICE") {
      return { valid: Array.isArray(result.selected) && result.selected.length === 1 && optionIds.includes(result.selected[0]), reason: "Expected exactly one valid option ID" };
    }
    if (question.type === "MULTIPLE_SELECT") {
      const values = result.selected;
      return { valid: Array.isArray(values) && values.length > 0 && new Set(values).size === values.length && values.every((x) => optionIds.includes(x)), reason: "Expected a non-empty unique subset of option IDs" };
    }
    if (question.type === "WORD_ANSWER" || question.type === "LONG_ANSWER") return { valid: typeof result.text === "string" && result.text.trim().length > 0, reason: "Expected non-empty text" };
    if (question.type === "NUMERIC") return { valid: typeof result.value === "number" && Number.isFinite(result.value), reason: "Expected a finite number" };
    if (question.type === "FORMULA") return { valid: typeof result.expression === "string" && result.expression.trim().length > 0, reason: "Expected a non-empty expression" };
    if (question.type === "SORTING") {
      const expected = (question.items || []).map((x) => x.id);
      return { valid: Array.isArray(result.order) && new Set(result.order).size === result.order.length && sameSet(result.order, expected), reason: "Sorting order must contain every item exactly once" };
    }
    if (question.type === "MATCHING") {
      const left = (question.left || []).map((x) => x.id), right = (question.right || []).map((x) => x.id);
      const pairs = result.pairs;
      const valid = Array.isArray(pairs) && pairs.length === left.length && pairs.every((p) => Array.isArray(p) && p.length === 2 && left.includes(p[0]) && right.includes(p[1])) &&
        new Set(pairs.map((p) => p[0])).size === left.length && new Set(pairs.map((p) => p[1])).size === left.length;
      return { valid, reason: "Matching pairs must form a one-to-one mapping" };
    }
    return { valid: false, reason: `Unsupported answer type ${question.type}` };
  }
  async function generateAnswer(question, mode, apiKey, hooks = {}) {
    if (mode === "random") {
      const result = root.THAA.randomAnswer(question);
      const check = validateAnswer(question, result);
      if (!check.valid) throw Object.assign(new Error(check.reason), { category: "ANSWER_FAILED" });
      return { result, retries: 0, engine: "RANDOM", usage: null };
    }
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        hooks.onRequest?.(attempt);
        const response = await root.THAA.openAIAnswer(question, apiKey);
        hooks.onUsage?.(response.usage);
        const result = response.result;
        const check = validateAnswer(question, result);
        if (!check.valid) throw Object.assign(new Error(check.reason), { category: "INVALID_API_RESPONSE", retryable: true });
        return { result, retries: attempt, engine: "OPENAI", usage: response.usage };
      } catch (error) {
        lastError = error;
        if (error.usage) hooks.onUsage?.(error.usage);
        hooks.onFailure?.(error, attempt);
        if (attempt === 0 && error.retryable !== false) hooks.onRetry?.(error);
        else break;
      }
    }
    throw lastError || Object.assign(new Error("Answer generation failed"), { category: "ANSWER_FAILED" });
  }
  root.THAA = root.THAA || {};
  Object.assign(root.THAA, { validateAnswer, generateAnswer });
})(globalThis);
