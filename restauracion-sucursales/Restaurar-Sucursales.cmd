@echo off
title Restauracion de sucursales
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Restaurar-Sucursales.ps1" %*
echo.
pause
