# 重启应用能力（Restart App）

## 基本信息
- 状态：Backlog
- 优先级：P2（可调整）
- 创建日期：2026-02-05
- 关联对话：https://chatgpt.com/g/g-p-6973631e36a48191b50d865cd2cc9bfc/c/69846e4c-1858-83aa-bddb-a77b1c8c6e33

## 背景
- 需要在组件或服务异常、崩溃时支持静默重启
- 需要一个可见的用户按钮触发重启
- 当前决定：先记录为待办，主线仍是完善核心功能

## 目标
- 统一的 RestartCoordinator 能力，收口到主进程
- 两类入口复用底层实现：健康守护触发、用户按钮触发
- 可配置重启等级与原因上报（reason/requestId）

## 非目标
- 本阶段不做完整自愈系统
- 本阶段不引入复杂的远程诊断平台，仅本地日志或 DB 记录即可

## 决策记录（当前）
- 当前仅记录为 Backlog，不进入排期
- 底层能力收口主进程，renderer 只能发起请求
- 自动重启默认轻后重，dev 默认禁用 full relaunch
- 必须有熔断与重启日志（restart_journal）

## 设计要点（后续实现参考）
- 重启等级：renderer reload、recreate window、full relaunch
- dev 与 prod 策略差异：dev 默认避免 full relaunch，优先重建窗口
- 熔断与退避：限制短时间内 relaunch 次数，避免重启风暴
- 数据保护：重启前草稿与关键状态落盘，记录 restart_journal（时间、等级、原因、版本、关键错误）

## 触发条件（候选）
- renderer 心跳超时
- window unresponsive
- render-process-gone
- 关键服务健康检查连续失败（DB worker、streaming 管线等）

## 风险与注意事项
- silent restart 可能导致用户输入丢失，必须先做草稿落盘与 flush
- dev 环境重启可能引发白屏与启动参数缺失，需显式传递 devServerUrl 或走窗口重建

## 验收标准（实现时用）
- 用户按钮可重启，重启后回到可用状态
- 自动重启有熔断与日志，且不会无限循环
- 重启原因可追溯（本地日志或 DB 记录）
- dev/prod 行为符合预期策略
- 重启前草稿落盘可复现验证
- 10 分钟内 full relaunch 不超过 N 次（熔断阈值）

## 工作拆分（实施时用 checklist）
- [ ] 定义 IPC：app:restart（level/reason/silent/requestId）
- [ ] 实现 RestartCoordinator（主进程）
- [ ] 接入窗口事件监听（unresponsive/render-process-gone）
- [ ] renderer 心跳与超时策略
- [ ] 草稿与状态落盘 + restart_journal
- [ ] UI 增加 Restart 按钮与提示文案（可选确认）
- [ ] 测试：手动触发、模拟崩溃、熔断验证、dev/prod 验证
