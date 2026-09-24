"use strict";
const $ = (id) => document.getElementById(id);
let currentState = null, keyDirty = false, clearRequested = false, refreshTimer = null;
const labels = { CONNECTED:"Connected", NOT_FOUND:"Not Found", AUTHENTICATED:"Authenticated", LOGIN_REQUIRED:"Login Required", UNKNOWN:"Unknown",
  PROCESSING:"Processing", READY:"Ready", FAILED:"Failed", UNSUPPORTED:"Unsupported", INTERACTION_SUCCESS:"Success", INTERACTION_FAILED:"Failed",
  INTERACTION_VERIFICATION_FAILED:"Verification Failed", INTERACTION_UNSUPPORTED:"Unsupported", INTERACTION_PENDING:"Ready" };
async function request(type, extra = {}) { return chrome.runtime.sendMessage({ type, ...extra }); }
function notice(text, kind = "") { $("notice").textContent = text; $("notice").className = kind; }
function formatLog(entry) { return `${new Date(entry.at).toLocaleTimeString()} [${entry.category}] ${entry.message}`; }
function render(state) {
  currentState = state;
  const running = state.session.running;
  $("sessionDot").classList.toggle("live", running); $("start").disabled = running; $("stop").disabled = !running;
  $("sessionStatus").textContent = running ? "Running" : "Stopped"; $("sessionId").textContent = state.session.id || "—";
  $("pageStatus").textContent = labels[state.pageState] || state.pageState; $("loginStatus").textContent = labels[state.authState] || state.authState;
  const q = state.currentQuestion;
  $("questionStatus").textContent = q ? (labels[q.status] || q.status) : "Waiting"; $("questionType").textContent = q?.type || "—"; $("engine").textContent = q?.engine || "—";
  const record = q ? state.processedQuestions[q.fingerprint] : null;
  $("dragType").textContent = record?.interaction?.type || "—"; $("interaction").textContent = labels[q?.interactionStatus] || q?.interactionStatus || "—";
  $("lastResult").textContent = q?.result ? JSON.stringify(q.result, null, 2) : "—";
  $("statistics").textContent = JSON.stringify(state.statistics, null, 2); $("logs").textContent = state.logs.slice(-100).map(formatLog).join("\n") || "No logs.";
  $("report").textContent = state.finalReport?.text || "No completed report.";
  updateDuration();
}
function updateDuration() {
  if (!currentState) return;
  const s = currentState.session, ms = s.running && s.startedAt ? Date.now() - s.startedAt : s.durationMs;
  $("duration").textContent = globalThis.THAA.durationText(ms);
}
async function refresh() { const response = await request("GET_STATE"); if (response?.ok) render(response.state); }
async function initialize() {
  const response = await request("GET_STATE");
  if (!response?.ok) return notice(response?.error || "Unable to load state", "error");
  const state = response.state; render(state); $("targetUrl").value = state.settings.targetUrl;
  document.querySelector(`input[name='answerMode'][value='${state.settings.answerMode}']`).checked = true;
  $("apiKey").placeholder = state.settings.hasApiKey ? "Saved ••••••••••••••••" : "Not saved"; $("mockFallback").checked = state.settings.mockFallbackEnabled !== false;
  refreshTimer = setInterval(updateDuration, 1000);
}
$("apiKey").addEventListener("input", () => { keyDirty = true; clearRequested = false; });
$("clearKey").addEventListener("click", () => { $("apiKey").value = ""; keyDirty = false; clearRequested = true; notice("Key will be removed when settings are saved."); });
$("save").addEventListener("click", async () => {
  const settings = { targetUrl: $("targetUrl").value.trim(), answerMode: document.querySelector("input[name='answerMode']:checked")?.value, mockFallbackEnabled: $("mockFallback").checked, clearApiKey: clearRequested };
  if (keyDirty) settings.apiKey = $("apiKey").value.trim();
  const response = await request("SAVE_SETTINGS", { settings });
  if (!response?.ok) return notice(response?.error || "Save failed", "error");
  keyDirty = false; clearRequested = false; $("apiKey").value = ""; notice("Settings saved. API key is masked.", "success"); await refresh();
  $("apiKey").placeholder = currentState.settings.hasApiKey ? "Saved ••••••••••••••••" : "Not saved";
});
$("start").addEventListener("click", async () => { const r = await request("START_SESSION"); if (!r?.ok) notice(r?.error || "Could not start", "error"); else { notice("Session started.", "success"); await refresh(); } });
$("stop").addEventListener("click", async () => { const r = await request("STOP_SESSION"); if (!r?.ok) notice(r?.error || "Could not stop", "error"); else { notice("Session stopped. Report generated.", "success"); await refresh(); $("reportCard").open = true; } });
$("openMock").addEventListener("click", async () => { const r = await request("OPEN_MOCK"); if (!r?.ok) return notice(r?.error || "Could not open mock", "error"); $("targetUrl").value = r.url; notice("Mock opened and selected as the target.", "success"); await refresh(); });
chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes.appState) void refresh(); });
window.addEventListener("unload", () => clearInterval(refreshTimer));
void initialize();
