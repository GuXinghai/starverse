# 子菜单 Teleport 修复文档

## 📅 修复日期
2025年1月8日

## 🐛 问题描述

### 现象
在对话列表中，右键菜单的"移动到项目"子菜单被滚动容器的滚动条压在下面，且出现横向滚动条。

### 根本原因

#### 1. 层叠上下文与裁剪问题
- **主菜单**已经使用 `Teleport to="body"` + `fixed` 定位，正确地浮在最上层
- **子菜单**使用 `absolute` 定位，相对于主菜单内的父元素定位
- 子菜单虽然设置了 `z-index: 1310`（高于主菜单的 1300），但因为**在主菜单的 DOM 树内**，受到主菜单层叠上下文的限制
- 主菜单有 `overflow-auto` 属性，会**裁剪溢出的子菜单**

#### 2. 横向滚动条问题
- 子菜单固定宽度 `w-44`（176px）
- 使用 `left-full`（从父元素右边缘开始）+ `ml-2`（8px margin）定位
- 当主菜单靠近右侧边缘时，子菜单会溢出到主菜单右侧之外
- 主菜单的 `overflow-auto` 触发水平滚动条

#### 3. 侧边栏容器的影响
```vue
<div class="flex-1 overflow-y-auto p-2">  <!-- 对话列表容器 -->
```
虽然主菜单已经 Teleport 到 body，但如果子菜单还在主菜单内，就会被主菜单的 overflow 裁剪。

## ✅ 解决方案

### 核心思路
**将子菜单也 Teleport 到 `body`**，使用 `fixed` 定位 + 独立计算坐标，完全绕开层叠上下文和裁剪问题。

### 架构设计

```
侧边栏 (z-20)
├── 对话列表容器 (overflow-y-auto)
│   └── 对话项
│       └── 操作按钮 (触发器)
│
<body>
├── 主菜单 (Teleport, fixed, z-1300)
│   ├── 重命名
│   ├── 删除
│   └── "移动到项目" 按钮 (锚点)
│
└── 子菜单 (独立 Teleport, fixed, z-1310)
    ├── 未分配
    └── 项目列表
```

### 实现要点

#### 1. 状态管理
```typescript
// 子菜单（项目列表）状态
const projectMenuRef = ref<HTMLElement | null>(null)
const projectMenuAnchorEl = ref<HTMLElement | null>(null)  // 锚点元素
const projectMenuTransformOrigin = ref('top left')
const projectMenuCoords = ref({ x: 0, y: 0, maxW: 176, maxH: 400 })
let projectMenuResizeObserver: ResizeObserver | null = null

const projectMenuStyle = computed(() => ({
  top: `${projectMenuCoords.value.y}px`,
  left: `${projectMenuCoords.value.x}px`,
  maxHeight: `${projectMenuCoords.value.maxH}px`,
  maxWidth: `${projectMenuCoords.value.maxW}px`,
  transformOrigin: projectMenuTransformOrigin.value
}))
```

#### 2. 锚点追踪
```typescript
const setProjectMenuAnchor = (el: HTMLElement | null) => {
  projectMenuAnchorEl.value = el
}
```

在模板中绑定：
```vue
<button
  :ref="el => setProjectMenuAnchor(el as HTMLElement)"
  @mouseenter="openProjectMenu(conversation.id)"
>
  移动到项目 →
</button>
```

#### 3. 位置计算
```typescript
const updateProjectMenuPosition = () => {
  if (!hoverProjectMenuId.value) return
  
  const menuEl = projectMenuRef.value
  const anchorEl = projectMenuAnchorEl.value
  if (!menuEl || !anchorEl) return

  const anchorRect = anchorEl.getBoundingClientRect()
  const { width: menuWidth, height: menuHeight } = menuEl.getBoundingClientRect()
  
  // 优先向右展开，其次向下/上，最后向左
  const { x, y, origin, maxW, maxH } = computeMenuPosition(
    anchorRect, 
    menuWidth, 
    menuHeight, 
    ['right-start', 'right-end', 'bottom-start', 'top-start', 'left-start']
  )
  
  projectMenuCoords.value = { x, y, maxW, maxH }
  projectMenuTransformOrigin.value = origin
}
```

#### 4. 响应式更新
```typescript
// 监听子菜单打开
watch(hoverProjectMenuId, async (next) => {
  if (next) {
    await nextTick()
    updateProjectMenuPosition()
  }
})

// 窗口变化时重算
const recomputeContextMenuPosition = () => {
  if (!hoverMenuId.value) return
  requestAnimationFrame(() => {
    updateContextMenuPosition()
    if (hoverProjectMenuId.value) {
      updateProjectMenuPosition()  // 同时更新子菜单
    }
  })
}

// ResizeObserver 监听菜单尺寸变化
const setProjectMenuRef = (el: Element | ComponentPublicInstance | null) => {
  if (projectMenuResizeObserver) {
    projectMenuResizeObserver.disconnect()
  }
  
  const element = resolveHTMLElement(el)
  projectMenuRef.value = element
  
  if (element && typeof ResizeObserver !== 'undefined') {
    projectMenuResizeObserver = new ResizeObserver(() => {
      updateProjectMenuPosition()
    })
    projectMenuResizeObserver.observe(element)
  }
}
```

#### 5. 同步关闭逻辑
```typescript
// 主菜单关闭时，强制关闭子菜单
const closeContextMenu = () => {
  if (!hoverMenuId.value) {
    hoverProjectMenuId.value = null
    return
  }
  hoverMenuId.value = null
  hoverProjectMenuId.value = null
  activeAnchorEl.value = null
  lastKnownAnchorRect.value = null
  projectMenuAnchorEl.value = null  // 清理子菜单锚点
}

// 全局点击检测
const handleGlobalPointerDown = (event: PointerEvent) => {
  const target = event.target as Node | null
  
  // 检查是否点击在主菜单或子菜单内
  if (contextMenuRef.value?.contains(target)) return
  if (projectMenuRef.value?.contains(target)) return
  if (activeAnchorEl.value?.contains(target)) return
  if (projectMenuAnchorEl.value?.contains(target)) return
  
  closeContextMenu()
}
```

#### 6. 防止横向滚动
```vue
<div
  class="fixed z-[1310] w-44 ... overflow-y-auto overflow-x-hidden"
  :style="projectMenuStyle"
>
```

关键点：
- `overflow-y-auto`：允许纵向滚动（项目列表过长时）
- `overflow-x-hidden`：禁止横向滚动
- `w-44`：固定宽度（176px）
- 项目名称使用 `truncate` 类：文本溢出显示省略号

## 🎯 关键代码变更

### 1. 模板结构（ConversationList.vue 第 1188-1265 行）

**修改前：**
```vue
<div class="px-2 pb-2">
  <div class="relative" @mouseenter="..." @mouseleave="...">
    <button>移动到项目 →</button>
    
    <!-- ❌ 子菜单在主菜单内，使用 absolute 定位 -->
    <div
      v-if="hoverProjectMenuId === conversation.id"
      class="absolute left-full top-0 ml-2 w-44 ..."
    >
      <!-- 项目列表 -->
    </div>
  </div>
</div>
```

**修改后：**
```vue
<div class="px-2 pb-2">
  <!-- ✅ 锚点按钮，记录位置 -->
  <button
    :ref="el => setProjectMenuAnchor(el as HTMLElement)"
    @mouseenter="openProjectMenu(conversation.id)"
    @mouseleave="closeProjectMenu"
  >
    移动到项目 →
  </button>
</div>
</Teleport>

<!-- ✅ 子菜单独立 Teleport 到 body -->
<Teleport to="body">
  <div
    v-if="hoverProjectMenuId === conversation.id"
    :ref="setProjectMenuRef"
    class="fixed z-[1310] w-44 ... overflow-y-auto overflow-x-hidden"
    :style="projectMenuStyle"
  >
    <!-- 项目列表 -->
  </div>
</Teleport>
```

### 2. 资源清理（第 867-874 行）
```typescript
onUnmounted(() => {
  // ... 其他清理
  
  if (projectMenuResizeObserver) {
    projectMenuResizeObserver.disconnect()
    projectMenuResizeObserver = null
  }
})
```

## 🔒 防止回归的最佳实践

### 1. Teleport 使用规范
```vue
<!-- ✅ 正确：任何需要浮在最上层的弹层都应 Teleport 到 body -->
<Teleport to="body">
  <div class="fixed z-[1300] ...">
    <!-- 主菜单 -->
  </div>
</Teleport>

<Teleport to="body">
  <div class="fixed z-[1310] ...">
    <!-- 子菜单（更高的 z-index） -->
  </div>
</Teleport>

<!-- ❌ 错误：嵌套的弹层不要放在父弹层的 DOM 树内 -->
<Teleport to="body">
  <div class="fixed z-[1300] overflow-auto">
    <div class="absolute"><!-- 会被 overflow 裁剪 --></div>
  </div>
</Teleport>
```

### 2. Z-index 层级规范
```css
/* 推荐的 z-index 层级体系 */
:root {
  --z-base: 0;           /* 基础层 */
  --z-sidebar: 20;       /* 侧边栏 */
  --z-chat: 10;          /* 聊天区 */
  --z-dropdown: 1200;    /* 下拉菜单 */
  --z-popover: 1300;     /* 弹出菜单（主菜单） */
  --z-submenu: 1310;     /* 子菜单 */
  --z-dialog: 1400;      /* 对话框 */
  --z-toast: 1500;       /* 提示消息 */
}
```

### 3. Overflow 使用注意事项
```vue
<!-- ⚠️ 注意：带 overflow 的容器会裁剪 absolute 定位的子元素 -->
<div class="overflow-auto">
  <div class="absolute"><!-- 会被裁剪 --></div>
</div>

<!-- ✅ 解决方案：使用 Teleport + fixed -->
<div class="overflow-auto">
  <!-- 触发器 -->
</div>
<Teleport to="body">
  <div class="fixed"><!-- 不会被裁剪 --></div>
</Teleport>
```

### 4. 层叠上下文触发器清单
以下 CSS 属性会创建新的层叠上下文，可能影响 z-index：
- `transform` (除了 `none`)
- `opacity` (小于 1)
- `filter` / `backdrop-filter`
- `perspective`
- `will-change`
- `contain: paint`
- `isolation: isolate`
- 带 `z-index` 的 `position: relative/absolute/fixed/sticky`

**建议**：避免在页面根容器或布局容器上使用这些属性。

### 5. 代码审查检查清单
- [ ] 所有弹层是否使用 `Teleport to="body"`？
- [ ] 子菜单是否独立 Teleport（不在父菜单内）？
- [ ] z-index 是否符合层级规范？
- [ ] 是否有 `overflow` 属性可能裁剪弹层？
- [ ] 是否有层叠上下文触发器影响 z-index？
- [ ] 弹层宽度是否固定，文本是否使用 `truncate`？
- [ ] 是否监听窗口变化事件（resize/scroll/DPI）？
- [ ] 是否正确清理 ResizeObserver 和事件监听器？

## 📊 测试验证

### 手动测试用例
1. ✅ 在不同窗口尺寸下打开子菜单（大/中/小）
2. ✅ 滚动对话列表时子菜单保持位置
3. ✅ 项目名称很长时不出现横向滚动条
4. ✅ 切换显示器或 DPI 缩放时子菜单正确重新定位
5. ✅ 主菜单靠近屏幕边缘时子菜单自动调整方向
6. ✅ 子菜单始终在主菜单之上（视觉上不被遮挡）
7. ✅ 点击外部区域同时关闭主菜单和子菜单
8. ✅ 主菜单关闭时子菜单同步关闭

### 自动化测试建议
```typescript
// 可以添加的单元测试
describe('ConversationList Submenu', () => {
  it('should teleport submenu to body', () => {
    // 验证子菜单是否在 body 下
  })
  
  it('should have higher z-index than parent menu', () => {
    // 验证 z-index 层级
  })
  
  it('should not show horizontal scrollbar', () => {
    // 验证 overflow-x-hidden
  })
  
  it('should close submenu when parent menu closes', () => {
    // 验证同步关闭
  })
})
```

## 🔗 相关文件

- `src/components/ConversationList.vue`：主要修改文件
- `src/App.vue`：布局容器 z-index 设置
- `docs/SUBMENU_TELEPORT_FIX.md`：本文档

## 📚 参考资料

- [Vue Teleport 文档](https://vuejs.org/guide/built-ins/teleport.html)
- [MDN: CSS Stacking Context](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_context)
- [MDN: CSS Overflow](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow)
- [Floating UI (定位库)](https://floating-ui.com/)

## 💡 经验总训

1. **嵌套弹层必须独立 Teleport**：即使父弹层已经 Teleport，子弹层也要独立 Teleport 到 body，否则会受父元素的 overflow 影响。

2. **固定宽度 + overflow-x-hidden**：弹层应该有固定的最大宽度，并使用 `overflow-x-hidden` 防止横向滚动。

3. **响应式更新很重要**：要监听窗口变化、滚动、DPI 变化等事件，及时更新弹层位置。

4. **资源清理不能忘**：ResizeObserver 和事件监听器要在 `onUnmounted` 中清理。

5. **层级规范要统一**：建议使用 CSS 变量统一管理 z-index，避免随意设置导致冲突。
