<#
.SYNOPSIS
    Backup directo de la BD de la sucursal + compresion con WinRAR.
    Genera:  <CarpetaDestino>\SGCRC_yyyyMMddHHmm_<Sucursal>.rar   (o .zip)
    Dentro:  SGCRC_yyyyMMddHHmm_<Sucursal>.bak

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File Backup-Sucursal.ps1 `
        -Sucursal LimaCallao -BaseDatos SGCRC_LimaCallao `
        -Instancia ".\SQLEXPRESS" -CarpetaDestino "D:\FACTURACION\LimaCallao\backups"

.NOTES
    - Usa System.Data.SqlClient (no requiere sqlcmd ni modulos extra).
    - El .bak se escribe con la cuenta del servicio SQL Server: esa cuenta necesita
      escritura en CarpetaTrabajo (el instalador se lo otorga).
    - El archivo se arma en CarpetaTrabajo y recien al final se MUEVE a CarpetaDestino,
      asi Syncthing / el script de restauracion nunca ven un archivo a medias.
    - Codigo de salida: 0 = OK, 1 = error (queda en el historial de la tarea y en el log).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Sucursal,
    [Parameter(Mandatory = $true)][string]$BaseDatos,
    [Parameter(Mandatory = $true)][string]$CarpetaDestino,
    [string]$Instancia      = '.\SQLEXPRESS',
    [string]$CarpetaTrabajo = '',                 # por defecto <padre de CarpetaDestino>\_backup_tmp
    [string]$CarpetaLogs    = '',                 # por defecto <padre de CarpetaDestino>\_backup_logs
    [ValidateSet('rar', 'zip')][string]$Formato = 'rar',
    [int]$DiasRetencion     = 7,                  # 0 = no borrar antiguos
    [int]$EsperaSqlMin      = 15,                 # minutos a esperar si SQL aun no arranca (PC recien prendida)
    [string]$Usuario        = '',                 # vacio = autenticacion Windows
    [string]$Clave          = '',
    [string]$WinRarDir      = ''                  # vacio = autodetectar
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------- carpetas y log
# _tmp y logs van FUERA de CarpetaDestino (misma unidad) para que Syncthing
# no sincronice el .bak a medias ni los logs.
$padre = Split-Path $CarpetaDestino -Parent
if (-not $CarpetaTrabajo) { $CarpetaTrabajo = Join-Path $padre '_backup_tmp' }
if (-not $CarpetaLogs)    { $CarpetaLogs    = Join-Path $padre '_backup_logs' }
$logDir = $CarpetaLogs
foreach ($d in @($CarpetaDestino, $CarpetaTrabajo, $logDir)) {
    if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}
$logFile = Join-Path $logDir ('backup_{0}.log' -f (Get-Date -Format 'yyyyMM'))

function Write-Log([string]$msg) {
    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Sucursal, $msg
    Add-Content -LiteralPath $logFile -Value $line
    Write-Host $line
}

# ---------------------------------------------------------------- WinRAR
function Find-WinRar {
    $candidatos = @()
    foreach ($k in @('HKLM:\SOFTWARE\WinRAR', 'HKLM:\SOFTWARE\WOW6432Node\WinRAR')) {
        $p = Get-ItemProperty -Path $k -ErrorAction SilentlyContinue
        if ($p) {
            if ($p.exe64) { $candidatos += (Split-Path $p.exe64 -Parent) }
            if ($p.exe32) { $candidatos += (Split-Path $p.exe32 -Parent) }
        }
    }
    $candidatos += (Join-Path $env:ProgramFiles 'WinRAR')
    if (${env:ProgramFiles(x86)}) { $candidatos += (Join-Path ${env:ProgramFiles(x86)} 'WinRAR') }
    $candidatos | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'WinRAR.exe')) } | Select-Object -First 1
}

if (-not $WinRarDir) { $WinRarDir = Find-WinRar }
$usarZipNet = $false
if (-not $WinRarDir) {
    if ($Formato -eq 'zip') {
        $usarZipNet = $true      # sin WinRAR: ZIP nativo de .NET (System.IO.Compression)
    } else {
        Write-Log 'ERROR: no se encontro WinRAR instalado (requerido para formato rar; usa -Formato zip).'; exit 1
    }
} else {
    $rarExe    = Join-Path $WinRarDir 'Rar.exe'      # consola, solo formato RAR
    $winrarExe = Join-Path $WinRarDir 'WinRAR.exe'   # necesario para crear/probar ZIP
}

function New-ZipNet([string]$destino, [string]$archivo) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path -LiteralPath $destino) { Remove-Item -LiteralPath $destino -Force }
    $zip = [System.IO.Compression.ZipFile]::Open($destino, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, $archivo, (Split-Path $archivo -Leaf), [System.IO.Compression.CompressionLevel]::Optimal)
    } finally { $zip.Dispose() }
    # Prueba: abrir el zip y comprobar que la entrada tiene el tamano original
    $zip = [System.IO.Compression.ZipFile]::OpenRead($destino)
    try {
        $e = $zip.Entries | Select-Object -First 1
        if (-not $e -or $e.Length -ne (Get-Item -LiteralPath $archivo).Length) { throw 'ZIP (.NET) invalido: tamano no coincide' }
    } finally { $zip.Dispose() }
}

function Invoke-WinRar([string[]]$argumentos) {
    if ($Formato -eq 'rar') {
        & $rarExe @argumentos | Out-Null
        return $LASTEXITCODE
    }
    # WinRAR.exe en segundo plano (-ibck) para ZIP
    $q = $argumentos | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }
    $p = Start-Process -FilePath $winrarExe -ArgumentList ((@('-ibck') + $q) -join ' ') `
                       -Wait -PassThru -WindowStyle Hidden
    return $p.ExitCode
}

# ---------------------------------------------------------------- SQL
function Invoke-Sql([string]$sql) {
    if ($Usuario) {
        $cs = "Server=$Instancia;Database=master;User ID=$Usuario;Password=$Clave;Application Name=BackupSucursal"
    } else {
        $cs = "Server=$Instancia;Database=master;Integrated Security=SSPI;Application Name=BackupSucursal"
    }
    $cn = New-Object System.Data.SqlClient.SqlConnection $cs
    try {
        $cn.Open()
        $cmd = $cn.CreateCommand()
        $cmd.CommandText    = $sql
        $cmd.CommandTimeout = 0          # sin limite: el backup puede tardar
        [void]$cmd.ExecuteNonQuery()
    } finally {
        $cn.Close()
    }
}

# ---------------------------------------------------------------- proceso
$stamp     = Get-Date -Format 'yyyyMMddHHmm'
$nombre    = 'SGCRC_{0}_{1}' -f $stamp, $Sucursal          # SGCRC_202609300729_LimaCallao
$bak       = Join-Path $CarpetaTrabajo "$nombre.bak"
$archTmp   = Join-Path $CarpetaTrabajo "$nombre.$Formato"
$archFinal = Join-Path $CarpetaDestino "$nombre.$Formato"
$sw        = [Diagnostics.Stopwatch]::StartNew()

try {
    Write-Log "Inicio: BD [$BaseDatos] en $Instancia -> $archFinal"

    # 0) Esperar a que SQL Server responda (la tarea puede lanzarse apenas prende la PC)
    $limiteEspera = (Get-Date).AddMinutes($EsperaSqlMin)
    while ($true) {
        try { Invoke-Sql 'SELECT 1;'; break }
        catch {
            if ((Get-Date) -gt $limiteEspera) { throw "SQL Server no respondio en $EsperaSqlMin min: $($_.Exception.Message)" }
            Write-Log 'SQL Server aun no responde, reintento en 30 s...'
            Start-Sleep -Seconds 30
        }
    }

    # 1) Backup completo + verificacion
    $bakSql = $bak.Replace("'", "''")
    $dbSql  = $BaseDatos.Replace(']', ']]')
    Invoke-Sql "BACKUP DATABASE [$dbSql] TO DISK = N'$bakSql' WITH COPY_ONLY, INIT, FORMAT, CHECKSUM, NAME = N'$nombre';"
    Invoke-Sql "RESTORE VERIFYONLY FROM DISK = N'$bakSql' WITH CHECKSUM;"
    Write-Log ('Backup OK y verificado ({0:N1} MB)' -f ((Get-Item -LiteralPath $bak).Length / 1MB))

    if ($usarZipNet) {
        # 2-3) Comprimir y probar con .NET (no hay WinRAR en esta PC)
        Write-Log 'WinRAR no instalado: comprimiendo con ZIP nativo de Windows (.NET)'
        New-ZipNet $archTmp $bak
    } else {
        # 2) Comprimir (-ep1 = sin rutas dentro del archivo, -m5 = maxima compresion)
        $rc = Invoke-WinRar @('a', '-ep1', '-m5', '-y', '-idq', '--', $archTmp, $bak)
        if ($rc -ne 0) { throw "WinRAR (compresion) devolvio codigo $rc" }

        # 3) Probar integridad del archivo comprimido
        $rc = Invoke-WinRar @('t', '-y', '-idq', '--', $archTmp)
        if ($rc -ne 0) { throw "WinRAR (prueba) devolvio codigo $rc" }
    }

    # 4) Publicar (mover es atomico en el mismo disco) y limpiar
    Move-Item -LiteralPath $archTmp -Destination $archFinal -Force
    Remove-Item -LiteralPath $bak -Force
    Write-Log ('Comprimido OK ({0:N1} MB)' -f ((Get-Item -LiteralPath $archFinal).Length / 1MB))

    # 5) Retencion
    if ($DiasRetencion -gt 0) {
        $limite = (Get-Date).AddDays(-$DiasRetencion)
        Get-ChildItem -LiteralPath $CarpetaDestino -Filter "SGCRC_*_$Sucursal.$Formato" -File |
            Where-Object { $_.LastWriteTime -lt $limite } |
            ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force; Write-Log "Retencion: eliminado $($_.Name)" }
    }

    Write-Log ('FIN OK en {0:mm\:ss}' -f $sw.Elapsed)
    exit 0
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    foreach ($f in @($bak, $archTmp)) {
        if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue }
    }
    exit 1
}
