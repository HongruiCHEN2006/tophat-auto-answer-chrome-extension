(function (root) {
  "use strict";
  const API_URL = "https://api.openai.com/v1/responses";
  const MODEL = "gpt-4o-mini";
  const STABLE_INSTRUCTION = "Solve the supplied question. Return only the structured answer required by the schema. Do not include explanations. For long answers, give the shortest complete answer that directly satisfies the question.";
  const base = (properties, required) => ({ type: "object", properties, required, additionalProperties: false });
  const stringArray = (allowed, minItems = 0, maxItems = allowed.length) => ({ type: "array", items: { type: "string", enum: allowed }, minItems, maxItems });
  function answerSchema(question) {
    const optionIds = (question.options || []).map((x) => x.id);
    if (question.type === "SINGLE_CHOICE") return base({ selected: stringArray(optionIds, 1, 1) }, ["selected"]);
    if (question.type === "MULTIPLE_SELECT") return base({ selected: stringArray(optionIds, 1, optionIds.length) }, ["selected"]);
    if (question.type === "WORD_ANSWER" || question.type === "LONG_ANSWER") return base({ text: { type: "string" } }, ["text"]);
    if (question.type === "NUMERIC") return base({ value: { type: "number" } }, ["value"]);
    if (question.type === "FORMULA") return base({ expression: { type: "string" } }, ["expression"]);
    if (question.type === "SORTING") {
      const ids = (question.items || []).map((x) => x.id);
      return base({ order: stringArray(ids, ids.length, ids.length) }, ["order"]);
    }
    if (question.type === "MATCHING") {
      const pairCount = (question.left || []).length;
      return base({ pairs: { type: "array", minItems: pairCount, maxItems: pairCount, items: { type: "array", minItems: 2, maxItems: 2, prefixItems: [
        { type: "string", enum: (question.left || []).map((x) => x.id) },
        { type: "string", enum: (question.right || []).map((x) => x.id) }
      ], items: false } } }, ["pairs"]);
    }
    throw Object.assign(new Error(`No OpenAI schema for ${question.type}`), { category: "UNSUPPORTED_TYPE" });
  }
  function outputText(payload) {
    if (typeof payload.output_text === "string") return payload.output_text;
    for (const item of payload.output || []) {
      for (const part of item.content || []) {
        if (part.type === "refusal") throw Object.assign(new Error("Model refused the request"), { category: "API_FAILED", retryable: false });
        if (part.type === "output_text" && typeof part.text === "string") return part.text;
      }
    }
    throw Object.assign(new Error("OpenAI response did not contain output text"), { category: "INVALID_API_RESPONSE", retryable: true });
  }
  function apiErrorCategory(status) {
    if (status === 408) return "API_TIMEOUT";
    return "API_FAILED";
  }
  function outputTokenLimit(question) {
    const counts = { SINGLE_CHOICE: 24, MULTIPLE_SELECT: 48, WORD_ANSWER: 96, NUMERIC: 24, FORMULA: 48 };
    if (counts[question.type]) return counts[question.type];
    if (question.type === "SORTING") return Math.min(256, 32 + (question.items?.length || 0) * 12);
    if (question.type === "MATCHING") return Math.min(384, 40 + (question.left?.length || 0) * 22);
    if (question.type === "LONG_ANSWER") {
      const bounded = question.wordLimit ? Math.ceil(question.wordLimit * 1.8) : question.characterLimit ? Math.ceil(question.characterLimit / 3) : 256;
      return Math.max(64, Math.min(512, bounded));
    }
    return 128;
  }
  function usageFrom(payload) {
    const usage = payload?.usage;
    if (!usage) return null;
    return {
      inputTokens: Number(usage.input_tokens || 0),
      outputTokens: Number(usage.output_tokens || 0),
      cachedInputTokens: Number(usage.input_tokens_details?.cached_tokens || usage.input_tokens_details?.cached_input_tokens || 0)
    };
  }
  async function openAIAnswer(question, apiKey, timeoutMs = 25000) {
    if (!apiKey) throw Object.assign(new Error("OpenAI API key is required"), { category: "API_FAILED" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL,
          input: [
            { role: "system", content: STABLE_INSTRUCTION },
            { role: "user", content: JSON.stringify(question) }
          ],
          text: { format: { type: "json_schema", name: "question_answer", strict: true, schema: answerSchema(question) } },
          max_output_tokens: outputTokenLimit(question)
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const error = new Error(`OpenAI request failed with HTTP ${response.status}`);
        error.category = apiErrorCategory(response.status);
        error.status = response.status;
        error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw error;
      }
      const payload = await response.json();
      if (payload.status && payload.status !== "completed") throw Object.assign(new Error(`OpenAI response status: ${payload.status}`), { category: "API_FAILED", retryable: true });
      const usage = usageFrom(payload);
      try { return { result: JSON.parse(outputText(payload)), usage }; }
      catch (error) {
        if (error.category) { error.usage = usage; throw error; }
        throw Object.assign(new Error("OpenAI returned invalid JSON"), { category: "INVALID_API_RESPONSE", retryable: true, usage });
      }
    } catch (error) {
      if (error.name === "AbortError") throw Object.assign(new Error("OpenAI request timed out"), { category: "API_TIMEOUT", retryable: true });
      if (!error.category) { error.category = "API_FAILED"; error.retryable = true; }
      throw error;
    } finally { clearTimeout(timeout); }
  }
  root.THAA = root.THAA || {};
  Object.assign(root.THAA, { API_URL, OPENAI_MODEL: MODEL, STABLE_INSTRUCTION, answerSchema, openAIAnswer, outputText, outputTokenLimit, usageFrom });
})(globalThis);
