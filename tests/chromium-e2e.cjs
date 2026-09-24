const assert = require("node:assert/strict");
const port = process.argv[2] || "9335";
const suppliedExtensionId = process.argv[3] || null;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  return {
    socket,
    send(method, params = {}) {
      return new Promise((resolve) => {
        id += 1; pending.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
  };
}
async function evaluate(cdp, expression) {
  const response = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.result?.exceptionDetails) throw new Error(`${response.result.exceptionDetails.text}: ${response.result.exceptionDetails.exception?.description || ""}\nExpression:\n${expression}`);
  return response.result?.result?.value;
}

(async () => {
  let targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  let extensionId = suppliedExtensionId;
  for (const worker of targets.filter((target) => target.type === "service_worker" && target.url.endsWith("/background.js"))) {
    const cdp = await connect(worker.webSocketDebuggerUrl);
    const name = await evaluate(cdp, "chrome.runtime.getManifest().name");
    cdp.socket.close();
    if (name === "Top Hat Answer Assistant") extensionId = new URL(worker.url).hostname;
  }
  assert.ok(extensionId, "Top Hat Answer Assistant service worker must load");
  const pageTarget = targets.find((target) => target.type === "page" && target.url === "about:blank") || targets.find((target) => target.type === "page");
  const page = await connect(pageTarget.webSocketDebuggerUrl);
  const mockUrl = `chrome-extension://${extensionId}/mock/index.html`;
  await page.send("Page.navigate", { url: mockUrl });
  await delay(1200);
  assert.equal(await evaluate(page, "document.title"), "Authorized Question Automation Lab");
  const setup = await evaluate(page, `(async () => {
    const save = await chrome.runtime.sendMessage({type:"SAVE_SETTINGS",settings:{targetUrl:location.href,answerMode:"random",mockFallbackEnabled:true}});
    const start = await chrome.runtime.sendMessage({type:"START_SESSION"});
    return {save,start};
  })()`);
  assert.equal(setup.save.ok, true, setup.save.error);
  assert.equal(setup.start.ok, true, setup.start.error);
  await delay(1800);
  let snapshot = await evaluate(page, `(async () => ({
    state:(await chrome.runtime.sendMessage({type:"GET_STATE"})).state,
    history:document.querySelectorAll("#history li").length,
    banner:document.querySelector(".result-banner")?.textContent,
    monitor:{present:Boolean(globalThis.__THAA_MONITOR__),running:globalThis.__THAA_MONITOR__?.running,sessionId:globalThis.__THAA_MONITOR__?.sessionId},
    question:Boolean(document.querySelector("[data-thaa-question]"))
  }))()`);
  if (snapshot.state.statistics.totalUniqueQuestions !== 1) console.error("Initial runtime snapshot", JSON.stringify(snapshot, null, 2));
  assert.equal(snapshot.state.session.running, true);
  assert.equal(snapshot.state.statistics.totalUniqueQuestions, 1);
  assert.equal(snapshot.state.statistics.answer.success, 1);
  assert.equal(snapshot.state.statistics.interaction.success, 1);
  assert.match(snapshot.banner, /Accepted by mock/);

  await evaluate(page, `(() => { const s=document.querySelector("#scenario"); s.value="SORTING"; document.querySelector("#sortVariant").value="pointer"; s.dispatchEvent(new Event("change")); })()`);
  await delay(1600);
  snapshot = await evaluate(page, `(async () => (await chrome.runtime.sendMessage({type:"GET_STATE"})).state)()`);
  assert.ok(snapshot.statistics.totalUniqueQuestions >= 2);
  assert.ok(Object.values(snapshot.processedQuestions).some((q) => q.type === "SORTING" && q.interaction.status === "INTERACTION_SUCCESS" && q.interaction.fallbackUsed));

  await evaluate(page, `(() => { document.querySelector("#dragFailure").click(); const s=document.querySelector("#scenario"); s.value="MATCHING"; document.querySelector("#matchVariant").value="drag"; s.dispatchEvent(new Event("change")); })()`);
  await delay(1600);
  snapshot = await evaluate(page, `(async () => (await chrome.runtime.sendMessage({type:"GET_STATE"})).state)()`);
  assert.ok(Object.values(snapshot.processedQuestions).some((q) => q.type === "MATCHING" && q.interaction.status === "INTERACTION_SUCCESS" && q.interaction.fallbackUsed));

  await evaluate(page, "document.querySelector('#toggleLogin').click()");
  await delay(700);
  snapshot = await evaluate(page, `(async () => (await chrome.runtime.sendMessage({type:"GET_STATE"})).state)()`);
  assert.equal(snapshot.authState, "LOGIN_REQUIRED");
  await evaluate(page, "document.querySelector('#toggleLogin').click()");
  await delay(700);
  snapshot = await evaluate(page, `(async () => (await chrome.runtime.sendMessage({type:"GET_STATE"})).state)()`);
  assert.equal(snapshot.authState, "AUTHENTICATED");
  assert.ok(snapshot.statistics.loginInterruptions >= 1);

  for (const type of ["MULTIPLE_SELECT", "WORD_ANSWER", "LONG_ANSWER", "NUMERIC", "FORMULA", "UNSUPPORTED", "UNKNOWN"]) {
    await evaluate(page, `(() => { const s=document.querySelector("#scenario"); s.value=${JSON.stringify(type)}; s.dispatchEvent(new Event("change")); })()`);
    await delay(800);
  }
  snapshot = await evaluate(page, `(async () => (await chrome.runtime.sendMessage({type:"GET_STATE"})).state)()`);
  for (const type of ["SINGLE_CHOICE", "MULTIPLE_SELECT", "WORD_ANSWER", "LONG_ANSWER", "NUMERIC", "FORMULA", "SORTING", "MATCHING"]) {
    assert.ok(Object.values(snapshot.processedQuestions).some((q) => q.type === type && q.answerStatus === "SUCCESS"), `${type} should complete answer generation`);
  }
  assert.ok(Object.values(snapshot.processedQuestions).some((q) => q.type === "UNSUPPORTED" && q.answerStatus === "UNSUPPORTED_TYPE"));
  assert.ok(Object.values(snapshot.processedQuestions).some((q) => q.type === "UNKNOWN" && q.answerStatus === "UNSUPPORTED_TYPE"));
  assert.equal(snapshot.statistics.totalUniqueQuestions, 10);
  assert.equal(snapshot.statistics.answer.success, 8);
  assert.equal(snapshot.statistics.interaction.success, 8);
  assert.equal(snapshot.statistics.answer.unsupported, 2);
  assert.equal(snapshot.statistics.apiUsage.requests, 0);

  const stopped = await evaluate(page, `(async () => { await chrome.runtime.sendMessage({type:"STOP_SESSION"}); return (await chrome.runtime.sendMessage({type:"GET_STATE"})).state; })()`);
  assert.equal(stopped.session.running, false);
  assert.match(stopped.finalReport.text, /SESSION REPORT/);
  assert.match(stopped.finalReport.text, /Requests: 0/);
  console.log(JSON.stringify({ extensionId, questions: stopped.statistics.totalUniqueQuestions, answerSuccess: stopped.statistics.answer.success, interactionSuccess: stopped.statistics.interaction.success, loginInterruptions: stopped.statistics.loginInterruptions, apiRequests: stopped.statistics.apiUsage.requests }, null, 2));
  page.socket.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
