@echo off
chcp 65001 >nul
title PharmaCore ERP - Khoi Dong He Thong
color 0B
cls

echo ==============================================================================
echo       HE THONG QUAN TRI DUOC ^& BAN LE POS THONG MINH - PHARMACORE ERP
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
    echo Sau khi cai xong, vui long khoi dong lai file nay.
    echo.
    pause
    exit /b 1
)

REM 2. Don dep tien trinh cu tren cong 5000 va 5173
echo [*] Dang kiem tra va giai phong cong ket noi cu (5000, 5173)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

REM 3. Kiem tra node_modules Backend
if not exist "%ROOT_DIR%backend\node_modules" (
    echo [!] Backend chua co thu vien node_modules. Dang cai dat, xin cho giay lat...
    cd /d "%ROOT_DIR%backend"
    call npm install
    cd /d "%ROOT_DIR%"
    echo [OK] Da cai dat xong thu vien Backend!
    echo.
)

REM 4. Kiem tra Database SQLite va Seed du lieu mau neu chua co
if not exist "%ROOT_DIR%backend\prisma\pharmacy.db" (
    echo [!] Chua tim thay database SQLite. Dang khoi tao va nap du lieu mau...
    cd /d "%ROOT_DIR%backend"
    call npx prisma db push
    call npm run db:seed
    cd /d "%ROOT_DIR%"
    echo [OK] Da khoi tao xong Database!
    echo.
)

REM 5. Kiem tra node_modules Frontend
if not exist "%ROOT_DIR%frontend\node_modules" (
    echo [!] Frontend chua co thu vien node_modules. Dang cai dat, xin cho giay lat...
    cd /d "%ROOT_DIR%frontend"
    call npm install
    cd /d "%ROOT_DIR%"
    echo [OK] Da cai dat xong thu vien Frontend!
    echo.
)

REM 6. Khoi chay Backend API (Port 5000)
echo [1/3] Dang khoi dong Backend API (Port 5000)...
cd /d "%ROOT_DIR%backend"
start "PharmaCore Backend API (Port 5000)" cmd /k "title PharmaCore Backend (Port 5000) && npm run dev"
cd /d "%ROOT_DIR%"

REM 7. Khoi chay Frontend Vite (Port 5173)
echo [2/3] Dang khoi dong Frontend Web UI (Port 5173)...
cd /d "%ROOT_DIR%frontend"
start "PharmaCore Frontend (Port 5173)" cmd /k "title PharmaCore Frontend (Port 5173) && npm run dev"
cd /d "%ROOT_DIR%"

REM 8. Cho 3 giay va mo trinh duyet
echo [3/3] Dang cho he thong khoi dong va mo trinh duyet...
timeout /t 3 >nul 2>&1 || ping 127.0.0.1 -n 4 >nul

echo [*] Dang mo trinh duyet web...
start http://localhost:5173

color 0A
cls
echo ==============================================================================
echo                 KHOI DONG HE THONG THANH CONG!
echo ==============================================================================
echo.
echo  - Giao dien Web (Frontend) : http://localhost:5173
echo  - May chu API (Backend)    : http://localhost:5000
echo  - Trang thai he thong      : http://localhost:5000/api/health
echo.
echo  - Tai khoan mac dinh       : Duoc si Nguyen Van Trung (ADMIN)
echo.
echo  * Huong dan su dung:
echo    + De dung toan bo he thong: Nhap dup vao file 'stop-app.bat' hoac tat 2 cua so cmd.
echo    + Cac cua so Backend va Frontend can duoc giu mo khi lam viec.
echo.
echo ==============================================================================
echo Ban co the dong cua so nay bat cu luc nao (he thong van tiep tuc chay).
pause >nul 2>&1
