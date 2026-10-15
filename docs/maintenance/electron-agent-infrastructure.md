# Electron agent infrastructure

Status: active
Document Role: maintenance, usage-guide, verification-plan
Last updated: 2026-10-15

This development-only controller uses the repository's installed Electron and
Playwright. It starts the real epoch2 main entry, preload, IPC, database, and Vue
renderer. It does not install MCP servers, browsers, extensions, or other software.
The controller provides observation and interaction primitives; business scenarios
and acceptance criteria are selected separately.

## Start and stop

From the repository root in PowerShell:

```powershell
npm run agent:electron -- --profile exploration
```

This rebuilds native modules for Electron, builds the main entry and preload using
the installed Vite Electron plugin, starts a renderer-only Vite server on an
available loopback port, and keeps the controller running. Stop with Ctrl+C, or
from another terminal:

```powershell
node scripts/agent/electron-agent.mjs status --profile exploration
node scripts/agent/electron-agent.mjs snapshot --profile exploration
node scripts/agent/electron-agent.mjs screenshot --profile exploration
node scripts/agent/electron-agent.mjs stop --profile exploration
```

The returned snapshot is an accessibility tree. Screenshots return an absolute
local PNG path. A target can use a role and accessible name, label, test ID, or
explicit selector. For example, a command request file can contain:

```json
{"target":{"role":"button","name":"Settings"}}
```

```powershell
node scripts/agent/electron-agent.mjs click --profile exploration --request C:\path\request.json
```

Actual names depend on the observed UI and selected language. Other commands are
`fill` (`value`), `press` (`key`), `select` (`value`), `check` (`value`, boolean),
and `scroll` (`target`, `top`, `left`). The `--json` option also accepts a JSON
object. Commands are serialized and locator actions have bounded timeouts. There
is no arbitrary JavaScript or shell execution command. Hidden-window screenshots
use Electron's `capturePage` with `stayHidden` and `stayAwake`. They capture the
viewport; `fullPage: true` requires a visible `--show` session.

For a minimal connection check with automatic shutdown:

```powershell
npm run agent:electron:check -- --profile infrastructure-check
```

This only checks renderer/bridge readiness, storage paths, hidden-window state,
accessibility snapshot, screenshot, and controller connectivity. It does not send
a model request or execute a business workflow. Successful output includes
`"check":"passed"`; a screenshot and JSON evidence remain in the run directory.

## Reusable, separate profiles

The default Windows profile root is:

```text
%USERPROFILE%\.starverse-agent\profiles\<profile-name>
```

`app-data`, `user-data`, logs and crash dumps are kept below that profile. This
isolates the application's database/configuration/credentials as well as Chromium
storage. Profiles are reused across launches and never automatically reset or
deleted. Each run creates a separate `sessions/<timestamp-id>` artifact directory.
Use another `--profile` name for a fresh state without deleting previous evidence.
`--root <external-directory>` selects another profiles parent; pass it consistently
to start and client commands. The parent must be outside the repository.

An ownership marker binds a profile to its checkout. Nonempty unowned profiles,
profile links, incompatible markers, mixed smoke-fixture mode, packaged apps,
and duplicate live launchers for the same profile are rejected. Schema or config
errors do not authorize automatic resets. Ordinary application startup remains
outside this mode. No real profile is copied, and no API key is provisioned.

## Window and network behavior

The main window is hidden by default, background throttling is disabled, and
the hidden renderer uses Electron's offscreen bitmap rendering so captures keep
up with the current DOM. This changes the rendering path; OS-window appearance,
DPI and focus acceptance still require a visible session. In agent mode,
automatic DevTools, main-window activation and external-link browser launches are
suppressed in this mode. `--show` allows a visible test window. Renderer recovery
and normal startup failures exit rather than opening a recovery dialog in agent
mode. Native file dialogs and other OS UI invoked by future workflows are outside
the controller's scope and may still appear.

Networking uses the application's normal behavior by default, including catalog
and cloud-rule refreshes. `--offline` optionally blocks governed provider HTTP,
the main/default Electron sessions and renderer HTTP/WebSocket requests except
the exact renderer server origin. This is an application-level test aid, not an
OS firewall for arbitrary plugins, utility processes, or external applications.
No provider credential or paid request is needed for the connection check.

## Local control and builds

The control server binds only to `127.0.0.1` on an available port. It requires a
random session token, an exact Host header, and rejects browser Origin headers.
`control.json` contains the token and must stay local. Client commands read it
without printing the token. There is no public TCP CDP endpoint; Playwright's
Electron launcher owns the connection. Errors, screenshots and snapshots can
contain test content, so keep artifacts private.

Main/preload builds use the existing ignored `dist-electron` directory. Renderer
cache, profiles, and session artifacts are outside the repository and its Vite
watch scope. The launcher does not run `npm install`, `npx`, or package downloads.
Native rebuilds can require headers/toolchains; use already available caches when
offline. No native artifacts or generated build outputs should be committed.

After Node/Vitest database tests, run `npm run rebuild:electron` before launching
the controller. `agent:electron` and `agent:electron:check` do this automatically.
Direct `node ... start` assumes that preparation is complete. `--skip-build` also
assumes that main/preload artifacts are current; restart after main-process source
changes. Renderer source uses the ordinary Vite development pipeline.

## Verification record (2026-10-15)

The final connection check passed using Electron 42.10.0 and the installed
Playwright 1.57.0, with normal application networking and the reusable profile
`infrastructure-check-20261015`. Evidence is below that profile at
`sessions/2026-10-15T13-39-49-549Z-fa3cca61/connection-check.json` and
`connection-check.png`. The JSON records window/storage state before and after
capture. Both states were hidden, unfocused, without DevTools, with offscreen
rendering and background throttling disabled. The controller exited successfully,
removed its launcher lock and marked its manifest stopped. Earlier runs reused
the same profile, and a separate client stop command also completed normally.

Targeted tests: 7 files / 23 cases passed in aggregate. One new window test's
event mock was corrected and that file rerun. These checks do not load SQLite.
Type checking, scoped ESLint, documentation metadata and scoped diff whitespace
checks passed. Static P0/P1 review found no blockers; its startup-cancellation
cleanup recommendation was applied.

```powershell
node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts electron/bootstrap/agentAutomationRuntime.test.ts electron/windows/agentWindowLifecycle.test.ts electron/windows/agentWindowCreation.test.ts scripts/agent/control.test.mjs scripts/agent/profile.test.mjs electron/windows/mainWindow.test.ts electron/windows/mainWindowActivation.test.ts
# Rerun after correcting the new test's webContents event mock:
node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts electron/windows/agentWindowCreation.test.ts
node scripts/agent/electron-agent.mjs start --check --profile infrastructure-check-20261015
```

Initial failures remain distinct from the final result:

- Sandboxed `npm run rebuild:node` failed with `ENOTFOUND github.com` and missing
  Node header cache. An explicit `npm_config_nodedir` attempt then failed with
  `LNK1104` for `22.21.1/Release/node.lib`; the existing library is under `x64`.
  Both were environment/build configuration failures. Using the existing cache
  through `npm_config_devdir` completed Node and Electron rebuilds without new
  software or dependency installation. Sandboxed Vitest also hit an `EPERM`
  temporary-file rename; the scoped tests passed outside that sandbox.
- Windows packaged-app LocalAppData redirection failed the initial directory
  validation. The default is now the stable user-home directory documented above.
- Ordinary Playwright capture of the hidden window timed out; native capture
  without offscreen rendering initially returned an old frame. The final hidden
  mode uses Electron offscreen rendering and native capture. Its PNG was visually
  inspected against the current accessibility snapshot. See the
  [Electron offscreen rendering documentation](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering).

ABI report:

- better-sqlite3 ABI mismatch encountered: no.
- Rebuild command run: `npm run rebuild:node`; `npm run rebuild:electron`.
- Current ABI target after task: electron.
- Tests retried after rebuild: the scoped Vitest commands above.
- Electron smoke retried after rebuild: yes, the connection check above;
  this was not a full business/provider smoke.
- No native artifacts committed: confirmed; no commit was made.

Business interactions, paid provider calls, native dialogs, visible-window/DPI
behavior and long-running exploration remain outside this verification. Catalog
and cloud-rule networking were not accepted by the connection check; refresh
failures can remain in the local Electron log.
