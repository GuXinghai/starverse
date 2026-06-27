param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('protect', 'unprotect')]
  [string] $Mode
)

$ErrorActionPreference = 'Stop'

try {
  Add-Type -AssemblyName System.Security

  $inputBase64 = [Console]::In.ReadToEnd().Trim()
  if ([string]::IsNullOrWhiteSpace($inputBase64)) {
    throw 'Missing base64 input.'
  }

  $inputBytes = [Convert]::FromBase64String($inputBase64)
  if ($Mode -eq 'protect') {
    $outputBytes = [System.Security.Cryptography.ProtectedData]::Protect(
      $inputBytes,
      $null,
      [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
  } else {
    $outputBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
      $inputBytes,
      $null,
      [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
  }

  [Console]::Out.Write([Convert]::ToBase64String($outputBytes))
} catch {
  [Console]::Error.WriteLine('DPAPI operation failed: ' + $_.Exception.Message)
  exit 1
}
