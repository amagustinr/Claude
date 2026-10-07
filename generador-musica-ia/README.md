# Generador de Música con IA (local)

Basado en **MusicGen** (Meta) vía Hugging Face `transformers` + interfaz web **Gradio**. Todo corre en tu PC; internet solo se usa la 1ª vez para descargar los modelos (~2-3 GB cada uno, quedan en `%USERPROFILE%\.cache\huggingface`).

## Instalación (Windows + NVIDIA)
1. Instala **Python 3.10 o 3.11** (marca *Add to PATH*).
2. Doble clic en `instalar.bat` → debe decir `CUDA disponible: True`.
3. Doble clic en `iniciar.bat` → se abre http://127.0.0.1:7860

## Modos
| Modo | Modelo | Qué hace |
|---|---|---|
| Texto → música | musicgen-small / medium / large | Genera a partir de una descripción |
| Melodía desde mi audio | musicgen-melody | Tu voz/tarareo/silbido guía la melodía; el texto define estilo e instrumentos |
| Continuar un audio | el elegido | Extiende tu clip (la salida incluye el audio original + la continuación) |

Todos permiten **1-4 variaciones** por lote. Los WAV y un `.json` con los parámetros usados se guardan en `salidas\`.

## Consejos
- Escribe el prompt **en inglés**: género, instrumentos, ánimo y BPM (`andean folk, quena flute, charango, 100 bpm`).
- Notas de voz de WhatsApp (.opus/.ogg/.mp4) se aceptan directo (ffmpeg incluido).
- Para melodía: tararea claro y sin ruido de fondo, 5-15 s.
- **Semilla** fija = resultados reproducibles. **Guidance** alto = más fiel al texto, menos variado.
- Con 8 GB de VRAM: `medium` y `melody` van bien; `large` puede no entrar. Máximo 30 s por clip.
- Licencia de los pesos MusicGen: **CC-BY-NC 4.0** (uso no comercial).

## Estructura
- `motor.py` — carga de modelos, conversión de audio, generación y guardado (reutilizable desde otro script).
- `app.py` — interfaz Gradio.
