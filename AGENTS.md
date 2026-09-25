# Starverse OpenCode Rules

## Assistant roles and delegation

Use capability-based roles rather than prescribing a particular model or provider:
- The primary reasoning agent owns the final diagnosis, implementation choices, and completion decision.
- A read-only code-mapping agent can locate files, trace execution paths, and identify integration seams before broad repository reads.
- A targeted test runner can execute approved checks and summarize failures.

Delegation policy:
- For broad repository exploration, symbol search, call-chain tracing, event-flow tracing, session/config/meta tracing, and test discovery, use an available read-only code-mapping agent before broad direct reads.
- After the mapping agent returns, the primary agent synthesizes the evidence, makes the final diagnosis, and chooses the repair plan.
- The primary agent may read small, specific snippets to verify mapped findings.
- Read-only exploration agents do not make final architecture or root-cause decisions and do not edit files.

Testing policy:
- For approved targeted tests and long test-output summarization, the primary agent may use a test runner.
- The runner may summarize pass/fail status, failed test names, effective stack traces, and relevant files.
- The primary agent remains responsible for test strategy, root-cause judgment, and completion judgment.

Cost-control policy:
- Avoid large exploratory reads when a code-mapping agent can collect the evidence.
- Avoid repeatedly reading large files.
- Prefer concise evidence summaries with file paths, symbols, event names, state names, and uncertainty notes.

Starverse repair policy:
- Keep diffs minimal.
- Do not modify unrelated files.
- Do not refactor tests unless explicitly requested.
- Do not continue style/highlight work when the task is about state flow, persistence, or runtime behavior.

External runtime / large local workdir rule:
- Do not place large runtime, engine, plugin, model, extracted package, diagnostic profile, CPU profile, netlog, or generated artifact directories under the Vite watch scope unless they are explicitly ignored by both Git and Vite. Prefer repo-external runtime workdirs. If a local runtime workdir must live under the repo, update `.gitignore` and `vite.config.ts` `server.watch.ignored` together. See `docs/maintenance/local-runtime-workdirs.md`.

## better-sqlite3 ABI rebuild policy

Why this policy exists:
- Starverse uses `better-sqlite3`, whose native binary must match the current runtime ABI.
- Node/Vitest and Electron use different ABI targets.
- A binary rebuilt for one environment may fail in the other.

Node/Vitest test rule:
- Before running database-heavy Node or Vitest tests, run:
  - `npm run rebuild:node`
- Use this before commands such as:
  - `npx vitest --run ...`
  - `node scripts/...`
  - `npm run verify:ssot`
- If DB tests fail with `NODE_MODULE_VERSION`, native module ABI mismatch, `better-sqlite3` load failure, or similar native binding errors, run `npm run rebuild:node` first and retry the scoped test before treating the failure as a code regression.

Electron runtime rule:
- Before launching Electron for manual smoke testing, run:
  - `npm run rebuild:electron`
- Use this before:
  - `npm run electron:dev`
- If Electron startup fails with `better-sqlite3` native module ABI mismatch, `NODE_MODULE_VERSION` mismatch, or Electron ABI mismatch, run `npm run rebuild:electron` and retry the Electron smoke.

Switching rule:
- Only one `better-sqlite3` ABI target is active at a time.
- After `npm run rebuild:node`, Electron may fail until `npm run rebuild:electron` is run again.
- After `npm run rebuild:electron`, Node/Vitest DB tests may fail until `npm run rebuild:node` is run again.
- Avoid unnecessary rebuild churn.

Final ABI target rule:
- Choose the final ABI target according to task endpoint.
- If the task ends with automated Node/Vitest validation, leave the ABI target as `node`.
- If the task ends with manual Electron validation, leave the ABI target as `electron`.
- If both are required, run Node/Vitest tests first using `npm run rebuild:node`, then switch to `npm run rebuild:electron` for final Electron validation.
- If the user explicitly asks for a different final target, follow the user request.

Git hygiene rule:
- Native rebuilds must not be committed.
- Do not stage or commit:
  - `node_modules/`
  - `better-sqlite3` native binaries
  - `package-lock.json` changes caused only by rebuild
  - `public/build-id.json`
  - temporary build artifacts
  - generated native build outputs
- Before committing, run:
  - `git status --short`
- If only native rebuild side effects or `public/build-id.json` are present, do not commit them.

Reporting requirement:
- When ABI repair was needed, final report must include:
  - `better-sqlite3 ABI mismatch encountered: yes/no`
  - `Rebuild command run: npm run rebuild:node or npm run rebuild:electron`
  - `Current ABI target after task: node or electron`
  - `Tests retried after rebuild: list commands or none`
  - `Electron smoke retried after rebuild: yes/no`
  - `No native artifacts committed: confirmed`

Failure handling:
- If rebuild fails, report:
  - exact command
  - exact error summary
  - whether failure is environment-related or code-related
  - whether task can proceed without DB-heavy tests or Electron smoke
- Do not silently skip required tests because of ABI mismatch.

## Project Codex subagents

When the user explicitly asks to use Codex subagents, the parent agent should select from these four project-scoped agents:

- code_mapper: use for read-only codebase mapping, symbol tracing, execution-path discovery, and integration seam discovery before implementation.
- risk_reviewer: use for read-only P0/P1 review of correctness, security, migrations, registry integrity, logging, and missing tests.
- test_runner: use for approved validation commands, test execution, failure summarization, and regression attribution. It should not edit files unless explicitly authorized.
- doc_consistency: use for phase language, acceptance matrix, owner decision, non-goal, and documentation consistency checks.

Delegation rules:
- Keep max_depth at 1; child agents must not spawn more child agents.
- Prefer one code_mapper before implementation, one risk_reviewer before merge, one test_runner for acceptance, and one doc_consistency when docs or phase claims change.
- Do not delegate owner decisions, final phase status, or security-boundary changes to child agents.
- Parent agent owns final synthesis, patch selection, and merge readiness.
- Child agents must return concise evidence with repo-relative paths.
