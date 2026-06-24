@echo off
chcp 65001 >nul
title ValQ 开发模式

echo.
echo ========================================
echo   ValQ 开发模式启动
echo ========================================
echo.

:: 进入项目目录
cd /d "%~dp0"

:: 检查依赖
if not exist "node_modules" (
    echo [提示] 正在安装依赖...
    call npm install
)

echo [启动] 正在启动 Vite 开发服务器...
echo.
echo 提示：
echo   - 前端地址: http://localhost:3000
echo   - 按 Ctrl+C 停止服务器
echo.

call npm run dev