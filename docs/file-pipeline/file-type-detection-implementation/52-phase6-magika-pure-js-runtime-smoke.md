# 52. Phase 6 Magika Pure JS Runtime Smoke

**Status**: Pure JS Magika runtime smoke passed
**Date**: 2026-05-11
**Phase**: Phase 6 follow-up
**Parent docs**: `51-phase6-user-level-magika-runtime-pilot-closeout.md`, `50-post-p5-user-level-roadmap.md`

Magika pure JS runtime smoke 不代表全项目完成。不代表完整插件系统已完成。

---

## 1. Previous Blocker

| Item | Result |
|------|--------|
| `npm install magika` | Succeeded (125 packages) |
| `@tensorflow/tfjs-node` native binding | `ERR_DLOPEN_FAILED` on Windows/Node.js v22 |
| MagikaNode.create() | Cannot complete without tfjs-node |
| Root cause | Native DLL compatibility (likely missing MSVC runtime) |

Python CLI route intentionally avoided — no Python dependencies introduced.

---

## 2. Pure JS Approach

The Magika npm package v1.0.0 exports two APIs:
- `import { MagikaNode } from "magika/node"` — requires `@tensorflow/tfjs-node` (native binding)
- `import { Magika } from "magika"` — uses `@tensorflow/tfjs` with CPU/WASM backend, loads models via `fetch()`

The pure JS route uses `Magika` (browser class) with `@tensorflow/tfjs` CPU backend in a Node.js child process. Model files are served to the process via a temporary `127.0.0.1` loopback HTTP server with path-traversal protection (rejects paths outside the serve root).

---

## 3. Pure JS Smoke Result

**PASSED** — Magika pure JS runtime correctly classified `package.json`.

| Metric | Value |
|--------|-------|
| tf backend | `cpu` |
| tfjs-node present | No (MODULE_NOT_FOUND) |
| Model version | `standard_v3_3` |
| Sample file | `D:\Starverse\package.json` (5962 bytes) |
| Prediction label | `json` |
| Prediction score | `0.998871` |
| ERR_DLOPEN_FAILED | No |
| Native binding | Not required |

---

## 4. Local Package Structure

```
.starverse-engines/magika/
  manifest.json              # P6-A compatible manifest with SHA-256 integrity hashes
  package.json               # type: "module"
  node_modules/              # magika@1.0.0, @tensorflow/tfjs@4.22.0 (no tfjs-node)
  runtime/
    magika-pure-js-runtime.mjs  # Pure JS runtime entry (--model-dir, --input, --output-json)
  model/standard_v3_3/
    model.json               # ~69 KiB (from google.github.io/magika/models)
    config.min.json           # ~2 KiB
    group1-shard1of1.bin      # ~3 MiB
  config/standard_v3_3/
    config.min.json           # Same as above
```

All files in `.starverse-engines/` and `.external-runtime-work/` are untracked. Nothing committed.

---

## 5. Runtime Entry Design

```
magika-pure-js-runtime.mjs
  → parse --model-dir, --input, --output-json from argv
  → tf.setBackend("cpu"), tf.ready()
  → start 127.0.0.1 HTTP server on model-dir (path-traversal protected)
  → new Magika(); load({ modelURL: "http://127.0.0.1:<port>/model.json", ... })
  → readFile(input)
  → identifyBytes(new Uint8Array(bytes))
  → stdout.write(JSON.stringify({ label, score, modelVersion }))
```

Compatible with existing `runMagikaClassify` / `createMagikaClassifyCallback` infrastructure — same argv interface (`--model-dir`, `--config-dir`, `--input`, `--output-json`).

---

## 6. Code Changes

| File | Change |
|------|--------|
| `src/next/file-type/magikaRuntimeLoader.ts` | Added `'pure_js'` to `MAGIKA_RUNTIME_KINDS` |
| `src/next/file-type/magikaManagedPlugin.ts` | Updated `parseRuntimeKind` to accept `'pure_js'` |
| `src/next/file-type/magikaManagedPlugin.test.ts` | Updated "keeps repository free" test to check git tracking instead of filesystem existence (allows local smoke files on disk while preventing commits) |

No new production dependencies. No new files in tracked source.
No `shell:true`, no downloader, no marketplace, no Python route.

---

## 7. Tests

| Test File | Tests | Result |
|-----------|-------|--------|
| `magikaManagedPlugin.test.ts` | 32 | 32/32 pass |
| `magikaRuntimeLoader.test.ts` | 2 | 2/2 pass |
| `magikaAdapter.test.ts` | 6 | 6/6 pass |
| Full file-type suite | 250 | 250/250 pass |

---

## 8. Scans

| Scan | Result |
|------|--------|
| `git diff --check` | Clean |
| Private key (src/infra/electron) | 0 hits (test-only Ed25519) |
| `shell:true` (src/infra/electron) | 0 hits |
| Console leaks | 0 hits |
| Forbidden claims | 0 hits (all negation guards) |

---

## 9. Next Steps

| Item | Status |
|------|--------|
| Pure JS Magika classify smoke | **Passed** |
| Integrate pure JS runtime into lifecycle flow | Future (register → enable → verify → classify) |
| Real end-to-end managed plugin classify via detectFull | Future (requires full lifecycle handshake) |
| Downloader / installer | Future |
| Marketplace | Future |
| Second engine (Pandoc/P7) | Future |
| tfjs-node native route | Optional (when platform supports it) |

---

## 10. Explicit Non-Goals

- No Python CLI route
- No downloader, git clone, npm install inside Starverse
- No marketplace, no auto-update
- No real model files or node_modules committed
- No production private keys
- Full plugin ecosystem not completed
- Phase 6 not completed

---

## 11. Commit

`feat: add pure js magika runtime smoke path`
