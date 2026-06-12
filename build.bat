@echo off
chcp 65001 >nul
title ValQ 打包工具

echo.
echo ========================================
echo   ValQ 应用打包工具
echo ========================================
echo.

:: 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

:: 进入项目目录
cd /d "%~dp0"

echo [步骤 1] 清理旧的构建文件...
if exist "dist" rmdir /s /q "dist"
if exist "release" rmdir /s /q "release"

echo [步骤 2] 构建 Vite 前端...
call npm run build
if %errorlevel% neq 0 (
    echo [错误] Vite 构建失败
    pause
    exit /b 1
)

echo [步骤 3] 检查 Electron 环境...
if not exist "node_modules\electron" (
    echo [警告] Electron 未安装，正在安装...
    call npm install electron electron-builder --save-dev
)

echo [步骤 4] 检查 PBI Proxy...
if not exist "pbi-proxy\pbi-proxy.exe" (
    echo [警告] pbi-proxy.exe 不存在
    echo [提示] 请先编译 pbi-proxy:
    echo        cd pbi-proxy && dotnet publish -c Release
    echo.
    choice /c YN /m "是否继续打包（不含 PBI Proxy）？"
    if errorlevel 2 exit /b 1
)

echo [步骤 5] 检查应用图标...
if not exist "build\icon.ico" (
    echo [警告] 应用图标不存在，正在创建默认图标...
    mkdir build >nul 2>nul
    echo [提示] 建议将 256x256 的 .ico 图标文件放入 build\icon.ico
)

echo [步骤 6] Electron 打包...
call npm run electron:build
if %errorlevel% neq 0 (
    echo [错误] Electron 打包失败
    pause
    exit /b 1
)

echo.
echo ========================================
echo   打包完成！
echo ========================================
echo.
echo 输出目录: %cd%\release
echo.

:: 列出生成的文件
dir release /b 2>nul

echo.
echo 按任意键退出...
pause >nul