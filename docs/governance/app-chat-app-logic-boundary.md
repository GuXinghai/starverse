# AppChatApp Logic Boundary

## Current State

- [src/ui-app/app/appChatApp.logic.ts](src/ui-app/app/appChatApp.logic.ts) is a high-density app-layer orchestration module (about 6.7k lines) coordinating conversation/project/session flow, draft attachments, send preflight, streaming lifecycle, and UI-derived state.
- The file currently mixes orchestration with several rule-like helper clusters, which increases onboarding and regression risk.
- This document is a containment guardrail for the current phase. It is not a refactor spec.

## Allowed Responsibilities (App-Level)

- Compose and sequence user events across existing clients/services.
- Own UI-scoped refs/computed/watch/timers for screen behavior.
- Bridge view events from [src/ui-app/AppChatApp.vue](src/ui-app/AppChatApp.vue) and [src/ui-app/components/ChatAppComposer.vue](src/ui-app/components/ChatAppComposer.vue).
- Coordinate send pipeline entry: context build, preflight call, OpenRouter preparation call, stream session start.
- Aggregate read models for template consumption.

## Responsibilities To Stop Adding Here

- New attachment compatibility rules or rule matrix expansion.
- New send-plan policy rules (status folding, partial-send policy, provider-specific send-mode policy).
- New model capability rule evaluation branches.
- New provider-specific request assembly policies.
- New cross-message/history compatibility summarization rules.
- New persistence schema interpretation logic.

## Preferred Migration Targets

- Domain service:
  - send-plan and attachment compatibility policies into infra service/helper layer near [infra/files/sendPlanService.ts](infra/files/sendPlanService.ts).
- Client adapter:
  - bridge invocation normalization in [src/next/files/sendPlanClient.ts](src/next/files/sendPlanClient.ts), [src/next/files/conversationDraftClient.ts](src/next/files/conversationDraftClient.ts), [src/next/openrouter/openRouterSendPreparation.ts](src/next/openrouter/openRouterSendPreparation.ts).
- Pure helper/selectors:
  - summary message normalization and gate decision folding from app logic.
- Dedicated composables:
  - draft attachment panel/view-model assembly and history incompatible navigation state.

## Candidate Split Packages (Planned, Not In This Phase)

1. appChatSendGateComposable
2. appChatDraftAttachmentComposable
3. appChatHistoryAttachmentComposable
4. appChatModelCapabilityComposable
5. appChatSessionOrchestration (last)

## Core Regression Paths

- Model switch -> attachment compatibility and sendability recompute.
- Draft attachment add/remove/settings -> send-plan gate and composer send state.
- History scope change (branch/context) -> incompatible summary and navigation target.
- Send click -> preflight gate -> OpenRouter preparation -> stream lifecycle.

## Test Entry Points

- [src/ui-app/AppChatApp.attachments.test.ts](src/ui-app/AppChatApp.attachments.test.ts)
- [src/ui-app/AppChatApp.send.test.ts](src/ui-app/AppChatApp.send.test.ts)
- [src/ui-app/AppChatApp.test.ts](src/ui-app/AppChatApp.test.ts)
- [src/ui-app/components/ChatAppComposer.attachments.test.ts](src/ui-app/components/ChatAppComposer.attachments.test.ts)
- [src/next/openrouter/openRouterSendPreparation.test.ts](src/next/openrouter/openRouterSendPreparation.test.ts)
- [src/next/openrouter/openRouterSendPlanSerializer.test.ts](src/next/openrouter/openRouterSendPlanSerializer.test.ts)
- [infra/files/sendPlanService.test.ts](infra/files/sendPlanService.test.ts)

## Reviewer Checklist (Lightweight Guardrail)

- Does this change add a new business rule into app logic instead of an existing service/helper/composable?
- Does one function now read/write multiple domain states in a way that is hard to isolate in tests?
- Does this change duplicate an existing sendability or compatibility judgment path?
- Are model switch, send preflight, history incompatible summary, and draft attachment flows all considered?
- Is there an existing lower-layer location that should host the new logic first?

## Why Not Split Now

- Current integration surface is broad and tightly coupled to runtime orchestration.
- Immediate large split would raise behavior-regression probability and review cost.
- Existing tests cover key paths but do not yet fully isolate all rule clusters for safe bulk extraction.

## Preconditions Before Staged Split

- Stabilize and snapshot gate/summary pure helpers with focused tests.
- Add coverage for history incompatible summary/index update edge cases.
- Add focused tests for partial-send decision matrix and duplicate-rule detection.
- Keep API contract names stable during extraction (no public rename in first pass).
