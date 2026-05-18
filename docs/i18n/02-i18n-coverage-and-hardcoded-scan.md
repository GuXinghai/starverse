# i18n Coverage & Hardcoded Scan

## Coverage Gate: `npm run i18n:check`

Checks locale JSON consistency:

1. **Namespace set** — zh-CN and en-US must have identical namespace files
2. **Key set** — each namespace must have identical keys across locales
3. **Variable params** — `{param}` placeholders must match
4. **Empty strings** — no key may have an empty value
5. **Reserved prefixes** — `common.json` must not contain nested keys like `settings.title`

## Hardcoded Scan: `npm run i18n:scan-hardcoded`

Scans `src/ui-app`, `src/ui-kit`, `electron/ipc`, `electron/windows`, `electron/main.ts` for:

- Chinese characters in user-visible string literals
- Common English UI strings (Save, Cancel, Close, Invalid URL, etc.)
- Vue template text nodes, including static text next to mustache bindings
- Static user-visible HTML attributes (`title`, `aria-label`, `placeholder`, `alt`)

Excludes:
- Test files, locale JSON, docs, snapshots
- Console.log/warn/error calls
- Technical constants, IPC channel names, CSS classes
- Lines matching `scripts/i18n/hardcoded-allowlist.txt`

This scanner is a guardrail. A passing scan means the current heuristics and allowlist did not find new high-signal hardcoded UI text; it is not a guarantee that the full repository has zero hardcoded strings.

## SendPlan Code Map: `npm run i18n:sendplan-map`

Validates `ISSUE_CODE_TO_I18N` mapping in `appChatApp.logic.ts`:

1. Validates the maintained production issue-code list against `infra/files/sendPlanService.ts`
2. Extracts secondary known issue codes from `sendPlanService.test.ts`
3. Verifies each known production/test code is in the mapping unless explicitly documented as non-mapped internal flow
4. Verifies each mapped i18n key exists in locale JSON

The production list is intentionally explicit because SendPlan issue codes are emitted from object literals, helper returns, and derived warning flows. The script also scans production snake-case literals and fails on newly introduced unclassified values. When adding a production issue code in `sendPlanService.ts`, update the list in `scripts/i18n/check-sendplan-code-map.mjs` and map it unless it is explicitly handled outside `ISSUE_CODE_TO_I18N`.

## Current Allowlist (`hardcoded-allowlist.txt`)

Items deferred to future task packs:

- `WebSearchSettingsEditor` / `SamplingParamsSettingsEditor` / `PluginManagementPanel` / `ModelPickerDialog` — complex sub-components
- Enhanced template-scan residuals recorded by file/line pattern for follow-up, including selected chat transcript, attachment, and settings surfaces
- Internal debug strings (`dbBridge unavailable`, `model catalog sync failed`)
- Technical labels (`Model`, `OpenRouter`, `provider.require_parameters`)
- Send mode technical values (`url_ref`, `inline_base64`)
- Error envelope internal fields

## SendPlan Issue Codes

Known mapped production codes are validated from `sendPlanService.ts` by `scripts/i18n/check-sendplan-code-map.mjs`. The table below lists representative mapped codes and historical test coverage anchors; the script output is the source of truth for the current full set.

| Code | i18n Key | Status |
|---|---|---|
| `attachment_parsing_incomplete` | `sendPlan.detectionPending` | Mapped |
| `current_draft_incompatible_with_current_model` | `sendPlan.routeUnavailable` | Mapped |
| `draft_attachment_blocked` | `sendPlan.attachmentBlocked` | Mapped |
| `history_attachment_blocked` | `sendPlan.historyAttachmentExcluded` | Mapped |
| `history_attachment_excluded` | `sendPlan.historyAttachmentExcluded` | Mapped |
| `file_type_detection_required` | `sendPlan.detectionRequired` | Mapped |
| `file_type_detection_failed` | `sendPlan.detectionFailed` | Mapped |
| `file_type_route_blocked` | `sendPlan.attachmentBlocked` | Mapped |
| `incompatible_with_current_model` | `sendPlan.routeUnavailable` | Mapped |
| `conversion_required_before_send` | `sendPlan.conversionRequired` | Mapped |
| `missing_pdf_input_capability` | `sendPlan.pdfNotSupportedByProvider` | Mapped |
| `missing_mixed_input_capability` | `sendPlan.modelDoesNotSupportFiles` | Mapped |
| `unsupported_attachment_payload` | `sendPlan.unsupportedAttachment` | Mapped |
| `pdf_not_supported_by_provider` | `sendPlan.pdfNotSupportedByProvider` | Mapped |
| `deduped_to_current_draft` | — | Internal only |
| `duplicate_history_asset` | — | Internal only |
| `asset_record_missing` | — | Internal only |
| `asset_soft_deleted` | — | Internal only |
| `preview_only_asset_not_sendable` | — | Internal only |
| `stale_derived_asset` | — | Internal only |
| `preview_send_asset_mismatch` | — | Internal only |
| `send_asset_not_ready` | — | Internal only |
