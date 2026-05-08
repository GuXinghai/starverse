---
description: Ask flash-test-runner to run targeted Starverse verification and summarize the result.
agent: flash-test-runner
subtask: true
---

Use flash-test-runner to run targeted Starverse verification and summarize the result.

User request:
$ARGUMENTS

Required behavior:
- Do not modify files.
- Do not install dependencies.
- Run only the requested or narrowly implied test/typecheck/build command.
- If no exact command is given, propose the narrowest reasonable command before running it.
- Return the command, result, important output, failure classification, likely cause, and next step.
