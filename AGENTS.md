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
