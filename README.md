# Starverse

<div align="center">
  <h3>🌟 基于 Electron + Vue.js + Tailwind CSS 的现代化桌面应用</h3>
  <p>一个集成了 AI 对话功能的跨平台桌面应用</p>
</div>

## 🚀 技术栈

- **桌面框架**: Electron 30.x
- **构建工具**: Vite 5.x + electron-vite
- **前端框架**: Vue.js 3 (Composition API + `<script setup>`)
- **状态管理**: Pinia
- **样式框架**: Tailwind CSS 4.x
- **开发语言**: TypeScript
- **AI 集成**: Google Generative AI
- **包管理器**: npm

## 📁 项目结构

```
starverse/
├── electron/                   # Electron 主进程
│   ├── main.ts                 # 主进程入口
│   ├── preload.ts              # 预加载脚本（IPC 通信桥接）
│   └── electron-env.d.ts       # Electron 类型定义
├── src/                        # Vue.js 渲染进程
│   ├── components/             # Vue 组件
│   │   ├── ChatView.vue        # 聊天界面
│   │   ├── ChatTabs.vue        # 标签页管理
│   │   ├── ConversationList.vue # 对话列表
│   │   ├── ModelSelector.vue   # 模型选择器
│   │   ├── SettingsView.vue    # 设置面板
│   │   └── TabbedChatView.vue  # 多标签聊天视图
│   ├── stores/                 # Pinia 状态管理
│   │   ├── chatStore.js        # 聊天状态存储
│   │   └── index.ts            # Store 入口
│   ├── services/               # 业务逻辑层
│   │   └── geminiService.js    # Google Gemini API 服务
│   ├── types/                  # TypeScript 类型定义
│   ├── assets/                 # 静态资源
│   ├── App.vue                 # 根组件
│   ├── main.ts                 # 应用入口
│   └── style.css               # 全局样式（Tailwind CSS）
├── public/                     # 公共静态资源
├── docs/                       # 项目文档
├── dist-electron/              # Electron 构建输出
├── release/                    # 应用打包输出
├── .github/                    # GitHub 配置
├── .vscode/                    # VS Code 配置
├── electron.vite.config.ts     # Electron Vite 配置
├── vite.config.ts              # Vite 配置
├── tailwind.config.js          # Tailwind CSS 配置
├── tsconfig.json               # TypeScript 配置
└── electron-builder.json5      # Electron Builder 打包配置
```

## 🛠️ 开发环境设置

### 推荐的 IDE 配置

- [VS Code](https://code.visualstudio.com/)
- [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) - Vue.js 开发支持
- [TypeScript Vue Plugin](https://marketplace.visualstudio.com/items?itemName=Vue.vscode-typescript-vue-plugin)
- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss) - Tailwind 类名提示

## 🏃‍♂️ 快速开始

### 环境要求

- Node.js >= 16.x
- npm >= 8.x

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```

或使用快捷脚本（Windows）：
```bash
# PowerShell
.\start-dev.ps1

# CMD
start-dev.bat
```

### 构建生产版本
```bash
npm run build
```

### 可用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 构建生产版本并打包 Electron 应用 |
| `npm run preview` | 预览构建结果 |
| `npm run electron:dev` | 同时启动 Vite 和 Electron |
| `npm run dev:clean` | 清理进程后启动开发服务器 |

## 📦 项目特性

- ✅ **现代化技术栈**: Electron + Vite + Vue 3 + Tailwind CSS
- ✅ **TypeScript 支持**: 完整的类型安全开发体验
- ✅ **热重载 (HMR)**: 开发时自动刷新，提升开发效率
- ✅ **组件化开发**: Vue 3 Composition API + `<script setup>`
- ✅ **状态管理**: Pinia 轻量级状态管理
- ✅ **响应式设计**: Tailwind CSS 工具类优先的样式方案
- ✅ **AI 集成**: 集成 Google Generative AI (Gemini)
- ✅ **多标签聊天**: 支持多个聊天会话并行
- ✅ **本地存储**: electron-store 持久化配置和对话历史
- ✅ **跨平台**: Windows、macOS、Linux 全平台支持
- ✅ **安全架构**: contextIsolation + preload 脚本保证安全性

## 🛠️ 开发指南

### 推荐的 IDE 插件

- [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) - Vue.js 语言支持
- [TypeScript Vue Plugin](https://marketplace.visualstudio.com/items?itemName=Vue.vscode-typescript-vue-plugin) - Vue TypeScript 支持
- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss) - Tailwind 智能提示
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) - 代码检查

### 样式开发规范

- 优先使用 Tailwind CSS 工具类
- 避免编写自定义 CSS，充分利用 Tailwind 的设计系统
- 使用响应式类 (`sm:`, `md:`, `lg:`, `xl:`) 实现适配
- 自定义样式在 `tailwind.config.js` 中扩展

### Vue.js 开发规范

- 使用 Composition API 和 `<script setup>` 语法
- 所有组件使用 TypeScript 类型定义
- 使用 `ref()` 和 `reactive()` 进行响应式状态管理
- 通过 Pinia Store 管理全局状态

### Electron 安全最佳实践

- ✅ 启用 `contextIsolation`
- ✅ 禁用 `nodeIntegration`
- ✅ 通过 preload 脚本暴露安全的 API
- ✅ 使用 IPC 进行主进程和渲染进程通信

## 📚 核心功能

### AI 聊天
- 集成 Google Gemini AI 模型
- 支持多模型切换
- 流式响应输出
- 对话历史管理

### 多标签管理
- 创建多个独立聊天会话
- 标签页拖拽排序
- 关闭/恢复标签页

### 数据持久化
- 使用 electron-store 存储配置
- 聊天历史本地保存
- 跨会话状态恢复

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT License](LICENSE)

## 👨‍💻 作者

GuXinghai

## 🔗 相关链接

- [Electron 文档](https://www.electronjs.org/docs)
- [Vue.js 文档](https://vuejs.org/)
- [Tailwind CSS 文档](https://tailwindcss.com/)
- [Vite 文档](https://vitejs.dev/)
- [Pinia 文档](https://pinia.vuejs.org/)
