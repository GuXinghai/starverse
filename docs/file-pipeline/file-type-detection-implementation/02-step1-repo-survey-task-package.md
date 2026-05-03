# Step 1 仓库勘察任务包：建立 Starverse 绑定地图

Status: ready for Agent
Phase type: read-only survey
Allowed action: read, search, map, report
Disallowed action: implementation

## 1. 任务目标

本轮目标是建立 Starverse 现有文件管线与文件类型检测体系之间的绑定地图，为后续 Agent 实施附录提供真实仓库依据。

本轮不是实现阶段。

## 2. 允许做的事情

```text
读取现有代码
搜索现有文件管线相关引用
整理模块职责
整理现有数据结构
整理现有测试入口
整理现有日志脱敏规则
输出勘察报告
必要时在指定工程实现目录写入勘察报告草稿
```

## 3. 禁止做的事情

```text
禁止实现文件类型检测
禁止新增大型 file-type 子系统
禁止修改 sendPlanService 行为
禁止修改 UI 附件卡片行为
禁止新增数据库 migration
禁止接入 Magika
禁止新增外部引擎
禁止修改 Electron IPC 行为
禁止新增第三方依赖
禁止顺手重构无关代码
```

## 4. 必查模块

优先检查以下路径或同名等价文件。若路径不存在，记录不存在并搜索实际位置。

```text
src/next/files/fileIngestionService.ts
src/next/files/conversationDraftClient.ts
src/next/files/fileAssetClient.ts
src/next/files/messageAttachmentClient.ts
src/next/files/sendPlanClient.ts
src/next/openrouter/openRouterSendPreparation.ts
src/ui-app/app/appChatApp.logic.ts
src/ui-app/AppChatApp.vue
src/ui-app/components/ChatAppComposer.vue
src/ui-app/AppChatApp.attachments.test.ts
src/next/files/*test.ts
src/next/openrouter/*test.ts
infra/db/repo/*
infra/db/migrations/*
electron/ipc/*
docs/file-pipeline/*
```

## 5. 必答问题

### 5.1 文件资产创建

```text
文件上传后由哪个服务创建 asset
assetId 如何生成
文件大小、文件名、MIME、扩展名、路径或 token 如何保存
真实路径是否已被隔离
是否已有 FileAccessRef 或等价结构
```

### 5.2 附件状态

```text
draft attachment 与 message attachment 如何区分
附件状态字段有哪些
是否已有 parse / preview / derivative 状态
是否已有模型兼容性状态
附件删除是否只删除关系还是删除底层 asset
```

### 5.3 发送计划

```text
sendPlanService 或等价模块现在如何判断 text / image / file 兼容性
是否按扩展名判断
是否按 MIME 判断
是否已有 direct / converted / skipped / blocked 概念
模型切换如何触发重算
历史不兼容附件如何处理
```

### 5.4 预览与转换

```text
derivativeJobService 当前如何生成 preview_optimized
是否已有格式转换 job
转换输出如何保存
转换失败如何反馈 UI
预览路径是否暴露给 renderer
```

### 5.5 数据库与缓存

```text
现有 asset / message attachment / draft attachment 表结构
是否已有 metadata JSON 字段
是否已有 migration 约定
是否已有缓存表或可复用缓存机制
是否已有 repo 测试工具
```

### 5.6 UI 接入点

```text
DraftAttachmentCard 当前展示哪些字段
DraftAttachmentStrip 当前如何组织附件
MessageAttachmentCard 当前展示哪些字段
详情弹窗是否已有发送方式、URL 保留、转换方式等选项
是否已有红黄绿状态边框或不兼容提示
```

### 5.7 测试与日志

```text
当前 vitest 命令习惯
是否已有 fixture 目录
是否已有日志脱敏测试
是否已有路径泄露扫描
是否已有 IPC sender 校验测试
```

## 6. 输出报告模板

请按以下模板输出：

```text
# Starverse 文件管线接入点报告

## 1. 勘察范围

## 2. 已读取文件

## 3. 当前文件上传到发送的主链路

## 4. 当前附件数据模型

## 5. 当前发送计划逻辑

## 6. 当前预览与转换逻辑

## 7. 当前数据库与 migration 结构

## 8. 当前 UI 附件展示结构

## 9. 当前测试与日志机制

## 10. 可复用部分

## 11. 需要新增的最小部分

## 12. 禁止重写或高风险模块

## 13. 与 Step 0 冻结边界的冲突点

## 14. 不确定项与待确认问题

## 15. 本阶段未改动确认
```

## 7. 本阶段完成标准

```text
报告覆盖必答问题
明确实际路径与不存在路径
明确哪些模块可复用
明确哪些模块不能重写
明确现有 sendPlanService 的判断入口
明确现有 UI 附件状态入口
明确现有数据库接入方式
明确下一阶段实施附录需要补的仓库绑定信息
```

## 8. 退出条件

当报告足以支撑监督人编写 Step 2 Agent 实施附录时，本阶段结束。
