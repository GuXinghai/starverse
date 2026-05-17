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

Excludes:
- Test files, locale JSON, docs, snapshots
- Console.log/warn/error calls
- Technical constants, IPC channel names, CSS classes
- Lines matching `scripts/i18n/hardcoded-allowlist.txt`

## SendPlan Code Map: `npm run i18n:sendplan-map`

Validates `ISSUE_CODE_TO_I18N` mapping in `appChatApp.logic.ts`:

1. Extracts known issue codes from `sendPlanService.test.ts`
2. Verifies each code is in the mapping
3. Verifies each mapped i18n key exists in locale JSON

## Current Allowlist (`hardcoded-allowlist.txt`)

Items deferred to future task packs:

- `WebSearchSettingsEditor` / `SamplingParamsSettingsEditor` / `PluginManagementPanel` / `ModelPickerDialog` — complex sub-components
- Internal debug strings (`dbBridge unavailable`, `model catalog sync failed`)
- Technical labels (`Model`, `OpenRouter`, `provider.require_parameters`)
- Send mode technical values (`url_ref`, `inline_base64`)
- Error envelope internal fields

## SendPlan Issue Codes

Known codes (from `sendPlanService.test.ts`):

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
