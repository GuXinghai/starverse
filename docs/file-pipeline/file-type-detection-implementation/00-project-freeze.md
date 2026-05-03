# Step 0 项目启动：冻结目标与边界

Status: frozen
Owner confirmation: confirmed
Scope: Starverse 文件类型检测体系工程落地

## 1. 项目定位

本项目目标是为 Starverse 建立稳定、低延迟、可解释、可缓存、可测试、可被用户覆盖的文件类型判断基础。

本体系服务于以下场景：

```text
文件上传
附件预览
格式转换
发送计划
模型兼容性判断
诊断面板
日志与测试体系
```

底层架构采用三层引擎体系：

```text
Core Detector
Managed Engine Plugins
External Engine Overrides
```

核心识别链采用：

```text
Header Magic
Magika
Container Probe
Parser Validation on demand
```

工程流水线采用：

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

## 2. 核心目标

文件类型检测系统必须回答：

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

冻结约束：

```text
文件类型检测的产物必须是可解释 verdict，不能退化为单一 MIME 字符串
文件类型检测必须服务 SendPlan，但不得被 SendPlan 反向污染
文件类型检测必须允许用户覆盖处理路线，但不得允许用户覆盖原始 evidence
文件类型检测必须支持缓存，但缓存只缓存 detection verdict，不缓存当前模型下的 SendPlan
文件类型检测必须支持安全预览与原生预览分级
```

## 3. 非目标

第一阶段不承担：

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

工程边界：

```text
识别系统只产生证据、主判断、冲突、风险标记、静态策略和推荐处理路线
真正的文本抽取、缩略图生成、格式转换、模型发送和恶意内容检测由下游模块完成
blocked 只表示当前策略禁止执行某条路线，不能写成恶意鉴定结论
```

## 4. MVP 范围

MVP 必须包含：

```text
FileAccessRef / FileReadAdapter
FileTypeDetectionState
FileTypeVerdict 数据模型
Taxonomy 与 taxonomyMap
magicDetector
textProbe
Magika detector 或 Magika adapter
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

第一轮暂缓：

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

## 5. 第一阶段默认策略

### 5.1 Magika

```text
MVP 保留 Magika detector 接口
第一轮允许先实现 mockable adapter
核心闭环不能依赖 Magika 必然可用
Magika label 必须通过 taxonomyMap 映射后进入内部 FileFormatId
Magika 模型版本必须进入 provenance
```

### 5.2 容器探针

```text
MVP 必须支持 OOXML / ODF / EPUB
MVP 必须支持 OLE CFB 最小识别
MVP 不做复杂归档递归扫描
MVP 不递归解压 archive
MVP 不信任 entry path
MVP 必须检查 zip slip、encrypted archive、zip64 超大声明、重复 entry、伪 OOXML 的基本风险
```

### 5.3 用户覆盖

```text
用户可以覆盖处理路线
用户可以覆盖预览方式
用户可以选择转换目标
用户可以选择是否保留原文件
用户可以在低置信度文件上选择假定类型
用户覆盖不修改 detector evidence
用户覆盖不修改 primary verdict
用户覆盖不写入 detection cache
blocked 安全标记默认不可普通覆盖
```

### 5.4 默认路线偏好

```text
文本类优先 direct_text
图片类优先 direct_image
PDF 根据模型能力选择 direct_file 或 converted_markdown
Office 文档默认 converted_markdown
表格默认完整 Markdown table 或 CSV
PPT 默认 converted_markdown，可选 rendered_images
HTML / SVG 默认不执行脚本，优先 converted_markdown 或 safe_text_preview
archive 默认 ask_user
executable 默认 blocked
unknown_binary 默认 ask_user 或 blocked，依赖风险等级
```

## 6. 工程纪律

Agent 必须遵守：

```text
不得直接重写 Starverse 现有文件管线
不得绕过现有 sendPlanService
不得让 UI 根据扩展名自行判断文件类型
不得让 sendPlanService 重新读取文件并重复检测
不得让转换模块绕过 FileTypeVerdict 直接选择路线
不得让用户覆盖直接改写 primary verdict
不得把 cache hit 当成 evidence source
不得让模型能力、用户偏好、外部引擎可用性污染 detection cache
不得让 renderer 持有真实绝对路径、contentToken 原文或外部命令参数
不得在检测阶段递归解压 archive / container
不得把 blocked 文案写成恶意判定
```

外部进程边界：

```text
外部引擎必须使用参数数组调用
默认 shell: false
Windows .bat / .cmd 默认禁止作为普通外部引擎入口
外部进程必须 timeout
外部进程必须限制 stdout / stderr
外部进程必须使用 sandbox copy 或受控输入流
外部进程路径不得进入普通日志
```

## 7. Starverse 接入边界

后续实现必须沿用以下关系：

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

冻结结论：

```text
fileTypeService 是检测调度中心
sendRouteMapping 是路线生成中心
sendPlanService 是最终发送前校验消费者
UI 是展示层和用户选择入口
derivativeJobService 只在预览、转换、parser validation 场景介入
messageAttachmentService 保存最终快照和用户选择
```

## 8. 验收口径

阶段性完成不能以 Agent 自述为准。必须至少满足：

```text
typecheck 通过
相关 vitest 通过
fixture expected.json 通过
日志脱敏扫描通过
缓存失效测试通过
异步 job stale/cancel 测试通过
UI 最小行为回归通过
```

每一阶段完成后，Agent 必须汇报：

```text
实际修改文件
新增文件
删除文件
是否新增依赖
是否修改数据库 schema
是否修改 UI
是否修改 sendPlanService
是否修改日志行为
执行过的命令
测试结果
失败测试
未完成项
风险点
下一步建议
```

## 9. 角色职责

```text
Owner / 最终决策人
  确认项目目标
  确认 MVP 范围
  确认用户覆盖策略
  确认默认路线偏好
  确认风险接受程度
  决定是否进入下一阶段

架构审查人 / 实施监督人 / 任务编排者
  把大文档转成任务包
  审查 Agent 计划
  检查阶段边界
  检查 diff 摘要
  设计验收标准
  判断是否偏离架构
  指出返工点

Agent / 受控实现工程师
  读取现有代码
  按任务包局部实现
  补测试
  跑验收命令
  汇报改动文件
  汇报测试结果
  汇报遗留风险
  按反馈修复

测试体系 / 客观裁判
  typecheck
  unit tests
  fixture regression
  lint
  日志脱敏扫描
  UI 行为回归
```

## 10. 当前状态

```text
Status: Step 0 completed and frozen
Owner action: confirmed
Next phase: Step 1 仓库勘察：建立 Starverse 绑定地图
Step 1 restriction: 只读勘察，不实现文件类型检测，不新增大型模块，不重写现有逻辑
```
