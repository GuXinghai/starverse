# 监督人与 Owner 审查清单

Status: active
Purpose: 审查 Agent 在 Step 1 及后续阶段是否偏离冻结边界

## 1. Step 1 勘察报告审查

```text
是否只读勘察
是否没有实现文件类型检测
是否没有新增大型模块
是否没有修改 sendPlanService
是否没有修改 UI
是否没有新增数据库 migration
是否没有新增外部依赖
是否列出实际读取文件
是否回答所有必答问题
是否明确不存在路径与实际路径
是否明确可复用模块
是否明确高风险模块
是否明确后续实施附录所需信息
```

## 2. 架构边界审查

```text
detector 是否只产生 evidence
evidenceMerge 是否负责 primary / conflicts / flags
staticPolicy 是否只处理文件内容和静态规则
sendRouteMapping 是否负责 SendPlanCandidate
sendPlanService 是否避免重复检测文件类型
UI 是否避免按扩展名自行判断格式
用户 override 是否没有污染 verdict 和 cache
模型能力是否只影响 SendPlanCandidate
```

## 3. 工程纪律审查

```text
是否避免重写现有文件管线
是否避免并行体系
是否避免大范围重构
是否避免新增未经确认依赖
是否避免把 Magika 做成 MVP 硬依赖
是否避免检测阶段递归解压 archive
是否避免 renderer 持有真实绝对路径
是否避免日志记录 contentToken 和完整路径
```

## 4. 进入下一阶段条件

```text
Step 1 报告足够支撑任务拆分
Owner 确认关键风险
监督人确认没有越界改动
下一阶段允许修改文件清单明确
下一阶段禁止修改文件清单明确
下一阶段验收命令明确
```

## 5. 阻断条件

出现以下情况时，不进入下一阶段：

```text
Agent 已经开始实现文件类型检测
Agent 新建并行文件管线
Agent 修改 sendPlanService 但没有解释
Agent 修改 UI 但没有授权
Agent 新增数据库 migration
Agent 新增外部依赖
Agent 输出报告没有实际路径
Agent 未说明不确定项
Agent 将 blocked 写成恶意判定
```
