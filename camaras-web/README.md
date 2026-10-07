# CamarasWeb

Visor web de cámaras IP **Dahua / Axis** para monitoreo de sucursales. Es una aplicación **ASP.NET Core 8**
que lee las cámaras de la base de datos SQL Server `CAMARAS` y usa **go2rtc** para convertir el RTSP de
las cámaras a WebRTC/MSE, de modo que se vean en Chrome/Edge (grilla por monitor, modo kiosko, alta de cámaras).

## Requisitos
- **SDK de .NET 8** — https://dotnet.microsoft.com/download/dotnet/8.0
- **go2rtc** (Windows x64). El ejecutable **no se incluye en el repositorio**: descárgalo con
  `scripts\descargar-go2rtc.ps1` (lo deja en `go2rtc\go2rtc.exe`) o manualmente desde
  https://github.com/AlexxIT/go2rtc/releases (`go2rtc_win64.zip`) y copia `go2rtc.exe` en la carpeta `go2rtc\`.
- **SQL Server** con la base de datos **`CAMARAS`** y sus procedimientos almacenados.
- Chrome o Edge.

## Configuración
1. En SQL Server, ejecuta `sql\01_login_camaras_web.sql` como administrador para crear el login
   `camaras_web` con permiso solo de `EXECUTE` sobre los SPs de la web. **Cambia antes la clave `CAMBIAR_ESTA_CLAVE`.**
2. Edita `appsettings.json` (plantilla en `appsettings.example.json`) y en `ConnectionStrings:ConexionCAMARAS`
   reemplaza `SERVIDOR_SQL\INSTANCIA` y `CAMBIAR_CLAVE` por el servidor y la clave reales.
   **No subas al repositorio la clave real.**
3. Para probar sin base de datos: `"Datos": { "Modo": "Demo" }`.

## Ejecutar y publicar
- Desarrollo: `iniciar.bat` (descarga go2rtc si falta, compila y abre http://localhost:5080).
- Publicación: `publicar.bat` → genera la carpeta `publish\`. Opcional: `scripts\instalar-servicio.bat`
  (como administrador) lo instala como servicio de Windows y abre los puertos 5080 y 8555.
- Monitores en modo kiosko: `scripts\Iniciar-Monitores.ps1` abre una ventana por pantalla
  (`-ListarPantallas`, `-Monitores 3,4,1,2`, `-Servidor http://SERVIDOR:5080 -RegistrarInicio`, `-Cerrar`).

---

## Documentación detallada

Versión web de `CamarasSucursales` (WinForms + VLC). Usa **la misma base de datos `CAMARAS`
y los mismos procedimientos almacenados**, así que no hay que tocar SQL Server.

```
Navegador (Chrome/Edge)  ──HTTP/WebSocket──►  CamarasWeb (ASP.NET Core 8, puerto 5080)
                                                   │  SPs: spGetCamarasxMonitor_DAHUA_AXIS, spGetSucursales,
                                                   │       spGetSucursalesxId, spInsert/UpdateCamaraDahuaAxis
                                                   ▼
                                              go2rtc.exe (127.0.0.1:1984)  ──RTSP──►  cámaras
```

Los navegadores no reproducen RTSP, así que **go2rtc** (un solo `.exe`, sin instalación) toma el RTSP
de cada cámara y lo entrega por WebRTC o MSE con ~0,5 s de latencia, sin transcodificar (poco CPU).
El navegador **nunca recibe usuarios ni contraseñas** de las cámaras: solo un nombre de stream (`m1_0`, `m1_1`…).

## Requisitos
- SDK de .NET 8 (para compilar) — https://dotnet.microsoft.com/download/dotnet/8.0
- go2rtc para Windows: `scripts\descargar-go2rtc.ps1` lo descarga automáticamente en `go2rtc\go2rtc.exe`
- Chrome o Edge (H.264)

## Ejecutar
1. Revisa la cadena de conexión en `appsettings.json` (es la misma de `App.config`).
2. Doble clic en **`iniciar.bat`** (descarga go2rtc si falta, compila y abre http://localhost:5080).
3. Escribe el número de monitor → se abre la grilla de cámaras.

Para probar sin base de datos pon `"Datos": { "Modo": "Demo" }` (usa cámaras de prueba; requiere `ffmpeg` en el PATH).

## Equivalencias con el WinForms

| WinForms | Web |
|---|---|
| `ConfiguracionDahuaAxis` (pedir monitor) | `index.html` (recuerda el último monitor) |
| `CamarasDahuaAxis` grilla 2x2 con VLC | `visor.html?monitor=N` (grilla automática: 2x2 para 4 cámaras) |
| `VerificarCamara` cada 5 s | Revisión cada 5 s; si la imagen no avanza en 20 s, se reconecta solo esa cámara |
| F5 → `RecargarCamaras` | F5 (Ctrl+F5 = recargar la página completa) |
| Recarga forzada cada 1 hora (corta todas) | Cada 5 min revisa si cambió la lista en la BD y solo redibuja si cambió (no corta el video) |
| Grilla con stream **principal** | Grilla con **substream**; doble clic = cámara sola en **HD** (stream principal) |
| `RegistrarDahuaAxis` | `registrar.html` |
| — | Doble clic = verla sola en HD (vuelve sola a la grilla a los 5 min) · `F` pantalla completa · `A` ajustar/estirar |

La URL RTSP se arma igual que antes, con dos variantes por cámara:

| | Grilla (`m{monitor}_{i}`) | Ampliada / HD (`m{monitor}_{i}_hd`) |
|---|---|---|
| Axis (tipo 1) | `.../axis-media/media.amp?videocodec=h264&resolution=640x360` | `.../axis-media/media.amp?videocodec=h264` |
| Dahua (otro tipo) | `.../cam/realmonitor?channel=1&subtype=1` | `.../cam/realmonitor?channel=1&subtype=0` |

go2rtc solo se conecta a una cámara cuando alguien la está mirando, y comparte **una sola conexión RTSP**
entre todas las pantallas/PCs que la ven. Registrar el stream HD no consume nada hasta que se amplía.

En el campo IP también puedes poner `ip:puerto` o una URL `rtsp://…` completa.

## Configuración (`appsettings.json`)
| Clave | Uso |
|---|---|
| `Urls` | Puerto de la web (`http://0.0.0.0:5080` = accesible desde otras PCs) |
| `Camaras:SubstreamEnGrilla` | `true` (recomendado): substream en la grilla, principal solo al ampliar. `false` = principal en todo, como el WinForms |
| `Camaras:DahuaSubtype` | Subtype del stream **ampliado** Dahua (`0` = principal) |
| `Camaras:AxisResolucionSub` | Resolución de las Axis en la grilla (`640x360` 16:9; use `640x480` si la cámara es 4:3) |
| `Camaras:AxisForzarH264` | Pide H.264 a las Axis |
| `Go2rtc:TranscodificarAH264` | Si alguna Dahua está en **H.265** y no se ve, actívalo (requiere ffmpeg, consume CPU). Mejor: configurar la cámara en H.264 |
| `Go2rtc:PuertoWebRtc` | 8555 (abrir en el firewall si se ve desde otras PCs) |

## Modo monitor (kiosko): PC con 4 monitores
`scripts\Iniciar-Monitores.ps1` abre **una ventana kiosko por pantalla**, cada una con su propio perfil
de navegador (si no, Edge/Chrome apilan todas las ventanas en la misma pantalla) y la ubica en su monitor:

```powershell
.\scripts\Iniciar-Monitores.ps1 -ListarPantallas          # ver el orden detectado
.\scripts\Iniciar-Monitores.ps1                           # pantalla 1 -> monitor 1, 2 -> 2 ...
.\scripts\Iniciar-Monitores.ps1 -Monitores 3,4,1,2        # si el orden físico no coincide
.\scripts\Iniciar-Monitores.ps1 -Servidor http://SERVIDOR:5080 -RegistrarInicio   # abrir al iniciar sesión
.\scripts\Iniciar-Monitores.ps1 -Cerrar                   # cerrar las 4 ventanas
```
Espera hasta 3 minutos a que el servicio responda (útil al encender la PC).
`scripts\abrir-monitor-kiosko.bat N` sigue sirviendo para abrir un solo monitor en otra PC.

## Publicar / servicio de Windows
1. `publicar.bat` → genera la carpeta `publish` (incluye go2rtc).
2. `scripts\instalar-servicio.bat` (como administrador) → servicio `CamarasWeb` con inicio automático
   y reglas de firewall para 5080 y 8555.

## Notas
- La contraseña se deja vacía al editar para conservar la actual; la web nunca la muestra.
- **Cambie `sa`**: `sql\01_login_camaras_web.sql` crea el login `camaras_web` con permiso solo de `EXECUTE`
  sobre los 5 SPs que usa la web. Luego ponga ese usuario en `ConexionCAMARAS`.
- Si go2rtc se cae, el servicio lo vuelve a levantar en ~10 s y registra de nuevo todos los streams
  (antes las pantallas quedaban en negro hasta reiniciar el servicio).
- Los mensajes de error de go2rtc que llegan al navegador y al log se limpian de `usuario:clave`.
- go2rtc se ejecuta con configuración en memoria (no guarda las URLs con contraseña en disco) y su
  API solo escucha en 127.0.0.1; la web hace de proxy solo para los streams que registró.

## Recomendaciones para las cámaras (IP pública)
- **Sub Stream en H.264** en todas las Dahua (p. ej. 640×360 o 704×480, 10–15 fps, ~384–512 kbps). Si el
  substream está en H.265 o MJPEG no se verá en la grilla.
- Ancho de banda aproximado en la central con 16 cámaras: principal 1080p ≈ 2–4 Mbps c/u (32–64 Mbps en total)
  frente a substream ≈ 0,3–0,5 Mbps c/u (5–8 Mbps en total).
- Use en cada cámara un usuario de **solo visualización**, no `admin`, y limite el puerto 554 de cada sucursal a
  la IP pública de la central (o, mejor, una VPN site-to-site): RTSP viaja sin cifrar.

## Historial
- **1.1.0 (24/09/2026)**: substream en la grilla + HD al ampliar, vigilante que reinicia go2rtc y re-registra
  los streams, revisión de cambios cada 5 min sin cortar el video (reemplaza la recarga forzada de cada hora),
  `Iniciar-Monitores.ps1` para 4 pantallas, limpieza de credenciales en errores/log, script SQL de permisos mínimos.
- 1.0.0 (23/09/2026): versión web inicial.
