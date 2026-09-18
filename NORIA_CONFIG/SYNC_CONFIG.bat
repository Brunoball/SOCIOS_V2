@echo off
setlocal
cd /d "%~dp0"
node sync-env.cjs
if errorlevel 1 (
  echo.
  echo ERROR sincronizando la configuracion.
  pause
  exit /b 1
)
echo.
echo Configuracion sincronizada correctamente.
pause
