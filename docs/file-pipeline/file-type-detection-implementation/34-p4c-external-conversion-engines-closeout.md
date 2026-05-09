# P4-C Closeout: External Conversion Engine Contracts

Status: **P4-C completed with follow-ups — closeout pending external audit**

## 1. 阶段定位

P4-C 是 Phase 4 的第三个子阶段，在 P4-A（官方限定插件市场最小闭环）和 P4-B（Magika official managed plugin）基础上，实现了 Tika、LibreOffice、ffprobe、Pandoc 四个外部转换引擎的 fake runner / contract 定义和 route mapping candidate integration。

**P4-C 不代表 Phase 4 completed**，也不代表真实外部转换引擎已完成。

## 2. 交付物总览

### 2.1 Commits (4 个)

| # | Hash | Message | 内容 |
|---|------|---------|------|
| 1 | `e3fc7c9` | feat(file-type): add libreoffice conversion contract for P4-C3 | LO runner + 23 tests + doc |
| 2 | `dfe7826` | feat(file-type): add ffprobe metadata contract for P4-C4 | ffprobe runner + 20 tests + doc |
| 3 | `57ec385` | feat(file-type): add pandoc conversion contract for P4-C5 | Pandoc runner + 18 tests + doc |
| 4 | `d251846` | feat(file-type): wire conversion engine availability into route candidates | sendRouteMapping integration + 11 new tests + doc |

### 2.2 补充 Commits (P4-C2)

| # | Hash | Message | 内容 |
|---|------|---------|------|
| — | `4ab30cd` | feat(file-type): implement p4c2 tika fake runner contract | Tika runner + 21 tests + doc |
| — | `d505099` | security(file-type): metadata allowlist null semantics + p4c2+ | null = block all semantics fix |

### 2.3 新增文件 (10 个)

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/next/file-type/libreOfficeRunner.ts` | ~260 | LO fake runner contract |
| `src/next/file-type/libreOfficeRunner.test.ts` | ~480 | 23 tests |
| `src/next/file-type/ffprobeRunner.ts` | ~290 | ffprobe fake runner contract |
| `src/next/file-type/ffprobeRunner.test.ts` | ~440 | 20 tests |
| `src/next/file-type/pandocRunner.ts` | ~200 | Pandoc fake runner contract |
| `src/next/file-type/pandocRunner.test.ts` | ~370 | 18 tests |
| `docs/.../30-p4c3-libreoffice-conversion-contract.md` | — | P4-C3 doc |
| `docs/.../31-p4c4-ffprobe-metadata-contract.md` | — | P4-C4 doc |
| `docs/.../32-p4c5-pandoc-conversion-contract.md` | — | P4-C5 doc |
| `docs/.../33-p4c6-route-conversion-candidate-integration.md` | — | P4-C6 doc |

### 2.4 修改文件 (2 个)

| 文件 | 修改内容 |
|------|---------|
| `src/next/file-type/sendRouteMapping.ts` | `converted_pdf` engine gate + lint |
| `src/next/file-type/sendRouteMapping.test.ts` | 11 new engine-specific tests |

## 3. Runner Contracts 对比

| 引擎 | Runner 文件 | 测试数 | 错误码数 | 操作模式 |
|------|-----------|--------|---------|---------|
| Tika | `tikaRunner.ts` | 23 | 6 | detect / extract_text / metadata / combined |
| LibreOffice | `libreOfficeRunner.ts` | 23 | 9 | pdf / text / html / markdown conversion |
| ffprobe | `ffprobeRunner.ts` | 20 | 6 | video/audio metadata probe |
| Pandoc | `pandocRunner.ts` | 18 | 10 | markdown / plain / html conversion |

**P4-C runner 测试总计**: 84 tests (23+23+20+18)

## 4. Route Mapping Integration (P4-C6)

Engine gate 映射表：

| Route | Engine Flag | 来源引擎 |
|-------|-----------|---------|
| `extracted_text` | `textExtraction` | Tika |
| `converted_markdown` | `documentConversion` | Tika / LibreOffice / Pandoc |
| `converted_plain_text` | `documentConversion` | Tika / LibreOffice / Pandoc |
| `converted_pdf` | `documentConversion` | LibreOffice (新增 gate) |
| `converted_csv` / `converted_tsv` | `spreadsheetConversion` | LibreOffice |
| `rendered_images` | `renderedImages \|\| presentationConversion` | LibreOffice |
| `extracted_audio` | `audioExtraction` | ffprobe |
| `selected_frames` | `frameSelection` | ffprobe |

## 5. 未提交 / 未实现的真实 Runtime

| 引擎 | 未提交内容 |
|------|----------|
| Tika | 未提交 `tika-app.jar` |
| LibreOffice | 未提交 LibreOffice binary / installer |
| ffprobe | 未提交 ffprobe / ffmpeg binary |
| Pandoc | 未提交 Pandoc binary |

**所有 runner 均为 fake/contract 或 candidate integration。**

## 6. 未新增的 Package 依赖

- `package.json` / `package-lock.json` 无修改。
- 无新增 `@tensorflow/tfjs` / `tika` / `libreoffice` / `ffprobe` / `pandoc` 依赖。

## 7. 综合验收

### 7.1 测试

```
npx vitest --run src/next/file-type/tikaRunner.test.ts → 23/23
npx vitest --run src/next/file-type/libreOfficeRunner.test.ts → 23/23
npx vitest --run src/next/file-type/ffprobeRunner.test.ts → 20/20
npx vitest --run src/next/file-type/pandocRunner.test.ts → 18/18
npx vitest --run src/next/file-type/sendRouteMapping.test.ts → 21/21
npx vitest --run src/next/file-type/externalEngineAvailability.test.ts → 3/3
npx vitest --run src/next/file-type/externalProcessPolicy.test.ts → 12/12
——————————————————————————————————————————————————————————————————
Total: 120/120 pass across 7 suites
```

### 7.2 TS / Lint / DB

```
npx tsc --noEmit → 17 pre-existing, 0 new
npm run lint:changed → clean
npm run db:verify → 13/13 pass
git diff --check → clean
```

### 7.3 Grep 扫描

| 扫描 | 结果 |
|------|------|
| `provider_file_ref` in source (non-docs) | 0 hits |
| `contentToken` in new files | 0 hits (pre-existing redaction only) |
| `fullHash` in new files | 0 hits (pre-existing redaction only) |
| `Phase 4 completed` / improper claims | 0 hits in new docs |
| New deps in package.json | 0 hits |

### 7.4 未修改的禁止区域

- `sendPlanService.ts` — 未修改
- `derivativeJobService.ts` — 未修改
- `appChatApp.logic.ts` — 未修改
- OpenRouter 文件 — 未修改
- DB schema — 未修改

## 8. 手工烟测清单

| # | 场景 | 引擎 | 环境要求 |
|---|------|------|---------|
| 1 | 无任何引擎安装时上传 docx | Tika | 无 |
| 2 | Tika available 后 extracted_text route 可用 | Tika | — |
| 3 | Tika/LibreOffice/Pandoc 全 disabled 时 documentConversion blocked | all | — |
| 4 | Executable 文件始终 blocked（引擎全可用） | all | — |
| 5 | 引擎 disabled/re-enabled 后 candidiate 实时刷新 | all | — |
| 6 | LOG 不泄绝对路径/contentToken/fullHash | all | grep 扫描 |

## 9. Follow-ups (到 P4-D / 后续)

1. 真实 Tika / LibreOffice / ffprobe / Pandoc runtime 打包与签名
2. `converted_pdf` route 实际纳入 document format routes
3. Pandoc Lua filter / external resource policy 在真实 runtime 中验证
4. LibreOffice macro scan 在真实 runtime 中集成
5. ffprobe selected_frames / audio extraction 真实管线
6. 完整手工烟测（需真实 runtime 环境）
7. `provider_file_ref` 继续延期
8. legacy message_asset destructive cleanup 继续延期 as per Phase 2 规划

## 10. 是否允许进入 P4-D

**P4-C completed with follow-ups**。允许进入 P4-D final acceptance planning，但需先通过外部审计（Gemini CLI or Owner review）。

**P4-C closeout pending external audit.**
