#!/usr/bin/env pwsh
# B 变更集 - 黑名单门禁验证脚本 (PowerShell wrapper)
#
# ✅ 设计目标：避免漏检（递归 + 包含 *.d.ts 等高危载体）并支持 CI 跨平台复用
#
# 用法:
#   pwsh B_GATE.ps1

# PSScriptAnalyzer: disable PSUseApprovedVerbs

param()

$ErrorActionPreference = 'Stop'

Set-Location -Path $PSScriptRoot

Write-Host "[B_GATE] Running Node gate..." -ForegroundColor Cyan

& node .\scripts\b_gate.mjs
exit $LASTEXITCODE
