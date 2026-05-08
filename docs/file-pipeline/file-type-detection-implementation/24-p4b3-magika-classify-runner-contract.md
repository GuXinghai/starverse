# P4-B3：Magika Classify Runner Contract + Fake Runtime Tests

Status: **P4-B3 completed**

## 1. 目标

1. 设计并实现 Magika classify runner contract（`magikaClassifyRunner.ts`）。
2. 真实调用走 `externalProcessRunner` 安全底座（P3-A 已建立）。
3. 本轮使用 fake runtime / fixture runtime 测试，不接真实 Magika。
4. 输入边界明确：memory bytes（Uint8Array），10MB 上限。
5. 输出 JSON schema 明确：label、score、modelVersion、可选 diagnostics。
6. 异常场景结构化失败：timeout、output limit、process kill failed、invalid output、runtime error。
7. 不接 `fileTypeDetectionService detectFull` 主路径（延迟到 P4-B4）。

## 2. Classify Runner Contract

### 2.1 输入 (`MagikaClassifyRunnerInput`)

```typescript
type MagikaClassifyRunnerInput = Readonly<{
  inputBytes: Uint8Array       // 文件内容，最大 10MB
  runtimeEntryPath: string     // runtime entry 路径
  modelDirPath: string         // model 目录路径
  configDirPath: string        // config 目录路径
  timeoutMs?: number            // 超时 ms，默认 30000
  maxOutputBytes?: number       // 最大输出字节，默认 1MB
}>
```

### 2.2 输出

**成功** (`MagikaClassifyRunnerSuccess`):
```typescript
{ ok: true, label: string, score: number, modelVersion: string, elapsedMs: number }
```

**失败** (`MagikaClassifyRunnerFailure`):
```typescript
{
  ok: false,
  errorCode: 'input_too_large' | 'timeout' | 'output_limit'
           | 'runtime_error' | 'invalid_output' | 'process_kill_failed',
  detail: string,
  elapsedMs: number
}
```

### 2.3 执行流程

1. 校验 `inputBytes.length <= 10MB`，超限返回 `input_too_large`
2. 写入 bytes 到临时文件（sandbox copy 策略，不传真实用户路径给子进程）
3. `runExternalProcess({ command: 'node', args: [runtimeEntry, --model-dir, --config-dir, --input, tempPath, --output-json] })`
4. 根据 `ExternalProcessRunResult` 映射过程错误（timeout / output_limit / runtime_error / process_kill_failed）
5. 解析 stdout JSON，验证 `label` 和 `score` 字段
6. 清理临时文件
7. 返回结构化结果

### 2.4 Runtime Entry Contract

Fake/real runtime entry 必须接受以下 CLI 参数：
- `--model-dir <path>` — model 目录
- `--config-dir <path>` — config 目录
- `--input <path>` — 输入文件（sandbox copy）
- `--output-json` — 输出 JSON 格式

输出到 stdout 的 JSON 格式：
```json
{
  "label": "json",
  "score": 0.95,
  "modelVersion": "magika-v3"
}
```

## 3. Classify Callback 连接

`magikaManagedPlugin.ts` 新增 `createMagikaClassifyCallback()`:

```typescript
export function createMagikaClassifyCallback(
  descriptor: MagikaManagedPluginDescriptor
): (input: { probe; descriptor }) => Promise<MagikaRuntimeClassifyOutput | null>
```

从 descriptor 解析 `modelDirPath` / `configDirPath`，注入 `runMagikaClassify` 调用。失败返回 `null`。

## 4. 测试覆盖

### `magikaClassifyRunner.test.ts`（11 tests）

| # | 测试 | 验证点 |
|---|------|--------|
| 1 | runs fake runtime and returns classify output | 正常分类流程，label/score/modelVersion 正确 |
| 2 | returns input_too_large when bytes exceed 10MB | 输入上限拒绝 |
| 3 | handles runtime exit non-zero | runtime_error 映射 |
| 4 | handles invalid JSON output | invalid_output 映射 |
| 5 | handles missing label in output | 缺失字段检测 |
| 6 | handles bad score value | score 范围校验 |
| 7 | handles timeout via mock process runner | timeout 映射 |
| 8 | handles output limit via mock process runner | output_limit 映射 |
| 9 | handles process kill failure | process_kill_failed 映射 |
| 10 | sanitizes paths in failure details | 绝对路径脱敏 |
| 11 | classifies with empty input bytes | 空字节通过 fake runtime |

## 5. 文件清单

### 新增
1. `src/next/file-type/magikaClassifyRunner.ts` — classify runner contract + 实现
2. `src/next/file-type/magikaClassifyRunner.test.ts` — 11 个测试
3. `docs/file-pipeline/file-type-detection-implementation/24-p4b3-magika-classify-runner-contract.md`

### 修改
4. `src/next/file-type/magikaManagedPlugin.ts` — 新增 `createMagikaClassifyCallback()`
5. `src/next/file-type/index.ts` — 导出 `magikaClassifyRunner`

## 6. 非目标确认

- [x] 不接真实 Magika / @tensorflow/tfjs
- [x] 不修改 `package.json` / `package-lock.json`
- [x] 不接 `detectFull` 主路径（P4-B4 执行）
- [x] 不传真实用户路径给 renderer 或普通日志
- [x] 输入优先使用 sandbox copy（临时文件）
- [x] 不新增 MagicikaRuntimeKind 枚举

## 7. 下一步

P4-B4：detectFull integration + gated real-runtime test scaffold。
