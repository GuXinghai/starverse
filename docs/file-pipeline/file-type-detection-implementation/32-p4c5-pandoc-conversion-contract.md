# P4-C5：Pandoc Document Conversion Contract

Status: **implementation completed — contract only**

## 1. 非 P4-C completed

**P4-C5 不是 P4-C completed**。P4-C6~C7 全部待实施。

## 2. 目标

1. 实现 Pandoc fake runner / document conversion contract。
2. 不接真实 Pandoc；不提交 Pandoc binary；不联网下载。
3. 不执行 Lua filters；不加载外部资源。
4. 支持 contract 层表达：document → markdown / plain text / html。
5. 输入格式范围保守：markdown, html, docx, odt, rst, latex。
6. 输出有 size cap。
7. invalid output / timeout / output cap / runtime error 结构化失败。

## 3. 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/next/file-type/pandocRunner.ts` | ~200 | Pandoc fake runner contract |
| `src/next/file-type/pandocRunner.test.ts` | ~370 | 18 fake tests |
| `docs/.../32-p4c5-pandoc-conversion-contract.md` | 本文件 | P4-C5 实施文档 |

## 4. 实现的 Runner Contract

### 4.1 输入

```typescript
type PandocRunnerInput = {
  inputBytes: Uint8Array
  command: string
  args: readonly string[]
  target: 'markdown' | 'plain' | 'html'
  sourceFormat?: 'markdown' | 'html' | 'docx' | 'odt' | 'rst' | 'latex'
  timeoutMs?: number     // defaults to 30s
  maxOutputBytes?: number // defaults to 10MB
  maxInputBytes?: number  // defaults to 50MB
}
```

### 4.2 输出 (discriminated union)

**Success**:
```typescript
type PandocRunnerSuccess = {
  ok: true
  convertedText: string
  outputFormat: string   // 'gfm' | 'plain' | 'html'
  warnings?: string[]
  elapsedMs: number
}
```

**Failure**:
```typescript
type PandocRunnerFailure = {
  ok: false
  errorCode: PandocRunnerErrorCode  // 10 codes
  detail: string
  elapsedMs: number
}
```

### 4.3 错误码 (10 codes)

| errorCode | 触发条件 |
|-----------|---------|
| `input_too_large` | input bytes > maxInputBytes (默认 50MB) |
| `output_too_large` | convertedText 长度 > maxOutputBytes (默认 10MB) |
| `unsupported_source_format` | sourceFormat 不在 `PANDOC_SOURCE_FORMATS` |
| `unsupported_target_format` | target 不在 `PANDOC_TARGETS` |
| `lua_filter_denied` | runtime 输出指示 Lua filter 被拒绝 |
| `timeout` | process timeout (默认 30s) |
| `output_limit` | stdout 超限导致截断 |
| `runtime_error` | 非零退出/command not found |
| `invalid_output` | JSON parse 失败/非 object/空文本 |
| `process_kill_failed` | kill tree 失败 |

## 5. 安全策略

| 限制 | 策略 |
|------|------|
| Lua filters | denied — `luaFilterDenied` flag → `lua_filter_denied` error |
| 外部资源加载 | 不加载（沙箱隔离，temp 目录） |
| 输出大小 | post-parse 检查：`convertedText.length > PANDOC_MAX_OUTPUT_BYTES` → `output_too_large` |
| 路径脱敏 | `sanitizeForRunner` 同步 Windows/Unix 路径 → `[redacted-path]` |
| shell | false（参数数组调用）|

## 6. 复用基础设施

- `externalProcessRunner` (shell:false, timeout, output cap, kill tree, 路径脱敏)
- `externalProcessPolicy` (conversion mode, 30s/50MB/10MB)
- 临时目录隔离 (sandbox copy)、自动清理

## 7. 测试覆盖 (18 tests)

| # | 测试 | 类型 |
|---|------|------|
| 1 | returns markdown output on success | markdown 成功 |
| 2 | returns plain text output on success | plain text 成功 |
| 3 | returns html output on success | html 成功 |
| 4 | rejects unsupported source format | 非法源格式 |
| 5 | rejects unsupported target format | 非法目标格式 |
| 6 | returns input_too_large | 输入超大 |
| 7 | rejects output that exceeds max bytes | 输出超大 |
| 8 | handles invalid JSON output | JSON 解析失败 |
| 9 | handles empty converted text | 空文本 |
| 10 | handles non-object JSON output | 非 object |
| 11 | handles runtime exit non-zero | 非零退出 |
| 12 | handles timeout via mock | timeout |
| 13 | handles output limit via mock | output cap |
| 14 | blocks lua filter execution | Lua filter 拒绝 |
| 15 | sanitizes paths in failure details | 路径脱敏 |
| 16 | handles runtime crash | crash |
| 17 | uses command+args array (no shell) | 参数数组 |
| 18 | rejects input exceeding custom maxInputBytes | 自定义上限 |

## 8. 验收

```
npx vitest --run src/next/file-type/pandocRunner.test.ts  → 18/18 pass
npx vitest --run src/next/file-type/externalProcessPolicy.test.ts  → 12/12 pass
npx tsc --noEmit → 17 pre-existing, 0 new
npm run lint:changed → clean
git diff --check → clean
```

## 9. Non-goals

- 不提交真实 Pandoc binary
- 不联网下载
- 不执行 Lua filters
- 不加载外部资源
- 不支持 PDF 输出（依赖 LaTeX）
- 不支持 PowerPoint / 电子表格格式
- 不实现真实格式互转
- 不接 route integration（P4-C6）
