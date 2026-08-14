# Starverse Provider Architecture

Status: active
Document Role: ssot
Last updated: 2026-08-14

版本：v1.0.0
状态：Owner-confirmed architecture SSOT

This directory contains the authoritative governance documents for Starverse multi-provider architecture.

## Current Status (2026-06-18 snapshot; corrected 2026-08-14)

Phase 0–9 fixture foundations remain complete. OpenRouter remains the default production runtime. LocalEndpoint, OpenAI Responses, Google AI Studio, Anthropic Messages, and DeepSeek official now have explicit, default-off, reversible experimental text-only chat paths. They are not production defaults, are mutually exclusive in the current UI flow, and do not activate Generic OpenAI-compatible runtime. Generic remains fixture-only. No secure store, production endpoint/provider registry, RuntimeProviderRegistry, Send Plan RuntimeCapability integration, managed local runtime, or non-OpenRouter production runtime is implemented.

> **2026-08-14 修正**: 本段为 2026-06-18 状态快照，其中 "no secure store / no production endpoint/provider registry / no non-OpenRouter production runtime" 已不再成立。当前源码已实现：Electron safeStorage 凭据存储（`electron/credentials/openAICompatibleCredentialV2Service.ts`、`epoch2RuntimeCredentialService.ts`、`epoch2SafeStorageCredentialValidator.ts`）、目录权威注册服务（`electron/services/activeCatalogModelAuthorityV2Service.ts`、`openAICompatibleCatalogV2Service.ts`）、Generation V2 OpenAI-compatible 运行时（`src/next/generation-v2/`、`electron/services/openAIChatCompatibleGenerationV2Coordinator.ts`、`electron/ipc/generationV2CredentialSettingsIpc.ts`）及多 provider native history V2 repos（`infra/db/repo/*NativeHistoryV2Repo.ts`）。具体能力边界以 [CURRENT_SYSTEM_ARCHITECTURE.md](../CURRENT_SYSTEM_ARCHITECTURE.md) 与当前源码为准；本文其余部分（contract / 目标架构 / 演进路径）仍为 provider 架构治理基线。

## Document Order

1. [STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md](STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md)
   Contract, terminology, invariants, prohibition rules, legacy path policy.
2. [STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md](STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md)
   Target module structure, data flow, provider types, capability model, endpoint/local model strategy.
3. [STARVERSE_PROVIDER_EVOLUTION_PATH.md](STARVERSE_PROVIDER_EVOLUTION_PATH.md)
   Phase gates, legacy removal schedule, Agent working boundary, validation expectations.

## Decision And Phase Packages

- [PROVIDER_C6_LOCAL_ENDPOINT_INVESTIGATION.md](PROVIDER_C6_LOCAL_ENDPOINT_INVESTIGATION.md)
  C6 investigation plus implementation checkpoints for external LocalEndpoint support. LocalEndpoint has an explicit loopback-only experimental text chat path; no Generic live activation, managed local runtime, remote custom endpoint, enterprise gateway, or production endpoint/provider registry implementation.
- [PROVIDER_EXPERIMENTAL_TEXT_CHAT_CLOSEOUT.md](PROVIDER_EXPERIMENTAL_TEXT_CHAT_CLOSEOUT.md)
  Closeout for the current OpenRouter production plus LocalEndpoint/OpenAI Responses/Google AI Studio/Anthropic Messages/DeepSeek official experimental text-chat phase, including smoke evidence, known debt, graduation blockers, and next options.

## Usage Rule For Future Agents

- Read the contract first.
- Do not enter implementation unless the Owner explicitly starts a phase.
- Do not create placeholder abstractions.
- Do not add provider runtime code from this directory task.
- Do not treat legacy provider paths as future architecture assets.
