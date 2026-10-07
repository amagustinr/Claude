@echo off
REM Instala CamarasWeb como servicio de Windows (ejecutar como Administrador, despues de publicar.bat)
REM El servicio arranca go2rtc automaticamente.
setlocal
set "EXE=%~dp0..\publish\CamarasWeb.exe"
for %%I in ("%EXE%") do set "EXE=%%~fI"

if not exist "%EXE%" (
  echo No existe %EXE%. Ejecuta primero publicar.bat
  pause & exit /b 1
)

sc.exe create CamarasWeb binPath= "\"%EXE%\"" start= auto DisplayName= "Camaras Sucursales Web"
sc.exe description CamarasWeb "Visor web de camaras Dahua/Axis (ASP.NET Core + go2rtc)"
sc.exe failure CamarasWeb reset= 86400 actions= restart/5000/restart/5000/restart/5000

REM Puertos: 5080 (web) y 8555 TCP/UDP (WebRTC) para otras PCs de la red
netsh advfirewall firewall add rule name="CamarasWeb HTTP" dir=in action=allow protocol=TCP localport=5080
netsh advfirewall firewall add rule name="CamarasWeb WebRTC TCP" dir=in action=allow protocol=TCP localport=8555
netsh advfirewall firewall add rule name="CamarasWeb WebRTC UDP" dir=in action=allow protocol=UDP localport=8555

sc.exe start CamarasWeb
echo.
echo Servicio instalado. Abre http://localhost:5080
pause
