#Requires -RunAsAdministrator
<#
  Crea la tarea programada "Restaurar Sucursales"
    - 07:50 y luego cada 10 min hasta las 09:00  (07:50, 08:00, 08:10 ... 09:00)
    - 11:10, 14:10 y 17:10 (una sola vez cada una)

  IMPORTANTE: ejecutar como Administrador y registrar la tarea con el MISMO usuario
  que genero sa.cred (si fue con Export-Clixml / ConvertFrom-SecureString, el
  archivo solo lo puede descifrar ese usuario en ese equipo; con SYSTEM fallaria).
#>

$NombreTarea = 'Restaurar Sucursales'
$Carpeta     = 'D:\Scripts_Restauracion'
$Script      = Join-Path $Carpeta 'Restaurar-Sucursales.ps1'

if (-not (Test-Path $Script)) { throw "No se encontro $Script" }

# Detener la instancia colgada (si la hay) antes de re-registrar
if (Get-ScheduledTask -TaskName $NombreTarea -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $NombreTarea -ErrorAction SilentlyContinue
}

# --- Accion ---------------------------------------------------------------
# Se llama al .ps1 directamente (NO al .cmd): el .cmd termina en "pause" y en
# segundo plano nadie presiona una tecla, la tarea queda "En ejecucion" y las
# siguientes ejecuciones se rechazan (0x800710E0).
# -NonInteractive: si sa.cred falla, Read-Host lanza error en vez de quedarse esperando.
$accion = New-ScheduledTaskAction -Execute 'powershell.exe' `
                                  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$Script`"" `
                                  -WorkingDirectory $Carpeta

# --- Disparadores ---------------------------------------------------------
# 1) 07:50 diario, repite cada 10 min durante 1h15m -> ultima ejecucion 09:00
#    (New-ScheduledTaskTrigger -Daily no acepta repeticion, se copia de un -Once)
$tManana = New-ScheduledTaskTrigger -Daily -At '07:50'
$tManana.Repetition = (New-ScheduledTaskTrigger -Once -At '07:50' `
                         -RepetitionInterval (New-TimeSpan -Minutes 10) `
                         -RepetitionDuration (New-TimeSpan -Hours 1 -Minutes 15)).Repetition

# 2) Ejecuciones unicas
$t1110 = New-ScheduledTaskTrigger -Daily -At '11:10'
$t1410 = New-ScheduledTaskTrigger -Daily -At '14:10'
$t1710 = New-ScheduledTaskTrigger -Daily -At '17:10'

# Si solo debe correr de lunes a sabado, reemplaza -Daily por:
#   -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday,Saturday

# --- Configuracion --------------------------------------------------------
$config = New-ScheduledTaskSettingsSet `
            -MultipleInstances IgnoreNew `
            -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
            -StartWhenAvailable `
            -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
# IgnoreNew: si una restauracion tarda mas de 10 min, no se lanza otra encima.

# --- Usuario (ejecutar aunque no haya sesion iniciada) ---------------------
$cred = Get-Credential -UserName "$env:USERDOMAIN\$env:USERNAME" `
                       -Message 'Usuario con el que correra la tarea (el mismo que creo sa.cred)'

Register-ScheduledTask -TaskName $NombreTarea `
                       -Action $accion `
                       -Trigger @($tManana, $t1110, $t1410, $t1710) `
                       -Settings $config `
                       -User $cred.UserName `
                       -Password $cred.GetNetworkCredential().Password `
                       -RunLevel Highest `
                       -Description 'Restauracion de BD de sucursales: 07:50-09:00 c/10 min, 11:10, 14:10, 17:10' `
                       -Force | Out-Null

# --- Verificacion ---------------------------------------------------------
Get-ScheduledTask -TaskName $NombreTarea | Get-ScheduledTaskInfo |
    Select-Object TaskName, LastRunTime, LastTaskResult, NextRunTime | Format-List

Write-Host "Tarea '$NombreTarea' creada. Prueba manual: Start-ScheduledTask -TaskName '$NombreTarea'" -ForegroundColor Green
