# P5-F1 Strict Verdict-Based Routing Closeout

Status: implemented
Date: 2026-05-17

## Summary

P5-F1 removes the normal SendPlan extension/MIME legacy route and makes production routing depend on `FileTypeVerdict`.

## Production Rules

- `SendPlanService` consumes `FileTypeVerdict`, route candidates, model capabilities, user preferences, and overrides only.
- `SendPlanService` does not call `detectBasic`, `detectFull`, `FileTypeDetectionService`, Magika runtime loaders, or file byte readers.
- Formal sendable attachment routes must trace back to a current `FileTypeVerdict`.
- Missing, pending, or failed detection produces explicit `detection_required`, `detection_pending`, or `detection_failed` plan state.
- `prepareOpenRouter` does not run detection. If the send plan is blocked, it returns blocked diagnostics and serializes no attachment content.

## Detection Pipelines

- Basic detection is the formal core-only pipeline, not a fallback.
- Advanced detection is the formal core + Magika pipeline.
- When Magika is not installed, disabled, unavailable, or failed, the coordinator routes to `detectBasic` and records `detectionLevel=basic`, `engineMode=core_only`, `usedMagika=false`, and the current `magikaState`.
- When Magika is installed, enabled, available, and healthy, the coordinator routes to `detectFull` and records `detectionLevel=advanced`, `engineMode=core_plus_magika`, `usedMagika=true`, `evidenceSources` including `magika`, and `magikaModelVersion`.
- If advanced detection fails during Magika classify/runtime execution, the attempt is persisted as `detection_failed` with `advancedAttempted=true`, `usedMagika=false`, `magikaState=failed` or `unavailable`, and `advancedFailureReason`.

## Existing Verdicts

- A compatible current verdict is reused.
- Existing advanced verdict provenance is not rewritten only because the current Magika runtime is disabled or unavailable.
- Disabling Magika affects future detection routing; it does not delete existing Magika evidence.

## UI

Draft attachment UI now receives detection state from the backend view model and displays:

- pending or required detection
- detection failed
- basic detection
- advanced detection with Magika
- advanced / Magika detection failure

The UI does not infer detection level from extension or MIME.

## Follow-Ups

- `detectFull` remains available for preview, conversion, manual redetect, and background upgrade flows, but production send planning enters detection through the coordinator.
- Parser-validated and external detector provenance fields are reserved for future expansion.
