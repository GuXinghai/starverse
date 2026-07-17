# Generation Compiler V2 — Goal 2 Execution Charter

## Authority and purpose

This charter governs how Goal 2 is executed. It supplements, and does not reduce
or replace, the final plan, TP1–TP8, the traceability matrix, AC-01…AC-42, Owner
decisions, provider contracts, security boundaries, or the Goal 2 stopping
conditions.

The execution correction is:

> Deliver correctness through complete, user-reachable production verticals.
> A foundation component counts as progress only when the current vertical
> consumes it. Long-lived dormant modules, micro-commits, repeated full-suite
> verification, document volume, test counts, commit counts, and lines changed
> are not substitutes for production completion.

No item in this charter authorizes scope reduction, silent fallback, temporary
compatibility, weakened validation, speculative provider semantics, or an early
completion claim.

## Unit of delivery

The primary unit of delivery is one complete provider/action production
vertical:

```text
UI or command
→ current config or target snapshot
→ capability and preflight
→ atomic graph + operation + snapshot commit
→ provider compiler + exhaustive ledger
→ immutable prepared request
→ request persistence
→ credential-bound transport
→ provider-native stream decoder
→ partial-content persistence
→ completed / failed / cancelled / interrupted terminal
→ provider-native continuation artifact
→ chosen / head / selector / error UI projection
→ exact Raw Request Data correlation
→ restart, replay and concurrency verification
```

A provider or action is not complete while any required link remains dormant,
test-only, disconnected from the production data plane, or dependent on a
legacy path.

## Execution rules

### 1. Vertical before horizontal

Finish the current DeepSeek production vertical first and use it to stabilize
the shared command, compiler, request, runner, terminal, IPC and UI seams.
Migrate later providers one complete vertical at a time. Do not spread new
unconsumed layers across several providers.

### 2. Foundations require an immediate consumer

A new schema, authority, repository, codec, helper or abstraction is allowed
only when it is:

- directly consumed by the current vertical; or
- a proven blocker whose consumer is completed in the same milestone.

If a prerequisite cannot be consumed in the same milestone, record the exact
blocker and stop expanding that prerequisite. Do not build a chain of further
dormant prerequisites around it.

Destructive reset and startup cutover may remain deliberately inactive until
the replacement data plane is complete; that safety isolation is not a reason
to leave ordinary generation components without a runner, IPC or UI consumer.

### 3. Abstract only proven common semantics

Provider-native semantics stay inside typed provider contracts. Extract a
provider-neutral primitive only after at least two complete verticals prove the
same stable invariant. Do not introduce a generic wire path, unknown patch,
fallback or compatibility adapter to force unlike provider semantics together.

### 4. Reuse or delete competing facts

Before adding a fact source, verify that the required fact is not already owned
by the V2 graph, config, snapshot, capability, operation, request, continuation
or credential authority. Reuse the existing authority or delete/replace the
incorrect one. Do not add translators between two competing V2 facts.

### 5. Keep coherent milestone scope

A milestone should normally deliver one observable vertical advance, such as:

- a committed request becoming an exact persisted prepared request;
- an exact request reaching transport and a terminal state;
- one generation action becoming production-reachable;
- one provider completing its full production path;
- epoch-2 replacing the legacy startup/data plane;
- a legacy path being deleted after parity.

Avoid one-helper milestones and paired implementation/document-only commits.
Implementation, focused tests and the concise ledger update should normally be
committed together as one coherent milestone.

### 6. Validate in proportion to the milestone

During internal implementation, run focused tests and the narrow static checks
needed to catch local regressions. Run the full selected V2 regression, all
static gates and independent P0/P1 review at these boundaries:

- the first complete production vertical;
- completion of each provider/protocol vertical;
- destructive reset or startup activation;
- legacy-path deletion;
- final AC-01…AC-42 acceptance.

Run an earlier full gate when a change affects shared schema, transaction,
credential, deletion, package identity or security boundaries. Do not run the
entire acceptance matrix after every internal helper solely to create progress
evidence.

### 7. Withdraw invalid designs promptly

If review or testing proves that a design lacks authority, atomicity, exact
provider semantics or safe ownership, remove the invalid prototype. Do not
surround it with patches, compatibility layers or additional abstractions.
Return immediately to the shortest path that advances the current production
vertical.

### 8. Measure production distance honestly

Each milestone update in `goal2-progress.md` must state concisely:

- the user-reachable behavior newly completed, if any;
- the exact production call-chain segment now connected;
- components that remain dormant or test-only;
- the shortest current production-blocker list;
- the next step that directly removes one of those blockers;
- focused or full validation actually run.

Do not use code volume, test volume, commit count, number of authorities, or
number of documented components as a completion percentage.

## Required implementation order

Dependency evidence may reorder provider verticals, but it may not restore the
old horizontal execution pattern. The default order is:

1. Stabilize the current DeepSeek native-history, ledger and prepared-request
   worktree and persist the exact first request.
2. Complete DeepSeek initial send through transport, native stream decoding,
   terminal persistence, continuation artifact, Raw Request Data, IPC and UI.
3. Complete continuation, regenerate, retry-as-new, retry-replace and edit
   resend through the same command/runner contract.
4. Complete the remaining DeepSeek tools, attachments and native continuation
   requirements.
5. Complete each remaining provider/protocol as a full vertical: OpenAI
   Responses, Anthropic, Gemini GenerateContent, Gemini Interactions,
   OpenRouter Chat, OpenRouter Images, LM Studio and Generic/local.
6. Complete shared capability UI, selectors, terminal/error diagnostics and
   deletion interactions.
7. Activate epoch-2 startup and the V2 data plane only when it can replace the
   legacy data plane atomically.
8. Delete legacy profiles, mappers, snapshots, workspaces, state owners,
   fallbacks and data entry points.
9. Run full automated, Electron/Playwright, real-provider and AC-01…AC-42
   acceptance and close all Critical/High findings.

## Non-negotiable quality boundaries

Throughput improvements must never weaken:

- provider-native typed semantics and official evidence;
- encode-or-reject treatment of every explicit parameter;
- snapshot isolation from current UI/session state;
- operation idempotency and stale-target rejection;
- atomic chosen/head/hide transitions;
- terminal persistence without automatic branch rollback;
- exact prepared-body identity across ledger, transport and Raw Debug;
- credential/secret exclusion from snapshots and ledgers;
- safeStorage, epoch ownership, managed-root and deletion containment;
- native continuation fidelity across restart, branch and retry;
- no fallback, compatibility layer, dual read/write or temporary legacy bridge;
- real smoke coverage for every enabled provider/protocol;
- the original Goal 2 stopping conditions.

## Completion rule

This charter changes execution order and evidence cadence, not the definition of
done. Goal 2 remains incomplete until the production data plane is entirely V2,
all required provider/action verticals are complete, legacy paths are deleted,
all required tests and real smokes pass, AC-01…AC-42 are directly evidenced,
the worktree and documentation are clean, and unresolved Critical/High findings
are zero.
