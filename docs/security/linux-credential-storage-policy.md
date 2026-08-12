# Linux Credential Storage Policy

> 状态：已实施（Linux packaged smoke 待具备 Linux 环境后核验）。具体顺序与验收见 [Linux Credential Storage Implementation Plan](./linux-credential-storage-implementation-plan.md)；全局安全边界见 [Credential Authority 加固方案](./credential-authority-hardening.md)。

Starverse 的 Linux 凭据方案不做额外故障排查、不做高级选项、不自动降级，但允许开发者明确选择仅本次运行或明文持久化。

Electron 官方确认 Linux 没有可用 secret store 时可能落到 `basic_text`，这种情况下数据没有真正的安全保护；可以用 `getSelectedStorageBackend()` 识别。异步 `safeStorage` 则支持 Secret Service/Portal 等 Linux provider。([Electron][1]) VS Code 遇到安全存储不可用时实际会退到内存，并允许用户主动选择 weaker encryption，而不是直接禁用 Secret Storage。

## 一、最终支持三种存储模式

Linux 下 Starverse 只承认三种 credential storage：

```ts
type LinuxCredentialBackend =
  | 'system_secure'
  | 'session'
  | 'plaintext'
```

对应含义：

| 模式              |              Key 是否落盘 | 重启后保留 | 安全性      |
| --------------- | --------------------: | ----: | -------- |
| `system_secure` |    是，`safeStorage` 密文 |     是 | 推荐       |
| `session`       | 否，只在 Electron main 内存 |     否 | 安全降级     |
| `plaintext`     |                是，直接保存 |     是 | 用户明确接受风险 |

不增加第四种“basic_text backend”。

如果 Electron 返回：

```text
basic_text
```

Starverse 将其解释成：

```text
system_secure 不可用
```

然后让用户选择 `session / plaintext / cancel`。

尤其不调用 `safeStorage.setUsePlainTextEncryption()` 把它包装成某种“加密存储”。既然 Electron 自己已经明确说明这种 backend 实质上不提供安全保护，Starverse 直接称为“明文存储”更容易理解和审计。([Electron][1])

---

## 二、正常情况下完全无感

启动 Starverse 后，在第一次需要判断 credential backend 时检测 Linux 安全存储。

例如：

```text
gnome_libsecret
kwallet
kwallet5
kwallet6
Portal / Secret Service 等安全异步 provider
```

可用时：

```text
system_secure
```

用户正常添加 API Key：

```text
OpenAI
未配置 | 添加
```

点击添加：

```text
API Key [••••••••••]

[保存] [取消]
```

保存成功：

```text
OpenAI
已配置 · 系统安全存储 | 替换 | 清除
```

不弹任何额外提示。

这是默认路径。

---

## 三、安全存储不可用时的核心交互

用户输入 Key 并点击保存以后，如果发现：

```text
safeStorage 不可用
或
backend = basic_text
```

只弹一个对话框：

> **Linux 系统安全存储不可用**
>
> Starverse 当前无法使用系统密钥环安全保存此 API Key。
>
> 你可以仅在本次运行中使用该凭据，或明确选择将其以明文形式保存到 Starverse 本地数据中。
>
> **警告：明文保存意味着任何能够以当前 Linux 用户权限读取 Starverse 数据文件的程序，都可能直接取得此 API Key。请勿在共享账户、不受信任的系统或可能已被恶意软件控制的环境中使用此选项。**

三个并列按钮：

```text
[仅本次运行]   [明文保存]   [取消]
```

不做：

```text
高级选项
故障排除
重新检测
安装 libsecret
打开帮助
```

也不需要第二次确认。

对开发者工具而言，一次足够严厉且准确的确认即可。

---

## 四、选择“仅本次运行”

Key 进入：

```text
Electron main
    ↓
sessionCredentialMap
```

不发生任何持久写入。

状态：

```text
OpenAI
已配置 · 仅本次运行 | 替换 | 清除
```

Starverse 退出：

```text
sessionCredentialMap
→ 消失
```

下次启动：

```text
无持久凭据时 → 未配置
存在被临时覆盖的持久凭据时 → 恢复该持久凭据的状态
```

这正是 VS Code 在 encryption unavailable 时采用 `InMemoryStorageService` 的核心思路。

session Key 同样不能进入 renderer。

流程依然是：

```text
renderer
   │
   │ 新 Key，仅保存操作期间
   ▼
IPC
   ▼
CredentialAuthority
   ▼
session map
   ▼
withCredential()
   ▼
provider transport
```

保存成功后 renderer 输入框立即清空。

---

## 五、选择“明文保存”

这里真正持久化：

```text
backend = plaintext
credential = 原始 API Key
```

而不是：

```text
safeStorage(basic_text)
```

状态永远明确：

```text
OpenAI
已配置 · 明文存储 | 替换 | 清除
```

不要只显示：

```text
已配置
```

否则用户几个月后已经不知道这个 Key 是怎么保存的。

GitHub CLI 目前 keyring 保存失败后会回退到 config 并明确打印凭据以明文保存的警告；VSCE 也是 keytar 失败后退到 `0600` 文件并打印 warning。

Starverse 与它们相比唯一更严格的一点是：

> **不自动降级。**

必须由用户亲手点击：

```text
明文保存
```

之后才能写。

---

## 六、plaintext 仍要有 Unix 文件权限

“明文”不意味着随便保存。

至少保持：

```text
Starverse 数据目录：0700
credential 所在文件：0600
SQLite 数据库：限制当前用户访问
```

它们提供的是 Unix DAC（自主访问控制），不是 credential encryption（凭据加密）。

所以安全声明应该非常明确：

```text
防其他普通系统用户直接读取
≠
防当前用户权限下的恶意进程
```

这一点和 OpenCode 的 `0600 auth.json` 类似。

但不要在 UI 里展开这些技术细节；警告里的“当前 Linux 用户权限”已经足够准确。

---

## 七、已有安全凭据突然打不开

这是另一个场景，不能和“第一次保存”混为一谈。

假设昨天：

```text
OpenAI
backend = system_secure
```

今天 GNOME Keyring/KWallet 不可用。

Starverse 启动仍然正常，因为 Phase 2A 已经要求启动不解密所有 Key。此时显示：

```text
OpenAI
已配置 · 系统安全存储不可用

EPOCH2_RUNTIME_CREDENTIAL_STORAGE_UNAVAILABLE
或具体 DECRYPT_FAILED

[替换] [清除]
```

不能：

```text
→ 未配置
```

也不能：

```text
→ 自动转明文
```

原 ciphertext 保留。

用户如果什么都不做，其他功能继续工作。

---

## 八、此时用户点“替换”

用户输入一个新 Key。

如果系统安全存储仍不可用，再出现同一个对话框：

```text
[仅本次运行]   [明文保存]   [取消]
```

选择“明文保存”：

```text
旧 system_secure record
       ↓
被新 plaintext credential 正式替换
```

这是正常 credential replacement，revision 增加，scope ID 重新生成。

选择“仅本次运行”：

```text
旧 system_secure record
       ↓
继续保留在磁盘

新 Key
       ↓
session override
```

本次 Starverse 运行使用新的 session Key。

UI：

```text
OpenAI
已配置 · 仅本次运行
（本次运行临时覆盖已保存凭据）

[替换] [清除]
```

这句括号提示只在确实存在 underlying persistent credential 时显示。

重启以后：

```text
session override 消失
```

原来的 system-secure record 再次成为有效 credential；如果 keyring 仍打不开，就继续显示“系统安全存储不可用”。

这比为了临时工作而删除旧安全凭据合理得多。

---

## 九、“清除”的语义必须简单统一

不再提供：

```text
清除临时
清除持久
清除 backend
```

这种复杂选项。

统一规定：

> **清除 = 清除此 Provider 的所有 Starverse credential 状态。**

也就是：

```text
session override
+
persistent secure credential
+
persistent plaintext credential
        ↓
全部删除
```

然后：

```text
未配置 | 添加
```

需要二次确认与否可以沿用现有设置页政策，不因为 Linux 单独增加一层。

---

## 十、“替换”的语义

替换始终表示：

> 用户正在提供一个新的完整 API Key。

永远不读取旧 Key。

```text
已配置 · 系统安全存储
        ↓
      替换
        ↓
空输入框
```

或：

```text
已配置 · 明文存储
        ↓
      替换
        ↓
空输入框
```

保存时：

### 安全 backend 可用

无论旧 Key 是 secure 还是 plaintext：

```text
新 Key
  ↓
safeStorage
  ↓
system_secure
```

所以如果用户之前主动用了 plaintext，后来系统 keyring 恢复，并且他下次主动替换 Key，自然就升级回安全存储。

第一版**不需要做自动 plaintext → secure migration**。

减少状态机和事务复杂度。

---

## 十一、不要自动迁移明文凭据

假如：

```text
昨天：
已配置 · 明文存储

今天：
GNOME Keyring 恢复
```

我建议仍显示：

```text
已配置 · 明文存储
```

不要后台自动：

```text
plaintext
→ safeStorage
```

原因不是安全上不希望迁移，而是这会引入新的：

```text
migration state
rollback
crash recovery
migration failure
CAS
```

对于当前 Starverse 不值得。

开发者已经明确选择了明文。

他以后点击：

```text
替换
```

新 Key 自动使用当前安全 backend 即可。

---

## 十二、状态模型

内部继续保留现有的 `configured`、`availability` 和 `diagnosticCode`，并增加存储模式与是否临时覆盖持久凭据。这样底层错误不会被 UI 展示状态吞掉。

UI 可以从这些字段派生为：

```ts
type CredentialDisplayState =
  | 'missing'
  | 'secure'
  | 'secure_unavailable'
  | 'session'
  | 'session_over_secure'
  | 'plaintext'
  | 'unknown'
```

UI 对应：

| 内部状态                  | 用户看到                     |
| --------------------- | ------------------------ |
| `missing`             | `未配置`                    |
| `secure`              | `已配置 · 系统安全存储`           |
| `secure_unavailable`  | `已配置 · 系统安全存储不可用`        |
| `session`             | `已配置 · 仅本次运行`            |
| `session_over_secure` | `已配置 · 仅本次运行（临时覆盖已保存凭据）` |
| `plaintext`           | `已配置 · 明文存储`             |
| `unknown`             | `状态未知` + 具体错误            |

真正的“未知”继续只用于：

```text
记录结构损坏
IPC contract 异常
DB 状态无法判断
内部 invariant 失败
```

不要把：

```text
basic_text
safeStorage unavailable
decrypt failed
```

统称成未知。

这些原因都是已知的。

---

## 十三、持久记录格式

标准五个 Provider 建议把现有 record 扩展为 backend-aware（后端感知）结构。

安全：

```ts
{
  version: 3,
  providerKey: 'openai_responses',
  backend: 'electron_safe_storage',
  ciphertextBase64: '...',
  credentialScopeId: 'credential-scope-v2:...',
  revision: 7,
  updatedAtMs: ...
}
```

明文：

```ts
{
  version: 3,
  providerKey: 'openai_responses',
  backend: 'plaintext',
  plaintext: 'sk-...',
  credentialScopeId: 'credential-scope-v2:...',
  revision: 8,
  updatedAtMs: ...
}
```

两种 record 必须是 discriminated union（可辨识联合），禁止同时包含：

```text
ciphertextBase64
+
plaintext
```

例如：

```ts
type PersistedCredential =
  | {
      backend: 'electron_safe_storage'
      ciphertextBase64: string
      ...
    }
  | {
      backend: 'plaintext'
      plaintext: string
      ...
    }
```

这样 Agent 很难把两种语义弄混。

---

## 十四、Compatible Provider

已经迁入 SQLite 的 Compatible credential 保持 SQLite authority，不退回 electron-store。

把 credential table 加一个：

```sql
backend TEXT NOT NULL
```

值：

```text
electron_safe_storage
plaintext
```

以及一个 payload BLOB。

安全模式：

```text
payload = safeStorage ciphertext
```

明文模式：

```text
payload = UTF-8 credential JSON / API Key bytes
```

由 backend 判定 payload 语义。

仍然维持现有：

```text
prepare secret
     ↓
BEGIN IMMEDIATE
     ↓
credential + provider/endpoint
     ↓
COMMIT
```

因此 Linux plaintext 不应该破坏 Phase 4 已经建立好的 SQLite 原子事务。

---

## 十五、session credential 不进入 SQLite/electron-store

只存在：

```ts
Map<CredentialIdentity, SessionCredential>
```

Electron main process 生命周期内。

也仍然经过现有：

```text
credentialMutationQueue
```

避免：

```text
replace
clear
session override
```

互相竞争。

但是和 Phase 3 一样：

```text
withCredential()
```

取得 lease 以后不持 mutation queue。

所以网络请求仍然可以并行。

---

## 十六、Credential resolution 顺序

有 session override：

```text
session
→ 使用 session
```

没有：

```text
persisted secure
→ decrypt
→ 使用
```

或：

```text
persisted plaintext
→ 直接取得
→ 使用
```

没有任何记录：

```text
missing
```

因此 resolver 很简单：

```text
session override?
       │
 yes ──┘ → session

 no
 ↓
persistent record?
       │
       ├─ secure → safeStorage decrypt
       └─ plaintext → direct
```

不需要 helper、vault、pass、环境变量等额外 backend。

---

## 十七、已有安全边界全部继续有效

即使用户主动选明文，下面这些规则**一个都不能放松**：

```text
renderer 不得 read credential
preload 不得 reveal credential
IPC 不得返回 API Key
Agent context 不得看到 API Key
日志不得输出 API Key
provider failure 不得输出 Authorization
crash report / telemetry 不得包含 secret
```

“明文”只改变：

```text
at-rest storage protection
```

不改变应用内部 secret boundary。

这是非常重要的区分。

---

## 十八、错误码

不需要庞大的 Linux error hierarchy。

新增一个明确错误即可：

```text
EPOCH2_RUNTIME_CREDENTIAL_SECURE_STORAGE_UNAVAILABLE
```

如果更具体的 Electron decrypt error 已经存在，则继续保留：

```text
EPOCH2_RUNTIME_CREDENTIAL_DECRYPT_FAILED
EPOCH2_RUNTIME_CREDENTIAL_INVALID
EPOCH2_RUNTIME_CREDENTIAL_STORAGE_UNAVAILABLE
```

再新增一个状态原因：

```text
LINUX_SAFE_STORAGE_BASIC_TEXT
```

用途只是在 UI 决策：

```text
安全 backend 不可用
→ 展示三按钮
```

不要把它包装成：

```text
PROVIDER_CREDENTIAL_STORE_FAILED
```

然后吞掉真正原因。

这延续了你之前已经实现的“状态未知不吞错误”原则。

---

## 十九、完整用户流程

最终 Linux UX 可以浓缩成：

```text
                  保存新 API Key
                       │
                       ▼
            secure safeStorage available?
                 /             \
               yes              no
               │                │
               ▼                ▼
        系统安全存储       ┌───────────────┐
                           │系统安全存储不可用│
                           │               │
                           │ 仅本次运行     │
                           │ 明文保存       │
                           │ 取消           │
                           └───────────────┘
                              │        │
                              ▼        ▼
                           session   plaintext
```

运行中：

```text
system_secure
→ 已配置 · 系统安全存储

session
→ 已配置 · 仅本次运行

plaintext
→ 已配置 · 明文存储

secure decrypt failed
→ 已配置 · 系统安全存储不可用

真正无法判定
→ 状态未知 + 精确错误
```

---

## 二十、需要补的测试

第一版只需要把这些锁死：

1. secure backend 可用时，不出现选择框，落 `electron_safe_storage`。
2. `basic_text`/安全存储不可用时，不发生持久写，先要求用户选择。
3. 选择 session 后，磁盘无 Key；进程内可以发送请求；重建 service 后 Key 消失。
4. 选择 plaintext 后，record 明确标记 `backend=plaintext`，重启可读取。
5. plaintext 状态 UI 永远显示“明文存储”。
6. 没有任何自动 `secure → plaintext` 降级。
7. 原 secure record 解密失败时不删除、不变成 missing。
8. secure unavailable + session replacement 不修改原 secure record。
9. clear 会删除 session 与 persisted credential。
10. renderer/preload/IPC 仍不能读取 Key。
11. 两类 backend 的 100-way revision/CAS 测试继续只有一个 writer 成功。
12. Compatible plaintext create/update/clear/delete 仍满足 SQLite rollback 原子性。

这组已经足够，不需要专门写一套 Linux troubleshooting test。

---

### 冻结规则

> **Linux credential persistence policy**
>
> Starverse 优先使用 Electron `safeStorage` 提供的安全系统凭据后端。若系统安全存储不可用或 Electron 只能提供 `basic_text`，Starverse 不得自动使用该弱后端，也不得阻止用户继续使用 Provider。
>
> 用户保存新的凭据时必须明确选择“仅本次运行”“明文保存”或“取消”。“仅本次运行”的凭据只存在于 Electron main process 内存中；“明文保存”会以可直接读取的形式写入 Starverse 本地凭据存储，并必须持续显示为“明文存储”。
>
> Starverse 不提供自动明文降级，不提供本阶段的 password vault、external helper 或 Linux keyring 故障排除流程。已有系统安全凭据无法解密时必须保留原记录并准确报告错误；只有用户明确替换或清除时才能改变其持久状态。

本策略的目标是：实现规模可控、行为可预测、没有伪安全、没有自动弱化，并允许开发者明确承担明文存储风险。

[1]: https://www.electronjs.org/docs/latest/api/safe-storage "safeStorage | Electron"
