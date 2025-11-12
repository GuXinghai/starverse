@echo off
chcp 65001 >nul
echo ============================================
echo Electron 更新脚本
echo ============================================
echo.
echo 请确保已关闭 VS Code 和所有相关进程
echo.
pause

echo.
echo [1/4] 停止相关进程...
taskkill /F /IM electron.exe 2>nul
taskkill /F /IM node.exe 2>nul
taskkill /F /IM Code.exe 2>nul
timeout /t 3 >nul

echo [2/4] 删除旧的 Electron...
rd /s /q "node_modules\electron" 2>nul
rd /s /q "node_modules\.electron-*" 2>nul

echo [3/4] 清理 npm 缓存...
call npm cache clean --force

echo [4/4] 安装 Electron 39.1.1...
call npm install

echo.
echo ============================================
echo 完成！
echo ============================================
echo.
echo 现在可以运行: npm run rebuild
echo 然后运行: npm run dev
echo.
pause
