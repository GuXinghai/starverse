---
description: Ask mimo_run_test to run targeted Starverse verification and summarize failures (MiMo-V2.5).
agent: mimo_run_test
subtask: true
---

Use mimo_run_test to run targeted Starverse verification and summarize the result.
Command: /mimo-run-test

User request:
$ARGUMENTS

Required behavior:
- Do not modify files.
- Do not install dependencies.
- Run only the requested or narrowly implied test/typecheck/build command.
- If no exact command is given, propose the narrowest reasonable command before running it.
- Return the command, result, important output, failure classification, likely cause, and next step.
