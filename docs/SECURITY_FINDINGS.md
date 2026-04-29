# Security Findings

This document records security review findings for World Monitor — what was fixed, what is intentionally accepted, and the rationale. Update it when posture changes.

Last reviewed: 2026-04-29 (PR `claude/promise-safety-and-docs`).

## Fixed in this review

| Finding | Location | Fix |
|---|---|---|
| XSS via attacker-controllable region name in `innerHTML` template | `src/app/panel-layout.ts:1489` | Refactored to DOM API (`document.createElement` + `textContent`); region names are no longer interpolated into HTML strings |
| `target="_blank"` without `rel="noopener noreferrer"` (tabnabbing risk) | `src/components/MapPopup.ts:745, 837, 1662, 2404` | Added `rel="noopener noreferrer"` to all four `<a>` templates |
| Critical CVE chain: `protobufjs <7.5.5` (CWE-94) reached via `@xenova/transformers` → `onnxruntime-web` → `onnx-proto` | `package.json` | Added `"protobufjs": "^7.5.5"` to `overrides`; npm install pulls patched 7.5.x for all transitive uses |
| High CVE: `vite 7.0.0–7.3.1` dev-server path traversal / `fs.deny` bypass | `package.json` | `npm audit fix` upgraded vite within the same major; dev-only impact, but still patched |
| Silent failure on panel-settings JSON parse | `src/app/event-handlers.ts:214` | Empty `catch{}` replaced with logged warning + reset-to-defaults so corrupted localStorage cannot strand the UI |
| Unhandled rejection on `country-intel` stock fetch | `src/app/country-intel.ts:150` | Added `.catch()` that logs and writes a default-empty stock object so the brief renders gracefully |
| Unhandled rejections on dynamic-import promise chains | `src/components/CesiumGlobe.ts:349`, `src/components/DeckGLMap.ts:4783`, `src/main.ts:291,298` | Added `.catch(err => console.error(...))` to all four sites |

After this PR, `npm audit` reports **0 critical / 0 high / 0 moderate / 0 low**.

## Accepted architectural risks

These are documented because they are real exposures, but fixing them would require breaking changes the project has chosen not to make.

### CSP `'unsafe-eval'` is allowed in `script-src`

- **Where:** `index.html` CSP meta tag and `tauri.conf.json` CSP.
- **Why kept:** Cesium (the 3D globe used in God's Eye view) compiles WebGL shaders at runtime via dynamic code evaluation. PR #170 attempted to remove `'unsafe-eval'` and broke God's Eye entirely.
- **Compensating controls:**
  1. `'unsafe-inline'` is **not** allowed on `script-src` — only the eval form is permitted.
  2. Tauri devtools are removed from production builds (no JS console attack surface for shipped binaries).
  3. The Tauri webview only loads from `tauri://localhost` and `http://127.0.0.1:46123` (sidecar); no third-party origins can execute script.
  4. All HTML templates in the app use `escapeHtml()` / `sanitizeUrl()` on attacker-controllable data — see `src/utils/sanitize.ts`.
- **Future:** Replace Cesium with a non-eval globe library (e.g. `globe.gl` or a custom Three.js implementation). Tracked informally; no ETA.

### Tauri Rust-side dynamic-evaluation calls

- **Where:** `src-tauri/src/main.rs` (~6 sites — `725, 1112, 1141, 1297, 1302, 1310`).
- **Why kept:** These dispatch hardcoded `CustomEvent` strings into the webview from native Rust code. The argument is a string literal compiled into the binary, not user input.
- **Compensating controls:** Code review covers this; new Rust→JS event dispatches must follow the same hardcoded pattern.
- **Action:** None required. Monitor that no future change ever interpolates a runtime value into the eval string.

### `'unsafe-eval'` granted to webviews via Tauri capability

- **Where:** `src-tauri/capabilities/default.json`.
- **Why kept:** Same Cesium reason as the CSP entry above.
- **Compensating controls:** Capability allowlist is otherwise minimal — no `core:webview:allow-print`, no `core:shell:allow-execute`, no filesystem-write to arbitrary paths.

### `@xenova/transformers` 2.17.x retains a critical-rated transitive dependency chain warning

- **Where:** `package.json` direct dep, used by `src/workers/ml.worker.ts` for in-browser ML inference (CLIP, sentiment, etc.).
- **Status after override:** `npm audit` is clean. The override forces `protobufjs ≥ 7.5.5` for every transitive consumer, so the active code path no longer hits the vulnerable version.
- **Why we don't downgrade to `@xenova/transformers@2.0.1`:** That is a SemVer-major downgrade losing model-loading APIs the worker depends on.
- **Action:** Re-audit on every dependency bump. If `@xenova/transformers` adds a peer constraint that conflicts with our protobuf override, evaluate switching to `@huggingface/transformers` (the official successor).

### Desktop-bundled API token (`VITE_DESKTOP_API_KEY`)

- **Where:** `.env.local` (gitignored), embedded into the desktop build at compile time.
- **Why kept:** This is the standard pattern for desktop apps that need to authenticate against a project-owned cloud proxy. The token is rate-limited and revocable on the server side.
- **Compensating controls:** The token is rotated on suspected compromise; sidecar requires a separate per-process `LOCAL_API_TOKEN` for local IPC auth.

## Standing security policy (apply when reviewing new code)

- **Never** interpolate API-sourced data into `innerHTML` without `escapeHtml()`.
- **Never** put attacker-controllable data into a `style="..."` attribute, even via `escapeHtml` — escape sufficient for HTML context but not for CSS context.
- **Always** use `sanitizeUrl()` on URLs read from feeds before assigning to `href` / `src`.
- **Always** add `rel="noopener noreferrer"` to `target="_blank"` links.
- **Always** validate sidecar inputs against the SSRF allowlist (private-IP block, scheme allowlist, no `userinfo@` host).
- **Never** log secret values, raw bearer tokens, or full request bodies in production logs.

## How to re-run the sweep

```bash
cd ~/Developer/worldmonitor

# 1. Vulnerability scan — expect 0 critical / 0 high
npm audit

# 2. XSS sink scan
grep -rn 'innerHTML\s*=' src/ | grep -v 'safe-html:' | grep -v 'escapeHtml('
grep -rn 'target="_blank"' src/ --include='*.ts' | grep -v 'rel="noopener'

# 3. Hardcoded-secret scan (already enforced by pre-commit hook)
npm run secrets:scan

# 4. Dynamic-evaluation audit — Cesium is expected; flag everything else
grep -rEn '\b(eval|new Function)\b' src/ src-tauri/sidecar/ api/
```
