# Agent 同步说明：Starverse 文件类型检测工程实现

Status: active handoff
Audience: Agent
Current phase: Step 1 准备阶段

## 1. 你的角色

你是本项目的受控实现工程师。你的职责是读取现有 Starverse 代码、按任务包局部实现、补充测试、执行验收命令、汇报风险和未完成项。

你不能自行改变项目架构边界，不能直接扩大范围，不能在未说明的情况下新增大型依赖，不能重写现有文件管线。

## 2. 当前项目状态

Step 0 已由 Owner 确认冻结。已经冻结的内容包括：

```text
项目目标
非目标
MVP 范围
第一阶段默认策略
工程纪律
Starverse 接入边界
验收口径
角色职责
```

下一步进入 Step 1：仓库勘察，建立 Starverse 绑定地图。

## 3. 本阶段核心限制

本阶段只读勘察，不实现文件类型检测。

你可以读取代码、搜索引用、整理现有模块职责、输出报告。

你不能做以下事情：

```text
不能新增 src/next/file-type 大型模块
不能修改 sendPlanService
不能修改 UI 组件
不能新增数据库 migration
不能新增外部依赖
不能实现 magicDetector / textProbe / containerProbe
不能接入 Magika
不能修改现有文件上传流程
不能提交推测性重构
```

如确需做少量文档记录，只能在 Owner 或监督人指定的工程实施目录内写入，不得顺手改动无关文档。

## 4. 必须优先理解的架构边界

```text
detector 只产生 FileTypeEvidence
evidenceMerge 只产生 primary、conflicts、flags
fileTypeStaticPolicy 只产生文件内容和静态规则相关策略
sendRouteMapping 基于 verdict + modelCapabilities + userPrefs + engineAvailability 生成 SendPlanCandidate
UI 只展示状态、证据、冲突、静态风险、可选路线和推荐路线
sendPlanService 只消费 verdict 与 SendPlanCandidate，不重复检测文件类型
```

## 5. Step 1 输出目标

你需要输出一份 Starverse 文件管线接入点报告，至少包含：

```text
现有 fileIngestionService 如何创建文件资产
现有 FileAccessRef 或等价结构是否存在
现有 attachment / messageAsset / draftAttachment schema
现有 sendPlanService 如何判断模型兼容性
现有 derivativeJobService 如何生成预览和转换产物
现有 conversationDraftClient 如何维护附件状态
现有 UI 附件卡片有哪些状态字段
现有 SQLite repo / migration 方式
现有测试工具、fixture 目录、测试命令
现有日志脱敏规则
```

## 6. 输出格式要求

完成勘察后，请按以下结构汇报：

```text
1. 读取过的文件清单
2. 现有文件管线流程图或文字链路
3. 现有模块职责表
4. 可复用的类型、函数、服务、测试工具
5. 需要新增的最小模块建议
6. 不应重写或大改的模块
7. 与 Step 0 冻结边界的冲突点
8. 后续 Step 2 实施附录需要补充的信息
9. 本阶段未读取或不确定的信息
10. 本阶段没有进行的改动确认
```

第 10 项必须明确写出：

```text
本阶段未实现文件类型检测
本阶段未新增大型模块
本阶段未修改 sendPlanService
本阶段未修改 UI
本阶段未新增数据库 migration
本阶段未新增外部依赖
```

## 7. 完成标准

Step 1 完成标准是报告质量达标，而非代码通过。若未改代码，可以不运行完整测试，但必须说明没有运行测试的原因。

若你进行了任何文件修改，必须汇报 diff 摘要，并运行相应最小验证命令。
