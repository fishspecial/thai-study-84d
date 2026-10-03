@echo off
rem 泰语学习 · 预览服务自启
rem 放在 shell:startup 里即可开机自动运行（见 README 说明）。
rem 已存在就退出，避免重复起进程占端口。

set PORT=8848
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT%" ^| findstr LISTENING') do (
  echo 端口 %PORT% 已被占用，进程 %%p，服务应在运行。
  exit /b 0
)

set NODE="C:\Users\Chuyu Tan\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"
set TOOLS=%~dp0..\

echo 启动泰语学习预览服务 http://127.0.0.1:%PORT%/
start "" /min %NODE% "%TOOLS%live-server.js" %PORT%
timeout /t 2 /nobreak >nul
echo 完成。以后直接访问 http://127.0.0.1:%PORT%/
