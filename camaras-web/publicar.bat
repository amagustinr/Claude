@echo off
REM Genera una carpeta "publish" lista para copiar a la PC de monitoreo o al servidor.
cd /d "%~dp0"

if not exist "go2rtc\go2rtc.exe" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\descargar-go2rtc.ps1" || exit /b 1
)

dotnet publish -c Release -r win-x64 --self-contained false -o publish || exit /b 1

echo.
echo Listo: carpeta "publish". Ejecuta publish\CamarasWeb.exe
echo Para instalarlo como servicio de Windows usa scripts\instalar-servicio.bat (como administrador).
pause
