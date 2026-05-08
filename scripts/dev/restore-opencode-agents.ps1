[CmdletBinding()]
param(
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptPath = $MyInvocation.MyCommand.Path
$scriptDirectory = Split-Path -Parent $scriptPath
$repoRoot = (Resolve-Path (Join-Path $scriptDirectory '..\..')).Path

$templateRoot = Join-Path $repoRoot 'docs\maintenance\opencode-agent-templates'
$liveRoot = Join-Path $repoRoot '.opencode'

$targets = @(
    @{ Source = Join-Path $templateRoot 'agents\flash-code-reader.md'; Destination = Join-Path $liveRoot 'agents\flash-code-reader.md' },
    @{ Source = Join-Path $templateRoot 'agents\flash-test-runner.md'; Destination = Join-Path $liveRoot 'agents\flash-test-runner.md' },
    @{ Source = Join-Path $templateRoot 'commands\flash-read-code.md'; Destination = Join-Path $liveRoot 'commands\flash-read-code.md' },
    @{ Source = Join-Path $templateRoot 'commands\flash-run-test.md'; Destination = Join-Path $liveRoot 'commands\flash-run-test.md' }
)

foreach ($target in $targets) {
    if (-not (Test-Path -LiteralPath $target.Source)) {
        throw "Missing template: $($target.Source)"
    }

    $destinationDirectory = Split-Path -Parent $target.Destination
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null

    if ((Test-Path -LiteralPath $target.Destination) -and -not $Force) {
        throw "Refusing to overwrite existing live file: $($target.Destination). Re-run with -Force to replace it."
    }

    Copy-Item -LiteralPath $target.Source -Destination $target.Destination -Force:$Force
    Write-Host "Copied $($target.Source) -> $($target.Destination)"
}
