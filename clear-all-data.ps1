# Starverse 聊天记录完全清理工具

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        Starverse 聊天记录完全清理工具                       ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  警告：此操作将删除所有聊天记录和项目数据！" -ForegroundColor Yellow
Write-Host "⚠️  请确保 Starverse 应用已完全关闭！" -ForegroundColor Yellow
Write-Host ""
$confirmation = Read-Host "确认要继续吗？(输入 YES 确认)"

if ($confirmation -ne "YES") {
    Write-Host "❌ 操作已取消" -ForegroundColor Red
    exit
}

Write-Host ""
Write-Host "🧹 正在清理数据..." -ForegroundColor Green
Write-Host ""

node scripts\clear-all-data-standalone.cjs

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
