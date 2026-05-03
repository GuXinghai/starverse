# Step 2 验收命令矩阵

本矩阵定义后续各阶段验收命令与口径。  
原则：优先使用仓库已有脚本；若阶段内命令未落地，需在该阶段开始时先确认命令名，不猜造不存在脚本。

## 1. 通用验收命令

优先命令（来自当前 `package.json`）：

- `npm run test`
- `npm run lint`
- `npm run lint:changed`
- `npm run build:worker`
- `npm run db:verify`
- `git diff --check`

通用补充检查：

- 指定测试：`npx vitest --run <paths...>`
- 路径/敏感日志扫描：`rg`
- 禁止项扫描：`rg`

若某阶段需要额外脚本，必须先在该阶段任务包中确认再执行。

## 2. Stage A 验收（路径日志护栏）

1. 修改文件范围检查  
   - `git diff --name-only`
2. 绝对路径日志扫描（示例）  
   - `rg -n "console\\.(log|warn|error).*([A-Za-z]:\\\\|/Users/|/home/|/mnt/)" src electron infra`
3. 相关测试或 grep 验证  
   - `npx vitest --run <涉及日志脱敏测试文件>`
4. 不涉及 file-type 实现模块扫描  
   - `rg --files src infra | rg "src/next/file-type"`（Stage A 期望无新增）

## 3. Stage B 验收（类型体系与 taxonomy）

1. `npm run test`（或最小相关测试集）
2. `npx vitest --run <taxonomy/descriptor 对应测试>`
3. FileFormatId 与 descriptor 对齐测试
4. SendRoute 与 labelCode 对齐测试
5. `git diff --check`

## 4. Stage C 验收（独立表 migration 与 repo）

1. migration 测试（新加）
2. repo 测试（新加）
3. schema 幂等测试（重复执行验证）
4. 不破坏既有 file asset 测试  
   - `npx vitest --run infra/db/worker.filePipeline.test.ts infra/db/repo/filePipelineRepo.test.ts`

## 5. Stage D 验收（轻量检测核心）

1. `magicDetector` 测试
2. `textProbe` 测试
3. `containerProbe` 测试
4. `evidenceMerge` 测试
5. `staticPolicy` 测试
6. `npm run lint:changed`

## 6. Stage E 验收（FileTypeService 与状态机）

1. `currentJobId` 写回测试
2. `fingerprint mismatch` 测试
3. `stale/cancelled` 测试
4. cache invalidation 测试
5. `git diff --check`

## 7. Stage F/G 验收（sendRouteMapping 与 sendPlanService 接入）

1. SendPlanCandidate 测试
2. 新旧判断对照测试（关键格式全覆盖）
3. sendPlanService 最终 gate 测试
4. 禁止长期双轨检查（替代矩阵核对 + 代码扫描）
5. 模型能力变化回归测试

## 8. Stage H 验收（UI 最小接入）

1. UI 不持有真实路径检查（grep + 测试）
2. UI 不直接按 extension 判断（grep）
3. 模型切换仅刷新路线/兼容性（交互测试）
4. warning/blocked 文案检查（不包含恶意判定语义）

## 9. Stage I 验收（fixture 回归）

1. `expected.json` 校验测试
2. adversarial 样本测试
3. 日志脱敏扫描
4. 大文件不阻塞 renderer 的间接检查（性能/异步行为测试）

## 10. 禁止项扫描

按阶段执行以下扫描（示例，可在阶段任务包中细化）：

1. 禁止提前出现 `src/next/file-type`（仅对 Stage A 生效）  
   - `rg --files src infra | rg "src/next/file-type"`
2. 禁止出现 `shell: true`（外部命令执行风险）  
   - `rg -n "shell\\s*:\\s*true" src infra electron`
3. 禁止打印 `contentToken` 原文  
   - `rg -n "contentToken" src infra electron | rg -n "log|warn|error"`
4. 禁止绝对路径日志  
   - `rg -n "console\\.(log|warn|error).*([A-Za-z]:\\\\|/Users/|/home/|/mnt/)" src infra electron`
5. 禁止 UI 直接按 extension 判断  
   - `rg -n "extension|mime" src/ui-app src/ui-kit | rg -n "if|switch"`

