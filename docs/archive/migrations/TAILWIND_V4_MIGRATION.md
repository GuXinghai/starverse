# Tailwind CSS v4 配置迁移指南

## 当前状态

项目已成功升级到 **Tailwind CSS v4.1.16**，并采用了新的配置方式。

### ✅ 已完成的配置

1. **PostCSS 插件升级**
   ```javascript
   // postcss.config.js
   export default {
     plugins: {
       '@tailwindcss/postcss': {},  // v4 新插件
       autoprefixer: {},
     },
   }
   ```

2. **CSS 导入语法**
   ```css
   /* src/style.css */
   @import "tailwindcss";  /* v4 新语法，替代旧的 @tailwind 指令 */
   ```

3. **兼容模式**
   - 保留 `tailwind.config.js` 用于向后兼容
   - 所有现有配置继续正常工作

## Tailwind v4 新特性验证

### 1. `@theme` 指令（新特性）

Tailwind v4 引入了 `@theme` 指令，允许直接在 CSS 文件中配置主题，无需 `tailwind.config.js`。

#### 方式 A：迁移到纯 CSS 配置（推荐用于新项目）

创建 `src/assets/tailwind-theme.css`：

```css
@import "tailwindcss";

@theme {
  /* 颜色系统 */
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-200: #bfdbfe;
  --color-primary-300: #93c5fd;
  --color-primary-400: #60a5fa;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  --color-primary-700: #1d4ed8;
  --color-primary-800: #1e40af;
  --color-primary-900: #1e3a8a;

  /* 自定义间距 */
  --spacing-18: 4.5rem;
  --spacing-88: 22rem;
  --spacing-100: 25rem;
  --spacing-112: 28rem;
  --spacing-128: 32rem;

  /* 自定义字体大小 */
  --font-size-2xs: 0.625rem;
  --font-size-2xs--line-height: 0.875rem;

  /* 自定义圆角 */
  --radius-4xl: 2rem;

  /* 自定义动画 */
  --animate-marquee: marquee 10s linear infinite;
  --animate-spin-slow: spin 3s linear infinite;

  /* 关键帧 */
  @keyframes marquee {
    0% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-50%);
    }
  }

  /* 自定义缓动函数 */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 暗色模式配置 */
@media (prefers-color-scheme: dark) {
  @theme {
    --color-text-primary: #f8fafc;
    --color-text-secondary: #cbd5e1;
    --color-bg: #0f172a;
    --color-bg-secondary: #1e293b;
  }
}
```

#### 方式 B：混合模式（当前推荐）

保持当前架构，`tailwind.config.js` 用于大部分配置，`@theme` 用于特定场景：

```css
/* src/style.css */
@import "tailwindcss";

/* 项目特定的主题调整 */
@theme {
  /* 仅覆盖需要动态调整的值 */
  --color-accent: var(--user-accent-color, #3b82f6);
}
```

### 2. CSS 函数增强

v4 支持在 `@theme` 中使用 CSS 函数：

```css
@theme {
  /* 基于计算的值 */
  --spacing-custom: calc(var(--spacing-4) * 1.5);
  
  /* 响应式字体 */
  --font-size-fluid: clamp(1rem, 2vw, 1.5rem);
  
  /* 颜色混合 */
  --color-blend: color-mix(in srgb, var(--color-primary-500) 50%, white);
}
```

### 3. 配置优先级

当同时存在 `tailwind.config.js` 和 `@theme` 时：

1. **`tailwind.config.js`** - 基础配置，全局生效
2. **`@theme`** - 覆盖配置，优先级更高
3. **内联 CSS 变量** - 运行时动态值，最高优先级

## 迁移策略

### 阶段 1：验证当前配置（已完成 ✅）

- [x] 升级到 Tailwind v4
- [x] 更新 PostCSS 配置
- [x] 修改 CSS 导入语法
- [x] 验证所有现有样式正常工作

### 阶段 2：渐进式迁移（可选）

如果需要完全迁移到 `@theme` 配置：

1. **创建新的主题文件**
   ```bash
   # 创建专用主题配置
   touch src/assets/tailwind-theme.css
   ```

2. **逐步迁移配置项**
   - 从简单的颜色和间距开始
   - 逐步迁移复杂的动画和变体
   - 保持 `tailwind.config.js` 作为备份

3. **测试验证**
   ```bash
   npm run dev  # 验证开发环境
   npm run build  # 验证生产构建
   ```

4. **清理旧配置**
   - 确认所有功能正常后，可选择删除 `tailwind.config.js`
   - 或保留用于团队成员熟悉度

### 阶段 3：利用新特性（推荐）

利用 v4 新特性提升开发体验：

```css
/* src/style.css */
@import "tailwindcss";
@import "./assets/design-tokens.css";

@theme {
  /* 动态主题支持 */
  --color-brand: light-dark(#3b82f6, #60a5fa);
  
  /* 容器查询单位 */
  --container-padding: 5cqw;
  
  /* 现代颜色空间 */
  --color-vivid: oklch(70% 0.2 200);
}
```

## 优势对比

### `tailwind.config.js` 方式（传统）

**优点**：
- 团队熟悉度高
- IDE 支持完善
- 类型安全（TypeScript）

**缺点**：
- 需要重启开发服务器
- 配置与样式分离
- 无法使用 CSS 原生功能

### `@theme` 方式（v4 新增）

**优点**：
- 热更新无需重启
- 配置与样式统一
- 支持 CSS 变量、函数、媒体查询
- 更好的作用域控制
- 支持运行时动态调整

**缺点**：
- 新语法需要学习
- 部分 IDE 支持待完善
- 复杂配置可读性较差

## 当前推荐方案

基于 Starverse 项目特点，推荐采用 **混合模式**：

1. **保留 `tailwind.config.js`**
   - 存放静态、全局的主题配置
   - 团队成员熟悉的配置方式
   - TypeScript 类型支持

2. **使用 `@theme` 处理**
   - 需要动态调整的主题值
   - 特定组件的局部样式
   - 实验性新功能

3. **使用 CSS 变量（`design-tokens.css`）**
   - 运行时可修改的值
   - 需要 JavaScript 访问的值
   - 暗色模式切换

## 验证清单

- [x] Tailwind v4 安装成功
- [x] PostCSS 配置正确
- [x] CSS 导入语法更新
- [x] 现有样式正常工作
- [ ] `@theme` 指令测试（可选）
- [ ] 动态主题切换测试（可选）
- [ ] 生产构建验证

## 相关资源

- [Tailwind CSS v4 官方文档](https://tailwindcss.com/docs/v4-beta)
- [PostCSS 插件迁移指南](https://tailwindcss.com/docs/upgrade-guide)
- [CSS @theme 指令规范](https://tailwindcss.com/docs/theme)

## 结论

Starverse 项目已成功升级到 Tailwind CSS v4，当前配置经过验证可正常工作。

- ✅ **`tailwind.config.js` 仍然支持** - 无需强制迁移
- ✅ **`@theme` 指令可用** - 可按需采用新特性
- ✅ **向后兼容** - 现有代码无需修改

建议保持当前混合配置模式，逐步探索 v4 新特性，根据团队反馈决定是否进一步迁移。
