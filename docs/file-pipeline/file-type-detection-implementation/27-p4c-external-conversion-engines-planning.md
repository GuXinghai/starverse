# P4-C：Tika / LibreOffice / ffprobe / Pandoc 优先级与深度转换闭环规划

Status: **P4-C planning only — not implementation completed**

## 1. P4-C 阶段定位

P4-C 是 Phase 4 的第三个任务包，目标是在 P4-A（官方限定插件市场最小闭环）和 P4-B（Magika official managed plugin）已完成基础上，规划 Tika / LibreOffice / ffprobe / Pandoc 四个外部转换引擎的引入优先级、最小能力边界、first implementation scope 以及深度转换闭环策略。

P4-C 是 **planning 阶段**。P4-C 不实现真实转换链路，不提交真实 runtime/binary/jar/office 包，不接真实深度转换。

P4-C 完成后输出 P4-C1~P4-C7 实施拆包建议，进入 P4-C implementation 阶段。

P4-C 不代表 Phase 4 completed。

## 2. P4-A / P4-B 输入条件

P4-C 以以下已完成边界作为输入：

### 2.1 P4-A 交付（`20-p4a-official-plugin-marketplace-closeout.md`）

- **官方 plugin catalog / signature / hash 模块**（`pluginCatalog.ts`, `pluginCatalogSignature.ts`）
  - catalog schema 版本 `1`，source `official`
  - Ed25519 签名校验
  - catalog entry 包含 `packageSha256`, `manifestSha256`

- **插件 registry DB schema + repo**（`enginePluginRegistryRepo.ts`）
  - `EnginePluginInstallRootKind`：`managed_root`, `managed_cache`, `test_root`
  - installState：installed / enabled / disabled / failed / uninstalled

- **插件 lifecycle service + IPC/client**（`enginePluginLifecycleService.ts`）
  - `registerLocalOfficialPlugin`：签名→hash→manifest→integrity→registry 安全闭环
  - `enablePlugin` / `disablePlugin` / `uninstallPlugin` / `runHealthCheck`

- **Trusted roots 注入 + 失败闭锁**（`officialPluginTrustedRoots.ts`）
  - 生产无配置 → `official_trusted_root_unconfigured`
  - 测试环境自动注入 test trusted root

- **Settings UI 最小闭环**（`EnginePluginSettingsPanel.vue`）
  - 多引擎列表、Register/Enable/Disable/Uninstall/Health Check

### 2.2 P4-B 交付（`26-p4b-magika-official-managed-plugin-closeout.md`）

- **Magika package spec**（P4-B1）：`MagikaPackageLayoutSpec`，布局校验
- **Managed root registration**（P4-B2）：`managed_root` / `test_root` 语义切换
- **Classify runner**（P4-B3）：`magikaClassifyRunner.ts`，受控 spawn，10MB 输入上限
- **detectFull integration**（P4-B4）：modelVersion 联动，stale 检测
- **Gated real-runtime tests**（P4-B4）：`magikaClassifyRunner.real.test.ts`

### 2.3 可复用基础设施（共享层）

| 模块 | 文件 | 复用能力 |
|------|------|---------|
| Engine type system | `externalEngineTypes.ts` | `KNOWN_ENGINE_IDS` 已包含 tika/libreoffice/ffprobe/pandoc；`ENGINE_CAPABILITIES` 已覆盖所需能力；`ENGINE_FAILURE_REASONS` 可复用 |
| Engine health runner | `externalEngineHealth.ts` | `createDefaultHealthRunner` + `externalProcessRunner`；`mapProcessRunToProbe`；3s 默认 timeout |
| Engine availability | `externalEngineAvailability.ts` | `computeEngineAvailability`，capability→route 映射 |
| External process runner | `externalProcessRunner.ts` | `runExternalProcess`：shell=false、timeout、output cap、kill tree、路径脱敏 |
| Process policy | `externalProcessPolicy.ts` | 双模式 `health_check`(3s)/`process`(10s)、脚本解释器阻断、.bat/.cmd 阻断 |
| Plugin catalog | `pluginCatalog.ts` | 签名验证、hash 验证、entry 查找 |
| Send route mapping | `sendRouteMapping.ts` | `buildSendPlanCandidates`、`evaluateEngineGate`、`routeRequiresJob` |
| Derivative job service | `derivativeJobService.ts` | 完整 job 生命周期、错误分类、diagnostic summary |
| Plugin lifecycle | `enginePluginLifecycleService.ts` | register/enable/disable/uninstall/health check 全链路 |
| Settings UI | `EnginePluginSettingsPanel.vue` | 多引擎列表显示、生命周期操作 |

## 3. P4-B follow-ups 登记

以下 P4-B closeout（`26-p4b-magika-official-managed-plugin-closeout.md`）中登记的 follow-ups 进入 P4-C：

| # | P4-B follow-up | P4-C 处理方式 |
|---|---------------|--------------|
| 1 | Production signing workflow must be confirmed by Owner | 不阻塞 P4-C planning；在 P4-C implementation 阶段继续延用 test trusted root |
| 2 | Production trusted root / official catalog signing key remains Owner-controlled | P4-C 不新增 signing key；Tika/LibreOffice/ffprobe/Pandoc catalog entry 复用同一 catalog 签名体系 |
| 3 | Electron manual smoke test remains required for Settings UI and managed_root | P4-C 手工烟测清单包含 conversion engine UI 展示（见第 17 节） |
| 4 | Real model/runtime package is not committed | P4-C 同样不提交任何真实 Tika jar / LibreOffice binary / ffprobe binary / Pandoc binary |
| 5 | P4-C must not treat Magika completion as completion of all external engines | P4-C 本文件确认此口径 |
| 6 | `test_root` → `managed_root` 切换在 P4-B2 已完成 | P4-C 新增引擎沿用同一 `managed_root` / `test_root` 语义 |
| 7 | catalog 签名→hash→manifest→integrity 安全闭环已在 P4-B 验证 | P4-C 新增引擎的 catalog entry 复用同一验证链路 |

## 4. 引擎优先级决策

### 4.1 优先级排序

| 优先级 | 引擎 | 理由 |
|--------|------|------|
| **P0** | Tika | 覆盖最广的文档格式检测/提取/元数据能力；单一 JAR 部署；Java 生态成熟；可替代 LibreOffice 的纯文本提取场景 |
| **P1** | LibreOffice | Office 文档→PDF/text/HTML 转换是用户最强需求；headless 模式成熟；UNO API 可控 |
| **P2** | ffprobe | 音视频元数据/流探测是 sendRouteMapping 音频/视频路线的前置依赖；CLI 接口稳定 |
| **P3** | Pandoc | 文档格式互转能力强大但 Starverse 核心场景优先级低于 Office→文本/PDF；可作为增强能力延后 |

### 4.2 优先级决策依据

1. **Tika P0**：detect（MIME 检测）+ extract（文本提取）+ metadata（元数据深度提取）是 sendRouteMapping 中 `extracted_text` / `converted_markdown` 路线的关键能力。Tika 覆盖 Office/PDF/HTML/EPUB 等格式，单一引擎覆盖度最高。

2. **LibreOffice P1**：Office→PDF 转换是 `converted_pdf` 路线的前置。headless `--convert-to` 模式可生成高质量 PDF。LibreOffice 的文本提取由 Tika 覆盖，故 LibreOffice 聚焦在 PDF 生成和 intermediate 格式。

3. **ffprobe P2**：`selected_frames` 和 `extracted_audio` 路线需要音视频元数据（时长、编码、流信息）。ffprobe 是最成熟的开源 probe 工具，CLI 输出稳定可解析。

4. **Pandoc P3**：markdown↔docx↔html↔epub 互转能力强大，但 Starverse 核心链路（文件→文本→AI 模型）对 Pandoc 的依赖度低于前三者。epub→text 可由 Tika 覆盖。

### 4.3 P4-C implementation 只启动 Tika（P0）

P4-C implementation 阶段（P4-C1~P4-C7）只完成 Tika（P0）的 first implementation scope。LibreOffice（P1）、ffprobe（P2）、Pandoc（P3）的 planning-to-contract 文档在 P4-C 完成，但实现延期到后续阶段。

## 5. 每个引擎的最小能力边界

### 5.1 Tika

| 能力 | 边界 | 说明 |
|------|------|------|
| **detect** | MIME 检测（`--detect`） | 输入 bytes → Tika 检测 → 标准化 MIME 映射到 formatId |
| **extract** | 纯文本提取（`--text`） | 输入 bytes → Tika 提取 → UTF-8 纯文本输出 |
| **metadata** | 元数据提取（`--metadata`） | 输入 bytes → Tika 提取 → 结构化 JSON metadata（不包含路径/文件名） |
| **输入上限** | 100MB（可配置） | 超过上限拒绝或截断；复用 P3-A 安全底座 |
| **输出上限** | 10MB 文本 / 1MB metadata JSON | 超限截断，标记 `output_limit_exceeded` |
| **timeout** | 30s（可配置） | 超过 timeout 终止进程并返回 `engine_timeout` |

### 5.2 LibreOffice

| 能力 | 边界 | 说明 |
|------|------|------|
| **Office→PDF** | headless `--convert-to pdf` | 输入 Office 文档 bytes → sandbox temp file → 转换 → PDF bytes |
| **Office→text** | headless `--convert-to txt` | 备选文本提取路径（主路径由 Tika 覆盖） |
| **Office→HTML** | headless `--convert-to html` | intermediate 格式（用于后续 markdown 转换） |
| **输入上限** | 50MB（可配置） | Office 文档通常较小 |
| **输出上限** | 50MB PDF / 10MB text / 50MB HTML | 视输出格式 |
| **timeout** | 60s（可配置） | Office 转换耗时较长 |

### 5.3 ffprobe

| 能力 | 边界 | 说明 |
|------|------|------|
| **stream probe** | `ffprobe -v quiet -print_format json -show_streams -show_format` | 输入音视频 bytes → sandbox temp file → probe → 结构化 JSON |
| **frame selection** | `ffmpeg -ss <time> -i <input> -vframes 1` | 关键帧提取（由 ffprobe 提供时间点，ffmpeg 执行提取） |
| **audio extraction** | `ffmpeg -i <input> -vn -acodec copy` | 音轨分离（由 ffprobe 提供流索引） |
| **输入上限** | 500MB（可配置） | 音视频文件较大 |
| **输出上限** | 1MB probe JSON / 10MB frame image / 50MB audio | 视输出类型 |
| **timeout** | 30s probe / 120s extraction | 提取耗时较长 |

### 5.4 Pandoc

| 能力 | 边界 | 说明 |
|------|------|------|
| **document→markdown** | `pandoc -f <format> -t markdown` | 输入文档 bytes → sandbox temp file → 转换 → markdown text |
| **document→plain** | `pandoc -f <format> -t plain` | 纯文本输出（备选） |
| **epub→text** | `pandoc -f epub -t plain` | EPUB 文本提取 |
| **输入上限** | 50MB（可配置） | 文档文件通常较小 |
| **输出上限** | 10MB markdown / 10MB plain text | 文本输出 |
| **timeout** | 30s（可配置） | 文档转换耗时可控 |

## 6. 每个引擎的 non-goals（明确禁止项）

### 6.1 Tika non-goals

- 不实现 Tika Server 模式（仅 CLI `tika-app.jar`）
- 不支持 OCR（Tesseract 集成）
- 不支持语言检测
- 不支持递归容器提取（仅一层）
- 不支持自定义 parser 配置
- 不实现网络资源提取（仅本地 bytes）
- 不支持 MIME 自定义映射（仅 Tika 内置检测）

### 6.2 LibreOffice non-goals

- 不支持宏执行
- 不支持 ActiveX / OLE 自动化
- 不支持实时协作编辑
- 不支持 PDF→Office 反向转换
- 不支持自定义 UNO 扩展
- 不实现 LibreOfficeKit API（仅 CLI）
- 不支持 visio / project 格式

### 6.3 ffprobe non-goals

- 不实现实时流处理
- 不支持 DRM 保护内容
- 不支持硬件加速解码
- 不支持自定义编码参数
- 不支持转码（仅 probe + 关键帧/音轨提取）
- 不实现完整 ffmpeg 能力（仅 ffprobe + 最小 ffmpeg）

### 6.4 Pandoc non-goals

- 不支持自定义模板
- 不支持 citation 处理
- 不支持 Lua 过滤器
- 不支持 PDF 输出（依赖 LaTeX）
- 不支持 docx→pdf 直接转换（由 LibreOffice 覆盖）
- 不支持 PowerPoint 格式
- 不支持电子表格格式

## 7. 每个引擎的 official managed plugin manifest / package / integrity 策略

### 7.1 统一策略

所有四个引擎遵循 P4-A / P4-B 建立的 official managed plugin 体系：

```
Trusted Root (Ed25519)
  → catalog (签名验证)
    → catalog entry (manifestSha256 + packageSha256)
      → manifest (integrity: runtimeEntry + 核心文件)
        → engine registry (installState / healthStatus)
```

### 7.2 Tika package layout

```text
engines/tika/
├── manifest.json
├── runtime/
│   ├── tika-app.jar          # Tika app JAR（核心 runtime）
│   └── healthcheck.sh/bat    # 健康检查脚本（tika --version 或 --detect 空输入）
├── NOTICE
├── ATTRIBUTION
└── README.md
```

**manifest.json 必填字段**（继承 `ManagedEnginePluginManifest` 接口）：

| 字段 | 值 |
|------|---|
| `engineId` | `"tika"` |
| `displayName` | `"Apache Tika"` |
| `version` | 对应 `tika-app.jar` 版本 |
| `platform` | `"any"`（Java 跨平台） |
| `kind` | `"plugin"` |
| `capabilities` | `["text_extraction", "document_conversion"]` |
| `supportedFormatIds` | Office/PDF/HTML/EPUB 等 |
| `integrity` | `runtime/tika-app.jar` 的 sha256 |

### 7.3 LibreOffice package layout

```text
engines/libreoffice/
├── manifest.json
├── runtime/                   # LibreOffice portable / 预安装路径引用
│   └── install_ref           # 若使用本地已安装 LibreOffice，manifest.runtimeEntry 指向 wrapper 脚本
├── NOTICE
├── ATTRIBUTION
└── README.md
```

### 7.4 ffprobe package layout

```text
engines/ffprobe/
├── manifest.json
├── runtime/
│   ├── ffprobe[.exe]         # ffprobe 二进制
│   └── ffmpeg[.exe]          # ffmpeg 二进制（用于 frame/audio 提取）
├── NOTICE
├── ATTRIBUTION
└── README.md
```

### 7.5 Pandoc package layout

```text
engines/pandoc/
├── manifest.json
├── runtime/
│   ├── pandoc[.exe]          # pandoc 二进制
│   └── healthcheck.sh/bat    # pandoc --version
├── NOTICE
├── ATTRIBUTION
└── README.md
```

### 7.6 Integrity 策略

| 引擎 | 核心文件 | integrity 覆盖 |
|------|---------|---------------|
| Tika | `tika-app.jar` | sha256（manifest.integrity） |
| LibreOffice | 安装目录 soffice/simpress 等 | 指向本地已安装路径（不使用包内 runtime），integrity 检查 wrapper 脚本 sha256 |
| ffprobe | `ffprobe`, `ffmpeg` | sha256（manifest.integrity） |
| Pandoc | `pandoc` | sha256（manifest.integrity） |

### 7.7 不支持的部署方式

- 不联网下载 runtime（所有 runtime 必须预置或本地已安装）
- 不通过包管理器自动安装（apt/brew/choco）
- 不支持自定义 runtime 路径（仅 managed_root 和本地已安装路径）
- 不提交真实 runtime binary/jar 到 Starverse 主仓

## 8. 每个引擎的 health check 策略

### 8.1 通用 health check 流程

所有引擎复用 `externalEngineHealth.ts` 的 `createDefaultHealthRunner`：

```
runHealthCheck → createDefaultHealthRunner → externalProcessRunner.spawn → mapProcessRunToProbe
```

### 8.2 各引擎 health check 命令

| 引擎 | 命令 | args | 说明 |
|------|------|------|------|
| Tika | `java` | `["-jar", "<tika-app.jar>", "--version"]` 或 `["-jar", "<tika-app.jar>", "--detect", "<empty-fixture>"]` | 验证 JAR 可执行 + Java 可用 |
| LibreOffice | `soffice` | `["--headless", "--version"]` | 验证 headless 模式可用 |
| ffprobe | `ffprobe` | `["-version"]` | 验证二进制可用 |
| Pandoc | `pandoc` | `["--version"]` | 验证二进制可用 |

### 8.3 Health check 超时

| 引擎 | 超时 | 说明 |
|------|------|------|
| Tika | 10s | JVM 冷启动较慢，health check 需适度放宽 |
| LibreOffice | 5s | headless 模式启动通常较快 |
| ffprobe | 3s | 轻量二进制，启动快 |
| Pandoc | 3s | 轻量二进制，启动快 |

### 8.4 Health check 覆盖项（统一）

1. 命令可执行（`command_not_found` → `engine_unavailable`）
2. exit code 0（`process_exit_nonzero` → `engine_failed`）
3. 不超时（`process_timeout` → `engine_timeout`）
4. 不被策略阻断（`policy_*` → `disabled_by_policy`）
5. manifest/integrity 可选（前端 `registerLocalOfficialPlugin` 时已验证）

## 9. 每个引擎的 externalProcessRunner 调用边界

### 9.1 当前 externalProcessPolicy 模式

`externalProcessPolicy.ts` 当前支持两种模式：
- `health_check`：3s 默认 timeout，1MiB stdout / 256KiB stderr
- `process`：10s 默认 timeout，1MiB stdout / 256KiB stderr

### 9.2 P4-C 需要的新模式

P4-C implementation 需要新增 `conversion` 模式以支持更长 timeout 和更大输出：

| 模式 | 默认 timeout | 默认 stdout | 默认 stderr | 硬上限 timeout |
|------|-------------|------------|------------|---------------|
| `health_check` | 3s | 1MiB | 256KiB | 60s |
| `process` | 10s | 1MiB | 256KiB | 60s |
| `conversion`（新增） | 60s | 50MiB | 1MiB | 300s |

**注意**：P4-C planning 阶段不建议新增 `conversion` mode。这是 P4-C implementation 阶段的决策，需与 P3-A 安全底座 review 对齐。

### 9.3 各引擎调用模式

| 引擎 | 操作 | 建议模式 | 建议 timeout | 建议 stdout cap |
|------|------|---------|-------------|----------------|
| Tika | detect | process | 10s | 1MiB |
| Tika | extract text | process | 30s | 10MiB |
| Tika | metadata | process | 15s | 1MiB |
| LibreOffice | convert to PDF | conversion | 60s | 50MiB |
| LibreOffice | convert to text | process | 30s | 10MiB |
| ffprobe | stream probe | process | 30s | 1MiB |
| ffprobe | frame extraction | conversion | 60s | 10MiB |
| ffprobe | audio extraction | conversion | 120s | 50MiB |
| Pandoc | convert to markdown/text | process | 30s | 10MiB |

### 9.4 统一安全约束（所有引擎复用 P3-A 底座）

1. **shell: false**（硬编码，`externalProcessPolicy.ts` 强制）
2. **脚本解释器阻断**（cmd.exe / powershell.exe / wscript.exe 等）
3. **.bat/.cmd 阻断**（`allowBatchEntrypoint` 默认 false）
4. **路径脱敏**（`sanitizeForProcessResult`，替换 Windows/Unix 路径模式）
5. **contentToken/fullHash 脱敏**
6. **stdout/stderr 大小限制**
7. **kill tree**（超时或 output limit 时触发）
8. **renderer 不直接访问文件路径**（输入走 sandbox copy 或 memory bytes）

## 10. conversion job / derivative job / parser validation 关系

### 10.1 当前 derivativeJobService 架构

`derivativeJobService.ts` 当前支持的 `derivedKind`：
- `extracted_text`：已实现（仅支持 text assets 和 PDF annotations）
- `transcript`：已实现（OpenRouter 音频转录）
- `embedding_vector`：已实现（OpenRouter embeddings）
- `preview_optimized`：已实现（图片预览生成）
- `converted_pdf`：**reserved，未实现**（抛出 `conversion_not_implemented`）
- `thumbnail`, `ocr_text`, `send_optimized`：reserved，未实现

### 10.2 三层关系模型

```text
┌─────────────────────────────────────────────────────────────┐
│                    Send Plan Candidate                       │
│  route: converted_markdown / converted_pdf / extracted_text  │
│  requiresJob: true                                           │
│  engineGate: documentConversion / textExtraction             │
└────────────────────────┬────────────────────────────────────┘
                         │ 触发
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Conversion Job (新增)                       │
│  职责：编排外部引擎调用 → 生成 derivative                      │
│  engineId: tika / libreoffice / ffprobe / pandoc             │
│  operation: detect / extract / convert / probe                │
│  输入：asset bytes (sandbox copy)                             │
│  输出：raw conversion output (bytes/text/json)                │
└────────────────────────┬────────────────────────────────────┘
                         │ 产出
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Derivative Job Service                      │
│  derivedKind: converted_markdown / converted_pdf /            │
│               rendered_images / extracted_text               │
│  职责：存储 derivative、管理 job 状态、错误分类               │
│  输入：conversion output + asset metadata                    │
│  输出：FileDerivativeRecord (ready/failed)                   │
└─────────────────────────────────────────────────────────────┘
                         │ 写入
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   File Derivative                            │
│  storageUri: derivative storage path                         │
│  metaJson: source metadata + conversion diagnostics          │
│  status: ready / failed / deleted                            │
└─────────────────────────────────────────────────────────────┘
```

### 10.3 Parser Validation 定位

Parser validation 不引入新的 validation layer。当前 `fileTypeDetectionService.ts` 的 `detectFull` 流已包含：
1. extension map evidence
2. MIME map evidence
3. magic bytes evidence
4. container probe evidence
5. text probe evidence
6. Magika runtime probe evidence（P4-B 已接入）

Tika detect 能力（MIME 检测）作为第 7 个 evidence source 进入 `detectFull` 的 evidence 合并，但不进入 `detectBasic`。这类似于 Magika 的 gated runtime probe 模式。

**约束**：
- Tika detect 失败不影响 Core Detector（与 Magika 一致）
- Tika detect evidence 评分不覆盖 strong magic（900+120）或 containerProbe（1000）
- Tika detect 需要 engine available + healthy 时才调用

### 10.4 新增 derivedKind 建议

| derivedKind | 用途 | 关联引擎 | 说明 |
|-------------|------|---------|------|
| `converted_markdown` | Office/PDF/HTML→Markdown | Tika, Pandoc | 新增（当前不存在） |
| `converted_pdf` | Office→PDF | LibreOffice | 已 reserved，待实现 |
| `rendered_images` | Presentation→Images | LibreOffice | 新增（当前不存在） |
| `extracted_text`（扩展） | 非 text asset→text | Tika | 当前仅支持 text assets |
| `probe_metadata` | 音视频 metadata | ffprobe | 新增 |
| `selected_frames` | 视频关键帧 | ffprobe+ffmpeg | 新增 |
| `extracted_audio` | 音轨分离 | ffprobe+ffmpeg | 新增 |

**注意**：`converted_markdown` 和 `rendered_images` 不在当前 `DerivedKind` 类型和 SQL schema CHECK constraint 中，P4-C implementation 需要扩展类型定义和 schema migration。

## 11. Route mapping strategy

### 11.1 当前 sendRouteMapping 路线矩阵

`sendRouteMapping.ts` 已定义以下 conversion route：

| Route | requiresJob | engineGate |
|-------|-------------|------------|
| `converted_markdown` | true | `documentConversion` |
| `converted_plain_text` | true | `documentConversion` |
| `converted_csv` | true | `spreadsheetConversion` |
| `converted_tsv` | true | `spreadsheetConversion` |
| `converted_pdf` | true | (无独立 gate，走 `documentConversion`) |
| `rendered_images` | true | `renderedImages` \|\| `presentationConversion` |
| `extracted_text` | true | `textExtraction` |
| `extracted_audio` | true | `audioExtraction` |
| `selected_frames` | true | `frameSelection` |

### 11.2 各路线对应的引擎和 derivedKind

| Route | 首选引擎 | derivedKind | 说明 |
|-------|---------|-------------|------|
| `converted_markdown` | Tika | `converted_markdown` | Tika extract text → 后处理为 markdown |
| `converted_markdown`（备选） | Pandoc | `converted_markdown` | Pandoc 直接转换 |
| `converted_pdf` | LibreOffice | `converted_pdf` | Office→PDF |
| `converted_plain_text` | Tika | `extracted_text` | Tika extract text（纯文本） |
| `extracted_text` | Tika | `extracted_text`（扩展） | 当 asset 非 text kind 时，Tika 提取文本 |
| `rendered_images` | LibreOffice | `rendered_images` | Presentation→slide images |
| `selected_frames` | ffprobe+ffmpeg | `selected_frames` | 视频关键帧提取 |
| `extracted_audio` | ffprobe+ffmpeg | `extracted_audio` | 音轨分离 |

### 11.3 sendRouteMapping 消费 engineAvailability 的方式

`sendRouteMapping.ts` 的 `buildSendPlanCandidates` 已经通过 `evaluateEngineGate` 函数消费 `SendRouteMappingEngineAvailability`：

```typescript
// 已存在的 engine gate 检查（sendRouteMapping.ts:236-258）
function evaluateEngineGate(route, engines) {
  case 'converted_markdown':
    return { available: engines.documentConversion, reason: 'engine_document_conversion_unavailable' }
  case 'extracted_text':
    return { available: engines.textExtraction, reason: 'engine_text_extraction_unavailable' }
  // ...
}
```

`engineAvailability` 由 `externalEngineAvailability.ts` 的 `computeEngineAvailability` 产出的 `routeAvailability` 字段提供。当 Tika engine 注册且 healthy 时：
- `documentConversion` = true（Tika 提供）
- `textExtraction` = true（Tika 提供）

**sendRouteMapping 不重新检测文件类型**。它只消费：
1. `verdict`（已有的 FileTypeVerdict）
2. `engineAvailability.routeAvailability`（由 engine health/availability 计算而来）
3. `modelCapabilities`（模型能力）
4. `userPrefs`（用户偏好）

### 11.4 Conversion candidates 与 route 的关系

`buildSendPlanCandidates` 返回的 `SendPlanCandidate[]` 中，每个 candidate 的 `route` 字段决定 UI/发送逻辑。当 `engineGate.available === false` 时，对应 candidate 的 `blocked = true`，`blockedBy` 包含 `engine_document_conversion_unavailable` 等 reason。

**P4-C 不做**：
- 不新增 `conversionCandidate` 独立类型
- 不重构 `buildSendPlanCandidates` 主逻辑
- 不修改 `requiresJob` 判断逻辑
- 不新增 `requiresEngineIds` 字段（已有 `evaluateEngineGate` 足够）

## 12. Office / PDF / HTML / EPUB 深度转换阶段切片

### 12.1 阶段切片策略

深度转换不一次性完成全部格式。按引擎成熟度、用户需求和风险分级切片：

| 阶段 | 格式 | 路线 | 引擎 | 交付物 |
|------|------|------|------|--------|
| **C-1** (P4-C impl) | Office (docx/xlsx/pptx) → text | `extracted_text` → `converted_markdown` | Tika | Tika extract text + 基础 markdown 后处理 |
| **C-1** (P4-C impl) | PDF → text | `extracted_text` | Tika | Tika extract text |
| **C-1** (P4-C impl) | HTML → markdown | `converted_markdown` | Tika（检测后复用现有 htmlToMarkdownSafe） | 复用 `derivativeJobService.ts` 的 htmlToMarkdownSafe |
| **C-2** (延后) | Office → PDF | `converted_pdf` | LibreOffice | Office headless PDF 转换 |
| **C-2** (延后) | EPUB → text | `extracted_text` | Tika 或 Pandoc | EPUB 文本提取 |
| **C-3** (延后) | Presentation → images | `rendered_images` | LibreOffice | PPT→slide PNG 导出 |
| **C-3** (延后) | Office → HTML | intermediate（internal 用） | LibreOffice | 中间格式，不直接对用户暴露 |
| **C-4** (延后) | 音视频 metadata | probe（不产生 derivative） | ffprobe | JSON metadata 用于 route 决策 |
| **C-4** (延后) | 视频关键帧 | `selected_frames` | ffprobe+ffmpeg | 关键帧图片 |
| **C-5** (延后) | 文档格式互转 | `converted_markdown` (Pandoc path) | Pandoc | markdown↔docx↔html↔epub |

### 12.2 各阶段的衍生关系

```text
                     ┌──────────────┐
                     │  File Asset  │
                     └──────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        detectBasic    detectFull    sendPlanService
                            │             │
                    ┌───────┴───────┐     │
                    │  Verdict +    │     │
                    │  Evidence     │     │
                    └───────┬───────┘     │
                            │             ▼
                            │    SendPlanCandidate[]
                            │      route: converted_markdown
                            │      requiresJob: true
                            │      engineGate: OK ✓
                            │             │
                            ▼             ▼
                    ┌─────────────────────────┐
                    │  Conversion Job (新增)   │
                    │  engineId: tika          │
                    │  operation: extract      │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │  Derivative Job          │
                    │  derivedKind:            │
                    │    converted_markdown    │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │  File Derivative         │
                    │  storageUri + metaJson   │
                    │  status: ready           │
                    └─────────────────────────┘
```

## 13. JS / macro / active content 禁止策略

### 13.1 硬禁止项

| 禁止项 | 实施方式 | 覆盖范围 |
|--------|---------|---------|
| JavaScript 执行 | 不将 HTML/EPUB/Office 中的 JS 传入任何 JS 引擎 | Tika text extract 只返回文本，不执行脚本 |
| 宏执行 | Office/EPUB 中的 VBA/宏不触发 | LibreOffice 使用 `--infilter` 禁用宏；Tika 不提取宏 |
| ActiveX 控件 | 不加载/执行 | LibreOffice headless 模式默认禁用 |
| 外部资源加载 | 转换过程中不发起网络请求 | 所有引擎在 sandbox 环境无网络权限（`externalProcessPolicy` 默认无网络） |
| 动态内容 | 不解析 iframe/object/embed | Tika HTML parser 默认禁用动态内容 |
| XSLT 转换 | 不使用 XSLT | 所有 XML 处理不走 XSLT 路径 |

### 13.2 Tika 特定保护

- Tika 的 `AutoDetectParser` 配置为只提取文本/元数据
- 不使用 `RecursiveParserWrapper`（防止嵌套容器攻击）
- 输入限制 100MB（在 `externalProcessPolicy` 层强制）
- Tika 运行在无网络 sandbox（Java process 无 `-Dhttp.proxyHost`）

### 13.3 LibreOffice 特定保护

- 使用 `--headless --norestore --nofirststartwizard` 参数
- 宏安全级别设为最高（`MacroSecurityLevel=4` 通过环境变量或配置文件）
- 转换后立即清理 sandbox temp 目录
- 不使用 `--infilter` 允许宏执行

### 13.4 现有代码中的保护（可复用）

- `derivativeJobService.ts` 的 `htmlToMarkdownSafe` 已移除 `<script>` 和 `<style>` 标签
- `derivativeJobService.ts` 的 `collectTextConversionWarnings` 已添加 `html_javascript_not_executed` 等 warning
- `fileTypeStaticPolicy` 已有 `scriptable_format` / `macro_capable_document` 的 warning reason codes

## 14. Failure fallback matrix

### 14.1 Engine unavailable / timeout / output cap / invalid output 降级矩阵

| 失败场景 | EngineAvailability | routeAvailability | sendRouteMapping 行为 | detectFull 行为 | 用户可见 |
|---------|-------------------|-------------------|----------------------|----------------|---------|
| engine 未安装 | `tika_unavailable` | `documentConversion=false` | route blocked (`engine_document_conversion_unavailable`) | 无影响 | route grey out |
| engine disabled | `tika_disabled` | `documentConversion=false` | route blocked | 无影响 | route grey out |
| health check cmd not found | `tika_unavailable` | `documentConversion=false` | route blocked | 无影响 | route grey out |
| health check timeout | `tika_timeout` | `documentConversion=false` | route blocked | 无影响 | route 临时不可用 |
| engine healthy | available | `documentConversion=true` | route available | Tika evidence 可用 | route 可选 |
| conversion timeout | health: healthy; output: failed | depends | route available（但 job 失败） | 无影响 | job error toast |
| output limit exceeded | health: healthy; convert: failed | depends | route available（但 job 失败） | 无影响 | job error toast |
| invalid conversion output | health: healthy; convert: failed | depends | route available（但 job 失败） | 无影响 | job error toast |
| Java not installed (Tika) | `tika_unavailable` | `documentConversion=false` | route blocked | 无影响 | route grey out |
| LibreOffice not installed | `libreoffice_unavailable` | `documentConversion=true`（若 Tika 可用仍可 route） | depends on Tika | 无影响 | `converted_pdf` route grey out |
| ffprobe not installed | `ffprobe_unavailable` | `frameSelection=false`, `audioExtraction=false` | video routes blocked | 无影响 | video routes grey out |

### 14.2 降级策略（不阻塞 Core Detector）

核心原则（与 P4-B Magika 一致）：

1. **所有外部引擎失败不阻断 Core Detector**（magic/text/container/extension/MIME detection 不受影响）
2. **所有外部引擎失败不改变 sendRouteMapping 的 verdict 输入**——verdict 已由 Core Detector 确定
3. **engine unavailable → route blocked**：UI 显示 route 不可用，但不影响其他 route
4. **engine available but conversion failed**：route 可选但 job 失败时生成 failed derivative，用户可 retry
5. **引擎间独立**：Tika 失败不影响 ffprobe；LibreOffice 失败不影响 Tika

### 14.3 Derivative job 错误映射

| 场景 | DerivativeErrorCode | 用户可见 |
|------|---------------------|---------|
| engine command not found | `conversion_not_implemented` | "Conversion engine is not available" |
| conversion timeout | `derivative_task_timeout` | "Conversion timed out" |
| output too large | `derivative_task_timeout`（via output limit → kill）| "Conversion output exceeded limit" |
| input too large | `derivative_input_missing` | "File too large for conversion" |
| empty output | `extracted_text_empty` | "No content could be extracted" |
| invalid output | `conversion_not_implemented` (reuse) | "Conversion produced invalid output" |
| sandbox file missing | `derivative_local_file_missing` | "Conversion source file unavailable" |

## 15. Security and privacy boundaries

### 15.1 硬约束（P3-A / P4-A / P4-B 已冻结，P4-C 继承）

| 约束 | 实施 | 验证方式 |
|------|------|---------|
| no real path logs | `sanitizeForProcessResult` 替换 Windows/Unix 路径 | grep 扫描 |
| no contentToken | `sanitizeForProcessResult` 替换 contentToken 模式 | grep 扫描 |
| no fullHash in logs | `sanitizeForProcessResult` 替换 64-char hex hash | grep 扫描 |
| no UI absolute path | IPC DTO 不含 `installRef`/`manifestHash`/`packageSha256`/`contentToken`/`fullHash` | DTO schema 审查 |
| no renderer file access | renderer 不持有真实文件路径，输入走 sandbox copy 或 memory bytes | 静态分析 |
| no shell:true | `externalProcessPolicy` 强制 `shell: false` | `rg "shell:\s*true"` |
| no network in conversion | external process 不授予网络权限 | policy review |
| no private key in repo | 测试签名密钥与 production 密钥分离 | `rg "PRIVATE KEY"` |
| no real path in IPC | DTO 不含绝对路径字段 | DTO test 断言 |

### 15.2 Sandbox copy 边界

所有外部引擎转换的输入文件必须走 sandbox copy：

```
用户文件（storage root 内）
  → copy to tmp/sandbox/{jobId}/input.{ext}
  → 传 sandbox path 给外部进程
  → 外部进程读取 sandbox 副本
  → 外部进程写入 sandbox 输出目录
  → 读取 sandbox 输出
  → 清理 sandbox 目录
```

不使用用户原始文件路径作为外部进程输入。

### 15.3 Conversion output 隐私保护

- Conversion output (markdown/text/JSON) 不包含原始文件路径
- Tika metadata JSON 过滤掉 `resourceName`、`Content-Location` 等可定位字段
- ffprobe JSON 过滤掉 `filename` 字段（sandbox temp path）
- 所有 diagnostic/log 使用脱敏后的摘要信息

## 16. Testing strategy

### 16.1 Fake engine tests（默认 CI 执行）

所有引擎的 runner contract 使用 fake/mock 实现：

- **Tika**：fake Tika runner 返回预定义 MIME/text/metadata JSON，不依赖真实 JAR
- **LibreOffice**：fake LibreOffice runner 返回预转换 PDF/text fixture
- **ffprobe**：fake ffprobe runner 返回预定义 probe JSON fixture
- **Pandoc**：fake Pandoc runner 返回预定义 markdown/text fixture

测试场景：
1. Fake runner 成功路径（input→output mapping）
2. Fake runner 失败路径（timeout / output limit / invalid output）
3. Engine availability 计算（基于 fake engine records）
4. Route mapping 与 engine gate 联动
5. Derivative job 创建与状态转换
6. IPC DTO 脱敏验证

### 16.2 Gated real engine tests（默认 CI 跳过）

与 P4-B 的 `magikaClassifyRunner.real.test.ts` 一致：

```typescript
const REAL_CONVERSION_TESTS_ENABLED = process.env.STARVERSE_ENABLE_REAL_CONVERSION_TESTS === '1'
const REAL_TIKA_JAR_PATH = process.env.STARVERSE_REAL_TIKA_JAR_PATH
// ...

const describeRealConversion = REAL_CONVERSION_TESTS_ENABLED ? describe : describe.skip
```

测试场景：
1. Tika real JAR detect/extract/metadata（需本地安装 Java + Tika JAR）
2. LibreOffice real conversion（需本地安装 LibreOffice）
3. ffprobe real probe（需本地安装 ffprobe）
4. Pandoc real conversion（需本地安装 Pandoc）
5. Sandbox copy 路径隔离验证
6. Timeout/output cap 行为验证

### 16.3 默认 CI skip

- 所有 real runtime tests 默认 CI skip
- 无本地 runtime 时 `describe.skip` with explicit reason
- 禁止将联网下载 runtime 作为测试前置
- real test fixture 文件不提交到仓库

### 16.4 禁止项测试

```bash
# 路径安全扫描（纳入 CI）
rg -n "shell:\s*true" src/next/file-type/conversion/ infra/files/
rg -n "contentToken" src/next/file-type/conversion/ infra/files/
rg -n "fullHash" src/next/file-type/conversion/ infra/files/

# IPC 脱敏测试
# DTO schema 确认不含 installRef/manifestHash/packageSha256/contentToken/fullHash
```

## 17. Manual smoke checklist

### 17.1 P4-C implementation 完成后需执行的烟测

| # | 场景 | 预期 | 引擎 | 环境要求 |
|---|------|------|------|---------|
| 1 | 无任何引擎安装时上传 docx | route 显示 extracted_text blocked (engine unavailable) | Tika | 无 |
| 2 | 安装 Tika plugin 后 Health Check | healthStatus → healthy | Tika | Java + Tika JAR |
| 3 | Tika healthy 后上传 docx | `extracted_text` route available | Tika | Java + Tika JAR |
| 4 | docx→text conversion 成功 | derivative status → ready，text 可读 | Tika | Java + Tika JAR |
| 5 | 上传 PDF 后 Tika extract | text extraction 成功 | Tika | Java + Tika JAR |
| 6 | Tika disabled 后 docx route | `extracted_text` route blocked | Tika | Java + Tika JAR |
| 7 | 上传大型 docx (超 100MB) | conversion rejected (input too large) | Tika | Java + Tika JAR |
| 8 | 损坏的 docx 文件 | conversion failed with clear error | Tika | Java + Tika JAR |
| 9 | EnginePluginSettingsPanel 显示 Tika | pluginId=tika, displayName, healthStatus | Tika | catalog 包含 Tika entry |
| 10 | EnginePluginSettingsPanel 不显示真实路径 | 无敏感信息泄露 | 全部 | catalog + installed plugins |
| 11 | 多个引擎同时安装 | Tika/LibreOffice/ffprobe/Pandoc 独立列表，互不影响 | 全部 | 相应运行时 |
| 12 | trusted root unconfigured 时 UI | 显示 amber 警告条，"官方插件信任根未配置" | 全部 | 无 |
| 13 | 篡改 Tika JAR 后 health check | 返回 hash_mismatch | Tika | 修改后的 JAR |
| 14 | 日志不泄露绝对路径/contentToken/fullHash | grep 扫描无匹配 | 全部 | 操作后 grep 日志 |

### 17.2 延期烟测（后续阶段）

| # | 场景 | 引擎 | 阶段 |
|---|------|------|------|
| 15 | Office→PDF 转换 | LibreOffice | C-2 |
| 16 | Presentation→slide images | LibreOffice | C-3 |
| 17 | 视频关键帧提取 | ffprobe+ffmpeg | C-4 |
| 18 | 音频转文字（转录后） | ffprobe | C-4 |
| 19 | EPUB→text 转换 | Tika/Pandoc | C-2/C-5 |
| 20 | 文档格式互转 | Pandoc | C-5 |

## 18. P4-C implementation 子任务包建议

### P4-C1：External Conversion Engine Manifest/Package Spec Extension

**范围**：
- 定义 Tika/LibreOffice/ffprobe/Pandoc 的 package layout 规范文档
- 扩展 `externalEngineTypes.ts`（如需新增 `conversion` 模式相关类型）
- 创建 manifest 模板（Tika 优先）

**允许修改**：
- `docs/file-pipeline/file-type-detection-implementation/*` 文档
- `src/next/file-type/externalEngineTypes.ts`（如需扩展）
- `src/shared/files/fileTypes.ts`（如需新增 `DerivedKind`）

**禁止**：
- 不提交真实 runtime binary/JAR
- 不提交真实 manifest
- 不修改 `package.json`

### P4-C2：Tika Official Managed Plugin Planning-to-Contract Implementation with Fake Runner

**范围**：
- 新增 `src/next/file-type/conversion/tikaConversionRunner.ts`
  - 定义 `TikaConversionRunnerInput` / `TikaConversionRunnerOutput`
  - 实现受控 spawn：通过 `externalProcessRunner` 调用 `java -jar tika-app.jar`
  - 支持三种操作：`detect` / `extract` / `metadata`
  - timeout / output cap 复用 P3-A 安全底座
- 新增 `src/next/file-type/conversion/tikaConversionRunner.test.ts`（fake tests）
- 定义 Tika engine registration contract（manifest schema + healthcheck command）

**允许修改**：
- `src/next/file-type/conversion/` 目录（新建）
- `src/next/file-type/index.ts`（导出）

**禁止**：
- 不提交真实 `tika-app.jar`
- 不提交需要 Java 的真实运行测试
- 不修改 `derivativeJobService.ts` 主逻辑

### P4-C3：LibreOffice Conversion Contract and Derivative Job Boundary

**范围**：
- 新增 `src/next/file-type/conversion/libreofficeConversionRunner.ts`
  - 定义 `LibreOfficeConversionRunnerInput` / `LibreOfficeConversionRunnerOutput`
  - 支持操作：`convert_to_pdf` / `convert_to_text` / `convert_to_html`
  - sandbox copy 输入/输出管理
- 新增 fake tests
- 定义 `converted_pdf` derivative job 的调用边界

**允许修改**：
- `src/next/file-type/conversion/` 目录

**禁止**：
- 不提交真实 LibreOffice binary
- 不实现真实 `converted_pdf` derivative job（仅 contract）
- 不修改 `derivativeJobService.ts`

### P4-C4：ffprobe Metadata Probe Contract

**范围**：
- 新增 `src/next/file-type/conversion/ffprobeRunner.ts`
  - 定义 `FFProbeRunnerInput` / `FFProbeRunnerOutput`
  - JSON parse ffprobe 输出
  - 过滤 `filename` 字段（脱敏）
- 新增 fake tests
- 定义 probe metadata 的 JSON schema

**允许修改**：
- `src/next/file-type/conversion/` 目录

**禁止**：
- 不提交真实 ffprobe/ffmpeg binary
- 不实现真实 frame extraction
- 不修改 `sendRouteMapping.ts`

### P4-C5：Pandoc Document Conversion Contract

**范围**：
- 新增 `src/next/file-type/conversion/pandocConversionRunner.ts`
  - 定义 `PandocConversionRunnerInput` / `PandocConversionRunnerOutput`
  - 支持操作：`to_markdown` / `to_plain`
- 新增 fake tests

**允许修改**：
- `src/next/file-type/conversion/` 目录

**禁止**：
- 不提交真实 Pandoc binary
- 不实现真实格式互转
- 不修改 `derivativeJobService.ts`

### P4-C6：Route Mapping / Conversion Candidate Integration

**范围**：
- 对接 `sendRouteMapping.ts` 的 `evaluateEngineGate` 与 engine availability
- 确保 conversion engine 的 health/availability 正确传递到 `buildSendPlanCandidates`
- 确保 `requiresJob` route 在 engine unavailable 时正确 blocked
- 测试：route mapping 与 engine availability 联动
- 测试：多引擎同时可用时 route 优先级正确

**允许修改**：
- `src/next/file-type/sendRouteMapping.ts`（如需微调 engine gate）
- `src/next/file-type/externalEngineAvailability.ts`（如需扩展 route mapping）
- 测试文件

**禁止**：
- 不重构 `buildSendPlanCandidates` 主逻辑
- 不新增 conversion candidate 类型
- 不修改 `sendPlanService.ts`

### P4-C7：P4-C Closeout and Smoke Checklist

**范围**：
- 输出 P4-C 收口报告文档（`28-p4c-external-conversion-engines-closeout.md`）
- 检查以下禁止项：
  - 真实 runtime binary/JAR 未提交
  - `provider_file_ref` 未引入
  - 敏感字段未泄露到 IPC/UI
  - Phase 4 completed 措辞未写入
  - custom marketplace / marketplaceUrl 未引入
  - Tika/LibreOffice/ffprobe/Pandoc completed 措辞未写入
- 手工烟测清单执行（见第 17 节）
- 文档索引更新

**允许修改**：
- `docs/file-pipeline/file-type-detection-implementation/28-p4c-closeout.md`（新增）
- `docs/file-pipeline/file-type-detection-implementation/README.md`

**禁止**：
- P4-C closeout 不代表 Phase 4 completed
- 不把 P4-C 写成 Tika/LibreOffice/ffprobe/Pandoc implementation completed

## 19. P4-D final acceptance handoff

### 19.1 P4-D scope（来自 `19-phase4-planning.md`）

P4-D 是 Phase 4 的第四个（最终）任务包：
- 汇总自动化 + 手工烟测矩阵
- 明确 `legacy message_asset` destructive cleanup 是否进入后续实现
- 明确 `provider_file_ref` 继续延期
- Phase 4 最终收口

### 19.2 P4-C → P4-D 交接条件

| 条件 | 说明 |
|------|------|
| P4-C implementation (C1~C7) 完成 | 至少 Tika (P0) 的 planning-to-contract 完成 |
| P4-C closeout 完成 | 手工烟测 + 禁止项扫描通过 |
| P4-B follow-ups 处理完毕 | 或明确延期到 P4-D |
| Production trusted root 已明确 | 或明确继续延期待 Owner 确认 |
| P4-A / P4-B / P4-C 的自动化测试基线通过 | vitest 全量通过 |

## 20. 明确禁止项与延期项

### 20.1 P4-C planning 非目标（本文档级别）

1. 不实现 Tika / LibreOffice / ffprobe / Pandoc 真实执行链路
2. 不新增真实外部引擎包
3. 不提交真实 runtime / binary / jar / office 包
4. 不接真实深度转换
5. 不改 `sendPlanService` 主逻辑
6. 不重构 `derivativeJobService`
7. 不重构 `appChatApp.logic.ts`
8. 不引入 `provider_file_ref`
9. 不做 legacy `message_asset` destructive cleanup
10. 不开放第三方插件生态
11. 不支持 custom marketplace URL
12. 不支持用户自定义 trusted root
13. 不让 UI/renderer 持有真实绝对路径
14. 不写 Phase 4 completed
15. 不把 P4-C planning 写成 implementation completed

### 20.2 P4-C implementation 非目标（后续阶段遵守）

1. 不一次性启动全部引擎实现（仅 Tika P0）
2. 不提交真实 runtime binary/JAR（Tika/LibreOffice/ffprobe/Pandoc）
3. 不提交测试签名私钥
4. 不添加 Java/Tika 到 Starverse 主包依赖
5. 不修改 `package.json` / `package-lock.json`
6. 不引入不受控外部命令执行路径
7. 不将 conversion engine 的 evidence 混入 `detectBasic`
8. 不将 `provider_file_ref` 混入 conversion 逻辑
9. 不把 P4-C 写成 Phase 4 completed

### 20.3 明确延期项（P4-D 或后续阶段）

| 延期项 | 原因 |
|--------|------|
| LibreOffice (P1) first implementation | P4-C 仅完成 planning-to-contract；真实实现延后 |
| ffprobe (P2) first implementation | P4-C 仅完成 planning-to-contract；真实实现延后 |
| Pandoc (P3) first implementation | P4-C 仅完成 planning-to-contract；真实实现延后 |
| `conversion` mode in externalProcessPolicy | 需求明确但在 P4-C planning 仅建议，由 P4-C implementation 决策 |
| `converted_markdown` / `rendered_images` / `selected_frames` / `extracted_audio` derivedKind 扩展 | 类型系统和 migration 延到对应引擎 implementation 阶段 |
| `provider_file_ref` | 继续延后 |
| legacy `message_asset` destructive cleanup | 继续延后 |
| 第三方插件生态 | 不属于 Phase 4 |
| DROID / Siegfried | 不属于 Phase 4 |
| 高级 polyglot 检测 | 不属于 Phase 4 |
| OCR（Tesseract 集成） | 不属于 Phase 4 |
| 完整诊断面板 | 不属于 Phase 4 |

## 21. 文档索引更新

```
docs/file-pipeline/file-type-detection-implementation/
+-- README.md                          # 目录索引（需更新）
+-- 19-phase4-planning.md              # Phase 4 规划（母文档）
+-- 20-p4a-official-plugin-marketplace-closeout.md  # P4-A 收口
+-- 21-p4b-magika-official-managed-plugin-planning.md  # P4-B planning
+-- 22-p4b1-magika-package-spec-and-distribution.md
+-- 23-p4b2-managed-root-registration.md
+-- 24-p4b3-magika-classify-runner-contract.md
+-- 25-p4b4-detectfull-gated-runtime.md
+-- 26-p4b-magika-official-managed-plugin-closeout.md  # P4-B closeout
+-- 27-p4c-external-conversion-engines-planning.md     # 本文件（P4-C planning）
+-- (后续: 28-p4c-closeout.md, 29-p4d-acceptance.md, ...)
```

## 22. P4-C Planning 确认签名

- [ ] P4-C 阶段定位已明确
- [ ] P4-A / P4-B 输入条件已列出
- [ ] P4-B follow-ups 已登记
- [ ] 引擎优先级决策已完成（Tika P0, LibreOffice P1, ffprobe P2, Pandoc P3）
- [ ] 每个引擎的最小能力边界已明确
- [ ] 每个引擎的 non-goals 已明确
- [ ] official managed plugin manifest/package/integrity 策略已定义
- [ ] health check 策略已定义
- [ ] externalProcessRunner 调用边界已明确
- [ ] conversion job / derivative job / parser validation 关系已建模
- [ ] route mapping strategy 已明确
- [ ] Office/PDF/HTML/EPUB 深度转换阶段切片已定义
- [ ] JS/macro/active content 禁止策略已明确
- [ ] failure fallback matrix 已完成
- [ ] security and privacy boundaries 已明确
- [ ] testing strategy（fake/gated/CI skip）已设计
- [ ] manual smoke checklist 已完成
- [ ] P4-C implementation 子任务包建议（P4-C1~P4-C7）已完成
- [ ] P4-D final acceptance handoff 条件已定义
- [ ] 禁止项与延期项已明确
- [ ] 文档索引已更新

