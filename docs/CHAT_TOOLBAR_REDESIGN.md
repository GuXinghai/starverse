# ChatToolbar 重新设计文档

## 🎨 设计概览

全新的现代化、紧凑型工具栏设计，避免臃肿和视觉堆叠，提供流畅的用户体验。

## ✨ 核心特性

### 1. **三区域布局**
```
[附件工具组] ───── [高级功能胶囊组] ───── [状态指示器]
     左侧                  中间                  右侧
```

### 2. **视觉优化**

#### **左侧：附件工具组**
- 文件上传按钮（带文件数量指示点）
- PDF 引擎选择器（紧凑版，带图标）
- 图片上传按钮（带图片数量指示点）
- 分隔线视觉区分

#### **中间：高级功能胶囊组**
- **图像生成**：渐变紫粉色按钮，启用时醒目
  - 内联比例调节滑块（启用时显示）
  - 紫粉色渐变滑块样式
  
- **网络搜索**：渐变翠绿色按钮，胶囊式分体设计
  - 左：切换开关
  - 右：强度调节
  
- **推理控制**：靛蓝色边框按钮
  
- **采样参数**：蓝色边框按钮

#### **右侧：状态与折叠**
- 增强模式指示器（有功能启用时显示）
- 更多选项菜单（移动端折叠）

### 3. **交互增强**

#### **PDF 引擎选择器**
- ✅ 紧凑按钮设计（Emoji 图标 + 文本）
- ✅ 下拉菜单显示详细信息：
  ```
  📄 PDF Text
     免费，文本为主
  
  🔍 Mistral OCR
     扫描件/图片，$2/千页
  
  ⚡ Native
     模型原生，按 tokens 计费
  ```
- ✅ 当前选中项高亮显示

#### **状态指示器**
- 动态显示：有功能启用时显示"增强模式"标签
- 脉冲动画绿点，吸引注意力
- 渐变背景（蓝到紫）

#### **响应式设计**
- 桌面端：完整显示所有按钮
- 移动端：推理/参数按钮折叠到"更多"菜单
- 窄屏：自动调整内边距

### 4. **样式特色**

#### **渐变按钮**
```css
/* 图像生成 */
background: linear-gradient(to right, #a855f7, #ec4899);

/* 网络搜索 */
background: linear-gradient(to right, #10b981, #14b8a6);
```

#### **自定义滑块**
- 紫粉渐变轨道
- 白色圆形滑块，紫色边框
- 悬停放大效果（scale 1.1）
- 阴影增强反馈

#### **毛玻璃效果**
```css
background: rgba(249, 250, 251, 0.8);
backdrop-filter: blur(8px);
```

## 📐 技术实现

### **布局结构**
- Flexbox 单行布局
- `gap-3` 统一间距
- `items-center` 垂直居中

### **按钮分组**
- 胶囊式按钮：相关功能视觉连接
- 一致的 `rounded-lg` 圆角
- `shadow-sm` 微妙阴影

### **状态管理**
- 本地 `ref` 管理下拉菜单显示
- `computed` 计算活跃功能数量
- Props 驱动的按钮状态

### **可访问性**
- 所有按钮提供 `title` 属性
- 禁用状态明确视觉反馈
- 键盘快捷键提示

## 🎯 设计目标达成

### ✅ 避免臃肿
- 单行紧凑布局
- 智能折叠次要功能
- 弹出式菜单取代内联展开

### ✅ 避免堆叠
- Flexbox 水平排列
- 固定高度工具栏
- 无垂直空间浪费

### ✅ 功能清晰
- 分组视觉区分
- 品牌色状态指示
- 直观的图标语言

### ✅ 现代美观
- 渐变按钮设计
- 毛玻璃背景
- 流畅动画过渡

## 🚀 使用示例

```vue
<ChatToolbar
  :generation-status="generationStatus"
  :is-electron-available="true"
  :has-pending-files="files.length > 0"
  :has-pending-attachments="images.length > 0"
  :can-show-image-generation-button="true"
  :image-generation-enabled="imageGenEnabled"
  :is-web-search-available="true"
  :web-search-enabled="webSearchEnabled"
  :is-reasoning-control-available="true"
  :is-sampling-control-available="true"
  :selected-pdf-engine="pdfEngine"
  @select-file="handleSelectFile"
  @select-image="handleSelectImage"
  @toggle-image-generation="toggleImageGen"
  @toggle-web-search="toggleWebSearch"
  @toggle-reasoning-menu="showReasoningMenu = true"
  @toggle-sampling-menu="showSamplingMenu = true"
/>
```

## 📱 响应式断点

| 断点 | 行为 |
|------|------|
| `>= 1024px` (lg) | 完整显示所有功能 |
| `640px - 1023px` (md) | 推理/参数折叠到"更多"菜单 |
| `< 640px` (sm) | 紧凑内边距，PDF 引擎仅显示图标 |

## 🎨 颜色方案

| 功能 | 颜色 | 用途 |
|------|------|------|
| 图像生成 | 紫粉渐变 (#a855f7 → #ec4899) | 创意功能 |
| 网络搜索 | 翠绿渐变 (#10b981 → #14b8a6) | 数据获取 |
| 推理控制 | 靛蓝 (#4f46e5) | 智能功能 |
| 采样参数 | 蓝色 (#3b82f6) | 技术参数 |
| 增强模式 | 蓝紫渐变背景 | 状态指示 |

## 🔧 维护注意事项

1. **添加新功能**：在中间胶囊组添加，保持视觉一致性
2. **修改颜色**：使用 Tailwind 工具类，避免自定义 CSS
3. **响应式调整**：优先考虑移动端体验
4. **状态管理**：保持父组件控制弹窗显示

---

**最后更新**: 2025年11月30日  
**设计者**: GitHub Copilot  
**版本**: 2.0 (重构版)
