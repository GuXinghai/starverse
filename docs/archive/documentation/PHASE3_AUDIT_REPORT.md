# Phase 3 代码审计完成报告

## ✅ 已修复的关键风险点

### 1. 驻留合并器生命周期管理
- **问题**: 合并器实例可能泄漏，缺少清理机制
- **解决**: 
  - 添加 `clearReasoningMerger()` 和 `clearAllReasoningMergers()` 函数
  - 在 StreamDone/StreamAbort/StreamError 事件中调用清理
  - 合并器实例存储在 Map 中，便于管理
  - 使用 `markRaw()` 确保不被序列化

### 2. FallbackReplay 监控机制  
- **问题**: 无法观测是否频繁触发全量重放，吃掉 Phase 3 收益
- **解决**:
  - 添加 `recordFallbackReplay()` 函数，本地+全局双重计数
  - 每秒输出 fallbackReplayPerSec 速率到控制台
  - 集成到 perfMetrics，可观测长期趋势
  - selectMessage 优化逻辑：优先 pieces → fallback

### 3. ReasoningPiece 稳定标识
- **问题**: v-for 使用 index 作为 key，合并时会错绑 DOM
- **解决**:
  - ReasoningPiece 结构：`{ id: number, text: string }`
  - 全局 `nextPieceId` 单调递增，保证唯一性
  - v-for 使用 `piece.id` 作为稳定 key
  - buildPieceMemoKey 结合 pieceId + version

### 4. 异步合并避免长任务
- **问题**: 同步合并可能造成长任务尖峰
- **解决**:
  - `scheduleAsyncCompaction()` 使用 requestIdleCallback
  - 降级到 setTimeout(0) 确保兼容性
  - `recordMergeOp(duration)` 记录合并耗时
  - 新增 mergeOpsCount 和 mergeDurationAvgMs 指标

## 🔧 新增性能监控指标

```typescript
type PerfWindowSnapshot = {
  // 原有指标...
  
  // Phase 3 新增
  fallbackReplayCount: number
  fallbackReplayPerSec: number
  mergeOpsCount: number  
  mergeOpsPerSec: number
  mergeDurationTotalMs: number
  mergeDurationAvgMs?: number
}
```

## 🎯 验收标准

### 期望指标 (稳定流式段)
- `[ref-audit]` stable=1, changed=0 持续成立
- `bubbleUpdateCount` 保持 Phase 2 水平 (0-3/sec)  
- `fallbackReplayPerSec` ≈ 0 (避免全量重放)
- `pieceCount` 增长受控，不无限制
- `mergeOpsPerSec` 低频且无长任务尖峰

### 功能验证
- ✅ reasoningPieces 正确传递到 UI 组件
- ✅ 驻留合并器在流结束时清理
- ✅ pieces v-memo 使用稳定 key
- ✅ 异步合并不阻塞 UI

## 🚀 启用方法

```javascript
// 浏览器控制台运行
localStorage.setItem('sv_diag', '1')                   // 诊断总开关
localStorage.setItem('sv_diag_perf', '1')              // 性能指标
localStorage.setItem('sv_diag_ref_audit', '1')         // 引用审计
localStorage.setItem('sv_diag_phase3_audit', '1')      // Phase 3 审计

// 刷新页面应用
window.location.reload()
```

## 🔍 验收工具

运行 `phase3-audit.js` 脚本进行自动验证：
- 功能开关状态检查
- 性能监控系统验证  
- 清理机制完整性检查
- 实时指标快照

## 📊 下一步

Phase 3 已完成边界条件加固，可以进入长推理流实战测试。