# P4-C4：ffprobe Metadata Probe Contract

Status: **implementation completed — contract only**

## 1. 非 P4-C completed

**P4-C4 不是 P4-C completed**。P4-C5~C7 全部待实施。

## 2. 目标

1. 实现 ffprobe fake runner / metadata probe contract。
2. 不接真实 ffprobe；不提交 ffprobe binary；不联网下载。
3. 不转码、不抽帧、不生成 `selected_frames`。
4. 输出 schema 表达：container format、duration、bitrate、streams、codec、width/height、frameRate、audio channels/sampleRate。
5. metadata 字段采用 allowlist 限定。丢弃未知字段。
6. error detail 脱敏。
7. 不接 route integration。

## 3. 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/next/file-type/ffprobeRunner.ts` | ~315 | ffprobe fake runner contract |
| `src/next/file-type/ffprobeRunner.test.ts` | ~440 | 20 fake tests |
| `docs/.../31-p4c4-ffprobe-metadata-contract.md` | 本文件 | P4-C4 实施文档 |

## 4. 实现的 Runner Contract

### 4.1 输入

```typescript
type FFProbeRunnerInput = {
  inputBytes: Uint8Array
  command: string
  args: readonly string[]
  metadataAllowlist?: readonly string[] | null  // null = block all
  timeoutMs?: number  // defaults to 30s
  maxOutputBytes?: number  // defaults to 1MB
  maxInputBytes?: number  // defaults to 500MB
}
```

### 4.2 输出 (discriminated union)

**Success**:
```typescript
type FFProbeRunnerSuccess = {
  ok: true
  format?: FFProbeFormatEntry
  streams: readonly FFProbeStreamEntry[]
  warnings?: string[]
  elapsedMs: number
}

type FFProbeFormatEntry = {
  formatName: string
  duration?: string
  size?: string
  bitRate?: string
  tags?: Record<string, string>
}

type FFProbeStreamEntry = {
  index: number
  codecName: string
  codecType: 'video' | 'audio' | 'subtitle' | 'data' | 'attachment' | 'unknown'
  width?: number
  height?: number
  frameRate?: string
  sampleRate?: number
  channels?: number
  duration?: string
  bitRate?: string
  tags?: Record<string, string>
}
```

**Failure**:
```typescript
type FFProbeRunnerFailure = {
  ok: false
  errorCode: FFProbeRunnerErrorCode  // 6 codes
  detail: string
  elapsedMs: number
}
```

### 4.3 错误码 (6 codes)

| errorCode | 触发条件 |
|-----------|---------|
| `input_too_large` | input bytes > maxInputBytes (默认 500MB) |
| `timeout` | process timeout (默认 30s) |
| `output_limit` | stdout 超过 maxOutputBytes (默认 1MB) |
| `runtime_error` | 非零退出/command not found |
| `invalid_output` | JSON parse 失败 / 非 object / 无效 stream |
| `process_kill_failed` | kill tree 失败 |

## 5. 字段验证

| 字段 | 验证规则 |
|------|---------|
| `format_name` | 必须为非空 string，否则 format 为 undefined |
| `duration` | 必须为数字字符串 (`/^-?\d+(\.\d+)?$/`) 或 `N/A` |
| `size` | 必须为数字字符串 (`/^\d+$/`) |
| `bit_rate` | 必须为数字字符串 (`/^\d+$/`) |
| `codec_name` | 必须为非空 string，否则 stream 被丢弃 |
| `codec_type` | 必须为 6 种之一，否则默认 `unknown` |
| `width` / `height` | 必须为正数 |
| `r_frame_rate` | 必须匹配 `rate/rate` 格式 (`/^\d+\/\d+$/`) |
| `sample_rate` | 必须为数字字符串 |
| `channels` | 必须为正数 |
| `index` | 必须为 number |

`filename` 字段不会出现在 runner 输出中（不被 parseFormatEntry 暴露）。

## 6. Metadata Allowlist 策略

| allowlist 值 | 行为 |
|-------------|------|
| `null` | block all tags（capability disabled） |
| `[]` (空数组) | block all tags |
| `['title', 'artist']` | 只保留匹配字段 + 值脱敏 |

值脱敏（`sanitizeTagValue`）：
- Windows 路径 → `[redacted-path]`
- Unix 路径 → `[redacted-path]`
- 64+ 字符 hex hash → `[redacted-hash]`

## 7. 复用基础设施

- `externalProcessRunner` (shell:false, timeout, output cap, kill tree, 路径脱敏)
- `externalProcessPolicy` (conversion mode, 30s/500MB/1MB)
- 临时目录隔离 (sandbox copy)、自动清理
- `sanitizeForRunner` 路径脱敏

## 8. 测试覆盖 (20 tests)

| # | 测试 | 类型 |
|---|------|------|
| 1 | returns video format and streams | 视频 probe 成功 |
| 2 | returns audio format and streams | 音频 probe 成功 |
| 3 | returns minimal format with empty streams | 最小输出 |
| 4 | handles missing streams array gracefully | 缺 streams 数组 |
| 5 | drops invalid duration and bad numeric fields | 坏字段过滤 |
| 6 | handles invalid JSON output | JSON 解析失败 |
| 7 | handles non-object JSON output | 非 object 输出 |
| 8 | handles runtime exit non-zero | 非零退出 |
| 9 | returns input_too_large | 输入超大 |
| 10 | handles timeout via mock | timeout |
| 11 | handles output limit via mock | output cap |
| 12 | drops metadata tags not in allowlist | allowlist 过滤 |
| 13 | drops all tags when metadataAllowlist is null | null 阻止 |
| 14 | drops all tags when allowlist is empty | 空数组阻止 |
| 15 | sanitizes paths and hashes in tags | 值脱敏 |
| 16 | does not expose filename in format output | filename 不泄露 |
| 17 | does not perform transcode or frame extraction | 仅 probe |
| 18 | sanitizes paths in failure details | 错误脱敏 |
| 19 | handles runtime crash | crash |
| 20 | processes empty input bytes | 空输入 |

## 9. 验收

```
npx vitest --run src/next/file-type/ffprobeRunner.test.ts  → 20/20 pass
npx vitest --run src/next/file-type/externalProcessPolicy.test.ts  → 12/12 pass
npx tsc --noEmit → 17 pre-existing, 0 new
npm run lint:changed → clean
git diff --check → clean
```

## 10. Non-goals

- 不提交真实 ffprobe/ffmpeg binary
- 不联网下载
- 不实现真实 frame extraction / audio extraction
- 不实现转码
- 不支持 DRM 保护内容
- 不支持硬件加速解码
- 不接 route integration（P4-C6）
