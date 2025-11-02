# Starverse - Electron + Vue.js + Tailwind CSS 桌面应用

这是一个使用现代技术栈开发的桌面应用项目。

## 技术栈
- **框架**: Electron + Vite
- **UI 框架**: Vue.js 3 (Composition API)
- **样式框架**: Tailwind CSS
- **语言**: TypeScript
- **构建工具**: electron-vite

## 项目结构
```
├── electron/           # Electron 主进程和预加载脚本
├── src/               # 渲染进程源码 (Vue.js 应用)
│   ├── components/    # Vue 组件
│   ├── assets/        # 静态资源
│   └── main.ts        # 应用入口
├── public/            # 公共资源
└── dist/              # 构建输出
```

## 开发指南

### 样式开发
- 使用 Tailwind CSS 工具类进行快速样式开发
- 避免编写自定义 CSS，优先使用 Tailwind 类名
- 使用响应式设计类 (sm:, md:, lg:, xl:)

### Vue.js 开发
- 使用 Composition API 和 `<script setup>` 语法
- 组件采用 TypeScript 类型定义
- 使用 ref() 和 reactive() 进行状态管理

### Electron 安全
- 遵循 Electron 安全最佳实践
- 正确配置 contextIsolation 和 nodeIntegration
- 使用预加载脚本进行主进程和渲染进程通信