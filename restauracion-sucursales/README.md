# Restauración de sucursales

Restaura automáticamente en `FMCSQLEXPRESS01\SQLEXPRESS2019` los backups diarios de las sucursales (`SGCRC_<timestamp>_<Sucursal>.zip`) que llegan a `\\FMCSQLEXPRESS01\backup$\dd-MM-yyyy`.

| Archivo | Uso |
|---|---|
| `Restaurar-Sucursales.ps1` | Script principal: toma el zip más reciente por sucursal, lo descomprime y restaura con `REPLACE` + `MOVE`. Lleva registro en `_restauradas.json` para no repetir. |
| `Restaurar-Sucursales.cmd` | Lanzador para ejecución **manual** (termina en `pause`). |
| `Crear-Tarea-Restaurar-Sucursales.ps1` | Registra la tarea programada: 07:50–09:00 cada 10 min, 11:10, 14:10 y 17:10. |

## Notas

- La tarea programada llama al `.ps1` directamente con `-NonInteractive`, **no** al `.cmd`: el `pause` deja la tarea colgada y las siguientes ejecuciones se rechazan (`0x800710E0`).
- `sa.cred` (contraseña cifrada con DPAPI) **no** se versiona: solo la descifra el usuario que la creó en ese equipo. Se genera sola en la primera ejecución manual.
- Registrar la tarea con el mismo usuario que generó `sa.cred`.

Parámetros: `-Fecha dd-MM-yyyy`, `-Sucursales A,B`, `-Forzar`.
