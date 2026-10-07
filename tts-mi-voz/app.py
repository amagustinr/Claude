"""
Mi Voz TTS - app local para:
  1) Grabar un dataset de tu voz (frases guiadas + transcripcion automatica con Whisper)
  2) Generar audio con tu voz clonada (XTTS v2), escribiendo o dictando el texto

Ejecutar:  python app.py   ->  se abre http://127.0.0.1:7860
"""
import os
import time
from pathlib import Path

# XTTS v2 usa la licencia CPML (uso NO comercial). Esto evita el prompt interactivo.
os.environ.setdefault("COQUI_TOS_AGREED", "1")

import numpy as np
import soundfile as sf
import librosa
import torch
import gradio as gr

# ============================ Configuracion ============================
BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / "dataset"
WAVS_DIR = DATASET_DIR / "wavs"
METADATA = DATASET_DIR / "metadata.csv"      # formato LJSpeech: id|texto|texto
OUTPUT_DIR = BASE_DIR / "salidas"
FRASES_FILE = BASE_DIR / "frases.txt"

# tiny / base / small / medium / turbo / large-v3
# Con 6 GB de VRAM: "medium" o "small". Con 10 GB o mas: "turbo" o "large-v3".
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "medium")
XTTS_MODEL = "tts_models/multilingual/multi-dataset/xtts_v2"
LANG = "es"
SAMPLE_RATE = 22050          # frecuencia con la que se guardan los clips
MAX_REFS = 10                # maximo de clips de referencia que se pasan a XTTS
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

WAVS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ============================ Modelos (carga diferida) ============================
_whisper = None
_xtts = None


def get_whisper():
    global _whisper
    if _whisper is None:
        import whisper
        print(f"[Whisper] cargando '{WHISPER_MODEL}' en {DEVICE}...")
        _whisper = whisper.load_model(WHISPER_MODEL, device=DEVICE)
    return _whisper


def get_xtts():
    global _xtts
    if _xtts is None:
        from TTS.api import TTS
        print(f"[XTTS] cargando modelo en {DEVICE} (la primera vez descarga ~1.8 GB)...")
        _xtts = TTS(XTTS_MODEL).to(DEVICE)
    return _xtts


def liberar_whisper():
    """Libera VRAM de Whisper (util con 6 GB si XTTS se queda sin memoria)."""
    global _whisper
    _whisper = None
    if DEVICE == "cuda":
        torch.cuda.empty_cache()
    return "Whisper descargado de la GPU."


# ============================ Utilidades de audio ============================
def a_float_mono(audio):
    """Gradio (type='numpy') entrega (sr, array[muestras, canales]) normalmente en int16."""
    sr, data = audio
    data = np.asarray(data)
    if np.issubdtype(data.dtype, np.integer):
        data = data.astype(np.float32) / np.iinfo(data.dtype).max
    else:
        data = data.astype(np.float32)
    if data.ndim > 1:
        data = data.mean(axis=1)
    return sr, data


def preparar_audio(audio):
    """Mono, 22.05 kHz, sin silencios al inicio/fin y normalizado."""
    sr, data = a_float_mono(audio)
    if sr != SAMPLE_RATE:
        data = librosa.resample(data, orig_sr=sr, target_sr=SAMPLE_RATE)
    data, _ = librosa.effects.trim(data, top_db=35)
    pico = float(np.max(np.abs(data))) if data.size else 0.0
    if pico > 0:
        data = data / pico * 0.95
    return data


def transcribir(data, sr):
    audio16 = librosa.resample(data, orig_sr=sr, target_sr=16000) if sr != 16000 else data
    res = get_whisper().transcribe(
        audio16.astype(np.float32), language=LANG, fp16=(DEVICE == "cuda")
    )
    return res["text"].strip()


# ============================ Dataset ============================
def cargar_frases():
    if FRASES_FILE.exists():
        lineas = FRASES_FILE.read_text(encoding="utf-8").splitlines()
        frases = [l.strip() for l in lineas if l.strip() and not l.strip().startswith("#")]
        if frases:
            return frases
    return ["Hola, esta es una prueba de mi voz."]


FRASES = cargar_frases()


def texto_frase(i):
    return f"### Frase {i + 1} de {len(FRASES)}\n> {FRASES[i]}"


def leer_metadata():
    if not METADATA.exists():
        return []
    filas = []
    for linea in METADATA.read_text(encoding="utf-8").splitlines():
        partes = linea.split("|")
        if len(partes) >= 2:
            filas.append((partes[0], partes[1]))
    return filas


def escribir_metadata(filas):
    contenido = "".join(f"{cid}|{txt}|{txt}\n" for cid, txt in filas)
    METADATA.write_text(contenido, encoding="utf-8")


def siguiente_id():
    nums = []
    for p in WAVS_DIR.glob("clip_*.wav"):
        sufijo = p.stem.split("_")[-1]
        if sufijo.isdigit():
            nums.append(int(sufijo))
    return f"clip_{(max(nums) + 1 if nums else 1):04d}"


def duracion(cid):
    p = WAVS_DIR / f"{cid}.wav"
    return sf.info(str(p)).duration if p.exists() else 0.0


def estado_dataset():
    filas = leer_metadata()
    tabla, total = [], 0.0
    for cid, txt in filas:
        d = duracion(cid)
        total += d
        tabla.append([cid, round(d, 1), txt])
    resumen = f"**{len(filas)} clips** · {total / 60:.1f} min grabados"
    if total < 60:
        resumen += " · para clonar bien con XTTS basta 1 a 3 min; para afinar (fine-tune) apunta a 20 min o más."
    ids = [cid for cid, _ in filas]
    return tabla, resumen, gr.update(choices=ids, value=None), gr.update(choices=ids)


def mejores_referencias():
    """Si no eliges clips: usa los mas largos entre 3 y 15 s."""
    candidatos = [(duracion(cid), cid) for cid, _ in leer_metadata()]
    candidatos = [c for c in candidatos if 3.0 <= c[0] <= 15.0] or candidatos
    candidatos.sort(reverse=True)
    return [str(WAVS_DIR / f"{cid}.wav") for _, cid in candidatos[:MAX_REFS]]


# ============================ Handlers - pestaña 1 ============================
def ds_transcribir(audio):
    if audio is None:
        raise gr.Error("Primero graba o sube un audio.")
    data = preparar_audio(audio)
    dur = len(data) / SAMPLE_RATE
    texto = transcribir(data, SAMPLE_RATE)
    aviso = f"Duración útil: **{dur:.1f} s**"
    if dur < 1.5:
        aviso += " · muy corto"
    elif dur > 15:
        aviso += " · algo largo (lo ideal es de 3 a 15 s)"
    return texto, aviso


def ds_guardar(audio, texto, i):
    if audio is None:
        raise gr.Error("No hay audio para guardar.")
    texto = (texto or "").replace("|", " ").replace("\n", " ").strip()
    if not texto:
        raise gr.Error("La transcripción está vacía. Pulsa 'Transcribir' o escribe el texto.")
    data = preparar_audio(audio)
    if len(data) / SAMPLE_RATE < 1.0:
        raise gr.Error("El audio dura menos de 1 segundo después de recortar silencios.")

    cid = siguiente_id()
    sf.write(str(WAVS_DIR / f"{cid}.wav"), data, SAMPLE_RATE, subtype="PCM_16")
    filas = leer_metadata()
    filas.append((cid, texto))
    escribir_metadata(filas)

    siguiente = min(i + 1, len(FRASES) - 1)
    tabla, resumen, dd_del, dd_refs = estado_dataset()
    return (None, "", f"Guardado **{cid}**", siguiente, texto_frase(siguiente),
            tabla, resumen, dd_del, dd_refs)


def ds_eliminar(cid):
    if not cid:
        raise gr.Error("Selecciona un clip.")
    escribir_metadata([f for f in leer_metadata() if f[0] != cid])
    p = WAVS_DIR / f"{cid}.wav"
    if p.exists():
        p.unlink()
    tabla, resumen, dd_del, _ = estado_dataset()
    ids = [c for c, _ in leer_metadata()]
    return tabla, resumen, dd_del, gr.update(choices=ids, value=[])


def mover(i, paso):
    i = max(0, min(len(FRASES) - 1, i + paso))
    return i, texto_frase(i)


# ============================ Handlers - pestaña 2 ============================
def dictar(audio, texto_actual):
    if audio is None:
        raise gr.Error("Graba algo para dictar.")
    sr, data = a_float_mono(audio)
    nuevo = transcribir(data, sr)
    return (texto_actual.rstrip() + " " + nuevo).strip() if texto_actual else nuevo


def generar(texto, refs, ref_extra, velocidad):
    texto = (texto or "").strip()
    if not texto:
        raise gr.Error("Escribe o dicta el texto a sintetizar.")

    wavs = [str(WAVS_DIR / f"{c}.wav") for c in (refs or [])]
    if ref_extra:
        wavs.append(ref_extra)
    if not wavs:
        wavs = mejores_referencias()
    wavs = [w for w in wavs if Path(w).exists()][:MAX_REFS]
    if not wavs:
        raise gr.Error("Necesitas al menos un clip de tu voz: grábalo en la pestaña 1.")

    salida = OUTPUT_DIR / f"tts_{time.strftime('%Y%m%d_%H%M%S')}.wav"
    t0 = time.time()
    get_xtts().tts_to_file(
        text=texto,
        speaker_wav=wavs,
        language=LANG,
        file_path=str(salida),
        split_sentences=True,
        speed=float(velocidad),
    )
    return str(salida), (f"Listo en {time.time() - t0:.1f} s con {len(wavs)} clip(s) de referencia "
                         f"→ `salidas/{salida.name}`")


# ============================ Interfaz ============================
with gr.Blocks(title="Mi Voz TTS") as demo:
    gr.Markdown(
        f"# Mi Voz TTS\nWhisper `{WHISPER_MODEL}` + XTTS v2 · dispositivo: **{DEVICE.upper()}**"
    )

    # ---------------- Pestaña 1 ----------------
    with gr.Tab("1. Grabar dataset"):
        idx = gr.State(0)
        frase_md = gr.Markdown(texto_frase(0))
        with gr.Row():
            b_prev = gr.Button("◀ Anterior", size="sm")
            b_next = gr.Button("Siguiente ▶", size="sm")
            b_copiar = gr.Button("Usar frase como texto", size="sm")

        mic = gr.Audio(sources=["microphone", "upload"], type="numpy",
                       label="Lee la frase en voz alta (tono natural, sin ruido de fondo)")
        b_trans = gr.Button("Transcribir con Whisper")
        txt = gr.Textbox(label="Transcripción (corrígela si Whisper se equivocó)", lines=2)
        aviso = gr.Markdown()
        b_guardar = gr.Button("Guardar en el dataset", variant="primary")

        gr.Markdown("---\n### Clips guardados")
        resumen = gr.Markdown()
        tabla = gr.Dataframe(headers=["id", "seg", "texto"], interactive=False, wrap=True)
        with gr.Row():
            dd_del = gr.Dropdown(label="Eliminar clip", choices=[], scale=3)
            b_del = gr.Button("Eliminar", variant="stop", scale=1)

    # ---------------- Pestaña 2 ----------------
    with gr.Tab("2. Generar con mi voz"):
        with gr.Row():
            with gr.Column():
                dictado = gr.Audio(sources=["microphone", "upload"], type="numpy",
                                   label="Dictar texto (opcional)")
                b_dict = gr.Button("Transcribir dictado → texto")
                texto_tts = gr.Textbox(label="Texto a leer con tu voz", lines=6,
                                       placeholder="Escribe aquí o dicta arriba...")
            with gr.Column():
                dd_refs = gr.Dropdown(label="Clips de referencia (vacío = elige los mejores automáticamente)",
                                      choices=[], multiselect=True)
                ref_extra = gr.Audio(sources=["upload", "microphone"], type="filepath",
                                     label="Referencia extra (opcional)")
                vel = gr.Slider(0.7, 1.3, value=1.0, step=0.05, label="Velocidad")
                with gr.Row():
                    b_gen = gr.Button("Generar audio", variant="primary", scale=3)
                    b_lib = gr.Button("Liberar Whisper (VRAM)", size="sm", scale=1)
        resultado = gr.Audio(label="Resultado", type="filepath")
        info = gr.Markdown()

    # ---------------- Eventos ----------------
    salidas_estado = [tabla, resumen, dd_del, dd_refs]
    demo.load(estado_dataset, outputs=salidas_estado)

    b_prev.click(lambda i: mover(i, -1), idx, [idx, frase_md])
    b_next.click(lambda i: mover(i, 1), idx, [idx, frase_md])
    b_copiar.click(lambda i: FRASES[i], idx, txt)
    b_trans.click(ds_transcribir, mic, [txt, aviso])
    mic.stop_recording(ds_transcribir, mic, [txt, aviso])   # transcribe al terminar de grabar
    b_guardar.click(ds_guardar, [mic, txt, idx],
                    [mic, txt, aviso, idx, frase_md] + salidas_estado)
    b_del.click(ds_eliminar, dd_del, salidas_estado)

    b_dict.click(dictar, [dictado, texto_tts], texto_tts)
    b_gen.click(generar, [texto_tts, dd_refs, ref_extra, vel], [resultado, info])
    b_lib.click(liberar_whisper, None, info)


if __name__ == "__main__":
    demo.queue().launch(inbrowser=True)
