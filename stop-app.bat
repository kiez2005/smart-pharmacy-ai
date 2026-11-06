@echo off
chcp 65001 >nul
title PharmaCore ERP - Dung He Thong
color 0E
cls

echo ==============================================================================
echo           DANG DUNG TOAN BO TIEN TRINH DICH VU PHARMACORE ERP...
echo ==============================================================================
echo.

echo [1/2] Dang tat dich vu Backend tren cong 5000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo [2/2] Dang tat dich vu Frontend tren cong 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

color 0A
echo.
echo ==============================================================================
echo  [HOAN TAT] Da tat thanh cong toan bo dich vu va giai phong cong 5000, 5173!
echo ==============================================================================
echo.
timeout /t 2 >nul 2>&1 || ping 127.0.0.1 -n 3 >nul
