# 环带式文字滚动系统实现文档

## 概述
实现了一个"人类友好"的文字滚动系统，在固定宽度窗口内以自然节奏展示溢出的模型名称。

## 数学模型

### 环带结构
```
文字区长度: C = scrollWidth (实际文本宽度)
空白区长度: G = 0.5 * C
总环长:      L = C + G = 1.5 * C
```

### 四阶段滚动逻辑

#### 1. 初始停顿阶段
- **持续时间**: τ₀ = 500ms (300-600ms 范围)
- **速度**: v = 0
- **行为**: 完全静止，给用户阅读时间

#### 2. 匀速阅读阶段  
- **速度**: v₁ = 50 px/s (30-72 px/s 范围)
- **距离**: C (文字区长度)
- **持续时间**: t_read = C / v₁ * 1000 (ms)
- **行为**: 恒速滚动，让最后一个字离开窗口

#### 3. 空白压缩阶段（快速回位）
- **距离**: G (空白区长度)
- **持续时间**: τ_gap = 0.5 * (C / v₁) * 1000 (ms)
- **速度曲线**: 线性缓动（未来可升级为最小 jerk 曲线）
- **边界条件**: 起点和终点速度为 0，加速度为 0

#### 4. 返回初始状态
- **行为**: 瞬间跳回起点（p_gap + 0.1%）
- **效果**: 实现无缝循环

### 时间分配示例
```
总周期 T = τ₀ + t_read + τ_gap

阶段        相对时长    行为          平滑性
停顿        ~10-20%    完全静止      v=0
匀速        ~60-70%    稳定阅读      恒速
空白压缩    ~15-25%    加速回位      线性
瞬间跳回    ~0.1%      位置重置      无感知
```

## 实现细节

### 溢出检测
```javascript
// 只有当文本宽度明显大于容器宽度时才滚动
if (C > W + 5) {  // 留 5px 容差，避免误判
  // 启用滚动
}
```

### 动态关键帧生成
由于 CSS `@keyframes` 不支持变量百分比，使用 JavaScript 动态生成：

```javascript
// 计算关键帧百分比位置
const p_delay = (tau0 / T) * 100        // 停顿结束位置
const p_read = ((tau0 + t_read) / T) * 100  // 阅读结束位置
const p_gap = ((tau0 + t_read + tau_gap) / T) * 100  // 压缩结束位置

// 生成动画
animations += `
@keyframes scroll-${modelId} {
  0% { transform: translateX(0); }
  ${p_delay.toFixed(2)}% { transform: translateX(0); }
  ${p_read.toFixed(2)}% { transform: translateX(${-C}px); }
  ${p_gap.toFixed(2)}% { transform: translateX(${-(C + G)}px); }
  ${(p_gap + 0.1).toFixed(2)}% { transform: translateX(0); }
  100% { transform: translateX(0); }
}
`
```

### 样式应用
```javascript
// 每个模型使用独立的动画名称和时长
:style="{
  animationName: scrollingModels[model.id].animName,
  animationDuration: `${scrollingModels[model.id].T}ms`,
  animationTimingFunction: 'linear',
  animationIterationCount: 'infinite'
}"
```

## 可调参数

### 速度控制
```javascript
const v1 = 50  // 匀速阅读速度: 30-72 px/s
// 较低值 (30): 慢速，适合长文本
// 中等值 (50): 推荐，平衡体验
// 较高值 (72): 快速，适合短文本
```

### 停顿时间
```javascript
const tau0 = 500  // 初始停顿: 300-600 ms
// 300ms: 快节奏
// 500ms: 推荐，给足够阅读时间
// 600ms: 慢节奏
```

### 空白比例
```javascript
const G = 0.5 * C  // 空白区长度
// 0.3 * C: 紧凑，快速循环
// 0.5 * C: 推荐，自然间隔
// 0.7 * C: 宽松，明显停顿
```

### 压缩速度比例
```javascript
const tau_gap = 0.5 * (C / v1) * 1000
// 0.4: 快速回位
// 0.5: 推荐
// 0.7: 慢速回位
```

## 未来优化方向

### 1. 最小 Jerk 曲线
当前使用线性缓动，可升级为 5 次多项式曲线：
```
s(u) = 10u³ - 15u⁴ + 6u⁵
```
使用 `cubic-bezier(0.6, 0, 0.4, 1)` 近似。

### 2. 自适应速度
根据文本长度动态调整 v₁：
```javascript
const v1 = Math.max(30, Math.min(72, C / 3))
```

### 3. 提前触发
在最后一个字完全离开前 ε = 0.2-0.5 字宽时触发回位。

### 4. 速度微调
叠加轻微正弦波动：
```javascript
v(t) = v1 * (1 + 0.1 * sin(π * u))  // β = 0.1
```

## 性能优化

### 1. 样式复用
- 动态生成的 `<style>` 元素只在检测时创建一次
- 组件卸载时自动清理

### 2. DOM 测量优化
- 使用 `nextTick()` 确保 DOM 完全渲染
- 批量测量所有模型，避免重复回流

### 3. 容差设置
- 5px 容差避免浏览器亚像素渲染导致的误判
- 减少不必要的动画实例

## 测试用例

### 短名称（不滚动）
- "GPT-4" (约 40-50px) ✓ 不滚动
- "Claude" (约 50px) ✓ 不滚动

### 中等名称（轻滚动）
- "GPT-4 Turbo" (约 100px)
- 周期约 3-4 秒

### 长名称（完整滚动）  
- "Amazon Bedrock: Claude 3.5 Sonnet" (约 300px)
- 周期约 8-10 秒

## 视觉体验目标

✓ **平滑**: 无抖动，过渡自然  
✓ **节律自然**: 停顿-阅读-快速回位的三段式节奏  
✓ **易读**: 匀速阅读阶段保证足够时间  
✓ **无缝循环**: 环带结构确保无明显断点
