# Mi Voz TTS (local, Windows + GPU NVIDIA)

App web local (Gradio) para usar tu propia voz en TTS. Tiene dos pestañas:

1. **Grabar dataset**: la app te muestra una frase de `frases.txt`, tú la grabas, Whisper la transcribe al terminar y corriges el texto si hace falta. Al guardar, el clip queda en `dataset/wavs/clip_XXXX.wav` (mono, 22.05 kHz, 16 bits, sin silencios) y se registra en `dataset/metadata.csv` con formato LJSpeech (`id|texto|texto`).
2. **Generar con mi voz**: escribes o dictas un texto (Whisper lo transcribe) y XTTS v2 lo lee con tu voz, usando tus clips como referencia. Los audios generados quedan en `salidas/`.

## Instalación

1. Instala **Python 3.11** (marca "Add to PATH") y ten el **driver NVIDIA** actualizado.
2. Opcional, pero recomendado: instala ffmpeg con `winget install Gyan.FFmpeg`.
3. Ejecuta **`instalar.bat`**. Crea el `venv`, instala torch 2.8 con CUDA y las dependencias, y al final debe mostrar `CUDA disponible: True`.
   - Si tienes una RTX serie 50, cambia `cu126` por `cu128` en `instalar.bat`.
4. Ejecuta **`iniciar.bat`** y se abrirá `http://127.0.0.1:7860`. El navegador te pedirá permiso para usar el micrófono.

La primera vez que transcribas o generes audio se descargan los modelos: Whisper medium pesa unos 1.5 GB y XTTS v2 unos 1.8 GB.

## Consejos de grabación

- Usa un cuarto silencioso sin eco, con el micrófono a unos 15 a 20 cm y siempre el mismo micrófono.
- Graba clips de **3 a 15 s**. Con **1 a 3 minutos** (unos 15 a 30 clips) XTTS ya clona bien.
- Habla natural, con la entonación que quieres que tenga el resultado.
- En la pestaña 2, si dejas vacíos los clips de referencia, la app usa automáticamente los 10 mejores.

## VRAM (6 GB)

Whisper `medium` y XTTS juntos entran en unos 6 GB. Si te sale un error de memoria (*CUDA out of memory*):

- Pulsa **"Liberar Whisper (VRAM)"** antes de generar, o
- Cambia a `set WHISPER_MODEL=small` en `iniciar.bat`.

Si tienes 10 GB o más, usa `turbo` o `large-v3`, que transcriben mejor.

## Siguiente nivel

Si juntas **20 minutos o más** en el dataset, `metadata.csv` + `wavs/` ya tienen el formato necesario para hacer *fine-tuning* de XTTS o para entrenar una voz de Piper, que es más liviana e ideal para integrarla en apps.

## Licencia

XTTS v2 usa la licencia **Coqui Public Model License (uso no comercial)**. Para uso comercial conviene F5-TTS con una variante de licencia compatible, o Piper entrenado con tu dataset.
