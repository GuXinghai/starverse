# Starverse Provider Architecture

版本：v1.0.0
状态：Owner-confirmed architecture SSOT

This directory contains the authoritative governance documents for Starverse multi-provider architecture.

## Document Order

1. [STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md](STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md)
   Contract, terminology, invariants, prohibition rules, legacy path policy.
2. [STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md](STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md)
   Target module structure, data flow, provider types, capability model, endpoint/local model strategy.
3. [STARVERSE_PROVIDER_EVOLUTION_PATH.md](STARVERSE_PROVIDER_EVOLUTION_PATH.md)
   Phase gates, legacy removal schedule, Agent working boundary, validation expectations.

## Usage Rule For Future Agents

- Read the contract first.
- Do not enter implementation unless the Owner explicitly starts a phase.
- Do not create placeholder abstractions.
- Do not add provider runtime code from this directory task.
- Do not treat legacy provider paths as future architecture assets.
