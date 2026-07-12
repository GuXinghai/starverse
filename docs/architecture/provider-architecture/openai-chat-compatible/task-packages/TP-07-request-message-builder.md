# TP-07 — Chat Completions Request and Message Builder

Status: `complete`

Completion evidence: 10 focused files / 80 tests passed, with `tsc`, `vue-tsc`, network-egress gate and `git diff --check` green. The builder remains production-unreachable until TP-15.

## Goal

Implement a pure, fail-before-fetch Chat Completions request pipeline covering standard messages, content parts, tools, structured parameters, request reasoning mappings, static profile defaults and arbitrary safe `extraBody` under path-aware ownership rules.

## Dependencies and prerequisite state

- TP-02, TP-03 and TP-04 complete.
- Immutable route and request profile version available.
- No transport call from this package.

## Production files and deletion scope

Create request modules under `src/shared/provider/openai-chat-compatible/request/`:

- canonical message/content/tool types;
- field-state resolver;
- request field mapping DSL/evaluator;
- ownership registry;
- `extraBody` merger/validator;
- serializer and safe diagnostics.

Integrate provider-neutral multimodal content blocks only through an explicit compatible mapping. Do not restore deleted Generic request builder or use OpenRouter/DeepSeek builders.

The completed scope also extends the existing immutable request-profile and mapping schemas, provider-create command/IPC transaction, profile repository bundle reads and preload DTO typing. No legacy file was restored or deleted by this package.

## Schema, config and data impact

- Request building reads a pinned request profile/mapping bundle, stores no secrets and performs no DB writes.
- TP-07 extends the existing fresh request-profile/mapping configuration and atomically creates profile → mappings → endpoint; an endpoint reference seals that mapping bundle. It adds no table and performs no reset.
- Request diagnostics record field names/ownership/provenance, never content or secret values.
- Route provenance remains out of the wire body.

## Core invariants

- Fixed order: standard builder → structured mappings → `extraBody` → ownership protection → JSON/type/security validation → serialized result.
- `unset`, `explicit` and `profile_default` remain distinguishable.
- No configured field is silently dropped.
- Core/message/tool/provenance fields cannot be overridden.
- Mapping/extraBody conflicts include exact path, ancestor and descendant collisions.
- Request reasoning controls never derive from response mappings.
- Only JSON data and restricted object paths are accepted; no prototypes/scripts/functions/regex.
- Tool execution is not performed; TP-09 owns observe-only response contract.

## Implementation steps

1. Define roles `system|developer|user|assistant|tool` and string/content-part contracts.
2. Map text, bounded HTTPS image URLs and PNG/JPEG data URLs; reject unsupported file/audio parts explicitly.
3. Build `model`, `messages`, `stream`, tools/tool choice/parallel tool calls from route/session data.
4. Resolve response_format/JSON schema, stream_options, n, token limits, stop, temperature, top_p, penalties, seed, user and metadata with three-state provenance.
5. Implement structured request reasoning mappings and `omitWhenUnset`.
6. Implement complete field ownership registry and safe `extraBody` merge.
7. Enforce depth/key/byte/type/prototype limits and deterministic JSON serialization.
8. Validate `n`; support multiple choices as route choice candidates, never choice-0 truncation.
9. Emit safe request diagnostics and provider-neutral validation errors.

## Tests and gates

- Full standard parameter matrix including unset/explicit/default and zero/false/empty-array edge cases.
- All roles/content parts/image URL/data URL tests.
- Tools/tool_choice/parallel ownership tests.
- response_format/JSON schema/stream_options/n/token limit conflict tests.
- request reasoning mapping DSL/value/omit/error tests.
- extraBody exact/parent/child conflict and prototype pollution tests.
- oversized/deep/non-JSON/cyclic input tests.
- safe serialization/log diagnostics tests.
- `n>1` and unexpected multi-choice preparation tests.
- `npx tsc --noEmit --pretty false`
- `git diff --check`

## Acceptance criteria

- Every frozen request field has a deterministic owner and test.
- All invalid/unsupported/conflicting configured fields fail before a mocked transport invocation.
- No secret/provenance leaks into the body or diagnostics.
- Request and response reasoning configurations are structurally separate.
- The builder is pure and production-unreachable until TP-15.

## Prohibitions

- No silent parameter removal.
- No arbitrary merge after validation.
- No provider/model/URL-specific hardcoding.
- No Generic/OpenRouter builder delegation.
- No transport or DB side effect from request-builder invocation.

## Suggested commit

`feat(provider): build safe compatible chat requests`

## Stable contract for the next package

TP-09/TP-15 receive a validated serialized request plus safe ownership diagnostics, pinned to an existing route and request profile.
