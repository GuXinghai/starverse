---
description: Run Starverse P0/P1 risk review on the current diff or specified scope (MiMo-V2.5).
agent: mimo_risk_review
subtask: true
---

Use mimo_risk_review to perform P0/P1 risk analysis on the current Starverse diff or scope.
Command: /mimo-risk-review

User request:
$ARGUMENTS

Focus areas:
- DB migration idempotency and runtime wiring
- Plugin registry persistence semantics
- Signature, sha256, manifest integrity and trusted root enforcement
- Official curated catalog enforcement
- Path log sanitization and full hash leakage prevention
- External runtime and process runner safety boundaries
- Missing tests or grep verification requirements

Required behavior:
- Do not modify files.
- Do not install dependencies.
- Search current diff or specified scope.
- Return PASS or BLOCKED with repo-relative evidence and minimal fix scope.
