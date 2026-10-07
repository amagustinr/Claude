@echo off
REM Ejecuta CamarasWeb en modo desarrollo y abre el navegador.
cd /d "%~dp0"

if not exist "go2rtc\go2rtc.exe" (
  echo No se encontro go2rtc\go2rtc.exe. Descargandolo...
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\descargar-go2rtc.ps1" || goto :error
)

start "" http://localhost:5080
dotnet run -c Release
goto :eof

:error
echo.
echo No se pudo descargar go2rtc. Bajalo manualmente de https://github.com/AlexxIT/go2rtc/releases
echo (archivo go2rtc_win64.zip) y copia go2rtc.exe en la carpeta go2rtc\
pause
