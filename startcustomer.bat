@echo off
cd /d "%~dp0"
npx -y wrangler@4 pages dev . --port 8788