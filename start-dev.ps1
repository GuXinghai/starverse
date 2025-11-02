# 设置控制台编码为 UTF-8
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

# 设置窗口标题
$host.UI.RawUI.WindowTitle = "Starverse 开发服务器"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🚀 正在启动 Starverse 开发服务器..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 运行开发服务器
npm run dev

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "开发服务器已停止" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
