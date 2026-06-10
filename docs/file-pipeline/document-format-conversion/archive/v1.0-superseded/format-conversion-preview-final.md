> Status: historical reference only.
> Superseded by: `docs/file-pipeline/document-format-conversion/starverse_format_conversion_preview_v1_2.md`
> Do not implement Hybrid / mixed send strategy / old file-card modal UI from this document.

# Starverse 文档格式转换与预览最终方案

版本：v1.0  
适用范围：Starverse 文件上传、附件转换、发送计划、预览交互与模型兼容性判断  
边界声明：不设计独立图片格式处理；不设计音频格式处理；不设计 PDF 解析机制；不执行宏、脚本、远程资源和主动内容。PDF 转换后的解析责任交由 OpenRouter 路由与目标模型承担。

---

## 1. 总体结论

Starverse 的文件转换体系应采用以下基本架构：

**第三方转换内核 + Starverse 自研转换治理层 + 分层 UI 暴露 + 用户可自定义转换路径。**

第三方工具负责复杂格式的读取、解析或渲染，例如 DOCX、XLSX、HTML、PDF、PS/EPS 等。Starverse 自研部分负责文件画像、候选生成、用户选择、转换状态机、DerivedAsset 缓存、预览一致性、错误诊断、安全封装、Send Plan、模型兼容性判断、超大文本 gate 和历史消息绑定。

系统应提供推荐默认路径，但不应剥夺高级用户选择其他合格路径的能力。所有安全、可预览、可复现、可发送、可测试的转换路径都可以在高级 UI 中作为可选项展示。系统通过推荐、实验性、慢速、可能有损、需要沙箱、依赖缺失等标签帮助用户判断。

---

## 2. 目标与边界

### 2.1 目标

| 目标 | 要求 |
|---|---|
| 可控 | 用户能够选择 plain text、markdown、code、table markdown、PDF attachment、hybrid 等目标格式。 |
| 可预览 | 用户能够查看实际将发送给模型的文本内容，或查看即将作为附件发送的 PDF。 |
| 可配置 | 默认路径由简单规则产生，并允许用户设为本次默认、文件类型默认或全局默认。 |
| 可降级 | 单一路径失败不影响其他路径；失败原因和可用 fallback 必须可见。 |
| 可复现 | 同一原文件、同一转换器版本、同一转换参数应得到稳定 DerivedAsset。 |
| 可绑定 | 历史消息只绑定实际发送资产，未发送预览资产不得污染历史。 |
| 可诊断 | 所有失败、损失、编码异常、依赖缺失、安全限制都有 errorCode 和 warning。 |

### 2.2 覆盖范围

| 类别 | 示例 |
|---|---|
| 纯文本文件 | `.txt`、`.log`、`.ini`、`.env` |
| Markdown 文件 | `.md`、`.markdown` |
| 代码、脚本、配置 | `.bat`、`.ps1`、`.sh`、`.py`、`.js`、`.ts`、`.json`、`.yaml`、`.xml`、HTML 源码 |
| Office 文档 | `.docx`、`.doc`、`.rtf` |
| 表格文件 | `.csv`、`.tsv`、`.xlsx`、`.xls` |
| HTML 文档 | `.html`、`.htm`、网页导出文件 |
| PostScript 类文件 | `.ps`、`.eps` |

### 2.3 不覆盖范围

| 不覆盖内容 | 说明 |
|---|---|
| 独立图片格式处理 | 不设计 `.png`、`.jpg`、`.webp`、`.gif` 等图片文件的识别、压缩、转码或发送策略。 |
| 音频格式处理 | 不设计 `.mp3`、`.wav`、`.m4a` 等音频文件处理方式。 |
| PDF 解析机制 | 不讨论 PDF 如何 OCR、如何抽取页面、如何由模型解析。 |
| 主动内容执行 | 不执行 Office 宏、脚本、PostScript 非必要危险操作或嵌入对象。 |
| 外链抓取 | 默认不加载 HTML、Office 或其他文档中的远程资源。 |

---

## 3. 核心原则

### 3.1 扩展名只作初筛

扩展名、浏览器 MIME、服务端 MIME、magic bytes、编码检测、内容采样和解析器结果共同参与判断。扩展名不得直接决定最终发送形态，也不得直接决定模型是否兼容。

### 3.2 系统推荐默认路径，用户保留选择权

系统为每种文件提供推荐转换路径。推荐路径应低风险、可解释、质量较高。用户可以在高级 UI 中选择其他合格转换路径，也可以将自定义路径设为文件类型默认或全局默认。

### 3.3 UI 暴露目标形态，也暴露高级转换路径

普通 UI 主要暴露目标形态，例如 Markdown、PDF attachment、Code。高级 UI 进一步暴露具体引擎链，例如 Mammoth → Turndown、Pandoc、LibreOffice、Chromium。

### 3.4 可用路径必须合格

可用路径必须同时满足以下条件：

| 条件 | 含义 |
|---|---|
| 安全可控 | 不突破沙箱，不默认联网，不执行不必要的主动内容。 |
| 可预览 | 用户能看到该路径的真实输出。 |
| 可发送 | 输出能进入 Send Plan。 |
| 可复现 | 可由 sourceHash、converterVersion、settingsHash 复现。 |
| 可诊断 | 失败有 errorCode、message、recoverable、retryable、fallbackOptions。 |
| 可测试 | 至少有基础回归用例。 |

不满足这些条件的路径只能显示为不可用、实验性内部能力或开发诊断能力，不能作为可执行发送选项。

### 3.5 预览与发送同源

文本类转换的预览内容必须与实际发送内容来自同一个 DerivedAsset。PDF 转换候选的预览 PDF 与发送 PDF 必须是同一个资产，或至少具有相同 contentHash。任何编码、sheet 范围、隐藏内容策略、JavaScript 渲染策略、外链策略、转换器版本或参数变化都会使旧资产失效。

### 3.6 PDF 转换边界

当用户选择 PDF attachment 时，Starverse 负责把源文件转换为 PDF、提供 PDF 预览、并把 PDF 作为附件纳入 Send Plan。Starverse 不解析 PDF 内容，不 OCR，不拆页，不模拟模型侧 PDF 理解。PDF 是否可被理解由 OpenRouter 路由、目标模型能力和实际 file input 支持情况决定。

### 3.7 超大内容不默认摘要

表格和文档默认保留完整转换结果。摘要只能作为额外候选或用户主动选择的派生方式，不能默认替代完整 table markdown 或完整 markdown。发送阶段由 token gate 和文件大小 gate 提示、拦截或要求用户确认。

---

## 4. 总体流程

| 步骤 | 动作 | 输出 |
|---:|---|---|
| 1 | 上传原始文件 | RawFile |
| 2 | 基础识别 | extension、MIME、magic bytes、size、hash |
| 3 | 编码检测与内容采样 | EncodingProfile、sample preview |
| 4 | 生成文件画像 | FileProfile |
| 5 | 生成转换候选 | ConversionOption 列表 |
| 6 | 生成低成本预览资产 | DerivedAsset |
| 7 | 用户选择目标格式或自定义路径 | selectedOptionId |
| 8 | 懒加载高成本转换 | PDF、Office、HTML render、PS/EPS render |
| 9 | 预览与 warning 检查 | PreviewPanel |
| 10 | 绑定到 draft | DraftAttachment |
| 11 | Send Plan 计算 | text/file/hybrid request plan |
| 12 | 发送前 preflight | capability、token、size、安全、依赖状态 |
| 13 | 成功发送后绑定 message | MessageAttachment、UsedDerivedAsset |
| 14 | 清理未使用临时资产 | 过期删除或缓存回收 |

发送阶段只看用户选择的转换结果，不直接看原始扩展名。例如 `.docx` 选择 markdown 时只要求模型支持 text；`.docx` 选择 PDF attachment 时要求模型支持 file/PDF input；`.html` 选择 code 时只要求 text。

---

## 5. 数据对象模型

### 5.1 RawFile

| 字段 | 说明 |
|---|---|
| `fileId` | 原始文件 ID |
| `filename` | 原始文件名 |
| `extension` | 扩展名 |
| `browserMime` | 浏览器或系统提供的 MIME |
| `detectedMime` | 服务端检测得到的 MIME |
| `magicBytes` | 文件头识别信息 |
| `sizeBytes` | 文件大小 |
| `hash` | 去重、缓存与复用依据 |
| `uploadTime` | 上传时间 |
| `storagePath` | 原始文件存储位置 |
| `status` | `uploaded`、`profile_pending`、`profile_ready`、`profile_failed` |

### 5.2 EncodingProfile

| 字段 | 说明 |
|---|---|
| `detectedEncoding` | 自动检测得到的编码 |
| `encodingConfidence` | 检测置信度 |
| `candidateEncodings` | 候选编码列表 |
| `bomEncoding` | BOM 指示的编码，若存在 |
| `selectedEncoding` | 当前实际使用的编码 |
| `isUserSelected` | 是否由用户手动指定 |
| `replacementCharRatio` | 解码后替换字符比例 |
| `nulByteRatio` | NUL 字节比例 |
| `controlCharRatio` | 异常控制字符比例 |
| `mojibakeScore` | 疑似乱码评分 |
| `newlineStyle` | LF、CRLF、CR、mixed |
| `warnings` | 编码相关提示 |

### 5.3 FileProfile

| 字段 | 说明 |
|---|---|
| `isTextDecodable` | 是否可作为文本解码 |
| `isCodeLike` | 是否像源码、脚本或配置 |
| `codeLanguage` | 推测语言，例如 powershell、html、python |
| `isStructuredText` | 是否有标题、段落、列表、表格等结构 |
| `isTableLike` | 是否以表格数据为核心 |
| `tableInfo` | sheet 数、行列数、分隔符、公式、隐藏内容等 |
| `isHtml` | 是否 HTML |
| `htmlProfile` | body 文本密度、script/style 占比、外链、资源引用等 |
| `isOfficeDocument` | 是否 Office 文档 |
| `hasEmbeddedMedia` | 是否含嵌入媒体，仅提示，不处理图片格式 |
| `hasExternalLinks` | 是否含外链 |
| `hasMacrosOrScripts` | 是否含宏、脚本或主动内容 |
| `possibleConversions` | 可生成的转换候选 |
| `warnings` | 文件级提示 |

### 5.4 ConversionOption

| 字段 | 说明 |
|---|---|
| `optionId` | 转换选项 ID |
| `fileId` | 对应原始文件 |
| `targetKind` | `plain_text`、`markdown`、`code`、`table_markdown`、`pdf_attachment`、`hybrid` |
| `strategy` | `text_in_prompt`、`file_attachment`、`mixed` |
| `engineChain` | 转换引擎链，例如 `mammoth_to_html -> turndown_to_markdown` |
| `label` | UI 显示名称 |
| `qualityLabel` | 推荐、语义提取、高保真版面、通用转换、实验性等 |
| `isDefault` | 是否默认选中 |
| `isRecommendedBySimpleRule` | 是否由简单默认规则推荐 |
| `isAvailable` | 当前是否可用 |
| `unavailableReason` | 依赖缺失、安全未启用、模型不支持等 |
| `lossiness` | `none`、`minor`、`major`、`unknown` |
| `estimatedTokens` | token 估算 |
| `estimatedBytes` | 转换后文本或附件大小估算 |
| `requiresModelCapabilities` | `text`、`file`、`pdf` 等 |
| `warnings` | 转换提示 |
| `previewAssetId` | 预览资产 ID |
| `sendAssetIds` | 实际发送资产 ID 列表 |
| `status` | `candidate`、`pending`、`ready`、`failed`、`stale` |
| `conversionSettingsHash` | 转换参数哈希 |
| `contentHash` | 转换结果哈希 |
| `staleReason` | 失效原因 |

### 5.5 DerivedAsset

| 字段 | 说明 |
|---|---|
| `assetId` | 派生资产 ID |
| `sourceFileId` | 来源文件 ID |
| `kind` | `plain_text`、`markdown`、`code_text`、`table_markdown`、`rendered_pdf`、`structured_json` |
| `mime` | `text/plain`、`text/markdown`、`application/pdf` 等 |
| `contentPath` | 内容存储位置 |
| `usage` | `preview_and_send`、`preview_only`、`send_only` |
| `storageClass` | `temporary`、`draft_bound`、`message_bound` |
| `sourceHash` | 原始文件 hash |
| `contentHash` | 派生结果 hash |
| `converterName` | 转换器名称 |
| `converterVersion` | 转换器版本 |
| `conversionOptions` | 编码、sheet 范围、隐藏策略、JS 策略等 |
| `boundToDraftId` | 若已绑定草稿，记录 draft |
| `boundToMessageId` | 若已发送，记录 message |
| `expiresAt` | 临时资产过期时间 |
| `warnings` | 资产级提示 |

### 5.6 DraftAttachment

| 字段 | 说明 |
|---|---|
| `draftAttachmentId` | 草稿附件 ID |
| `draftId` | 草稿 ID |
| `rawFileId` | 原始文件引用 |
| `selectedOptionId` | 当前选择的转换选项 |
| `selectedAssetIds` | 当前选择对应的派生资产 |
| `compatibilityStatus` | 当前模型下的兼容状态 |
| `lastPreviewedAt` | 最近预览时间 |
| `warnings` | 草稿阶段提示 |

### 5.7 MessageAttachment

| 字段 | 说明 |
|---|---|
| `messageAttachmentId` | 历史消息附件 ID |
| `messageId` | 消息 ID |
| `rawFileId` | 原始文件引用，可用于追溯 |
| `usedOptionId` | 实际发送的转换选项 |
| `usedAssetIds` | 实际发送的资产 |
| `sendStrategy` | text、file、hybrid |
| `modelId` | 发送时模型 |
| `providerRoute` | 若可得，记录 OpenRouter 路由信息 |
| `warningsAtSendTime` | 发送时提示快照 |

---

## 6. 状态机

### 6.1 RawFile 状态

```text
uploaded
  -> profile_pending
  -> profile_ready
  -> profile_failed
```

### 6.2 ConversionOption 状态

```text
candidate
  -> pending
  -> ready
  -> failed
  -> stale
```

状态说明：

| 状态 | 含义 |
|---|---|
| `candidate` | 已识别为可尝试路径，但尚未转换。 |
| `pending` | 转换任务已入队或执行中。 |
| `ready` | 已有可预览或可发送资产。 |
| `failed` | 转换失败，但其他候选不受影响。 |
| `stale` | 参数、编码、文件、转换器版本或策略变化导致资产失效。 |

### 6.3 DerivedAsset 状态

```text
temporary
  -> draft_bound
  -> message_bound
  -> expired
```

关键规则：

1. RawFile 可以绑定 draft。
2. ConversionOption 可以绑定 draft。
3. DerivedAsset 可以在 draft 阶段作为 preview/send candidate 绑定。
4. MessageAttachment 只绑定成功发送的实际资产。
5. 未被发送的预览资产不得进入历史消息。
6. 用户更改转换方式后，旧 option 保留但标记为 unselected 或 stale。
7. 用户更改编码、sheet 范围、隐藏内容策略、JavaScript 渲染策略、外链策略后，必须生成新的 DerivedAsset。

---

## 7. 编码与解码策略

### 7.1 总体要求

编码处理必须做成可复核、可手动覆盖的流程。遇到严重解析错误、明显乱码、检测置信度过低或多个候选编码接近时，用户必须能够手动选择编码格式，并重新生成预览与发送资产。

### 7.2 推荐组件

| 能力 | 推荐组件 | 说明 |
|---|---|---|
| 编码检测 | `chardet` | 纯 TypeScript / JavaScript，返回最可能编码和候选列表。 |
| 编码解码 | `iconv-lite` | 支持 GBK、GB18030、Big5、Shift_JIS、EUC-JP、Windows code pages 等常见 legacy 编码。 |
| 严格 UTF 校验 | `TextDecoder` fatal 模式 | 用于检测 malformed UTF 数据。 |

### 7.3 处理流程

1. 先检查 BOM。
2. 若 BOM 存在，优先采用 BOM 指示编码。
3. 若无 BOM，使用 chardet 生成候选编码与置信度。
4. 对 UTF-8 / UTF-16 等路径使用严格解码校验。
5. 使用 iconv-lite 尝试候选编码解码。
6. 计算乱码评分和异常字符比例。
7. 生成编码预览。
8. 低置信度或异常比例高时显示 warning。
9. 用户可手动切换编码。
10. 编码变更后，相关 ConversionOption 失效并重新生成 DerivedAsset。

### 7.4 严重解析错误判定

建议综合以下指标，不依赖单一检测库：

| 指标 | 触发提示 |
|---|---|
| 替换字符 `�` 比例过高 | 当前编码可能错误。 |
| NUL 字节比例异常 | 可能是二进制文件或 UTF-16 未正确识别。 |
| 控制字符比例异常 | 可能解码错误或文件非文本。 |
| 换行结构异常 | 可能编码或二进制识别错误。 |
| mojibake 模式明显 | 例如中文文本出现大量 Ã、Â、æ、ç 等异常组合。 |
| 检测置信度低 | 需要用户检查预览。 |
| 多候选编码接近 | 提供候选编码切换。 |

### 7.5 用户可选编码

默认提供：

| 编码类别 | 选项 |
|---|---|
| Unicode | UTF-8、UTF-8 with BOM、UTF-16LE、UTF-16BE、UTF-32LE、UTF-32BE |
| 简体中文 | GBK、GB18030、GB2312 |
| 繁体中文 | Big5 |
| 日文 | Shift_JIS、EUC-JP、ISO-2022-JP |
| 韩文 | EUC-KR、CP949 |
| 西文 | Windows-1252、ISO-8859-1 |
| 其他 | 用户输入 iconv-lite 支持的编码名 |

### 7.6 编码 UI

编码预览区域应显示：

| 字段 | 说明 |
|---|---|
| 当前编码 | 自动检测或用户选择结果 |
| 置信度 | 高、中、低 |
| 候选编码 | 可一键切换 |
| 异常指标 | 替换字符、NUL 字节、控制字符、乱码评分 |
| 预览内容 | 当前编码下的文本片段 |
| 操作 | 切换编码、重新生成、设为本文件默认 |

---

## 8. 转换目标类型

### 8.1 Plain text

适用于纯文本、日志、无明显结构的文本文件。保留文本内容、换行与基本空白，不保留字体、颜色、页面布局或嵌入对象。

| 保留 | 不保留 |
|---|---|
| 文本内容 | 字体 |
| 换行 | 颜色 |
| 基本空格 | 页面布局 |
| 文件名声明 | 嵌入对象 |

发送包装示例：

```text
<file name="notes.txt" type="plain_text">
这里是提取后的纯文本内容
</file>
```

实际实现中必须对文件名、type、language 等元数据做 escaping，避免文件名破坏包裹结构。

### 8.2 Markdown

适用于结构化文本、Word 文档、HTML 正文、RTF 与 Markdown 原文。目标是尽量保留语义结构，而非视觉版式。

| 内容 | 处理方式 |
|---|---|
| 标题层级 | 转换为 Markdown 标题 |
| 段落 | 保持自然段 |
| 列表 | 转换为有序或无序列表 |
| 普通表格 | 转换为 Markdown table |
| 代码块 | 尽量保留语言标记 |
| 引用 | 转换为 blockquote |
| 链接 | 保留链接文本和 URL |
| 图片 | 仅显示占位、文件名或说明，不处理图片格式 |

### 8.3 Code

适用于脚本、源码、配置、HTML 源码分析、PostScript 源码分析。此时文件被视为代码文本。

| 保留内容 | 说明 |
|---|---|
| 原始缩进 | 代码语义关键 |
| 换行 | 保持源码结构 |
| 文件名 | 便于模型定位 |
| 语言类型 | 用于代码块标记 |
| 行号 | UI 可显示；默认不进入发送正文 |

行号默认只是 UI 显示，不应进入 send asset。若用户显式选择带行号发送，则应生成独立 ConversionOption。

### 8.4 Table markdown

适用于 CSV、TSV、Excel、HTML table、DOCX table。默认原则是完整保留表格，不默认摘要替代。

| 情况 | 处理 |
|---|---|
| CSV / TSV | 自动检测分隔符，完整转换为 Markdown table。 |
| XLSX 多 sheet | 每个 sheet 单独输出标题并完整转换。 |
| 空 sheet | 标记为空表。 |
| 合并单元格 | 尽量展开，并添加 warning。 |
| 公式单元格 | 默认输出显示值或 cached value，并提示存在公式。 |
| 隐藏行列 | 默认不输出，提供包含隐藏内容选项。 |
| 隐藏 sheet | 默认不输出，提示存在隐藏 sheet，提供高级选项。 |
| 超大表格 | 可生成完整转换资产，但预览分页，发送前 gate。 |
| 编码不确定 | 用户可切换编码后重新预览。 |

### 8.5 PDF attachment

适用于 DOCX、DOC、RTF、HTML、PS/EPS 等需要保留版面或渲染结果的文件。

| 来源 | PDF 候选含义 |
|---|---|
| DOCX / DOC / RTF | 用 LibreOffice 渲染为 PDF。 |
| HTML | 用 Chromium / Puppeteer 渲染为 PDF。 |
| PS / EPS | 用 Ghostscript 渲染为 PDF。 |

PDF 发送规则：

1. PDF 预览资产就是发送资产。
2. PDF 作为附件交给 OpenRouter。
3. Starverse 不解析 PDF。
4. 当前模型不支持 file/PDF input 时，Send Gate 必须阻止发送。
5. 用户可改选 markdown、plain text、code 或 table markdown。

### 8.6 Hybrid

Hybrid 指多个派生资产组合发送。系统应支持用户显式选择 hybrid，但不建议早期默认启用。

| Hybrid 类型 | 说明 |
|---|---|
| markdown + PDF attachment | 文本便于模型处理，PDF 保留版面。 |
| table markdown + PDF attachment | 表格便于计算，PDF 保留视觉布局。 |
| code + rendered PDF | 同时分析源码与渲染结果，例如 HTML 或 PS。 |

Hybrid 要求模型同时支持 text 和 file/PDF input。若模型只支持 text，不应自动降级为 text-only，应明确提示用户改选。

---

## 9. 转换引擎与路径目录

### 9.1 总原则

所有转换能力通过 Adapter 接入。第三方包或外部二进制不得直接散落在主流程中。

```ts
export type ConversionAdapter = {
  id: string
  version: string
  inputKinds: RawFileKind[]
  outputKind: TargetKind
  safetyProfile: SafetyProfile
  availability: AdapterAvailability
  convert(input: ConversionInput): Promise<ConversionResult>
}
```

```ts
export type ConversionResult = {
  derivedAsset: DerivedAsset
  warnings: ConversionWarning[]
  error?: ConversionError
  contentHash: string
  converterName: string
  converterVersion: string
  conversionSettingsHash: string
}
```

### 9.2 推荐引擎清单

| 能力 | 推荐引擎 | 暴露方式 |
|---|---|---|
| 编码检测 | `chardet` | 不作为用户路径，只显示检测结果。 |
| 编码解码 | `iconv-lite` + `TextDecoder` | 用户选择编码，不选择解码库。 |
| CSV / TSV | `Papa Parse` | 默认路径；高级 UI 可显示引擎名。 |
| XLSX / XLS | `SheetJS` | 默认路径；高级 UI 可显示引擎名。 |
| DOCX → HTML | `Mammoth` | DOCX semantic path 的主引擎。 |
| HTML → Markdown | `Turndown` | HTML markdown path 的主引擎。 |
| DOCX → Markdown | `Mammoth → Turndown` | 推荐路径。 |
| DOCX / RTF / DOC → PDF | `LibreOffice headless` | PDF attachment 路径。 |
| HTML → PDF | `Chromium / Puppeteer` | PDF attachment 路径。 |
| PS / EPS → PDF | `Ghostscript` | 后期启用，必须沙箱。 |
| 通用转换 | `Pandoc` | 可作为高级路径或 fallback。 |

### 9.3 多引擎暴露原则

Starverse 应暴露所有合格可用路径，但分层展示。

| UI 层级 | 展示内容 |
|---|---|
| 文件卡片 | 当前推荐路径、文件风险、预览、更改按钮。 |
| 转换目标面板 | Plain text、Markdown、Code、Table markdown、PDF attachment、Hybrid。 |
| 高级路径面板 | 具体引擎链、转换参数、依赖状态、安全限制、质量标签。 |

### 9.4 路径标签

| 标签 | 含义 |
|---|---|
| 推荐 | 系统默认建议路径。 |
| 语义提取 | 适合提取结构文本，但可能丢失视觉样式。 |
| 高保真版面 | 适合保留视觉版面，通常输出 PDF。 |
| 通用转换 | 覆盖面广，但质量取决于文件特征。 |
| 可能有损 | 转换会丢失样式、布局、媒体或复杂结构。 |
| 慢速 | 需要外部进程或渲染器。 |
| 需要沙箱 | 涉及 HTML 渲染、PostScript 渲染、Office 渲染。 |
| 依赖缺失 | 本机未安装或未检测到对应工具。 |
| 实验性 | 可用但测试覆盖不足。 |
| 不可用 | 当前不能执行，但可说明原因。 |

---

## 10. 各格式策略

### 10.1 纯文本、日志、配置

| 输入 | 默认 | 可选 |
|---|---|---|
| `.txt` | plain text | markdown、code |
| `.log` | plain text | code |
| `.ini`、`.env` | code | plain text |

关键点：

1. 编码检测必须可手动覆盖。
2. 大文件预览必须分页或虚拟滚动。
3. 发送前进行 token 和 size gate。

### 10.2 Markdown

| 输入 | 默认 | 可选 |
|---|---|---|
| `.md`、`.markdown` | markdown | plain text、code |

Markdown 原文默认直接作为 markdown send asset。预览提供渲染视图和源码视图。

### 10.3 代码、脚本、配置

| 输入 | 默认 | 可选 |
|---|---|---|
| `.py`、`.js`、`.ts`、`.sh`、`.ps1`、`.bat` | code | plain text |
| `.json`、`.yaml`、`.xml` | code | plain text、markdown |

JSON / YAML / XML 可视为 code，也可在后续提供 structured view，但不应影响第一期实现。

### 10.4 CSV / TSV

| 输入 | 默认 | 可选 |
|---|---|---|
| `.csv`、`.tsv` | table markdown | plain text、structured json 后期 |

实现要求：

1. 使用 Papa Parse 解析。
2. 分隔符自动检测，但用户可手动指定。
3. 引号、转义、字段内换行必须正确处理。
4. 解析错误必须展示行号、列号和错误类型。
5. 完整 table markdown 是默认发送资产。
6. 超大表格触发预览分页和发送 gate。

### 10.5 XLSX / XLS

| 输入 | 默认 | 可选 |
|---|---|---|
| `.xlsx`、`.xls` | table markdown | structured json、PDF attachment、hybrid |

实现要求：

1. 使用 SheetJS 读取 workbook。
2. 多 sheet 导航。
3. 默认输出可见 sheet 和可见行列。
4. 隐藏行列、隐藏 sheet、公式、合并单元格必须 warning。
5. 公式单元格默认输出显示值或 cached value。
6. 高级选项允许公式文本、值+公式。
7. 日期、数字格式默认输出用户在表格中看到的显示值。
8. 原始值作为高级选项。
9. 不在本地执行宏或外部引用。

### 10.6 DOCX

| 输入 | 默认 | 可选 |
|---|---|---|
| `.docx` | markdown | plain text、PDF attachment、hybrid、Pandoc markdown 高级路径 |

推荐路径：

```text
DOCX -> Mammoth -> HTML -> Turndown -> Markdown
```

高级路径：

```text
DOCX -> Pandoc -> Markdown
DOCX -> LibreOffice -> PDF attachment
DOCX -> Markdown + PDF attachment
```

实现要求：

1. Mammoth 路径标记为语义提取。
2. LibreOffice PDF 路径标记为高保真版面。
3. Pandoc 路径标记为通用转换。
4. 图片默认只作为占位或提示，不做图片处理。
5. 批注、脚注、尾注、修订痕迹、页眉页脚若未提取，必须 warning。
6. Markdown 转换失败不影响 PDF attachment 候选。
7. 用户选择 PDF 后，PDF 作为附件发送给 OpenRouter。

### 10.7 DOC / RTF

| 输入 | 默认 | 可选 |
|---|---|---|
| `.rtf` | markdown if reliable | plain text、PDF attachment |
| `.doc` | PDF attachment 或 ask each time | markdown 尝试、plain text 尝试 |

建议：

1. `.doc` 是旧格式，语义抽取不稳定，建议默认 ask each time 或偏向 PDF attachment。
2. `.rtf` 可尝试 markdown，但转换 warnings 必须明显。
3. PDF 由 LibreOffice headless 生成。

### 10.8 HTML

| 输入 | 默认 | 可选 |
|---|---|---|
| HTML 文档 | markdown | code、plain text、PDF attachment、hybrid |
| HTML 源码倾向明显 | code | markdown、plain text、PDF attachment |

默认判断启发式：

| 条件 | 默认 |
|---|---|
| body 文本密度高、标题段落明显 | markdown |
| script/style 占比高、模板结构明显 | code |
| 用户已设置 HTML 默认 code | code |
| 无法判断 | ask each time |

HTML → PDF 的 JavaScript 规则：

| 选项 | 默认 | 说明 |
|---|---|---|
| JavaScript 渲染 | 关闭 | 默认不执行页面脚本。 |
| JavaScript 渲染 | 用户可开启 | 开启后使用受限 Chromium 沙箱渲染。 |
| 外部资源加载 | 关闭 | 默认不加载远程 CSS、图片、字体、脚本。 |
| 外部资源加载 | 用户可授权 | 授权后仍需域名提示、超时和缓存隔离。 |
| print CSS | 开启 | 默认按打印样式生成 PDF。 |
| screen CSS | 可选 | 用户可切换为屏幕样式。 |

高级 UI 示例：

```text
HTML -> PDF attachment
Engine: Chromium
JavaScript: disabled by default, user may enable
External resources: disabled by default, user may authorize
CSS media: print or screen
Timeout: configurable
Preview -> Use for current send
```

### 10.9 PS / EPS

| 输入 | 默认 | 可选 |
|---|---|---|
| `.ps`、`.eps` | ask each time | code、PDF attachment、hybrid |

实现要求：

1. code 路径按源码发送。
2. PDF attachment 路径使用 Ghostscript。
3. Ghostscript 必须运行在隔离进程中。
4. 必须开启安全文件访问控制。
5. 禁止访问任意本地路径。
6. 限制输入目录、输出目录、超时、内存和进程权限。
7. Ghostscript 路径放后期启用。

---

## 11. 默认选择与用户偏好

### 11.1 推荐默认规则

| 文件画像 | 默认转换 |
|---|---|
| 纯文本，无明显结构 | plain text |
| Markdown 文件 | markdown |
| 代码、脚本、配置 | code |
| CSV、TSV、XLSX、XLS | table markdown |
| DOCX | markdown |
| RTF | markdown if reliable |
| DOC | ask each time 或 PDF attachment |
| HTML 文档 | markdown |
| HTML 源码倾向明显 | code |
| PS / EPS | ask each time |
| 含嵌入媒体的结构化文档 | ask each time 或按用户偏好 |
| 无法可靠判断 | ask each time |

### 11.2 用户可配置项

| 设置 | 说明 |
|---|---|
| `defaultPlainTextTarget` | 纯文本默认 plain text。 |
| `defaultStructuredTextTarget` | 结构化文本默认 markdown。 |
| `defaultCodeTarget` | 代码默认 code。 |
| `defaultTableTarget` | 表格默认 table markdown。 |
| `defaultDocxTarget` | DOCX 默认 markdown，可改为 PDF attachment。 |
| `defaultHtmlTarget` | HTML 默认 markdown，可改为 code。 |
| `defaultPsEpsTarget` | PS/EPS 默认 ask each time。 |
| `alwaysShowConversionOptions` | 默认 true。 |
| `forcePreviewBeforeSend` | 默认 false，可改为 true。 |
| `rememberPerFileTypeChoice` | 默认 true。 |
| `enableAdvancedConversionPaths` | 默认 true。 |
| `showExperimentalPaths` | 默认 false。 |
| `htmlPdfJavascriptDefault` | 默认 disabled。 |
| `htmlPdfExternalResourcesDefault` | 默认 disabled。 |
| `maxConvertedTextBytesBeforeConfirm` | 默认 2 MiB。 |
| `maxConvertedTextBytesUserOverride` | 用户可设置 512 KiB、1 MiB、2 MiB、5 MiB、10 MiB、unlimited。 |
| `maxPromptContextRatioBeforeConfirm` | 默认 0.6，即转换文本超过当前模型上下文约 60% 时要求确认。 |
| `reservedResponseContextRatio` | 默认 0.2，即保留约 20% 上下文给模型回答。 |

### 11.3 超大文本强制发送设置

超大文本处理应分为软阈值和硬阈值。

| 类型 | 说明 |
|---|---|
| 软阈值 | 用户可配置。超过后要求确认或提示风险。 |
| 硬阈值 | 由模型上下文、OpenRouter 请求限制、本地内存和应用稳定性决定。不能由用户绕过。 |

建议默认值：

| 设置 | 默认值 | 理由 |
|---|---:|---|
| `maxConvertedTextBytesBeforeConfirm` | 2 MiB | 对普通文档足够宽松，又能拦截明显异常的大文本。 |
| `maxPromptContextRatioBeforeConfirm` | 60% | 避免附件吞掉几乎全部上下文。 |
| `reservedResponseContextRatio` | 20% | 给模型回答保留基本空间。 |
| `allowUserForceLargeTextSend` | true | 保留高级用户自由度。 |
| `allowSendBeyondModelContext` | false | 超过模型上下文的请求技术上不可可靠发送。 |

强制发送规则：

1. 用户可以强制发送超过软阈值的文本。
2. 用户不能强制发送超过模型上下文或 OpenRouter 请求硬限制的文本。
3. 超过软阈值时必须显示预计 token、目标模型上下文、剩余回答空间和可能失败原因。
4. 若超出硬限制，系统提供可选方案：选择部分 sheet、缩小范围、改用 PDF attachment、改用支持更长上下文的模型。

---

## 12. 预览交互设计

### 12.1 文件卡片

文件卡片只展示高频信息，不承载所有高级选项。

| 区域 | 内容 |
|---|---|
| 文件摘要 | 文件名、大小、识别类型、编码或 sheet 信息。 |
| 当前转换 | 例如 Markdown、Code、Table markdown、PDF attachment。 |
| 推荐标签 | 推荐、语义提取、高保真版面、可能有损等。 |
| 风险 badge | 表格、公式、嵌入媒体、宏、脚本、外链、编码不确定。 |
| 操作 | 预览、更改、移除、重新转换。 |

### 12.2 转换方式选择弹窗

| 区域 | 内容 |
|---|---|
| 文件信息 | 文件名、大小、类型、编码。 |
| 目标格式 | Plain text、Markdown、Code、Table markdown、PDF attachment、Hybrid。 |
| 推荐路径 | 系统默认路径。 |
| 高级路径 | 引擎链、参数、依赖状态、安全限制。 |
| 预览入口 | 每种可用转换都可以预览。 |
| 应用按钮 | 仅本次使用、设为该类型默认、设为全局默认。 |

### 12.3 Plain text 预览

| 显示内容 | 说明 |
|---|---|
| 最终文本 | 模型实际接收内容。 |
| 编码 | 当前解码方式。 |
| token 估算 | 发送成本提示。 |
| 空白处理 | 是否保留连续空格。 |
| 换行处理 | 是否统一为 LF。 |

### 12.4 Markdown 预览

| 显示内容 | 说明 |
|---|---|
| 渲染视图 | 用户友好的 Markdown 渲染。 |
| 源码视图 | 实际发送的 Markdown。 |
| 丢失提示 | 图片、样式、页眉页脚、批注、修订痕迹等。 |
| 表格检查 | 表格是否完整转换。 |

### 12.5 Code 预览

| 显示内容 | 说明 |
|---|---|
| 文件名 | 原始文件名。 |
| 语言 | 推测语言。 |
| 源码 | 保留缩进和换行。 |
| 行号 | 默认仅 UI 显示。 |
| 编码 | 当前编码。 |

### 12.6 Table markdown 预览

| 显示内容 | 说明 |
|---|---|
| sheet 列表 | 多 sheet 文件导航。 |
| 行列数 | 每个 sheet 的规模。 |
| 完整 Markdown table | 可展开查看，超大表格分页。 |
| 公式提示 | 若存在公式。 |
| 合并单元格提示 | 若存在合并单元格。 |
| 隐藏内容提示 | 若存在隐藏行列或隐藏 sheet。 |

支持操作：

| 操作 | 说明 |
|---|---|
| 选择 sheet | 发送全部或部分 sheet。 |
| 选择范围 | 后期支持行列范围。 |
| 隐藏内容策略 | 排除或包含隐藏行列、隐藏 sheet。 |
| 值/公式策略 | 显示值、公式、值+公式。 |
| 超大表格确认 | 只警告，不默认摘要替代。 |

### 12.7 PDF 预览

| 显示内容 | 说明 |
|---|---|
| PDF 页面预览 | 转换后的临时 PDF，也是发送 PDF。 |
| 页数 | 转换结果页数。 |
| 转换器 | LibreOffice、Chromium、Ghostscript 等。 |
| 渲染参数 | HTML JS、外链、CSS media、超时等。 |
| warnings | 字体替换、分页变化、外链未加载、脚本未执行等。 |

### 12.8 Hybrid 预览

| 显示内容 | 说明 |
|---|---|
| 文本部分 | markdown、table markdown 或 code。 |
| PDF 部分 | PDF attachment 预览。 |
| 组合说明 | 模型将同时收到哪些内容。 |
| 成本提示 | token 与附件数量估算。 |
| 兼容性 | 当前模型是否支持 text + file。 |

---

## 13. Send Plan 与模型兼容性判断

### 13.1 基本规则

模型兼容性只根据 selectedOption 的 targetKind 和 sendPlan 判断。原始文件扩展名只参与候选生成，不参与最终兼容性判断。

| targetKind | sendPlan strategy | 模型要求 |
|---|---|---|
| `plain_text` | text_in_prompt | text |
| `markdown` | text_in_prompt | text |
| `code` | text_in_prompt | text |
| `table_markdown` | text_in_prompt | text |
| `pdf_attachment` | file_attachment | file 或 PDF input |
| `hybrid` | mixed | text + file/PDF input |

### 13.2 示例

| 原始文件 | 用户选择 | 模型要求 |
|---|---|---|
| `.docx` | markdown | text |
| `.docx` | PDF attachment | file/PDF input |
| `.html` | code | text |
| `.html` | markdown | text |
| `.html` | PDF attachment | file/PDF input |
| `.csv` | table markdown | text |
| `.ps` | code | text |
| `.ps` | PDF attachment | file/PDF input |

### 13.3 Preflight Gate

发送前检查：

| 检查项 | 行为 |
|---|---|
| selectedOption 是否存在 | 不存在则阻止发送。 |
| selectedOption 是否 ready | 未 ready 则等待转换或提示失败。 |
| DerivedAsset 是否 stale | stale 则重新生成。 |
| 预览与发送 contentHash 是否一致 | 不一致则阻止发送并重新生成。 |
| 模型能力是否满足 | 不满足则阻止发送并提示改选。 |
| token 是否超过软阈值 | 提示并要求确认。 |
| token 是否超过硬限制 | 阻止发送。 |
| PDF 附件是否可上传 | 不可上传则阻止发送。 |
| 外部依赖是否可用 | 不可用则标记路径不可用。 |
| 安全策略是否满足 | 不满足则阻止执行转换。 |

---

## 14. 安全规则

### 14.1 通用规则

| 风险 | 规则 |
|---|---|
| 文件内容指令 | 作为不可信用户内容包裹。 |
| 文件名注入 | 文件名、type、language 必须 escaping。 |
| Office 宏 | 不执行宏。 |
| HTML JavaScript | 默认不执行；用户可显式开启渲染，但必须沙箱。 |
| 外部资源 | 默认不加载；用户可显式授权。 |
| PostScript | 必须隔离进程、限定目录、启用安全文件访问控制。 |
| 远程链接 | 默认作为文本保留，不主动请求。 |
| 日志 | 禁止记录本地绝对路径、文件正文、敏感片段。 |
| 临时资产 | 过期清理，不进入历史消息。 |
| 未选择候选 | 不发送。 |

### 14.2 外部进程沙箱

LibreOffice、Chromium、Ghostscript、Pandoc 等外部进程应统一由 sandbox runner 调用。

Sandbox runner 要求：

| 项目 | 要求 |
|---|---|
| 工作目录 | 每次转换独立临时目录。 |
| 读权限 | 只允许读取输入文件和必要依赖。 |
| 写权限 | 只允许写入指定输出目录。 |
| 网络 | 默认禁用。 |
| 超时 | 必须设置。 |
| 内存 | 尽可能限制。 |
| 进程树 | 超时后清理子进程。 |
| 日志 | 脱敏，禁止绝对路径和正文。 |
| 清理 | 转换完成或失败后清理临时文件。 |

### 14.3 HTML → PDF 安全策略

| 选项 | 默认 | 说明 |
|---|---|---|
| JavaScript | disabled | 用户可开启。 |
| 外链资源 | disabled | 用户可授权。 |
| 本地文件访问 | disabled | 不允许读取任意本地文件。 |
| 超时 | enabled | 防止动态页面无限等待。 |
| 弹窗 / 下载 | disabled | 禁止副作用。 |
| Cookie / Storage | isolated | 使用隔离 profile。 |

### 14.4 Ghostscript 策略

| 项目 | 要求 |
|---|---|
| 安全模式 | 必须启用。 |
| 输入输出目录 | 显式白名单。 |
| 任意文件访问 | 禁止。 |
| 网络 | 禁止。 |
| 版本检测 | 必须记录并展示。 |
| 依赖缺失 | 路径显示不可用。 |

---

## 15. 错误、提示与诊断

### 15.1 错误结构

```ts
export type ConversionError = {
  errorCode: string
  message: string
  recoverable: boolean
  retryable: boolean
  fallbackOptions: string[]
  diagnostic?: {
    adapterId?: string
    adapterVersion?: string
    phase?: string
    sanitizedDetail?: string
  }
}
```

### 15.2 常见错误与处理

| 错误或风险 | UI 提示 | 可操作项 |
|---|---|---|
| 编码识别失败 | 无法可靠识别文本编码。 | 手动选择编码。 |
| 文本乱码 | 当前编码下内容可能乱码。 | 切换编码重新预览。 |
| DOCX 语义提取失败 | Word 文档文本提取失败。 | 尝试 PDF attachment 或 Pandoc。 |
| DOC 格式不支持 | 旧版 Word 格式解析能力有限。 | 尝试 PDF attachment。 |
| 表格过大 | 完整表格可能超过上下文。 | 选择 sheet、范围、确认发送或改用 PDF。 |
| 合并单元格损失 | Markdown 可能无法表达合并单元格。 | 预览 PDF 对照。 |
| HTML 动态内容缺失 | 当前未执行 JavaScript。 | 开启 JS 渲染后重新生成。 |
| 外链未加载 | 转换未主动加载远程资源。 | 授权外链加载后重试。 |
| PS 渲染失败 | PostScript 转 PDF 失败。 | 按源码发送。 |
| 依赖缺失 | 未检测到 LibreOffice / Chromium / Ghostscript。 | 安装依赖或选择其他路径。 |
| 临时预览过期 | 预览文件已清理。 | 重新生成预览。 |

---

## 16. 缓存与失效规则

### 16.1 Cache Key

DerivedAsset 缓存键建议包含：

```text
sourceHash
+ targetKind
+ adapterId
+ adapterVersion
+ conversionSettingsHash
+ selectedEncoding
+ sheetSelection
+ hiddenContentPolicy
+ formulaPolicy
+ htmlJavascriptPolicy
+ externalResourcePolicy
+ cssMediaPolicy
```

### 16.2 失效条件

| 变化 | 处理 |
|---|---|
| 原始文件变化 | 全部派生资产失效。 |
| 编码变化 | 文本相关资产失效。 |
| sheet 范围变化 | 表格相关资产失效。 |
| 隐藏内容策略变化 | 表格相关资产失效。 |
| 公式策略变化 | 表格相关资产失效。 |
| HTML JS 策略变化 | HTML PDF 资产失效。 |
| 外链策略变化 | HTML PDF 资产失效。 |
| 转换器版本变化 | 对应 adapter 资产失效。 |
| prompt envelope 规则变化 | 文本发送资产失效。 |

---

## 17. Draft 与 Message 绑定规则

### 17.1 上传阶段

RawFile 保存；FileProfile 和 ConversionOption 生成；低成本 DerivedAsset 可立即生成；高成本 PDF 或外部进程转换懒加载。

### 17.2 草稿阶段

DraftAttachment 记录 rawFileId、selectedOptionId、当前 selectedAssetIds、compatibilityStatus。预览资产可以 draft_bound，但必须标明是否 preview_only 或 preview_and_send。

### 17.3 发送阶段

发送成功后，MessageAttachment 只绑定实际发送的 usedOptionId 和 usedAssetIds。未选择路径和未发送的预览资产不进入历史消息。

### 17.4 清理阶段

| 资产类型 | 清理规则 |
|---|---|
| temporary preview | 过期清理。 |
| draft_bound 未发送资产 | 草稿删除或选择变化后按过期策略清理。 |
| message_bound 资产 | 随消息历史保留。 |
| failed 转换残留 | 立即清理临时目录，仅保留脱敏诊断。 |

---

## 18. 分阶段落地计划

> 废弃说明（执行计划重定向，2026-04-29）：本章节保留为历史设计记录，不再作为实际执行计划来源。后续实施阶段、提交组织与验收节奏以 `docs/file-pipeline/format-conversion-preview-implementation-plan.md` 为准。

### Phase 1：基础文本、代码与 CSV/TSV

目标：修复原始扩展名误判，建立 selected conversion option 和预览发送同源。

能力：

1. RawFile、EncodingProfile、ConversionOption、DerivedAsset 基础模型。
2. chardet + iconv-lite + TextDecoder fatal。
3. 手动选择编码。
4. plain text、markdown passthrough、code。
5. CSV/TSV → table markdown。
6. selectedOptionId 绑定 draft。
7. Send Plan 按 targetKind 判断兼容性。
8. 预览与发送同源。
9. 超大文本软阈值确认。
10. 基础错误码和 warning。

### Phase 2：XLSX / XLS 表格

能力：

1. SheetJS 读取 workbook。
2. 多 sheet 导航。
3. 完整 table markdown。
4. 公式、隐藏行列、隐藏 sheet、合并单元格 warning。
5. 显示值 / 原始值 / 公式策略。
6. 大表预览分页。
7. 发送 gate。

### Phase 3：DOCX / RTF / DOC 语义路径

能力：

1. DOCX → Mammoth → HTML → Turndown → Markdown。
2. Pandoc 作为高级路径或 fallback。
3. DOCX 中表格、图片占位、脚注、批注、修订痕迹 warnings。
4. RTF / DOC 尝试 markdown 或提示使用 PDF attachment。

### Phase 4：PDF attachment

能力：

1. LibreOffice headless：Office → PDF。
2. PDF 预览与发送同源。
3. PDF attachment sendPlan。
4. 模型 file/PDF 能力 gate。
5. 外部依赖检测。
6. 沙箱 runner。

### Phase 5：HTML 完整路径

能力：

1. HTML → Markdown。
2. HTML → Code。
3. HTML → PDF via Chromium / Puppeteer。
4. JavaScript 渲染选项，默认关闭，可开启。
5. 外链资源选项，默认关闭，可授权。
6. print / screen CSS media 切换。

### Phase 6：PS/EPS 与 Hybrid

能力：

1. PS/EPS → code。
2. PS/EPS → PDF via Ghostscript。
3. Ghostscript 安全沙箱。
4. markdown + PDF、table markdown + PDF、code + PDF hybrid。
5. text + file 组合 sendPlan。

---

## 19. 验收标准

### 19.1 默认行为

| 项目 | 标准 |
|---|---|
| 纯文本 | 默认 plain text。 |
| Markdown | 默认 markdown。 |
| 代码 | 默认 code。 |
| 表格 | 默认完整 table markdown。 |
| DOCX | 默认 markdown。 |
| HTML 文档 | 默认 markdown。 |
| HTML 源码 | 默认 code。 |
| PS/EPS | 默认 ask each time。 |

### 19.2 用户控制

1. 所有合格可用路径在高级 UI 可见。
2. 用户可选择目标格式。
3. 用户可选择具体引擎链。
4. 用户可设置本次默认、文件类型默认、全局默认。
5. 用户可手动选择编码。
6. 用户可配置超大文本软阈值。
7. HTML → PDF 的 JavaScript 渲染可由用户开启。

### 19.3 预览准确性

1. 文本预览与发送文本使用同一 DerivedAsset。
2. PDF 预览与发送 PDF 是同一资产或相同 contentHash。
3. 任何参数变化都会触发资产失效。
4. 用户看到的 warning 必须与发送时 warning 快照一致，除非重新计算后更新。

### 19.4 错误可见性

1. 转换失败可见。
2. 编码异常可见。
3. 表格损失可见。
4. 外链未加载可见。
5. JS 未执行可见。
6. 渲染失败可见。
7. 依赖缺失可见。
8. 每个失败都有 fallbackOptions。

### 19.5 兼容性判断

1. 模型兼容性由 selectedOption 和 sendPlan 决定。
2. 原始扩展名不得直接判 incompatible。
3. `.docx` 选择 markdown 时只要求 text。
4. `.docx` 选择 PDF attachment 时要求 file/PDF input。
5. `.html` 选择 code 时只要求 text。
6. `.csv` 选择 table markdown 时只要求 text。

### 19.6 安全

1. 不执行宏。
2. HTML JS 默认关闭。
3. 外链默认不加载。
4. 外部转换器在沙箱中运行。
5. 文件名和元数据必须 escaping。
6. 日志不记录本地绝对路径和正文。
7. 临时资产按过期策略清理。

---

## 20. 测试矩阵

### 20.1 编码测试

| 用例 | 预期 |
|---|---|
| UTF-8 无 BOM | 自动识别并正确预览。 |
| UTF-8 with BOM | BOM 被识别并处理。 |
| GBK 中文文本 | 可自动识别或手动切换为 GBK。 |
| GB18030 中文文本 | 可手动切换。 |
| Big5 繁体文本 | 可手动切换。 |
| Shift_JIS 日文文本 | 可手动切换。 |
| 错误编码导致乱码 | warning 可见。 |
| NUL 字节密集 | 提示可能非文本或 UTF-16。 |

### 20.2 文本与代码测试

| 用例 | 预期 |
|---|---|
| `.txt` | 默认 plain text。 |
| `.log` | 默认 plain text，可选 code。 |
| `.md` | 默认 markdown。 |
| `.py` | 默认 code。 |
| `.json` | 默认 code。 |
| 行号显示 | 不进入发送正文。 |

### 20.3 表格测试

| 用例 | 预期 |
|---|---|
| CSV 逗号分隔 | 正确 table markdown。 |
| TSV | 正确识别 tab。 |
| CSV 字段内换行 | 正确解析。 |
| CSV 引号转义 | 正确解析。 |
| XLSX 多 sheet | sheet 导航。 |
| XLSX 公式 | 默认显示值并 warning。 |
| XLSX 隐藏行列 | 默认排除并 warning。 |
| XLSX 隐藏 sheet | 默认排除并 warning。 |
| 合并单元格 | 展开或提示损失。 |
| 超大表格 | 预览分页，发送 gate。 |

### 20.4 DOCX / Office 测试

| 用例 | 预期 |
|---|---|
| DOCX 标题段落 | markdown 正确生成。 |
| DOCX 列表 | markdown 列表正确生成。 |
| DOCX 表格 | markdown table 或 warning。 |
| DOCX 图片 | 占位或 warning。 |
| DOCX 批注 | warning。 |
| DOCX 修订痕迹 | warning。 |
| DOCX → PDF | 生成 PDF attachment。 |
| DOCX markdown 失败 | PDF 候选仍可用。 |
| DOC | 默认 ask each time 或 PDF attachment。 |

### 20.5 HTML 测试

| 用例 | 预期 |
|---|---|
| 静态 HTML 文档 | 默认 markdown。 |
| HTML 源码 | 默认 code。 |
| HTML → PDF JS disabled | 不执行脚本并 warning。 |
| HTML → PDF JS enabled | 沙箱渲染并生成新 PDF。 |
| 外链资源 disabled | 不加载外链并 warning。 |
| print CSS | 默认使用。 |
| screen CSS | 用户可切换。 |

### 20.6 PDF / file 能力测试

| 用例 | 预期 |
|---|---|
| 支持 PDF 的模型 | PDF attachment 可发送。 |
| 不支持 PDF 的模型 | 阻止发送并提示改选。 |
| Hybrid 支持模型 | text + PDF 可发送。 |
| Hybrid 不支持模型 | 阻止发送。 |

### 20.7 历史绑定测试

| 用例 | 预期 |
|---|---|
| 用户预览未发送路径 | 不进入历史消息。 |
| 用户切换转换路径 | 旧资产不作为 message attachment。 |
| 成功发送 | MessageAttachment 只绑定 used assets。 |
| 临时资产过期 | 可重新生成。 |

---

## 21. 路径抉择记录

| 问题 | 决策 |
|---|---|
| 是否自研核心转换器 | 不自研复杂格式转换器，采用第三方引擎。 |
| 是否暴露多引擎 | 暴露所有合格可用路径，但分层展示。 |
| PDF 转换后如何处理 | 作为附件发送给 OpenRouter，由路由和目标模型解析。 |
| HTML → PDF 是否执行 JavaScript | 默认关闭，用户可开启。 |
| 外链资源是否加载 | 默认关闭，用户可授权。 |
| 是否允许强制发送超大文本 | 允许超过软阈值后确认发送，但不得超过硬限制。 |
| 超大表格是否默认摘要 | 不默认摘要，摘要只作为额外候选。 |
| DOCX 默认路径 | Markdown 语义提取。 |
| DOCX 高保真路径 | LibreOffice → PDF attachment。 |
| XLSX 默认输出 | Table markdown，默认显示值，提示公式和隐藏内容。 |
| Hybrid 是否第一期实现 | 不作为第一期主链路。 |

---

## 22. 最终落地原则

1. 系统只做低风险、可解释、可配置的默认选择。
2. 用户通过预览比较实际输出，再决定本次发送目标格式。
3. 可用路径尽量暴露，但必须通过安全、预览、发送、复现、诊断和测试门槛。
4. 转换引擎可以多样，主流程抽象必须统一。
5. 预览资产和发送资产必须同源。
6. 模型兼容性由 Send Plan 决定，不由原始扩展名决定。
7. PDF attachment 的解析责任交给 OpenRouter 和目标模型。
8. 编码错误必须可见，用户必须能手动选择编码。
9. 超大内容由软阈值提醒和硬阈值阻断共同治理。
10. 未被发送的临时资产不得进入历史消息。
