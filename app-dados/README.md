# Mesa de Dados

App móvil para tirar dados en 3D. Eliges cuántos dados quieres (de 1 a 12, con atajos de 1 a 6), tocas la pantalla y los dados saltan, rebotan y muestran el total. Tiene sonido sintetizado de los golpes, vibración y recuerda tu última elección.

## Contenido

- `index.html`: la app completa en un solo archivo (HTML, CSS y JavaScript). Se abre en cualquier navegador, también en el celular.
- `android/`: proyecto Android que envuelve la misma página en un `WebView`.
  - `assets/index.html`: la página, con un ajuste para que el botón "atrás" de Android vuelva a la pantalla de cantidad.
  - `src/.../MainActivity.java`: la actividad que carga la página.
  - `build.sh`: compila y firma el APK sin Gradle (minSdk 21, targetSdk 34).

## Compilar el APK

```bash
cd android
KS_PASS=tu_clave ./build.sh
```

El APK queda en `android/build/MesaDeDados.apk`. El keystore no se sube al repositorio; si no existe, el script crea uno nuevo. Para actualizar una app ya instalada hay que firmar con el mismo keystore que se usó antes.
