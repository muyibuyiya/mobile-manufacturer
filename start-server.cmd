@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [!] 未找到 Node.js，请先安装 Node.js 18+ 后再运行本脚本。
  pause
  exit /b 1
)

if not exist "tools\serve.cjs" (
  echo [!] 未找到 tools\serve.cjs，请确认脚本位于项目根目录。
  pause
  exit /b 1
)

echo ============================================
echo   手机开发商 · 本地服务器
echo   地址: http://127.0.0.1:8124
echo   按 Ctrl+C 停止服务器
echo ============================================
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8124/'"
node "tools\serve.cjs" 8124

if errorlevel 1 (
  echo.
  echo [!] 服务器启动失败。若端口 8124 已被占用，请先关闭占用程序后重试。
  pause
)