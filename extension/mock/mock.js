(function () {
  "use strict";
  const scenarios = ["SINGLE_CHOICE", "MULTIPLE_SELECT", "WORD_ANSWER", "LONG_ANSWER", "NUMERIC", "FORMULA", "SORTING", "MATCHING", "UNSUPPORTED", "UNKNOWN"];
  const prompts = {
    SINGLE_CHOICE: "Which organelle produces most cellular ATP?",
    MULTIPLE_SELECT: "Select all prime numbers.", WORD_ANSWER: "Define polymorphism in one sentence.",
    LONG_ANSWER: "Briefly explain how natural selection changes a population over generations.",
    NUMERIC: "What is 6 × 7?", FORMULA: "Write the expression for kinetic energy using m and v.",
    SORTING: "Arrange these structures from smallest to largest.", MATCHING: "Match each organelle with its function.",
    UNSUPPORTED: "Click the exact point shown on the graph.", UNKNOWN: "A deliberately unrecognized custom interaction."
  };
  let scenarioIndex = 0, remaining = 45, loginRequired = false, forceDragFailure = false, sequence = 1, submissions = [];
  const mount = document.getElementById("questionMount"), scenario = document.getElementById("scenario");
  for (const type of scenarios) scenario.add(new Option(type.replaceAll("_", " "), type));
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "text") node.textContent = value;
      else if (key === "class") node.className = value;
      else if (key.startsWith("data-")) node.setAttribute(key, value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    for (const child of children) node.append(child);
    return node;
  }
  function option(type, id, label) {
    const input = el("input", { type, name: type === "radio" ? "single" : `multi-${id}`, value: id, "data-option-id": id });
    return el("label", { class:"option" }, [input, document.createTextNode(label)]);
  }
  function collect(container, type) {
    if (type === "SINGLE_CHOICE" || type === "MULTIPLE_SELECT") return { selected: [...container.querySelectorAll("input:checked")].map((x) => x.value) };
    if (type === "WORD_ANSWER" || type === "LONG_ANSWER") return { text: container.querySelector("textarea,input[type=text]")?.value || "" };
    if (type === "NUMERIC") return { value: Number(container.querySelector("input")?.value) };
    if (type === "FORMULA") return { expression: container.querySelector("input")?.value || "" };
    if (type === "SORTING") return { order: [...container.querySelectorAll("[data-sort-id]")].map((x) => x.dataset.sortId) };
    if (type === "MATCHING") {
      const selects = [...container.querySelectorAll("select[data-match-for]")];
      return { pairs: selects.length ? selects.map((x) => [x.dataset.matchFor, x.value]) : [...container.querySelectorAll("[data-match-left-id]")].map((x) => [x.dataset.matchLeftId, x.dataset.matchedRight || null]) };
    }
    return {};
  }
  function submit(container, type) {
    const payload = collect(container, type);
    submissions.unshift({ at: new Date().toLocaleTimeString(), type, payload, sequence });
    container.querySelector(".result-banner").textContent = `Accepted by mock: ${JSON.stringify(payload)}`;
    document.getElementById("history").innerHTML = submissions.slice(0, 10).map((x) => `<li>${x.at} · ${x.type} · ${escapeHtml(JSON.stringify(x.payload))}</li>`).join("");
  }
  function escapeHtml(value) { const d = document.createElement("div"); d.textContent = value; return d.innerHTML; }
  function render() {
    const type = scenario.value || scenarios[scenarioIndex];
    mount.replaceChildren();
    if (loginRequired) return;
    const q = el("article", { "data-thaa-question":"", "data-question-type": type.toLowerCase().replaceAll("_", "-"), "data-question-id": `mock-${sequence}` });
    q.append(el("h2", { "data-thaa-prompt":"", text: prompts[type] }));
    if (type === "SINGLE_CHOICE") q.append(el("div", { class:"options" }, [option("radio","A","Nucleus"),option("radio","B","Mitochondrion"),option("radio","C","Ribosome"),option("radio","D","Golgi apparatus")]));
    else if (type === "MULTIPLE_SELECT") q.append(el("div", { class:"options" }, [option("checkbox","A","2"),option("checkbox","B","4"),option("checkbox","C","5"),option("checkbox","D","9")]));
    else if (type === "WORD_ANSWER") q.append(el("input", { type:"text", "data-answer-type":"text", ariaLabel:"Word answer" }));
    else if (type === "LONG_ANSWER") q.append(el("textarea", { rows:5, maxLength:500, "data-answer-type":"long", "data-word-limit":"80" }));
    else if (type === "NUMERIC") q.append(el("input", { type:"number", "data-answer-type":"numeric" }));
    else if (type === "FORMULA") q.append(el("input", { type:"text", "data-answer-type":"formula", "data-variables":"m,v" }));
    else if (type === "SORTING") renderSorting(q);
    else if (type === "MATCHING") renderMatching(q);
    else if (type === "UNSUPPORTED") q.append(el("canvas", { width:500, height:180, ariaLabel:"Interactive graph" }));
    else q.append(el("div", { class:"unknown-widget", text:"Custom widget has no known semantic controls." }));
    const submitButton = el("button", { type:"button", "data-thaa-submit":"", text:"Submit" });
    submitButton.addEventListener("click", () => submit(q, type));
    q.append(submitButton, el("div", { class:"result-banner", ariaLive:"polite" })); mount.append(q);
  }
  function renderSorting(q) {
    const variant = document.getElementById("sortVariant").value;
    const dragType = forceDragFailure ? "UNKNOWN_DRAG" : variant === "native" ? "NATIVE_HTML5_DRAG" : variant === "pointer" ? "POINTER_EVENT_DRAG" : "DIRECT_DOM_SORTABLE";
    const list = el("div", { class:"sortable-list", "data-thaa-sorting":"", "data-drag-type":dragType, "data-direct-sortable":variant === "direct" ? "true" : "false" });
    for (const [id, label] of [["A","Earth"],["B","Atom"],["C","Cell"],["D","Molecule"]]) list.append(el("div", { class:"sort-item", role:"listitem", draggable:variant === "native", "data-pointer-sortable":variant === "pointer" ? "true" : "false", "data-sort-id":id, text:label }));
    list.addEventListener("thaa:sorted", (event) => { list.dataset.thaaVerifiedOrder = event.detail.order.join("|"); });
    q.append(list);
  }
  function renderMatching(q) {
    const variant = document.getElementById("matchVariant").value;
    const box = el("div", { "data-thaa-matching":"", class:"matching-container", "data-drag-type":forceDragFailure ? "UNKNOWN_DRAG" : variant === "dropdown" ? "SELECT_OR_DROPDOWN_MATCHING" : "POINTER_EVENT_DRAG" });
    const right = [["R0","Protein synthesis"],["R1","ATP production"]];
    if (variant === "dropdown") {
      for (const [leftId, label] of [["L0","Mitochondria"],["L1","Ribosome"]]) {
        const select = el("select", { "data-match-for":leftId }); select.add(new Option("Choose…", "")); for (const pair of right) select.add(new Option(pair[1], pair[0]));
        box.append(el("div", { class:"matching-row" }, [el("span", { "data-match-left-id":leftId, text:label }), select]));
      }
      const hidden = el("div", { hidden:true }); for (const [id,label] of right) hidden.append(el("span", { "data-match-right-id":id, text:label })); box.append(hidden);
    } else {
      const grid = el("div", { class:"matching-grid" }), leftBox = el("div", { class:"matching-left" }), rightBox = el("div", { class:"matching-right" });
      for (const [id,label] of [["L0","Mitochondria"],["L1","Ribosome"]]) leftBox.append(el("div", { class:"match-item", "data-match-left-id":id, "data-pointer-sortable":"true", text:label }));
      for (const [id,label] of right) rightBox.append(el("div", { class:"match-item", "data-match-right-id":id, text:label })); grid.append(leftBox,rightBox); box.append(grid);
      box.addEventListener("thaa:matched", () => box.querySelectorAll("[data-match-left-id]").forEach((x) => x.classList.add("matched")));
    }
    q.append(box);
  }
  function newQuestion() { sequence += 1; scenarioIndex = (scenarioIndex + 1) % scenarios.length; scenario.value = scenarios[scenarioIndex]; remaining = 45; render(); }
  scenario.addEventListener("change", () => { scenarioIndex = scenarios.indexOf(scenario.value); sequence += 1; render(); });
  document.getElementById("sortVariant").addEventListener("change", render); document.getElementById("matchVariant").addEventListener("change", render);
  document.getElementById("replace").addEventListener("click", newQuestion); document.getElementById("rerender").addEventListener("click", render);
  document.getElementById("expire").addEventListener("click", () => mount.replaceChildren(el("div", { class:"panel", text:"Question expired." })));
  document.getElementById("toggleLogin").addEventListener("click", (event) => { loginRequired = !loginRequired; document.getElementById("login").hidden = !loginRequired; event.target.textContent = loginRequired ? "Restore login" : "Require login"; render(); });
  document.getElementById("resetTimer").addEventListener("click", () => { remaining = 45; });
  document.getElementById("dragFailure").addEventListener("click", (event) => { forceDragFailure = !forceDragFailure; event.target.textContent = forceDragFailure ? "Disable forced failure" : "Force drag failure"; render(); });
  setInterval(() => { remaining = Math.max(0, remaining - 1); document.getElementById("timer").textContent = `${String(Math.floor(remaining / 60)).padStart(2,"0")}:${String(remaining % 60).padStart(2,"0")}`; }, 1000);
  scenario.value = scenarios[0]; render();
})();
