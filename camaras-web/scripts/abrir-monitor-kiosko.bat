@echo off
REM Abre el visor a pantalla completa (modo kiosko), como el ejecutable WinForms.
REM Uso: abrir-monitor-kiosko.bat 1        (numero de monitor)
REM Puedes crear un acceso directo en "Inicio" de Windows para que arranque solo.
set MON=%1
if "%MON%"=="" set /p MON=Numero de monitor:
set URL=http://localhost:5080/visor.html?monitor=%MON%

set EDGE="%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set CHROME="%ProgramFiles%\Google\Chrome\Application\chrome.exe"

if exist %CHROME% (
  start "" %CHROME% --kiosk --autoplay-policy=no-user-gesture-required --user-data-dir="%LOCALAPPDATA%\CamarasWebKiosko" "%URL%"
) else (
  start "" %EDGE% --kiosk "%URL%" --edge-kiosk-type=fullscreen --autoplay-policy=no-user-gesture-required
)
