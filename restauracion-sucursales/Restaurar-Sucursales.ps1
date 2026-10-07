<#
.SYNOPSIS
    Restaura automáticamente los backups diarios de las sucursales en FMCSQLEXPRESS01\SQLEXPRESS2019.

.DESCRIPTION
    - Busca la carpeta del día (dd-MM-yyyy) en \\FMCSQLEXPRESS01\backup$
    - Detecta todos los zip SGCRC_<timestamp>_<Sucursal>.zip (incluye subcarpetas 11am, 2pm, 5pm)
    - Por cada sucursal toma el zip MÁS RECIENTE, lo descomprime y restaura el .bak
      sobre la base SGCRC_<Sucursal> con REPLACE + MOVE a las rutas físicas actuales
      (equivale a "Overwrite" + "Close connections" + "Relocate all files" del SSMS).
    - La carpeta _extraidos es temporal: se elimina al terminar cada restauración
      para no ocupar espacio en disco (el zip queda como respaldo).
    - Lleva un registro (_restauradas.json) para no repetir restauraciones ya hechas:
      se puede ejecutar varias veces al día y solo procesa lo nuevo.

.EXAMPLE
    .\Restaurar-Sucursales.ps1                       # procesa la carpeta de hoy
    .\Restaurar-Sucursales.ps1 -Fecha 21-07-2026     # procesa otra fecha
    .\Restaurar-Sucursales.ps1 -Sucursales Terrapuerto,Piura   # solo esas sucursales
    .\Restaurar-Sucursales.ps1 -Forzar               # restaura aunque ya estén registradas
#>
param(
    [string]$Fecha = (Get-Date).ToString('dd-MM-yyyy'),
    [string[]]$Sucursales = @(),
    [switch]$Forzar
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

# ============================ CONFIGURACIÓN ============================
$Instancia       = 'FMCSQLEXPRESS01\SQLEXPRESS2019'
$ShareBackup     = '\\FMCSQLEXPRESS01\backup$'
$RutaLocalBackup = ''      # Ruta local del share EN EL SERVIDOR (ej. 'D:\Backup'). Vacío = autodetectar.
$PrefijoDB       = 'SGCRC_'
$UsuarioSql      = 'sa'
# =======================================================================

$CarpetaScript = Split-Path -Parent $MyInvocation.MyCommand.Path
$ArchivoCred   = Join-Path $CarpetaScript 'sa.cred'
$CarpetaLogs   = Join-Path $CarpetaScript 'logs'
if (-not (Test-Path $CarpetaLogs)) { New-Item -ItemType Directory -Path $CarpetaLogs | Out-Null }
$ArchivoLog    = Join-Path $CarpetaLogs ("restauracion_{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))

function Write-Log {
    param([string]$Mensaje, [string]$Color = 'White')
    $linea = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Mensaje
    Write-Host $linea -ForegroundColor $Color
    Add-Content -Path $ArchivoLog -Value $linea -Encoding UTF8
}

# ----------------------- Credencial de sa (DPAPI) -----------------------
function Get-CadenaConexion {
    $secure = $null
    if (Test-Path $ArchivoCred) {
        try { $secure = Get-Content $ArchivoCred | ConvertTo-SecureString } catch { $secure = $null }
    }
    if ($null -eq $secure) {
        Write-Host ""
        $secure = Read-Host ("Contraseña del usuario '{0}' en {1}" -f $UsuarioSql, $Instancia) -AsSecureString
    }
    $bstr  = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    $cs = "Server=$Instancia;Database=master;User ID=$UsuarioSql;Password=$plain;Connection Timeout=15"
    return @{ CadenaConexion = $cs; Secure = $secure }
}

function Test-Conexion([string]$cs) {
    $c = New-Object System.Data.SqlClient.SqlConnection $cs
    try { $c.Open(); $c.Close(); return $true } catch { return $false } finally { $c.Dispose() }
}

$cred = Get-CadenaConexion
if (-not (Test-Conexion $cred.CadenaConexion)) {
    if (Test-Path $ArchivoCred) {
        Write-Log "La contraseña guardada ya no es válida, vuelve a ingresarla." Yellow
        Remove-Item $ArchivoCred -Force
        $cred = Get-CadenaConexion
        if (-not (Test-Conexion $cred.CadenaConexion)) { throw "No se pudo conectar a $Instancia con el usuario '$UsuarioSql'." }
    } else {
        throw "No se pudo conectar a $Instancia con el usuario '$UsuarioSql'. Verifica la contraseña."
    }
}
if (-not (Test-Path $ArchivoCred)) {
    $cred.Secure | ConvertFrom-SecureString | Set-Content -Path $ArchivoCred -Encoding ASCII
    Write-Log "Contraseña guardada cifrada en $ArchivoCred (solo legible por tu usuario en esta PC)." DarkGray
}
$CadenaConexion = $cred.CadenaConexion

# --------------------------- Helpers de SQL ----------------------------
function Invoke-SqlQuery {
    param([string]$Sql, [hashtable]$Parametros = @{})
    $conn = New-Object System.Data.SqlClient.SqlConnection $CadenaConexion
    try {
        $conn.Open()
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $Sql
        $cmd.CommandTimeout = 120
        foreach ($k in $Parametros.Keys) { [void]$cmd.Parameters.AddWithValue($k, $Parametros[$k]) }
        $da = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
        $dt = New-Object System.Data.DataTable
        [void]$da.Fill($dt)
        return ,$dt
    } finally { $conn.Dispose() }
}

function Invoke-SqlRestore {
    param([string]$Sql)
    $conn = New-Object System.Data.SqlClient.SqlConnection $CadenaConexion
    try {
        $conn.add_InfoMessage({ param($s, $e) Write-Host ("      " + $e.Message) -ForegroundColor DarkGray })
        $conn.Open()
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $Sql
        $cmd.CommandTimeout = 0    # sin límite: los restore pueden tardar
        [void]$cmd.ExecuteNonQuery()
    } finally { $conn.Dispose() }
}

# ---------- Ruta base de backups vista DESDE EL SERVIDOR SQL -----------
function Resolve-RutaServidor {
    if ($RutaLocalBackup -ne '') { return $RutaLocalBackup }
    # Autodetección: leer la ruta local del share backup$ desde el registro del servidor
    try {
        $dt = Invoke-SqlQuery "EXEC master.dbo.xp_regread N'HKEY_LOCAL_MACHINE', N'SYSTEM\CurrentControlSet\Services\LanmanServer\Shares', N'backup$'"
        foreach ($fila in $dt.Rows) {
            foreach ($col in $dt.Columns) {
                $val = [string]$fila[$col.ColumnName]
                foreach ($parte in ($val -split "[`0`r`n]")) {
                    if ($parte -match '^Path=(.+)$') { return $Matches[1].TrimEnd('\') }
                }
            }
        }
    } catch { }
    return $ShareBackup   # último recurso: que el servicio SQL lea por UNC
}

function Test-RutaEnServidor([string]$ruta) {
    try {
        $dt = Invoke-SqlQuery "EXEC master.dbo.xp_fileexist @p" @{ '@p' = $ruta }
        return ([int]$dt.Rows[0][1] -eq 1)   # columna 'File is a Directory'
    } catch { return $false }
}

# ============================ INICIO ============================
Write-Log "=== Restauración de sucursales — carpeta $Fecha ===" Cyan

$CarpetaDiaUNC = Join-Path $ShareBackup $Fecha
if (-not (Test-Path $CarpetaDiaUNC)) { throw "No existe la carpeta $CarpetaDiaUNC" }

$RutaBaseServidor = Resolve-RutaServidor
$CarpetaDiaServidor = Join-Path $RutaBaseServidor $Fecha
if (-not (Test-RutaEnServidor $CarpetaDiaServidor)) {
    if ($RutaBaseServidor -ne $ShareBackup) {
        Write-Log "El servidor no ve '$CarpetaDiaServidor', se intentará por UNC." Yellow
        $RutaBaseServidor = $ShareBackup
        $CarpetaDiaServidor = Join-Path $RutaBaseServidor $Fecha
    }
    if (-not (Test-RutaEnServidor $CarpetaDiaServidor)) {
        throw "El servicio de SQL Server no puede leer la carpeta de backups ni por ruta local ni por UNC. Define `$RutaLocalBackup en la configuración del script con la ruta local del share en el servidor (ej. 'D:\Backup')."
    }
}
Write-Log "Ruta de backups vista por el servidor: $CarpetaDiaServidor" DarkGray

# Bases existentes en la instancia
$dbsExistentes = @()
foreach ($f in (Invoke-SqlQuery "SELECT name FROM sys.databases").Rows) { $dbsExistentes += $f.name }

# Registro de restauraciones ya hechas
$ArchivoEstado = Join-Path $CarpetaDiaUNC '_restauradas.json'
$estado = @{}
if (Test-Path $ArchivoEstado) {
    $json = Get-Content $ArchivoEstado -Raw | ConvertFrom-Json
    foreach ($p in $json.PSObject.Properties) { $estado[$p.Name] = $p.Value }
}

# Inventario de zips: el más reciente por sucursal (raíz + 11am/2pm/5pm)
$patron = '^SGCRC_(\d{12})_(.+)\.zip$'
$candidatos = @{}
foreach ($zip in (Get-ChildItem $CarpetaDiaUNC -Recurse -Filter 'SGCRC_*.zip')) {
    if ($zip.Name -match $patron) {
        $ts = $Matches[1]; $suc = $Matches[2]
        if ($Sucursales.Count -gt 0 -and ($Sucursales -notcontains $suc)) { continue }
        if (-not $candidatos.ContainsKey($suc) -or $ts -gt $candidatos[$suc].Ts) {
            $candidatos[$suc] = @{ Ts = $ts; Zip = $zip }
        }
    }
}
if ($candidatos.Count -eq 0) { throw "No se encontraron zips SGCRC_*.zip en $CarpetaDiaUNC" }
Write-Log ("Sucursales detectadas: {0}" -f (($candidatos.Keys | Sort-Object) -join ', ')) White

$resumen = @()
foreach ($suc in ($candidatos.Keys | Sort-Object)) {
    $zip = $candidatos[$suc].Zip
    $db  = $PrefijoDB + $suc
    Write-Host ""
    Write-Log ("--- {0}  (zip: {1}) ---" -f $db, $zip.Name) Cyan

    if ($dbsExistentes -notcontains $db) {
        Write-Log "  La base '$db' no existe en la instancia. OMITIDA." Yellow
        $resumen += [pscustomobject]@{ Sucursal = $suc; Estado = 'SIN BASE DESTINO'; Zip = $zip.Name }
        continue
    }
    if (-not $Forzar -and $estado.ContainsKey($zip.Name)) {
        Write-Log "  Ya se restauró antes ($($estado[$zip.Name])). OMITIDA (usa -Forzar para repetir)." DarkGray
        $resumen += [pscustomobject]@{ Sucursal = $suc; Estado = 'YA RESTAURADA'; Zip = $zip.Name }
        continue
    }

    $carpetaExtraccion = Join-Path (Join-Path $CarpetaDiaUNC '_extraidos') ([IO.Path]::GetFileNameWithoutExtension($zip.Name))
    try {
        # 1) Descomprimir (temporal: se elimina al terminar la restauración)
        if (Test-Path $carpetaExtraccion) { Remove-Item $carpetaExtraccion -Recurse -Force }
        Write-Log "  Descomprimiendo $([math]::Round($zip.Length/1MB)) MB..." White
        [System.IO.Compression.ZipFile]::ExtractToDirectory($zip.FullName, $carpetaExtraccion)
        $bak = Get-ChildItem $carpetaExtraccion -Recurse -Filter '*.bak' | Select-Object -First 1
        if ($null -eq $bak) { throw "El zip no contiene ningún archivo .bak" }

        # Ruta del .bak tal como la ve el servidor SQL
        $bakServidor = $bak.FullName.Replace($CarpetaDiaUNC, $CarpetaDiaServidor)

        # 2) Archivos lógicos del backup
        $lista = Invoke-SqlQuery "RESTORE FILELISTONLY FROM DISK = @p" @{ '@p' = $bakServidor }

        # 3) Rutas físicas ACTUALES de la base destino (para el MOVE = "Relocate all files")
        $actuales = Invoke-SqlQuery "SELECT name, physical_name, type FROM sys.master_files WHERE database_id = DB_ID(@db) ORDER BY type, file_id" @{ '@db' = $db }
        $datosAct = @($actuales.Rows | Where-Object { $_.type -eq 0 })
        $logsAct  = @($actuales.Rows | Where-Object { $_.type -eq 1 })

        $moves = @(); $iD = 0; $iL = 0
        foreach ($f in ($lista.Rows | Sort-Object FileId)) {
            $logico = ($f.LogicalName -replace "'", "''")
            if ($f.Type -eq 'L') {
                if ($iL -lt $logsAct.Count) { $destino = $logsAct[$iL].physical_name }
                else { $destino = Join-Path (Split-Path $logsAct[0].physical_name) ("{0}_log{1}.ldf" -f $db, $iL) }
                $iL++
            } else {
                if ($iD -lt $datosAct.Count) { $destino = $datosAct[$iD].physical_name }
                else { $destino = Join-Path (Split-Path $datosAct[0].physical_name) ("{0}_dato{1}.ndf" -f $db, $iD) }
                $iD++
            }
            $destino = $destino -replace "'", "''"
            $moves += "MOVE N'$logico' TO N'$destino'"
        }

        # 4) Restaurar: cerrar conexiones + overwrite + relocate
        $bakSql = $bakServidor -replace "'", "''"
        $sqlRestore = @"
ALTER DATABASE [$db] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
RESTORE DATABASE [$db] FROM DISK = N'$bakSql'
WITH REPLACE, $($moves -join ', '), STATS = 25;
ALTER DATABASE [$db] SET MULTI_USER;
"@
        Write-Log "  Restaurando sobre [$db]..." White
        $cronometro = [Diagnostics.Stopwatch]::StartNew()
        Invoke-SqlRestore $sqlRestore
        $cronometro.Stop()
        Write-Log ("  OK — restaurada en {0:mm\:ss} min." -f $cronometro.Elapsed) Green

        $estado[$zip.Name] = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        $estado | ConvertTo-Json | Set-Content -Path $ArchivoEstado -Encoding UTF8
        $resumen += [pscustomobject]@{ Sucursal = $suc; Estado = 'RESTAURADA'; Zip = $zip.Name }
    }
    catch {
        Write-Log ("  ERROR: {0}" -f $_.Exception.Message) Red
        # Si quedó en SINGLE_USER por un fallo a mitad de camino, intentar liberar
        try { Invoke-SqlRestore "ALTER DATABASE [$db] SET MULTI_USER" } catch { }
        $resumen += [pscustomobject]@{ Sucursal = $suc; Estado = 'ERROR'; Zip = $zip.Name }
    }
    finally {
        # Eliminar la carpeta temporal de extracción para no ocupar espacio en disco
        if (Test-Path $carpetaExtraccion) {
            try {
                Remove-Item $carpetaExtraccion -Recurse -Force
                Write-Log "  Carpeta temporal de extracción eliminada." DarkGray
            } catch {
                Write-Log "  Aviso: no se pudo eliminar $carpetaExtraccion — $($_.Exception.Message)" Yellow
            }
        }
    }
}

# Eliminar la carpeta _extraidos si quedó vacía
$carpetaExtraidos = Join-Path $CarpetaDiaUNC '_extraidos'
if (Test-Path $carpetaExtraidos) {
    try {
        if (@(Get-ChildItem $carpetaExtraidos -Force).Count -eq 0) { Remove-Item $carpetaExtraidos -Force }
    } catch { }
}

# ============================ RESUMEN ============================
Write-Host ""
Write-Log "=== RESUMEN ===" Cyan
foreach ($r in $resumen) {
    $color = 'White'
    if ($r.Estado -eq 'RESTAURADA') { $color = 'Green' }
    elseif ($r.Estado -eq 'ERROR') { $color = 'Red' }
    elseif ($r.Estado -eq 'YA RESTAURADA') { $color = 'DarkGray' }
    else { $color = 'Yellow' }
    Write-Log ("  {0,-15} {1,-16} {2}" -f $r.Sucursal, $r.Estado, $r.Zip) $color
}
$errores = @($resumen | Where-Object { $_.Estado -eq 'ERROR' })
if ($errores.Count -gt 0) { exit 1 }
