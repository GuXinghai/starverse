# DFC-M16 HTML-to-PDF Engine Strategy Decision

Date: 2026-05-31

Branch: `docs/dfc-0-format-conversion-foundation`

## 1. Purpose

DFC-M16 selects the engine strategy direction for a future HTML -> PDF
`pdf_attachment` pilot after the M15 DFC conversion sandbox foundation.

This package is decision-only. It does not implement HTML-to-PDF, add a real
engine, add a dependency, change packaging, change DB schema, change IPC shape,
change Send Plan main flow, change the asset model, or change DFC option
semantics.

## 2. Baseline findings

Current relevant state:

- Electron is already part of the app runtime.
- Playwright is already present and used by the Electron smoke script via
  `_electron`.
- Puppeteer is not present.
- LibreOffice, Ghostscript, and Pandoc are not present as DFC conversion
  runtimes.
- File-type infrastructure contains external process policy/runner, engine
  registry/package contracts, and LibreOffice/Pandoc runner scaffolds, but DFC
  does not yet have a real HTML-to-PDF engine integration.
- Main app windows use Electron `BrowserWindow` with `sandbox: true`, but the
  current app renderer/preload/session must not be reused as a conversion
  renderer.
- M15 added DFC sandbox planning and fail-closed result helpers, but does not
  execute engines or validate real PDFs.

## 3. Engine strategy comparison

| Strategy | User value | Complexity | Dependency / binary / package impact | Portability | JS default policy | External resource policy | Local file access | Cookie/storage/profile isolation | Timeout/cleanup | Output same-source | M15 fit | First production runtime fit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Electron/Chromium reuse | High. Uses already bundled app runtime. | High if done safely because conversion must not pollute app windows, preload, user session, or app renderer process. | No new browser binary, but may require new main-process conversion window/service code and packaging review. | Good where Electron works. | Must default to disabled or tightly controlled. If enabled, only for explicitly trusted HTML; first pilot should disable JS. | Must block by default. Only embedded data or sandbox-copied resources later. | Must deny arbitrary local file reads; load HTML from controlled string or sandbox file with no file traversal. | Needs offscreen/hidden dedicated session partition, no app preload, no persistent cookies/storage. | Must use bounded load/render/print timeout, window destruction, temp cleanup. | Generated PDF must be written once to managed derivative storage; preview/send use same `derived_asset`. | Medium. M15 can plan paths; Electron print output path still needs dedicated adapter. | Candidate only if owner approves production use of Electron as converter with dedicated isolated session. Do not reuse app renderer. |
| Playwright Chromium production runtime | High. Strong fit for controlled page rendering and PDF generation. | Medium-high. Cleaner API than app Electron windows, but productionizing Playwright browser launch is a new runtime responsibility. | Playwright package exists, but browser binary availability/packaging must be confirmed. May add large browser payload or install policy. | Good if browsers are packaged consistently across platforms. | Can disable JS/context features through route/init settings only with careful design; must default deny for first pilot. | Route all network requests to abort by default. | Browser context must not receive arbitrary file URLs; input from sandbox only. | Excellent: isolated browser context/profile per job. | Playwright has launch/page timeouts; must also clean browser/context/temp dirs. | Direct PDF output from page to controlled path; then managed derivative. | Good. M15 can supply input/output dirs and diagnostics boundary. | Recommended first runtime if owner accepts browser binary/packaging policy. |
| Puppeteer / bundled Chromium | High. Mature PDF API. | Medium-high. Similar to Playwright, but introduces new dependency and browser distribution. | New dependency and bundled Chromium likely heavy. Not currently approved. | Good if packaged, but larger build/installer risk. | Can control JS/network with browser/page options and request interception. | Must abort by default. | Same restrictions as Playwright. | Good with isolated user data dir. | Good API, but cleanup/kill still required. | Direct PDF output to controlled path. | Good technically, poor dependency fit. | Not recommended for first pilot because it adds a second browser automation stack. |
| Managed external engine package | High long-term. Best aligns with engine/plugin package model and future external runtimes. | High upfront. Requires package install/trust/health/runtime adapter flow before HTML->PDF. | Depends on chosen engine. Could be large but explicit and owner-gated. | Depends on engine package per platform. | Engine-specific; must enforce no JS or explicit JS policy. | Engine-specific; must deny network/resources by default. | Strong if engine only sees sandbox copy/stream. | Strong because engine runs outside app renderer/browser session. | Existing external process runner/policy gives timeout/output/kill primitives. | Strong if output path contract is enforced. | Strong with M15 and file-type runner primitives. | Best long-term foundation, but likely not fastest first HTML->PDF pilot. |
| Defer HTML->PDF | Avoids new runtime risk. | Low now, but delays rendered-output value. | None. | N/A. | N/A. | N/A. | N/A. | N/A. | N/A. | N/A. | N/A. | Not recommended because M15 foundation and `pdf_attachment` seam are ready for an owner-approved engine decision. |

## 4. Recommended strategy

Recommended ordering:

1. **Playwright Chromium production runtime, if owner accepts browser binary and
   packaging policy.**

   This is the cleanest first HTML-to-PDF engine from a rendering-control
   perspective. It offers isolated browser contexts and direct PDF output
   without reusing the app renderer or user session. The blocker is packaging:
   Playwright is present as a package, but M16 does not verify or approve
   production browser binary distribution.

2. **Dedicated Electron/Chromium conversion window, if owner rejects Playwright
   browser packaging but approves using the app runtime as converter.**

   This avoids a separate browser binary but must be stricter than the app UI:
   hidden/offscreen window, dedicated non-persistent partition, no app preload,
   no user session, no raw file access, network/resource deny by default, and
   destroy-on-timeout cleanup. Reusing the main app renderer, preload, or
   session is not acceptable.

3. **Managed external engine package.**

   This is the best long-term model for external runtimes, but it is too much
   surface area for the first user-visible HTML-to-PDF pilot unless the owner
   wants to invest in engine packaging first.

4. **Puppeteer / bundled Chromium.**

   Technically viable but not recommended because it adds a new browser
   automation stack and likely a large bundled Chromium dependency when
   Playwright already exists.

5. **Defer HTML-to-PDF.**

   Only choose this if owner rejects both Playwright production browser
   packaging and dedicated Electron conversion window use.

## 5. Owner approvals required

Before M17 implementation, owner must approve one engine path:

### If choosing Playwright Chromium

- Production use of Playwright as a conversion runtime, not just a test/smoke
  tool.
- Browser binary distribution and installer/package impact.
- Runtime policy for locating the browser executable in development and
  packaged builds.
- Network/resource deny-by-default policy.
- JS disabled by default for first pilot.
- Per-job isolated browser context/profile and cleanup.

### If choosing Electron/Chromium reuse

- Production use of Electron as conversion runtime.
- Dedicated hidden/offscreen conversion window or equivalent service.
- No app preload and no app renderer/session reuse.
- Non-persistent isolated partition/profile.
- Network/resource deny-by-default policy.
- JS disabled by default for first pilot.
- Destruction/cleanup on timeout/failure.

### If choosing managed external engine

- Engine package identity and trust model.
- Runtime package distribution, signing, license, attribution, health checks.
- External process policy, sandbox input/output, and cleanup rules.
- Platform support matrix.

### Rejected unless separately approved

- Adding Puppeteer.
- Adding a bundled Chromium outside the selected strategy.
- Using the M11-M13 smoke harness as the production conversion runtime.
- Allowing arbitrary local file or network access from HTML content.
- Running JS by default in untrusted HTML.

## 6. HTML-to-PDF pilot decision

M16 recommends entering M17 only after owner chooses between:

1. Playwright Chromium production runtime.
2. Dedicated Electron/Chromium conversion window.

Default M16 recommendation: **Playwright Chromium production runtime**, because
it is more naturally isolated from the app renderer/session and is easier to
reason about as a conversion worker. If owner does not want to package or
support Playwright browser binaries, choose dedicated Electron/Chromium
conversion window as the fallback.

## 7. M17 implementation task package

### Task package: DFC-M17 HTML-to-PDF `pdf_attachment` Pilot

**Precondition:**
Owner must explicitly approve the engine strategy: Playwright Chromium
production runtime or dedicated Electron/Chromium conversion window.

**Goal:**
Implement a minimal backend-only HTML -> PDF `pdf_attachment` pilot using the
M15 DFC sandbox foundation and the approved engine strategy.

**Scope:**

- Accept only backend-owned local HTML assets already stored in managed file
  storage.
- Create a sandbox input copy or controlled HTML input under the M15 sandbox.
- Render HTML to PDF with the approved engine.
- Disable JS by default for the first pilot.
- Deny external network/resources by default.
- Deny arbitrary local file access.
- Use isolated per-job profile/session/context.
- Write the PDF to the controlled sandbox output path.
- Validate output exists, is under the sandbox output dir, has PDF signature,
  and is within size limits.
- Move/write the PDF into managed derivative storage.
- Create a DFC `derived_asset` with `targetKind: pdf_attachment`,
  `sendStrategy: file_attachment`, and `derived_asset` `SendAssetRef`.
- Ensure preview and Send Plan use the same selected PDF `derived_asset`.
- Add minimal tests for successful HTML->PDF option/preview/send-source
  coherence and fail-closed engine failure.
- Update progress ledger and important context.

**Forbidden:**

- Do not implement Office-to-PDF.
- Do not implement PS/EPS-to-PDF.
- Do not add Puppeteer unless owner explicitly chose Puppeteer.
- Do not add LibreOffice, Ghostscript, or Pandoc.
- Do not reuse app renderer/preload/session.
- Do not allow network or arbitrary local files by default.
- Do not change DB schema, IPC shape, Send Plan main-flow, asset model, DFC
  target vocabulary, or legacy bridge.
- Do not add CI, packaged installer smoke, npm audit, ESLint, or full-suite
  failure work.

**Acceptance:**

- `git diff --check`
- `npx vue-tsc --noEmit --pretty false`
- Targeted tests for the new HTML-to-PDF adapter/helper and DFC
  ensure/options/preview/send-source coherence.
- If DB worker tests are touched, run `npm run rebuild:node` first.
- Do not run full Vitest.
- Do not run Electron smoke unless smoke files are modified.

**Stop conditions:**

- Browser binary or Electron conversion window cannot be isolated without app
  session/preload reuse.
- Network/local-file denial cannot be enforced.
- Output cannot be validated and bound to a managed `derived_asset`.
- Implementation requires DB schema, IPC shape, Send Plan main-flow, asset
  model, or DFC option semantic changes.
- Packaging implications cannot be kept owner-gated.
