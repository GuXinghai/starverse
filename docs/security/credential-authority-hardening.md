# Starverse Credential Authority 加固方案

对于 Starverse 这种“个人 + AI Agent”维护模式，我建议把安全等级控制在一个工程上可长期维护的位置：**现阶段不要引入 Rust broker、Windows Service、macOS XPC、Linux daemon。先把 Electron main process 做成严格的 credential authority（凭据权威边界）**。

从当前 `main` 看，标准 provider 的 `Epoch2RuntimeCredentialService` 已经有按 provider 的串行队列、reentrancy（重入）禁止、`expectedRevision`、drift（漂移）检测和限定作用域的 `withCredential()` lease；这些边界可以复用。Phase 2A 已移除了把异步 `safeStorage` 和全局 scope-key envelope 当作唯一持久化根及启动依赖的耦合。

真正应该做的是把这个边界“封死”，同时把凭据可解密性从数据库可用性的判定中移出去。

### 我建议的落地等级

当前阶段先做到这一版：

```text
Renderer
   │
   │ update(newKey)
   │ status()
   │ clear()
   │
   ▼
Preload
   │
   │ IPC
   ▼
Electron Main
   │
   ├── CredentialAuthority
   │       │
   │       ├── OS-backed ciphertext
   │       ├── persisted non-secret credential scope ID
   │       └── lazy decrypt only for a provider operation
   │
   └── Provider Transport
             │
             │ plaintext Key
             │ only inside short-lived lease
             ▼
       Authorization header
             │
             ▼
           HTTPS
```

关键安全约束是：

```text
Renderer         不允许读取已保存 Key
Preload          不允许读取已保存 Key
普通 IPC         不允许读取已保存 Key
electron-store   默认只存密文；Linux 用户明确选择 plaintext 时可存明文，并由 owner-only 文件权限保护
Provider runtime 只有发送请求期间取得 Key
```

当前 renderer/main 边界、Phase 2A 启动解耦、Phase 3 单写者、Phase 4 compatible SQLite transaction 与 Phase 5 跨层安全回归均已落地；Linux packaged smoke 因当前没有 Linux 环境而单独待核验。

---

## 第一件事：直接删除 `reveal`（已完成）

这是最明确、收益最高的边界修改，已按只写秘密模式完成。

此前 `generationV2CredentialSettingsIpc.ts` 曾明确提供：

```text
generation-v2:credentials:*:reveal
```

handler 曾最终返回：

```ts
{
    ok: true,
    apiKey: lease.credential
}
```

也就是说安全存储解密出的 API Key 被重新送回 renderer。

Preload 也曾正式暴露：

```ts
reveal: () => ipcRenderer.invoke(`${prefix}:reveal`)
```

SettingsPanel 也曾把它写进五套 provider bridge 的 TypeScript contract。

现在 Credential UI 已改成经典的 **write-only secret（只写秘密）** 模式：

```text
OpenAI API Key

状态：● 已配置

[ 替换 API Key ]    [ 清除 ]
```

点击“替换”后出现一个**空白**密码输入框：

```text
新 API Key
[                         ]

[保存]
```

绝不把旧值填进去。

公开能力已由：

```ts
{
    getStatus()
    reveal()       // 删除
    update()
    clear()
}
```

收缩为：

```ts
{
    getStatus()
    update()
    clear()
}
```

这样日常启动、设置页面打开、切换 provider，都不会让 Key 进入 Chromium renderer。

只有用户第一次输入或主动替换 Key 的那几秒，renderer 中会暂时存在用户刚输入的新 Key。对于当前阶段，这是一个合理的 accepted boundary（接受边界）。

等未来真的上 native broker，再把“第一次输入 Key”也挪出 renderer。

---

## 第二件事：Phase 2A — OS-backed credential storage 与故障隔离

**决策：暂缓用户密码保险箱。** 标准 API Key 继续使用 Electron `safeStorage`（Windows 上由 DPAPI 支持）加密；当前优先级是把“DPAPI 是否可解密”从数据库完整性与应用启动判定中彻底移出。

Phase 2A 之前，全局 `epoch_scope_key_envelope_v2` 既是 scope 导出根，又在数据库创建、验证和 credential service 初始化时被解密。因此一个凭据基础设施故障会阻断数据库、历史记录及无凭据功能。Phase 2A 已取消该解密依赖；现有表仅保留为 schema 兼容所需的不透明 marker，不参与 scope 派生或启动解密。

本阶段的新不变量是：

> 数据库身份与 credential identity 不应依赖 credential decryptability（凭据可解密性）。

实现目标如下：

```text
创建或替换 credential
        ↓
randomBytes(32)
        ↓
credential-scope-v2:<hex>
        ↓
与 safeStorage ciphertext 一起持久化
```

标准 provider record 从固定字段的 v1 升级为包含持久化 `credentialScopeId` 的新版本。该 ID 是非秘密随机标识：同一 credential version 内稳定，替换凭据时生成新 ID；它不依赖 API Key、全局 epoch key 或 DPAPI。**不迁移旧 v1 record：升级检测到后直接删除，用户重新录入 API Key。**

应用启动只读取 credential metadata：`configured`、`credentialScopeId` 与持久化 revision；不解密任何 API Key，也不解密 `epoch_scope_key_envelope_v2`。只有实际 provider operation（例如 `withCredential()`、鉴权模型同步）才按需调用 `safeStorage` 解密对应凭据。

故障时必须保留密文和“已配置”事实：

```text
启动时只看到密文
→ configured = true, availability = unknown

某 provider 首次解密成功
→ availability = available

safeStorage/DPAPI 解密失败
→ configured = true, availability = unavailable
→ diagnostic = `EPOCH2_RUNTIME_CREDENTIAL_DECRYPT_FAILED`、`EPOCH2_RUNTIME_CREDENTIAL_SAFE_STORAGE_UNAVAILABLE`、`EPOCH2_RUNTIME_CREDENTIAL_STORAGE_UNAVAILABLE` 或 `EPOCH2_RUNTIME_CREDENTIAL_INVALID`
→ 保留原密文，不自动清除
```

因此 OpenAI 的密文无法解密时，历史聊天、数据库、设置页、本地模型和其他正常 provider 仍可使用；只有该 OpenAI 请求失败。设置页应显示“已保存，但当前无法由系统安全存储解密”，提供重新输入 API Key，而不是误显示为“未配置”。Linux 的 `basic_text` / `unknown` 不能被宣称为安全加密；遇到该 backend 必须 fail-closed 并给出准确提示。([Electron][1])

Linux 用户可在安全系统存储不可用时明确选择 session 或 plaintext；该行为由 [Linux Credential Storage Policy](./linux-credential-storage-policy.md) 定义，并按 [实施计划](./linux-credential-storage-implementation-plan.md) 落地。`basic_text`、`unknown` 与 backend 查询失败均 fail-closed；Linux packaged smoke 仍待具备 Linux 环境后核验，不得表述为已通过。

现阶段正式承诺写成：

> 当前默认安全存储路径不以明文持久化 API Key；API Key 不在正常运行中进入 renderer/preload，不通过 IPC 返回，不记录日志，不进入 Agent context；发送 provider 请求时仅在 Electron main process 的受限 credential lease 生命周期内短暂存在。Linux 显式 plaintext 是已实现的受控例外，只能由用户明确选择，不能自动触发，也不能放松 renderer、IPC、日志和 Agent 边界。

同时明确：

> 不承诺抵御以当前用户身份运行并具有进程内存读取或代码注入能力的恶意软件。

### 延后的密码恢复

密码恢复是 future hardening，不是当前 requirement。当前恢复契约是：保留无法解密的密文；用户可修复 OS secret store，或替换并重新录入受影响的 credential。

未来如确有跨设备迁移或 DPAPI 灾难恢复需求，采用单套 API Key 密文与双封装 master key，而不是维护每条 API Key 的 DPAPI 与密码双份密文：

```text
random master key
    ├── DPAPI envelope：正常自动解锁
    └── password-derived envelope：灾难恢复
          ↓
     AES-GCM encrypted API Keys
```

届时必须一并设计 KDF 参数、密码修改/遗忘、master-key rotation、恢复测试、备份导入导出与错误恢复；在这些需求真实出现前不引入该复杂度。

---

## 第三件事：保留标准 Provider 的生命周期，并先建立单 writer

这里我反而不建议为了“数据库听起来更高级”立即迁移。

`electron-store` 官方明确保证单次修改采用 atomic write（原子写入），进程在写文件过程中崩溃，不应留下半截 `config.json`。([GitHub][2])

因此标准 Key：

```text
OpenRouter
OpenAI
Google AI Studio
Anthropic
DeepSeek
```

仍然可以把版本化 `safeStorage` 密文和非秘密 credential metadata 保存在：

```text
safeStorage ciphertext + credentialScopeId
                ↓
          electron-store
```

而且这正好符合你的 Epoch-2 设计：它们属于 app-global credential（应用级凭据），工作区 reset 后仍需要保留。

当前 `storeIpc.ts` 会阻断标准凭据的 `providerCredentials` 命名空间，renderer 无法绕过 credential service 直接读取密文。Compatible 凭据已不再使用 `electron-store`；其 SQLite 表只由 Electron main 的 credential/repository authority 访问，普通 renderer store IPC 不存在对应读取路径。

这部分保持；新增 record version 或 metadata 字段也必须继续被同一阻断策略覆盖，不能通过普通 store IPC 暴露密文或内部 credential metadata。

但当前仓库只限制同一进程内重复打开 config store，尚未建立 Electron 应用单实例锁。因此在继续调整持久层前，需要先确保：

> 同一个 `userData` 根永远只有一个 credential writer。

因为 `electron-store` 底层这类 config store 明确不支持多个进程同时写同一个 store。([GitHub][3])

也就是说 packaged Starverse 应该有单实例写入权威：

```text
Starverse A
    │
    └── 获得应用实例锁
            ↓
       唯一 CredentialAuthority


Starverse B
    │
    └── 无法取得同一数据根的写入权
```

开发/E2E 可以通过独立 `userData` root 隔离。

这样你不需要给 `electron-store` 再实现一套复杂的跨进程 flock。

---

## 第四件事：统一写入并发控制，单独定义 lease 并发

标准 credential service 目前其实已经不错：

```ts
tails = new Map<ProviderCredentialKey, Promise<void>>()
```

同一个 provider 的操作排队，并且：

```ts
AsyncLocalStorage
```

禁止 credential operation 里面再次调用 credential operation，避免 reentrant deadlock（重入死锁）。再加上：

```text
expectedRevision
drift detection
```

这已经构成一套严格的单进程 credential mutation concurrency control（凭据变更并发控制）。`withCredential()` 不在整个 `consume()` 生命周期内持有 provider 写队列；它签发短期 lease，允许已开始的 provider 请求与后续凭据变更并行，并由 revision、scope 与 `assertCurrent()` 检测漂移。

问题在于另一套：

```text
OpenAICompatibleCredentialV2Service
```

没有复用它。

当前 compatible service 自己实现了 revision 和 drift 检测，但没有标准 service 那套 `tails + AsyncLocalStorage` 串行化。

因此先抽“凭据变更”公共 primitive，而不是直接复制整个 `withCredential()` 锁范围：

```text
electron/credentials/
    credentialMutationQueue.ts
```

概念 API：

```ts
exclusiveMutation(key, async () => {
    ...
})
```

然后：

```text
标准 Provider
    ↓
credentialMutationQueue

Compatible Provider
    ↓
credentialMutationQueue
```

`update`、`clear`、密码变更、迁移提交统一走该队列和 revision/CAS；`withCredential()` 则另外定义为“短临界区取得 lease + 活跃 lease 校验”，是否允许同一凭据并行发送要有独立测试，不能由写队列偶然决定。

本阶段采用的 lease 语义是：已签发 lease 可以完成已开始的 provider 请求；后续 `update` / `clear` 只影响新 lease，不会以等待网络请求或事后把已发送请求标成 drift 的方式伪造失败。显式调用 `lease.assertCurrent()` 仍可用于发送前的调用方校验。

这样以后 AI Agent 不会维护出两套略有差异的写入并发算法，也不会因为抽象复用而无意扩大网络请求的串行范围。

一个非常好的测试是：

```text
同时发起 100 个：

updateCredential(
    expectedRevision = 7
)
```

最终要求：

```text
只有一个能够从 revision 7 提交
其余得到 STALE_REVISION
最终 credential 完整
没有 hang
没有 lost update
```

---

## 第五件事：Compatible Provider 迁进 SQLite（已完成）

这是 credential authority 改造中最值得做的一件事，现已在受控开发环境按重置策略完成。

当前状态：OpenAI-Compatible 凭据已存于 `starverse.db` 的 `openai_compatible_credential_v2`；默认保存 `safeStorage` ciphertext BLOB 与非秘密 metadata，Linux 用户明确选择 plaintext 时保存明文 payload 并由 owner-only 文件权限保护。旧 `electron-store` compatible 凭据不迁移，开发数据库重置后用户重新录入。

### 历史路径（已移除）

此前 OpenAI-compatible 创建 provider 的流程跨了两个持久层：

```text
credentialService.write()
        ↓
electron-store

然后
        ↓
repo.create()
        ↓
SQLite
```

如果 SQLite 创建失败，代码会 best-effort：

```ts
credentialService.clear(...).catch(...)
```

来回滚。

正常异常可以处理。

但是突然：

```text
断电
kill -9
进程 crash
OS crash
```

发生在：

```text
credential 写成功
        ↓
     【崩溃】
        ↓
SQLite provider 尚未创建
```

就没有机会执行 catch。

于是产生 orphan credential（孤儿凭据）。

更新 endpoint 同样有这个跨存储问题；当前删除 provider 的 IPC 也只删除 SQLite provider，没有同步清理对应的 electron-store 凭据，因此孤儿记录不只可能由 crash 产生。

这里不必引入复杂 two-phase commit。

因为你的架构恰好允许一个很漂亮的解决方案：

**把 OpenAI-compatible 的密文记录放进 `starverse.db`。**

注意是：

```text
CredentialAuthority 生成的 `safeStorage` ciphertext
```

仍然是加密数据。

已实现表（清空后的 tombstone 保留 revision/CAS）：

```sql
openai_compatible_credential_v2

credential_version_ref   TEXT PRIMARY KEY
provider_instance_id     TEXT NOT NULL
ciphertext               BLOB
revision                 INTEGER NOT NULL
credential_scope_id      TEXT
updated_at_ms            INTEGER NOT NULL
configured               INTEGER NOT NULL
```

并建立：

```text
provider_instance_id
    ↓ FK
openai_compatible_provider_v2
```

这样创建 provider 时：

```text
1. renderer 提交 Key
2. main CredentialAuthority.prepareEncryptedRecord(...)
3. 得到 ciphertext
4. BEGIN IMMEDIATE

5. INSERT provider
6. INSERT credential
7. INSERT endpoint revision

8. COMMIT
9. 清零 ciphertext Buffer
```

这里最关键：

```text
CredentialAuthority.prepareEncryptedRecord()
```

发生在事务外，因为这一步不改变持久状态。

持久状态全部在：

```text
BEGIN
...
COMMIT
```

里面。

结果就变成：

```text
崩溃在 BEGIN 前
→ 旧状态

崩溃在 transaction 中
→ SQLite rollback

COMMIT 已完成
→ 新状态完整
```

创建、替换、清除和删除 provider 都必须由同一个 SQLite transaction authority 提交，不再需要：

```text
“先写 electron-store，
失败以后再试着删除”
```

这种 compensation（补偿事务）。

当前是受控开发阶段，compatible `electron-store` 密文**不迁移**：schema 变化按现有 reset/recreate 路径重置数据库，通用配置清洗会删除不受支持的旧字段；不保留专用启动兼容分支。新 SQLite schema 是唯一权威，用户重新录入 compatible 凭据。标准五个 app-global provider 的 `electron-store` 记录不受此决定影响。

而且这和你的现有数据生命周期正好契合：TP2 已经决定 compatible credentials 不属于 reset 后保留的那五个标准凭据。

所以最终形成一个非常干净的层级：

```text
标准五个 Provider
        │
        │ app-global
        │ 跨 workspace reset
        ▼
electron-store
+ safeStorage ciphertext


Custom / OpenAI-Compatible
        │
        │ workspace/provider scoped
        │ 随 V2 workspace 生命周期
        ▼
starverse.db
+ safeStorage ciphertext
```

这个我非常推荐。

---

## 第六件事：把安全不变量和回归测试贯穿各阶段

当前及目标 `withCredential()` 都会：

```text
safeStorage decrypt
        ↓
credential string
        ↓
lease
        ↓
provider transport
```

因此 API Key 会短暂存在 Electron main 的 JavaScript heap。

而且你的 TP2 文档已经准确承认了这一点：JavaScript plaintext string 无法可靠地在 GC 前擦除；可控的 `Buffer` 清零，但 JS string 属于 Electron API boundary。

这个 threat model 对现在的 Starverse 是合理的。Phase 2A 解决的是静态存储失败与数据库启动之间的耦合，不承诺让已经解锁并正在发送请求的主进程完全没有明文。

安全测试不是最后一个 PR 才补；每个阶段必须同时提交对应的定向回归测试，最后一阶段只做跨边界收口。它们进入现有测试体系，不新增 CI workflow、分支保护或独立门禁。

这一点对“个人 + AI Agent”维护模式尤其重要。

人类开发者记得“不要泄露 Key”，几个月后 Agent 很容易为了实现“显示 API Key”功能顺手再加：

```ts
reveal()
```

所以真正可靠的办法是让现有测试套件拒绝这种修改。

前四项已完成；第六项对应下列第 5 阶段的跨层安全回归收口：

| 阶段 | 内容 | 主要文件与验收 |
| --- | --- | --- |
| **1 — Credential Boundary Hardening（已完成）** | 删除所有 `reveal`；设置页改成只写替换 | `generationV2CredentialSettingsIpc.ts`、`preload.ts`、`SettingsPanel.vue`；公开桥接面测试 |
| **2A — OS-backed Storage Failure Isolation（已完成）** | 持久化随机 scope ID；取消数据库启动对 `safeStorage` / 全局 scope-key envelope 解密的依赖；lazy decrypt；旧 record 删除后重新录入；保留当前格式密文并隔离解密失败 | credential record、runtime service、epoch bootstrap、设置页；覆盖旧 record 删除、未解密启动、单 provider 解密失败与准确状态 |
| **3 — Credential Concurrency and Single Writer（已完成）** | 应用单实例；抽 `exclusiveMutation()`；明确 lease 并发，不扩大网络串行范围 | `credentialMutationQueue.ts`、两个 credential service、main bootstrap；覆盖并发 CAS 与多 lease |
| **4 — Compatible Credential Transaction（已完成）** | compatible `safeStorage` 密文迁入 SQLite；创建、替换、清除、删除与 metadata 同事务提交。当前受控开发阶段直接重置旧数据，不做 `electron-store` 迁移 | schema、repo、`openAICompatibleCredentialV2Service.ts`、`openAICompatibleV2Ipc.ts`；覆盖回滚、CAS、清空、删除与 lease |
| **5 — Security Regression Closeout（已完成）** | 已补 credential IPC/preload 只写公开契约、状态 IPC 无明文、`reveal` 调用消失、store 绕过、日志脱敏、Linux `basic_text` fail-closed、session/plaintext 与 Compatible SQLite 回归 | 自动化验收已完成；Linux packaged smoke 明确记为环境待核验，不伪装成通过。不会新增 CI 门禁 |

然后再增加几个非常简单、但对 AI Agent 很有效的 architecture tests（架构测试）：

```text
credential IPC channel 中禁止出现 ":reveal"

preload credential bridge 只能：
getStatus / update / clear

renderer 无 API 返回类型包含：
apiKey: string

credential plaintext/decrypt 操作只能出现在：
electron/credentials/**

providerCredentials.*
不能通过 electronStore IPC 读取

Linux basic_text / unknown
不得被标记为安全 OS 额外保护，也不得成为自动解锁后门

日志/错误对象
不得包含 credential / Authorization
```

这里优先测试公开契约和模块边界，避免依赖脆弱的全仓文本扫描。

---

### 最终我建议的 Starverse 方案

当前不要做：

```text
Windows Service
macOS XPC
Linux credential daemon
Rust broker
```

先做到：

```text
                   ┌──────────── Renderer
                   │             no persisted secret
                   │
                   ▼
              restricted IPC
                   │
                   ▼
        Electron Main Credential Authority
              │                │
              │                ├─ concurrency authority
              │                ├─ revision / drift
              │                └─ no reveal
              │
       ┌──────┴─────────┐
       │                │
Standard providers    Compatible providers
       │                │
electron-store       SQLite
       │                │
safeStorage          safeStorage
ciphertext           ciphertext
       │                │
       └────────┬───────┘
                │
          withCredential()
                │
       short-lived plaintext
                │
          Provider transport
                │
              HTTPS
```

这是我认为最适合目前 Starverse 规模的平衡点：**不引入新的语言、三套 native 服务或密码恢复保险箱，却已经能覆盖磁盘明文、renderer 泄露、普通 IPC 泄露、DPAPI 故障外溢、写入损坏、同进程竞争、跨存储事务中断和 AI Agent 回归等主要风险。**

等将来出现“第三方不可信插件能够执行代码”“Agent 获得广泛本机执行权限”“需要明确抵御同用户进程读取 main memory”等需求，再把 `CredentialAuthority` 的接口原样搬到独立 Rust broker；因为边界已经提前设计好了，那时迁移会比现在直接上 broker 容易得多。

[1]: https://www.electronjs.org/docs/latest/api/safe-storage?utm_source=chatgpt.com "safeStorage | Electron"
[2]: https://github.com/sindresorhus/electron-store?utm_source=chatgpt.com "GitHub - sindresorhus/electron-store: Simple data persistence for your Electron app or module - Save and load user preferences, app state, cache, etc · GitHub"
[3]: https://github.com/sindresorhus/conf?utm_source=chatgpt.com "GitHub - sindresorhus/conf: Simple config handling for your app or module · GitHub"
