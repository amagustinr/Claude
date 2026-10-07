"""
Motor de generación de música con IA (100% local) basado en MusicGen (Meta)
usando la librería transformers de Hugging Face.

Modos:
  - texto      : texto -> música
  - melodia    : tu audio (voz tarareada, silbido, instrumento) guía la melodía
  - continuar  : extiende un audio existente respetando su estilo
Todos los modos admiten N variaciones en un solo lote.
"""
from __future__ import annotations

import gc
import json
import os
import subprocess
import tempfile
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

SAMPLE_RATE = 32000          # frecuencia nativa de MusicGen
TOKENS_POR_SEGUNDO = 50      # EnCodec de MusicGen = 50 frames/seg
DURACION_MAX = 30            # límite práctico del modelo (~1500 tokens)

MODELOS_TEXTO = {
    "small (rápido, 300M)": "facebook/musicgen-small",
    "medium (mejor calidad, 1.5B)": "facebook/musicgen-medium",
    "large (máxima calidad, 3.3B)": "facebook/musicgen-large",
}
MODELO_MELODIA = "facebook/musicgen-melody"

CARPETA_SALIDA = Path(__file__).parent / "salidas"


# --------------------------------------------------------------------------- #
# Utilidades de audio
# --------------------------------------------------------------------------- #
def _ruta_ffmpeg() -> str:
    """Usa el ffmpeg embebido de imageio-ffmpeg (no hace falta instalarlo en Windows)."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def cargar_audio(ruta: str, max_segundos: float | None = None) -> np.ndarray:
    """Carga cualquier audio/video (mp3, wav, ogg, opus, mp4 de WhatsApp...) como mono 32 kHz float32."""
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "in.wav")
        cmd = [_ruta_ffmpeg(), "-y", "-loglevel", "error", "-i", ruta,
               "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "wav", wav]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f"No se pudo leer el audio: {r.stderr.strip()}")
        data, _ = sf.read(wav, dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)
    if max_segundos:
        data = data[: int(max_segundos * SAMPLE_RATE)]
    # normaliza la entrada para que la voz baja no se pierda
    pico = np.abs(data).max() or 1.0
    return (data / pico * 0.9).astype(np.float32)


def normalizar(audio: np.ndarray, pico_objetivo: float = 0.95) -> np.ndarray:
    pico = np.abs(audio).max() or 1.0
    return (audio / pico * pico_objetivo).astype(np.float32)


# --------------------------------------------------------------------------- #
# Gestión de modelos (uno a la vez en VRAM)
# --------------------------------------------------------------------------- #
class GestorModelos:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.dtype = torch.float16 if self.device == "cuda" else torch.float32
        self._id = None
        self.model = None
        self.processor = None

    def info(self) -> str:
        if self.device == "cuda":
            p = torch.cuda.get_device_properties(0)
            return f"GPU: {p.name} ({p.total_memory / 1024**3:.1f} GB) · float16"
        return "CPU (sin GPU CUDA detectada) · será lento, usa el modelo small"

    def cargar(self, model_id: str):
        if self._id == model_id:
            return self.model, self.processor
        self.liberar()
        from transformers import AutoProcessor
        if "melody" in model_id:
            from transformers import MusicgenMelodyForConditionalGeneration as Clase
        else:
            from transformers import MusicgenForConditionalGeneration as Clase
        self.processor = AutoProcessor.from_pretrained(model_id)
        self.model = Clase.from_pretrained(model_id, torch_dtype=self.dtype).to(self.device)
        self.model.eval()
        self._id = model_id
        return self.model, self.processor

    def liberar(self):
        self.model = self.processor = self._id = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def a_dispositivo(self, inputs: dict) -> dict:
        out = {}
        for k, v in inputs.items():
            if torch.is_tensor(v):
                v = v.to(self.device)
                if v.is_floating_point():
                    v = v.to(self.dtype)
            out[k] = v
        return out


# --------------------------------------------------------------------------- #
# Generación
# --------------------------------------------------------------------------- #
@dataclass
class Parametros:
    modo: str                 # "texto" | "melodia" | "continuar"
    prompt: str
    duracion: float = 10.0
    variaciones: int = 1
    modelo: str = "facebook/musicgen-medium"
    guidance: float = 3.0     # cuánto obedece al texto (1-10)
    temperatura: float = 1.0  # creatividad
    top_k: int = 250
    semilla: int | None = None
    audio_ruta: str | None = None
    segundos_audio: float = 10.0   # cuánto del audio de entrada usar


class Generador:
    def __init__(self):
        self.gestor = GestorModelos()
        CARPETA_SALIDA.mkdir(exist_ok=True)

    def generar(self, p: Parametros, progreso=None) -> list[str]:
        if p.semilla is not None and p.semilla >= 0:
            torch.manual_seed(p.semilla)
        n = max(1, int(p.variaciones))
        textos = [p.prompt.strip() or "instrumental music"] * n

        if p.modo == "melodia":
            model_id = MODELO_MELODIA
        else:
            model_id = p.modelo

        if progreso: progreso(0.1, desc=f"Cargando modelo {model_id} (la 1ª vez se descarga)...")
        model, processor = self.gestor.cargar(model_id)
        sr = model.config.audio_encoder.sampling_rate

        audio_in = None
        if p.modo in ("melodia", "continuar"):
            if not p.audio_ruta:
                raise ValueError("Este modo necesita un audio de entrada.")
            audio_in = cargar_audio(p.audio_ruta, p.segundos_audio)

        if p.modo == "texto":
            inputs = processor(text=textos, padding=True, return_tensors="pt")
        else:  # melodia o continuar
            inputs = processor(audio=[audio_in] * n, sampling_rate=sr, text=textos,
                               padding=True, return_tensors="pt")
        padding_mask = inputs.get("padding_mask")
        inputs = self.gestor.a_dispositivo(dict(inputs))

        duracion = float(min(p.duracion, DURACION_MAX))
        if p.modo == "continuar":
            # el prompt de audio consume parte del contexto del modelo
            duracion = min(duracion, DURACION_MAX - len(audio_in) / sr)
        max_tokens = max(50, int(duracion * TOKENS_POR_SEGUNDO))

        if progreso: progreso(0.3, desc=f"Generando {n} variación(es) de {duracion:.0f}s...")
        with torch.inference_mode():
            valores = model.generate(**inputs, do_sample=True, guidance_scale=p.guidance,
                                     temperature=p.temperatura, top_k=int(p.top_k),
                                     max_new_tokens=max_tokens)

        if p.modo == "continuar" and padding_mask is not None:
            clips = processor.batch_decode(valores.float().cpu(), padding_mask=padding_mask)
            clips = [np.asarray(c).reshape(-1) for c in clips]
        else:
            clips = [valores[i, 0].float().cpu().numpy() for i in range(valores.shape[0])]

        if progreso: progreso(0.9, desc="Guardando archivos...")
        return self._guardar(clips, sr, p)

    def _guardar(self, clips, sr, p: Parametros) -> list[str]:
        sello = datetime.now().strftime("%Y%m%d_%H%M%S")
        rutas = []
        for i, clip in enumerate(clips, 1):
            ruta = CARPETA_SALIDA / f"{sello}_{p.modo}_v{i}.wav"
            sf.write(ruta, normalizar(clip), sr)
            rutas.append(str(ruta))
        meta = asdict(p) | {"archivos": [Path(r).name for r in rutas], "fecha": sello}
        (CARPETA_SALIDA / f"{sello}_{p.modo}.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        return rutas
