@echo off
echo ========================================
echo    OKX量化交易系统 - GitHub部署脚本
echo ========================================
echo.

echo 正在检查Git是否已安装...
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Git未安装，请先安装Git for Windows
    echo 下载地址: https://git-scm.com/download/win
    pause
    exit /b 1
)

echo ✅ Git已安装
echo.

echo 正在初始化Git仓库...
git init
if %errorlevel% neq 0 (
    echo ❌ Git初始化失败
    pause
    exit /b 1
)

echo ✅ Git仓库初始化成功
echo.

echo 正在添加文件到暂存区...
git add .
if %errorlevel% neq 0 (
    echo ❌ 添加文件失败
    pause
    exit /b 1
)

echo ✅ 文件添加成功
echo.

echo 正在创建初始提交...
git commit -m "Initial commit: OKX量化交易监控系统

- 实时行情监控
- 技术指标计算  
- 量化交易引擎
- 多种交易策略
- 现代化Web界面"
if %errorlevel% neq 0 (
    echo ❌ 提交失败
    pause
    exit /b 1
)

echo ✅ 初始提交创建成功
echo.

echo 正在添加远程仓库...
git remote add origin https://github.com/jjkbb123/auto_trans.git
if %errorlevel% neq 0 (
    echo ⚠️ 远程仓库可能已存在，继续执行...
)

echo ✅ 远程仓库配置完成
echo.

echo 正在推送到GitHub...
git push -u origin main
if %errorlevel% neq 0 (
    echo ❌ 推送失败，请检查网络连接和GitHub权限
    pause
    exit /b 1
)

echo.
echo ========================================
echo ✅ 部署成功！
echo ========================================
echo.
echo 您的项目已成功推送到GitHub:
echo https://github.com/jjkbb123/auto_trans
echo.
echo 现在您可以:
echo 1. 在GitHub上查看您的代码
echo 2. 分享给其他人
echo 3. 继续开发新功能
echo.
pause 