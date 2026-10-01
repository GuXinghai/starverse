# Starverse

[English](README.md) | [简体中文](README.zh-CN.md)

Starverse is a local-first AI chat desktop application built with Electron, Vue 3, and TypeScript. It stores conversations and settings on your device and connects to cloud model providers, local inference runtimes, and user-configured OpenAI Chat Completions-compatible services.

> Starverse is under active development. Before a production release, the project still needs platform icons, code signing and notarization where applicable, and installation, upgrade, and uninstall validation on each supported platform.

## Features

- Streaming conversations across multiple providers, with provider, model, and routing provenance saved for each response.
- OpenRouter, OpenAI Responses, Google AI Studio, Anthropic Messages, and DeepSeek provider integrations.
- Local runtimes such as LM Studio, Ollama, and explicitly configured loopback endpoints.
- Configurable OpenAI Chat Completions-compatible providers, models, endpoints, request settings, and response parsing.
- Conversation branches, retries, regeneration, edit-and-resend, and new-conversation templates.
- Epoch-2 SQLite persistence and FTS5 full-text search.
- Image and file attachments, send-compatibility checks, derived files, and optional document-conversion runtimes.
- Markdown, syntax highlighting, KaTeX, and sanitized rich-text rendering.
- English and Simplified Chinese interfaces, model catalog and preferences, project management, network proxy settings, and diagnostic tools.

## Providers and runtimes

| Type | Integration | Notes |
| --- | --- | --- |
| OpenRouter | OpenRouter API | Remote model catalog, credential management, and streaming chat |
| OpenAI | Responses API | Official Responses protocol and reasoning parameters |
| Google | Google AI Studio / Gemini API | Official Gemini text and multimodal request path |
| Anthropic | Messages API | Native integration is frozen; see the maintenance status below |
| DeepSeek | DeepSeek API | Official DeepSeek text chat path |
| OpenAI-compatible | Chat Completions-compatible | User-defined provider, endpoint, authentication, model, and parsing settings |
| LM Studio | Local service | Loopback detection, model management, and chat |
| Ollama | Local service | Loopback detection, model loading/unloading, and chat |
| Local endpoint | Local compatible service | Explicitly configured loopback endpoint |

Available models depend on user credentials, local runtimes, and remote catalogs; the repository does not promise a fixed model count. In the table, Google refers to the Google AI Studio provider, while Gemini refers to its API and model family.

### Anthropic native integration status

As of 2026-08-23, native Anthropic Messages support is frozen. The project is not adding features or fixes to this integration and plans to remove the native integration and related references over time.

Users who need Claude models can configure a compatible gateway or another provider that offers access. Starverse does not guarantee the availability or behavior of third-party routes.

## Quick start

This is a source-development setup, not a production installer.

### Requirements

- Node.js >=22.12 and <23
- npm >=10 and <11
- Git

```sh
git clone https://github.com/GuXinghai/starverse.git
cd starverse
npm install
npm run electron:dev
```

npm install runs postinstall, which rebuilds better-sqlite3 for the Node ABI. npm run electron:dev switches to the Electron ABI and starts Vite, the epoch-2 Electron main process, and the database runtime.

The startup commands above currently contain Windows shell syntax (`chcp` and command chaining). macOS and Linux packaging targets are configured, but these startup scripts should not be treated as a validated cross-platform workflow. If a native dependency must compile from source, install the C/C++ build tools required by your platform.

After launch, configure credentials for a cloud provider or connect a running local service, then choose a model to start a conversation. Model availability depends on that service.

To start Vite and Electron without rebuilding the native ABI (requires the Electron ABI to be prepared already):

    npm run dev

## Common commands

| Command | Purpose |
| --- | --- |
| npm run electron:dev | Rebuild the Electron ABI and start the full desktop development environment |
| npm run dev | Start Vite and Electron without rebuilding the native ABI |
| npm run build | Type-check, build the Renderer/native epoch outputs, and run electron-builder |
| npm run test:prepare | Rebuild the Node native ABI before database/native tests when needed |
| npm test | Run only the unit partition; does not rebuild the ABI |
| npm run test:ui | Run the jsdom UI partition |
| npm run test:integration | Run the integration partition |
| npm run lint | Run ESLint |
| npm run test:electron-smoke | Rebuild the Electron ABI, build, and run the Electron shell smoke |
| npm run storybook | Start Storybook |

### better-sqlite3 ABI

Node/Vitest and Electron use different native ABI targets. Only one target is active at a time:

    # Before Node scripts, database tests, or Vitest
    npm run rebuild:node

    # Before manually launching Electron or running an Electron smoke
    npm run rebuild:electron

If you see a NODE_MODULE_VERSION or native-binding error, rebuild for the environment you are about to run and retry the original command. Do not commit node_modules, native binaries, or lockfile changes caused only by a rebuild.

Database/native Node test preparation is manual. npm test remains unit-only and does not switch the ABI implicitly. npm run electron:dev, npm run test:electron-smoke, and npm run test:epoch-database:electron rebuild the Electron ABI internally. For other Electron commands, check the package script and rebuild manually if it does not prepare the ABI.

See the [test strategy](docs/maintenance/test-strategy.md) and package.json for test partitions, focused smoke tests, slow-file rules, and additional validation commands.

## Architecture

    Vue Renderer
      src/ui-app · src/ui-kit · src/next
              │
              │ narrow preload APIs + validated IPC contracts
              ▼
    Electron Main
      epoch-2 bootstrap · credentials · provider transports · catalog sync · file services
              │
              ├── remote providers / loopback runtimes
              │
              └── better-sqlite3 (main-process ownership)
                        ▼
                  epoch-2 SQLite repositories
                  schema manifest · FTS5 · recovery checks

- src/ui-app/: application interface and chat orchestration.
- src/ui-kit/: reusable chat components and rich-text rendering.
- src/next/: conversation, branch, message, provider, model catalog, file, and state domains.
- src/shared/: cross-process contracts, provider-neutral protocols, and shared security logic.
- electron/: windows, preload, IPC, credentials, network transport, and system services.
- infra/db/: SQLite schema, repositories, and data contracts.
- infra/files/: file pipeline, derived tasks, conversion, and managed-runtime lifecycle.

Provider requests, credential resolution, and epoch-2 database connections are owned by the Electron main process. The Renderer uses only the narrow APIs exposed by preload; it cannot read main-process credentials or open SQLite directly.

## Data and security boundaries

By default, application data is stored under the Electron appData root in the Starverse product directory:

- {appData}/Starverse/workspace/epoch-2/starverse.db: conversations, messages, branches, projects, model catalog/preferences, routing, Generation V2 data, and search indexes.
- {appData}/Starverse/config.json: application settings and protected credentials for official providers.
- {appData}/Starverse/workspace/epoch-2/assets, plugins, and runtimes: attachments, plugins, and runtimes managed by the epoch-2 layout.
- {appData}/Starverse/workspace/epoch-2/debug/generation-raw.sqlite: separate raw-request debug storage used only by relevant debug paths.

OpenAI-compatible provider configuration and credential records use dedicated starverse.db tables, separate from official-provider records in config.json. Epoch-2 does not open the old chat.db. During interactive startup, a schema mismatch prompts for confirmation before the app backs up and rebuilds the database; rebuilding does not preserve the existing database contents in the active database.

Key boundaries include:

- The main window enables sandboxing and context isolation and disables Node integration.
- The epoch-2 main database uses controlled journaling, a schema manifest, and integrity checks; search uses FTS5. Raw-request debug storage is separate from the main database.
- Provider credentials are encrypted with Electron safeStorage where available and are resolved only in the main process.
- OpenAI-compatible requests undergo address/DNS checks, redirect limits, proxy routing, and credential-forwarding checks in the main process.
- IPC inputs are validated against explicit contracts and schemas.
- Captured extension fields and diagnostics are bounded and sanitized before persistence or display.

“Local-first” means conversations and settings are stored on the device by default; it does not mean the app is fully offline. When users send messages, sync remote model catalogs, download plugins, or process remote URLs, data is sent to the selected services.

## Files, conversion, and plugins

Files go through type detection, asset persistence, and a send-plan check before entering a conversation. The repository includes image processing, DOCX/XLSX text processing, PDF/HTML/Office derived tasks, and managed engine/plugin installation, validation, recovery, and isolation.

LibreOffice is an optional managed runtime. Conversion availability depends on the format, platform, installed runtime, and local environment; the listed tasks do not imply that every conversion is available on every platform.

## Build and packaging

    npm run build

The current electron-builder configuration includes Windows NSIS x64, macOS DMG, and Linux AppImage targets. A configured target does not mean the project has validated a production installer for that platform. Before release, the project still needs to:

- Configure platform icons, code signing, and macOS notarization.
- Validate installation, upgrade, uninstall, and native dependencies on target operating systems.
- Validate packaging behavior for optional runtimes and file conversion.

## Documentation

- [Documentation status index](docs/DOC_STATUS_INDEX.md)
- [Development guide index](docs/guides/INDEX.md)
- [Current system architecture](docs/architecture/CURRENT_SYSTEM_ARCHITECTURE.md)
- [Provider architecture](docs/architecture/provider-architecture/README.md)
- [OpenAI-compatible rebuild decision and acceptance](docs/architecture/provider-architecture/openai-chat-compatible/REBUILD_MASTER_PLAN.md)
- [File pipeline](docs/file-pipeline/README.md)
- [Maintainer entry point](docs/maintenance/maintainer-entry.md)
- [Local runtime work-directory policy](docs/maintenance/local-runtime-workdirs.md)
- [Changelog](CHANGELOG.md)
- [Agent and task entry points](docs/AGENT_INDEX.md)

Documentation includes active policy, historical records, and phase investigations. Check the [documentation status index](docs/DOC_STATUS_INDEX.md) for authority level, and use current source and tests as the final reference.

## Contributing

1. Create a working branch from the current main.
2. Keep changes focused and do not include generated files or native rebuild outputs.
3. Run the tests, type checks, and gates relevant to the change.
4. Open a pull request with validation commands and known limitations.

Source, documentation, and configuration files use UTF-8. Before submitting, consider running:

    npx tsc --noEmit --pretty false
    npx vue-tsc --noEmit
    npm run lint:changed
    npm run gate:docs
    git diff --check

Before database-heavy tests, switch to the Node ABI. For final manual Electron validation, switch to the Electron ABI; npm run test:electron-smoke performs that switch internally.

## License

[MIT](LICENSE) © Starverse contributors.
