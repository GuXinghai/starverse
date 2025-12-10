# 调试：倒计时结束后按钮未切换（撤回→中止）

## 问题现象

用户报告：发送延时倒计时结束后，"撤回"按钮没有自动切换为"中止"按钮。

## 诊断策略

### 一、核心问题定位

按钮显示逻辑由以下三个环节控制：

1. **状态源头**：`useMessageSending` 中的 `pendingSend` 对象
2. **计算属性**：`isDelayPending` 和 `isAbortable`
3. **UI 渲染**：`FloatingCapsuleInput` 的按钮分支逻辑

### 二、关键代码路径

#### 1. 状态定义（`useMessageSending.ts`）

```typescript
// 延时阶段判断
const isDelayPending = computed(() => 
  pendingSend.value?.state === 'scheduled' && pendingSend.value?.phase === 'delay'
)

// 可中止阶段判断
const isAbortable = computed(() => 
  pendingSend.value?.phase === 'requesting' || 
  pendingSend.value?.phase === 'streaming' || 
  isStreaming.value
)
```

#### 2. 阶段切换（`finishPendingSend`）

```typescript
function finishPendingSend(ctx: PendingSendContext) {
  // ... 验证逻辑 ...
  
  ctx.state = 'sent'  // 状态切换
  ctx.phase = 'requesting'  // ⭐ 关键：从 'delay' 切换到 'requesting'
  
  // ⚠️ 重要：不清空 pendingSend.value（保留上下文用于后续中止判断）
  // pendingSend.value = null  // 注释掉了
  
  return sendMessageCore(...)
}
```

#### 3. UI 按钮逻辑（`FloatingCapsuleInput.vue`）

```vue
<!-- 撤回按钮：delay 阶段 -->
<button v-if="sendDelayPending" @click="emit('undo-delay')">
  撤回
</button>

<!-- 中止按钮：requesting/streaming 阶段 -->
<button v-else-if="isAbortable" @click="emit('stop')">
  停止
</button>

<!-- 发送按钮：idle 阶段 -->
<button v-else @click="handleSend">
  发送
</button>
```

### 三、理论分析

根据代码逻辑，倒计时结束时应该发生以下变化：

1. ✅ `ctx.phase` 从 `'delay'` → `'requesting'`
2. ✅ `isDelayPending` 从 `true` → `false`（因为 `phase !== 'delay'`）
3. ✅ `isAbortable` 从 `false` → `true`（因为 `phase === 'requesting'`）
4. ✅ UI 应该显示：撤回 → 中止

**如果按钮没有切换，只有两种可能：**

1. **计算属性未更新**：`pendingSend.value` 的引用或属性没有触发响应式更新
2. **组件未重新渲染**：props 传递链条中断或组件被缓存

### 四、已添加的调试日志

#### 日志层级（从底层到上层）

```
useMessageSending.ts (核心逻辑层)
  ├─ finishPendingSend: 阶段切换前后
  ├─ isDelayPending: 每次计算时输出
  └─ isAbortable: 每次计算时输出
       ↓
ChatView.vue (容器层)
  ├─ watch isDelayPending + isAbortable
  ├─ 计算应显示的按钮类型
  └─ 传递给 ModernChatInput 的 props
       ↓
ModernChatInput.vue (智能容器层)
  ├─ setupPropsWatcher: 监听 props 变化
  ├─ handleStop: 中止按钮点击
  └─ handleUndoDelay: 撤回按钮点击
       ↓
FloatingCapsuleInput.vue (纯展示层)
  ├─ watch 按钮状态
  └─ 输出当前应显示的按钮类型
```

### 五、复现测试步骤

1. **启动开发服务器**：
   ```powershell
   npm run dev
   ```

2. **打开 DevTools Console**（F12）

3. **发送消息触发延时**：
   - 在输入框输入任意内容
   - 点击"发送"按钮
   - 观察按钮变为"撤回"

4. **等待倒计时结束**（5 秒）

5. **观察日志输出**：

   **预期日志序列**：
   ```
   [useMessageSending] 🔍 finishPendingSend 被调用
   [useMessageSending] 🔄 阶段切换前: { oldPhase: 'delay', oldState: 'scheduled' }
   [useMessageSending] 🔄 阶段切换后: { newPhase: 'requesting', newState: 'sent' }
   [useMessageSending] 🔍 isDelayPending computed: { result: false, phase: 'requesting' }
   [useMessageSending] 🔍 isAbortable computed: { result: true, phase: 'requesting' }
   [ChatView] 🔍 状态变化: { isDelayPending: false, isAbortable: true }
   [ChatView] 🔵 当前应显示按钮: 中止
   [ChatView] 📤 传给 ModernChatInput 的 props: { sendDelayPending: false, isAbortable: true }
   [ModernChatInput] 🔍 Props 变化: { sendDelayPending: false, isAbortable: true }
   [ModernChatInput] 🔵 应显示按钮: 中止
   [FloatingCapsuleInput] 🔍 按钮状态: { sendDelayPending: false, isAbortable: true }
   [FloatingCapsuleInput] 🟢 应显示按钮: 中止/停止
   ```

   **异常情况判断**：
   - 如果 `finishPendingSend` 没有被调用 → 计时器未触发
   - 如果 `phase` 切换但 `isDelayPending` 仍为 `true` → 响应式失效
   - 如果 `isAbortable` 为 `false` → 条件判断错误
   - 如果 ChatView 的 watch 未触发 → props 传递中断
   - 如果 FloatingCapsuleInput 的状态正确但 UI 未变化 → `v-if`/`v-else-if` 渲染问题

### 六、可能的根因与修复方案

#### 场景 1：响应式失效

**症状**：`ctx.phase` 已改变，但 `computed` 未重新计算

**原因**：
- `pendingSend.value` 的对象引用未变化（仅修改了内部属性）
- Vue 3 对对象属性的响应式追踪失效

**修复**：
```typescript
// 方案 A：强制触发响应式（Hack）
ctx.phase = 'requesting'
pendingSend.value = { ...pendingSend.value }  // 创建新对象触发更新

// 方案 B：使用 reactive 替代 ref（需要重构）
const pendingSend = reactive<PendingSendContext | null>(null)
```

#### 场景 2：计时器上下文错误

**症状**：`finishPendingSend` 未被调用

**原因**：
- 计时器回调中的 `ctx` 引用已过期
- 标签页切换导致上下文混乱

**修复**：
```typescript
// 确保计时器回调中固化上下文
ctx.timerId = setTimeout(() => {
  const currentCtx = pendingSend.value
  if (currentCtx === ctx && ctx.state === 'scheduled') {
    finishPendingSend(ctx)
  }
}, delayDuration)
```

#### 场景 3：组件缓存未刷新

**症状**：状态正确但 UI 未更新

**原因**：
- `<KeepAlive>` 缓存导致组件未重新渲染
- `v-if`/`v-else-if` 条件未重新评估

**修复**：
```vue
<!-- 添加 :key 强制刷新 -->
<button 
  :key="`send-button-${sendDelayPending}-${isAbortable}`"
  v-if="sendDelayPending" 
  ...
>
```

### 七、后续行动

1. **运行测试**：按照第五节步骤复现问题
2. **收集日志**：完整复制 Console 输出
3. **定位断点**：找到日志中第一个异常的位置
4. **针对修复**：根据场景选择对应修复方案
5. **回归测试**：确认修复后撤回→中止切换正常

---

## 附录：相关代码文件

- `src/composables/useMessageSending.ts` - 发送逻辑核心
- `src/components/ChatView.vue` - 聊天视图容器
- `src/components/chat/input/ModernChatInput.vue` - 输入组件智能容器
- `src/components/chat/input/FloatingCapsuleInput.vue` - 输入组件展示层

## 附录：调试命令

```powershell
# 启动开发服务器
npm run dev

# 清理缓存重启（如果怀疑缓存问题）
Remove-Item -Recurse -Force node_modules/.vite; npm run dev
```
