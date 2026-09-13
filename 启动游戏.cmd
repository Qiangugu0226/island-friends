@echo off
chcp 65001 >nul
title 小岛朋友 Island Friends - 本地服务器
cd /d "%~dp0"

echo ============================================================
echo    小岛朋友 Island Friends   P1 - 能走路的小岛
echo ============================================================
echo.
echo  这个窗口请保持打开：关掉它游戏就停止了。
echo  服务器就绪后浏览器会自动打开 http://127.0.0.1:5173/
echo.
echo  游戏里：WASD 移动 / 点一下画面锁鼠标转视角 / V 切换视角
echo          （第 4 个视角是「资产总览」，28 件资产带标签）
echo.

if not exist "node_modules" (
  echo  首次运行：正在安装依赖，可能要一两分钟...
  echo.
  call npm install
  echo.
)

call npm run dev -- --open
echo.
echo ------------------------------------------------------------
echo  服务器已停止。按任意键关闭本窗口。
echo ------------------------------------------------------------
pause >nul
