# Generation V2 module ownership and boundary repair

Status: active
Document Role: maintenance, architecture-decision, verification-plan
Last updated: 2026-10-13
Repair result: completed within the automated verification scope below

This repair starts from 453 Electron-to-next import diagnostics: providers 171,
domain 81, capability 62, model facts 46, compiler 41, contracts 30, capability
rules 15, renderer 1, and other next modules 6. These are import sites, not
independent product failures. Existing dependency and test repairs are retained.

## Category assessment

Risk below is migration risk, not a claim that each import is an exploitable bug.

| Category | Initial errors | Risk and constraint | Actual owner |
| --- | ---: | --- | --- |
| Compiler | 41 | High: prepared bytes, private brands, proof coverage and integrity must stay together | `src/core/generation-v2/compiler/`; Node context checks in `infra/generation-v2/` |
| Domain | 81 | High: one identity issuer and immutable decoded snapshots | `src/core/generation-v2/domain/` |
| Capability | 62 | High: semantic domain and expected revision must not widen | `src/core/generation-v2/capability/` |
| Model facts | 46 | High: source precedence, provenance and incomplete/conflicting facts | `src/core/generation-v2/model-facts/` |
| Contracts | 30 | High: reviewed protocol definitions and closed operations | `src/core/generation-v2/contracts/` |
| Capability rules | 15 | High: rule ownership and release integrity | `src/core/generation-v2/capability-rules/` |
| Providers | 171 | High: wire parsing, continuation evidence, digests and image byte limits | `src/core/generation-v2/providers/` |
| Renderer | 1 | Medium: a cross-layer integration test was located in the backend tree | `tests/integration/generationV2DfcService.test.ts` |
| Other next modules | 6 | Mixed: public DTOs need a neutral owner; native parsers and catalog authority need actual core ownership | `src/shared/provider/`, `src/core/provider/`, `src/core/multimodal/`, `src/core/model-catalog/` |

## Ownership decision

| Responsibility | Owner | Dependency rule |
| --- | --- | --- |
| Canonical JSON, SHA-256 and serializable public transport/error DTOs | `src/shared/` | No dependency on renderer state or private authority brands |
| Deterministic Generation V2 identities, domain validation, capability/facts/rules, provider protocols and prepared-request kernel objects | `src/core/generation-v2/` | No next, UI, Electron, infra or Node builtin imports |
| Legacy native-content parsing, content sanitization and provider catalog authority registry | `src/core/provider/`, `src/core/multimodal/`, `src/core/model-catalog/` | Same platform-neutral dependency rule; public DTOs stay in shared |
| Node expected-revision context and compiler-side context assertion | `infra/generation-v2/` | One existing AsyncLocalStorage instance; context assertion remains before semantic intent validation |
| Database connection/transaction ownership, persisted request and execution receipts | `infra/db/` | Existing owned-connection authority remains here |
| IPC, credentials, transport, process coordination and debug persistence | `electron/` | Uses the actual core, shared and infra owners |
| Renderer composer clients, state and presentation | `src/next/` | Uses core/public contracts; does not own backend authority |
| Cross-layer DFC integration test | `tests/integration/` | Retains real renderer projection, IPC, DB and prepared-send assertions |

Decoded kernel objects with private brands are not wire DTOs. The same realm
must resolve each brand, private token and WeakMap/WeakSet to one implementation.
Moving a module must not create a second issuer. An old next entry may export
the actual owner for compatibility; the owner must never import that entry back.
Electron imports will point directly at the owner rather than a forwarding facade.

The Node-bound semantic validator moves intact with its expected-revision
context. This does not introduce an optional hook, duplicate the context, or
remove its assertion. SHA substitutions use the existing shared SHA-256 over
exactly the same UTF-8 bytes and concatenation order.

## Batches and acceptance

1. Move immutable prepared-body and ledger ownership. Compare SHA with Node's
   oracle and test shared identity through old and new entry paths. Run scoped
   compiler/debug regressions, typecheck and the existing authority gates.
2. Move closed portable domain, configuration and prepared-request dependency groups.
   Keep private identities intact and verify the affected compiler/domain tests.
3. Extract complete stream, native snapshot and endpoint public contracts. Move
   pure native-content parsing and sanitization implementations to their core owners.
4. Move facts, capability/rules and contract groups; move the intact
   Node context/validator to infra. Retain source priority, provenance, revision
   binding, incomplete-domain behavior, exact request bytes and receipt checks.
   Verify affected units, IPC/coordinator/repository integration and authority gates.
5. Move provider protocols, tools and terminal kernels. Replace Node SHA/Buffer
   operations with equivalent shared byte helpers. Compare against Node oracles
   and test invalid/noncanonical Base64, existing size ceilings and fragmented input.
6. Relocate the complete cross-layer DFC test without replacing its projector or
   reducing its 17 cases and 48 assertion call sites. Verify complete UI/integration
   partitions and application/Storybook builds.
7. Remove the last indirect backend-to-next references: use the existing shared
   runtime provider ID and extract the unchanged OpenRouter category contract.
   Remove obsolete Electron boundary suppressions and run affected regressions.

Dependency cycles may require adjacent portable categories to move together;
category boundaries do not justify leaving core-to-next imports. Static gates
must inspect real implementation paths and include new core roots, with every
original prohibition and assertion retained. Source rule severities, timeouts,
test data and acceptance thresholds remain unchanged.

Implementation and acceptance are recorded per batch in task diagnostics. Static,
automated runtime and build evidence must remain distinct from real-provider,
manual Electron and packaged-release acceptance.

## Automated verification snapshot — 2026-10-13

All seven repair batches passed their regression checks and independent static
review. The 453 original import errors are resolved. Two additional hidden
backend references were also removed, along with 46 obsolete inline boundary
suppressions. Full lint reports 0 errors and the original 862 warnings; no source
rule severity, timeout or test-data threshold was reduced.

| Batch | Regression evidence |
| --- | --- |
| 1: Body and ledger | 6 unit and 16 integration tests; Node SHA oracle, one issuer, forgery rejection and immutable byte copies |
| 2: Domain/config/prepared request | Full unit: 336 files / 2,846 tests; targeted integration: 4 files / 41 tests |
| 3: Public DTOs and native-content kernels | 19 unit and 9 integration tests; complete event and snapshot declarations compared against originals |
| 4: Facts/capability/rules/contracts and Node context | Full unit: 336 files / 2,846 tests; full integration: 184 files / 1,426 passed / 3 existing skipped |
| 5: Provider/tools/terminal kernels | Encoding/image checks: 46 tests; full unit: 337 files / 2,878 tests; full integration: 184 files / 1,426 passed / 3 existing skipped |
| 6: DFC integration test ownership | DFC: 17 tests; full UI: 87 files / 679 tests; full integration: 184 files / 1,426 passed / 3 existing skipped |
| 7: Remaining shared catalog/provider references | Catalog unit: 18 tests; model availability IPC: 6 tests; ModelPicker UI: 35 tests |

Typecheck, the three Generation V2 authority gates, model identity purge, docs
index and diff whitespace checks pass. The boundary policy additionally rejects
11 prohibited import examples and all six prohibited Node globals. The final
application and Storybook builds both pass; their logs are recorded separately
in task diagnostics. This active maintenance document remains the ownership
decision after the repair finishes.

The native runtime target remains Node: `npm run rebuild:node` completed before
database-heavy validation; no ABI mismatch occurred and no test required a
rebuild retry. No Electron smoke ran or retried, and no native artifacts were
committed. The dependency lockfile hash is unchanged by this boundary repair.
