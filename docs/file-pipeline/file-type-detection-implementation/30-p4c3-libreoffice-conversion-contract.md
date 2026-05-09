# P4-C3：LibreOffice Conversion Contract and Derivative Job Boundary

Status: **implementation completed — contract only**

## 1. 非 P4-C completed

**P4-C3 不是 P4-C completed**。P4-C4~C7 全部待实施。

## 2. 目标

1. 实现 LibreOffice conversion fake runner / contract。
2. 不接真实 LibreOffice；不提交 binary / installer / runtime 包；不联网下载。
3. 支持 contract 层表达：Office → PDF / text / HTML / markdown intermediate。
4. 明确 macro / JS / active content 禁止策略。
5. 明确 derivative job boundary（contract-level，不修改 `derivativeJobService.ts`）。
6. fake runner 不直接写 DB、不直接更新 UI。
7. `derivativeJobService` reserved branch 保持 `conversion_not_implemented`。

## 3. 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/next/file-type/libreOfficeRunner.ts` | ~260 | LO fake runner contract |
| `src/next/file-type/libreOfficeRunner.test.ts` | ~480 | 23 fake tests |
| `docs/.../30-p4c3-libreoffice-conversion-contract.md` | 本文件 | P4-C3 实施文档 |

## 4. 实现的 Runner Contract

### 4.1 输入

```typescript
type LibreOfficeRunnerInput = {
  inputBytes: Uint8Array
  command: string
  args: readonly string[]
  target: 'pdf' | 'text' | 'html' | 'markdown'
  sourceFormat?: 'docx' | 'odt' | 'xlsx' | 'pptx' | 'rtf' | 'doc'
  macroPolicy: 'deny' | 'warn'
  timeoutMs?: number
  maxOutputBytes?: number
  maxInputBytes?: number
}
```

### 4.2 输出 (discriminated union)

**Success**:
```typescript
type LibreOfficeRunnerSuccess = {
  ok: true
  convertedBytes?: Uint8Array   // base64-decoded binary (PDF)
  convertedText?: string         // text/html/markdown output
  outputMime?: string
  sourceFormat?: string
  warnings?: string[]
  macroBlocked?: boolean
  elapsedMs: number
}
```

**Failure**:
```typescript
type LibreOfficeRunnerFailure = {
  ok: false
  errorCode: LibreOfficeRunnerErrorCode
  detail: string
  elapsedMs: number
}
```

### 4.3 错误码 (9 codes)

| errorCode | 触发条件 |
|-----------|---------|
| `input_too_large` | input bytes > maxInputBytes (默认 50MB) |
| `unsupported_source_format` | sourceFormat 不在 `LO_SOURCE_FORMATS` |
| `unsupported_target_format` | target 不在 `LO_CONVERSIONS` |
| `macro_active_content_blocked` | macroPolicy=deny + macro-capable 格式 |
| `timeout` | process timeout (默认 60s) |
| `output_limit` | stdout 超过 maxOutputBytes |
| `runtime_error` | 非零退出/command not found |
| `invalid_output` | JSON parse 失败 / base64 验证失败 |
| `process_kill_failed` | kill tree 失败 |

## 5. Macro / Active Content 策略

| sourceFormat | macroPolicy | 行为 |
|-------------|-------------|------|
| docx / doc / xlsx / pptx | `deny` | **pre-run block**：`macro_active_content_blocked`（不启动进程） |
| docx / doc / xlsx / pptx | `warn` | 允许运行；如 runtime 检测到 macro，标记 `macroBlocked: true` + `warnings` |
| odt / rtf | any | 不触发 macro 检查（非 macro-capable 格式） |

**关键安全决策**：
- `deny` 在进程启动前完成 block，消耗极小。
- `warn` 允许执行但需 runtime 通过 JSON 输出报告 macro 检测结果。
- 不支持 JS/ActiveX/OLE 自动化（non-goal）。

## 6. 复用基础设施

复用 P4-C2 Tika runner 的 contract pattern：
- `externalProcessRunner` (shell:false, timeout, output cap, kill tree, 路径脱敏)
- `externalProcessPolicy` (conversion mode, 60s/50MB/50MB 硬上限，实际按 runner 默认值覆盖)
- 临时目录隔离 (sandbox copy)、自动清理
- `sanitizeForRunner` 路径脱敏（Windows/Unix 路径替换为 `[redacted-path]`）

## 7. Derivative Job Boundary

- LibreOffice conversion 的 fake runner 是 **contract-only**。
- `derivativeJobService.ts` 未修改。
- `converted_pdf` / `converted_markdown` route 在 P4-C6 通过 engine availability 作为 `requiresJob` candidate 表达。
- 真实 conversion job 执行延期到 P4-D 或后续里程碑。

## 8. 测试覆盖 (23 tests)

| # | 测试 | 类型 |
|---|------|------|
| 1 | returns pdf convertedBytes and mime | PDF 成功 |
| 2 | returns plain text on text conversion | text 成功 |
| 3 | returns html output on html conversion | HTML 成功 |
| 4 | returns markdown output on markdown conversion | markdown 成功 |
| 5 | passes sourceFormat through | source format 透传 |
| 6 | rejects unsupported source format | 非法源格式 |
| 7 | rejects unsupported target format | 非法目标格式 |
| 8 | returns input_too_large when bytes exceed limit | 输入超大 |
| 9 | rejects input exceeding custom maxInputBytes | 自定义输入上限 |
| 10 | handles invalid JSON output | JSON 解析失败 |
| 11 | accepts empty JSON object as valid output | 空 JSON 合法 |
| 12 | handles runtime exit non-zero | 非零退出 |
| 13 | handles timeout via mock process runner | timeout |
| 14 | handles output limit via mock process runner | output cap |
| 15 | blocks macro-capable docx with macroPolicy=deny | macro deny |
| 16 | blocks macro-capable xlsx with macroPolicy=deny | macro deny (xlsx) |
| 17 | allows macro-capable docx with macroPolicy=warn and captures blocked flag | macro warn: detected |
| 18 | allows macro-capable docx with macroPolicy=warn when clean | macro warn: clean |
| 19 | does not block odt (not macro-capable) even with deny | odt non-macro |
| 20 | sanitizes paths in failure details | 路径脱敏 |
| 21 | handles runtime crash | runtime crash |
| 22 | handles invalid base64 convertedBytes | base64 验证失败 |
| 23 | uses command + args array (no shell) for parameter array invocation | 参数数组 |

## 9. 验收

```
npx vitest --run src/next/file-type/libreOfficeRunner.test.ts  → 23/23 pass
npx vitest --run src/next/file-type/externalProcessPolicy.test.ts  → 12/12 pass
npx vitest --run src/next/file-type/externalProcessRunner.test.ts  → no such file
npx tsc --noEmit → 17 pre-existing, 0 new
npm run lint:changed → clean
git diff --check → clean
```

## 10. Non-goals

- 不提交真实 LibreOffice binary / installer
- 不联网下载
- 不实现真实 `converted_pdf` derivative job（仅 contract）
- 不修改 `derivativeJobService.ts`
- 不接 route integration（P4-C6）
- 不支持 JS/ActiveX/OLE 自动化
- 不支持 PDF→Office 反向转换
- 不支持 visio/project 格式
