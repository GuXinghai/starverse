# P4-C6：Route Mapping / Conversion Candidate Integration

Status: **implementation completed**

## 1. 非 P4-C completed

**P4-C6 不是 P4-C completed**。P4-C7 待实施。

## 2. 目标

1. 将 P4-C1~C5 的 capabilities 与 sendRouteMapping / conversion candidate 边界对齐。
2. 不改 sendPlanService 主逻辑。
3. 不接 OpenRouter。
4. 不接真实 conversion job execution。
5. 不重构 derivativeJobService。
6. 只做 candidate / engine gate / requiresJob / requiresEngineIds / blockedBy / warnings 的最小联动。

## 3. 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/next/file-type/sendRouteMapping.ts` | `evaluateEngineGate` 增加 `converted_pdf` 映射到 `documentConversion`；lint supressions |
| `src/next/file-type/sendRouteMapping.test.ts` | 新增 11 个 engine-specific 测试（从 9 个扩大到 21 个）；新增 `engineAvailabilityWith` helper |

## 4. Engine Gate 映射表

| Route | Engine Flag | 依赖引擎 |
|-------|-----------|---------|
| `converted_markdown` | `documentConversion` | Tika / LibreOffice / Pandoc |
| `converted_plain_text` | `documentConversion` | Tika / LibreOffice / Pandoc |
| `converted_pdf` | `documentConversion` | LibreOffice primarily (新增) |
| `converted_csv` / `converted_tsv` | `spreadsheetConversion` | LibreOffice |
| `rendered_images` | `renderedImages \|\| presentationConversion` | LibreOffice |
| `extracted_text` | `textExtraction` | Tika |
| `extracted_audio` | `audioExtraction` | ffprobe |
| `selected_frames` | `frameSelection` | ffprobe |

## 5. 新增测试 (11 new, 21 total)

| # | 测试 | 覆盖引擎 |
|---|------|---------|
| 1 | blocks extracted_text when textExtraction is unavailable | Tika |
| 2 | unlocks extracted_text when textExtraction is available | Tika |
| 3 | blocks converted_markdown when documentConversion is unavailable | Tika/LibreOffice/Pandoc |
| 4 | unlocks converted_markdown when documentConversion is available | Tika/LibreOffice/Pandoc |
| 5 | blocks selected_frames when frameSelection is unavailable | ffprobe |
| 6 | blocks extracted_audio when audioExtraction is unavailable | ffprobe |
| 7 | blocks rendered_images when both flags are unavailable | LibreOffice |
| 8 | executable files stay blocked even when all engines are available | all |
| 9 | does not mutate verdict when engine availability affects candidates | all |
| 10 | accepts registry envelope with real engine availability gating documentConversion | Tika/LibreOffice/Pandoc |
| 11 | accepts registry envelope with tika alone unlocking both routes | Tika |
| 12 | accepts registry envelope with only pandoc providing documentConversion | Pandoc |
| (9 pre-existing) | | |

## 6. 安全保证

- Engine availability 只影响 `SendPlanCandidate.compatible` 和 `blocked`，不污染 `FileTypeVerdict`
- `policy.blocked` 优先级高于 engine availability（line 73-75：blocked verdict 直接返回 blocked candidate）
- Executable / polyglot-suspected 文件即使所有引擎可用也始终 blocked
- 不修改 sendPlanService / derivativeJobService / appChatApp.logic.ts
- 不接真实 conversion execution
- 无路径/contentToken/fullHash 泄露

## 7. 验收

```
npx vitest --run src/next/file-type/sendRouteMapping.test.ts → 21/21 pass
npx vitest --run src/next/file-type/externalEngineAvailability.test.ts → 3/3 pass
npx vitest --run src/next/file-type/evidenceMerge.test.ts → 5/5 pass
npx tsc --noEmit → 17 pre-existing, 0 new
npm run lint:changed → clean
git diff --check → clean
```

## 8. Non-goals

- 不改 sendPlanService 主逻辑
- 不接 OpenRouter
- 不接真实 conversion job execution
- 不重构 derivativeJobService
- 不新增 conversion candidate 类型
- 不修改 detectBasic / detectFull 主逻辑
