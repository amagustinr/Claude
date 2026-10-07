"""
Generador de Música con IA - interfaz web local (Gradio).
Ejecutar:  python app.py   ->  se abre http://127.0.0.1:7860
"""
import gradio as gr

from motor import Generador, Parametros, MODELOS_TEXTO, DURACION_MAX, CARPETA_SALIDA

MAX_VARIACIONES = 4
gen = Generador()

# MusicGen entiende mejor los prompts en INGLÉS
PRESETS = {
    "— elegir un estilo —": "",
    "Cumbia peruana": "peruvian cumbia, electric guitar melody, timbales, congas, guiro, festive, 95 bpm",
    "Rock latino": "latin rock, distorted electric guitars, energetic drums, bass, 120 bpm",
    "Lo-fi para trabajar": "lofi hip hop, mellow piano chords, vinyl crackle, soft drums, relaxing, 80 bpm",
    "Balada acústica": "acoustic ballad, fingerpicked guitar, soft piano, warm strings, emotional, 70 bpm",
    "Electrónica / EDM": "energetic EDM, big synth leads, four on the floor kick, sidechain bass, 128 bpm",
    "Salsa": "salsa, brass section, piano montuno, congas, timbales, cowbell, 180 bpm",
    "Andina": "andean folk music, quena flute, charango, bombo drum, pan flute, uplifting",
    "Orquestal épica": "epic cinematic orchestra, powerful drums, brass, choir, strings, heroic",
    "Reggaetón": "reggaeton beat, dembow rhythm, deep 808 bass, synth pads, 95 bpm",
    "Jazz suave": "smooth jazz, saxophone lead, upright bass, brushed drums, piano, relaxed",
}


def ejecutar(modo, prompt, modelo_nombre, duracion, variaciones, guidance,
             temperatura, top_k, semilla, archivo, microfono, seg_audio,
             progress=gr.Progress()):
    audio = microfono or (archivo.name if hasattr(archivo, "name") else archivo)
    clave = {"Texto → música": "texto", "Melodía desde mi audio": "melodia",
             "Continuar un audio": "continuar"}[modo]
    p = Parametros(modo=clave, prompt=prompt, duracion=duracion,
                   variaciones=int(variaciones), modelo=MODELOS_TEXTO[modelo_nombre],
                   guidance=guidance, temperatura=temperatura, top_k=int(top_k),
                   semilla=int(semilla) if semilla not in (None, "") else None,
                   audio_ruta=audio, segundos_audio=seg_audio)
    try:
        rutas = gen.generar(p, progreso=progress)
    except Exception as e:
        raise gr.Error(str(e))
    salidas = [gr.update(value=r, visible=True) for r in rutas]
    salidas += [gr.update(value=None, visible=False)] * (MAX_VARIACIONES - len(rutas))
    return salidas + [f"✅ {len(rutas)} archivo(s) guardados en la carpeta 'salidas'"]


def cambiar_modo(modo):
    necesita_audio = modo != "Texto → música"
    return (gr.update(visible=necesita_audio),
            gr.update(interactive=modo != "Melodía desde mi audio"))


# Gradio 6 movió "theme" de Blocks() a launch(); esto funciona en 4, 5 y 6
_GRADIO6 = int(gr.__version__.split(".")[0]) >= 6
_tema = gr.themes.Soft()

with gr.Blocks(title="Generador de Música IA", **({} if _GRADIO6 else {"theme": _tema})) as demo:
    gr.Markdown(f"# 🎵 Generador de Música con IA (local)\n**Dispositivo:** {gen.gestor.info()}")

    with gr.Row():
        with gr.Column(scale=1):
            modo = gr.Radio(["Texto → música", "Melodía desde mi audio", "Continuar un audio"],
                            value="Texto → música", label="Modo")
            preset = gr.Dropdown(list(PRESETS), value="— elegir un estilo —", label="Estilo rápido")
            prompt = gr.Textbox(lines=3, label="Descripción (mejor en inglés)",
                                placeholder="ej: upbeat funk, slap bass, brass, 110 bpm")
            preset.change(lambda k: PRESETS[k] or gr.update(), preset, prompt)

            with gr.Group(visible=False) as grupo_audio:
                archivo = gr.File(label="Audio de entrada (mp3, wav, ogg, opus, mp4 de WhatsApp…)",
                                  file_types=["audio", "video", ".opus", ".ogg", ".m4a"])
                microfono = gr.Audio(sources=["microphone"], type="filepath",
                                     label="…o grábalo aquí (tararea o silba)")
                seg_audio = gr.Slider(2, 20, value=10, step=1, label="Segundos del audio a usar")

            modelo = gr.Dropdown(list(MODELOS_TEXTO), value="medium (mejor calidad, 1.5B)",
                                 label="Modelo (el modo melodía usa musicgen-melody)")
            duracion = gr.Slider(3, DURACION_MAX, value=12, step=1, label="Duración (segundos)")
            variaciones = gr.Slider(1, MAX_VARIACIONES, value=2, step=1, label="Variaciones")

            with gr.Accordion("Avanzado", open=False):
                guidance = gr.Slider(1, 10, value=3, step=0.5,
                                     label="Guidance (fidelidad al texto)")
                temperatura = gr.Slider(0.5, 1.5, value=1.0, step=0.05,
                                        label="Temperatura (creatividad)")
                top_k = gr.Slider(50, 500, value=250, step=10, label="Top-k")
                semilla = gr.Number(value=-1, precision=0,
                                    label="Semilla (-1 = aleatoria; fija para repetir)")

            boton = gr.Button("🎶 Generar", variant="primary", size="lg")

        with gr.Column(scale=1):
            estado = gr.Markdown()
            resultados = [gr.Audio(label=f"Variación {i + 1}", type="filepath",
                                   visible=(i == 0), interactive=False)
                          for i in range(MAX_VARIACIONES)]

    modo.change(cambiar_modo, modo, [grupo_audio, modelo])
    boton.click(ejecutar,
                [modo, prompt, modelo, duracion, variaciones, guidance, temperatura,
                 top_k, semilla, archivo, microfono, seg_audio],
                resultados + [estado])

if __name__ == "__main__":
    demo.queue().launch(inbrowser=True, allowed_paths=[str(CARPETA_SALIDA)], **({"theme": _tema} if _GRADIO6 else {}))
