# Starverse 文档归档脚本
# 将已完成的项目文档移动到归档目录

$docsPath = "d:\Starverse\docs"
$archivePath = "$docsPath\archive"

# 定义归档规则
$archiveRules = @{
    "refactoring" = @(
        "PHASE_0_INFRASTRUCTURE_COMPLETE.md",
        "PHASE_1_BUTTON_REFACTOR_COMPLETE.md",
        "PHASE_2_QUICK_SUMMARY.md",
        "PHASE2_INTEGRATION_STATUS.md",
        "PHASE3.4_INTEGRATION_STRATEGY.md",
        "PHASE3.4_STORE_INTEGRATION_STATUS.md",
        "REFACTOR_SUMMARY_PHASE3_COMPLETE.md"
    )
    "completed-features" = @(
        "BRANCH_TREE_REFACTOR_COMPLETE.md",
        "CHAT_TOOLBAR_REFACTOR.md",
        "CHAT_TOOLBAR_REDESIGN.md",
        "CHAT_TOOLBAR_VISUAL_PREVIEW.md",
        "INCREMENTAL_SERIALIZATION_IMPLEMENTATION.md",
        "MESSAGE_STREAMING_IMPLEMENTATION.md",
        "OLD_STORAGE_REMOVAL_COMPLETE.md",
        "PRIORITY_FIXES_COMPLETE.md",
        "PRIORITY_FIXES_SUMMARY.md",
        "PROJECT_SYSTEM_IMPLEMENTATION.md",
        "SCROLL_CONTROL_IMPLEMENTATION.md",
        "THINKING_INDICATOR_IMPLEMENTATION.md",
        "USER_PROVIDED_KEY_IMPLEMENTATION.md"
    )
    "bugfixes" = @(
        "BRANCH_DELETE_FIX.md",
        "CHAT_CONTENT_DISAPPEAR_FIX.md",
        "CONFIG_CORRUPTION_FIX.md",
        "FAVORITE_MODEL_SELECTOR_FIX.md",
        "FIX_MESSAGE_DUPLICATION.md",
        "FIX_MESSAGE_DUPLICATION_COMPLETE.md",
        "ISSUE_2_PARAMETER_PERSISTENCE_FIX.md",
        "PATH_FIX.md",
        "RECENT_FIXES.md",
        "RECENT_FIXES_SUMMARY_NOV.md"
    )
    "optimizations" = @(
        "BATCH_OPS_AND_CACHE_OPTIMIZATION.md",
        "BUTTON_INTERACTION_OPTIMIZATION.md",
        "CHAT_SWITCHING_OPTIMIZATION_IMPLEMENTATION.md",
        "CHUNKED_SAVE_IMPLEMENTATION.md",
        "INCREMENTAL_SERIALIZATION_GUIDE.md",
        "MODEL_PARAMETERS_OPTIMIZATION.md",
        "PERFORMANCE_OPTIMIZATION_COMPLETE.md",
        "SCROLL_OPTIMIZATION_IMPLEMENTATION.md",
        "TAB_SWITCHING_PERSISTENCE_OPTIMIZATION.md"
    )
    "ui-implementations" = @(
        "ADVANCED_MODEL_PICKER_IMPLEMENTATION.md",
        "ANALYTICS_UI_ENHANCEMENT.md",
        "ANALYTICS_UI_CHANGELOG.md",
        "ANALYTICS_UI_QUICK_REF.md",
        "ANALYTICS_UI_VISUAL_EXAMPLES.html",
        "BELT_SCROLL_IMPLEMENTATION.md",
        "BOUNDARY_DEFENSE_IMPLEMENTATION.md",
        "ERROR_DISPLAY_IMPLEMENTATION.md",
        "NEW_CHAT_BUTTON_IMPLEMENTATION.md",
        "QUANTILE_SLIDER_TEST_GUIDE.md",
        "SIDEBAR_IMPROVEMENTS.md",
        "SYSTEM_IMAGE_OPENER.md"
    )
    "migrations" = @(
        "TAILWIND_V4_MIGRATION_COMPLETE.md",
        "TAILWIND_V4_MIGRATION_IMPLEMENTATION.md",
        "TAILWIND_V4_MIGRATION_REPORT.md",
        "TAILWIND_V4_MIGRATION_SUMMARY.md"
    )
    "database" = @(
        "MULTITHREADING_IMPLEMENTATION.md",
        "SQLITE_OPTIMIZATION_PLAN.md",
        "WORKER_THREAD_ARCHITECTURE.md"
    )
    "testing" = @(
        "DOM_CLEANUP_VERIFICATION.md",
        "MESSAGE_DUPLICATION_TEST_RESULTS.md",
        "REASONING_DISPLAY_FIX_VERIFICATION.md"
    )
    "analysis" = @(
        "CHAT_SWITCHING_LAG_ANALYSIS.md",
        "CHAT_SWITCHING_RECOMPUTATION_ANALYSIS.md",
        "CHATVIEW_ISSUES_ANALYSIS.md",
        "CLONE_ERROR_ANALYSIS.md",
        "DEBOUNCE_ANALYSIS.md",
        "DISPLAYMESSAGES_CACHE_ANALYSIS.md",
        "FOCUS_ISSUE_REPORT.md",
        "LONG_CONVERSATION_PERFORMANCE.md",
        "PASTE_PERFORMANCE_ANALYSIS.md",
        "PROXY_ISSUE_DEEP_ANALYSIS.md"
    )
    "documentation" = @(
        "CLEANUP_AUDIT_PLAN.md",
        "DOCUMENTATION_CLEANUP_PLAN.md",
        "DOCUMENTATION_EXECUTION_GUIDE.md"
    )
}

# 执行归档
$movedCount = 0
$failedCount = 0
$failedFiles = @()

foreach ($category in $archiveRules.Keys) {
    $targetPath = "$archivePath\$category"
    Write-Host ""
    Write-Host "正在归档到: $category" -ForegroundColor Cyan
    
    foreach ($file in $archiveRules[$category]) {
        $sourcePath = "$docsPath\$file"
        $destPath = "$targetPath\$file"
        
        if (Test-Path $sourcePath) {
            try {
                Move-Item -Path $sourcePath -Destination $destPath -Force
                Write-Host "  OK: $file" -ForegroundColor Green
                $movedCount++
            }
            catch {
                Write-Host "  FAIL: $file" -ForegroundColor Red
                $failedCount++
                $failedFiles += $file
            }
        }
        else {
            Write-Host "  SKIP: $file (不存在)" -ForegroundColor Yellow
        }
    }
}

# 汇总报告
Write-Host ""
Write-Host "=============================================================" -ForegroundColor Blue
Write-Host "归档完成汇总" -ForegroundColor Cyan
Write-Host "=============================================================" -ForegroundColor Blue
Write-Host "成功归档: $movedCount 个文件" -ForegroundColor Green
if ($failedCount -gt 0) {
    Write-Host "归档失败: $failedCount 个文件" -ForegroundColor Red
    Write-Host ""
    Write-Host "失败文件列表:" -ForegroundColor Yellow
    foreach ($f in $failedFiles) {
        Write-Host "  - $f" -ForegroundColor Yellow
    }
}
Write-Host "=============================================================" -ForegroundColor Blue
