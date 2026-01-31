# Scheduler Diagnostics (rAF Timeout Locator)

诊断 rAF flush 中的性能退化来源，支持 backlog 堆积 vs 单任务退化归因。

## 启用方式

```javascript
localStorage.setItem('sv_diag_sched', '1')
location.reload() // 刷新生效
```

## 解读输出

### 1Hz 聚合快照 `[sched-diag]`

| 字段 | 含义 |
|------|------|
| `worstMs` | 本秒最慢帧耗时 (ms) |
| `overBudget` | 超预算帧数 |
| `qMax` | 队列最大长度 |
| `phase.*` | 各阶段累计耗时 (deq=取队列, mrg=合并, app=reducer, der=派生, cmt=提交) |
| `reducer.max` | reasoning apply 最大单次耗时 |
| `selectors.max` | selectors derive 最大单次耗时 |
| `merger.max` | merger 操作最大单次耗时 |
| `hint` | **自动诊断提示**（核心看这个） |

### 诊断提示 (diagnosisHint)

- **backlog explosion**: 任务产生速度 > 消费速度，需限流/合并/降频
- **single-task regression**: 单次操作退化，具体模块在后缀
- **derive heavy**: selectors 派生退化或 fallback 重放
- **merger heavy**: suffix-delta/合并退化

### 超阈值告警 `[sched-diag][warn]`

单帧 >50ms 时触发，显示该帧的阶段耗时分布。

## 手动控制

```javascript
window.__sv_sched_diag__.start()   // 启动
window.__sv_sched_diag__.stop()    // 停止
window.__sv_sched_diag__.snapshot() // 获取当前快照
```

## 关闭后零副作用

未设置 `sv_diag_sched=1` 时：
- 无 ticker 启动
- 无 console 输出
- 无 window hook 注入
- 所有记录函数直接返回 (early return)
