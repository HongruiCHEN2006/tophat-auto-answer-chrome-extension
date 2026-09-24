# Top Hat Answer Assistant

A plain-JavaScript Chrome/Edge Manifest V3 extension that monitors Top Hat lecture questions and produces structured answers with either OpenAI or a local random provider. Real `app.tophat.com` pages remain assistance-only by default; owners of an authorized test course can explicitly enable automatic selection and submission for the exact saved Top Hat URL.

The project is directly loadable; there is no build step and no runtime dependency installation.

The extension can continue monitoring an open Top Hat tab while you use other tabs or applications, but still subject to browser background-execution limitations.

Please note that this extension relies on Top Hat's current user interface and page structure. If Top Hat updates or redesigns its interface, some features of the extension may stop working and require corresponding updates. I will stop updating this repository after finishing college. 
Last Update: 9/24/2026 


## Disclaimer
This extension is for educational and accessibility purposes only. Users are responsible for:

Following their institution's academic integrity policies
Complying with TopHat's terms of service
Understanding that automated participation may not reflect actual learning

Don't ever use this on exams.

## Safety boundary

- Real Top Hat pages default to assistance-only. Automatic selection and submission requires the explicit ownership/authorization checkbox and a valid saved Top Hat course URL.
- Authorization is checked in the trusted background worker and passed to the content script only for the selected target tab. Merely visiting another Top Hat page does not enable automation.
- Packaged mock page: explicitly authorized full automation, including Submit.
- Mock-only direct-DOM fallbacks are never used on real Top Hat pages; a real interaction must pass application-state verification before Submit is clicked.
- Top Hat credentials, cookies, and passwords are never read or stored.
- The OpenAI key is stored only in `chrome.storage.local`. Storage access is restricted to trusted extension contexts when the browser supports `setAccessLevel`.
- The API key is never injected into a page, URL, log, report, or console message.

## File tree

```text
.
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html
│   ├── popup.css
│   ├── popup.js
│   ├── lib/
│   │   ├── selectors.js
│   │   ├── storage.js
│   │   ├── state.js
│   │   ├── sessionManager.js
│   │   ├── logger.js
│   │   ├── questionDetector.js
│   │   ├── questionClassifier.js
│   │   ├── questionParser.js
│   │   ├── fingerprint.js
│   │   ├── answerEngine.js
│   │   ├── openaiProvider.js
│   │   ├── randomProvider.js
│   │   ├── interactionRouter.js
│   │   ├── interactionVerifier.js
│   │   └── adapters/
│   │       ├── singleChoiceAdapter.js
│   │       ├── multipleSelectAdapter.js
│   │       ├── textAdapter.js
│   │       ├── numericAdapter.js
│   │       ├── formulaAdapter.js
│   │       ├── sortingAdapter.js
│   │       └── matchingAdapter.js
│   └── mock/
│       ├── index.html
│       ├── mock.css
│       └── mock.js
├── tests/
│   ├── check-js.cjs
│   ├── chromium-e2e.cjs
│   └── core.test.cjs
├── package.json
└── README.md
```

## Important files

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest with only `storage`, `tabs`, and `scripting`, plus Top Hat and OpenAI host access. |
| `background.js` | Trusted service worker. Owns settings, state, sessions, OpenAI calls, tab recovery, statistics, caching, and reports. |
| `content.js` | Idempotent page monitor. Debounces a `MutationObserver` and runs the same `inspectPage()` every three seconds. |
| `selectors.js` | The only Top Hat/mock selector configuration. Update this first when Top Hat changes markup. |
| `questionDetector.js` | Finds the active question, authentication state, and timer independently. |
| `questionClassifier.js` | Distinguishes supported, intentionally unsupported, and unknown question types. |
| `questionParser.js` | Converts page controls into small normalized question objects with stable IDs. |
| `fingerprint.js` | Deterministic FNV-1a hash over type, normalized prompt, options/items, and matching sides. Timer and transient DOM state are excluded. |
| `answerEngine.js` | Selects the provider, validates results locally, and permits at most one necessary retry. |
| `openaiProvider.js` | Uses the Responses API with type-specific strict JSON Schemas and bounded output tokens. |
| `randomProvider.js` | Entirely local generation of structurally valid test answers; it never calls OpenAI. |
| `interactionRouter.js` | Enforces the explicit authorization boundary and selects the appropriate adapter. |
| `interactionVerifier.js` | Reads selected/value/order/matching state after an attempt; visual movement alone is insufficient. |
| `mock/*` | Authorized local lab for all question, auth, timer, rerender, replacement, expiration, drag, and fallback paths. |

## State architecture

The service worker is the single writer for important state. A serialized `appState` object and a separate `openaiApiKey` value live in `chrome.storage.local`.

```text
popup ── messages ──┐
                    ├── background service worker ── chrome.storage.local
content script ─────┘              │
                                   └── OpenAI Responses API (OpenAI mode only)
```

Persisted state includes settings, session timestamps, target tab, auth/page status, current question, compact per-question records, structured logs, statistics, and the final report. It does not persist DOM trees or full page text. The worker restores state after suspension/restart and reattaches to a matching tab when a running session is recovered.

The API key is intentionally excluded from `appState`, popup responses, logs, and reports. The popup only receives `hasApiKey`.

## Question lifecycle

```text
DOM mutation or 3-second fallback
  → debounced inspectPage()
  → local auth/timer detection
  → local type classification and parsing
  → normalized question
  → deterministic fingerprint
  → background duplicate/state check
  → PROCESSING
  → RandomProvider or OpenAIProvider
  → local schema/ID validation
  → cache result as READY
  → assistance-only result OR explicitly authorized interaction adapter
  → verify interaction
  → per-question record + statistics
```

Both monitoring sources call the exact same `inspectPage()` method. A fingerprint already in the processed map is counted as a duplicate and never starts another API call. Timer text, animation, class changes, and rerenders do not alter fingerprints. A response whose fingerprint is no longer current becomes `STALE_RESULT_IGNORED`.

`UNSUPPORTED` (canvas, click-target, GeoGebra, graphs) and `UNKNOWN` questions are recorded locally and never sent to OpenAI.

## API usage optimization

The OpenAI path implements the following constraints:

- It sends only `JSON.stringify(normalizedQuestion)`, never HTML, `body.innerText`, navigation, timer text, previous questions, or session history.
- A short, stable system instruction precedes the changing question to remain prompt-cache friendly.
- Responses API Structured Outputs provide one JSON Schema per type.
- Output contains IDs rather than repeated option text.
- Output ceilings are small and type-specific; long answers are capped and incorporate page-provided word/character limits.
- Local validation checks option IDs, exact sorting permutations, and one-to-one matching.
- Successful results are persisted before interaction.
- 401/other non-transient 4xx errors are not retried. Timeout, network, 429, 5xx, and invalid structured results retry once at most.
- Random mode makes zero API requests.
- Actual `input_tokens`, `output_tokens`, and cached input tokens are accumulated when returned. Missing usage is reported as unavailable, never estimated.

The runtime schema format follows the official [OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs).

## Session lifecycle

### START

START creates a new random session ID, resets runtime records/statistics/logs (not saved configuration), locates the target tab, requests `autoDiscardable: false` where allowed, and starts one observer plus one fallback interval. START is disabled while running.

If no matching tab exists, the session stays running with `Page: Not Found`; tab creation or navigation can reconnect it later.

### STOP

STOP disconnects monitoring, invalidates outstanding results through session/current-fingerprint checks, records the end time, freezes duration, finalizes statistics, and persists a detailed Session Report. STOP is disabled when already stopped. The final report remains available after popup/browser restarts.

## Drag-type detection

Before sorting or matching, the adapter examines semantic and structural signals and returns one of:

- `NATIVE_HTML5_DRAG`
- `POINTER_EVENT_DRAG`
- `MOUSE_EVENT_DRAG`
- `SELECT_OR_DROPDOWN_MATCHING`
- `DIRECT_DOM_SORTABLE`
- `FRAMEWORK_MANAGED_DRAG`
- `UNKNOWN_DRAG`

Signals include `draggable`, matching `<select>` controls, ARIA/list roles, pointer/mouse sortable markers, known drag-library patterns, and explicit mock test markers. Authorized pages attempt the detected native, pointer, mouse, or framework-style event sequence and verify the resulting application state.

In the authorized mock only, failure can use a deterministic direct-state fallback. The record retains `fallbackUsed` and the initial failure reason before Submit is clicked.

On an authorized real Top Hat target, Submit is clicked only after verification succeeds. If Top Hat changes its framework or rejects synthetic drag events, the result is preserved as an interaction failure instead of submitting an unverified answer.

## Interaction verification

Adapters do not equate a click or visual move with success. Verification rereads:

- radio/checkbox checked state;
- text/numeric/formula control values after native setters and input/change events;
- sorting DOM ID order plus mock application-visible verification state;
- dropdown selections or left-to-right matching state.

Outcomes are stored separately from answer generation as `INTERACTION_SUCCESS`, `INTERACTION_FAILED`, `INTERACTION_VERIFICATION_FAILED`, or `INTERACTION_UNSUPPORTED`.

## Install in Chrome

1. Clone/download this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository's `extension` directory (not the repository root).
6. Pin **Top Hat Answer Assistant** if desired.

## Install in Microsoft Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extension` directory.

## Configure OpenAI mode

1. Open the popup.
2. Enter a valid Top Hat course or lecture URL.
3. Select **OpenAI**.
4. Paste an API key and click **Save Settings**.
5. The field becomes blank with a masked “Saved” placeholder. The key can be replaced by typing a new value and saving, or deleted with **Clear** followed by **Save Settings**.
6. Open the target Top Hat page and log in normally. The extension never handles the login.
7. Press **START**.

The prototype calls `gpt-4o-mini` directly from the trusted service worker. For a production-distributed extension, do not ship user API credentials in browser storage; use an authenticated backend proxy with appropriate abuse controls.

## Enable automation for an authorized Top Hat test course

1. Create or open a Top Hat course that you own or are explicitly authorized to automate.
2. Paste that course's exact `https://app.tophat.com/e/{course_id}` or `/lecture` URL into **Target Page**.
3. Select OpenAI or Random mode.
4. Check **I own/control this target course and authorize automatic selection and submission on its exact Top Hat URL**.
5. Click **Save Settings**, open that exact target page, and press **START**.

The authorization setting defaults to off and persists in local extension state. Unchecking it returns real Top Hat pages to assistance-only behavior. Standard choices and text-like inputs are filled through their native controls; sorting and matching use the detected drag/drop or dropdown mechanism. The extension verifies the resulting state before clicking Submit and records any unsupported framework interaction without using the mock-only DOM fallback.

## Use Random mode

Select **Random**, save, and press START. Random mode needs no key and makes no network request to OpenAI. It is intended for architecture and mock-workflow testing; its answers are structurally valid but not intended to be correct.

## Test the mock lab end to end

1. Click **Open authorized mock lab** in the popup. This opens the packaged page and makes its extension URL the target.
2. Select **Random**, save, and press **START**.
3. Use the lab's **Question type** selector for each type:
   - Single Choice: one radio is selected and submitted.
   - Multiple Select: a non-empty checkbox subset is selected and submitted.
   - Word Answer: the fixed random test response is entered.
   - Long Answer: a bounded test response is entered.
   - Numeric: a local random number is entered.
   - Formula: a clearly marked test expression is entered.
   - Sorting: a random permutation is applied and verified.
   - Matching: a random one-to-one mapping is applied and verified.
   - Unsupported: canvas is classified as `UNSUPPORTED`; no provider call occurs.
   - Unknown: the unrecognized widget is classified as `UNKNOWN`; no provider call occurs.
4. For sorting, switch between **Native HTML5 drag**, **Pointer/framework drag**, and **Direct DOM sortable**.
5. For matching, switch between **Dropdown matching** and **Drag matching**.
6. Click **Force drag failure** to exercise `UNKNOWN_DRAG` and the mock-only fallback path.
7. Click **DOM rerender** to verify duplicate suppression.
8. Click **New question** to test replacement/stale-result protection.
9. Click **Expire question** to remove the active question.
10. Click **Require login**, confirm the popup pauses and counts an interruption, then click **Restore login** and confirm automatic resume.
11. Watch the timer change without creating a new fingerprint/API request.
12. Press **STOP** and inspect the retained report.

The lab's Submission History provides an application-visible record of every automated Submit.

## Logs and reports

The popup's **Runtime logs** section shows the latest structured entries. Logs are retained in `appState` (bounded to 1,000 entries) and contain timestamps plus one of the documented category prefixes. `DEBUG` in `lib/logger.js` controls extra service-worker console output without disabling structured logs.

The **Final session report** appears after STOP and includes:

- duration and unique/processed/duplicate counts;
- separate answer and interaction totals;
- per-type detected/success/failure/unsupported totals;
- changed/stale/login/retry counts;
- API requests, retries, terminal failures, and actual token usage when available;
- detailed failed-question records with preserved generated answers and drag types.

## Inspect developer state

### Content-script console

On a Top Hat page, open DevTools (`F12`) and choose the extension's isolated execution context from the Console context selector. On the packaged mock page, its page console is the extension context.

### Service-worker console

Open `chrome://extensions` or `edge://extensions`, find the extension, and click the **service worker** link under “Inspect views.” Network errors and `DEBUG` console output appear there.

### Extension storage

From the service-worker DevTools console:

```js
chrome.storage.local.get(null).then(console.log)
```

Do not share that output because it contains the locally stored API key. Inspect `appState` specifically when possible:

```js
chrome.storage.local.get("appState").then(console.log)
```

## Development checks

Node.js is only needed for repository checks, not to run the extension.

```text
npm test
npm run check
```

The tests cover deterministic timer-independent fingerprints, Random results for every supported type, local invalid-ID/permutation/matching rejection, structured schemas, type-specific output limits, API usage parsing, final reporting, and the no-page-HTML API boundary.

`tests/chromium-e2e.cjs` is the CDP harness used during development against a temporary Edge profile with the unpacked extension already loaded. It exercises every mock question type, drag fallback, login interruption/recovery, STOP/report generation, and the Random-mode zero-request invariant.

## Troubleshooting

**Popup says Page: Not Found**  
Open the saved URL in a normal tab. Ensure the course ID/path matches. A course URL may reconnect to its `/lecture` route automatically.

**Login Required never clears**  
Complete login manually in the Top Hat tab. The content script continues watching and resumes when the lecture/question DOM returns.

**No question detected**  
Top Hat markup changes over time. Inspect the live controls and update only `lib/selectors.js`; avoid spreading new selectors through adapters.

**Question is UNKNOWN**  
The parser found a question container but no recognized semantic controls. Check the isolated content-script console and add a narrowly scoped selector/classification rule. Do not send the page to OpenAI as a fallback.

**OpenAI returns 401**  
Replace the saved key. Authentication failures are not retried. The key is unrelated to token volume.

**OpenAI returns 429 or 5xx / network timeout**  
The extension retries once, then records `API_FAILED` or `API_TIMEOUT`. It never loops.

**A real Top Hat answer is generated but not submitted**

Confirm that the ownership/authorization checkbox is enabled for the saved target URL. If the failure is sorting or matching, Top Hat may be using a drag framework that rejects synthetic events; the extension deliberately preserves the result and avoids submitting when application state cannot be verified.

**Background tab was discarded or reloaded**  
The worker and content script restore persisted session state and reconnect. Chrome can still throttle background pages; no refresh keep-alive is used.

**Duplicate count grows while a question remains visible**  
That indicates the observer/fallback detected the same fingerprint. It is expected diagnostic telemetry; it does not imply another provider call.

**Popup settings do not update**  
Reload the extension from the extensions page after changing source files. Existing extension pages may also need one reload.

## Architectural reference

The project was reimplemented from scratch. [`blackspider-ops/TopHat_AutoAnswer`](https://github.com/blackspider-ops/TopHat_AutoAnswer) was consulted only for broad ideas around an MV3 layout, MutationObserver monitoring, three-second fallback scans, and dynamic Top Hat navigation. Authorized interaction, verification, and submission controls are implemented independently in this project.
