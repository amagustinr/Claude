<#
.SYNOPSIS
    Abre una ventana de Edge (o Chrome) en modo kiosko por cada pantalla, mostrando visor.html?monitor=N.

.DESCRIPTION
    Reemplaza el abrir 4 veces CamarasSucursalesDAHUA_AXIS.exe y escribir el numero de monitor a mano.
    (scripts\abrir-monitor-kiosko.bat abre UNA pantalla; con 4 monitores las ventanas comparten perfil
     y Edge/Chrome las apilan en la misma pantalla. Este script usa un perfil por pantalla y las ubica.)
    Cada ventana usa su propio perfil (necesario para que el kiosko quede en su pantalla).
    Si el servidor aun no esta listo (arranque de Windows), espera hasta 3 minutos.

.EXAMPLE
    .\Iniciar-Monitores.ps1
    .\Iniciar-Monitores.ps1 -Servidor http://SERVIDOR:5080
    .\Iniciar-Monitores.ps1 -Monitores 3,4,1,2       # pantalla 1 muestra Monitor 3, etc.
    .\Iniciar-Monitores.ps1 -ListarPantallas         # solo muestra las pantallas detectadas
    .\Iniciar-Monitores.ps1 -RegistrarInicio         # que se abra solo al iniciar sesion
    .\Iniciar-Monitores.ps1 -Cerrar                  # cierra las ventanas de camaras
#>
[CmdletBinding()]
param(
    [string]   $Servidor = "http://localhost:5080",
    [int[]]    $Monitores,                         # por defecto 1..N en el orden de las pantallas
    [ValidateSet("edge", "chrome")]
    [string]   $Navegador = "edge",
    [switch]   $ListarPantallas,
    [switch]   $RegistrarInicio,
    [switch]   $Cerrar
)

$ErrorActionPreference = "Stop"
$perfilesBase = Join-Path $env:LOCALAPPDATA "CamarasWeb"

function Get-RutaNavegador {
    $candidatos = if ($Navegador -eq "edge") {
        @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
          "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe")
    } else {
        @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
          "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
          "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
    }
    $r = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $r) { throw "No se encontro $Navegador instalado." }
    return $r
}

function Stop-VentanasCamaras {
    Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" |
        Where-Object { $_.CommandLine -like "*$perfilesBase*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

# --- Cerrar -------------------------------------------------------------------
if ($Cerrar) { Stop-VentanasCamaras; Write-Host "Ventanas de camaras cerradas."; return }

# --- Registrar en el inicio de sesion ------------------------------------------
if ($RegistrarInicio) {
    $startup = [Environment]::GetFolderPath("Startup")
    $lnk = Join-Path $startup "Camaras Sucursales.lnk"
    $argumentos = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Servidor $Servidor -Navegador $Navegador"
    if ($Monitores) { $argumentos += " -Monitores " + ($Monitores -join ",") }
    $sh = New-Object -ComObject WScript.Shell
    $s = $sh.CreateShortcut($lnk)
    $s.TargetPath = "powershell.exe"
    $s.Arguments = $argumentos
    $s.WorkingDirectory = $PSScriptRoot
    $s.Save()
    Write-Host "Acceso directo creado en: $lnk"
    return
}

# --- Pantallas en coordenadas fisicas (DPI-aware) ------------------------------
Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public static class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
"@
[void][Dpi]::SetProcessDPIAware()
Add-Type -AssemblyName System.Windows.Forms

# Orden: de izquierda a derecha (y de arriba a abajo si comparten X)
$pantallas = [System.Windows.Forms.Screen]::AllScreens | Sort-Object { $_.Bounds.X }, { $_.Bounds.Y }

Write-Host "Pantallas detectadas:"
$i = 1
foreach ($p in $pantallas) {
    $b = $p.Bounds
    Write-Host ("  {0}: {1}x{2} en ({3},{4}){5}" -f $i, $b.Width, $b.Height, $b.X, $b.Y, $(if ($p.Primary) { "  [principal]" } else { "" }))
    $i++
}
if ($ListarPantallas) { return }

if (-not $Monitores) { $Monitores = 1..$pantallas.Count }

# --- Esperar al servidor --------------------------------------------------------
$limite = (Get-Date).AddMinutes(3)
while ($true) {
    try {
        Invoke-WebRequest -Uri "$Servidor/api/estado" -UseBasicParsing -TimeoutSec 5 | Out-Null
        break
    } catch {
        if ((Get-Date) -gt $limite) { throw "El servidor $Servidor no responde." }
        Write-Host "Esperando al servidor $Servidor ..."
        Start-Sleep -Seconds 5
    }
}

# --- Abrir una ventana kiosko por pantalla --------------------------------------
Stop-VentanasCamaras
$exe = Get-RutaNavegador

for ($n = 0; $n -lt [Math]::Min($pantallas.Count, $Monitores.Count); $n++) {
    $b = $pantallas[$n].Bounds
    $monitor = $Monitores[$n]
    $perfil = Join-Path $perfilesBase "perfil$($n + 1)"

    $argumentos = @(
        "--kiosk", "$Servidor/visor.html?monitor=$monitor",
        "--edge-kiosk-type=fullscreen",
        "--window-position=$($b.X + 50),$($b.Y + 50)",
        "--window-size=800,600",
        "--user-data-dir=`"$perfil`"",
        "--no-first-run",
        "--no-default-browser-check",
        "--autoplay-policy=no-user-gesture-required",
        "--disable-features=Translate,msEdgeSidebarV2",
        "--disable-session-crashed-bubble",
        "--hide-crash-restore-bubble"
    )
    Write-Host "Pantalla $($n + 1) -> Monitor $monitor"
    Start-Process -FilePath $exe -ArgumentList $argumentos
    Start-Sleep -Milliseconds 1500
}

Write-Host "Listo. Para salir de una ventana kiosko: Alt+F4 (o ejecute este script con -Cerrar)."
