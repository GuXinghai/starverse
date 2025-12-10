# Tailwind CSS v4 快速参考

## 项目当前配置 ✅

```
Tailwind CSS: v4.1.16
PostCSS 插件: @tailwindcss/postcss v4.1.16
配置模式: 混合模式（config.js + @theme）
AI 规则文件: .cursorrules, .windsurfrules
```

## 配置文件位置

| 文件 | 用途 | 状态 |
|------|------|------|
| `postcss.config.js` | PostCSS 插件配置 | ✅ 使用 v4 插件 |
| `tailwind.config.js` | 传统主题配置（兼容） | ✅ 启用 |
| `src/style.css` | CSS 入口 | ✅ 使用新语法 |
| `src/assets/tailwind-v4-theme.css` | @theme 示例 | ✅ 可选启用 |

## 语法对比

### CSS 导入

**❌ v3 旧语法**:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**✅ v4 新语法**:
```css
@import "tailwindcss";
```

### 主题配置

**方式 1: tailwind.config.js（传统，当前使用）**
```javascript
export default {
  theme: {
    extend: {
      colors: {
        primary: {
          500: '#3b82f6',
        },
      },
      spacing: {
        '18': '4.5rem',
      },
    },
  },
}
```

**方式 2: @theme 指令（v4 新增，可选）**
```css
@theme {
  --color-primary-500: #3b82f6;
  --spacing-18: 4.5rem;
}
```

## @theme 高级特性

### 1. CSS 函数支持
```css
@theme {
  --spacing-fluid: clamp(1rem, 5vw, 3rem);
  --color-muted: color-mix(in srgb, var(--color-primary-500) 50%, white);
  --spacing-dynamic: calc(var(--spacing-4) * 1.5);
}
```

### 2. 媒体查询支持
```css
@theme {
  --color-primary: #3b82f6;
}

@media (prefers-color-scheme: dark) {
  @theme {
    --color-primary: #60a5fa;
  }
}
```

### 3. 现代颜色空间
```css
@theme {
  --color-vibrant: oklch(70% 0.2 200);
  --color-p3: color(display-p3 1 0.5 0);
}
```

## 配置优先级

```
1. tailwind.config.js  (低优先级 - 基础配置)
       ↓
2. @theme in CSS       (中优先级 - 覆盖配置)
       ↓
3. 内联 CSS 变量        (高优先级 - 运行时动态)
```

## 使用建议

### ✅ 推荐场景使用 @theme

- 需要动态主题切换
- 需要响应式主题值
- 使用 CSS 函数计算
- 局部组件主题

### ✅ 推荐场景使用 config.js

- 静态全局配置
- 需要 TypeScript 类型
- 团队协作（熟悉度）
- 复杂插件配置

## 快速启用 @theme

在 `src/style.css` 中添加：

```css
@import "tailwindcss";
@import "./assets/tailwind-v4-theme.css";  /* 启用 @theme 示例 */
```

## 验证清单

- [x] Tailwind v4.1.16 已安装
- [x] @tailwindcss/postcss 已配置
- [x] @import "tailwindcss" 已使用
- [x] tailwind.config.js 正常工作
- [x] @theme 示例文件已创建
- [x] 开发服务器正常运行

## 相关文档

- 📖 [完整迁移指南](./TAILWIND_V4_MIGRATION.md)
- 📋 [验证报告](./TAILWIND_V4_VERIFICATION.md)
- 💡 [示例文件](../src/assets/tailwind-v4-theme.css)
- 🤖 [AI 助手 Prompt](./TAILWIND_V4_AI_PROMPT.md)
- 🛡️ [项目规则文件](../.cursorrules)

## 命令速查

```bash
# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 验证 Tailwind 配置
npx tailwindcss --help
```

## 常见问题

### Q: 是否必须删除 tailwind.config.js？
**A**: ❌ 不是必须的。v4 完全兼容旧配置，可按需选择。

### Q: @theme 和 config.js 能同时使用吗？
**A**: ✅ 可以。@theme 会覆盖 config.js 中的同名配置。

### Q: 修改 @theme 需要重启吗？
**A**: ❌ 不需要。CSS 修改会自动热更新。

### Q: 修改 config.js 需要重启吗？
**A**: ✅ 需要。JavaScript 配置需要重启开发服务器。

---

**最后更新**: 2025-11-29  
**项目**: Starverse v0.0.0
