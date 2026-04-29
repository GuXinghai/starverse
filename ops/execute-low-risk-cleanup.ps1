param(
    [Parameter(Mandatory = $true)]
    [string]$AuditDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Convert-ToHumanSize {
    param([nullable[Int64]]$Bytes)

    if ($null -eq $Bytes) {
        return '0 B'
    }

    $value = [double]$Bytes
    $units = @('B', 'KB', 'MB', 'GB', 'TB')
    $index = 0
    while ($value -ge 1024 -and $index -lt ($units.Count - 1)) {
        $value /= 1024
        $index++
    }

    return '{0:N2} {1}' -f $value, $units[$index]
}

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = 'INFO'
    )

    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    Write-Host $line
    Add-Content -LiteralPath $script:LogPath -Value $line
}

function Get-VolumeSnapshot {
    param([string[]]$Drives)

    foreach ($drive in $Drives) {
        $disk = Get-CimInstance Win32_LogicalDisk -Filter ("DeviceID='{0}'" -f $drive)
        if (-not $disk) {
            continue
        }

        $used = [Int64]$disk.Size - [Int64]$disk.FreeSpace
        [pscustomobject]@{
            Drive = $drive
            SizeBytes = [Int64]$disk.Size
            UsedBytes = $used
            FreeBytes = [Int64]$disk.FreeSpace
            SizeHuman = Convert-ToHumanSize $disk.Size
            UsedHuman = Convert-ToHumanSize $used
            FreeHuman = Convert-ToHumanSize $disk.FreeSpace
        }
    }
}

if (-not (Test-Path -LiteralPath $AuditDir)) {
    throw "Audit directory not found: $AuditDir"
}

$candidatePath = Join-Path $AuditDir 'consolidated_candidates.csv'
if (-not (Test-Path -LiteralPath $candidatePath)) {
    throw "Missing consolidated candidate file: $candidatePath"
}

$executionDir = Join-Path $AuditDir ('execution_{0}' -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $executionDir -Force | Out-Null
$script:LogPath = Join-Path $executionDir 'cleanup.log'
New-Item -ItemType File -Path $script:LogPath -Force | Out-Null

$rawCandidates = Import-Csv -LiteralPath $candidatePath |
    Where-Object {
        $_.RiskLevel -eq '低风险' -and
        $_.SuggestedAction -eq '直接删除' -and
        $_.Category -ne '重复文件'
    } |
    Sort-Object { [Int64]$_.EstimatedReleaseBytes } -Descending

$selected = New-Object System.Collections.Generic.List[object]
foreach ($item in $rawCandidates) {
    if (-not (Test-Path -LiteralPath $item.Path)) {
        continue
    }

    $path = [System.IO.Path]::GetFullPath($item.Path).TrimEnd('\')
    $overlap = $false
    foreach ($picked in $selected) {
        $pickedPath = [System.IO.Path]::GetFullPath($picked.Path).TrimEnd('\')
        if (
            $path.Equals($pickedPath, [System.StringComparison]::OrdinalIgnoreCase) -or
            $path.StartsWith($pickedPath + '\', [System.StringComparison]::OrdinalIgnoreCase) -or
            $pickedPath.StartsWith($path + '\', [System.StringComparison]::OrdinalIgnoreCase)
        ) {
            $overlap = $true
            break
        }
    }

    if (-not $overlap) {
        $selected.Add($item)
    }
}

$executionManifest = $selected | ForEach-Object {
    [pscustomobject]@{
        Path = $_.Path
        SizeBytes = [Int64]$_.EstimatedReleaseBytes
        SizeHuman = $_.EstimatedReleaseHuman
        Category = $_.Category
        LastAccessTime = $_.LastAccessTime
        LastWriteTime = $_.LastWriteTime
        RiskLevel = $_.RiskLevel
        SuggestedAction = $_.SuggestedAction
        Reason = $_.Reason
        Status = 'Pending'
        DeletedAt = $null
        ErrorMessage = $null
    }
}

$executionManifest | Export-Csv -LiteralPath (Join-Path $executionDir 'execution_manifest.csv') -NoTypeInformation -Encoding UTF8

$targetDrives = $executionManifest |
    ForEach-Object { $_.Path.Substring(0, 2).ToUpperInvariant() } |
    Sort-Object -Unique

$beforeSnapshot = Get-VolumeSnapshot -Drives $targetDrives
$beforeSnapshot | Export-Csv -LiteralPath (Join-Path $executionDir 'volume_before.csv') -NoTypeInformation -Encoding UTF8

Write-Log ("Execution directory: {0}" -f $executionDir)
Write-Log ("Target item count: {0}" -f $executionManifest.Count)
Write-Log ("Estimated reclaim: {0}" -f (Convert-ToHumanSize (($executionManifest | Measure-Object -Property SizeBytes -Sum).Sum)))

$resultRows = New-Object System.Collections.Generic.List[object]

foreach ($item in $executionManifest) {
    $path = $item.Path
    $deletedAt = Get-Date
    try {
        if (-not (Test-Path -LiteralPath $path)) {
            $resultRows.Add([pscustomobject]@{
                Path = $path
                SizeBytes = $item.SizeBytes
                SizeHuman = $item.SizeHuman
                Category = $item.Category
                Status = 'SkippedMissing'
                DeletedAt = $null
                ErrorMessage = 'Path already missing.'
            })
            Write-Log ("Skip missing: {0}" -f $path) 'WARN'
            continue
        }

        $target = Get-Item -LiteralPath $path -Force -ErrorAction Stop
        if ($target.PSIsContainer) {
            Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
        }
        else {
            Remove-Item -LiteralPath $path -Force -ErrorAction Stop
        }

        $resultRows.Add([pscustomobject]@{
            Path = $path
            SizeBytes = $item.SizeBytes
            SizeHuman = $item.SizeHuman
            Category = $item.Category
            Status = 'Deleted'
            DeletedAt = $deletedAt
            ErrorMessage = $null
        })
        Write-Log ("Deleted: {0} ({1})" -f $path, $item.SizeHuman)
    }
    catch {
        $resultRows.Add([pscustomobject]@{
            Path = $path
            SizeBytes = $item.SizeBytes
            SizeHuman = $item.SizeHuman
            Category = $item.Category
            Status = 'Failed'
            DeletedAt = $null
            ErrorMessage = $_.Exception.Message
        })
        Write-Log ("Failed: {0} -> {1}" -f $path, $_.Exception.Message) 'ERROR'
    }
}

$resultRows | Export-Csv -LiteralPath (Join-Path $executionDir 'cleanup_results.csv') -NoTypeInformation -Encoding UTF8

$afterSnapshot = Get-VolumeSnapshot -Drives $targetDrives
$afterSnapshot | Export-Csv -LiteralPath (Join-Path $executionDir 'volume_after.csv') -NoTypeInformation -Encoding UTF8

$comparison = foreach ($before in $beforeSnapshot) {
    $after = $afterSnapshot | Where-Object { $_.Drive -eq $before.Drive } | Select-Object -First 1
    if (-not $after) {
        continue
    }

    $released = [Int64]$after.FreeBytes - [Int64]$before.FreeBytes
    [pscustomobject]@{
        Drive = $before.Drive
        FreeBeforeBytes = $before.FreeBytes
        FreeBeforeHuman = $before.FreeHuman
        FreeAfterBytes = $after.FreeBytes
        FreeAfterHuman = $after.FreeHuman
        ReleasedBytes = $released
        ReleasedHuman = Convert-ToHumanSize $released
    }
}

$comparison | Export-Csv -LiteralPath (Join-Path $executionDir 'volume_comparison.csv') -NoTypeInformation -Encoding UTF8

$summary = [pscustomobject]@{
    ExecutionDir = $executionDir
    ItemCount = $executionManifest.Count
    DeletedCount = @($resultRows | Where-Object { $_.Status -eq 'Deleted' }).Count
    FailedCount = @($resultRows | Where-Object { $_.Status -eq 'Failed' }).Count
    SkippedMissingCount = @($resultRows | Where-Object { $_.Status -eq 'SkippedMissing' }).Count
    EstimatedReleaseBytes = [Int64](($executionManifest | Measure-Object -Property SizeBytes -Sum).Sum)
    ActualReleasedBytes = [Int64](($comparison | Measure-Object -Property ReleasedBytes -Sum).Sum)
}

$summary | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $executionDir 'summary.json') -Encoding UTF8
Write-Log ("Actual released: {0}" -f (Convert-ToHumanSize $summary.ActualReleasedBytes))
Write-Host $executionDir
