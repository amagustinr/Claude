// Bucle de juego. Dos modos:
//  - Simulada: este navegador ejecuta el motor (anfitrión en línea o modo práctica).
//  - Remota: este navegador solo dibuja las instantáneas que envía el anfitrión (invitado).

import { Pelea, FPS } from './engine.js';
import { derivarStats } from './stats.js';
import { Renderizador } from './render.js';
import { Sonidos } from './sfx.js';

const PASO_MS = 1000 / FPS;
const ENVIAR_CADA = 4; // frames entre instantáneas → 15 por segundo

export class PartidaSimulada {
  /**
   * @param {object} o
   * @param {() => object[]} o.entradas devuelve [entradaJ1, entradaJ2] cada frame
   * @param {(snap: object) => void} [o.alInstantanea] para enviar por red
   * @param {(ganador: number) => void} [o.alTerminar]
   */
  constructor({ canvas, personajes, caras, entradas, alInstantanea, alTerminar, antesDePaso }) {
    this.pelea = new Pelea(personajes);
    this.render = new Renderizador(canvas, personajes, this.pelea.stats, caras);
    this.sonidos = new Sonidos();
    this.entradas = entradas;
    this.alInstantanea = alInstantanea;
    this.alTerminar = alTerminar;
    this.antesDePaso = antesDePaso;
    this.frame = 0;
    this.acumulado = 0;
    this.ultimo = performance.now();
    this.activo = true;
    this.terminado = false;
    // La simulación avanza con un reloj en un Web Worker: a diferencia de requestAnimationFrame,
    // sigue corriendo si el anfitrión cambia de pestaña, así la pelea no se congela para el rival.
    this.reloj = crearReloj(() => this.simular());
    this.dibujar = this.dibujar.bind(this);
    requestAnimationFrame(this.dibujar);
  }

  simular() {
    if (!this.activo) return;
    const ahora = performance.now();
    this.acumulado += Math.min(250, ahora - this.ultimo);
    this.ultimo = ahora;
    while (this.acumulado >= PASO_MS) {
      this.acumulado -= PASO_MS;
      this.antesDePaso?.(this.pelea);
      this.pelea.paso(this.entradas());
      this.frame++;
      const s = this.pelea.s;
      const finRecien = s.fase === 'fin' && !this.terminado;
      if (this.alInstantanea && (this.frame % ENVIAR_CADA === 0 || finRecien)) this.alInstantanea(this.pelea.instantanea());
      if (finRecien) {
        this.terminado = true;
        setTimeout(() => this.alTerminar?.(s.ganador), 2500);
      }
    }
  }

  dibujar() {
    if (!this.activo) return;
    this.simular();
    this.sonidos.revisar(this.pelea.s);
    this.render.dibujar(this.pelea.s);
    requestAnimationFrame(this.dibujar);
  }

  detener() {
    this.activo = false;
    this.reloj.terminate();
  }
}

function crearReloj(alTic) {
  const codigo = `setInterval(() => postMessage(0), ${Math.floor(PASO_MS)});`;
  const url = URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }));
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  worker.onmessage = alTic;
  return worker;
}

export class PartidaRemota {
  constructor({ canvas, personajes, caras, alTerminar }) {
    this.stats = personajes.map(derivarStats);
    this.render = new Renderizador(canvas, personajes, this.stats, caras, { suavizar: true });
    this.sonidos = new Sonidos();
    this.alTerminar = alTerminar;
    this.snap = null;
    this.recibidoEn = 0;
    this.activo = true;
    this.terminado = false;
    this.bucle = this.bucle.bind(this);
    requestAnimationFrame(this.bucle);
  }

  recibir(snap) {
    this.snap = snap;
    this.recibidoEn = performance.now();
    if (snap.fase === 'fin' && !this.terminado) {
      this.terminado = true;
      setTimeout(() => this.alTerminar?.(snap.ganador), 2500);
    }
  }

  bucle(ahora) {
    if (!this.activo) return;
    if (this.snap) {
      // Entre instantáneas se adelantan las animaciones localmente para que se vean fluidas.
      const extra = Math.min(12, Math.floor((ahora - this.recibidoEn) / PASO_MS));
      const s = this.snap;
      const vista = {
        ...s,
        faseFrame: s.faseFrame + extra,
        tiempo: s.fase === 'pelea' ? s.tiempo - extra : s.tiempo,
        chispas: s.chispas.map((c) => ({ ...c, f: Math.min(13, c.f + extra) })),
        p: s.p.map((f) => ({
          ...f,
          ef: f.ef + extra,
          x: f.x + (f.estado === 'caminar' ? f.vx * extra : 0),
        })),
      };
      this.sonidos.revisar(vista);
      this.render.dibujar(vista);
    }
    requestAnimationFrame(this.bucle);
  }

  detener() {
    this.activo = false;
  }
}
