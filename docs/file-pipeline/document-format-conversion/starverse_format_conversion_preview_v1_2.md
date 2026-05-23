# Starverse 文档格式转换与预览最终方案

版本：v1.2  
状态：修订定稿  
适用范围：Starverse 文件上传、附件转换、发送计划、预览交互、模型兼容性判断、历史消息绑定与转换安全治理  
边界声明：不设计独立图片格式处理；不设计音频格式处理；不设计 PDF 本地解析机制；不执行宏、脚本、远程资源和主动内容。PDF 作为原始文件或转换后附件发送时，其解析责任交由 OpenRouter 路由与目标模型承担。

---

## 0. v1.2 修订摘要

相对 v1.0，本版本做出以下架构修订：

| 项目 | v1.2 决策 |
|---|---|
| Hybrid | 第一版移除，不再设计 text + file 混合发送目标。 |
| 原始格式发送 | 新增 `original_file`，作为一等目标格式保留。 |
| 发送资产引用 | 新增 `SendAssetRef`，统一表达 `raw_file` 与 `derived_asset`。 |
| PDF 语义 | 直接上传的 PDF 默认是 `original_file`；由其他格式转换得到的 PDF 才是 `pdf_attachment`。 |
| `.doc` 策略 | 暂时不对 `.doc` 做特殊产品策略，统一归入 Office 文档候选体系。 |
| HTML 外链 | 第一版只做外部资源总开关，不做域名级或资源级授权。 |
| UI | 首屏采用 Attachment Shelf + Attachment Detail Inspector。 |
| 附件首屏 chip | 只显示文件类型和关闭按钮，文件名与状态细节通过 hover tooltip 展示。 |
| 状态颜色 | 绿色可发送，黄色警告或需确认，红色阻断，灰色检测中或转换中。 |
| Phase 6 | 改为 PS/EPS 后期路径，不再包含 Hybrid。 |

---

## 1. 总体结论

Starverse 的文件转换体系采用以下基本架构：

**第三方转换内核 + Starverse 自研转换治理层 + 分层 UI 暴露 + 用户可自定义转换路径 + 原始文件直发保留。**

第三方工具负责复杂格式读取、抽取或渲染，例如 DOCX、XLSX、HTML、PDF、PS/EPS 等。Starverse 自研部分负责文件画像、候选生成、用户选择、转换状态机、DerivedAsset 缓存、预览一致性、错误诊断、安全封装、Send Plan、模型兼容性判断、超大文本 gate、Draft 绑定和 Message 绑定。

系统应提供推荐默认路径，同时保留高级用户选择其他合格路径的能力。所有安全、可预览、可复现、可发送、可测试的转换路径都可以在高级 UI 中作为可选项展示。系统通过推荐、语义提取、高保真版面、可能有损、慢速、需要沙箱、依赖缺失、实验性等标签帮助用户判断。

原始文件直发是独立目标格式。它表示将用户上传的原始 RawFile 作为附件交给目标模型或模型路由处理，不经过本地格式转换，也不代表 Starverse 会执行、解析或信任其中的主动内容。

---

## 2. 目标与边界

### 2.1 目标

| 目标 | 要求 |
|---|---|
| 可控 | 用户能够选择原始文件、plain text、markdown、code、table markdown、PDF attachment 等目标格式。 |
| 可预览 | 用户能够查看实际将发送给模型的文本内容，或查看即将作为附件发送的 PDF；原始文件路径展示元信息与安全预览。 |
| 可配置 | 默认路径由规则产生，允许用户设为本次默认、文件类型默认或全局默认。 |
| 可降级 | 单一路径失败不影响其他路径；失败原因和可用 fallback 必须可见。 |
| 可复现 | 同一原文件、同一转换器版本、同一转换参数应得到稳定 DerivedAsset。 |
| 可绑定 | 历史消息只绑定实际发送资产，未发送预览资产不得污染历史。 |
| 可诊断 | 所有失败、损失、编码异常、依赖缺失、安全限制都有 errorCode 与 warning。 |
| 可保留原始格式 | 当前模型支持文件输入时，用户可以选择将原始文件作为附件发送。 |

### 2.2 覆盖范围

| 类别 | 示例 |
|---|---|
| 纯文本文件 | `.txt`、`.log`、`.ini`、`.env` |
| Markdown 文件 | `.md`、`.markdown` |
| 代码、脚本、配置 | `.bat`、`.ps1`、`.sh`、`.py`、`.js`、`.ts`、`.json`、`.yaml`、`.xml`、HTML 源码 |
| Office 文档 | `.docx`、`.doc`、`.rtf` |
| 表格文件 | `.csv`、`.tsv`、`.xlsx`、`.xls` |
| HTML 文档 | `.html`、`.htm`、网页导出文件 |
| PDF 文件 | `.pdf`，默认作为原始文件附件发送 |
| PostScript 类文件 | `.ps`、`.eps` |

### 2.3 不覆盖范围

| 不覆盖内容 | 说明 |
|---|---|
| 独立图片格式处理 | 不设计 `.png`、`.jpg`、`.webp`、`.gif` 等图片文件的识别、压缩、转码或发送策略。 |
| 音频格式处理 | 不设计 `.mp3`、`.wav`、`.m4a` 等音频文件处理方式。 |
| PDF 本地解析机制 | 不讨论 PDF 如何 OCR、如何抽取页面、如何由 Starverse 解析。 |
| 主动内容执行 | 不执行 Office 宏、脚本、PostScript 非必要危险操作或嵌入对象。 |
| 外链抓取 | 默认不加载 HTML、Office 或其他文档中的远程资源。HTML PDF 可由用户总开关授权外部资源加载。 |
| Hybrid 发送 | 第一版不设计 markdown + PDF、table markdown + PDF、code + PDF 等混合发送目标。 |

---

## 3. 核心原则

### 3.1 扩展名只作初筛

扩展名、浏览器 MIME、服务端 MIME、magic bytes、编码检测、内容采样和解析器结果共同参与判断。扩展名不得直接决定最终发送形态，也不得直接决定模型是否兼容。

### 3.2 selectedOption 驱动发送

发送阶段只看用户当前选中的 `selectedOptionId`。原始文件扩展名只参与候选生成和风险提示，不直接决定请求构造。

### 3.3 原始文件是一等目标格式

`original_file` 必须作为正式 targetKind。它保留原始格式直发能力，让用户可以使用模型或平台的原生文件输入能力。

### 3.4 系统推荐默认路径，用户保留选择权

系统为每个文件提供推荐路径。推荐路径应低风险、可解释、质量较高。用户可以在详情面板中选择其他合格路径，也可以保存偏好。

### 3.5 UI 分层暴露

首屏只显示附件 chip 和状态颜色。目标格式、预览、兼容性、warning、引擎链、编码、sheet 策略、HTML 渲染策略等细节进入 Attachment Detail Inspector。

### 3.6 可用路径必须合格

可用路径必须同时满足以下条件：

| 条件 | 含义 |
|---|---|
| 安全可控 | 不突破沙箱，不默认联网，不执行不必要的主动内容。 |
| 可预览 | 用户能看到该路径的真实输出，或看到原始文件路径的安全元信息。 |
| 可发送 | 输出能进入 Send Plan。 |
| 可复现 | 可由 sourceHash、converterVersion、settingsHash 复现。 |
| 可诊断 | 失败有 errorCode、message、recoverable、retryable、fallbackOptions。 |
| 可测试 | 至少有基础回归用例。 |

不满足这些条件的路径只能显示为不可用、实验性内部能力或开发诊断能力，不能作为可执行发送选项。

### 3.7 预览与发送同源

文本类转换的预览内容必须与实际发送内容来自同一个 DerivedAsset。PDF 转换候选的预览 PDF 与发送 PDF 必须是同一个资产，或至少具有相同 contentHash。任何编码、sheet 范围、隐藏内容策略、JavaScript 渲染策略、外链策略、转换器版本或参数变化都会使旧资产失效。

### 3.8 PDF 转换边界

当用户选择 `pdf_attachment` 时，Starverse 负责把源文件转换为 PDF、提供 PDF 预览、并把 PDF 作为附件纳入 Send Plan。Starverse 不解析 PDF 内容，不 OCR，不拆页，不模拟模型侧 PDF 理解。PDF 是否可被理解由 OpenRouter 路由、目标模型能力和实际 file input 支持情况决定。

直接上传 PDF 时，默认目标格式是 `original_file`，因为原始文件本身就是 PDF 附件。

### 3.9 超大内容不默认摘要

表格和文档默认保留完整转换结果。摘要只能作为额外候选或用户主动选择的派生方式，不能默认替代完整 table markdown 或完整 markdown。发送阶段由 token gate 和文件大小 gate 提示、拦截或要求用户确认。

### 3.10 安全边界优先于自由选择

用户可以选择高级路径和原始文件发送，但不能绕过宏、脚本、外部进程、路径、沙箱、日志脱敏、上下文硬限制等安全边界。

---

## 4. 总体流程

| 步骤 | 动作 | 输出 |
|---:|---|---|
| 1 | 上传原始文件 | RawFile |
| 2 | 基础识别 | extension、MIME、magic bytes、size、hash |
| 3 | 编码检测与内容采样 | EncodingProfile、sample preview |
| 4 | 生成文件画像 | FileProfile |
| 5 | 生成转换候选 | ConversionOption 列表，包括 `original_file` identity 选项 |
| 6 | 生成低成本预览资产 | DerivedAsset 或原始文件元信息 |
| 7 | 用户选择目标格式或自定义路径 | selectedOptionId |
| 8 | 懒加载高成本转换 | PDF、Office、HTML render、PS/EPS render |
| 9 | 预览与 warning 检查 | PreviewPanel / Detail Inspector |
| 10 | 绑定到 draft | DraftAttachment |
| 11 | Send Plan 计算 | text/file request plan |
| 12 | 发送前 preflight | capability、token、size、安全、依赖状态 |
| 13 | 成功发送后绑定 message | MessageAttachment、usedAssetRefs |
| 14 | 清理未使用临时资产 | 过期删除或缓存回收 |

发送阶段只看用户选择的结果，不直接看原始扩展名。例如 `.docx` 选择 markdown 时只要求模型支持 text；`.docx` 选择 original_file 时要求模型支持 file input 且支持 DOCX 或通用文件；`.docx` 选择 PDF attachment 时要求模型支持 file/PDF input。

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
| `magicBytes` | 文件头识别信息，UI 不显示原始字节 |
| `sizeBytes` | 文件大小 |
| `hash` | 去重、缓存与复用依据，普通日志不得记录完整 hash |
| `uploadTime` | 上传时间 |
| `storageRef` | 原始文件存储引用，renderer 不持有真实路径 |
| `status` | `uploaded`、`profile_pending`、`profile_ready`、`profile_failed`、`removed` |

RawFile 是原始上传资产，用于 `original_file` 发送、转换输入和历史追溯。转换结果不得写回 RawFile。

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

### 5.4 SendAssetRef

`SendAssetRef` 统一表达最终发送资产来源。

```ts
export type SendAssetRef =
  | {
      kind: 'raw_file'
      assetId: string
    }
  | {
      kind: 'derived_asset'
      assetId: string
    }
```

对应关系：

| targetKind | SendAssetRef |
|---|---|
| `original_file` | `raw_file` |
| `plain_text` | `derived_asset` |
| `markdown` | `derived_asset` |
| `code` | `derived_asset` |
| `table_markdown` | `derived_asset` |
| `pdf_attachment` | `derived_asset` |

### 5.5 ConversionOption

| 字段 | 说明 |
|---|---|
| `optionId` | 转换选项 ID |
| `rawFileId` | 对应原始文件 |
| `targetKind` | `original_file`、`plain_text`、`markdown`、`code`、`table_markdown`、`pdf_attachment` |
| `strategy` | `text_in_prompt`、`file_attachment` |
| `engineChain` | 转换引擎链，例如 `identity`、`mammoth_to_html -> turndown_to_markdown` |
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
| `previewAssetRef` | 预览资产引用 |
| `sendAssetRefs` | 实际发送资产引用列表 |
| `status` | `candidate`、`pending`、`ready`、`failed`、`stale`、`blocked` |
| `conversionSettingsHash` | 转换参数哈希 |
| `contentHash` | 转换结果哈希，original_file 可省略或引用 RawFile hash |
| `staleReason` | 失效原因 |

`original_file` 的 ConversionOption 示例：

```ts
{
  targetKind: 'original_file',
  strategy: 'file_attachment',
  engineChain: 'identity',
  status: 'ready',
  sendAssetRefs: [{ kind: 'raw_file', assetId: rawFileId }]
}
```

### 5.6 DerivedAsset

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

`original_file` 不生成 DerivedAsset。

### 5.7 DraftAttachment

| 字段 | 说明 |
|---|---|
| `draftAttachmentId` | 草稿附件 ID |
| `draftId` | 草稿 ID |
| `rawFileId` | 原始文件引用 |
| `selectedOptionId` | 当前选择的转换选项 |
| `selectedAssetRefs` | 当前选择对应的发送资产引用 |
| `detectionState` | `not_started`、`detecting`、`ready`、`failed`、`stale` |
| `conversionState` | `not_needed`、`candidate`、`pending`、`ready`、`failed`、`stale` |
| `compatibilityStatus` | `compatible`、`warning`、`incompatible`、`blocked`、`pending` |
| `lastPreviewedAt` | 最近预览时间 |
| `warnings` | 草稿阶段提示 |

DraftAttachment 只保存当前选中的 option 与 asset refs。候选 ConversionOption 通过 rawFileId 查询。

### 5.8 MessageAttachment

| 字段 | 说明 |
|---|---|
| `messageAttachmentId` | 历史消息附件 ID |
| `messageId` | 消息 ID |
| `rawFileId` | 原始文件引用，可用于追溯 |
| `usedOptionId` | 实际发送的转换选项 |
| `usedAssetRefs` | 实际发送的资产引用 |
| `targetKind` | 实际发送目标格式 |
| `sendStrategy` | `text_in_prompt` 或 `file_attachment` |
| `modelId` | 发送时模型 |
| `providerRoute` | 若可得，记录 OpenRouter 路由信息 |
| `warningsAtSendTime` | 发送时提示快照 |
| `sentAt` | 发送时间 |

---

## 6. 状态机

### 6.1 RawFile 状态

```text
uploaded
  -> profile_pending
  -> profile_ready
  -> profile_failed
  -> removed
```

### 6.2 ConversionOption 状态

```text
candidate
  -> pending
  -> ready
  -> failed
  -> stale
  -> blocked
```

| 状态 | 含义 |
|---|---|
| `candidate` | 已识别为可尝试路径，但尚未转换。 |
| `pending` | 转换任务已入队或执行中。 |
| `ready` | 已有可预览或可发送资产；original_file 通常初始 ready。 |
| `failed` | 转换失败，但其他候选不受影响。 |
| `stale` | 参数、编码、文件、转换器版本或策略变化导致资产失效。 |
| `blocked` | 当前策略阻断该路径。 |

### 6.3 DerivedAsset 状态

```text
temporary
  -> draft_bound
  -> message_bound
  -> expired
```

### 6.4 关键规则

1. RawFile 可以绑定 draft。
2. ConversionOption 可以绑定 draft。
3. DerivedAsset 可以在 draft 阶段作为 preview/send candidate 绑定。
4. MessageAttachment 只绑定成功发送的实际资产。
5. 未被发送的预览资产不得进入历史消息。
6. 用户更改转换方式后，旧 option 保留但标记为 unselected 或 stale。
7. 用户更改编码、sheet 范围、隐藏内容策略、JavaScript 渲染策略、外链策略后，必须生成新的 DerivedAsset。
8. original_file 使用 raw_file SendAssetRef，不生成 DerivedAsset。
9. 模型切换只重算 Send Plan 与 compatibility，不使检测缓存或转换缓存失效。
10. 用户移除附件后，后台 job 可以完成，但不得写回已移除的 draft UI。

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

### 8.1 Original file

适用于用户希望保留原始格式并直接作为附件发送的场景。`original_file` 不做格式转换，不改变原始字节。

| 保留 | 不承诺 |
|---|---|
| 原始文件内容 | Starverse 本地解析结果 |
| 原始 MIME / 扩展名 | 模型一定能理解该格式 |
| 原始文件结构 | 目标模型一定完整保留结构 |
| 原始附件形式 | 本地执行宏、脚本、主动内容 |

发送规则：

1. 使用 RawFile / StoredAsset 作为 send asset。
2. 要求目标模型或 OpenRouter 路由支持 file input。
3. 若模型声明 supportedMimeTypes，则必须支持对应 MIME 或通用文件输入。
4. 文件大小必须满足平台限制。
5. 命中 executable、polyglot、明确 blocked flag 时阻止发送。
6. Office 宏、隐藏内容、公式、外链、元数据等以 warning 或确认项表达。
7. Starverse 不执行原始文件中的宏、脚本、外链或主动内容。

预览 UI 应写明：

```text
将发送原始文件。
Starverse 不会转换或执行该文件。
目标模型如何解析此格式取决于模型和 OpenRouter 路由能力。
```

### 8.2 Plain text

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

### 8.3 Markdown

适用于结构化文本、Word 文档、HTML 正文、RTF 与 Markdown 原文。目标是尽量保留语义结构。

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

`.md` 原文默认直接作为 markdown send asset。发送源码 Markdown，不发送渲染 HTML。

### 8.4 Code

适用于脚本、源码、配置、HTML 源码分析、PostScript 源码分析。此时文件被视为代码文本。

| 保留内容 | 说明 |
|---|---|
| 原始缩进 | 代码语义关键 |
| 换行 | 保持源码结构 |
| 文件名 | 便于模型定位 |
| 语言类型 | 用于代码块标记 |
| 行号 | UI 可显示；默认不进入发送正文 |

行号默认只是 UI 显示，不应进入 send asset。若用户显式选择带行号发送，则应生成独立 ConversionOption。

### 8.5 Table markdown

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

### 8.6 PDF attachment

适用于 DOCX、DOC、RTF、HTML、PS/EPS 等需要保留版面或渲染结果的文件。

| 来源 | PDF 候选含义 |
|---|---|
| DOCX / DOC / RTF | 用 LibreOffice 渲染为 PDF。 |
| HTML | 用 Chromium / Puppeteer 渲染为 PDF。 |
| PS / EPS | 用 Ghostscript 渲染为 PDF。 |

PDF 发送规则：

1. PDF 预览资产就是发送资产，或 contentHash 相同。
2. PDF 作为附件交给 OpenRouter。
3. Starverse 不解析 PDF。
4. 当前模型不支持 file/PDF input 时，Send Gate 必须阻止发送。
5. 用户可改选 markdown、plain text、code、table markdown 或 original_file。

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
  derivedAsset?: DerivedAsset
  sendAssetRefs: SendAssetRef[]
  warnings: ConversionWarning[]
  error?: ConversionError
  contentHash?: string
  converterName: string
  converterVersion: string
  conversionSettingsHash?: string
}
```

`original_file` 可由 identity adapter 或内建 option factory 生成，不调用外部转换器。

### 9.2 推荐引擎清单

| 能力 | 推荐引擎 | 暴露方式 |
|---|---|---|
| 原始文件发送 | identity | 一等目标格式。 |
| 编码检测 | `chardet` | 不作为用户路径，只显示检测结果。 |
| 编码解码 | `iconv-lite` + `TextDecoder` | 用户选择编码，不选择解码库。 |
| CSV / TSV | `Papa Parse` | 默认路径；高级 UI 可显示引擎名。 |
| XLSX / XLS | `SheetJS` | 默认路径；高级 UI 可显示引擎名。 |
| DOCX → HTML | `Mammoth` | DOCX semantic path 的主引擎。 |
| HTML → Markdown | `Turndown` | HTML markdown path 的主引擎。 |
| DOCX → Markdown | `Mammoth → Turndown` | 推荐路径。 |
| DOCX / DOC / RTF → PDF | `LibreOffice headless` | PDF attachment 路径。 |
| HTML → PDF | `Chromium / Puppeteer` | PDF attachment 路径。 |
| PS / EPS → PDF | `Ghostscript` | 后期启用，必须沙箱。 |
| 通用转换 | `Pandoc` | 可作为高级路径或 fallback。 |

### 9.3 多引擎暴露原则

Starverse 应暴露所有合格可用路径，但分层展示。

| UI 层级 | 展示内容 |
|---|---|
| Attachment Shelf | 文件类型 chip、状态颜色、关闭按钮。 |
| Attachment Detail Inspector | 文件列表、文件详情、目标格式选择、预览、兼容性、warning。 |
| Advanced | 具体引擎链、转换参数、依赖状态、安全限制、质量标签、缓存诊断。 |

### 9.4 路径标签

| 标签 | 含义 |
|---|---|
| 推荐 | 系统默认建议路径。 |
| 原始文件 | 保留原格式，直接作为附件发送。 |
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
| `.txt` | plain text | original_file、markdown、code |
| `.log` | plain text | original_file、code |
| `.ini`、`.env` | code | original_file、plain text |

关键点：

1. 编码检测必须可手动覆盖。
2. 大文件预览必须分页或虚拟滚动。
3. 发送前进行 token 和 size gate。
4. original_file 路径要求模型支持 file input。

### 10.2 Markdown

| 输入 | 默认 | 可选 |
|---|---|---|
| `.md`、`.markdown` | markdown | original_file、plain text、code |

Markdown 原文默认直接作为 markdown send asset。预览提供渲染视图和源码视图。

### 10.3 代码、脚本、配置

| 输入 | 默认 | 可选 |
|---|---|---|
| `.py`、`.js`、`.ts`、`.sh`、`.ps1`、`.bat` | code | original_file、plain text |
| `.json`、`.yaml`、`.xml` | code | original_file、plain text、markdown |

脚本与配置文件不本地执行。`original_file` 只表示原样作为附件发送，仍需通过静态风险 gate。

### 10.4 CSV / TSV

| 输入 | 默认 | 可选 |
|---|---|---|
| `.csv`、`.tsv` | table markdown | original_file、plain text、code、structured json 后期 |

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
| `.xlsx`、`.xls` | table markdown | original_file、plain text、PDF attachment、structured json 后期 |

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
10. original_file 路径提示隐藏 sheet、隐藏行列、公式、外部链接和元数据风险。

### 10.6 DOCX / DOC / RTF

| 输入 | 默认 | 可选 |
|---|---|---|
| `.docx`、`.doc`、`.rtf` | markdown | original_file、plain text、PDF attachment、Pandoc markdown 高级路径 |

统一口径：

1. `.docx`、`.doc`、`.rtf` 都进入 Office 文档候选体系。
2. 默认目标为 markdown。
3. PDF attachment 是高保真路径。
4. original_file 是原样附件路径。
5. `.doc` 暂时不做特殊默认策略；adapter 支持状况通过可用性与 warning 表达。

推荐路径：

```text
DOCX -> Mammoth -> HTML -> Turndown -> Markdown
```

高级路径：

```text
DOCX / DOC / RTF -> Pandoc -> Markdown
DOCX / DOC / RTF -> LibreOffice -> PDF attachment
DOCX / DOC / RTF -> original_file
```

实现要求：

1. Mammoth 路径标记为语义提取。
2. LibreOffice PDF 路径标记为高保真版面。
3. Pandoc 路径标记为通用转换。
4. 图片默认只作为占位或提示，不做图片处理。
5. 批注、脚注、尾注、修订痕迹、页眉页脚若未提取，必须 warning。
6. Markdown 转换失败不影响 PDF attachment 或 original_file 候选。
7. 用户选择 PDF 后，PDF 作为附件发送给 OpenRouter。
8. 用户选择 original_file 后，原始 Office 文件作为附件发送，仍需模型能力、MIME、大小和风险 gate。

### 10.7 HTML

| 输入 | 默认 | 可选 |
|---|---|---|
| HTML 文档 | markdown | original_file、code、plain text、PDF attachment |
| HTML 源码倾向明显 | code | original_file、markdown、plain text、PDF attachment |
| 无法判断 | ask each time | original_file、markdown、code、plain text、PDF attachment |

默认判断启发式：

| 条件 | 默认 |
|---|---|
| body 文本密度高、标题段落明显 | markdown |
| script/style 占比高、模板结构明显 | code |
| 用户已设置 HTML 默认 code | code |
| 无法判断 | ask each time |

HTML → PDF 规则：

| 选项 | 默认 | 第一版用户控制 |
|---|---|---|
| JavaScript 渲染 | 关闭 | 总开关开启 |
| 外部资源加载 | 关闭 | 总开关授权 |
| print CSS | 开启 | 默认 |
| screen CSS | 可选 | 可切换 |
| 本地文件访问 | 关闭 | 不开放 |
| Cookie / Storage | 隔离 | 不开放 |
| 弹窗 / 下载 | 关闭 | 不开放 |
| 超时 | 开启 | 可配置或固定默认 |

高级 UI 示例：

```text
HTML -> PDF attachment
Engine: Chromium
JavaScript: disabled by default, user may enable
External resources: disabled by default, user may authorize with one global toggle
CSS media: print or screen
Timeout: configurable
Preview -> Use for current send
```

### 10.8 PDF

| 输入 | 默认 | 可选 |
|---|---|---|
| `.pdf` | original_file | 后期可加入 extracted text 或 rendered images |

规则：

1. Starverse 不本地解析 PDF。
2. Starverse 不 OCR。
3. Starverse 不拆页。
4. 当前模型支持 PDF/file input 时可以作为附件发送。
5. 当前模型不支持时阻止发送，并提示切换模型或等待后期抽取能力。
6. 直接上传的 PDF 不应命名为 `pdf_attachment`，因为它不是转换结果。

### 10.9 PS / EPS

| 输入 | 默认 | 可选 |
|---|---|---|
| `.ps`、`.eps` | ask each time | original_file、code、PDF attachment |

实现要求：

1. code 路径按源码发送。
2. original_file 路径原样发送，需模型 file input 能力与安全 gate。
3. PDF attachment 路径使用 Ghostscript。
4. Ghostscript 必须运行在隔离进程中。
5. 必须开启安全文件访问控制。
6. 禁止访问任意本地路径。
7. 限制输入目录、输出目录、超时、内存和进程权限。
8. Ghostscript 路径放后期启用。

---

## 11. 默认选择与用户偏好

### 11.1 推荐默认规则

| 文件画像 | 默认转换 |
|---|---|
| 纯文本，无明显结构 | plain text |
| Markdown 文件 | markdown |
| 代码、脚本、配置 | code |
| CSV、TSV、XLSX、XLS | table markdown |
| DOCX、DOC、RTF | markdown |
| HTML 文档 | markdown |
| HTML 源码倾向明显 | code |
| PDF | original_file |
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
| `defaultOfficeTarget` | Office 默认 markdown，可改为 original_file 或 PDF attachment。 |
| `defaultHtmlTarget` | HTML 默认 markdown，可改为 code 或 original_file。 |
| `defaultPdfTarget` | PDF 默认 original_file。 |
| `defaultPsEpsTarget` | PS/EPS 默认 ask each time。 |
| `alwaysShowConversionOptions` | 默认 true。 |
| `forcePreviewBeforeSend` | 默认 false，可改为 true。 |
| `rememberPerFileTypeChoice` | 默认 true。 |
| `enableOriginalFileOption` | 默认 true。 |
| `enableAdvancedConversionPaths` | 默认 true。 |
| `showExperimentalPaths` | 默认 false。 |
| `htmlPdfJavascriptDefault` | 默认 disabled。 |
| `htmlPdfExternalResourcesDefault` | 默认 disabled。 |
| `maxConvertedTextBytesBeforeConfirm` | 默认 2 MiB。 |
| `maxConvertedTextBytesUserOverride` | 用户可设置 512 KiB、1 MiB、2 MiB、5 MiB、10 MiB、unlimited。 |
| `maxPromptContextRatioBeforeConfirm` | 默认 0.6，即转换文本超过当前模型上下文约 60% 时要求确认。 |
| `reservedResponseContextRatio` | 默认 0.2，即保留约 20% 上下文给模型回答。 |

### 11.3 超大文本强制发送设置

超大文本处理分为软阈值和硬阈值。

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
4. 若超出硬限制，系统提供可选方案：选择部分 sheet、缩小范围、改用 original_file、改用 PDF attachment、改用支持更长上下文的模型。

---

## 12. 预览交互设计

### 12.1 Attachment Shelf

首屏采用 Attachment Shelf，位于 Composer 输入框上方。

```text
Attachment Shelf
[PDF ×] [DOCX ×] [XLSX ×] [HTML ×]

输入框

[ + ] [推理] [搜索] [图片]                         [发送]
```

规则：

| 项目 | 规则 |
|---|---|
| 布局 | 单行横向排列。 |
| chip 内容 | 只显示文件类型和关闭按钮。 |
| 文件名 | hover tooltip 展示。 |
| 状态 | chip 颜色表达。 |
| 点击 chip 主体 | 打开 Attachment Detail Inspector。 |
| 点击 × | 移除当前附件。 |
| 横向溢出 | 启用横向滚动。 |
| 滚动条 | 预留高度，避免输入框跳动。 |

状态颜色：

| 颜色 | 含义 | 是否阻断发送 |
|---|---|---|
| 绿色 | 当前可发送 | 否 |
| 黄色 | 可发送，但有 warning 或确认项 | 否，必要时发送前确认 |
| 红色 | 当前阻断 | 是 |
| 灰色 | 检测中、转换中、未就绪 | 暂时不可发送 |

Tooltip 示例：

```text
report-final.pdf
当前发送方式：原始文件
状态：可发送
```

```text
data.xlsx
当前发送方式：表格 Markdown
状态：警告：包含公式和隐藏 sheet
```

### 12.2 Attachment Detail Inspector

点击任意 chip 进入二级详情面板。

```text
Attachment Detail Inspector
────────────────────────────────────────
左侧文件列表        右侧详情区域
────────────────────────────────────────
PDF report.pdf      文件摘要
DOCX 方案.docx      当前发送方式
XLSX data.xlsx      可选目标格式
HTML page.html      预览
                    Warning
                    Advanced
────────────────────────────────────────
```

左侧栏：

| 区域 | 内容 |
|---|---|
| 文件列表 | 所有已附加文件 |
| 当前选中文件 | 高亮 |
| 状态图标 | ready / warning / blocked / converting |
| 移除操作 | 可放在右键、hover 或右侧详情中 |

右侧主区域：

| 区域 | 内容 |
|---|---|
| 文件摘要 | 文件名、类型、大小、识别状态 |
| 当前发送方式 | 原始文件 / Markdown / 表格 Markdown / PDF 附件等 |
| 目标格式选择 | 卡片式选择 |
| 兼容性 | 当前模型是否可发送 |
| 预览 | 实际将发送的内容或原始文件元信息 |
| warnings | 编码、隐藏 sheet、公式、宏、外链等 |
| Advanced | 引擎链、编码、sheet、HTML JS、外链总开关、缓存信息 |

### 12.3 目标格式选择

目标格式只在 Attachment Detail Inspector 中展示。

可选卡片：

```text
[ 原始文件       保留原格式 · 需文件能力 ]
[ Markdown       推荐 · 可发送 ]
[ 纯文本         低保真 · 可发送 ]
[ 代码           源码分析 · 可发送 ]
[ 表格 Markdown  表格结构 · 可发送 ]
[ PDF 附件       保留版面 · 需 PDF/file 能力 ]
```

不同文件只显示适用目标。例如 DOCX 不显示 table markdown 作为主目标，XLSX 显示 table markdown，HTML 可显示 markdown、code、PDF 附件和原始文件。

`original_file` 是一等选项，不放入 Advanced。Advanced 只放引擎链、编码、sheet 策略、HTML JS 总开关、外链总开关、缓存与诊断。

### 12.4 Plain text 预览

| 显示内容 | 说明 |
|---|---|
| 最终文本 | 模型实际接收内容。 |
| 编码 | 当前解码方式。 |
| token 估算 | 发送成本提示。 |
| 空白处理 | 是否保留连续空格。 |
| 换行处理 | 是否统一为 LF。 |

### 12.5 Markdown 预览

| 显示内容 | 说明 |
|---|---|
| 渲染视图 | 用户友好的 Markdown 渲染。 |
| 源码视图 | 实际发送的 Markdown。 |
| 丢失提示 | 图片、样式、页眉页脚、批注、修订痕迹等。 |
| 表格检查 | 表格是否完整转换。 |

### 12.6 Code 预览

| 显示内容 | 说明 |
|---|---|
| 文件名 | 原始文件名。 |
| 语言 | 推测语言。 |
| 源码 | 保留缩进和换行。 |
| 行号 | 默认仅 UI 显示。 |
| 编码 | 当前编码。 |

### 12.7 Table markdown 预览

| 显示内容 | 说明 |
|---|---|
| sheet 列表 | 多 sheet 文件导航。 |
| 行列数 | 每个 sheet 的规模。 |
| 完整 Markdown table | 可展开查看，超大表格分页。 |
| 公式提示 | 若存在公式。 |
| 合并单元格提示 | 若存在合并单元格。 |
| 隐藏内容提示 | 若存在隐藏行列或隐藏 sheet。 |

### 12.8 PDF 预览

| 显示内容 | 说明 |
|---|---|
| PDF 页面预览 | 转换后的临时 PDF，也是发送 PDF。 |
| 页数 | 转换结果页数。 |
| 转换器 | LibreOffice、Chromium、Ghostscript 等。 |
| 渲染参数 | HTML JS、外链、CSS media、超时等。 |
| warnings | 字体替换、分页变化、外链未加载、脚本未执行等。 |

### 12.9 Original file 预览

| 显示内容 | 说明 |
|---|---|
| 文件名 | 原始文件名。 |
| 文件类型 | FileTypeVerdict 识别结果。 |
| 大小 | 原始文件大小。 |
| MIME | detectedMime 与 browserMime。 |
| 发送方式 | 原始文件附件。 |
| 模型兼容性 | 当前模型是否支持此文件输入。 |
| 安全说明 | Starverse 不转换、不执行、不解析主动内容。 |
| warnings | 宏、隐藏内容、公式、外链、元数据、脚本等。 |

---

## 13. Send Plan 与模型兼容性判断

### 13.1 基本规则

模型兼容性只根据 selectedOption 的 targetKind 和 Send Plan 判断。原始文件扩展名只参与候选生成，不参与最终兼容性判断。

| targetKind | sendPlan strategy | 发送资产 | 模型要求 |
|---|---|---|---|
| `original_file` | file_attachment | raw_file | file input，且支持对应 MIME 或通用文件 |
| `plain_text` | text_in_prompt | derived_asset | text |
| `markdown` | text_in_prompt | derived_asset | text |
| `code` | text_in_prompt | derived_asset | text |
| `table_markdown` | text_in_prompt | derived_asset | text |
| `pdf_attachment` | file_attachment | derived_asset PDF | file 或 PDF input |

### 13.2 示例

| 原始文件 | 用户选择 | 模型要求 |
|---|---|---|
| `.docx` | markdown | text |
| `.docx` | original_file | file input，支持 DOCX 或通用文件 |
| `.docx` | PDF attachment | file/PDF input |
| `.xlsx` | table markdown | text |
| `.xlsx` | original_file | file input，支持 XLSX 或通用文件 |
| `.html` | code | text |
| `.html` | markdown | text |
| `.html` | original_file | file input，支持 HTML 或通用文件 |
| `.html` | PDF attachment | file/PDF input |
| `.csv` | table markdown | text |
| `.csv` | original_file | file input 或平台支持对应 MIME |
| `.pdf` | original_file | file/PDF input |
| `.ps` | code | text |
| `.ps` | PDF attachment | file/PDF input |
| `.ps` | original_file | file input，且通过安全 gate |

### 13.3 Preflight Gate

发送前检查：

| 检查项 | 行为 |
|---|---|
| selectedOption 是否存在 | 不存在则阻止发送。 |
| selectedOption 是否 ready | 未 ready 则等待转换或提示失败。 |
| SendAssetRef 是否有效 | raw_file 或 derived_asset 缺失则阻止发送。 |
| DerivedAsset 是否 stale | stale 则重新生成。 |
| 预览与发送 contentHash 是否一致 | 不一致则阻止发送并重新生成。 |
| 模型能力是否满足 | 不满足则阻止发送并提示改选。 |
| MIME 是否支持 | original_file 路径必须检查。 |
| token 是否超过软阈值 | 提示并要求确认。 |
| token 是否超过硬限制 | 阻止发送。 |
| 附件是否可上传 | 不可上传则阻止发送。 |
| 外部依赖是否可用 | 不可用则标记路径不可用。 |
| 安全策略是否满足 | 不满足则阻止执行转换或发送。 |

### 13.4 original_file gate

| Gate | 行为 |
|---|---|
| file input 能力 | 模型不支持 file input 时阻止。 |
| MIME 能力 | 模型支持列表中没有该 MIME 且无通用文件能力时阻止。 |
| 平台大小限制 | 超出 maxFileBytes 时阻止。 |
| RawFile 状态 | 文件丢失、被清理或 contentToken 失效时阻止。 |
| executable | 阻止。 |
| polyglot_suspected | 阻止。 |
| 宏能力 | 不执行宏；必要时要求确认。 |
| 隐藏内容 | warning。 |
| 元数据 | warning。 |
| 日志隐私 | 不记录路径、contentToken、正文、完整 hash。 |

---

## 14. 安全规则

### 14.1 通用规则

| 风险 | 规则 |
|---|---|
| 文件内容指令 | 作为不可信用户内容包裹。 |
| 文件名注入 | 文件名、type、language 必须 escaping。 |
| Office 宏 | 不执行宏。 |
| Office 外部链接 | 不主动刷新。 |
| HTML JavaScript | 默认不执行；用户可显式开启 HTML PDF 渲染。 |
| 外部资源 | 默认不加载；用户可通过总开关授权。 |
| PostScript | 必须隔离进程、限定目录、启用安全文件访问控制。 |
| 远程链接 | 默认作为文本保留，不主动请求。 |
| 日志 | 禁止记录本地绝对路径、文件正文、敏感片段、contentToken、完整 hash。 |
| 临时资产 | 过期清理，不进入历史消息。 |
| 未选择候选 | 不发送。 |
| original_file | 可作为附件发送，但不触发本地执行。 |

### 14.2 Conversion Sandbox Runner

LibreOffice、Chromium、Ghostscript、Pandoc 等外部进程应统一由 Conversion Sandbox Runner 调用。

Sandbox runner 要求：

| 项目 | 要求 |
|---|---|
| 调用方式 | 参数数组调用，不拼接 shell 字符串。 |
| shell | 默认 false。 |
| `.bat` / `.cmd` | 普通外部引擎入口禁止。 |
| 工作目录 | 每次转换独立临时目录。 |
| 读权限 | 只允许读取输入文件和必要依赖。 |
| 写权限 | 只允许写入指定输出目录。 |
| 网络 | 默认禁用。 |
| 超时 | 必须设置。 |
| 内存 | 尽可能限制。 |
| 进程树 | 超时后清理子进程。 |
| stdout/stderr | 必须限制大小并脱敏。 |
| 日志 | 禁止绝对路径、正文、真实临时路径。 |
| 清理 | 转换完成或失败后清理临时文件。 |

### 14.3 LibreOffice 策略

| 项目 | 规则 |
|---|---|
| 用途 | Office → PDF。 |
| 宏 | 不执行。 |
| 网络 | 禁用。 |
| 外部链接 | 不主动刷新。 |
| 输入 | sandbox copy。 |
| 输出 | sandbox output dir。 |
| profile | 独立临时 profile。 |
| 超时 | 必须设置。 |
| 失败 | 只影响 PDF attachment 路径。 |
| warning | 字体替换、分页变化、外链未刷新、宏未执行等。 |

### 14.4 HTML → PDF 安全策略

| 选项 | 默认 | 说明 |
|---|---|---|
| JavaScript | disabled | 用户可开启。 |
| 外链资源 | disabled | 用户可用总开关授权。 |
| 本地文件访问 | disabled | 不允许读取任意本地文件。 |
| 超时 | enabled | 防止动态页面无限等待。 |
| 弹窗 / 下载 | disabled | 禁止副作用。 |
| Cookie / Storage | isolated | 使用隔离 profile。 |
| CSS media | print | 可切换 screen。 |

第一版不实现逐域名授权、逐资源授权、资源列表审计 UI。

### 14.5 Ghostscript 策略

| 项目 | 要求 |
|---|---|
| 启用时机 | 后期。 |
| 安全模式 | 必须启用。 |
| 输入输出目录 | 显式白名单。 |
| 任意文件访问 | 禁止。 |
| 网络 | 禁止。 |
| 超时 | 必须设置。 |
| 版本检测 | 必须记录并展示。 |
| 依赖缺失 | 路径显示不可用。 |

### 14.6 Pandoc 策略

| 项目 | 规则 |
|---|---|
| 默认位置 | Advanced。 |
| 用途 | DOCX / Markdown / HTML / RTF 等通用转换。 |
| 网络 | 禁用。 |
| 输入 | sandbox copy。 |
| 输出 | sandbox output。 |
| 参数 | 由 adapter 白名单生成，不允许用户任意输入命令行。 |
| 失败 | 只影响 Pandoc 选项。 |
| 标签 | 通用转换、可能有损、高级路径。 |

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
| DOCX 语义提取失败 | Word 文档文本提取失败。 | 尝试 PDF attachment、Pandoc 或 original_file。 |
| 表格过大 | 完整表格可能超过上下文。 | 选择 sheet、范围、确认发送、改用 original_file 或 PDF。 |
| 合并单元格损失 | Markdown 可能无法表达合并单元格。 | 预览 PDF 对照或选择 original_file。 |
| HTML 动态内容缺失 | 当前未执行 JavaScript。 | 开启 JS 渲染后重新生成。 |
| 外链未加载 | 转换未主动加载远程资源。 | 授权外链总开关后重试。 |
| PS 渲染失败 | PostScript 转 PDF 失败。 | 按源码或原始文件发送。 |
| 依赖缺失 | 未检测到 LibreOffice / Chromium / Ghostscript / Pandoc。 | 安装依赖或选择其他路径。 |
| 原始文件不兼容 | 当前模型不支持此原始格式附件。 | 改选转换目标或切换模型。 |
| 临时预览过期 | 预览文件已清理。 | 重新生成预览。 |

### 15.3 错误码建议

```text
conversion_engine_missing
conversion_engine_unhealthy
conversion_engine_timeout
conversion_engine_failed
conversion_sandbox_denied
conversion_output_missing
conversion_output_too_large
conversion_network_blocked
conversion_js_disabled
conversion_external_resources_disabled
file_access_expired
file_blocked_by_policy
file_type_incompatible_with_model
file_size_exceeds_model_limit
text_exceeds_context_limit
text_exceeds_soft_threshold
```

---

## 16. 缓存与失效规则

### 16.1 Detection cache 与 conversion cache 分离

文件识别缓存只缓存 FileTypeVerdict 相关结果。转换缓存只缓存 DerivedAsset。Send Plan 与用户选择不进入 detection cache。

`original_file` 不生成转换缓存。

### 16.2 DerivedAsset Cache Key

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
+ promptEnvelopeVersion
```

### 16.3 失效条件

| 变化 | 处理 |
|---|---|
| 原始文件变化 | 全部派生资产失效。 |
| 编码变化 | 文本相关资产失效。 |
| sheet 范围变化 | 表格相关资产失效。 |
| 隐藏内容策略变化 | 表格相关资产失效。 |
| 公式策略变化 | 表格相关资产失效。 |
| HTML JS 策略变化 | HTML PDF 资产失效。 |
| 外链策略变化 | HTML PDF 资产失效。 |
| CSS media 策略变化 | HTML PDF 资产失效。 |
| 转换器版本变化 | 对应 adapter 资产失效。 |
| prompt envelope 规则变化 | 文本发送资产失效。 |
| 模型切换 | 不使检测缓存或转换缓存失效，只重算 Send Plan。 |

---

## 17. Draft 与 Message 绑定规则

### 17.1 上传阶段

RawFile 保存；FileProfile 和 ConversionOption 生成；`original_file` identity option 生成；低成本 DerivedAsset 可立即生成；高成本 PDF 或外部进程转换懒加载。

### 17.2 草稿阶段

DraftAttachment 记录 rawFileId、selectedOptionId、当前 selectedAssetRefs、compatibilityStatus。预览资产可以 draft_bound，但必须标明是否 preview_only 或 preview_and_send。

### 17.3 发送阶段

发送成功后，MessageAttachment 只绑定实际发送的 usedOptionId 和 usedAssetRefs。未选择路径和未发送的预览资产不进入历史消息。

### 17.4 清理阶段

| 资产类型 | 清理规则 |
|---|---|
| RawFile draft_bound | 草稿附件存在时保留。 |
| RawFile message_bound | 随历史消息保留。 |
| temporary preview | 过期清理。 |
| draft_bound 未发送资产 | 草稿删除或选择变化后按过期策略清理。 |
| message_bound 资产 | 随消息历史保留。 |
| failed 转换残留 | 立即清理临时目录，仅保留脱敏诊断。 |

用户移除附件时：

1. 从 DraftAttachment 移除。
2. 当前运行 job 可取消。
3. job 即使完成，也不得写回已移除附件 UI。
4. RawFile 若未被其他草稿或历史消息引用，可进入回收策略。
5. 已生成但未使用的 DerivedAsset 进入 TTL 清理。

---

## 18. 分阶段落地计划

### Phase 1：基础文本、代码、CSV/TSV 与 original_file

目标：修复原始扩展名误判，建立 selected conversion option、原始文件直发和预览发送同源。

能力：

1. RawFile、EncodingProfile、ConversionOption、DerivedAsset、SendAssetRef 基础模型。
2. `original_file` identity option。
3. chardet + iconv-lite + TextDecoder fatal。
4. 手动选择编码。
5. plain text、markdown passthrough、code。
6. CSV/TSV → table markdown。
7. selectedOptionId 绑定 draft。
8. Send Plan 按 targetKind 判断兼容性。
9. 预览与发送同源。
10. 超大文本软阈值确认。
11. 基础错误码和 warning。
12. Attachment Shelf 首屏 chip 初版。

### Phase 2：XLSX / XLS 表格

能力：

1. SheetJS 读取 workbook。
2. 多 sheet 导航。
3. 完整 table markdown。
4. original_file 保留。
5. 公式、隐藏行列、隐藏 sheet、合并单元格 warning。
6. 显示值 / 原始值 / 公式策略。
7. 大表预览分页。
8. 发送 gate。

### Phase 3：DOCX / DOC / RTF 语义路径

能力：

1. DOCX / DOC / RTF 统一 Office 候选体系。
2. DOCX → Mammoth → HTML → Turndown → Markdown。
3. Pandoc 作为高级路径或 fallback。
4. DOCX 中表格、图片占位、脚注、批注、修订痕迹 warnings。
5. original_file 保留。
6. `.doc` 不做特殊默认策略，adapter 支持情况通过可用性表达。

### Phase 4：PDF attachment

能力：

1. LibreOffice headless：Office → PDF。
2. PDF 预览与发送同源。
3. `pdf_attachment` sendPlan。
4. 与 `original_file` 语义区分。
5. 模型 file/PDF 能力 gate。
6. 外部依赖检测。
7. Conversion Sandbox Runner。

### Phase 5：HTML 完整路径

能力：

1. HTML → Markdown。
2. HTML → Code。
3. original_file 保留。
4. HTML → PDF via Chromium / Puppeteer。
5. JavaScript 渲染选项，默认关闭，可开启。
6. 外链资源选项，默认关闭，可总开关授权。
7. print / screen CSS media 切换。

### Phase 6：PS/EPS 后期路径

能力：

1. PS/EPS → original_file。
2. PS/EPS → code。
3. PS/EPS → PDF via Ghostscript。
4. Ghostscript 安全沙箱。
5. PS/EPS 默认 ask each time。

---

## 19. 验收标准

### 19.1 默认行为

| 项目 | 标准 |
|---|---|
| 纯文本 | 默认 plain text。 |
| Markdown | 默认 markdown。 |
| 代码 | 默认 code。 |
| 表格 | 默认完整 table markdown。 |
| DOCX / DOC / RTF | 默认 markdown。 |
| HTML 文档 | 默认 markdown。 |
| HTML 源码 | 默认 code。 |
| PDF | 默认 original_file。 |
| PS/EPS | 默认 ask each time。 |

### 19.2 用户控制

1. 所有合格可用路径在 Detail Inspector 可见。
2. 用户可选择目标格式。
3. 用户可选择 original_file。
4. 用户可选择具体引擎链。
5. 用户可设置本次默认、文件类型默认、全局默认。
6. 用户可手动选择编码。
7. 用户可配置超大文本软阈值。
8. HTML → PDF 的 JavaScript 渲染可由用户开启。
9. HTML → PDF 的外部资源加载可由用户通过总开关开启。

### 19.3 预览准确性

1. 文本预览与发送文本使用同一 DerivedAsset。
2. PDF 预览与发送 PDF 是同一资产或相同 contentHash。
3. original_file 预览不承诺展示模型解析结果。
4. 任何参数变化都会触发资产失效。
5. 用户看到的 warning 必须与发送时 warning 快照一致，除非重新计算后更新。

### 19.4 错误可见性

1. 转换失败可见。
2. 编码异常可见。
3. 表格损失可见。
4. 外链未加载可见。
5. JS 未执行可见。
6. 渲染失败可见。
7. 依赖缺失可见。
8. original_file 模型不兼容可见。
9. 每个失败都有 fallbackOptions。

### 19.5 兼容性判断

1. 模型兼容性由 selectedOption 和 Send Plan 决定。
2. 原始扩展名不得直接判 incompatible。
3. `.docx` 选择 markdown 时只要求 text。
4. `.docx` 选择 original_file 时要求 file input 与 MIME 支持。
5. `.docx` 选择 PDF attachment 时要求 file/PDF input。
6. `.html` 选择 code 时只要求 text。
7. `.csv` 选择 table markdown 时只要求 text。
8. `.pdf` 默认 original_file，要求 file/PDF input。

### 19.6 安全

1. 不执行宏。
2. HTML JS 默认关闭。
3. 外链默认不加载。
4. 外部转换器在沙箱中运行。
5. 文件名和元数据必须 escaping。
6. 日志不记录本地绝对路径、正文、contentToken、完整 hash。
7. 临时资产按过期策略清理。
8. executable 与 polyglot 可疑文件按策略阻断。

### 19.7 UI

1. Composer 输入框上方显示 Attachment Shelf。
2. chip 只展示文件类型和关闭按钮。
3. hover tooltip 展示文件名、当前发送方式、状态与 warning。
4. 状态颜色符合绿色、黄色、红色、灰色规则。
5. 横向溢出时启用横向滚动并预留滚动条高度。
6. 点击 chip 主体打开 Attachment Detail Inspector。
7. 点击 × 移除附件。
8. Inspector 左侧切换文件，右侧修改设置。

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
| `.txt` | 默认 plain text，可选 original_file。 |
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
| CSV original_file | raw_file SendAssetRef。 |
| XLSX 多 sheet | sheet 导航。 |
| XLSX 公式 | 默认显示值并 warning。 |
| XLSX 隐藏行列 | 默认排除并 warning。 |
| XLSX 隐藏 sheet | 默认排除并 warning。 |
| XLSX original_file | raw_file SendAssetRef，提示公式与隐藏内容。 |
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
| DOCX original_file | raw_file SendAssetRef。 |
| DOCX → PDF | 生成 PDF attachment。 |
| DOCX markdown 失败 | PDF attachment 与 original_file 候选仍可用。 |
| DOC | 进入统一 Office 候选体系。 |

### 20.5 HTML 测试

| 用例 | 预期 |
|---|---|
| 静态 HTML 文档 | 默认 markdown。 |
| HTML 源码 | 默认 code。 |
| HTML original_file | raw_file SendAssetRef。 |
| HTML → PDF JS disabled | 不执行脚本并 warning。 |
| HTML → PDF JS enabled | 沙箱渲染并生成新 PDF。 |
| 外链资源 disabled | 不加载外链并 warning。 |
| 外链资源 enabled | 用户显式授权后可加载。 |
| print CSS | 默认使用。 |
| screen CSS | 用户可切换。 |

### 20.6 PDF / file 能力测试

| 用例 | 预期 |
|---|---|
| 直接上传 PDF | 默认 original_file。 |
| 支持 PDF 的模型 | PDF original_file 可发送。 |
| 不支持 PDF 的模型 | 阻止发送并提示改选模型。 |
| DOCX original_file 模型不支持 file input | 阻止发送。 |
| DOCX pdf_attachment 模型支持 PDF | 可发送。 |
| DOCX markdown 模型只支持 text | 可发送。 |

### 20.7 历史绑定测试

| 用例 | 预期 |
|---|---|
| 用户预览未发送路径 | 不进入历史消息。 |
| 用户切换转换路径 | 旧资产不作为 message attachment。 |
| original_file 成功发送 | MessageAttachment usedAssetRefs = raw_file。 |
| markdown 成功发送 | MessageAttachment usedAssetRefs = derived_asset。 |
| PDF attachment 成功发送 | MessageAttachment usedAssetRefs = derived_asset。 |
| 临时资产过期 | 可重新生成。 |

### 20.8 UI 测试

| 用例 | 预期 |
|---|---|
| 上传单个附件 | Attachment Shelf 显示一个 chip。 |
| 上传多个附件 | chip 横向排列。 |
| 横向溢出 | 出现横向滚动条，并预留高度。 |
| chip hover | 展示完整文件名、当前发送方式、状态与 warning。 |
| chip 主体点击 | 打开 Inspector 并选中该文件。 |
| chip × 点击 | 移除附件。 |
| 绿色状态 | 可发送。 |
| 黄色状态 | 可发送但有 warning 或确认项。 |
| 红色状态 | 阻断。 |
| 灰色状态 | 检测中或转换中。 |

### 20.9 删除的测试

本版本不再包含以下测试：

```text
Hybrid 支持模型测试
Hybrid 不支持模型测试
markdown + PDF 组合发送测试
text + file mixed strategy 测试
```

---

## 21. 路径抉择记录

| 问题 | 决策 |
|---|---|
| 是否自研核心转换器 | 不自研复杂格式转换器，采用第三方引擎。 |
| 是否暴露多引擎 | 暴露所有合格可用路径，但分层展示。 |
| 是否保留原始文件发送 | 保留，作为 `original_file` 一等目标格式。 |
| PDF 转换后如何处理 | 作为附件发送给 OpenRouter，由路由和目标模型解析。 |
| 直接上传 PDF 如何处理 | 默认 `original_file`。 |
| HTML → PDF 是否执行 JavaScript | 默认关闭，用户可开启。 |
| 外链资源是否加载 | 默认关闭，用户可通过总开关授权。 |
| 是否允许强制发送超大文本 | 允许超过软阈值后确认发送，但不得超过硬限制。 |
| 超大表格是否默认摘要 | 不默认摘要，摘要只作为额外候选。 |
| DOCX / DOC / RTF 默认路径 | Markdown 语义提取。 |
| `.doc` 是否特殊处理 | 暂时不特殊处理，统一进入 Office 候选体系。 |
| DOCX 高保真路径 | LibreOffice → PDF attachment。 |
| XLSX 默认输出 | Table markdown，默认显示值，提示公式和隐藏内容。 |
| Hybrid 是否第一期实现 | 移除，不进入第一版。 |
| 首屏附件 UI | Attachment Shelf，chip 只展示类型和关闭按钮。 |
| 详情 UI | Attachment Detail Inspector，左侧文件切换，右侧详情与设置。 |

---

## 22. 最终落地原则

1. 系统只做低风险、可解释、可配置的默认选择。
2. 用户通过详情面板比较实际输出，再决定本次发送目标格式。
3. 原始文件直发作为一等路径保留，但必须通过模型能力、安全和大小 gate。
4. 可用路径尽量暴露，但必须通过安全、预览、发送、复现、诊断和测试门槛。
5. 转换引擎可以多样，主流程抽象必须统一。
6. 预览资产和发送资产必须同源。
7. 模型兼容性由 Send Plan 决定，不由原始扩展名决定。
8. PDF attachment 的解析责任交给 OpenRouter 和目标模型。
9. 编码错误必须可见，用户必须能手动选择编码。
10. 超大内容由软阈值提醒和硬阈值阻断共同治理。
11. 未被发送的临时资产不得进入历史消息。
12. 首屏只展示文件类型、关闭按钮与状态颜色，复杂配置下沉到二级详情。
