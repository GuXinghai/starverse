# Starverse OpenCode Rules

## Model and subagent delegation

Default working model:
- The primary agent is DeepSeek V4 Pro.
- The read-only exploration agent is flash-code-reader, backed by DeepSeek V4 Flash.
- The targeted test-output summarizer is flash-test-runner, backed by DeepSeek V4 Flash.

Delegation policy:
- For repository exploration, large code reading, symbol search, call-chain tracing, event-flow tracing, session/config/meta tracing, and test discovery, the primary agent should delegate to flash-code-reader before doing broad direct reads.
- After flash-code-reader returns, the primary agent should synthesize the result, make the final diagnosis, and decide the repair plan.
- If additional broad code reading is needed after the first subagent result, the primary agent should call flash-code-reader again.
- The primary agent may directly read only small, specific snippets needed to verify subagent findings.
- Do not let flash-code-reader make final architecture decisions, final root-cause decisions, or code edits.

Testing policy:
- For targeted local tests and long test-output summarization, the primary agent may delegate to flash-test-runner.
- flash-test-runner may summarize pass/fail status, failed test names, effective stack traces, and relevant files.
- The primary agent remains responsible for final test strategy, root-cause judgment, and completion judgment.

Cost-control policy:
- Avoid using the primary agent for large exploratory reads when a Flash subagent can collect the evidence.
- Avoid repeatedly reading large files in the primary context.
- Prefer concise evidence summaries with file paths, symbols, event names, state names, and uncertainty notes.

Starverse repair policy:
- Keep diffs minimal.
- Do not modify unrelated files.
- Do not refactor tests unless explicitly requested.
- Do not continue style/highlight work when the task is about state flow, persistence, or runtime behavior.

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
