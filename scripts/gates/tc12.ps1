param(
  [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "================================================================================"
Write-Host "TC-12 Gate Check - Delete legacy + remove flags"
Write-Host "================================================================================"

$nodeArgs = @("scripts/gates/tc12.mjs")
if ($SkipTests) { $nodeArgs += "--skip-tests" }

node @nodeArgs
