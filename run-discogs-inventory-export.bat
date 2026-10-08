@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

rem Run the Discogs inventory export script with environment variables from .env

set SCRIPT_DIR=%~dp0
set ENV_FILE=%SCRIPT_DIR%.env

if not exist "%ENV_FILE%" (
  echo ERROR: Environment file not found: %ENV_FILE%
  echo Create it by copying scripts\.env.example and filling in your Discogs credentials.
  pause
  exit /b 1
)

for /f "usebackq tokens=*" %%a in ("%ENV_FILE%") do (
  set line=%%a
  if not "!line:~0,1!==""#" (
    if not "!line!"=="" (
      for /f "tokens=1,* delims==" %%b in ("!line!") do (
        set key=%%b
        set value=%%c
        rem Trim leading/trailing spaces around key and value
        for /f "tokens=* delims=" %%d in ("!key!") do set key=%%d
        set value=!value:~1!
        if "!value:~-1!=="" " set value=!value:~0,-1!
        set "!key!=!value!"
      )
    )
  )
)

if "%DISCOGS_TOKEN%"=="" (
  echo ERROR: DISCOGS_TOKEN is not set in %ENV_FILE%
  pause
  exit /b 1
)

if "%DISCOGS_USERNAME%"=="" (
  echo ERROR: DISCOGS_USERNAME is not set in %ENV_FILE%
  pause
  exit /b 1
)

if "%DISCOGS_STATUS%"=="" set DISCOGS_STATUS=For Sale
if "%DISCOGS_OUTPUT_DIR%"=="" set DISCOGS_OUTPUT_DIR=%SCRIPT_DIR%data

echo Running Discogs inventory export...
echo   User:    %DISCOGS_USERNAME%
echo   Status:  %DISCOGS_STATUS%
echo   Output:  %DISCOGS_OUTPUT_DIR%
node "%SCRIPT_DIR%scripts\discogs-export-inventory.js"

if errorlevel 1 (
  echo Export failed.
  pause
  exit /b 1
)

echo Done.
pause
