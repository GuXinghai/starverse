# Provider Key Vault v1

## Owner Decisions

Provider Key Vault v1 is a standalone local recovery tool for provider API keys. It is not part of the Starverse application runtime and must not depend on Electron startup, renderer code, IPC, SettingsPanel, ProviderCredentialService, Send Plan, ModelPicker, provider runtime selection, OpenRouter catalog, DFC, or file-pipeline code.

The approved v1 protection model is Windows DPAPI `CurrentUser`. v1 does not implement Windows Hello, a master password, cloud sync, GUI, plaintext export, live API tests, key rotation, or automatic writes into Starverse Secure Credential Store.

## Location

Tool path:

```text
tools/provider-key-vault/
```

Default vault path:

```text
%APPDATA%\Starverse\provider-key-vault\provider-keys.vault
```

Custom vault paths are supported:

```powershell
node tools/provider-key-vault/index.mjs --vault D:\secure-backup\provider-keys.vault verify
```

## Supported Providers

- `openai`
- `anthropic`
- `google_ai_studio`
- `deepseek`
- `openrouter`

## Commands

- `init`: creates an empty DPAPI vault file.
- `set <provider>`: adds or updates a provider key using hidden stdin. Keys are rejected as positional arguments.
- `list`: prints provider, configured state, masked key, and update time only.
- `show <provider>`: requires confirmation, then displays the raw key once.
- `recover <provider>`: requires confirmation, displays the raw key once, and tells the user to manually paste it into Starverse settings.
- `remove <provider>`: removes one provider key.
- `verify`: decrypts and validates the vault for the current Windows user without printing raw keys.

## DPAPI Semantics

The vault is protected by Windows DPAPI with `DataProtectionScope.CurrentUser`. The PowerShell helper receives base64 data over stdin and returns base64 output over stdout. The API key is never passed as a command-line argument, and helper stderr is reserved for operation errors.

This vault is suitable for same-machine, same-user recovery. It is not a cloud backup or portable password database. A different Windows user, copied machine, or reinstalled system may be unable to decrypt the vault. The vault does not store biometric data and does not implement Windows Hello.

## File Format

The disk envelope is:

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

`payloadCiphertext` is the DPAPI-protected JSON payload. `value` exists only in decrypted memory and must not appear in the vault file, temporary files, test output, or logs.

## Git Hygiene

The repository ignore rules cover:

```text
*.vault
*.vault.tmp
*.vault.bak
provider-keys.vault
tools/provider-key-vault/.tmp/
tools/provider-key-vault/test-output/
```

Vault files, temporary files, backups, recovery output, and generated test artifacts must not be committed.

## Boundaries

The tool is allowed to read and write only its vault file path and its own temporary/backup files. It must not update Starverse Secure Credential Store automatically. Recovery is manual: display the key after confirmation, then the user copies it into Starverse settings.

The implementation must remain independent from Starverse runtime and DFC/file-pipeline code.
