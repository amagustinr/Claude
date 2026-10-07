# Mi Soundboard (app nativa .NET MAUI)

App Android nativa en C# / .NET 10 MAUI. Dos pestañas:

- **Tablero**: rejilla de pads tipo sampler (2, 3 o 4 columnas). Tocar un pad lo hace sonar, se enciende su LED y una barra muestra el progreso. "Detener todo" corta cualquier sonido.
- **Configurar**: añadir audios desde el selector del móvil (varios a la vez), renombrar, color del pad, volumen, ordenar y borrar. También qué pasa al tocar un pad que ya suena: Reiniciar, Detener o Superponer.

La primera vez trae 6 sonidos de ejemplo sintetizados (marcados "EJEMPLO"), que puedes borrar.

## Arquitectura (N-capas + MVVM)

| Capa | Carpeta | Qué hace |
|---|---|---|
| Entidades | `Models/` | `Sound`, `TapMode` |
| Datos | `Data/` | `ISoundRepository` / `JsonSoundRepository`: `sounds.json` + carpeta `sounds/` en `FileSystem.AppDataDirectory` |
| Negocio / servicios | `Services/` | `SoundLibraryService` (alta, orden, borrado), `AudioPlayerService` (Plugin.Maui.Audio), `SettingsService` (Preferences) |
| Presentación | `ViewModels/`, `Views/` | MVVM con CommunityToolkit.Mvvm; páginas XAML |

Todo se registra por inyección de dependencias en `MauiProgram.cs`.

## Cómo instalarla en tu móvil

### Opción A: Visual Studio en Windows (la más directa)
1. Visual Studio 2026 (o 2022 17.14+) con la carga de trabajo **Desarrollo de interfaz de usuario de aplicaciones multiplataforma de .NET**.
2. Abre `soundboard/maui/SoundboardApp/SoundboardApp.csproj`.
3. En el móvil activa *Opciones de desarrollador* y *Depuración USB*, conéctalo por cable.
4. Elige tu móvil en el desplegable de destino y pulsa F5.

Para un APK instalable, desde la raíz del repositorio: `dotnet publish soundboard/maui/SoundboardApp/SoundboardApp.csproj -f net10.0-android -c Release` y copia al móvil el `*-Signed.apk` de `bin/Release/net10.0-android/publish/`.

### Opción B: GitHub Actions (sin instalar nada)
El workflow `.github/workflows/soundboard-android.yml` (en la raíz del repositorio) compila el APK en cada push a `main` que toque `soundboard/maui/` y lo deja como artefacto descargable (`MiSoundboard-apk`) en la pestaña *Actions*. También se puede lanzar a mano con *Run workflow*.

> El APK de Release va firmado con una clave de depuración generada automáticamente: sirve para instalarlo en tu móvil (permitiendo "orígenes desconocidos"), no para Google Play.
