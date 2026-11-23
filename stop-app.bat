@echo off
title Dung Toan Bo Dich Vu PharmaCore
color 0E
cls

echo ==============================================================================
echo      DANG DUNG TOAN BO DICH VU PHARMACORE [5000, 5173, 5174, 8000, 11434]...
echo ==============================================================================
echo.

echo [1/5] Dang tat Backend API [Port 5000]...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000 " ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo [2/5] Dang tat ERP Frontend [Port 5173]...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo [3/5] Dang tat Storefront Online [Port 5174]...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174 " ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo [4/5] Dang tat Python AI Service [Port 8000]...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo [5/5] Dang tat Ollama Local LLM [Port 11434]...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":11434 " ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

taskkill /f /fi "WINDOWTITLE eq PharmaCore*" >nul 2>&1

color 0A
echo.
echo ==============================================================================
echo  [HOAN TAT] Da tat toan bo dich vu va giai phong 5 cong: 5000, 5173, 5174, 8000, 11434!
echo ==============================================================================
echo.
ping 127.0.0.1 -n 3 >nul
