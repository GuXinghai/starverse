# models.dev capability resolution 调查交付包

生成日期：2026-08-26  
用途：保存本轮 provider API、models.dev 和本地模型发现的原始字段、来源信息、比较摘要与最终评估。

## 文件

- `final-evaluation-report.md`：完整评估报告。它区分已测试事实、历史材料、待核验事项和候选架构，不代表 Owner 已冻结或生产代码已完成接入。
- `raw-model-fields.json`：原始字段 bundle。保存已归档的 DeepSeek/OpenAI/Google API response、当前 OpenRouter 公共 response、当前 models.dev 相关 provider records、当前 Ollama response、当前 LM Studio 可达性结果、Generic Local 发现契约，以及脱敏的 OpenRouter credential-scoped observation。
- `source-documents/`：专题原有 README、01–05 文档和源 DOCX 的副本，作为分析上下文和 provenance 入口。

## 时间与 freshness

- DeepSeek、OpenAI、Google API 原始快照来自 2026-08-04；它们不是 2026-08-26 的 live 状态。
- OpenRouter 公共 API、models.dev 和 Ollama 的采集时间写在 `raw-model-fields.json` 的 `generatedAt` 和每个 source observation 中。
- LM Studio 之前测试时成功返回 14 个模型；本次打包时 `127.0.0.1:1234` 不可达，因此 JSON 保存的是当前不可达 observation，不伪造当天 raw model payload。

## 安全边界

包内不包含 API Key、credential secret、Authorization header 或完整 credential-scoped OpenRouter `/models/user` payload。该 endpoint 的原始 JSON 没有持久化，只保留脱敏的状态、模型数、顶层字段、字段并集和公共列表的精确集合比较结果。

## 事实边界

本包的 raw model facts 不是 Starverse 最终 capability authority：

1. 模型 ID 取各来源并集，但 models.dev 不创建 endpoint/credential availability；
2. 来源缺字段保留为 missing/unknown，不自动写成 unsupported；
3. 同名但语义或类型不同的字段不强行合并；
4. requested model 与 provider response model 分开记录；
5. 本轮没有接入 models.dev 生产代码，没有添加规则，也没有把烟测写入规则。

