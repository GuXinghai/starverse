# ADR-001: 为什么选择 Electron 作为桌面应用框架

**状态**: 已接受  
**日期**: 2024-08-15  
**决策者**: @GuXinghai

## 背景

Starverse 需要开发一个跨平台的桌面应用，用于AI对话管理，支持分支化对话、本地数据存储和多提供商AI集成。需要选择一个合适的桌面应用开发框架。

### 需求分析

- ✅ **跨平台支持**: Windows、macOS、Linux
- ✅ **丰富的UI能力**: 支持复杂的聊天界面、Markdown渲染、代码高亮
- ✅ **本地数据访问**: 需要访问文件系统和本地数据库（SQLite）
- ✅ **快速开发**: 团队有Web开发经验，希望复用现有技能
- ✅ **生态系统**: 需要丰富的第三方库支持（Markdown、语法高亮等）

## 决策

选择 **Electron** 作为桌面应用框架，配合 Vue.js 3 进行开发。

## 理由

### 考虑的替代方案

#### 1. Tauri（Rust + Web技术）

**优点**:
- 包体积小（约10MB vs Electron的50-100MB）
- 内存占用低（约100MB vs Electron的300-500MB）
- 更高的安全性（Rust编写，无Node.js运行时）
- 原生性能更好

**缺点**:
- ❌ 生态系统不成熟（2023年才发布1.0）
- ❌ 社区资源少，遇到问题难以找到解决方案
- ❌ 需要学习Rust，团队无相关经验
- ❌ 第三方库兼容性问题（部分Node.js库无法使用）
- ❌ 不支持Worker Threads（影响数据库性能优化）

#### 2. Flutter Desktop

**优点**:
- 高性能（原生渲染）
- 统一代码库（桌面+移动）
- 美观的Material Design

**缺点**:
- ❌ Web技术栈无法复用
- ❌ Markdown渲染和代码高亮需要自己实现
- ❌ 团队无Dart经验
- ❌ 桌面版仍在Beta阶段
- ❌ 不适合复杂的文本编辑和内容渲染

#### 3. Qt/PyQt

**优点**:
- 成熟稳定的框架
- 真正的原生应用
- 性能优秀

**缺点**:
- ❌ C++或Python学习成本高
- ❌ UI开发效率低（相比Web技术）
- ❌ 缺少现代Web生态（Markdown、语法高亮等）
- ❌ 团队无相关经验

### 选择 Electron 的理由

#### 技术优势

1. **Web技术栈复用**
   - 团队有Vue.js、TypeScript经验，可立即开始开发
   - 丰富的NPM生态系统（marked、highlight.js、katex等）
   - 现代化的开发工具链（Vite、Vitest、Storybook）

2. **强大的UI能力**
   - Chromium渲染引擎，支持复杂的Markdown和代码高亮
   - CSS灵活布局（Tailwind CSS）
   - Vue组件化开发，易于维护

3. **成熟的生态系统**
   - 大量成功案例（VS Code、Slack、Discord、Figma等）
   - 丰富的文档和社区支持
   - electron-builder等完善的构建工具

4. **Node.js集成**
   - 完整的文件系统访问
   - 支持better-sqlite3等原生模块
   - **支持Worker Threads**，可将数据库操作隔离到独立线程

5. **安全机制**
   - contextIsolation + preload脚本实现安全隔离
   - 可禁用nodeIntegration，防止远程代码执行
   - 明确的安全最佳实践

#### 业务优势

1. **快速迭代**: 无需学习新语言，可快速交付MVP
2. **维护成本低**: Web开发人员即可维护，不需要桌面开发专家
3. **跨平台一致性**: 一套代码，三个平台表现一致
4. **易于调试**: Chrome DevTools，调试体验优秀

### 为什么不选择 Tauri？

尽管Tauri在包体积和性能上有优势，但：
- **生态不成熟**是最大风险（2024年仍在快速变化）
- **Worker Threads缺失**影响数据库性能优化
- **学习成本**不符合快速迭代需求
- **社区资源少**，遇到问题解决成本高

**结论**: Tauri适合对包体积极度敏感的项目，但Starverse更看重开发效率和稳定性。

## 后果

### 积极影响

✅ **开发效率高**: 1个月内完成MVP，2个月达到Beta质量  
✅ **稳定可靠**: 利用成熟的Electron生态，很少遇到框架层面的Bug  
✅ **性能可接受**: 通过Worker Threads优化，长对话性能良好  
✅ **易于招聘**: Web开发人员即可贡献代码

### 消极影响

❌ **包体积大**: 约80MB（已通过asar压缩和UPX优化）  
❌ **内存占用高**: 约300-500MB（通过虚拟滚动和缓存优化）  
❌ **启动速度慢**: 约2-3秒（可接受）

### 缓解措施

1. **包体积优化**
   - 使用asar打包（减少30%体积）
   - UPX压缩可执行文件
   - Tree shaking去除未使用代码

2. **性能优化**
   - Worker Threads隔离数据库操作
   - 虚拟滚动减少DOM节点
   - 增量序列化优化保存速度

3. **内存优化**
   - computed缓存计算结果
   - 防抖节流减少不必要的计算
   - 及时清理不需要的对象引用

## 替代决策触发条件

如果未来出现以下情况，可考虑迁移到其他框架：
- Tauri生态成熟且支持Worker Threads
- 包体积成为用户流失的主要原因
- Electron停止维护或出现重大安全问题

## 参考资料

- [Electron官方文档](https://www.electronjs.org/docs)
- [Electron安全最佳实践](https://www.electronjs.org/docs/latest/tutorial/security)
- [VS Code为什么选择Electron](https://code.visualstudio.com/blogs/2016/11/14/electron-1.4.6)
- [Tauri vs Electron对比](https://tauri.app/v1/references/benchmarks/)
- [项目架构总览](../architecture/overview.md)

---

**相关决策**:
- [ADR-002: 为什么选择 Vue 3](002-why-vue3.md)
- [ADR-003: 为什么使用 SQLite + Worker 线程](003-sqlite-worker-thread.md)
