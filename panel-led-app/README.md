# Panel LED – app Android (v1.1)

Convierte la pantalla del celular en un panel LED de puntos: escribes un texto (con emojis) y se muestra como un letrero luminoso.

Paquete: `com.alexander.panelled` · minSdk 21 · targetSdk 34.

## Qué hace
- Texto libre con emojis (fila de emojis rápidos + teclado del sistema). Emojis a color o "encendidos" del color del LED.
- Velocidad 1–10 (también ajustable en pantalla completa tocando la pantalla).
- Efectos: desplazar a la izquierda, a la derecha, fijo y parpadeo. En Fijo/Parpadeo el texto no se mueve: si no cabe se achica hasta un 60 % y, si aún no cabe, se divide en páginas que cambian solas.
- Colores: azul, rojo, verde, ámbar, blanco, cian, rosa, violeta, arcoíris.
- Tamaño del LED: grueso (14 filas), medio (20), fino (28), muy fino (40).
- Mensajes guardados (localStorage del WebView).
- Pantalla completa: horizontal, modo inmersivo y pantalla siempre encendida; el botón Atrás sale.

## Estructura
| Archivo | Qué es |
|---|---|
| `assets/index.html` | Interfaz y motor de dibujo (HTML/JS con canvas). Se puede abrir directo en un navegador para probar. |
| `src/com/alexander/panelled/MainActivity.java` | Envoltorio nativo: WebView + puente JS `Android.display(bool)` para orientación, inmersivo y pantalla encendida. |
| `AndroidManifest.xml`, `res/` | Manifiesto, nombre de la app e íconos. |
| `build.sh` | Compila sin Gradle: aapt + javac + dx + zipalign + apksigner. |

## Compilar (Linux, Debian/Ubuntu)
```bash
sudo apt-get install aapt apksigner zipalign android-sdk-platform-23 dalvik-exchange default-jdk
./build.sh   # genera build/PanelLED.apk
```
Si no existe `release.keystore`, el script crea uno nuevo. El keystore no se sube al repositorio: guarda el original para publicar actualizaciones con la misma firma.
