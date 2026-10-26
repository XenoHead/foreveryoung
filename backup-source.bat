@echo off
rem ===============================================================
rem  backup-source.bat -- zip the site source into .\backups\
rem
rem  Output:  backups\foreveryoung-YYYY-MM-DD_HH-MM-SS.zip
rem           (folder sits next to this script, wherever it is run from)
rem
rem  Default: source only -- html, js, css, py, json, sql, toml, md,
rem           txt, bat, ps1, and every dotfile config (.assetsignore,
rem           .gitignore, .gitattributes). ~700 KB per zip.
rem           images\ and fonts\ are skipped (they are ~80 MB together).
rem           Set INCLUDE_ASSETS=1 below to include them too.
rem
rem  Never included: .git, .wrangler, node_modules, db_batches, backups
rem           itself, and the secret-bearing .env / .dev.vars.
rem
rem  Every run writes a NEW timestamped zip. Nothing is overwritten,
rem  nothing touched outside backups\. Safe to run repeatedly.
rem
rem  Why PowerShell and not tar: the tar.exe that ships with Windows
rem  stores every path as "./name". The archive is valid -- tar and
rem  .NET read it fine -- but Explorer's built-in zip viewer shows it
rem  as an empty folder. .NET's ZipArchive writes plain "name" entries,
rem  so the zip opens normally everywhere. No extra install needed;
rem  PowerShell 5.1 is part of Windows.
rem ===============================================================

setlocal EnableExtensions EnableDelayedExpansion

rem ---- flip to 1 to also archive images\ and fonts\ -------------------
set "INCLUDE_ASSETS=0"
rem ---------------------------------------------------------------------

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "OUTDIR=%ROOT%\backups"

if not exist "%OUTDIR%" mkdir "%OUTDIR%" 2>nul
if not exist "%OUTDIR%" (
    echo [ERROR] Could not create "%OUTDIR%".
    exit /b 1
)

set "STAMP="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'"`) do set "STAMP=%%I"
if not defined STAMP (
    echo [ERROR] Could not read the clock via powershell.
    exit /b 1
)

set "ZIP=%OUTDIR%\foreveryoung-%STAMP%.zip"
if exist "%ZIP%" (
    echo [ERROR] "%ZIP%" already exists. Try again in a second.
    exit /b 1
)

if "%INCLUDE_ASSETS%"=="1" (
    echo Mode: full ^(images + fonts included^)
) else (
    echo Mode: source only ^(images\ and fonts\ skipped^)
)
echo Root: "%ROOT%"
echo Zip:  "%ZIP%"
echo.

rem ---- hand the work to PowerShell -------------------------------------
set "FY_ROOT=%ROOT%"
set "FY_ZIP=%ZIP%"
set "FY_ASSETS=%INCLUDE_ASSETS%"
set "FY_COUNT=%TEMP%\fy-backup-count.txt"
if exist "%FY_COUNT%" del /f /q "%FY_COUNT%" >nul 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$ErrorActionPreference='Stop';" ^
 "Add-Type -AssemblyName System.IO.Compression.FileSystem;" ^
 "$root=$env:FY_ROOT; $zip=$env:FY_ZIP;" ^
 "$skip=@('.git','.wrangler','node_modules','db_batches','backups');" ^
 "if($env:FY_ASSETS -ne '1'){ $skip+=@('images','fonts') };" ^
 "$files=@(Get-ChildItem -LiteralPath $root -Recurse -File -Force | Where-Object { $_.Name -ne '.env' -and $_.Name -ne '.dev.vars' -and (($_.FullName.Substring($root.Length+1) -split '\\')[0] -notin $skip) });" ^
 "if($files.Count -eq 0){ throw 'no files found to back up' };" ^
 "$ar=[System.IO.Compression.ZipFile]::Open($zip,'Create');" ^
 "$n=0;" ^
 "foreach($f in $files){ try { [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($ar, $f.FullName, ($f.FullName.Substring($root.Length+1) -replace '\\','/'), [System.IO.Compression.CompressionLevel]::Optimal); $n++ } catch { Write-Host ('[WARN] skipped unreadable file: ' + $f.FullName) } };" ^
 "$ar.Dispose();" ^
 "Set-Content -LiteralPath $env:FY_COUNT -Value $n -Encoding ASCII"
if errorlevel 1 goto :fail

if not exist "%ZIP%" goto :fail

set "COUNT=0"
if exist "%FY_COUNT%" set /p COUNT=<"%FY_COUNT%"
del /f /q "%FY_COUNT%" >nul 2>&1

set "BYTES=0"
for %%A in ("%ZIP%") do set "BYTES=%%~zA"
set /a "KB=BYTES/1024"

echo.
echo [OK] %COUNT% files, %KB% KB
echo [OK] %ZIP%
endlocal
exit /b 0

:fail
echo.
echo [ERROR] Backup failed. See the message above.
if exist "%ZIP%" del /f /q "%ZIP%"
if exist "%FY_COUNT%" del /f /q "%FY_COUNT%" >nul 2>&1
echo         Partial zip removed. Nothing else was changed.
endlocal
exit /b 1
