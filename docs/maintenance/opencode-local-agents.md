# OpenCode Local Agents

The live OpenCode configuration under .opencode/ is intentionally local-only and remains untracked in Git.

The tracked files in docs/maintenance/opencode-agent-templates/ are sanitized templates. They exist so the local OpenCode setup can be recovered without committing private model preferences, provider credentials, API keys, tokens, account-specific paths, or .env content.

The repository keeps .opencode/ out of normal Git tracking by adding a local-only ignore rule in .git/info/exclude. That protects the live files from ordinary git status output and from git clean -fd. A stronger command such as git clean -fdx can still remove ignored local files.

To restore the live OpenCode files from the tracked templates, run:

powershell -ExecutionPolicy Bypass -File .\scripts\dev\restore-opencode-agents.ps1 -Force

Do not place secrets or private provider settings into the tracked templates. If the live configuration needs local-only customizations, keep them under .opencode/ and leave them untracked.
