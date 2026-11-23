@echo off
title Khoi Dong He Thong PharmaCore [5 Cong Dich Vu]
color 0B
cls

echo ==============================================================================
echo    HE THONG QUAN TRI DUOC, BAN HANG ONLINE VA AI LAM SANG - PHARMACORE
echo ==============================================================================
echo.

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

REM 1. Kiem tra Node.js
where node >nul 2>&1
if errorlevel 1 (
    color 0C
    echo [LOI] May tinh cua ban chua cai dat Node.js!
    echo Vui long tai va cai dat Node.js LTS tai: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM 2. Tim Python cho AI Service [Cong 8000]
set "PY_CMD="
if exist "%ROOT_DIR%ai-service\.venv\Scripts\python.exe" set "PY_CMD="%ROOT_DIR%ai-service\.venv\Scripts\python.exe""
if defined PY_CMD goto :FOUND_PYTHON

py -3.10 --version >nul 2>&1
if not errorlevel 1 set "PY_CMD=py -3.10"
if defined PY_CMD goto :FOUND_PYTHON

where python >nul 2>&1
if not errorlevel 1 set "PY_CMD=python"

:FOUND_PYTHON

REM 3. Giai phong cac cong cu [5000, 5173, 5174, 8000]
echo [*] Dang kiem tra va giai phong cong cu [5000, 5173, 5174, 8000]...
for %%P in (5000 5173 5174 8000) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
        taskkill /f /pid %%a >nul 2>&1
    )
)

REM 4. Kiem tra va Khoi dong Ollama Local LLM [Cong 11434]
netstat -ano | findstr ":11434 " | findstr LISTENING >nul 2>&1
if not errorlevel 1 (
    echo [1/5] Ollama Local LLM [Port 11434] dang chay san.
    goto :AFTER_OLLAMA
)

if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
    echo [1/5] Dang khoi dong Ollama Local LLM [Port 11434]...
    start "PharmaCore Ollama [Port 11434]" /min "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
    goto :AFTER_OLLAMA
)

where ollama >nul 2>&1
if not errorlevel 1 (
    echo [1/5] Dang khoi dong Ollama Local LLM [Port 11434]...
    start "PharmaCore Ollama [Port 11434]" /min ollama serve
    goto :AFTER_OLLAMA
)

echo [!] Khong tim thay Ollama Local - He thong se su dung Google Gemini API.

:AFTER_OLLAMA

REM 5. Kiem tra thu vien va Database
if not exist "%ROOT_DIR%backend\node_modules" (
    echo [!] Dang cai dat thu vien Backend...
    cd /d "%ROOT_DIR%backend"
    call npm install
    cd /d "%ROOT_DIR%"
)

if not exist "%ROOT_DIR%backend\prisma\pharmacy.db" (
    echo [!] Chua thay database SQLite. Dang khoi tao schema va du lieu mau...
    cd /d "%ROOT_DIR%backend"
    call npx prisma db push
    call npm run db:seed
    cd /d "%ROOT_DIR%"
)

if not exist "%ROOT_DIR%frontend\node_modules" (
    echo [!] Dang cai dat thu vien ERP Frontend...
    cd /d "%ROOT_DIR%frontend"
    call npm install
    cd /d "%ROOT_DIR%"
)

if not exist "%ROOT_DIR%storefront\node_modules" (
    echo [!] Dang cai dat thu vien Storefront Online...
    cd /d "%ROOT_DIR%storefront"
    call npm install
    cd /d "%ROOT_DIR%"
)

REM 6. Khoi chay Python AI Service [Port 8000]
if not defined PY_CMD (
    echo [!] Chua tim thay Python 3.10 - bo qua Python AI Service [Port 8000].
    goto :AFTER_PY_AI
)

echo [2/5] Dang khoi dong Python AI Service [Port 8000 - OCR, Voice STT, RAG]...
start "PharmaCore Python AI [Port 8000]" cmd /k "cd /d "%ROOT_DIR%ai-service" && %PY_CMD% main.py"

:AFTER_PY_AI

REM 7. Khoi chay Backend API [Port 5000]
echo [3/5] Dang khoi dong Backend API [Port 5000]...
start "PharmaCore Backend API [Port 5000]" cmd /k "cd /d "%ROOT_DIR%backend" && npm run dev"

REM 8. Khoi chay ERP Frontend [Port 5173]
echo [4/5] Dang khoi dong ERP Frontend [Port 5173]...
start "PharmaCore ERP Frontend [Port 5173]" cmd /k "cd /d "%ROOT_DIR%frontend" && npm run dev"

REM 9. Khoi chay Storefront Ban Thuoc Online [Port 5174]
echo [5/5] Dang khoi dong Storefront Ban Thuoc Online [Port 5174]...
start "PharmaCore Storefront [Port 5174]" cmd /k "cd /d "%ROOT_DIR%storefront" && npm run dev"

REM 10. Cho 5 giay de Vite & Express san sang roi tu dong mo trinh duyet
echo [*] Dang cho cac dich vu khoi dong [5 giay]...
ping 127.0.0.1 -n 6 >nul

echo [*] Dang mo trinh duyet ERP [http://localhost:5173] va Storefront [http://localhost:5174]...
start "" "http://localhost:5173"
start "" "http://localhost:5174"

color 0A
cls
echo ==============================================================================
echo                 KHOI DONG TOAN BO HE THONG THANH CONG!
echo ==============================================================================
echo.
echo  1. He thong Quan tri ERP ^& POS  : http://localhost:5173
echo  2. Website Nha thuoc Storefront : http://localhost:5174
echo  3. Backend API [Express]        : http://localhost:5000/api/health
echo  4. Python AI Service [FastAPI]  : http://127.0.0.1:8000/api/py-ai/health
echo  5. Ollama Local LLM             : http://127.0.0.1:11434
echo.
echo  * Luu y:
echo    - Python AI Service [Port 8000] can khoang 20-35 giay luc moi bat de nap
echo      4 model AI [RapidOCR, Faster-Whisper, Multilingual-MiniLM, Qwen/Gemini].
echo    - De tat toan bo 5 dich vu: Nhap dup vao file 'stop-app.bat'.
echo.
echo ==============================================================================
echo Nhan phim bat ky de dong cua so thong bao nay [cac dich vu van chay ngam]...
pause >nul
