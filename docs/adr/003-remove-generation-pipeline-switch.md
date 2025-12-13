# 003 — Remove generation pipeline switch

## Status
Accepted

## Context
Gate 1 introduced `GenerationFacade` and a feature flag to support Strangler/Branch-by-Abstraction while the next pipeline matured.

At Gate 5 (TC-12), the repository should converge to a single implementation: remove temporary switches and delete the legacy stub to prevent drift and mixed ownership.

## Decision
- Delete the generation pipeline switch implementation (`src/next/config/flags.ts`) and all references.
- Delete the legacy pipeline stub (`src/next/generation/legacyGenerationPipeline.ts`).
- Keep `GenerationFacade` as the single entrypoint, but make it delegate unconditionally to one pipeline implementation.

## Consequences
- No runtime generation routing switch remains for this stage; future changes require ADR and explicit migration steps.
- Gate scripts and unit tests must validate “no switch identifiers remain” instead of validating switchability.

