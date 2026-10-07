@echo off
REM Quita el servicio CamarasWeb (ejecutar como Administrador)
sc.exe stop CamarasWeb
sc.exe delete CamarasWeb
netsh advfirewall firewall delete rule name="CamarasWeb HTTP"
netsh advfirewall firewall delete rule name="CamarasWeb WebRTC TCP"
netsh advfirewall firewall delete rule name="CamarasWeb WebRTC UDP"
pause
