<#
.SYNOPSIS
    Instala el backup automatico en la PC/servidor de la sucursal.
    Ejecutar UNA vez por sucursal, como Administrador.

    Hace 4 cosas:
      1. Copia Backup-Sucursal.ps1 a una ruta fija (RutaInstalacion).
      2. Crea las carpetas y da escritura a la cuenta del servicio SQL en _backup_tmp.
      3. Da a NT AUTHORITY\SYSTEM permiso minimo para BACKUP + VERIFYONLY.
      4. Registra la tarea programada (como SYSTEM) en las horas/dias indicados.
         Si la PC estaba apagada a esa hora, corre apenas se prenda (StartWhenAvailable).

    Carpetas (ejemplo CarpetaDestino = D:\FACTURACION\PuentePiedra\backups):
      D:\FACTURACION\PuentePiedra\backups       -> solo los .zip/.rar finales (Syncthing)
      D:\FACTURACION\PuentePiedra\_backup_tmp   -> .bak temporal (fuera de Syncthing)
      D:\FACTURACION\PuentePiedra\_backup_logs  -> logs mensuales (fuera de Syncthing)

.EXAMPLE
    # Lima Callao - todos los dias a las 07:29
    .\Instalar-TareaBackup.ps1 -Sucursal LimaCallao -BaseDatos SGCRC -Instancia ".\COMERCIALRC" `
        -CarpetaDestino "D:\FACTURACION\LimaCallao\backups" -Horas "07:29" -Formato zip `
        -SqlUsuario sa -SqlClave "****"

.EXAMPLE
    # Puente Piedra - lunes a sabado a las 07:30, 11:00, 14:00 y 17:00
    .\Instalar-TareaBackup.ps1 -Sucursal LimaPPiedra -BaseDatos SGCRC -Instancia ".\RCPUENTEPIEDRA" `
        -CarpetaDestino "D:\FACTURACION\PuentePiedra\backups" `
        -Horas "07:30,11:00,14:00,17:00" -Dias "Lun,Mar,Mie,Jue,Vie,Sab" -Formato zip `
        -SqlUsuario sa -SqlClave "****"
#>
#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Sucursal,
    [Parameter(Mandatory = $true)][string]$BaseDatos,
    [Parameter(Mandatory = $true)][string]$CarpetaDestino,
    [Parameter(Mandatory = $true)][string[]]$Horas,          # HH:mm  ->  "07:30,11:00"
    [string[]]$Dias          = @(),  # vacio = todos los dias. Ej: "Lun,Mar,Mie,Jue,Vie,Sab"
    [string]$Instancia       = '.\SQLEXPRESS',
    [ValidateSet('rar', 'zip')][string]$Formato = 'rar',
    [int]$DiasRetencion      = 7,    # 0 = no borrar antiguos
    [string]$RutaInstalacion = 'C:\FAMECA\Backup',
    [string]$SqlUsuario      = '',   # opcional: p.ej. sa, SOLO para otorgar permisos (no se guarda)
    [string]$SqlClave        = '',
    [switch]$EjecutarAhora
)

$ErrorActionPreference = 'Stop'

# Acepta listas como "a","b" o "a,b" (cuando se llama con powershell -File)
$Horas = @($Horas | ForEach-Object { $_ -split '[,; ]' } | Where-Object { $_ })
$Dias  = @($Dias  | ForEach-Object { $_ -split '[,; ]' } | Where-Object { $_ })

$mapaDias = @{
    'lun' = 'Monday';    'lunes'     = 'Monday';    'monday'    = 'Monday'
    'mar' = 'Tuesday';   'martes'    = 'Tuesday';   'tuesday'   = 'Tuesday'
    'mie' = 'Wednesday'; 'miercoles' = 'Wednesday'; 'wednesday' = 'Wednesday'
    'jue' = 'Thursday';  'jueves'    = 'Thursday';  'thursday'  = 'Thursday'
    'vie' = 'Friday';    'viernes'   = 'Friday';    'friday'    = 'Friday'
    'sab' = 'Saturday';  'sabado'    = 'Saturday';  'saturday'  = 'Saturday'
    'dom' = 'Sunday';    'domingo'   = 'Sunday';    'sunday'    = 'Sunday'
}
$diasSemana = @(@(foreach ($d in $Dias) {
    $k = $d.Trim().ToLower()
    if (-not $mapaDias.ContainsKey($k)) { throw "Dia no reconocido: '$d'. Usa Lun,Mar,Mie,Jue,Vie,Sab,Dom." }
    $mapaDias[$k]
}) | Select-Object -Unique)

$tarea = "FAMECA Backup SGCRC $Sucursal"
$padre = Split-Path $CarpetaDestino -Parent
$tmp   = Join-Path $padre '_backup_tmp'
$logs  = Join-Path $padre '_backup_logs'

function Invoke-Sql([string]$sql) {
    if ($SqlUsuario) {
        $cs = "Server=$Instancia;Database=master;User ID=$SqlUsuario;Password=$SqlClave"
    } else {
        $cs = "Server=$Instancia;Database=master;Integrated Security=SSPI"
    }
    $cn = New-Object System.Data.SqlClient.SqlConnection $cs
    try {
        $cn.Open()
        $cmd = $cn.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 120
        return $cmd.ExecuteScalar()
    } finally { $cn.Close() }
}

# 0) Validar conexion SQL ANTES de instalar nada --------------------------------
if ($SqlUsuario -and (-not $SqlClave -or $SqlClave -eq 'TU_CLAVE')) {
    $sec = Read-Host "Clave de '$SqlUsuario' en $Instancia" -AsSecureString
    $SqlClave = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
                    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
try {
    $ver = Invoke-Sql "SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(50)) + N' | sysadmin=' + CAST(IS_SRVROLEMEMBER(N'sysadmin') AS nvarchar(5));"
    Write-Host "[0/4] Conexion OK a $Instancia (version $ver)"
    if ($ver -notmatch 'sysadmin=1$') { throw 'El usuario conectado no es sysadmin; no podra otorgar permisos.' }
} catch {
    throw "No se pudo conectar a $Instancia como '$(if ($SqlUsuario) { $SqlUsuario } else { "$env:USERDOMAIN\$env:USERNAME" })': $($_.Exception.Message)`nNo se instalo nada. Revisa usuario/clave y vuelve a ejecutar."
}

# 1) Copiar script -------------------------------------------------------------
$origen = Join-Path $PSScriptRoot 'Backup-Sucursal.ps1'
if (-not (Test-Path -LiteralPath $origen)) { throw "No se encuentra $origen (debe estar junto a este instalador)." }
New-Item -ItemType Directory -Path $RutaInstalacion -Force | Out-Null
$script = Join-Path $RutaInstalacion 'Backup-Sucursal.ps1'
Copy-Item -LiteralPath $origen -Destination $script -Force
Unblock-File -LiteralPath $script -ErrorAction SilentlyContinue
Write-Host "[1/4] Script copiado a $script"

# 2) Carpetas y permiso NTFS para la cuenta del servicio SQL -------------------
foreach ($d in @($CarpetaDestino, $tmp, $logs)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }

$cuentaSql = $null
try {
    # sys.dm_server_services existe desde SQL Server 2008 R2 SP1
    $cuentaSql = Invoke-Sql "SELECT TOP 1 service_account FROM sys.dm_server_services WHERE servicename LIKE N'SQL Server (%';"
} catch {
    Write-Warning "No se pudo leer la cuenta del servicio SQL ($($_.Exception.Message)). Da permiso de escritura en $tmp a esa cuenta manualmente."
}
if ($cuentaSql -and $cuentaSql -notmatch '^(LocalSystem|NT AUTHORITY\\SYSTEM)$') {
    # Cuentas integradas por SID conocido (SQL las reporta como NETWORKSERVICE / LOCALSERVICE)
    $cuentaAcl = switch -Regex ($cuentaSql) {
        'NETWORK\s?SERVICE$' { '*S-1-5-20'; break }
        'LOCAL\s?SERVICE$'   { '*S-1-5-19'; break }
        default              { $cuentaSql }
    }
    & icacls $tmp /grant "${cuentaAcl}:(OI)(CI)M" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning "No se pudo dar permiso a '$cuentaSql' sobre $tmp. Hazlo manualmente." }
}
Write-Host "[2/4] Carpetas listas ($tmp, $logs). Cuenta del servicio SQL: $cuentaSql"

# 3) Permisos SQL minimos para SYSTEM (la tarea corre como SYSTEM) -------------
$db = $BaseDatos.Replace(']', ']]')
$sqlPermisos = @"
IF SUSER_ID(N'NT AUTHORITY\SYSTEM') IS NULL
    CREATE LOGIN [NT AUTHORITY\SYSTEM] FROM WINDOWS;
IF IS_SRVROLEMEMBER(N'sysadmin', N'NT AUTHORITY\SYSTEM') = 0
BEGIN
    GRANT CREATE ANY DATABASE TO [NT AUTHORITY\SYSTEM];   -- requerido por RESTORE VERIFYONLY
    EXEC(N'USE [$db];
      IF DATABASE_PRINCIPAL_ID(N''NT AUTHORITY\SYSTEM'') IS NULL
          CREATE USER [NT AUTHORITY\SYSTEM] FOR LOGIN [NT AUTHORITY\SYSTEM];
      EXEC sp_addrolemember N''db_backupoperator'', N''NT AUTHORITY\SYSTEM'';');
END
SELECT 1;
"@
try {
    [void](Invoke-Sql $sqlPermisos)
    Write-Host "[3/4] Permisos SQL otorgados a NT AUTHORITY\SYSTEM sobre [$BaseDatos]"
} catch {
    throw "No se pudieron otorgar permisos SQL: $($_.Exception.Message)`nLa tarea NO se registro."
}

# 4) Tarea programada ----------------------------------------------------------
$argumentos = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$script`"",
    '-Sucursal', "`"$Sucursal`"",
    '-BaseDatos', "`"$BaseDatos`"",
    '-Instancia', "`"$Instancia`"",
    '-CarpetaDestino', "`"$CarpetaDestino`"",
    '-Formato', $Formato,
    '-DiasRetencion', $DiasRetencion
) -join ' '

$accion   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argumentos
$triggers = foreach ($h in $Horas) {
    $at = [datetime]::ParseExact($h.Trim(), 'HH:mm', $null)
    if ($diasSemana.Count -gt 0) {
        New-ScheduledTaskTrigger -Weekly -WeeksInterval 1 -DaysOfWeek $diasSemana -At $at
    } else {
        New-ScheduledTaskTrigger -Daily -At $at
    }
}
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$config    = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
                 -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
                 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

# En Windows Server 2012 R2 / 8.1 "-Force" no siempre reemplaza una tarea existente
# (error 0x800700B7 "archivo ya existe"): se elimina primero.
if (Get-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask       -TaskName $tarea -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $tarea -Confirm:$false
    Write-Host "      Tarea anterior '$tarea' eliminada para recrearla."
}
Register-ScheduledTask -TaskName $tarea -Action $accion -Trigger $triggers `
    -Principal $principal -Settings $config | Out-Null

$txtDias = if ($diasSemana.Count -gt 0) { $diasSemana -join ', ' } else { 'todos los dias' }
Write-Host "[4/4] Tarea '$tarea' registrada: $($Horas -join ', ') | $txtDias"

if ($EjecutarAhora) {
    Start-ScheduledTask -TaskName $tarea
    Write-Host "Tarea lanzada. Revisa: $logs"
}
