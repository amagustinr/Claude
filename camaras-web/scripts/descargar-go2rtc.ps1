# Descarga la última versión oficial de go2rtc (Windows x64) en la carpeta .\go2rtc del proyecto
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\descargar-go2rtc.ps1
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$raiz    = Split-Path -Parent $PSScriptRoot
$destino = Join-Path $raiz 'go2rtc'
New-Item -ItemType Directory -Force -Path $destino | Out-Null

$url = 'https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_win64.zip'
$zip = Join-Path $env:TEMP 'go2rtc_win64.zip'

Write-Host "Descargando $url ..."
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath $destino -Force
Remove-Item $zip

$exe = Join-Path $destino 'go2rtc.exe'
if (Test-Path $exe) {
    Write-Host "OK -> $exe" -ForegroundColor Green
    & $exe -version
} else {
    Write-Host "No se encontró go2rtc.exe en $destino" -ForegroundColor Red
    exit 1
}
