@echo off
rem Telegram delivery checker for @heremes_xeno_bot
setlocal
set SCRIPT_DIR=C:\Git\ForeverYoung
set PYTHON_BIN=C:\Users\Scott\AppData\Local\hermes\tools\python-3.14.7+20260901-win32-x64\python.exe
set HERMES_HOME=C:\Users\Scott\AppData\Local\hermes

cd /d "%HERMES_HOME%"

%PYTHON_BIN% "%SCRIPT_DIR%\telegram-check.py"
