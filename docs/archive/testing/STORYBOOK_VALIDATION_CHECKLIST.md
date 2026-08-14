# Storybook 验证清单 - 聊天输入区组件

## 🎯 验证目标

确保所有聊天输入区 UI 组件在 Storybook 中通过全状态、全断点验证后，才能接入应用。

---

## 📋 启动 Storybook

### Windows PowerShell
```powershell
npm run storybook
```

### 预期输出
```
╭─────────────────────────────────────────────────╮
│                                                 │
│   Storybook 8.6.0 for vite started             │
│   5.2 s for manager and 6.1 s for preview      │
│                                                 │
│    Local:            http://localhost:6006/     │
│    On your network:  http://192.168.x.x:6006/   │
│                                                 │
╰─────────────────────────────────────────────────╯
```

访问 `http://localhost:6006/` 打开 Storybook 界面。

---

## ✅ 组件验证清单

### 1. ChatToolbar (src/components/chat/input/ChatToolbar.vue)

**Story 路径**: `Chat/Input/ChatToolbar`

**必须验证的 Stories**:
- [ ] **Default** - 所有功能禁用，基础状态
- [ ] **WithReasoningEnabled** - 推理启用，显示「推理 (medium)」chip
- [ ] **WithWebSearchEnabled** - 搜索启用，显示「搜索 (normal)」chip
- [ ] **AllFeaturesEnabled** - 所有功能同时启用，测试换行布局
- [ ] **GeneratingState** - 生成中状态，所有按钮禁用
- [ ] **Interactive** - 交互演示，点击切换功能状态

**断点测试** (使用 Storybook 工具栏切换视口):
- [ ] **480px** (Mobile): 按钮换行，间距正常
- [ ] **768px** (Tablet): 布局自适应
- [ ] **1280px** (Desktop): 所有按钮一行显示

**按钮高度一致性验证**:
1. 打开 `ButtonHeightConsistency` story
2. 右键点击任意按钮 → 检查元素
3. 在 Computed Styles 中查找 `height`
4. **预期值**: `36px` (来自 `var(--button-height-lg)`)
5. 验证所有按钮（上传图片/搜索/推理/参数/宽高比切换）高度一致

**检查点**:
- [ ] 无硬编码 `h-9` 类（应使用 `style="height: var(--button-height-lg)"`）
- [ ] 按钮文字不撑开高度（`line-height: 1`）
- [ ] hover/focus 状态正常
- [ ] 禁用状态显示灰色且不可点击

---

### 2. IntegratedPromptBox (src/components/chat/input/IntegratedPromptBox.vue)

**Story 路径**: `Chat/Input/IntegratedPromptBox`

**必须验证的 Stories**:
- [ ] **Default** - 默认状态，无法发送
- [ ] **CanSend** - 可发送状态，发送按钮激活
- [ ] **WithWebSearch** - Web 搜索启用（蓝色）
- [ ] **WithReasoning** - 推理功能启用（紫色）
- [ ] **AllFeaturesEnabled** - 全功能启用，测试多按钮布局
- [ ] **SendDelayPending** - 发送延迟中，显示「撤回」按钮
- [ ] **Receiving** - AI 回复中，显示「停止」按钮（红色）
- [ ] **Interactive** - 交互演示，模拟发送流程

**断点测试**:
- [ ] **480px** (Mobile): 按钮文字隐藏，只显示图标
- [ ] **768px** (Tablet): 按钮正常显示
- [ ] **1280px** (Desktop): 功能按钮和发送按钮在一行

**颜色状态验证**:
1. 打开 `ButtonColorStates` story
2. 验证功能按钮颜色主题：
   - [ ] Web 搜索：禁用灰色 → 启用蓝色
   - [ ] 推理功能：禁用灰色 → 启用紫色
   - [ ] 图像生成：禁用灰色 → 启用粉色
   - [ ] 采样参数：禁用灰色 → 启用橙色
3. 验证发送按钮状态：
   - [ ] 发送：蓝色渐变
   - [ ] 撤回：琥珀色渐变
   - [ ] 停止：红色渐变

**检查点**:
- [ ] 按钮高度使用 `py-2`（padding）而非固定高度
- [ ] 响应式媒体查询正常（`@media (max-width: 640px)`）
- [ ] 渐变背景显示正常
- [ ] 禁用状态 `opacity: 0.5`

---

### 3. ReasoningControls (src/components/chat/controls/ReasoningControls.vue)

**Story 路径**: `Chat/Controls/ReasoningControls`

**必须验证的 Stories**:
- [ ] **Default** - 推理关闭状态
- [ ] **ReasoningMedium** - 中档推理（10000 tokens）
- [ ] **ReasoningHigh** - 高档推理（32000 tokens）
- [ ] **MenuOpen** - 下拉菜单展开，显示所有等级
- [ ] **NoReasoningSupport** - 模型不支持推理
- [ ] **Interactive** - 交互演示，切换推理等级

**断点测试**:
- [ ] **480px** (Mobile): 下拉菜单适配窄屏
- [ ] **768px** (Tablet): 布局正常
- [ ] **1280px** (Desktop): 宽屏布局

**推理等级对比**:
1. 打开 `AllTiers` story
2. 并排查看 4 档推理等级：
   - [ ] 极简 (minimal): 1000 tokens
   - [ ] 低 (low): 5000 tokens
   - [ ] 中 (medium): 10000 tokens
   - [ ] 高 (high): 32000 tokens
3. 验证标签和预算值匹配

**检查点**:
- [ ] 下拉菜单切换流畅
- [ ] 预算滑块拖动正常
- [ ] 不支持推理时控件禁用
- [ ] 模型能力感知正确（`supportsReasoning`/`supportsBudget`）

---

### 4. ChatToolbarButton (src/components/atoms/ChatToolbarButton.vue)

**Story 路径**: `Atoms/ChatToolbarButton`

**必须验证的 Stories**:
- [ ] **Default** - 默认尺寸（md, 32px）
- [ ] **AllSizes** - sm/md/lg 三种尺寸对比
- [ ] **AllVariants** - default/primary/ghost/outline 变体
- [ ] **ActiveState** - 激活状态（功能已启用）
- [ ] **DisabledState** - 禁用状态
- [ ] **WithIcon** - 图标 + 文本
- [ ] **IconOnly** - 纯图标模式（正方形）

**尺寸验证** (AllSizes story):
1. 使用开发者工具测量每个尺寸的高度：
   - [ ] **sm**: 28px (`var(--button-height-sm)`)
   - [ ] **md**: 32px (`var(--button-height-md)`)
   - [ ] **lg**: 36px (`var(--button-height-lg)`)
2. 验证宽度仅受 `padding-inline` 和内容影响
3. 纯图标模式宽度 = 高度（`aspect-ratio: 1 / 1`）

**变体验证**:
- [ ] **default**: 白色背景 + 灰色边框
- [ ] **primary**: 蓝色背景 + 白色文字
- [ ] **ghost**: 透明背景 + 无边框
- [ ] **outline**: 透明背景 + 深色边框

**交互状态**:
- [ ] hover: 背景变深 + 阴影出现
- [ ] active: 缩放 `scale(0.98)`
- [ ] focus: 蓝色外轮廓（`outline`）
- [ ] disabled: 不透明度 50% + 禁用点击

---

## 🔍 高度一致性专项测试

**目标**: 确保所有输入区按钮高度完全统一，不受内容影响。

### 测试步骤

1. **打开 ChatToolbar → ButtonHeightConsistency story**

2. **使用浏览器开发者工具**:
   - 按 F12 打开开发者工具
   - 选择元素选择器（或按 Ctrl+Shift+C）
   - 依次点击以下按钮：
     - [ ] 上传图片按钮
     - [ ] 上传文件按钮
     - [ ] 搜索按钮（带标签）
     - [ ] 宽高比切换按钮（⟳）

3. **检查 Computed Styles**:
   ```
   height: 36px    ← 必须精确匹配
   ```

4. **常见问题排查**:
   - ❌ **高度不一致**: 检查是否有硬编码的 `h-*` 类
   - ❌ **文字撑开高度**: 检查 `line-height` 是否为 `1`
   - ❌ **border 影响高度**: 检查 `box-sizing` 是否为 `border-box`
   - ❌ **padding 撑开高度**: 确认使用 `padding-inline` 而非 `padding`

### 测试矩阵

| 按钮类型 | Story 位置 | 预期高度 | 测量高度 | 状态 |
|---------|-----------|---------|---------|------|
| 上传图片 | ChatToolbar → AllFeaturesEnabled | 36px | ___ px | ⬜️ |
| 上传文件 | ChatToolbar → AllFeaturesEnabled | 36px | ___ px | ⬜️ |
| 搜索 | ChatToolbar → WithWebSearchEnabled | 36px | ___ px | ⬜️ |
| 推理 | ChatToolbar → WithReasoningEnabled | 36px | ___ px | ⬜️ |
| 参数 | ChatToolbar → WithSamplingParametersEnabled | 36px | ___ px | ⬜️ |
| 绘画 | ChatToolbar → WithImageGenerationEnabled | 36px | ___ px | ⬜️ |
| 宽高比切换 | ChatToolbar → WithImageGenerationEnabled | 36px | ___ px | ⬜️ |

---

## 🌐 响应式布局测试

### Storybook 视口切换

1. 点击 Storybook 工具栏的 📱 视口图标
2. 选择预设视口：
   - **Mobile** (375px)
   - **Tablet** (768px)
   - **Desktop** (1280px)

### 测试场景

#### ChatToolbar

| 视口 | 预期行为 | 验证 |
|------|---------|------|
| 480px | 按钮换行，上传/搜索/推理各占一行 | ⬜️ |
| 768px | 部分换行，功能按钮分 2 行 | ⬜️ |
| 1280px | 所有按钮一行显示，右侧留空 | ⬜️ |

#### IntegratedPromptBox

| 视口 | 预期行为 | 验证 |
|------|---------|------|
| 480px | 按钮文字隐藏（`@media (max-width: 640px)`） | ⬜️ |
| 768px | 按钮文字显示，正常布局 | ⬜️ |
| 1280px | 功能按钮和发送按钮在一行 | ⬜️ |

#### ReasoningControls

| 视口 | 预期行为 | 验证 |
|------|---------|------|
| 480px | 下拉菜单适配窄屏，滑块缩窄 | ⬜️ |
| 768px | 正常布局 | ⬜️ |
| 1280px | 宽屏布局，菜单项横向排列 | ⬜️ |

---

## 🎨 视觉回归测试

### 截图对比 (可选)

如果项目配置了 Storybook 的 Chromatic 或其他视觉回归工具：

1. 运行基准截图:
   ```powershell
   npm run storybook:test
   ```

2. 对比修改后的截图，确认无非预期变化

### 手动视觉检查

对于每个 story，验证：
- [ ] 颜色准确（无意外的灰色/白色）
- [ ] 圆角正确（胶囊形状 `rounded-full`）
- [ ] 间距统一（`gap-2` 或 `gap-4`）
- [ ] 阴影显示（hover 时）
- [ ] 过渡动画流畅（`transition-all duration-200`）

---

## ♿ 可访问性测试

### Storybook a11y Addon

1. 打开任意 story
2. 切换到 **Accessibility** 标签（在 Addons 面板）
3. 运行扫描，确认：
   - [ ] **0 Violations** (无违规)
   - [ ] 按钮有 `aria-label` 或可见文本
   - [ ] 禁用状态有 `aria-disabled="true"`
   - [ ] 对比度符合 WCAG AA 标准

### 键盘导航

1. 使用 Tab 键在按钮间导航
2. 验证：
   - [ ] 聚焦顺序合理（从左到右）
   - [ ] 焦点环清晰可见（蓝色 `outline`）
   - [ ] Enter/Space 键可激活按钮
   - [ ] 禁用按钮无法聚焦

---

## 🐛 控制台检查

### 无警告和错误

在 Storybook 运行时，打开浏览器控制台 (F12 → Console)：

- [ ] 无 Vue 警告（如 props 类型不匹配）
- [ ] 无 TypeScript 类型错误
- [ ] 无 Tailwind CSS 警告（如未知 class）
- [ ] 无资源加载失败（404）

### 性能监控

打开 Performance 标签，录制交互过程：
- [ ] 无长任务（>50ms）
- [ ] 帧率稳定（60 FPS）
- [ ] 动画流畅（无卡顿）

---

## 📦 接入应用前的最终检查

### 确认清单

- [ ] 所有 stories 已创建并通过验证
- [ ] 按钮高度一致性测试通过
- [ ] 3 个断点（480/768/1280px）布局正常
- [ ] 控制台无警告和错误
- [ ] 可访问性测试通过
- [ ] 交互演示正常（Interactive story）
- [ ] 文档更新（README.md 已添加开发规范）

### 接入步骤

1. **导入组件**:
   ```vue
   import ChatToolbar from '@/components/chat/input/ChatToolbar.vue'
   ```

2. **使用组件（仅消费，不修改）**:
   ```vue
   <ChatToolbar
     :generation-status="status"
     :web-search-enabled="webSearchEnabled"
     @toggle-web-search="handleToggle"
   />
   ```

3. **禁止操作**:
   - ❌ 不得添加外部样式类覆盖尺寸
   - ❌ 不得在父组件中写 `<button>` 替代子组件
   - ❌ 不得使用任意值类

---

## 📝 验证结果记录

### 验证人员信息
- **姓名**: _______________
- **日期**: _______________
- **提交 ID**: _______________

### 总结
- **通过的 Stories 数量**: ___ / ___
- **失败的 Stories**: _______________
- **需要修复的问题**: _______________

### 批准
- [ ] 所有验证项通过，批准接入应用
- [ ] 需要修复后重新验证

---

## 🔗 相关资源

- **Storybook 文档**: https://storybook.js.org/
- **Tailwind CSS v4**: https://tailwindcss.com/
- **设计令牌配置**: `src/style.css` 中的 `@theme` 块
- **组件开发规范**: `src/components/chat/input/README.md`
- **ChatToolbarButton 文档**: `src/components/atoms/ChatToolbarButton.vue` 顶部注释

---

**最后更新**: 2025-12-06  
**版本**: v1.0.0
