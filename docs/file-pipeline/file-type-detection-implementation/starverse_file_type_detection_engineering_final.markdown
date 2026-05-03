# Starverse 文件类型识别体系工程化实施文档

版本：v1.2 定稿  
状态：可进入工程拆分、任务排期与实现评审  
适用范围：Starverse 文件上传、附件预览、格式转换、发送计划、模型兼容性判断、诊断面板、日志与测试体系

---

## 0. 网络核验结论

本方案经公开资料再次核对后，结论保持不变：Starverse 应采用内置轻量识别为主、外部重型引擎为插件、用户外部引擎为显式覆盖的三层体系；识别结果必须以 evidence / verdict / policy / send plan 分层表达，不能由 UI、转换模块或发送模块分别自行判断。

核验后需要固化的关键调整如下：

1. Magika 适合作为低延迟、高准确度的主分类器之一，但其模型输出空间会随模型版本变化，因此 Starverse 必须固定 `magikaModelVersion`，并通过 `taxonomyMapVersion` 把 Magika label 映射到内部 `FileFormatId`，不得让模型 label 直接污染内部枚举。参考资料：Magika 官方说明将其定位为基于深度学习的快速文件类型检测工具，并说明新模型通常扩展支持的内容类型集合。[1][2]
2. Apache Tika 的官方检测链包括 magic、文件名、声明内容类型和容器感知检测；其中容器感知检测可能需要读取完整文件或通过 `TikaInputStream` 检查容器。因此 Tika 不应进入 Starverse 热路径，只应作为插件或深检路径。[3]
3. Freedesktop Shared MIME-info 规范确认 MIME 类型通常由文件名或内容推断，且为了互操作共享数据库；因此 MIME / extension 只能作为互操作与弱证据，不能单独生成 high 以上置信度结论。[4]
4. Electron 官方安全清单强调 renderer 隔离、sandbox、IPC sender 校验、限制 `file://` 和不要向不可信内容暴露 Electron API；这支持 Starverse 当前的 FileAccessRef、main process 授权访问、renderer 不持有真实路径的边界。[5]
5. Node.js 文档说明 `exec()` 会经 shell 处理命令字符串，而 `execFile()` 默认不启动 shell；因此外部引擎必须使用参数数组调用，默认 `shell: false`，并对 Windows `.bat` / `.cmd` 单独做禁止或受控处理。[6]
6. Microsoft 对 Office Open XML 扩展名的说明确认 `x` 后缀通常表示无宏，`m` 后缀表示可包含宏；因此宏风险不应只靠扩展名，仍需检查 content type、relationship 与 `vbaProject.bin` 等容器证据。[7]
7. EPUB OCF 规范要求 EPUB ZIP 容器包含 `META-INF/container.xml`，并对根目录 `mimetype` 文件的位置、内容、压缩和加密状态有明确要求；因此 EPUB 不能仅凭 ZIP magic 或 `.epub` 扩展名终判。[8]
8. ZIP APPNOTE 是 ZIP 结构的基础规格来源；Zip Slip 资料表明归档条目路径穿越可能导致任意文件写入，因此 Starverse 检测阶段不得递归解压，不得信任 entry path，转换阶段必须做路径归一化与 sandbox 写入限制。[9][10]
9. DROID / PRONOM 是面向数字保存的高精度格式识别体系，但依赖签名库、Java 运行环境和批处理模型，更适合作为 P2 插件或离线诊断，不适合作为 MVP 热路径。[11]

---

## 1. 最终架构结论

Starverse 文件类型识别体系采用三层引擎安装策略与双层流水线表述。

三层引擎安装策略：

```text
Core Detector
+ Managed Engine Plugins
+ External Engine Overrides
```

核心识别链是四段式：

```text
Header Magic
+ Magika
+ Container Probe
+ Parser Validation on demand
```

工程执行流水线是十步：

```text
Step 0 metadata hint
Step 1 header magic
Step 2 text and encoding precheck
Step 3 Magika classification
Step 4 container probe
Step 5 evidence merge
Step 6 static policy evaluation
Step 7 send route mapping
Step 8 parser validation on demand
Step 9 cache writeback
```

本体系的目标是提供稳定、低延迟、可解释、可缓存、可测试、可被用户覆盖的文件类型判断基础。它服务于预览、转换、发送计划和模型兼容性判断，但不承担杀毒、动态沙箱或内容安全审查职责。

工程实现必须坚持以下分层：

```text
detector
  只产生 FileTypeEvidence

evidenceMerge
  只产生 FileTypePrimary、conflicts、flags

fileTypeStaticPolicy
  只产生与文件内容和静态规则相关的风险策略

sendRouteMapping
  基于 verdict + modelCapabilities + userPrefs + engineAvailability 生成 SendPlanCandidate

UI
  展示状态、证据、冲突、静态风险、可选路线和推荐路线

sendPlanService
  消费 verdict 与 SendPlanCandidate，执行最终发送前校验，不重复检测文件类型
```

该分层用于避免以下反模式：

```text
UI 根据扩展名自行判断文件类型
sendPlanService 重新读取文件并重复检测
转换模块绕过 FileTypeVerdict 直接选择路线
用户覆盖直接改写 primary verdict
外部引擎故障导致基础识别不可用
缓存命中时不校验规则版本和引擎版本
后台 job 不校验 freshness 直接写回 UI
```

---

## 2. 目标、非目标与工程边界

### 2.1 目标

识别系统必须回答以下问题：

```text
文件大概率是什么格式
文件属于哪一类业务类型
内部 formatId 是什么
是否存在扩展名、浏览器 MIME、系统 MIME 与内容不一致
默认预览方式是什么
默认转换路线是什么
当前模型能否直接发送
是否需要先转换再发送
是否需要进入更重的解析验证
当前结论来自哪些证据
当前结论是否命中缓存，缓存是否可能过期
用户能否覆盖处理路线
推荐路线依赖哪些引擎或后台任务
推荐路线会损失哪些信息
```

### 2.2 非目标

识别系统不承诺完成以下事项：

```text
不保证文件无恶意内容
不保证文件结构完整
不保证文件可被所有解析器成功打开
不保证扩展名真实可信
不保证模型端最终一定处理成功
不执行脚本、宏或活动内容
不直接作为安全结论
不替代杀毒、动态沙箱或内容安全扫描
```

### 2.3 工程边界

识别系统只产生证据、主判断、冲突、风险标记、静态策略和推荐处理路线。真正的文本抽取、缩略图生成、格式转换、模型发送和恶意内容检测由下游模块完成。

`blocked` 表示在当前策略下不允许执行某条路线，不等价于文件一定恶意。UI 必须避免把 blocked 文案写成安全鉴定结论。

---

## 3. 引擎分层与安装策略

### 3.1 Core Detector

Core Detector 随 Starverse 主程序交付，默认启用，不依赖外部二进制。

```text
内置 magic bytes 表
内置 MIME / extension 映射表
内置文本与编码探针
内置 Magika runtime 或模型文件
内置 ZIP / OOXML / ODF / EPUB / APK / JAR / VSIX / WHL / ASAR / OLE CFB 容器探针
内置 evidenceMerge、taxonomyMap、staticPolicy、sendRouteMapping
```

Core Detector 必须满足：

```text
不启动外部重型进程
不执行用户脚本
不递归解压归档
不在 renderer 主线程读取大文件
不因插件不可用而失效
```

### 3.2 Managed Engine Plugins

Managed Engine Plugins 由 Starverse 管理安装、升级、禁用、回滚和健康检查。

```text
Apache Tika      detect / extract / metadata deep path
ffmpeg / ffprobe audio-video probe / extract / transcode
LibreOffice      Office conversion
Pandoc           document conversion
Calibre          EPUB conversion
ImageMagick      limited image conversion, if enabled
DROID / Siegfried optional archival-grade identification, P2
```

默认规则：

```text
插件不进入 detectBasic 热路径
插件失败不得阻断基础识别
插件输出只作为 parserProbe 或 externalDetector evidence
插件版本必须写入 provenance
插件调用必须经 sandbox copy 或受控输入流
```

### 3.3 External Engine Overrides

External Engine Overrides 是用户显式配置的外部工具。

```text
用户指定 ffmpeg
用户指定 LibreOffice
用户指定 Pandoc
用户指定 Tika JAR
企业预装工具路径
开发者模式自定义工具目录
```

PATH 自动发现只能用于展示候选，不得自动执行。外部引擎启用时必须记录：

```ts
export interface ExternalEngineRecord {
  engineId: string;
  displayName: string;
  absolutePath: string;
  version?: string;
  hash?: string;
  firstEnabledAt: number;
  lastVerifiedAt?: number;
  userEnabled: boolean;
  healthStatus: 'unknown' | 'healthy' | 'failed' | 'disabled';
  failureCount: number;
}
```

`absolutePath` 只允许保存在本地配置或加密配置存储中，不得进入普通日志、诊断导出或远程遥测。

### 3.4 推荐目录

普通安装版：

```text
%LOCALAPPDATA%/Starverse/engines/
%APPDATA%/Starverse/engines/
```

便携版：

```text
StarversePortable/engines/
```

开发版：

```text
D:/Starverse/.starverse-engines/
```

主程序目录不作为插件默认安装位置，避免权限、更新覆盖、卸载残留和完整性校验混乱。

---

## 4. 进程边界与文件访问边界

### 4.1 进程边界

```text
renderer
  只展示状态
  不直接读取大文件
  不持有真实绝对路径
  不执行识别二进制
  不获得 contentToken 原文

main process
  调度任务
  管理路径权限
  解析 FileAccessRef
  管理外部进程生命周期
  校验 IPC sender

worker thread
  执行内置轻量识别
  执行 magic / textProbe / Magika / containerProbe

isolated child process
  执行插件或外部引擎
  运行在受控 sandbox
  有 timeout、stdout/stderr 限制、并发限制和 kill process tree 能力
```

### 4.2 FileAccessRef

任何识别模块不得直接依赖 UI 传来的绝对路径。所有文件访问必须通过受控 `FileAccessRef` 与 `FileReadAdapter` 完成。

```ts
export type FileAccessKind =
  | 'local_path'
  | 'browser_blob'
  | 'stored_asset'
  | 'derived_asset'
  | 'temp_sandbox_asset';

export interface FileAccessRef {
  kind: FileAccessKind;
  assetId: string;
  displayName?: string;
  extensionHint?: string;
  size: number;
  mtime?: number;
  contentToken: string;
  sourceCategory:
    | 'user_upload'
    | 'drag_drop'
    | 'paste'
    | 'history_attachment'
    | 'conversion_output'
    | 'preview_derivative'
    | 'internal_temp';
}
```

### 4.3 FileReadAdapter

```ts
export interface FileReadAdapter {
  readHead(ref: FileAccessRef, maxBytes: number): Promise<Uint8Array>;
  readTail(ref: FileAccessRef, maxBytes: number): Promise<Uint8Array>;
  readRange(ref: FileAccessRef, offset: number, length: number): Promise<Uint8Array>;
  createSandboxCopy?(
    ref: FileAccessRef,
    options: SandboxCopyOptions,
  ): Promise<SandboxedFileRef>;
}
```

### 4.4 访问规则

```text
renderer 只能持有 assetId、displayName、extensionHint、size、状态字段
renderer 不得持有真实绝对路径
contentToken 只能由 main process 解析
worker 通过受控 reader 读取 header、tail 或 sample
外部进程只能读取 sandbox 中的受控副本或受控输入流
日志不得记录 contentToken 原始值
```

### 4.5 写回规则

```text
任何 verdict 写回数据库或 UI 前，必须确认 assetId、size、mtime、headHash 仍匹配
若文件已从 draft 删除，后台 job 可以完成，但不得更新 draft UI
若 contentToken 已失效，必须返回 file_access_expired，而不是静默失败
同一 assetId 允许多个历史 job，但只有 currentJobId 可写回 UI
```

---

## 5. 统一类型体系 Taxonomy

Starverse 内部不得只存 MIME。MIME 是外部互操作字段，不能完整表达业务处理路线。每个文件至少归一化为：

```text
kind
businessKinds
formatId
mime
canonicalExtension
confidenceLevel
confidenceScore
flags
```

### 5.1 FileKind

```ts
export type FileKind =
  | 'text'
  | 'code'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'image'
  | 'audio'
  | 'video'
  | 'archive'
  | 'database'
  | 'font'
  | 'model'
  | 'executable'
  | 'container'
  | 'binary'
  | 'unknown';
```

### 5.2 FileFormatId

```ts
export type FileFormatId =
  | 'plain_text'
  | 'unknown_text'
  | 'markdown'
  | 'csv'
  | 'tsv'
  | 'json'
  | 'jsonl'
  | 'yaml'
  | 'xml'
  | 'html'
  | 'svg'
  | 'log'
  | 'source_code'

  | 'pdf'
  | 'rtf'
  | 'doc'
  | 'docx'
  | 'docm'
  | 'dotm'
  | 'odt'
  | 'epub'

  | 'xls'
  | 'xlsx'
  | 'xlsm'
  | 'xltm'
  | 'ods'

  | 'ppt'
  | 'pptx'
  | 'pptm'
  | 'potm'
  | 'ppsm'
  | 'odp'

  | 'png'
  | 'jpeg'
  | 'webp'
  | 'gif'
  | 'bmp'
  | 'tiff'
  | 'avif'
  | 'heic'
  | 'ico'

  | 'mp3'
  | 'wav'
  | 'flac'
  | 'aac'
  | 'm4a'
  | 'ogg'
  | 'opus'

  | 'mp4'
  | 'mov'
  | 'mkv'
  | 'webm'
  | 'avi'
  | 'mpeg'

  | 'ttf'
  | 'otf'
  | 'woff'
  | 'woff2'

  | 'onnx'
  | 'safetensors'
  | 'gguf'

  | 'zip'
  | 'unknown_zip_container'
  | 'seven_zip'
  | 'rar'
  | 'tar'
  | 'gzip'
  | 'bzip2'
  | 'xz'
  | 'jar'
  | 'apk'
  | 'vsix'
  | 'whl'
  | 'asar'
  | 'ole_cfb'
  | 'legacy_office_unknown'

  | 'sqlite'
  | 'wasm'
  | 'elf'
  | 'pe_executable'
  | 'mach_o'
  | 'unknown_binary';
```

### 5.3 SourceCodeMeta

`source_code` 不能单独承担脚本风险判断。必须补充语言或执行性元信息。

```ts
export interface SourceCodeMeta {
  languageId?: string;
  shebang?: string;
  executableScript?: boolean;
  scriptFamily?: 'shell' | 'powershell' | 'javascript' | 'vbscript' | 'python' | 'ruby' | 'perl' | 'batch' | 'other';
}
```

风险规则：

```text
bat / cmd / ps1 / sh / js / vbs / wsf / hta 等必须标记 executable_content 或 scriptable_format
仅识别为 source_code 但 languageId 为空时，不得判断为可执行脚本
含 shebang 且指向 shell / python / node / perl / ruby 时，至少标记 scriptable_format
```

### 5.4 FileFormatDescriptor

```ts
export interface FileFormatDescriptor {
  formatId: FileFormatId;
  primaryKind: FileKind;
  businessKinds: FileKind[];
  mime?: string;
  canonicalExtension?: string;
  aliases: string[];
  scriptable?: boolean;
  macroCapable?: boolean;
  executable?: boolean;
  containerBased?: boolean;
  parserRecommended?: boolean;
}
```

### 5.5 格式归一化规则

```text
epub 的 primaryKind = document，businessKinds 包含 document 与 archive
csv / tsv 的 primaryKind 默认 spreadsheet，businessKinds 包含 text 与 spreadsheet
svg 的 primaryKind 默认 image，businessKinds 包含 image 与 text，并标记 scriptable_format
macro-enabled OOXML 使用 docm / xlsm / pptm 等专用 formatId，并标记 macro_capable_document
font 格式使用 ttf / otf / woff / woff2，primaryKind = font
model 格式使用 onnx / safetensors / gguf，primaryKind = model
unknown_text 表示可作为文本尝试处理但具体格式不确定
unknown_binary 表示二进制内容无法可靠识别
legacy doc / xls / ppt 若无法细分，输出 ole_cfb 或 legacy_office_unknown
Magika label 必须经过 taxonomyMap 映射后才能进入 FileFormatId
未知 Magika label 只能生成 low evidence，不得扩展内部枚举
```

---

## 6. 数据模型

### 6.1 FileTypeEvidence

`FileTypeEvidence` 只记录检测器证据。`cache` 和 `userOverride` 不属于检测器证据，不进入 evidence merge。

```ts
export type EvidenceSource =
  | 'extension'
  | 'osMime'
  | 'browserMime'
  | 'magic'
  | 'textProbe'
  | 'magika'
  | 'containerProbe'
  | 'parserProbe'
  | 'externalDetector';

export type DetectionCost =
  | 'metadata'
  | 'header'
  | 'sample'
  | 'container'
  | 'fullParse'
  | 'externalProcess';

export type ConfidenceLevel =
  | 'certain'
  | 'high'
  | 'medium'
  | 'low'
  | 'unknown';

export interface FileTypeEvidence {
  source: EvidenceSource;
  kind?: FileKind;
  businessKinds?: FileKind[];
  formatId?: FileFormatId;
  mime?: string;
  extension?: string;
  sourceCodeMeta?: SourceCodeMeta;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  cost: DetectionCost;
  elapsedMs?: number;
  engineId?: string;
  engineVersion?: string;
  reasonCode: string;
  warningCode?: string;
}
```

### 6.2 Conflict 与 Flag

```ts
export type ConflictType =
  | 'extension_content_mismatch'
  | 'browser_mime_content_mismatch'
  | 'os_mime_content_mismatch'
  | 'engine_disagreement'
  | 'container_probe_failed'
  | 'parser_probe_failed'
  | 'encoding_uncertain'
  | 'polyglot_suspected';

export type IssueSeverity =
  | 'info'
  | 'warning'
  | 'danger'
  | 'blocked';

export interface FileTypeConflict {
  type: ConflictType;
  severity: IssueSeverity;
  claimedValue?: string;
  detectedValue?: string;
  sources: EvidenceSource[];
  messageCode: string;
}

export type FileTypeFlagCode =
  | 'extension_missing'
  | 'extension_mismatch'
  | 'mime_mismatch'
  | 'low_confidence'
  | 'container_unknown'
  | 'container_damaged'
  | 'container_encrypted'
  | 'parser_unavailable'
  | 'parser_timeout'
  | 'parser_probe_failed'
  | 'encoding_uncertain'
  | 'possibly_binary_text'
  | 'large_line_text'
  | 'structured_text_parse_failed'
  | 'external_entity_reference_detected'
  | 'scriptable_format'
  | 'macro_capable_document'
  | 'executable_content'
  | 'archive_nested'
  | 'archive_large_or_suspicious'
  | 'polyglot_suspected'
  | 'external_engine_used';

export interface FileTypeFlag {
  code: FileTypeFlagCode;
  severity: IssueSeverity;
  userVisible: boolean;
  blocksUnsafePreview: boolean;
  blocksNativePreview: boolean;
  blocksSend: boolean;
  blocksConversion: boolean;
}
```

### 6.3 Fingerprint 与 Subject

```ts
export interface FileFingerprint {
  algorithmVersion: number;
  size: number;
  modifiedTime?: number;
  headHash?: string;
  headBytes?: number;
  tailHash?: string;
  tailBytes?: number;
  fullHash?: string;
  fullHashStatus: 'not_computed' | 'computed' | 'failed' | 'not_applicable';
}

export interface FileSubjectSnapshot {
  assetId: string;
  displayName?: string;
  extensionHint?: string;
  size: number;
  mtime?: number;
  sourceCategory: FileAccessRef['sourceCategory'];
  fingerprint: FileFingerprint;
}
```

小文件可以直接计算 fullHash。大文件在热路径中只计算 headHash、tailHash、size 和 modifiedTime；进入发送或转换时再按需补 fullHash。

### 6.4 Primary、PreviewPolicy、StaticPolicy

```ts
export interface FileTypePrimary {
  kind: FileKind;
  businessKinds: FileKind[];
  formatId: FileFormatId;
  mime?: string;
  canonicalExtension?: string;
  sourceCodeMeta?: SourceCodeMeta;
  confidenceLevel: ConfidenceLevel;
  confidenceScore: number;
}

export type PreviewMode =
  | 'safe_text_preview'
  | 'safe_image_render'
  | 'native_preview'
  | 'rendered_preview'
  | 'blocked';

export interface FileTypePreviewPolicy {
  allowedPreviewModes: PreviewMode[];
  blockedPreviewModes: PreviewMode[];
  defaultPreviewMode: PreviewMode;
  reasonCodes: string[];
}

export interface FileTypeStaticPolicyResult {
  blocksDirectSend: boolean;
  blocksConversion: boolean;
  userOverridable: boolean;
  needsDeepScan: boolean;
  needsParserValidation: boolean;
  intrinsicRiskReasonCodes: string[];
  preview: FileTypePreviewPolicy;
}
```

说明：

```text
FileTypeVerdict 中只保存与文件内容、静态规则和可复核检测结果相关的策略
当前模型能力、用户偏好、外部引擎可用性不进入 FileTypeVerdict
模型能力变化只重算 SendPlanCandidate，不使 detection cache 失效
```

### 6.5 Provenance 与 Verdict

```ts
export interface VerdictProvenance {
  decidedBy: EvidenceSource;
  decisionReasonCode: string;
  schemaVersion: number;
  taxonomyVersion: number;
  taxonomyMapVersion: number;
  magicTableVersion: number;
  mergeRulesVersion: number;
  containerProbeVersion: number;
  textProbeVersion: number;
  magikaModelVersion?: string;
  createdAt: number;
}

export interface FileTypeVerdict {
  subject: FileSubjectSnapshot;
  primary: FileTypePrimary;
  evidences: FileTypeEvidence[];
  conflicts: FileTypeConflict[];
  flags: FileTypeFlag[];
  staticPolicy: FileTypeStaticPolicyResult;
  provenance: VerdictProvenance;
}
```

### 6.6 数据不变量

```text
evidences 采用 append-only 语义
cache hit 只作为 provenance 或 diagnostic event，不作为 EvidenceSource
userOverride 不进入 detector evidence，不参与 evidence merge
primary 是当前 merge result，不代表文件安全
staticPolicy 是文件内在风险策略，不包含当前模型能力和用户偏好
detection cache 只缓存 detection verdict，不缓存 SendPlanCandidate
规则版本、taxonomyVersion、taxonomyMapVersion、Magika 模型版本变化后必须重新评估缓存
blocked flag 优先级高于普通用户覆盖
开发者模式绕过 blocked flag 必须二次确认，并写入审计记录
```

---

## 7. 异步检测状态机

```ts
export type FileTypeDetectionState =
  | 'not_started'
  | 'metadata_ready'
  | 'basic_detecting'
  | 'basic_ready'
  | 'full_detecting'
  | 'full_ready'
  | 'parser_validating'
  | 'failed'
  | 'stale'
  | 'cancelled';

export interface FileTypeDetectionJob {
  jobId: string;
  assetId: string;
  state: FileTypeDetectionState;
  requestedLevel: 'basic' | 'full' | 'parser_validation';
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  staleReason?:
    | 'asset_removed'
    | 'fingerprint_changed'
    | 'engine_version_changed'
    | 'schema_version_changed'
    | 'taxonomy_version_changed'
    | 'taxonomy_map_version_changed'
    | 'user_replaced_file'
    | 'model_context_changed';
  cancelReason?:
    | 'user_removed_attachment'
    | 'newer_job_started'
    | 'app_shutdown'
    | 'timeout'
    | 'resource_limit';
  errorCode?: string;
}
```

状态迁移：

```text
not_started -> metadata_ready
metadata_ready -> basic_detecting
basic_detecting -> basic_ready 或 failed
basic_ready -> full_detecting
full_detecting -> full_ready 或 failed
full_ready -> parser_validating
parser_validating -> full_ready 或 failed
任意运行中状态 -> cancelled
任意 ready 状态 -> stale
```

写回规则：

```text
同一 assetId 允许存在多个历史 job，但只有最新有效 job 可写回 UI
写回前必须校验 jobId 仍为 currentJobId
写回前必须校验 fingerprint 与 subject snapshot 匹配
模型切换只触发 SendPlan 重算，不触发重复文件检测
用户覆盖路线只触发 SendPlan 重算，除非该路线需要 parser validation
附件删除后，后台 job 可完成但不得写回 UI 状态
```

---

## 8. 识别流水线细则

### 8.1 Step 0 metadata hint

采集：

```text
原始文件名
扩展名
文件大小
mtime
浏览器 MIME
系统 MIME
来源路径类别
用户声明类型
FileAccessRef
```

扩展名、浏览器 MIME、系统 MIME 都只能产生弱证据。不得仅凭这些字段生成 high 以上置信度 verdict。

### 8.2 Step 1 header magic

默认读取 head 64 KiB。对 ZIP、PDF、部分媒体和容器格式可读取 tail 小块。

强 magic 命中示例：

```text
PDF
PNG
JPEG
GIF
WebP
SQLite
WASM
7z
RAR
GZIP
ELF
PE
Mach-O
MP3
WAV
MP4
```

ZIP、OLE、XML、HTML、SVG 不能仅靠 magic 直接终判，需要后续细分。

### 8.3 Step 2 text and encoding precheck

默认参数：

```text
maxSampleBytes = 256 KiB
maxLineBytes = 1 MiB
largeTextThreshold = 10 MiB
```

判定规则：

```text
BOM 命中时优先使用 BOM
NUL byte 不得直接判定二进制，必须先检查 UTF-16LE / UTF-16BE 模式
UTF-8 strict decode 成功可产生 high text evidence
GBK / Shift_JIS / Big5 等本地编码候选最高只给 medium
控制字符比例过高时标记 possibly_binary_text
单行超长文本标记 large_line_text
空文件输出 formatId = unknown_text，confidenceLevel = unknown
XML 禁用外部实体解析
HTML / SVG 只做标签特征识别，不执行脚本，不加载外部资源
YAML 不在热路径做复杂解析
CSV / TSV 只做分隔符一致性与行列数量采样
```

### 8.4 Step 3 Magika classification

Magika 只产生 evidence，不直接覆盖其他规则。

```text
运行在 worker 中
常驻加载，避免每次冷启动
读取有限样本，不全量读取大文件
Magika label 先进入 taxonomyMap，再映射为内部 FileFormatId
低置信度结果只作为参考
模型版本写入 verdict provenance
```

建议阈值：

```text
score >= 0.85 -> high
0.55 <= score < 0.85 -> medium
score < 0.55 -> low
```

阈值可配置，但必须写入 `mergeRulesVersion`。

### 8.5 Step 4 container probe

触发条件：

```text
magic 指向 ZIP / OLE / archive / container
Magika 指向 OOXML / ODF / EPUB / JAR / APK 等容器格式
扩展名显示容器格式但内容证据不足
```

容器探针只读取目录结构和关键 entry，不递归解压全部内容。

```ts
export type ContainerProbeOutcome =
  | 'matched'
  | 'not_container'
  | 'container_unknown'
  | 'container_damaged'
  | 'encrypted'
  | 'suspicious'
  | 'timeout';
```

默认限制：

```ts
export interface ContainerProbeLimits {
  maxEntryCount: number;                // default 10000
  maxCentralDirectoryBytes: number;     // default 16 MiB
  maxEntryNameBytes: number;            // default 4096
  maxNestedDepth: number;               // default 1 for detection
  maxDeclaredUncompressedBytes: number; // default 2 GiB
  suspiciousCompressionRatio: number;   // default 100
}
```

安全限制：

```text
禁止递归解压全部内容
禁止跟随 symlink
禁止把 entry 写出到原始路径
禁止信任 entry 中的相对路径
检测 zip slip 路径穿越
检测重复 entry 名称
检测 encrypted archive
检测 zip64 超大尺寸声明
检测压缩比异常
检测嵌套 archive
检测中央目录损坏或截断
限制最大 entry 数
限制最大 entry name 长度
限制最大中央目录读取量
限制最大单 entry 元数据读取量
```

### 8.6 OOXML 探针

关键项：

```text
[Content_Types].xml
_rels/.rels
word/document.xml
xl/workbook.xml
ppt/presentation.xml
macro-enabled content type
vbaProject.bin
VBA relationship
```

规则：

```text
必须存在 [Content_Types].xml
必须解析 [Content_Types].xml 中的主 content type
必须结合 _rels/.rels 判断主文档入口
只伪造路径但 content type 不匹配时，降级为 unknown_zip_container
若发现 macroEnabled content type、vbaProject.bin 或 VBA relationship，标记 macro_capable_document
不得执行宏
不得启动 LibreOffice 完成热路径识别
```

### 8.7 ODF 探针

关键项：

```text
mimetype
content.xml
META-INF/manifest.xml
```

规则：

```text
mimetype entry 应为 ZIP 首个 entry
mimetype 应未压缩、无 extra field
mimetype 内容应与 odt / ods / odp 对应
content.xml 缺失时标记 container_damaged
```

### 8.8 EPUB 探针

关键项：

```text
mimetype
META-INF/container.xml
rootfile full-path
```

规则：

```text
mimetype 必须为 application/epub+zip
mimetype 必须位于根目录
mimetype 应为 ZIP 第一个文件
mimetype 不得压缩、不得加密、不得有前后空白、不得有 BOM
META-INF/container.xml 必须存在
container.xml 解析失败时标记 container_damaged
```

### 8.9 OLE CFB 探针

```text
旧 doc / xls / ppt 第一阶段可只识别 ole_cfb
若可读取 CFB directory，则尝试识别 WordDocument、Workbook、PowerPoint Document stream
无法细分时输出 legacy_office_unknown
不得启动 LibreOffice 完成热路径识别
```

### 8.10 Step 5 evidence merge

默认优先级：

```text
parserProbe
> containerProbe
> strongMagic
> magikaHighConfidence
> textProbeStructuredSuccess
> magikaMediumConfidence
> extension
> osMime
> browserMime
```

例外规则：

```text
strongMagic = zip 时，不得直接终判为普通 zip
containerProbe 成功时以 containerProbe 为准
containerProbe 失败时输出 unknown_zip_container
containerProbe 失败时不得依据扩展名直接提升为 docx / xlsx / pptx
strongMagic 命中 executable 类格式时，primary 以 executable 类为准
parserProbe 成功只提升结构可信度，不删除前置冲突
extension 只能增加一致性证据，不能单独产生 high 以上置信度
browserMime 与 osMime 永远不能单独产生 high 以上置信度
```

### 8.11 Step 6 static policy evaluation

静态策略只基于文件内容、flags、冲突和全局安全规则。

```text
HTML / SVG / XML 默认不执行活动内容
宏文档默认不执行宏
可执行文件默认阻止直接发送和原生预览
polyglot 可疑样本默认 blocked
压缩包默认 ask_user，不递归发送
容器损坏时，根据路线依赖决定 blocked 或 warning
```

### 8.12 Step 7 send compatibility mapping

SendPlan 必须同时检查：

```text
当前模型是否支持 text / image / audio / video / file / PDF input
当前模型是否声明支持对应 MIME
当前文件大小是否超出模型或平台限制
当前转换引擎是否可用
当前文件是否存在 blocked flag
用户是否允许强制发送
用户是否选择覆盖路线
```

### 8.13 Step 8 parser validation on demand

触发条件：

```text
用户请求预览
用户请求转换
文件即将发送且发送路线依赖解析结果
识别冲突较高
文件属于容器格式且需要抽取内容
安全护栏要求进一步确认
用户覆盖路线要求 parser validation
```

### 8.14 Step 9 cache writeback

缓存必须包含：

```text
schemaVersion
taxonomyVersion
taxonomyMapVersion
magicTableVersion
mergeRulesVersion
containerProbeVersion
textProbeVersion
magikaModelVersion
engineVersions
fingerprint
```

---

## 9. 证据冲突与高风险处理

### 9.1 置信度建议

```text
certain:
  强 magic 命中且无冲突
  containerProbe 成功识别 OOXML / ODF / EPUB 等
  parserProbe 成功验证结构

high:
  Magika 高置信度且扩展名一致
  magic 与扩展名一致
  文本结构解析成功，例如 JSON parse 成功

medium:
  Magika 中置信度
  扩展名与部分内容特征一致
  文本编码确定但具体格式不确定
  本地编码候选，例如 GBK / Shift_JIS / Big5

low:
  只有扩展名证据
  引擎冲突明显
  采样不足
  容器探针失败

unknown:
  空文件
  无法读取
  内容过短
  无可靠证据
```

### 9.2 冲突处理矩阵

| 情况 | verdict | flag | severity | 默认行为 |
|---|---|---|---|---|
| 无扩展名但内容可识别 | 内容类型 | extension_missing | info | 正常处理 |
| txt 实际为 Markdown | markdown | extension_mismatch | info | 正常处理 |
| jpg 实际为 PNG | png | extension_mismatch | warning | 可预览，提示 |
| pdf 实际为 exe | pe_executable | executable_content | blocked | 阻止原生预览和发送 |
| zip 内部为 docx | docx | 无或 extension_mismatch | info/warning | 按 docx 处理 |
| zip 内部未知 | unknown_zip_container | container_unknown | warning | 作为压缩包处理或提示 |
| docx 容器损坏 | docx 或 unknown_zip_container | container_damaged | warning/blocked | 视路线决定 |
| HTML 含脚本 | html | scriptable_format | warning | 安全文本或净化预览，不执行 JS |
| SVG 含脚本 | svg | scriptable_format | warning | 安全渲染或文本预览 |
| XML 含外部实体引用 | xml | external_entity_reference_detected | warning | 禁用外部实体解析 |
| parser 超时 | 保留前置 verdict | parser_timeout | warning | 降级处理 |
| polyglot 可疑 | 最保守 verdict | polyglot_suspected | blocked | 默认阻止发送 |

### 9.3 polyglot 最小检测

MVP 必须包含 polyglot 最小启发式：

```text
有效 PDF 后附带 ZIP 中央目录
有效图片后附带 PE / ELF / Mach-O 强签名
头部 magic 与尾部容器结构高度冲突
同一文件满足两个强 magic 签名
```

默认行为：

```text
blocksDirectSend = true
native_preview blocked
safe_text_preview 可用时允许安全文本预览
userOverridable = false，开发者模式除外
```

P2 再做高级 polyglot 检测：

```text
多 parser 合法性验证
复杂尾附结构
嵌套伪装
跨格式有效载荷分析
```

---

## 10. 用户覆盖机制

用户覆盖只能改变处理路线或用户假定类型，不得修改原始 detection evidence、primary verdict 或 cached verdict。

```ts
export interface FileUserOverride {
  overrideId: string;
  assetId?: string;
  scope:
    | 'this_file'
    | 'this_conversation'
    | 'this_extension'
    | 'this_format'
    | 'global_default';

  assumedFormatId?: FileFormatId;
  selectedRoute?: SendRoute;
  selectedEngineId?: string;
  preserveOriginal?: boolean;
  sendOriginalAlongsideConverted?: boolean;

  createdAt: number;
  expiresAt?: number;
  createdBy: 'user';
  reasonCode?: string;
}
```

用户可以覆盖：

```text
处理路线
预览方式
转换目标格式
是否保留原文件
是否同时发送转换结果和原文件
是否使用外部引擎
低置信度文件按哪种类型打开
当前文件的用户假定类型
```

用户不能覆盖：

```text
原始 evidence
文件真实检测记录
blocked 安全标记
日志隐私规则
外部引擎沙箱规则
```

持久化范围：

```text
this_file 覆盖只影响当前 assetId
this_conversation 覆盖只影响当前会话
this_extension 覆盖需要二次确认
global_default 覆盖必须进入设置页管理
用户覆盖不进入 detection cache
用户覆盖生成 effective plan，不修改 FileTypeVerdict
```

---

## 11. 发送兼容性映射

### 11.1 SendRoute

```ts
export type SendRoute =
  | 'direct_text'
  | 'direct_image'
  | 'direct_audio'
  | 'direct_video'
  | 'direct_file'
  | 'converted_markdown'
  | 'converted_plain_text'
  | 'converted_csv'
  | 'converted_tsv'
  | 'converted_pdf'
  | 'rendered_images'
  | 'extracted_text'
  | 'extracted_audio'
  | 'selected_frames'
  | 'blocked'
  | 'ask_user'
  | 'skip';
```

### 11.2 SendPlanCandidate

```ts
export interface SendPlanCandidate {
  route: SendRoute;
  labelCode: string;
  inputAssetId: string;
  outputRepresentation:
    | 'text'
    | 'markdown'
    | 'csv'
    | 'tsv'
    | 'file'
    | 'pdf'
    | 'image'
    | 'audio'
    | 'video'
    | 'frames'
    | 'none';

  priority: number;
  recommended: boolean;
  requiresJob: boolean;
  requiresParserValidation: boolean;
  requiresEngineIds: string[];

  lossy: boolean;
  preservesText: boolean;
  preservesLayout: boolean;
  preservesImages: boolean;
  preservesTables: boolean;

  estimatedBytes?: number;
  estimatedTokens?: number;
  estimatedPages?: number;
  estimatedImages?: number;

  blockedBy: string[];
  warnings: string[];
  userOverridable: boolean;
  developerOnly?: boolean;
}
```

### 11.3 ModelInputCapabilities

```ts
export interface ModelInputCapabilities {
  supportsTextInput: boolean;
  supportsImageInput: boolean;
  supportsAudioInput: boolean;
  supportsVideoInput: boolean;
  supportsFileInput: boolean;
  supportsPdfInput: boolean;
  supportedMimeTypes?: string[];
  maxFileBytes?: number;
  maxImageCount?: number;
  maxAudioBytes?: number;
  maxVideoBytes?: number;
  maxContextTokens?: number;
}
```

### 11.4 生成规则

```text
先生成所有理论候选路线
再按 staticPolicy 和 blocked flag 过滤
再按模型能力过滤
再按用户偏好排序
再按成本、保真度、可用引擎排序
最后输出 recommended candidate
```

### 11.5 默认排序原则

```text
当前模型原生支持且风险低时，优先 direct route
文档类默认优先 converted_markdown，除非模型明确支持 direct PDF 或 direct file
表格默认优先完整 Markdown table 或 CSV，超大时提示分片
PPT 默认优先 converted_markdown + 可选 rendered_images
HTML / SVG 默认不执行脚本，优先 converted_markdown 或 safe_text_preview
archive 默认 ask_user，不递归发送
executable 默认 blocked
```

### 11.6 默认映射表

| formatId | 默认路线 | 可选路线 | 备注 |
|---|---|---|---|
| plain_text | direct_text | converted_markdown | 大文件按用户上限处理 |
| unknown_text | direct_text | converted_markdown | 允许按 Markdown / CSV / JSON / 源代码尝试 |
| markdown | direct_text | direct_file | 保留 Markdown 结构 |
| source_code | direct_text | direct_file | 必须附 languageId 或 executableScript 判断 |
| log | direct_text | converted_plain_text | 超大单行需分片 |
| json | direct_text | direct_file | 可格式化预览 |
| jsonl | direct_text | direct_file | 超大文件需切分 |
| yaml | direct_text | direct_file | 复杂解析不进热路径 |
| xml | direct_text | direct_file | 禁用外部实体 |
| html | converted_markdown | direct_file, direct_text | 默认不执行 JS |
| svg | direct_text | rendered_images, direct_file | 默认不执行脚本 |
| csv | converted_markdown | converted_csv, direct_text, direct_file | 大表格可分片 |
| tsv | converted_markdown | converted_tsv, direct_text, direct_file | 同 CSV |
| pdf | direct_file 或 converted_markdown | rendered_images, extracted_text | 取决于模型能力 |
| rtf | converted_markdown | converted_plain_text, direct_file | 依赖转换能力 |
| doc/docx | converted_markdown | converted_pdf, direct_file | 默认转 Markdown |
| docm/dotm | converted_markdown | converted_pdf, direct_file | 标记 macro_capable_document，不执行宏 |
| xls/xlsx | converted_markdown | converted_csv, direct_file | 表格优先完整 table，超大时分片 |
| xlsm/xltm | converted_markdown | converted_csv, direct_file | 标记 macro_capable_document，不执行宏 |
| ppt/pptx | converted_markdown | rendered_images, direct_file | 可按页转换 |
| pptm/potm/ppsm | converted_markdown | rendered_images, direct_file | 标记 macro_capable_document，不执行宏 |
| odt | converted_markdown | direct_file | 依赖插件能力 |
| ods | converted_markdown | converted_csv, direct_file | 依赖插件能力 |
| odp | converted_markdown | rendered_images, direct_file | 依赖插件能力 |
| epub | converted_markdown | direct_file | 章节化处理 |
| png/jpeg/webp/gif | direct_image | direct_file | 多图按模型能力限制 |
| bmp/tiff/avif/heic/ico | direct_image | rendered_images, direct_file | 取决于本地解码能力 |
| mp3/wav/flac/aac/m4a/ogg/opus | direct_audio | extracted_text | 取决于模型能力 |
| mp4/mov/mkv/webm/avi/mpeg | direct_video | extracted_audio, selected_frames | 取决于模型能力 |
| zip/seven_zip/rar/tar/gzip/bzip2/xz | ask_user | blocked, skip | 默认不递归发送 |
| jar/apk/vsix/whl/asar | ask_user | blocked, skip | 开发资源，默认不执行 |
| pe_executable/elf/mach_o | blocked | skip | 默认阻止 |
| wasm | ask_user | blocked, skip | 默认不执行 |
| ttf/otf/woff/woff2 | ask_user | direct_file, skip | 默认不解析字体内部结构 |
| onnx/safetensors/gguf | ask_user | direct_file, skip | 默认不加载模型文件 |
| sqlite | ask_user | extracted_text, direct_file, skip | 默认不执行查询 |
| ole_cfb/legacy_office_unknown | ask_user | converted_markdown, converted_pdf, skip | 需要深检或转换插件 |
| unknown_zip_container | ask_user | blocked, skip | 容器结构无法确认 |
| unknown_binary | ask_user | blocked, skip | 低置信度时询问用户 |

---

## 12. 外部进程、插件与沙箱

### 12.1 插件 manifest

`argsTemplate` 只表达参数数组调用模型，具体参数由 engine adapter 定义，不应把 manifest 示例视为真实 Tika CLI 调用。

```yaml
manifestSchemaVersion: 1
id: org.starverse.engine.tika
displayName: Apache Tika
publisher: Apache Software Foundation
version: 3.2.1
platform: win32-x64
license: Apache-2.0

kind:
  - detect
  - extract
  - metadata

entry:
  type: java-jar
  path: tika-app.jar
  argsTemplate:
    - "{{engineSpecificDetectArg}}"
    - "{{inputPath}}"

capabilities:
  detect: true
  extractText: true
  extractMetadata: true
  supportedFormatIds:
    - pdf
    - docx
    - xlsx
  supportedMimeTypes:
    - application/pdf

resourceLimits:
  timeoutMs: 10000
  maxInputBytes: 524288000
  maxMemoryMb: 512
  maxStdoutBytes: 10485760
  maxStderrBytes: 1048576

integrity:
  sha256: SHA256_VALUE

signature:
  required: false
  algorithm: optional
  value: optional
  trustedRoot: optional

network:
  allowed: false

sandbox:
  tempOnly: true
  allowOriginalPathAccess: false
  allowNetwork: false
  allowUserScript: false
```

### 12.2 外部进程调用规则

```text
必须使用 spawn / execFile 等参数数组调用
默认 shell: false
禁止 shell 字符串拼接
Windows .bat / .cmd 默认禁止作为普通外部引擎入口
若开发者模式允许 .bat / .cmd，必须显示二次确认并走 cmd.exe 固定参数模板
必须设置 timeout
必须限制 stdout / stderr 大小
必须限制临时目录
必须使用 sandbox copy 或受控输入流
默认不得联网
默认不得执行用户脚本
默认不得访问任意目录
超时后必须 kill process tree
外部进程错误必须映射为 errorCode
```

### 12.3 自定义脚本

自定义脚本不进入普通用户默认插件体系，只能在开发者模式或企业策略显式允许时启用。默认 UI 不展示自定义脚本入口。

### 12.4 插件生命周期

必须支持：

```text
安装
完整性校验
启用
禁用
升级
回滚
卸载
版本查询
能力查询
健康检查
故障隔离
```

插件安装失败不得影响 Starverse 主程序启动。插件升级失败必须保留旧版本或回滚到禁用状态。

---

## 13. 性能预算、并发与缓存

### 13.1 热路径预算

在本地 SSD、冷启动外、常见 fixture、无外部进程参与条件下：

```text
0 到 50 ms：显示文件卡片和基础元数据
50 到 150 ms：完成 header magic 和初步 verdict
150 ms 到 2 s：完成 Magika 和容器探针
2 s 以上：进入后台 job，不阻塞 UI，但影响兼容性状态
```

验收指标：

```text
detectBasic p95 <= 150 ms，适用于 <= 100 MiB 常见文件
detectFull p95 <= 2 s，适用于常见 Office / PDF / 文本 / 图片 fixture
renderer long task <= 50 ms
外部重型引擎不得进入热路径
```

移动盘、网络盘、系统杀毒扫描、大量并发和首次模型冷启动应单独记录，不纳入硬性 p95。

### 13.2 并发限制

```ts
export interface DetectionConcurrencyPolicy {
  maxBasicJobs: number;      // default 4
  maxFullJobs: number;       // default 2
  maxExternalJobs: number;   // default 1
  maxParserJobs: number;     // default 1
}
```

调度规则：

```text
用户正在交互的 draft 附件优先级最高
历史消息附件惰性检测
不可见附件降低优先级
外部进程任务低于内置轻量检测任务
应用退出时取消未完成任务
```

### 13.3 CacheKey

```ts
export interface FileTypeCacheKey {
  schemaVersion: number;
  taxonomyVersion: number;
  taxonomyMapVersion: number;
  magicTableVersion: number;
  mergeRulesVersion: number;
  containerProbeVersion: number;
  textProbeVersion: number;
  magikaModelVersion?: string;

  size: number;
  modifiedTime?: number;
  headHash?: string;
  headBytes?: number;
  tailHash?: string;
  tailBytes?: number;
  fullHash?: string;
}
```

缓存失效条件：

```text
文件大小变化
mtime 变化且无 fullHash 校验
headHash 变化
tailHash 变化
fullHash 变化
schemaVersion 变化
taxonomyVersion 变化
taxonomyMapVersion 变化
Magika 模型版本变化
magic table 版本变化
mergeRulesVersion 变化
containerProbeVersion 变化
textProbeVersion 变化
用户清理缓存
```

缓存规则：

```text
mtime 精度不足时不得单独信任
移动盘、网络盘、临时文件优先使用 headHash + tailHash
小文件可以直接 fullHash
用户 override 不进入 detection cache
模型能力变化不使 detection cache 失效，只重算 SendPlan
cache hit 不追加 FileTypeEvidence
```

---

## 14. 日志与诊断

### 14.1 普通日志允许记录

```text
assetId
basename optional
extension
sizeBucket
formatId
kind
confidenceLevel
engineId
engineVersion
elapsedMs
errorCode
flagCodes
jobState
```

### 14.2 普通日志禁止记录

```text
绝对路径
用户目录
文件正文
文件头原始字节
完整 hash
contentToken
外部命令完整参数中的原始路径
临时目录真实路径
```

### 14.3 诊断事件

```ts
export interface FileTypeDiagnosticEvent {
  eventType:
    | 'detect_started'
    | 'detect_completed'
    | 'detect_failed'
    | 'cache_hit'
    | 'cache_miss'
    | 'engine_timeout'
    | 'engine_unavailable'
    | 'verdict_stale'
    | 'send_plan_recomputed';

  assetId: string;
  jobId?: string;
  formatId?: FileFormatId;
  elapsedMs?: number;
  errorCode?: string;
  flags?: string[];
}
```

开发者诊断模式可以临时记录更详细信息，但必须显式开启，并在 UI 中提示隐私风险。

---

## 15. UI 行为要求

文件卡片默认显示：

```text
识别类型
置信状态
默认处理路线
是否与扩展名冲突
是否需要转换
是否兼容当前模型
是否有安全或完整性提示
```

详情面板显示：

```text
所有 evidence
冲突说明
风险 flag
检测类型
用户假定类型
实际发送路线
可选处理路线
引擎来源
引擎依赖
耗时
缓存状态
是否会损失排版、图片、表格或脚注
```

提示原则：

```text
blocked 不写成恶意判定
低置信度不写成识别失败
扩展名不一致要展示 claimed 与 detected
外部引擎不可用要说明只影响深检或转换，不影响基础识别
用户覆盖要明确覆盖范围和可撤销性
```

---

## 16. 测试矩阵

### 16.1 Fixture 类别

必须覆盖：

```text
正确扩展名 + 正确内容
错误扩展名 + 正确内容
无扩展名
空文件
极小文件
超大文件
损坏文件
ZIP 容器样本
OOXML docx / docm / dotm / xlsx / xlsm / xltm / pptx / pptm / potm / ppsm
ODF odt / ods / odp
EPUB
JAR
APK
VSIX
WHL
ASAR
OLE CFB
字体 ttf / otf / woff / woff2
模型 onnx / safetensors / gguf
纯文本 UTF-8
纯文本 UTF-16LE
纯文本 UTF-16BE
中文 GBK 文本
CSV
TSV
JSON
JSONL
YAML
Markdown
HTML
SVG
PDF
PNG
JPEG
WebP
GIF
BMP
TIFF
AVIF
HEIC
ICO
MP3
WAV
MP4
SQLite
WASM
PE 可执行文件
未知二进制
polyglot 可疑样本
```

### 16.2 Fixture 目录

```text
fixtures/file-type/valid/
fixtures/file-type/mismatch/
fixtures/file-type/damaged/
fixtures/file-type/adversarial/
fixtures/file-type/large/
fixtures/file-type/encoding/
fixtures/file-type/container/
fixtures/file-type/plugin/
```

### 16.3 expected.json

每个 fixture 旁边放置 expected 文件：

```text
sample.docx
sample.docx.expected.json
```

示例：

```json
{
  "primary": {
    "formatId": "docx",
    "kind": "document",
    "confidenceLevel": "certain"
  },
  "flags": [],
  "conflicts": [],
  "staticPolicy": {
    "blocksDirectSend": false,
    "blocksConversion": false,
    "preview": {
      "defaultPreviewMode": "native_preview"
    }
  },
  "sendPlan": {
    "recommendedRoute": "converted_markdown",
    "allowedRoutes": ["converted_markdown", "converted_pdf", "direct_file"]
  }
}
```

### 16.4 每个 fixture 的断言

```text
kind
businessKinds
formatId
mime
canonicalExtension
confidenceLevel
sourceCodeMeta
flags
conflicts
staticPolicy
PreviewMode
needsDeepScan
needsParserValidation
SendPlanCandidate 列表
默认 recommended route
是否兼容指定模型
是否允许用户覆盖
是否触发 warning
是否阻止 blocked 类型
```

### 16.5 回归测试重点

```text
ZIP 不被误判为普通 zip，当它实际是 docx/xlsx/pptx/epub 时
HTML/SVG 不执行脚本
EXE 改名为 PDF 时被阻止
PDF 改名为 TXT 时仍识别为 PDF
CSV 与 TSV 可区分或给出中等置信度
GBK 中文文本不被误判为二进制
UTF-16 文本不因 NUL byte 被误判为二进制
超大文件不触发全量同步读取
外部引擎超时不会卡住 UI
插件升级失败可回滚
普通日志不包含绝对路径
模型切换只重算 SendPlan，不重复检测文件
用户覆盖不污染 detection cache
cache hit 不追加 evidence
```

### 16.6 adversarial fixtures

```text
exe_renamed_as_pdf
pdf_renamed_as_txt
zip_with_docx_extension_but_missing_content_types
docx_with_corrupted_central_directory
macro_enabled_docm
macro_enabled_xlsm
macro_enabled_pptm
svg_with_script
html_with_script
xml_with_external_entity
zip_slip_archive
zip64_huge_declared_size
nested_archive
polyglot_pdf_zip
image_with_executable_tail
utf16_text_with_many_nul_bytes
gbk_chinese_text
huge_single_line_log
```

---

## 17. 验收标准

### 17.1 第一阶段：核心识别闭环

```text
FileAccessRef 接入完成，renderer 不持有绝对路径
detectBasic / detectFull 均有 jobId 和状态机
写回 verdict 前校验 currentJobId 与 fingerprint
内置 magic 可识别常见二进制格式
文本与编码探针可识别 UTF-8 / UTF-16 / GBK 基础文本
Magika 可接入并返回 evidence
Magika label 经 taxonomyMap 映射后进入内部 FileFormatId
容器探针可区分 docx/xlsx/pptx/odt/ods/odp/epub/jar/apk
FileTypeVerdict 数据结构稳定
SendPlanCandidate 可生成并驱动 UI 展示
PreviewMode 能表达安全预览可用但原生预览禁用
基础 UI 能显示识别结果、置信度和冲突
```

### 17.2 第二阶段：插件与外部引擎闭环

```text
插件 manifest 可读取
插件完整性可校验
插件可启用、禁用、升级、回滚
外部引擎必须用户显式启用
PATH 自动发现不自动执行
外部引擎有 timeout 和输出限制
外部引擎超时后 process tree 被终止
普通日志不记录绝对路径
容器探针覆盖 zip slip、encrypted archive、zip64、重复 entry、伪 OOXML
OLE CFB 至少能识别 ole_cfb 或 legacy_office_unknown
文本探针能正确处理 UTF-16、GBK、超长单行文本
polyglot_suspected 最小启发式可识别并默认阻止发送
```

### 17.3 第三阶段：工程质量闭环

```text
fixture 使用 expected.json 黄金样本
Magika score 漂移不会导致脆弱测试
错误扩展名样本可触发冲突
高风险类型默认 blocked
大文件不会阻塞 renderer
缓存 key 包含 taxonomyVersion、taxonomyMapVersion、mergeRulesVersion、probe version
缓存可命中并可失效
cache hit 不作为 evidence source
引擎不可用时可降级
用户覆盖不删除原始 evidence
用户覆盖不污染 detection cache
模型切换只重算 SendPlan，不重复检测文件
普通日志扫描确认无绝对路径、contentToken、完整 hash
```

---

## 18. 推荐实现拆分

### 18.1 模块划分

```text
src/next/file-type/types.ts
src/next/file-type/fileAccessRef.ts
src/next/file-type/fileReadAdapter.ts
src/next/file-type/taxonomy.ts
src/next/file-type/taxonomyMap.ts
src/next/file-type/mimeMap.ts
src/next/file-type/magicDetector.ts
src/next/file-type/textProbe.ts
src/next/file-type/magikaDetector.ts
src/next/file-type/containerProbe.ts
src/next/file-type/evidenceMerge.ts
src/next/file-type/fileTypeStaticPolicy.ts
src/next/file-type/sendRouteMapping.ts
src/next/file-type/sendPlanCandidate.ts
src/next/file-type/fileTypeCache.ts
src/next/file-type/detectionJobState.ts
src/next/file-type/userOverride.ts
src/next/file-type/pluginRegistry.ts
src/next/file-type/externalEngineRegistry.ts
src/next/file-type/diagnostics.ts
src/next/file-type/fixtureTestUtils.ts
src/next/file-type/fileTypeService.ts
```

### 18.2 核心服务接口

```ts
export interface FileTypeService {
  detectBasic(fileRef: FileAccessRef): Promise<FileTypeVerdict>;
  detectFull(fileRef: FileAccessRef, options: DetectFullOptions): Promise<FileTypeVerdict>;
  getSendRoutes(
    verdict: FileTypeVerdict,
    modelCapabilities: ModelInputCapabilities,
    userPrefs: FileTypeUserPrefs,
    engineAvailability: EngineAvailability,
    override?: FileUserOverride,
  ): Promise<SendPlanCandidate[]>;
  applyUserOverride(
    verdict: FileTypeVerdict,
    override: FileUserOverride,
  ): Promise<SendPlanCandidate[]>;
}
```

### 18.3 与现有文件管线的关系

```text
fileIngestionService
  创建 FileAccessRef
  调用 detectBasic
  保存初始 FileTypeVerdict 和 detection state

fileTypeService
  负责任务调度、缓存读取、检测执行、写回校验

magicDetector / textProbe / magikaDetector / containerProbe
  只产生 evidence
  不直接产生 SendPlan

evidenceMerge
  合并 evidence，生成 primary、conflicts、flags

fileTypeStaticPolicy
  基于 verdict 生成静态策略

sendRouteMapping
  基于 verdict + modelCapabilities + userPrefs + engineAvailability 生成 SendPlanCandidate

conversationDraftClient
  展示 detection state、primary、staticPolicy、recommended route

sendPlanService
  只消费 verdict 与 SendPlanCandidate
  不重复做文件类型检测

derivativeJobService
  在需要预览或转换时调用 detectFull 或 parser validation

messageAttachmentService
  保存最终 verdict、用户覆盖路线和发送方式
```

---

## 19. MVP 与优先级

### 19.1 MVP 必须包含

```text
FileAccessRef / FileReadAdapter
FileTypeDetectionState
FileTypeVerdict 数据模型
Taxonomy 与 taxonomyMap
magicDetector
textProbe
Magika detector
OOXML / ODF / EPUB containerProbe
OLE CFB 最小识别
证据合并规则
fileTypeStaticPolicy
PreviewMode
SendPlanCandidate
SendRoute 映射
用户覆盖处理路线
基础缓存
polyglot 最小启发式
fixture expected.json 测试
日志脱敏测试
```

### 19.2 MVP 可以暂缓

```text
Tika 插件完整管理
LibreOffice 插件自动安装
DROID / Siegfried 集成
复杂归档格式递归扫描
完整安全扫描
企业策略管理
插件签名与 trustedRoot
polyglot 高级检测
完整 OLE 旧 Office 细分
```

### 19.3 P0

```text
FileAccessRef / FileReadAdapter
FileTypeDetectionState
taxonomy + taxonomyMap
FileTypeVerdict 数据不变量
evidence merge 阈值与 tie-breaker
PreviewMode 与静态策略拆分
SendPlanCandidate
SendRoute 缺项补齐
日志脱敏测试
```

### 19.4 P1

```text
容器探针安全细则
文本探针采样边界
缓存 key
用户覆盖持久化范围
fixture expected.json 框架
polyglot 最小启发式
```

### 19.5 P2

```text
插件签名与 trustedRoot
完整 OLE 旧 Office 细分
polyglot 高级检测
DROID / Siegfried 插件
企业策略管理
更复杂 archive 递归策略
```

---

## 20. 最终一致性约束

以下约束必须进入代码评审 checklist：

```text
1. FileFormatId 中的每个格式必须在 sendRouteMapping 中有默认处理结果。
2. SendRoute 枚举中的每个 route 必须有 UI labelCode、风险说明和可测断言。
3. FileTypeVerdict 中只保存与文件内容和检测规则相关的静态结论。
4. 当前模型能力、用户偏好、外部引擎可用性只影响 SendPlanCandidate，不污染 detection cache。
5. 用户覆盖不得修改 detector evidence、primary verdict 或 cached verdict，只能生成 effective plan。
6. cache hit 不作为 evidence source 参与合并，只作为 provenance 或 diagnostic event。
7. PreviewMode 必须支持部分可用状态，例如安全文本预览可用、原生渲染禁用。
8. MVP 至少实现 polyglot 最小启发式，高级 polyglot 检测可后续扩展。
9. 所有脚本型 source_code 必须有 languageId、shebang 或 executableScript 元信息，否则不得仅凭 source_code 判断执行风险。
10. 每个新增 FileFormatId 必须同步补齐 taxonomy descriptor、taxonomyMap、证据来源、默认 SendRoute、fixture 断言和日志脱敏断言。
11. 外部引擎必须使用参数数组调用，默认 shell: false。
12. renderer 不得持有真实绝对路径、contentToken 原文或外部命令参数。
13. archive / container 检测不得递归解压，不得写出 entry 内容到原始路径。
14. blocked 文案不得写成恶意判定，只表达当前策略禁止执行。
```

最终稳定形态应为：

```text
检测证据可追溯
合并规则可复核
策略阻断可解释
预览模式可分级
发送路线可比较
用户覆盖可审计
缓存命中可失效
插件故障可隔离
日志隐私可验证
```

---

## 21. 参考资料

[1] Google Magika GitHub repository, Fast and accurate AI powered file content types detection. https://github.com/google/magika  
[2] Magika documentation, Models & Supported Content Types. https://securityresearch.google/magika/core-concepts/models-and-content-types/  
[3] Apache Tika 3.2.1 Documentation, Content Detection. https://tika.apache.org/3.2.1/detection.html  
[4] Freedesktop.org Shared MIME-info Database Specification. https://specifications.freedesktop.org/shared-mime-info-spec/latest-single/  
[5] Electron Documentation, Security. https://www.electronjs.org/docs/latest/tutorial/security  
[6] Node.js Documentation, Child process. https://nodejs.org/api/child_process.html  
[7] Microsoft Support, Open XML Formats and file name extensions. https://support.microsoft.com/en-us/office/open-xml-formats-and-file-name-extensions-5200d93c-3449-4380-8e11-31ef14555b18  
[8] W3C, EPUB Open Container Format 3.2. https://www.w3.org/publishing/epub32/epub-ocf.html  
[9] PKWARE, ZIP APPNOTE. https://support.pkware.com/pkzip/appnote  
[10] Snyk, Zip Slip Vulnerability. https://security.snyk.io/research/zip-slip-vulnerability  
[11] The National Archives, DROID file format identification tool and PRONOM signatures. https://www.nationalarchives.gov.uk/information-management/manage-information/preserving-digital-records/droid/
