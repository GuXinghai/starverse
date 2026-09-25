# Repository instructions

Use the checked-out repository as the source of truth. Read `AGENTS.md`, the relevant README sections, and current architecture or phase documents before changing code. Preserve documented owner decisions and keep diffs focused.

## Implementation

- Keep Electron's security boundary intact: renderer code uses the documented preload API, and main-process IPC validates inputs.
- Treat provider integrations and capabilities according to current source and product documentation. Do not infer or impose maintainer model preferences.
- Preserve both `en-US` and `zh-CN` product localization. Update locale resources and parity checks when user-facing strings change.
- Do not log credentials, authorization values, session data, or raw personal filesystem paths. Keep generated diagnostics and local inventories in ignored local output directories.
- Avoid unrelated refactors and generated/native build artifacts in commits.

## Validation

Choose checks relevant to the change and report exactly which commands ran. Follow `AGENTS.md` for native-module ABI requirements and repository gates. Do not describe an unrun check as passing.
