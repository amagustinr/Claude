@echo off
REM Rollback del backup automatico FAMECA. Sirve para CUALQUIER sucursal.
REM Ejecutar con clic derecho -> "Ejecutar como administrador"
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo  ERROR: ejecuta este archivo con clic derecho - "Ejecutar como administrador".
  echo.
  pause
  exit /b 1
)

echo.
echo  Tareas de backup encontradas en este equipo:
powershell -NoProfile -Command "$t = Get-ScheduledTask -TaskName 'FAMECA Backup SGCRC *' -ErrorAction SilentlyContinue; if ($t) { $t | Format-Table TaskName, State -AutoSize } else { Write-Host '   (ninguna)' }"
echo.
echo  1 = DESHABILITAR las tareas (se pueden volver a habilitar)
echo  2 = ELIMINAR las tareas
echo  3 = ELIMINAR las tareas y el script C:\FAMECA\Backup
echo  4 = Volver a HABILITAR las tareas
echo  5 = Salir sin cambios
echo.
choice /c 12345 /n /m " Opcion: "
set OP=%errorlevel%

if %OP%==1 powershell -NoProfile -Command "Get-ScheduledTask -TaskName 'FAMECA Backup SGCRC *' -ErrorAction SilentlyContinue | ForEach-Object { Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue; Disable-ScheduledTask -TaskName $_.TaskName | Out-Null; Write-Host ('  Deshabilitada: ' + $_.TaskName) }"

if %OP%==2 powershell -NoProfile -Command "Get-ScheduledTask -TaskName 'FAMECA Backup SGCRC *' -ErrorAction SilentlyContinue | ForEach-Object { Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false; Write-Host ('  Eliminada: ' + $_.TaskName) }"

if %OP%==3 powershell -NoProfile -Command "Get-ScheduledTask -TaskName 'FAMECA Backup SGCRC *' -ErrorAction SilentlyContinue | ForEach-Object { Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false; Write-Host ('  Eliminada: ' + $_.TaskName) }; if (Test-Path 'C:\FAMECA\Backup') { Remove-Item 'C:\FAMECA\Backup' -Recurse -Force; Write-Host '  Eliminado: C:\FAMECA\Backup' }"

if %OP%==4 powershell -NoProfile -Command "Get-ScheduledTask -TaskName 'FAMECA Backup SGCRC *' -ErrorAction SilentlyContinue | ForEach-Object { Enable-ScheduledTask -TaskName $_.TaskName | Out-Null; Write-Host ('  Habilitada: ' + $_.TaskName) }"

echo.
echo  Estado final:
powershell -NoProfile -Command "$t = Get-ScheduledTask -TaskName 'FAMECA Backup SGCRC *' -ErrorAction SilentlyContinue; if ($t) { $t | Format-Table TaskName, State -AutoSize } else { Write-Host '   (no quedan tareas de backup)' }"
echo.
pause
