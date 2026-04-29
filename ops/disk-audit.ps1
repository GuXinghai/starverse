param(
    [string[]]$Drives = @('C', 'D', 'E'),
    [string]$OutputRoot = (Join-Path (Get-Location) 'artifacts'),
    [Int64]$LargeFileThresholdBytes = 1GB,
    [int]$TopDirectoryCount = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = 'INFO'
    )

    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    Write-Host $line
    Add-Content -LiteralPath $script:LogPath -Value $line
}

function Convert-ToHumanSize {
    param([nullable[Int64]]$Bytes)

    if ($null -eq $Bytes) {
        return '0 B'
    }

    $value = [double]$Bytes
    $units = @('B', 'KB', 'MB', 'GB', 'TB', 'PB')
    $index = 0
    while ($value -ge 1024 -and $index -lt ($units.Count - 1)) {
        $value /= 1024
        $index++
    }

    return '{0:N2} {1}' -f $value, $units[$index]
}

function Add-Size {
    param(
        [hashtable]$Table,
        [string]$Key,
        [Int64]$Bytes
    )

    if ([string]::IsNullOrWhiteSpace($Key)) {
        return
    }

    if ($Table.ContainsKey($Key)) {
        $Table[$Key] = [Int64]$Table[$Key] + $Bytes
    }
    else {
        $Table[$Key] = [Int64]$Bytes
    }
}

function Measure-DirectoryFast {
    param(
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return [Int64]0
    }

    try {
        return [Int64]((Get-ChildItem -LiteralPath $Path -Force -File -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum)
    }
    catch {
        Write-Log ("目录测量失败: {0} -> {1}" -f $Path, $_.Exception.Message) 'WARN'
        return [Int64]0
    }
}

function Get-FileCategory {
    param(
        [string]$Path,
        [string]$Extension
    )

    $normalized = $Path.ToLowerInvariant()
    $ext = ($Extension ?? '').ToLowerInvariant()

    if ($normalized -match '\\\$recycle\.bin\\' -or $normalized -match '\\recycler\\') { return '临时文件、回收站' }
    if ($normalized -match '\\windows\\temp\\' -or $normalized -match '\\appdata\\local\\temp\\' -or $normalized -match '\\temp\\') { return '临时文件、回收站' }
    if ($normalized -match '\\downloads?\\') { return '下载目录' }
    if ($normalized -match '\\desktop\\') { return '桌面堆积文件' }
    if ($ext -in @('.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.m2ts', '.ts', '.webm', '.iso')) { return '视频、压缩包、安装包' }
    if ($ext -in @('.zip', '.7z', '.rar', '.tar', '.gz', '.bz2', '.xz', '.cab', '.wim')) { return '视频、压缩包、安装包' }
    if ($ext -in @('.exe', '.msi', '.msix', '.appx', '.iso', '.img')) { return '视频、压缩包、安装包' }
    if ($ext -in @('.vhd', '.vhdx', '.vdi', '.vmdk', '.qcow2') -or $normalized -match '\\docker\\' -or $normalized -match '\\wsl\\' -or $normalized -match '\\hyper-v\\' -or $normalized -match '\\virtualbox\\' -or $normalized -match '\\vmware\\' -or $normalized -match '\\android\\avd\\') { return '虚拟机镜像、容器镜像' }
    if ($normalized -match 'huggingface|ollama|comfyui|stable-diffusion|checkpoint|checkpoints|models|modelscope|gguf|safetensors|loras|datasets|cache\\torch|cache\\pipelines|cache\\huggingface') { return 'AI 模型权重、数据集、缓存' }
    if ($normalized -match 'steamapps|epic games|riot games|blizzard|battle\.net|mihoyo|genshin|wuwa|game') { return '游戏文件与游戏缓存' }
    if ($normalized -match 'chrome\\user data\\default\\cache|edge\\user data\\default\\cache|firefox\\profiles\\.*\\cache|cache\\mozilla|cache\\google|cache\\microsoft' -or $normalized -match '\\logs?\\' -or $normalized -match '\\cache\\') { return '浏览器缓存、软件缓存、日志' }
    if ($normalized -match 'onedrive|dropbox|百度网盘|baidunetdisk|googledrive|google drive|icloud|坚果云|synologydrive') { return '云盘同步目录中的本地副本' }
    if ($normalized -match '\\documents\\' -or $normalized -match '\\repos\\' -or $normalized -match '\\projects?\\' -or $normalized -match '\\archive\\' -or $normalized -match '\\backup\\' -or $normalized -match '课程|课件|论文|实验|作业|笔记') { return '旧项目归档、课程资料、无用备份' }
    return '未分类'
}

function Get-RiskLevel {
    param(
        [string]$Path,
        [string]$Category
    )

    $normalized = $Path.ToLowerInvariant()

    if ($normalized -eq 'c:\windows' -or $normalized.StartsWith('c:\windows\')) { return '高风险' }
    if ($normalized -eq 'c:\program files' -or $normalized.StartsWith('c:\program files\')) { return '高风险' }
    if ($normalized -eq 'c:\program files (x86)' -or $normalized.StartsWith('c:\program files (x86)\')) { return '高风险' }
    if ($normalized -match '\\users\\[^\\]+\\appdata\\' -and $Category -ne '浏览器缓存、软件缓存、日志' -and $Category -ne '临时文件、回收站') { return '高风险' }
    if ($normalized -match '\\users\\[^\\]+\\(desktop|documents|source|repos|projects?)\\') { return '高风险' }
    if ($normalized -match 'onedrive|dropbox|百度网盘|baidunetdisk|googledrive|google drive|icloud|坚果云|synologydrive') { return '高风险' }

    switch ($Category) {
        '临时文件、回收站' { return '低风险' }
        '浏览器缓存、软件缓存、日志' { return '低风险' }
        '下载目录' { return '中风险' }
        '桌面堆积文件' { return '高风险' }
        '视频、压缩包、安装包' { return '中风险' }
        '重复文件' { return '低风险' }
        'AI 模型权重、数据集、缓存' { return '中风险' }
        '游戏文件与游戏缓存' { return '中风险' }
        '虚拟机镜像、容器镜像' { return '高风险' }
        '云盘同步目录中的本地副本' { return '高风险' }
        '旧项目归档、课程资料、无用备份' { return '高风险' }
        default { return '高风险' }
    }
}

function Get-SuggestedAction {
    param(
        [string]$Path,
        [string]$Category,
        [string]$RiskLevel,
        [Nullable[datetime]]$LastAccessTime,
        [switch]$IsDuplicate
    )

    $ageDays = if ($null -ne $LastAccessTime) { [int](New-TimeSpan -Start ([datetime]$LastAccessTime) -End (Get-Date)).TotalDays } else { $null }
    $normalized = $Path.ToLowerInvariant()

    if ($IsDuplicate) { return '移入回收站' }
    if ($RiskLevel -eq '低风险' -and $Category -eq '临时文件、回收站') { return '直接删除' }
    if ($RiskLevel -eq '低风险' -and $Category -eq '浏览器缓存、软件缓存、日志') { return '直接删除' }
    if ($Category -eq '云盘同步目录中的本地副本') { return '上云后删除本地' }
    if ($Category -eq '旧项目归档、课程资料、无用备份') { return '上云后删除本地' }
    if ($Category -eq 'AI 模型权重、数据集、缓存' -and $normalized -match '\\cache\\') { return '直接删除' }
    if ($RiskLevel -eq '中风险' -and $ageDays -ge 180) { return '需要用户确认' }
    if ($RiskLevel -eq '高风险') { return '保留不动' }
    return '需要用户确认'
}

function Get-Reason {
    param(
        [string]$Category,
        [string]$RiskLevel,
        [string]$SuggestedAction,
        [switch]$IsDuplicate
    )

    if ($IsDuplicate) { return '同名同体积候选经哈希确认重复，保留一份即可。' }
    switch ($Category) {
        '临时文件、回收站' { return '临时数据和回收站内容通常可再生成，属于优先清理区域。' }
        '浏览器缓存、软件缓存、日志' { return '缓存和日志通常可再生成，对业务数据影响较低。' }
        '下载目录' { return '下载目录常包含历史安装包、压缩包和媒体文件，需要结合访问时间判定。' }
        '视频、压缩包、安装包' { return '大体积媒体或安装介质适合归档或删除，但需确认是否仍有使用需求。' }
        'AI 模型权重、数据集、缓存' { return 'AI 目录通常体积巨大，若是缓存或可重下资源，回收空间潜力高。' }
        '虚拟机镜像、容器镜像' { return '虚拟磁盘和容器层删除后会直接影响运行环境，必须保守处理。' }
        '游戏文件与游戏缓存' { return '游戏资源可重装但体积大，回收空间高，代价是重装时间和流量。' }
        '云盘同步目录中的本地副本' { return '已同步且低频使用的文件适合转仅云端，但需先校验云端完整性。' }
        '旧项目归档、课程资料、无用备份' { return '可能仍有复用价值，默认推荐归档而非直接删除。' }
        default {
            if ($RiskLevel -eq '高风险') {
                return '路径用途不明或属于工作/系统关键区域，默认保留。'
            }
            return '需要结合使用频率和来源进一步确认。'
        }
    }
}

function Get-RootVolumeStats {
    param([string[]]$TargetDrives)

    $stats = foreach ($drive in $TargetDrives) {
        $deviceId = '{0}:' -f $drive.TrimEnd(':')
        $disk = Get-CimInstance Win32_LogicalDisk -Filter ("DeviceID='{0}'" -f $deviceId)
        if (-not $disk) {
            continue
        }

        $used = [Int64]$disk.Size - [Int64]$disk.FreeSpace
        [pscustomobject]@{
            Drive = $deviceId
            VolumeName = $disk.VolumeName
            SizeBytes = [Int64]$disk.Size
            UsedBytes = $used
            FreeBytes = [Int64]$disk.FreeSpace
            SizeHuman = Convert-ToHumanSize $disk.Size
            UsedHuman = Convert-ToHumanSize $used
            FreeHuman = Convert-ToHumanSize $disk.FreeSpace
            UsagePercent = if ($disk.Size -gt 0) { [math]::Round(($used / [double]$disk.Size) * 100, 2) } else { 0 }
        }
    }

    return $stats
}

function Get-DriveAnalysis {
    param(
        [string]$DriveLetter
    )

    $root = '{0}:\' -f $DriveLetter.TrimEnd(':')
    Write-Log ("开始扫描 {0}" -f $root)

    $dirSizes = @{}
    $categorySizes = @{}
    $largeFiles = New-Object System.Collections.Generic.List[object]
    $fileCount = 0
    $fileErrors = 0

    Get-ChildItem -LiteralPath $root -Force -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        $file = $_
        $fileCount++
        if (($fileCount % 50000) -eq 0) {
            Write-Log ("{0} 已扫描文件数 {1}" -f $root, $fileCount)
        }

        try {
            $length = [Int64]$file.Length
            $category = Get-FileCategory -Path $file.FullName -Extension $file.Extension
            Add-Size -Table $categorySizes -Key $category -Bytes $length

            if ($length -ge $LargeFileThresholdBytes) {
                $riskLevel = Get-RiskLevel -Path $file.FullName -Category $category
                $suggestedAction = Get-SuggestedAction -Path $file.FullName -Category $category -RiskLevel $riskLevel -LastAccessTime $file.LastAccessTime
                $largeFiles.Add([pscustomobject]@{
                    ItemType = 'File'
                    Path = $file.FullName
                    SizeBytes = $length
                    SizeHuman = Convert-ToHumanSize $length
                    Category = $category
                    LastAccessTime = $file.LastAccessTime
                    LastWriteTime = $file.LastWriteTime
                    RiskLevel = $riskLevel
                    SuggestedAction = $suggestedAction
                    EstimatedReleaseBytes = $length
                    EstimatedReleaseHuman = Convert-ToHumanSize $length
                    Reason = Get-Reason -Category $category -RiskLevel $riskLevel -SuggestedAction $suggestedAction
                    Hash = $null
                    DuplicateGroup = $null
                })
            }

            $dir = $file.DirectoryName
            while ($dir) {
                Add-Size -Table $dirSizes -Key $dir -Bytes $length
                if ($dir -eq $root.TrimEnd('\')) {
                    break
                }

                $parent = [System.IO.Directory]::GetParent($dir)
                if ($null -eq $parent) {
                    break
                }
                $dir = $parent.FullName
            }
        }
        catch {
            $fileErrors++
        }
    }

    $topDirectories = foreach ($entry in @($dirSizes.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First $TopDirectoryCount)) {
        $dirPath = [string]$entry.Key
        $sizeBytes = [Int64]$entry.Value
        $category = Get-FileCategory -Path $dirPath -Extension ''
        $riskLevel = Get-RiskLevel -Path $dirPath -Category $category
        $directoryInfo = $null
        try {
            $directoryInfo = Get-Item -LiteralPath $dirPath -Force -ErrorAction Stop
        }
        catch {
        }

        [pscustomobject]@{
            ItemType = 'Directory'
            Path = $dirPath
            SizeBytes = $sizeBytes
            SizeHuman = Convert-ToHumanSize $sizeBytes
            Category = $category
            LastAccessTime = if ($directoryInfo) { $directoryInfo.LastAccessTime } else { $null }
            LastWriteTime = if ($directoryInfo) { $directoryInfo.LastWriteTime } else { $null }
            RiskLevel = $riskLevel
            SuggestedAction = Get-SuggestedAction -Path $dirPath -Category $category -RiskLevel $riskLevel -LastAccessTime $(if ($directoryInfo) { $directoryInfo.LastAccessTime } else { $null })
            EstimatedReleaseBytes = $sizeBytes
            EstimatedReleaseHuman = Convert-ToHumanSize $sizeBytes
            Reason = Get-Reason -Category $category -RiskLevel $riskLevel -SuggestedAction ''
        }
    }

    $candidateDirectories = foreach ($entry in @($dirSizes.GetEnumerator() | Where-Object { $_.Value -ge $LargeFileThresholdBytes } | Sort-Object Value -Descending)) {
        $dirPath = [string]$entry.Key
        $sizeBytes = [Int64]$entry.Value
        $category = Get-FileCategory -Path $dirPath -Extension ''
        $riskLevel = Get-RiskLevel -Path $dirPath -Category $category
        $directoryInfo = $null
        try {
            $directoryInfo = Get-Item -LiteralPath $dirPath -Force -ErrorAction Stop
        }
        catch {
        }

        $suggestedAction = Get-SuggestedAction -Path $dirPath -Category $category -RiskLevel $riskLevel -LastAccessTime $(if ($directoryInfo) { $directoryInfo.LastAccessTime } else { $null })
        [pscustomobject]@{
            ItemType = 'Directory'
            Path = $dirPath
            SizeBytes = $sizeBytes
            SizeHuman = Convert-ToHumanSize $sizeBytes
            Category = $category
            LastAccessTime = if ($directoryInfo) { $directoryInfo.LastAccessTime } else { $null }
            LastWriteTime = if ($directoryInfo) { $directoryInfo.LastWriteTime } else { $null }
            RiskLevel = $riskLevel
            SuggestedAction = $suggestedAction
            EstimatedReleaseBytes = $sizeBytes
            EstimatedReleaseHuman = Convert-ToHumanSize $sizeBytes
            Reason = Get-Reason -Category $category -RiskLevel $riskLevel -SuggestedAction $suggestedAction
        }
    }

    $categorySummary = foreach ($entry in @($categorySizes.GetEnumerator() | Sort-Object Value -Descending)) {
        $sizeBytes = [Int64]$entry.Value
        [pscustomobject]@{
            Drive = '{0}:' -f $DriveLetter.TrimEnd(':')
            Category = [string]$entry.Key
            SizeBytes = $sizeBytes
            SizeHuman = Convert-ToHumanSize $sizeBytes
        }
    }

    Write-Log ("完成扫描 {0}，文件数 {1}，错误数 {2}" -f $root, $fileCount, $fileErrors)

    return [pscustomobject]@{
        Drive = '{0}:' -f $DriveLetter.TrimEnd(':')
        Root = $root
        FileCount = $fileCount
        FileErrorCount = $fileErrors
        TopDirectories = $topDirectories
        LargeFiles = $largeFiles
        CandidateDirectories = $candidateDirectories
        CategorySummary = $categorySummary
        DirectorySizeMap = $dirSizes
    }
}

function Get-DuplicateLargeFiles {
    param(
        [System.Collections.Generic.List[object]]$LargeFiles
    )

    $relevantExtensions = @('.zip', '.7z', '.rar', '.iso', '.img', '.exe', '.msi', '.safetensors', '.gguf', '.pt', '.bin', '.mp4', '.mkv', '.avi', '.mov', '.vhdx', '.vhd', '.vmdk', '.qcow2')
    $duplicateResults = New-Object System.Collections.Generic.List[object]
    $groupCounter = 0

    $groups = $LargeFiles |
        Where-Object { $_.ItemType -eq 'File' -and ($_.Path | Split-Path -Leaf) -and (([System.IO.Path]::GetExtension($_.Path).ToLowerInvariant()) -in $relevantExtensions) } |
        Group-Object SizeBytes

    foreach ($group in $groups) {
        if ($group.Count -lt 2) {
            continue
        }

        $hashBuckets = @{}
        foreach ($item in $group.Group) {
            try {
                $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $item.Path -ErrorAction Stop).Hash
                $item.Hash = $hash
                if ($hashBuckets.ContainsKey($hash)) {
                    $hashBuckets[$hash].Add($item)
                }
                else {
                    $hashBuckets[$hash] = New-Object System.Collections.Generic.List[object]
                    $hashBuckets[$hash].Add($item)
                }
            }
            catch {
                Write-Log ("哈希失败: {0} -> {1}" -f $item.Path, $_.Exception.Message) 'WARN'
            }
        }

        foreach ($hash in $hashBuckets.Keys) {
            $hashGroup = $hashBuckets[$hash]
            if ($hashGroup.Count -lt 2) {
                continue
            }

            $groupCounter++
            $keeper = $hashGroup | Sort-Object @{ Expression = { if ($_.Path -match '\\archive\\|\\backup\\|\\models?\\|\\downloads?\\') { 1 } else { 0 } }; Descending = $true }, LastWriteTime -Descending | Select-Object -First 1
            foreach ($item in $hashGroup) {
                $item.Category = '重复文件'
                $item.RiskLevel = '低风险'
                $item.SuggestedAction = if ($item.Path -eq $keeper.Path) { '保留不动' } else { '移入回收站' }
                $item.Reason = if ($item.Path -eq $keeper.Path) { '重复组中的保留项。' } else { '经哈希确认与保留项完全重复。' }
                $item.DuplicateGroup = 'DUP-{0:D4}' -f $groupCounter

                $duplicateResults.Add([pscustomobject]@{
                    DuplicateGroup = 'DUP-{0:D4}' -f $groupCounter
                    KeepPath = $keeper.Path
                    RemovePath = $item.Path
                    SizeBytes = [Int64]$item.SizeBytes
                    SizeHuman = $item.SizeHuman
                    Hash = $hash
                    SuggestedAction = $item.SuggestedAction
                })
            }
        }
    }

    return $duplicateResults | Where-Object { $_.KeepPath -ne $_.RemovePath }
}

function Get-KnownSourceFindings {
    param(
        [hashtable]$DriveMaps,
        [string]$UserProfile
    )

    $findings = New-Object System.Collections.Generic.List[object]

    $knownFiles = @(
        'C:\hiberfil.sys',
        'C:\pagefile.sys',
        'C:\swapfile.sys'
    )

    foreach ($filePath in $knownFiles) {
        if (Test-Path -LiteralPath $filePath) {
            $item = Get-Item -LiteralPath $filePath -Force
            $findings.Add([pscustomobject]@{
                Path = $filePath
                Category = '隐藏大户'
                SizeBytes = [Int64]$item.Length
                SizeHuman = Convert-ToHumanSize $item.Length
                RiskLevel = '高风险'
                SuggestedAction = '保留不动'
                Reason = '系统关键文件，不应直接处理。'
            })
        }
    }

    $shadowOutput = (& vssadmin list shadowstorage 2>$null | Out-String)
    if ($shadowOutput) {
        $currentVolume = $null
        foreach ($line in ($shadowOutput -split "`r?`n")) {
            if ($line -match '^For volume:\s+\((.+?)\)') {
                $currentVolume = $Matches[1]
            }
            elseif ($line -match '^Used Shadow Copy Storage space:\s+(.+?)\s+\((.+?)\)') {
                $findings.Add([pscustomobject]@{
                    Path = $currentVolume
                    Category = '系统还原点与卷影副本'
                    SizeBytes = $null
                    SizeHuman = $Matches[1].Trim()
                    RiskLevel = '高风险'
                    SuggestedAction = '需要用户确认'
                    Reason = '卷影副本会占据隐藏空间，但调整会影响系统恢复能力。'
                })
            }
        }
    }

    $knownDirectories = @(
        @{ Path = 'C:\Windows\WinSxS'; Category = 'WinSxS'; Risk = '高风险'; Action = '保留不动'; Reason = '组件存储目录，不建议手工删除。' },
        @{ Path = (Join-Path $UserProfile '.wslconfig'); Category = 'WSL 配置'; Risk = '高风险'; Action = '保留不动'; Reason = 'WSL 配置文件体积小，但 WSL 虚拟盘需单独检查。' },
        @{ Path = (Join-Path $UserProfile 'AppData\Local\Docker'); Category = 'Docker Desktop'; Risk = '高风险'; Action = '需要用户确认'; Reason = 'Docker 镜像和卷清理可能影响容器。' },
        @{ Path = (Join-Path $UserProfile 'AppData\Local\Packages'); Category = 'UWP/WSL 包'; Risk = '高风险'; Action = '需要用户确认'; Reason = '其中可能包含 WSL、Android 子系统或应用虚拟磁盘。' },
        @{ Path = (Join-Path $UserProfile '.cache\huggingface'); Category = 'AI 模型权重、数据集、缓存'; Risk = '中风险'; Action = '需要用户确认'; Reason = 'Hugging Face 缓存通常可重下，但可能影响离线推理。' },
        @{ Path = (Join-Path $UserProfile '.ollama\models'); Category = 'AI 模型权重、数据集、缓存'; Risk = '中风险'; Action = '需要用户确认'; Reason = 'Ollama 模型体积大，可通过重下恢复。' },
        @{ Path = (Join-Path $UserProfile '.cargo'); Category = '开发工具缓存'; Risk = '中风险'; Action = '需要用户确认'; Reason = 'Rust 缓存可重建，但会影响后续编译速度。' },
        @{ Path = (Join-Path $UserProfile '.gradle'); Category = '开发工具缓存'; Risk = '中风险'; Action = '需要用户确认'; Reason = 'Gradle 缓存可重建，但会影响构建速度。' },
        @{ Path = (Join-Path $UserProfile '.m2'); Category = '开发工具缓存'; Risk = '中风险'; Action = '需要用户确认'; Reason = 'Maven 缓存可重建，但会影响构建速度。' },
        @{ Path = (Join-Path $UserProfile '.nuget'); Category = '开发工具缓存'; Risk = '中风险'; Action = '需要用户确认'; Reason = 'NuGet 包缓存可重建，但会影响构建速度。' },
        @{ Path = (Join-Path $UserProfile 'AppData\Local\npm-cache'); Category = '开发工具缓存'; Risk = '中风险'; Action = '需要用户确认'; Reason = 'npm 缓存可重建，但会影响安装速度。' },
        @{ Path = (Join-Path $UserProfile '.conda'); Category = '开发工具缓存'; Risk = '中风险'; Action = '需要用户确认'; Reason = 'Conda 包缓存可重建，但会影响环境恢复速度。' }
    )

    foreach ($entry in $knownDirectories) {
        if (-not (Test-Path -LiteralPath $entry.Path)) {
            continue
        }

        $size = Measure-DirectoryFast -Path $entry.Path
        if ($size -le 0) {
            continue
        }

        $findings.Add([pscustomobject]@{
            Path = $entry.Path
            Category = $entry.Category
            SizeBytes = [Int64]$size
            SizeHuman = Convert-ToHumanSize $size
            RiskLevel = $entry.Risk
            SuggestedAction = $entry.Action
            Reason = $entry.Reason
        })
    }

    return $findings
}

function Export-ObjectSet {
    param(
        [Parameter(Mandatory = $true)]
        [object]$InputObject,
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $directory = Split-Path -Path $Path -Parent
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }

    $InputObject | Export-Csv -LiteralPath $Path -NoTypeInformation -Encoding UTF8
}

$sessionId = Get-Date -Format 'yyyyMMdd_HHmmss'
$sessionDir = Join-Path $OutputRoot ("disk_audit_{0}" -f $sessionId)
New-Item -ItemType Directory -Path $sessionDir -Force | Out-Null
$script:LogPath = Join-Path $sessionDir 'scan.log'
New-Item -ItemType File -Path $script:LogPath -Force | Out-Null

Write-Log ("审计会话目录: {0}" -f $sessionDir)

$volumeStats = Get-RootVolumeStats -TargetDrives $Drives
Export-ObjectSet -InputObject $volumeStats -Path (Join-Path $sessionDir 'volume_stats.csv')
$volumeStats | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $sessionDir 'volume_stats.json') -Encoding UTF8

$driveReports = @()
$driveMaps = @{}

foreach ($drive in $Drives) {
    $deviceId = '{0}:' -f $drive.TrimEnd(':')
    if (-not ($volumeStats | Where-Object { $_.Drive -eq $deviceId })) {
        Write-Log ("跳过不存在的盘符 {0}" -f $deviceId) 'WARN'
        continue
    }

    $report = Get-DriveAnalysis -DriveLetter $drive
    $driveReports += $report
    $driveMaps[$report.Drive] = $report.DirectorySizeMap

    Export-ObjectSet -InputObject $report.TopDirectories -Path (Join-Path $sessionDir ("top_directories_{0}.csv" -f $drive.ToLowerInvariant()))
    Export-ObjectSet -InputObject $report.LargeFiles -Path (Join-Path $sessionDir ("large_files_{0}.csv" -f $drive.ToLowerInvariant()))
    Export-ObjectSet -InputObject $report.CandidateDirectories -Path (Join-Path $sessionDir ("directory_candidates_{0}.csv" -f $drive.ToLowerInvariant()))
    Export-ObjectSet -InputObject $report.CategorySummary -Path (Join-Path $sessionDir ("category_summary_{0}.csv" -f $drive.ToLowerInvariant()))
}

$allLargeFiles = New-Object System.Collections.Generic.List[object]
$allCandidates = New-Object System.Collections.Generic.List[object]

foreach ($report in $driveReports) {
    foreach ($item in $report.LargeFiles) { $allLargeFiles.Add($item) }
    foreach ($item in $report.CandidateDirectories) { $allCandidates.Add($item) }
}

$duplicateMappings = Get-DuplicateLargeFiles -LargeFiles $allLargeFiles
Export-ObjectSet -InputObject $duplicateMappings -Path (Join-Path $sessionDir 'duplicate_candidates.csv')

foreach ($file in $allLargeFiles) {
    $allCandidates.Add($file)
}

$knownFindings = Get-KnownSourceFindings -DriveMaps $driveMaps -UserProfile $env:USERPROFILE
Export-ObjectSet -InputObject $knownFindings -Path (Join-Path $sessionDir 'known_hidden_sources.csv')

foreach ($finding in $knownFindings) {
    $allCandidates.Add([pscustomobject]@{
        ItemType = 'Special'
        Path = $finding.Path
        SizeBytes = $finding.SizeBytes
        SizeHuman = $finding.SizeHuman
        Category = $finding.Category
        LastAccessTime = $null
        LastWriteTime = $null
        RiskLevel = $finding.RiskLevel
        SuggestedAction = $finding.SuggestedAction
        EstimatedReleaseBytes = $finding.SizeBytes
        EstimatedReleaseHuman = $finding.SizeHuman
        Reason = $finding.Reason
    })
}

$consolidatedCandidates = $allCandidates |
    Sort-Object @{ Expression = { if ($_.EstimatedReleaseBytes) { [Int64]$_.EstimatedReleaseBytes } else { 0 } }; Descending = $true }, Path
Export-ObjectSet -InputObject $consolidatedCandidates -Path (Join-Path $sessionDir 'consolidated_candidates.csv')

$riskSummary = foreach ($riskGroup in @($consolidatedCandidates | Group-Object RiskLevel | Sort-Object Name)) {
    $sizeBytes = [Int64](($riskGroup.Group | Measure-Object -Property EstimatedReleaseBytes -Sum).Sum)
    [pscustomobject]@{
        RiskLevel = $riskGroup.Name
        Count = $riskGroup.Count
        SizeBytes = $sizeBytes
        SizeHuman = Convert-ToHumanSize $sizeBytes
    }
}
Export-ObjectSet -InputObject $riskSummary -Path (Join-Path $sessionDir 'risk_summary.csv')

$summaryObject = [pscustomobject]@{
    SessionDir = $sessionDir
    VolumeStats = $volumeStats
    RiskSummary = $riskSummary
    DuplicateMappings = $duplicateMappings
    KnownFindings = $knownFindings
}
$summaryObject | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $sessionDir 'summary.json') -Encoding UTF8

Write-Log '扫描完成。'
Write-Host $sessionDir
