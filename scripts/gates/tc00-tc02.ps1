param(
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw "node is required to run gate checks (scripts/gates/tc00-tc02.mjs)."
}

$args = @("scripts/gates/tc00-tc02.mjs")
if ($SkipTests) { $args += "--skip-tests" }

& $node.Source @args
exit $LASTEXITCODE

