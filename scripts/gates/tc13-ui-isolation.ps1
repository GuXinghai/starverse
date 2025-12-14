#!/usr/bin/env pwsh
# TC-13 — UI isolation gate (PowerShell wrapper)
#
# Usage:
#   pwsh -ExecutionPolicy Bypass -File scripts/gates/tc13-ui-isolation.ps1

# PSScriptAnalyzer: disable PSUseApprovedVerbs

param()

$ErrorActionPreference = 'Stop'

Set-Location -Path (Split-Path -Parent $PSScriptRoot)

& node .\scripts\gates\tc13-ui-isolation.mjs
exit $LASTEXITCODE

