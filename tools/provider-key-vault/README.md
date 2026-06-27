# Provider Key Vault v1

Provider Key Vault is a standalone Windows-only local recovery tool for provider API keys. It is not part of the Starverse Electron app, renderer, IPC layer, provider runtime, SettingsPanel, or secure credential store.

Use it when development resets, migrations, or manual cleanup remove provider keys from Starverse. The tool can display a stored key after explicit confirmation so you can manually paste it back into the Starverse settings page.

## Scope

- Supported providers: `openai`, `anthropic`, `google_ai_studio`, `deepseek`, `openrouter`
- Default vault path: `%APPDATA%\Starverse\provider-key-vault\provider-keys.vault`
- Custom path: `--vault D:\secure-backup\provider-keys.vault`
- Protection: Windows DPAPI `CurrentUser`
- No GUI
- No master password
- No Windows Hello integration
- No cloud sync
- No plaintext export
- No automatic write into Starverse Secure Credential Store

## Commands

```powershell
node tools/provider-key-vault/index.mjs init
node tools/provider-key-vault/index.mjs set openai
node tools/provider-key-vault/index.mjs set openrouter
node tools/provider-key-vault/index.mjs list
node tools/provider-key-vault/index.mjs show openai
node tools/provider-key-vault/index.mjs recover openai
node tools/provider-key-vault/index.mjs remove openai
node tools/provider-key-vault/index.mjs verify
```

Use a custom vault path with any command:

```powershell
node tools/provider-key-vault/index.mjs --vault D:\secure-backup\provider-keys.vault init
```

`set <provider>` reads the API key from hidden stdin. The key must not be passed as a command-line argument.

`show <provider>` and `recover <provider>` require an explicit confirmation phrase before printing the raw key once. They do not write files and do not copy to the clipboard by default.

## DPAPI Limits

This vault is protected with Windows DPAPI using the current Windows user context. It is suitable for same-machine, same-user recovery.

It is not a cross-machine backup format. A vault copied to another Windows user, another machine, or a reinstalled system may not decrypt. The vault does not store biometric data and does not use Windows Hello.

## Vault Format

The file on disk stores an envelope:

```ts
type VaultFileEnvelope = {
  version: 1
  protection: {
    kind: 'windows_dpapi_current_user'
  }
  payloadCiphertext: string
  createdAtMs: number
  updatedAtMs: number
}
```

The decrypted in-memory payload is:

```ts
type VaultPayload = {
  version: 1
  records: {
    provider: 'openai' | 'anthropic' | 'google_ai_studio' | 'deepseek' | 'openrouter'
    label?: string
    maskedKey: string
    value: string
    createdAtMs: number
    updatedAtMs: number
  }[]
}
```

`value` exists only after decryption in memory. The vault file must not contain raw provider keys.

## Recovery Workflow

1. Run `node tools/provider-key-vault/index.mjs verify`.
2. Run `node tools/provider-key-vault/index.mjs recover <provider>`.
3. Confirm the prompt.
4. Manually copy the displayed key into the Starverse settings page.

The tool intentionally does not call Starverse runtime code or write to Starverse Secure Credential Store.
