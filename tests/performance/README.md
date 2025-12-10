# Performance Tests

本目录包含性能测试脚本。

## 📁 测试文件

### 粘贴性能测试
- **paste-performance-test.js** - 测试大文本粘贴操作的性能
- 测量输入框处理粘贴内容的延迟
- 用于验证 [PASTE_PERFORMANCE_ANALYSIS.md](../../docs/archive/analysis/PASTE_PERFORMANCE_ANALYSIS.md) 中的优化成果

### 保存优化测试
- **save-optimization-test.js** - 测试数据保存操作的性能
- 测量 IPC 通信和数据序列化的开销
- 用于验证 [SAVE_OPTIMIZATION_SUMMARY.md](../../docs/SAVE_OPTIMIZATION_SUMMARY.md) 中的优化策略

## 🚀 运行测试

```bash
# 运行粘贴性能测试
node tests/performance/paste-performance-test.js

# 运行保存优化测试
node tests/performance/save-optimization-test.js
```

## 📊 测试报告

测试结果应记录在对应的文档中：
- 粘贴性能问题 → `docs/archive/analysis/PASTE_PERFORMANCE_ANALYSIS.md`
- 保存优化成果 → `docs/SAVE_OPTIMIZATION_SUMMARY.md`

## 🔗 相关文档

- [../../docs/archive/analysis/](../../docs/archive/analysis/) - 性能分析报告
- [../../docs/archive/optimizations/](../../docs/archive/optimizations/) - 优化实现记录
- [../../docs/CHAT_MULTITHREADING_PERFORMANCE_GUIDE.md](../../docs/CHAT_MULTITHREADING_PERFORMANCE_GUIDE.md) - 多线程性能指南

---

**注意**: 这些脚本从 `docs/` 目录迁移而来（2025年12月6日），作为文档规范化的一部分。
