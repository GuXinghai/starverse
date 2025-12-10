<#
.SYNOPSIS
    Starverse 文档归档脚本 - 基于五维判断法则的安全归档
.DESCRIPTION
    根据 DOCUMENT_CLEANUP_AUDIT.md 的审查结果，批量归档历史文档到 archive/ 目录
    执行策略：软删除（移动到 archive/），不物理删除
.NOTES
    执行前请确认已阅读 docs/DOCUMENT_CLEANUP_AUDIT.md
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [switch]$DryRun,  # 模拟运行，不实际移动文件
    [switch]$Force    # 强制执行，不询问确认
)

$ErrorActionPreference = "Stop"
$docsPath = Join-Path $PSScriptRoot "docs"
$archivePath = Join-Path $docsPath "archive"

# 归档标记模板
$archiveHeader = @"
# ⚠️ [ARCHIVED/已归档]

**归档日期**: $(Get-Date -Format "yyyy年MM月dd日")  
**归档原因**: 功能已实施完成，本文档降级为历史记录  
**最新文档**: 见 [文档导航中心](../INDEX.md)

---

以下是原始内容...

---

"@

# 定义归档映射表
$archiveMap = @{
    # 已完成的重构记录
    "refactoring" = @(
        "PHASE_0_INFRASTRUCTURE_COMPLETE.md",
        "PHASE_1_BUTTON_REFACTOR_COMPLETE.md",
        "REFACTOR_SUMMARY_PHASE2.md",
        "PHASE2_INTEGRATION_STATUS.md",
        "PHASE_3_SUMMARY.md",
        "REFACTOR_SUMMARY_PHASE3.md",
        "PHASE_3_COMPLETE_SUMMARY.md",
        "PHASE3.4_INTEGRATION_STRATEGY.md",
        "PHASE3.4_STORE_INTEGRATION_STATUS.md"
    )
    
    # 已完成的特性实现
    "completed-features" = @(
        "BRANCH_TREE_REFACTOR_COMPLETE.md",
        "SCROLL_SYSTEM_REFACTOR_COMPLETE.md",
        "CHAT_TOOLBAR_REFACTOR.md",
        "CHAT_TOOLBAR_REDESIGN.md",
        "REASONING_IMPLEMENTATION_SUMMARY.md",
        "SAMPLING_PARAMETERS_FEATURE.md",
        "USAGE_STATISTICS_PHASE2_COMPLETE.md",
        "ANALYTICS_UI_ENHANCEMENT.md",
        "PROJECT_HOME_AS_TAB_ENHANCEMENT.md"
    )
    
    # 已修复的问题
    "issues" = @(
        "CHAT_SWITCHING_LAG_ANALYSIS.md",
        "CHAT_SWITCHING_RECOMPUTATION_ANALYSIS.md",
        "CHAT_SWITCHING_OPTIMIZATION_IMPLEMENTATION.md",
        "DISPLAYMESSAGES_CACHE_ANALYSIS.md",
        "DEBOUNCE_ANALYSIS.md",
        "PROXY_ISSUE_DEEP_ANALYSIS.md",
        "VUE_PROXY_CLONE_FIX.md",
        "FIX_STRUCTURED_CLONE_ERROR.md",
        "CLONE_ERROR_ANALYSIS.md",
        "CLONE_ERROR_FIX.md",
        "BRANCH_DELETE_FIX.md",
        "CHAT_CONTENT_DISAPPEAR_FIX.md",
        "FAVORITE_MODEL_SELECTOR_FIX.md",
        "FOCUS_ISSUE_REPORT.md",
        "PATH_FIX.md",
        "SUBMENU_TELEPORT_FIX.md",
        "WORKER_BUILD_ISSUE.md",
        "ISSUE_2_PARAMETER_PERSISTENCE_FIX.md",
        "ERROR_DISPLAY_IMPLEMENTATION.md",
        "SEND_BUTTON_STATE_OPTIMIZATION.md"
    )
    
    # 已完成的优化
    "optimizations" = @(
        "PERFORMANCE_OPTIMIZATION_IMPLEMENTATION.md",
        "PERFORMANCE_OPTIMIZATION_OPPORTUNITIES.md",
        "ADDITIONAL_OPTIMIZATION_SUGGESTIONS.md",
        "SAVE_OPTIMIZATION_GUIDE.md",
        "SAVE_OPTIMIZATION_SUMMARY.md",
        "BATCH_OPS_AND_CACHE_OPTIMIZATION.md",
        "INCREMENTAL_SERIALIZATION_GUIDE.md",
        "CHUNKED_SAVE_IMPLEMENTATION.md",
        "TAB_SWITCHING_PERSISTENCE_OPTIMIZATION.md",
        "BUTTON_INTERACTION_OPTIMIZATION.md",
        "LONG_CONVERSATION_PERFORMANCE.md",
        "PASTE_PERFORMANCE_ANALYSIS.md",
        "MODEL_PARAMETERS_OPTIMIZATION.md"
    )
    
    # UI 实现记录
    "ui-implementations" = @(
        "CHATVIEW_ISSUES_ANALYSIS.md",
        "CHATVIEW_OPTIMIZATION_SUMMARY.md",
        "CHATVIEW_COMMENTS_IMPROVEMENT.md",
        "CHATVIEW_COMMENTS_PROGRESS.md",
        "CONVERSATIONLIST_REFACTOR_CHECKLIST.md",
        "UI_COMPONENT_REFACTOR_PHASE1_DIAGNOSIS.md",
        "UI_COMPONENT_REFACTOR_PHASE2_API_DESIGN.md",
        "UI_COMPONENT_REFACTOR_PHASE3_IMPLEMENTATION_PLAN.md",
        "UI_COMPONENT_REFACTOR_PHASE4_TDD_PREPARATION.md",
        "UI_REFACTOR_STRATEGY_ADJUSTED.md",
        "ADVANCED_MODEL_PICKER_IMPLEMENTATION.md",
        "BELT_SCROLL_IMPLEMENTATION.md",
        "SCROLLBAR_AUTO_HIDE_IMPLEMENTATION.md",
        "BOUNDARY_DEFENSE_IMPLEMENTATION.md",
        "SYSTEM_IMAGE_OPENER.md"
    )
    
    # 迁移指南
    "migrations" = @(
        "PHASE_3_MIGRATION_GUIDE.md",
        "GENERATION_MIGRATION_GUIDE.md",
        "REASONING_UI_MIGRATION_GUIDE.md"
    )
    
    # 数据库相关
    "database" = @(
        "SQLITE_ENHANCEMENT_IMPLEMENTATION.md",
        "SQLITE_FTS5_MIGRATION_PLAN.md",
        "SEARCH_FTS5_IMPROVEMENT.md",
        "STORAGE_VERIFICATION_REPORT.md",
        "OLD_STORAGE_REMOVAL_COMPLETE.md"
    )
    
    # Tailwind 相关
    "tailwind" = @(
        "TAILWIND_V4_SUMMARY.md",
        "TAILWIND_V4_VERIFICATION.md"
    )
    
    # 测试记录
    "testing" = @(
        "QUANTILE_SLIDER_TEST_GUIDE.md",
        "TEST_2.2_REASONING_CONTROL.md",
        "REASONING_TESTING_STRATEGY.md",
        "BRANCH_DELETE_TEST_GUIDE.md"
    )
    
    # 其他分类
    "misc" = @(
        "GENERATION_ARCHITECTURE_INDEX.md",
        "GENERATION_ARCHITECTURE_SUMMARY.md",
        "PHASE_3_UI_CONFIG_INTEGRATION.md",
        "USAGE_STATISTICS_IMPLEMENTATION_PLAN.md",
        "REASONING_PERSISTENCE_ANALYTICS.md",
        "SAMPLING_PARAMETERS_NONLINEAR_MAPPING.md",
        "ARCHIVED_COMPONENTS.md",
        "CLEANUP_SUMMARY.md",
        "CODE_CLEANUP_REPORT.md",
        "ALL_FIXES_COMPLETE.md",
        "PRIORITY_FIXES_SUMMARY.md",
        "RECENT_FIXES_2025_11.md",
        "RECENT_UPDATES_2025_01.md",
        "ANALYTICS_UI_CHANGELOG.md",
        "ANALYTICS_UI_QUICK_REF.md",
        "ANALYTICS_UI_VISUAL_EXAMPLES.html",
        "CHAT_TOOLBAR_VISUAL_PREVIEW.md",
        "PROJECT_MANAGEMENT_FIXES.md",
        "DOM_CLEANUP_VERIFICATION.md",
        "DEBUG_MODEL_LIST.md",
        "DEBUG_REASONING_DISPLAY_INVESTIGATION.md",
        "DEBUG_USAGE_RAW.md",
        "REFACTOR_TODO_OVERVIEW.md",
        "STORYBOOK_PHASE2_COMPLETE.md"
    )
    
    # 计划文档
    "plans" = @(
        "TODO_1.3_USECONVERSATIONSEARCH_PLAN.md",
        "TODO_2_PROJECTMANAGER_PLAN.md"
    )
}

# 测试脚本移动目标
$performanceScripts = @(
    "paste-performance-test.js",
    "save-optimization-test.js"
)

# 统计信息
$stats = @{
    TotalFiles = 0
    MovedFiles = 0
    SkippedFiles = 0
    Errors = 0
}

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Add-ArchiveHeader {
    param(
        [string]$FilePath
    )
    
    if (-not (Test-Path $FilePath)) {
        return $false
    }
    
    $content = Get-Content $FilePath -Raw -Encoding UTF8
    $newContent = $archiveHeader + "`n" + $content
    Set-Content $FilePath -Value $newContent -Encoding UTF8
    return $true
}

function Move-DocumentToArchive {
    param(
        [string]$FileName,
        [string]$Category
    )
    
    $sourcePath = Join-Path $docsPath $FileName
    $targetDir = Join-Path $archivePath $Category
    $targetPath = Join-Path $targetDir $FileName
    
    # 检查源文件是否存在
    if (-not (Test-Path $sourcePath)) {
        Write-ColorOutput "  ⚠️  文件不存在: $FileName" "Yellow"
        $stats.SkippedFiles++
        return
    }
    
    # 创建目标目录
    if (-not (Test-Path $targetDir)) {
        if (-not $DryRun) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
    }
    
    # 模拟运行模式
    if ($DryRun) {
        Write-ColorOutput "  [DRY-RUN] $FileName → archive/$Category/" "Cyan"
        $stats.MovedFiles++
        return
    }
    
    # 添加归档标记
    Write-ColorOutput "  📝 添加归档标记: $FileName" "Gray"
    Add-ArchiveHeader -FilePath $sourcePath | Out-Null
    
    # 移动文件
    Move-Item -Path $sourcePath -Destination $targetPath -Force
    Write-ColorOutput "  ✅ 已归档: $FileName → archive/$Category/" "Green"
    $stats.MovedFiles++
}

# 主执行逻辑
Write-ColorOutput "`n==================================================" "Cyan"
Write-ColorOutput "  Starverse 文档归档脚本" "Cyan"
Write-ColorOutput "  基于五维判断法则的安全归档" "Cyan"
Write-ColorOutput "==================================================" "Cyan"

if ($DryRun) {
    Write-ColorOutput "`n⚠️  模拟运行模式（不实际移动文件）`n" "Yellow"
}

# 确认执行
if (-not $Force -and -not $DryRun) {
    Write-ColorOutput "`n即将归档 $($archiveMap.Values | ForEach-Object { $_.Count } | Measure-Object -Sum | Select-Object -ExpandProperty Sum) 个文档到 archive/ 目录" "Yellow"
    $confirmation = Read-Host "确认执行? (y/N)"
    if ($confirmation -ne 'y') {
        Write-ColorOutput "`n操作已取消" "Red"
        exit 0
    }
}

# 执行归档
Write-ColorOutput "`n开始归档..." "Cyan"

foreach ($category in $archiveMap.Keys) {
    $files = $archiveMap[$category]
    $stats.TotalFiles += $files.Count
    
    Write-ColorOutput "`n[$category] ($($files.Count) 个文件)" "Magenta"
    
    foreach ($file in $files) {
        try {
            Move-DocumentToArchive -FileName $file -Category $category
        }
        catch {
            Write-ColorOutput "  ❌ 错误: $file - $_" "Red"
            $stats.Errors++
        }
    }
}

# 移动测试脚本
Write-ColorOutput "`n[performance-scripts] ($($performanceScripts.Count) 个文件)" "Magenta"
$scriptsTarget = Join-Path $PSScriptRoot "scripts\performance"

foreach ($script in $performanceScripts) {
    $sourcePath = Join-Path $docsPath $script
    
    if (Test-Path $sourcePath) {
        if (-not $DryRun) {
            if (-not (Test-Path $scriptsTarget)) {
                New-Item -ItemType Directory -Path $scriptsTarget -Force | Out-Null
            }
            Move-Item -Path $sourcePath -Destination (Join-Path $scriptsTarget $script) -Force
            Write-ColorOutput "  ✅ 已移动: $script → scripts/performance/" "Green"
        }
        else {
            Write-ColorOutput "  [DRY-RUN] $script → scripts/performance/" "Cyan"
        }
        $stats.MovedFiles++
    }
    else {
        Write-ColorOutput "  ⚠️  文件不存在: $script" "Yellow"
        $stats.SkippedFiles++
    }
}

# 删除临时调试文档
$tempDocs = @("DEBUG_LOGGING_ADDED.md")
Write-ColorOutput "`n[临时文档删除] ($($tempDocs.Count) 个文件)" "Magenta"

foreach ($doc in $tempDocs) {
    $sourcePath = Join-Path $docsPath $doc
    
    if (Test-Path $sourcePath) {
        if (-not $DryRun) {
            Remove-Item -Path $sourcePath -Force
            Write-ColorOutput "  🗑️  已删除: $doc" "Red"
        }
        else {
            Write-ColorOutput "  [DRY-RUN] 将删除: $doc" "Cyan"
        }
        $stats.MovedFiles++
    }
    else {
        Write-ColorOutput "  ⚠️  文件不存在: $doc" "Yellow"
        $stats.SkippedFiles++
    }
}

# 输出统计信息
Write-ColorOutput "`n==================================================" "Cyan"
Write-ColorOutput "  归档完成" "Cyan"
Write-ColorOutput "==================================================" "Cyan"
Write-ColorOutput "`n统计信息:" "White"
Write-ColorOutput "  总文件数: $($stats.TotalFiles)" "White"
Write-ColorOutput "  已归档: $($stats.MovedFiles)" "Green"
Write-ColorOutput "  跳过: $($stats.SkippedFiles)" "Yellow"
Write-ColorOutput "  错误: $($stats.Errors)" "Red"

if ($DryRun) {
    Write-ColorOutput "`n提示: 这是模拟运行。使用 -Force 参数执行实际归档。" "Yellow"
}
else {
    Write-ColorOutput "`n✅ 归档完成！历史文档已移至 docs/archive/ 目录" "Green"
    Write-ColorOutput "`n下一步:" "Cyan"
    Write-ColorOutput "  1. 查看 docs/INDEX.md 了解新的文档结构" "White"
    Write-ColorOutput "  2. 阅读 docs/DOCUMENT_CLEANUP_AUDIT.md 了解归档理由" "White"
    Write-ColorOutput "  3. 6 个月后运行清理脚本删除无人访问的归档文件" "White"
}

Write-ColorOutput ""
