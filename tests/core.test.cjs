const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const extension = path.join(__dirname, "..", "extension");
const context = vm.createContext({ console, setTimeout, clearTimeout, crypto: require("node:crypto").webcrypto, Math, Date, JSON, Object, Array, Set, Map, String, Number, Boolean, RegExp, Error });
context.globalThis = context;
for (const file of ["lib/state.js", "lib/logger.js", "lib/fingerprint.js", "lib/randomProvider.js", "lib/openaiProvider.js", "lib/answerEngine.js", "lib/sessionManager.js"]) {
  vm.runInContext(fs.readFileSync(path.join(extension, file), "utf8"), context, { filename: file });
}
const T = context.THAA;
const single = { type:"SINGLE_CHOICE", prompt:"Which organelle produces ATP?", options:[{id:"A",text:"Nucleus"},{id:"B",text:"Mitochondrion"}] };

test("fingerprints are deterministic, normalized, and timer-independent", () => {
  const a = T.fingerprintQuestion(single);
  const b = T.fingerprintQuestion({ ...single, prompt:"  WHICH   organelle produces ATP?  ", timer:{ remainingSeconds:1 } });
  assert.equal(a, b);
  assert.notEqual(a, T.fingerprintQuestion({ ...single, options:[...single.options,{id:"C",text:"Golgi"}] }));
  const sorting = { type:"SORTING", prompt:"Order", items:[{id:"A",text:"Earth"},{id:"B",text:"Atom"}] };
  assert.equal(T.fingerprintQuestion(sorting), T.fingerprintQuestion({ ...sorting, items:[...sorting.items].reverse() }));
});

test("random provider returns locally valid results for every supported type", () => {
  const questions = [
    single,
    { ...single, type:"MULTIPLE_SELECT" },
    { type:"WORD_ANSWER", prompt:"Define x", options:[] },
    { type:"LONG_ANSWER", prompt:"Explain x", options:[] },
    { type:"NUMERIC", prompt:"2+2" },
    { type:"FORMULA", prompt:"Kinetic energy", variables:["m","v"] },
    { type:"SORTING", prompt:"Order", items:[{id:"A",text:"a"},{id:"B",text:"b"}] },
    { type:"MATCHING", prompt:"Match", left:[{id:"L0",text:"l0"},{id:"L1",text:"l1"}], right:[{id:"R0",text:"r0"},{id:"R1",text:"r1"}] }
  ];
  for (const question of questions) {
    const result = T.randomAnswer(question);
    assert.equal(T.validateAnswer(question, result).valid, true, question.type);
  }
});

test("validators reject duplicate, missing, and unknown IDs locally", () => {
  const sorting = { type:"SORTING", items:[{id:"A"},{id:"B"},{id:"C"}] };
  assert.equal(T.validateAnswer(sorting, { order:["A","A","C"] }).valid, false);
  assert.equal(T.validateAnswer(sorting, { order:["A","B"] }).valid, false);
  assert.equal(T.validateAnswer(single, { selected:["Z"] }).valid, false);
  const matching = { type:"MATCHING", left:[{id:"L0"},{id:"L1"}], right:[{id:"R0"},{id:"R1"}] };
  assert.equal(T.validateAnswer(matching, { pairs:[["L0","R0"],["L1","R0"]] }).valid, false);
});

test("structured schemas use IDs and concise type-specific output ceilings", () => {
  const schema = T.answerSchema(single);
  assert.deepEqual(Array.from(schema.properties.selected.items.enum), ["A","B"]);
  assert.equal(schema.properties.selected.minItems, 1);
  assert.equal(schema.properties.selected.maxItems, 1);
  assert.ok(T.outputTokenLimit(single) < T.outputTokenLimit({ type:"LONG_ANSWER" }));
  assert.match(T.STABLE_INSTRUCTION, /Return only the structured answer/);
});

test("API usage parser uses actual returned usage including cached tokens", () => {
  assert.deepEqual({ ...T.usageFrom({ usage:{ input_tokens:100, output_tokens:8, input_tokens_details:{ cached_tokens:40 } } }) }, { inputTokens:100, outputTokens:8, cachedInputTokens:40 });
  assert.equal(T.usageFrom({}), null);
});

test("session report retains per-type failures and API usage", () => {
  const state = T.defaultState();
  T.startSessionState(state);
  state.statistics.apiUsage = { requests:2, retries:1, failures:0, inputTokens:120, outputTokens:10, cachedInputTokens:40, available:true };
  state.statistics.totalUniqueQuestions = 1;
  state.statistics.byType.SORTING.detected = 1;
  state.processedQuestions.x = { sequence:1, type:"SORTING", answerStatus:"SUCCESS", result:{order:["A"]}, interaction:{status:"INTERACTION_VERIFICATION_FAILED",type:"POINTER_EVENT_DRAG",reason:"No state update"} };
  T.stopSessionState(state);
  assert.match(state.finalReport.text, /API USAGE/);
  assert.match(state.finalReport.text, /Cached Input Tokens: 40/);
  assert.match(state.finalReport.text, /INTERACTION_VERIFICATION_FAILED/);
});

test("OpenAI provider source never reads or sends webpage HTML/body text", () => {
  const source = fs.readFileSync(path.join(extension, "lib/openaiProvider.js"), "utf8");
  for (const forbidden of ["document.documentElement.outerHTML", "document.body.innerHTML", "document.body.innerText"]) assert.equal(source.includes(forbidden), false);
  assert.match(source, /JSON\.stringify\(question\)/);
});

test("answer engine retries a transient OpenAI failure once and no more", async () => {
  const original = T.openAIAnswer;
  let calls = 0, retries = 0;
  T.openAIAnswer = async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error("rate limited"), { category:"API_FAILED", retryable:true });
    return { result:{ selected:["B"] }, usage:null };
  };
  try {
    const outcome = await T.generateAnswer(single, "openai", "test-key", { onRetry:() => { retries += 1; } });
    assert.deepEqual(Array.from(outcome.result.selected), ["B"]);
    assert.equal(calls, 2);
    assert.equal(retries, 1);
  } finally { T.openAIAnswer = original; }
});

test("answer engine does not retry non-transient auth failures or call OpenAI in Random mode", async () => {
  const original = T.openAIAnswer;
  let calls = 0;
  T.openAIAnswer = async () => { calls += 1; throw Object.assign(new Error("unauthorized"), { category:"API_FAILED", retryable:false }); };
  try {
    await assert.rejects(() => T.generateAnswer(single, "openai", "bad-key"));
    assert.equal(calls, 1);
    await T.generateAnswer(single, "random", "");
    assert.equal(calls, 1);
  } finally { T.openAIAnswer = original; }
});
