@echo off
chcp 65001 >nul
title Khoi Dong Toan Bo He Thong PharmaCore
color 0B
cls

echo ==============================================================================
echo    HE THONG QUAN TRI DUOC, BAN HANG ONLINE ^& AI LAM SANG - PHARMACORE
echo ==============================================================================
echo.

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

REM 1. Kiem tra Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [LOI] May tinh cua ban chua cai dat Node.js!
    echo Vui long tai va cai dat Node.js LTS tai: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM 2. Kiem tra Python cho AI Service (Cong 8000)
set "PY_CMD="
if exist "%ROOT_DIR%ai-service\.venv\Scripts\python.exe" (
    set PY_CMD="%ROOT_DIR%ai-service\.venv\Scripts\python.exe"
) else (
    py -3.10 --version >nul 2>&1
    if not errorlevel 1 (
        set "PY_CMD=py -3.10"
    ) else (
        where python >nul 2>&1
        if not errorlevel 1 set "PY_CMD=python"
    )
)

REM 3. Don dep tien trinh cu tren cac cong app (5000, 5173, 5174, 8000)
echo [*] Dang kiem tra va giai phong cong cu (5000, 5173, 5174, 8000)...
for %%P in (5000 5173 5174 8000) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
        taskkill /f /pid %%a >nul 2>&1
    )
)

REM 4. Kiem tra & Khoi dong Ollama Local LLM (Cong 11434) neu chua chay
netstat -ano | findstr ":11434 " | findstr LISTENING >nul 2>&1
if %errorlevel% equ 0 (
    echo [1/5] Ollama Local LLM (Port 11434) dang chay san.
) else (
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
        echo [1/5] Dang khoi dong Ollama Local LLM (Port 11434)...
        start "PharmaCore Ollama (Port 11434)" /min "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
    ) else (
        where ollama >nul 2>&1
        if not errorlevel 1 (
            echo [1/5] Dang khoi dong Ollama Local LLM (Port 11434)...
            start "PharmaCore Ollama (Port 11434)" /min ollama serve
        ) else (
            echo [!] Khong tim thay Ollama Desktop/CLI (bo qua cong 11434; co the dung Gemini API).
        )
    )
)

REM 5. Kiem tra & Cai dat thu vien Backend / Database / Frontend / Storefront
if not exist "%ROOT_DIR%backend\node_modules" (
    echo [!] Dang cai dat thu vien Backend...
    cd /d "%ROOT_DIR%backend"
    call npm install
    cd /d "%ROOT_DIR%"
)

if not exist "%ROOT_DIR%backend\prisma\pharmacy.db" (
    echo [!] Chua thay database SQLite. Dang tao schema & du lieu mau...
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

REM 6. Khoi chay Python AI Service (Port 8000)
if defined PY_CMD (
    %PY_CMD% -c "import uvicorn" >nul 2>&1
    if errorlevel 1 (
        echo [!] Dang cai dat thu vien Python AI Service (ai-service/requirements.txt)...
        cd /d "%ROOT_DIR%ai-service"
        %PY_CMD% -m pip install -r requirements.txt
        cd /d "%ROOT_DIR%"
    )
    echo [2/5] Dang khoi dong Python AI Service (Port 8000 - OCR, Whisper STT, RAG)...
    cd /d "%ROOT_DIR%ai-service"
    start "PharmaCore Python AI (Port 8000)" cmd /k "title PharmaCore Python AI (Port 8000) && %PY_CMD% -m uvicorn main:app --host 127.0.0.1 --port 8000"
    cd /d "%ROOT_DIR%"
) else (
    echo [!] Chua cai Python — bo qua Python AI Service (Port 8000).
)

REM 7. Khoi chay Backend API (Port 5000)
echo [3/5] Dang khoi dong Backend API (Port 5000)...
cd /d "%ROOT_DIR%backend"
start "PharmaCore Backend API (Port 5000)" cmd /k "title PharmaCore Backend (Port 5000) && npm run dev"
cd /d "%ROOT_DIR%"

REM 8. Khoi chay ERP Frontend (Port 5173)
echo [4/5] Dang khoi dong ERP Frontend (Port 5173)...
cd /d "%ROOT_DIR%frontend"
start "PharmaCore ERP Frontend (Port 5173)" cmd /k "title PharmaCore ERP Frontend (Port 5173) && npm run dev -- --port 5173 --strictPort"
cd /d "%ROOT_DIR%"

REM 9. Khoi chay Storefront Ban Thuoc Online (Port 5174)
echo [5/5] Dang khoi dong Storefront Ban Thuoc Online (Port 5174)...
cd /d "%ROOT_DIR%storefront"
start "PharmaCore Storefront (Port 5174)" cmd /k "title PharmaCore Storefront (Port 5174) && npm run dev -- --port 5174 --strictPort"
cd /d "%ROOT_DIR%"

REM 10. Cho 4 giay va mo trinh duyet
echo [*] Dang cho cac dich vu khoi dong (AI Service can ~20s lan dau nap model)...
timeout /t 4 >nul 2>&1 || ping 127.0.0.1 -n 5 >nul

echo [*] Dang mo trinh duyet ERP (5173) va Storefront (5174)...
start http://localhost:5173
start http://localhost:5174

color 0A
cls
echo ==============================================================================
echo                 KHOI DONG TOAN BO HE THONG THANH CONG!
echo ==============================================================================
echo.
echo  - ERP Quan tri & POS      : http://localhost:5173
echo  - Storefront Online & AI  : http://localhost:5174
echo  - Backend API (Express)   : http://localhost:5000  (/api/health)
echo  - Python AI Service       : http://127.0.0.1:8000  (/api/py-ai/health)
echo  - Ollama Local LLM        : http://127.0.0.1:11434
echo.
echo  * Huong dan:
echo    + De tat toan bo 5 dich vu: Nhap dup vao 'stop-app.bat'.
echo    + Python AI (Port 8000) mat ~15-30s luc moi bat de nap RapidOCR/Whisper/Embed.
echo.
echo ==============================================================================
echo Ban co the dong cua so nay bat cu luc nao (cac cua so dich vu van tiep tuc chay).
pause >nul 2>&1
