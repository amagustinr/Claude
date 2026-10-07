// Efectos de sonido sintetizados (sin archivos de audio).
let ctx = null;
const audio = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());

function ruido(duracion, frecuencia, volumen) {
  const a = audio();
  const buffer = a.createBuffer(1, a.sampleRate * duracion, a.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < datos.length; i++) datos[i] = (Math.random() * 2 - 1) * (1 - i / datos.length) ** 2;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filtro = a.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.value = frecuencia;
  const g = a.createGain();
  g.gain.value = volumen;
  src.connect(filtro).connect(g).connect(a.destination);
  src.start();
}

function tono(desde, hasta, duracion, volumen = 0.2, tipo = 'square') {
  const a = audio();
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(desde, a.currentTime);
  o.frequency.exponentialRampToValueAtTime(hasta, a.currentTime + duracion);
  g.gain.setValueAtTime(volumen, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + duracion);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + duracion);
}

export const sfx = {
  golpe: (fuerte) => { try { ruido(0.12, fuerte ? 900 : 1600, 0.5); tono(160, 60, 0.12, 0.25, 'sine'); } catch {} },
  bloqueo: () => { try { tono(900, 500, 0.06, 0.12); } catch {} },
  ko: () => { try { tono(400, 50, 0.8, 0.25, 'sawtooth'); } catch {} },
  inicio: () => { try { tono(500, 1000, 0.25, 0.15); } catch {} },
};

/** Reproduce sonidos según los cambios entre dos estados de la pelea. */
export class Sonidos {
  constructor() { this.ultimaChispa = 0; this.faseAnterior = null; }
  revisar(s) {
    for (const c of s.chispas) {
      if (c.id > this.ultimaChispa) {
        this.ultimaChispa = c.id;
        c.bloqueo ? sfx.bloqueo() : sfx.golpe(c.fuerte);
      }
    }
    if (s.fase !== this.faseAnterior) {
      if (s.fase === 'pelea') sfx.inicio();
      if (s.fase === 'ko' && s.motivo === 'ko') sfx.ko();
      this.faseAnterior = s.fase;
    }
  }
}
