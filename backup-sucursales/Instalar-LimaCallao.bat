@echo off
REM Ejecutar con clic derecho -> "Ejecutar como administrador"
REM Debe estar en la misma carpeta que Instalar-TareaBackup.ps1 y Backup-Sucursal.ps1
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo  ERROR: ejecuta este archivo con clic derecho - "Ejecutar como administrador".
  echo.
  pause
  exit /b 1
)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Instalar-TareaBackup.ps1" -Sucursal LimaCallao -BaseDatos SGCRC -Instancia ".\COMERCIALRC" -CarpetaDestino "D:\FACTURACION\LimaCallao\backups" -Horas "07:29" -Formato zip -SqlUsuario sa -EjecutarAhora
echo.
pause
