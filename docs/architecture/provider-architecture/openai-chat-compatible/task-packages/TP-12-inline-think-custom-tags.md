# TP-12 — Mandatory Inline Think State Machine and Custom Tags

Status: `complete`

## Goal

Implement the canonical `<think>` streaming state machine, additive custom tag pairs, code-fence/literal handling, stable multi-segment blocks and deterministic EOF/final reconciliation as the lowest-priority reasoning source.

## Dependencies and prerequisite state

- TP-08, TP-10 and TP-11 complete.
- Source selector can accept an `inline` candidate and enforce custom-only skip/structured-source suppression.
- Ordered content/tool events available.

## Production files and deletion scope

Create:

- `compatibleInlineReasoningParser.ts`
- tag policy validator/matcher;
- code-fence tracker;
- inline segment/block identity helper;
- stream/final reconcile tests and fixtures.

Do not reuse provider/model-specific `<think>` parsing or add a global disable flag.

## Schema, config and data impact

- Persist immutable inline policy versions and route-pinned policy refs.
- Custom tags are static, additive and bounded.
- Persist selected inline source/segment IDs through TP-11/TP-13 contracts; parser itself does not write DB.

## Core invariants

- Canonical `<think>...</think>` support always exists globally.
- custom-only skips inline participation for that response but does not remove the global parser capability.
- Structured source lock prevents inline parsing/output for that choice.
- Start/end tags may span arbitrary chunks and UTF-8 boundaries.
- Tags in Markdown fenced code are literal.
- Unmatched end tags are literal content.
- Incomplete start/end at EOF/abort is conservatively restored to content with diagnostics, not silently hidden as reasoning.
- Nested/repeated starts do not create recursive parsers.
- One deterministic block per completed segment, never per token.
- Content/reasoning/tool events preserve global sequence order.

## Implementation steps

1. Implement states `content`, `possible_start_tag`, `reasoning`, `possible_end_tag`, `code_fence`, `terminal`.
2. Implement bounded pending-prefix buffer using maximum active tag length.
3. Implement additive canonical/custom tag trie or equivalent deterministic matcher.
4. Implement fenced-code tracking for backtick/tilde fences and language lines.
5. Implement literal recovery for mismatches, missing start/end, EOF and abort.
6. Implement nested/repeated/multi-segment diagnostics and stable segment ordinals/block IDs.
7. Emit stable sequence ranges so TP-13 can interleave parser output with tool and content application events.
8. Reconcile final snapshot only with the locked inline source; conflict rather than source switch.
9. Validate custom tag count/length/prefix/conflict/static-string rules.

## Tests and gates

- Start/end split at every character/chunk boundary and UTF-8 splits.
- No start, no end, empty, multiple, nested, repeated and unmatched closing tags.
- EOF/abort/network interruption and final snapshot reconcile.
- Literal tags, Markdown fenced code, XML/HTML examples.
- Custom tag validation/count/length/prefix/canonical preservation.
- reasoning→content and content→reasoning→tool ordering.
- structured-source suppression and custom-only skip.
- stable block IDs and no token-per-block behavior.
- `npx tsc --noEmit --pretty false`
- focused reducer/display contract tests.
- `git diff --check`

## Acceptance criteria

- All Owner inline state cases are deterministic and covered.
- False/incomplete tags restore predictably and produce bounded diagnostics.
- custom-only and structured-source choices do not emit inline reasoning.
- Complete inline segments produce stable, ordered blocks.
- No global parser-off setting exists.
- No production send/UI integration exists.

## Prohibitions

- No regex, fuzzy matching, script or user code.
- No provider/model-specific tags hardcoded outside versioned policy.
- No unbounded pending buffer.
- No token-per-block emission.
- No dynamic source switch at final response.

## Suggested commit

`feat(reasoning): parse compatible inline think streams`

## Stable contract for the next package

TP-13 receives stable reasoning display-block events for structured or inline sources, with one selected source, deterministic segment identity and complete conflict metadata.
