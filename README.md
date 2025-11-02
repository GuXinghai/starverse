# Starverse - Electron + Vue.js + Tailwind CSS 桌面应用

这是一个使用现代技术栈开发的跨平台桌面应用项目。

## 🚀 技术栈

- **桌面框架**: Electron 30.5.1
- **构建工具**: electron-vite
- **前端框架**: Vue.js 3 (Composition API)
- **样式框架**: Tailwind CSS 3.x
- **开发语言**: TypeScript
- **包管理器**: npm

## 📁 项目结构

```
├── electron/               # Electron 主进程和预加载脚本
│   ├── main.ts             # 主进程入口
│   └── preload.ts          # 预加载脚本
├── src/                    # 渲染进程源码 (Vue.js 应用)
│   ├── components/         # Vue 组件
│   ├── assets/             # 静态资源
│   ├── style.css           # 全局样式 (Tailwind CSS)
│   └── main.ts             # 应用入口
├── public/                 # 公共资源
├── dist/                   # 构建输出目录
├── tailwind.config.js      # Tailwind CSS 配置
├── postcss.config.js       # PostCSS 配置
└── vite.config.ts          # Vite 配置
```

## 🛠️ 开发环境设置

### 推荐的 IDE 配置

- [VS Code](https://code.visualstudio.com/)
- [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) - Vue.js 开发支持
- [TypeScript Vue Plugin](https://marketplace.visualstudio.com/items?itemName=Vue.vscode-typescript-vue-plugin)
- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss) - Tailwind 类名提示

## 🏃‍♂️ 快速开始

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```

### 构建生产版本
```bash
npm run build
```

### 预览构建结果
```bash
npm run preview
```

## 🎨 Tailwind CSS 集成

项目已完全集成 Tailwind CSS，您可以：

- 使用所有 Tailwind 工具类进行快速样式开发
- 利用响应式设计类 (`sm:`, `md:`, `lg:`, `xl:`)
- 使用 Tailwind 的暗色模式支持
- 在 `tailwind.config.js` 中自定义配置

## 📦 项目特性

- ✅ **现代化技术栈**: Electron + Vite + Vue 3 + Tailwind CSS
- ✅ **TypeScript 支持**: 完整的类型安全
- ✅ **热重载**: 开发时自动刷新
- ✅ **组件化开发**: Vue 3 Composition API
- ✅ **响应式设计**: Tailwind CSS 工具类
- ✅ **跨平台**: Windows、macOS、Linux 支持
