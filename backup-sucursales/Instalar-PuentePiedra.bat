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
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Instalar-TareaBackup.ps1" -Sucursal LimaPPiedra -BaseDatos SGCRC -Instancia ".\RCPUENTEPIEDRA" -CarpetaDestino "D:\FACTURACION\PuentePiedra\backups" -Horas "07:30,11:00,14:00,17:00" -Dias "Lun,Mar,Mie,Jue,Vie,Sab" -Formato zip -SqlUsuario sa
echo.
pause
