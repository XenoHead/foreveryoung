@echo off
:: ============================================================
:: deploy.bat - Deploy ForeverYoung + Staff to Cloudflare Pages
:: Customer deploy is built from an allowlist (build-deploy-stage.ps1),
:: so only public assets ship. The repo root is never uploaded.
:: Requires: CLOUDFLARE_API_TOKEN env var set (user scope is fine).
:: Run via: cmd //c deploy.bat   (from git-bash/MSYS)
::        or: deploy.bat          (from cmd/PowerShell)
:: ============================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================
echo  Deploying ForeverYoung + Staff to Cloudflare Pages
echo  %date% %time%
echo ============================================================
echo.

if "%CLOUDFLARE_API_TOKEN%"=="" (
    echo [!] CLOUDFLARE_API_TOKEN not set.
    echo    Set it: setx CLOUDFLARE_API_TOKEN cfat_...
    echo    Or run: cmd //c "set CLOUDFLARE_API_TOKEN=cfat_... && deploy.bat"
    echo.
    pause
    exit /b 1
)

set "ACCOUNT_ID=5ea78a3d3e41e851763e229630e62c94"
set "CLOUDFLARE_ACCOUNT_ID=5ea78a3d3e41e851763e229630e62c94"
set "FY_DIR=C:\Git\ForeverYoung"
set "STAFF_DIR=C:\Git\staff.foreveryoung"
set "STAGE=%TEMP%\fy-deploy-stage"

echo [1/4] Building customer deploy stage from allowlist...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%FY_DIR%\build-deploy-stage.ps1" -SourceDir "%FY_DIR%" -StageDir "%STAGE%"
if errorlevel 1 (
    echo.
    echo [!] Staging failed - nothing was deployed.
    pause
    exit /b 1
)

echo.
echo [2/4] Deploying ForeverYoung (customer)...
echo.
cd /d "%STAGE%"
call npx wrangler pages deploy . --project-name foreveryoung --branch main ^
    --commit-message "Manual deploy: %date% %time%" ^
    --commit-dirty=true
if errorlevel 1 (
    echo.
    echo [!] Customer deploy failed - staff was NOT deployed.
    pause
    exit /b 1
)

echo.
echo [3/4] Deploying Staff...
echo.
cd /d "%STAFF_DIR%"
call npx wrangler pages deploy . --project-name staff-foreveryoung --branch main ^
    --commit-message "Manual deploy: %date% %time%" ^
    --commit-dirty=true
if errorlevel 1 (
    echo.
    echo [!] Staff deploy failed. Customer deploy already went out.
    pause
    exit /b 1
)

echo.
echo [4/4] Cleaning up stage...
rmdir /S /Q "%STAGE%" >nul 2>&1
echo   - done
echo.

echo ============================================================
echo  Deploy complete.
echo  ForeverYoung: https://foreveryoung-ekz.pages.dev
echo  Staff:        https://staff-foreveryoung-4dp.pages.dev
echo ============================================================
echo.
endlocal
