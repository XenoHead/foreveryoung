@echo off
:: ============================================================
:: deploy.bat — Deploy ForeverYoung + Staff to Cloudflare Pages
:: Run from C:\Git\ForeverYoung after a coding session.
:: Requires: CLOUDFLARE_API_TOKEN env var set.
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
set "FY_DIR=C:\Git\ForeverYoung"
set "STAFF_DIR=C:\Git\staff.foreveryoung"

:: Use %TEMP% (works in both cmd and MSYS git-bash)
set "TMPDIR=%TEMP%\fy-deploy"

if not exist "%TMPDIR%" mkdir "%TMPDIR%"

echo [1/5] Moving large files out of deploy path...
echo.

:: ForeverYoung local DB export (if exists)
if exist "%FY_DIR%\local-db-export.sql" (
    if not exist "%TMPDIR%\local-db-export.sql" (
        move /Y "%FY_DIR%\local-db-export.sql" "%TMPDIR%\" >nul 2>&1
        if errorlevel 1 (
            echo   [!] Failed to move FY local-db-export.sql — check permissions
        ) else (
            echo   - local-db-export.sql -> temp
        )
    )
)

:: ForeverYoung discogs CSV (if exists)
if exist "%FY_DIR%\discogs_data\foreveryoungrecords-inventory-20260922-0746.csv" (
    if not exist "%TMPDIR%\foreveryoungrecords-inventory-20260922-0746.csv" (
        move /Y "%FY_DIR%\discogs_data\foreveryoungrecords-inventory-20260922-0746.csv" "%TMPDIR%\" >nul 2>&1
        if errorlevel 1 (
            echo   [!] Failed to move FY CSV — check permissions
        ) else (
            echo   - discogs CSV -> temp
        )
    )
)

:: Staff local DB export (if exists)
if exist "%STAFF_DIR%\local-db-export.sql" (
    if not exist "%TMPDIR%\staff-local-db-export.sql" (
        move /Y "%STAFF_DIR%\local-db-export.sql" "%TMPDIR%\" >nul 2>&1
        if errorlevel 1 (
            echo   [!] Failed to move staff local-db-export.sql — check permissions
        ) else (
            echo   - staff local-db-export.sql -> temp
        )
    )
)

echo.
echo [2/5] Deploying ForeverYoung...
echo.

cd /d "%FY_DIR%"
npx wrangler pages deploy . --project-name foreveryoung --branch main ^
    --commit-message "Manual deploy: %date% %time%" ^
    --commit-dirty=true
echo.

echo [3/5] Deploying Staff...
echo.

cd /d "%STAFF_DIR%"
npx wrangler pages deploy . --project-name staff-foreveryoung --branch main ^
    --commit-message "Manual deploy: %date% %time%" ^
    --commit-dirty=true
echo.

echo [4/5] Restoring large files...
echo.

:: Restore ForeverYoung SQL (if it was moved)
if exist "%TMPDIR%\local-db-export.sql" (
    move /Y "%TMPDIR%\local-db-export.sql" "%FY_DIR%\" >nul 2>&1
    echo   - local-db-export.sql restored
)

:: Restore ForeverYoung CSV (if it was moved)
if exist "%TMPDIR%\foreveryoungrecords-inventory-20260922-0746.csv" (
    move /Y "%TMPDIR%\foreveryoungrecords-inventory-20260922-0746.csv" "%FY_DIR%\discogs_data\" >nul 2>&1
    echo   - discogs CSV restored
)

:: Restore Staff SQL (if it was moved)
if exist "%TMPDIR%\staff-local-db-export.sql" (
    move /Y "%TMPDIR%\staff-local-db-export.sql" "%STAFF_DIR%\" >nul 2>&1
    echo   - staff local-db-export.sql restored
)

echo.
echo [5/5] Cleaning up temp dir...
rmdir /S /Q "%TMPDIR%" >nul 2>&1
echo   - done
echo.

echo ============================================================
echo  Deploy complete.
echo  ForeverYoung: https://foreveryoung-ekz.pages.dev
echo  Staff:        https://staff-foreveryoung-4dp.pages.dev
echo ============================================================
echo.
endlocal
