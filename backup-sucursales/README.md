# Backup automatico de sucursales (SGCRC)

Backup directo de la BD `SGCRC` de cada sucursal (SQL Server Express), comprimido en ZIP/RAR con el nombre
`SGCRC_yyyyMMddHHmm_<Sucursal>.zip`, programado con el Programador de tareas de Windows (corre como SYSTEM;
si la PC estaba apagada a la hora programada, corre apenas se prenda).

## Archivos

| Archivo | Uso |
|---|---|
| `Backup-Sucursal.ps1` | Hace el backup (`COPY_ONLY` + `CHECKSUM` + `RESTORE VERIFYONLY`), comprime (WinRAR o ZIP nativo .NET si no hay WinRAR), prueba el archivo y aplica retencion |
| `Instalar-TareaBackup.ps1` | Instalador generico: copia el script a `C:\FAMECA\Backup`, da permisos SQL/NTFS minimos y registra la tarea |
| `Instalar-<Sucursal>.bat` | Lanzador con los parametros de cada sucursal (clic derecho -> Ejecutar como administrador; pide la clave de `sa`) |
| `Rollback-Backup.bat` | Deshabilita / elimina / rehabilita las tareas en cualquier sucursal |

## Sucursales

| Sucursal | Equipo / SO | Instancia | Nombre archivo | Carpeta | Horario |
|---|---|---|---|---|---|
| Lima Callao | SERVIDORCALLAO, Server 2012 R2 | `.\COMERCIALRC` | `LimaCallao` | `D:\FACTURACION\LimaCallao\backups` | 07:29 diario |
| Puente Piedra | RCPUENTEPIEDRA, Win 10 | `.\RCPUENTEPIEDRA` | `LimaPPiedra` | `D:\FACTURACION\PuentePiedra\backups` | 07:30, 11:00, 14:00, 17:00 Lun-Sab |
| Arequipa | SERVAREQUIPA, Win 11 | `.\SERVAREQUIPA` | `AqpArtempa` | `D:\FACTURACION\Arequipa\backups` | 07:30 diario |
| Rio Seco | ServAreqRioSeco, Win 11 | `.\RIOSECO` | `AqpRioSeco` | `D:\FACTURACION\RioSeco\backups` | 07:30 diario |

## Carpetas en cada sucursal

- `...\backups` -> solo los .zip/.rar finales (carpeta sincronizada con Syncthing)
- `...\_backup_tmp` -> .bak temporal (fuera de Syncthing)
- `...\_backup_logs` -> `backup_yyyyMM.log`

## Verificacion

```powershell
Get-ScheduledTask 'FAMECA Backup SGCRC *' | Get-ScheduledTaskInfo | Select TaskName, LastRunTime, LastTaskResult, NextRunTime
```
`LastTaskResult = 0` y `FIN OK` en el log = correcto.
