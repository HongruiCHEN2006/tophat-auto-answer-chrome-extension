(function (root) {
  "use strict";
  const STATE_KEY = "appState";
  const API_KEY = "openaiApiKey";
  async function initializeStorage() {
    try { await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }); } catch (_) {}
    const found = await chrome.storage.local.get([STATE_KEY]);
    const state = root.THAA.mergeState(found[STATE_KEY]);
    await chrome.storage.local.set({ [STATE_KEY]: state });
    return state;
  }
  async function loadState() {
    const found = await chrome.storage.local.get([STATE_KEY]);
    return root.THAA.mergeState(found[STATE_KEY]);
  }
  async function saveState(state) {
    await chrome.storage.local.set({ [STATE_KEY]: state });
    return state;
  }
  async function getApiKey() {
    const found = await chrome.storage.local.get([API_KEY]);
    return typeof found[API_KEY] === "string" ? found[API_KEY] : "";
  }
  async function setApiKey(value) {
    const key = String(value || "").trim();
    if (key) await chrome.storage.local.set({ [API_KEY]: key });
    else await chrome.storage.local.remove(API_KEY);
  }
  root.THAA = root.THAA || {};
  Object.assign(root.THAA, { STATE_KEY, initializeStorage, loadState, saveState, getApiKey, setApiKey });
})(globalThis);
