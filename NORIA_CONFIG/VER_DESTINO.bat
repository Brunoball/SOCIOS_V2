@echo off
setlocal
cd /d "%~dp0"
node sync-env.cjs --preview
pause
