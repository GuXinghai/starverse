# P4-C2：Tika fake runner / contract implementation

Status: **P4-C2 implementation completed**

## 1. P4-C2 阶段定位

P4-C2 在 P4-C1 manifest/process-policy/conversion-mode 基础上，实现 Tika external engine runner 的 type-level contract 和 fake runner，但不接入真实 Tika JAR 或路由。

**P4-C2 不是 P4-C completed**。P4-C3~C7 全部待实施。

## 2. 设计原则

- 复用 `runExternalProcess` 基础设施（shell:false, 参数数组, conversion mode, timeout/stdout/stderr caps）
- 复用 P4-C1 `metadataAllowlist` / `supportedOutputRoutes` 类型体系
- 遵循 `magikaClassifyRunner` contract 模式（discriminated union result, dependency injection）
- 不引入新依赖
- 不接真实 Tika JAR

## 3. Tika runner contract

### 3.1 输入类型

```ts
type TikaRunnerInput = Readonly<{
  inputBytes: Uint8Array
  command: string          // 'java' for real, 'node'/process.execPath for fake
  args: readonly string[]  // runner appends temp input path at end
  mode: TikaMode           // 'detect' | 'extract_text' | 'metadata' | 'combined'
  metadataAllowlist: readonly string[] | null  // null = passthrough all
  timeoutMs?: number       // default 60000ms (conversion mode)
  maxOutputBytes?: number  // default 10MiB
  maxInputBytes?: number   // default 10MiB
}>
```

### 3.2 输出类型

```ts
type TikaRunnerSuccess = Readonly<{
  ok: true
  detectedFormatId?: string
  detectedMime?: string
  extractedText?: string
  metadata?: Record<string, string>
  warnings?: string[]
  elapsedMs: number
}>

type TikaRunnerFailure = Readonly<{
  ok: false
  errorCode: TikaRunnerErrorCode
  detail: string
  elapsedMs: number
}>

type TikaRunnerErrorCode =
  | 'input_too_large'
  | 'timeout'
  | 'output_limit'
  | 'runtime_error'
  | 'invalid_output'
  | 'process_kill_failed'
```

### 3.3 Tika modes

| Mode | Expected output fields | Real Tika flags |
|------|----------------------|-----------------|
| `detect` | `detectedFormatId`, `detectedMime` | `--detect` |
| `extract_text` | `extractedText` | `--text` |
| `metadata` | `metadata` | `--metadata --json` |
| `combined` | all fields | `--json` |

## 4. Tika JSON output schema

Tika JSON 输出 schema（与真实 Tika Server `/rmeta` 输出兼容的简化形式）：

```json
{
  "detectedFormatId": "pdf",
  "detectedMime": "application/pdf",
  "extractedText": "Hello world content",
  "metadata": {
    "Content-Type": "application/pdf",
    "Author": "Alice",
    "X-Custom": "secret"
  },
  "warnings": ["truncated"]
}
```

所有字段均为 optional。空对象 `{}` 为合法输出。

## 5. Metadata allowlist 过滤逻辑

- `metadataAllowlist: null` → 返回所有 metadata 字段（passthrough）
- `metadataAllowlist: ['Content-Type', 'Author']` → 仅返回匹配字段
- `metadataAllowlist: []` → 返回 `undefined` metadata（全部过滤）
- `metadataAllowlist: ['NonExistent']` → 返回 `undefined` metadata（无匹配）

过滤在 `parseTikaOutput` 中执行，通过 `parseMetadata(raw, allowlist)` 函数。

## 6. 结构化错误处理

| 错误场景 | errorCode | 触发条件 |
|---------|-----------|---------|
| 输入过大 | `input_too_large` | `inputBytes.length > maxInputBytes` |
| 超时 | `timeout` | `result.timedOut` 或 `errorCode === 'process_timeout'` |
| 输出超限 | `output_limit` | `result.outputLimited` 或 `errorCode === 'output_limit_exceeded'` |
| 进程终止失败 | `process_kill_failed` | `result.errorCode === 'process_kill_failed'` |
| 命令不可执行 | `runtime_error` | `errorCode === 'command_not_found'` 或 `'spawn_failed'` |
| 非零退出 | `runtime_error` | `exitCode !== 0` |
| 无效 JSON | `invalid_output` | `JSON.parse` 失败 或 非 object 输出 |

## 7. 复用关系

```
tikaRunner.ts
  └── runExternalProcess (externalProcessRunner.ts)
        └── evaluateExternalProcessPolicy (externalProcessPolicy.ts)
              └── mode: 'conversion'
              └── shell: false
              └── caps: maxTimeoutMs(60s) / maxStdoutBytes(10MiB) / maxStderrBytes(1MiB)
```

## 8. Fake runner 测试策略

所有 21 个测试使用两类 fake：

1. **Fake Node.js runtime**：创建临时 `.js` 文件，用 `process.stdout.write(JSON.stringify(...))` 输出 Tika-format JSON
2. **Mock process runner**：`createMockProcessRunner()` 返回预定义的 `ExternalProcessRunResult`

测试覆盖：
- 4 modes × basic output
- `input_too_large` (default + custom max)
- Timeout / output limit / process kill failure (via mock)
- Non-zero exit / bad JSON
- Empty / unrelated output
- Non-object metadata
- Metadata allowlist (null / specific / empty / no-match)
- Path sanitization in error details
- Empty input bytes
- Runtime crash

## 9. 安全保证

- 所有 runner 调用强制 `shell: false`
- 所有 runner 调用强制 `conversion` mode
- Process output 由 `externalProcessRunner` 自动 sanitize（contentToken / fullHash / paths）
- Runner-level `sanitizeForRunner` 提供第二层 path sanitization
- 不暴露真实文件路径到错误信息

## 10. 已明确不做

- 不接真实 Tika JAR
- 不接 route integration（sendPlanService）
- 不接 fileTypeDetectionService evidence 链
- 不新增 `EVIDENCE_SOURCES` 条目
- 不接 UI
- 不接 appChatApp.logic.ts
- 不做 LibreOffice / ffprobe / Pandoc runner

## 11. 修改文件清单

| 文件 | 变更 | 状态 |
|------|------|------|
| `src/next/file-type/tikaRunner.ts` | 新增：Tika runner contract + fake runner 实现 | new |
| `src/next/file-type/tikaRunner.test.ts` | 新增：21 contract tests | new |
| `docs/.../29-p4c2-tika-fake-runner-contract.md` | 新增：本文档 | new |

## 12. 测试结果

```
npx tsc --noEmit  → 17 pre-existing errors, 0 new (no tika files)
npx vitest --run  → 104/104 pass (8 suites including tikaRunner: 21 pass)
```

## 13. 剩余风险

| # | 风险 | 级别 |
|---|------|------|
| 1 | 真实 Tika JAR 输出 schema 可能与 fake 不同 | Follow-up (P4-C3) |
| 2 | `java` 命令在 Windows/macOS/Linux 路径差异 | Follow-up (P4-C3) |
| 3 | Tika 大文件 (>1GB) 内存/超时需求 | Follow-up (P4-D) |

## 14. P4-C2 completion 标志

- [x] Tika runner type contract 定义完成
- [x] Tika output JSON schema 明确
- [x] Metadata allowlist 过滤逻辑完成
- [x] 结构化错误映射完成
- [x] Fake runner 测试覆盖 4 modes + 错误 + allowlist
- [x] 21/21 tests pass
- [x] 0 new TypeScript errors
- [x] 无新依赖、无 JAR、无 binary
- [x] 文档完成

**P4-C2 done。不进入 P4-C3。**
