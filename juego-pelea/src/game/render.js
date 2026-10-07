// Dibujo en canvas: escenario, luchadores (esqueleto + cara del personaje), chispas y marcador.

import { ANCHO, ALTO, SUELO, FPS } from './engine.js';
import { poseDe, suavizarPose } from './poses.js';
import { dibujarLuchador, cabeza, aparienciaAlterna } from './cuerpo.js';

// Color que identifica a cada jugador (marcador y flecha sobre la cabeza).
const COLOR_JUGADOR = ['#e53935', '#1e88e5'];

export class Renderizador {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object[]} personajes registros de la tabla (para nombres)
   * @param {object[]} stats resultado de derivarStats por luchador
   * @param {(HTMLImageElement|null)[]} caras imágenes ya cargadas (o null)
   */
  constructor(canvas, personajes, stats, caras = [null, null], { suavizar = false } = {}) {
    this.ctx = canvas.getContext('2d');
    canvas.width = ANCHO;
    canvas.height = ALTO;
    this.personajes = personajes;
    this.stats = stats;
    this.caras = caras;
    this.suavizar = suavizar;
    this.poses = [null, null];
    this.pos = [null, null];
    this.vidaMostrada = stats.map((s) => s.vidaMax);
    // Si ambos eligieron el mismo personaje, el jugador 2 usa los colores invertidos.
    this.apariencias = stats.map((s) => s.apariencia);
    if (personajes[0]?.id && personajes[0].id === personajes[1]?.id) this.apariencias[1] = aparienciaAlterna(this.apariencias[1]);
    this.fondo = crearFondo();
  }

  dibujar(s) {
    const ctx = this.ctx;
    ctx.drawImage(this.fondo, 0, 0);

    // El que ataca se dibuja delante.
    const orden = s.p[0].estado === 'ataque' ? [1, 0] : [0, 1];
    for (const i of orden) {
      const f = s.p[i];
      let { x, alt } = f;
      if (this.suavizar && this.pos[i]) {
        x = this.pos[i].x + (x - this.pos[i].x) * 0.35;
        alt = this.pos[i].alt + (alt - this.pos[i].alt) * 0.5;
      }
      this.pos[i] = { x, alt };
      this.poses[i] = suavizarPose(this.poses[i], poseDe(f, this.stats[i]));
      sombra(ctx, x, alt, this.stats[i]);
      dibujarLuchador(ctx, { ...f, x, alt }, this.poses[i], this.stats[i], this.caras[i], SUELO, this.apariencias[i]);
      if (s.fase !== 'fin') indicador(ctx, x, alt, this.stats[i], i);
    }

    for (const c of s.chispas) chispa(ctx, c);
    this.#marcador(s);
    this.#mensajes(s);
  }

  #marcador(s) {
    const ctx = this.ctx;
    const anchoBarra = 360;
    for (let i = 0; i < 2; i++) {
      const vidaMax = this.stats[i].vidaMax;
      const vida = s.p[i].vida;
      // La barra amarilla "persigue" a la roja para que se note el daño.
      this.vidaMostrada[i] = Math.max(vida, this.vidaMostrada[i] - vidaMax * 0.006);
      if (vida > this.vidaMostrada[i]) this.vidaMostrada[i] = vida;
      const x = i === 0 ? 86 : ANCHO - 86 - anchoBarra;
      const y = 26;
      ctx.fillStyle = '#111a';
      ctx.fillRect(x - 3, y - 3, anchoBarra + 6, 28);
      const llenar = (frac, color) => {
        const w = anchoBarra * Math.max(0, frac);
        ctx.fillStyle = color;
        ctx.fillRect(i === 0 ? x + anchoBarra - w : x, y, w, 22);
      };
      llenar(this.vidaMostrada[i] / vidaMax, '#f2c94c');
      llenar(vida / vidaMax, vida / vidaMax > 0.3 ? '#4cd964' : '#ff4d4d');

      // Retrato
      const cx = i === 0 ? 46 : ANCHO - 46;
      retrato(ctx, cx, 40, 32, this.caras[i], COLOR_JUGADOR[i], this.apariencias[i]);

      // Nombre y rondas ganadas
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillText(this.personajes[i].nombre.toUpperCase(), i === 0 ? x : x + anchoBarra, y + 46);
      for (let r = 0; r < 2; r++) {
        const rx = i === 0 ? x + anchoBarra - 12 - r * 22 : x + 12 + r * 22;
        ctx.beginPath();
        ctx.arc(rx, y + 40, 8, 0, Math.PI * 2);
        ctx.fillStyle = s.victorias[i] > r ? '#f2c94c' : '#0006';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // Tiempo
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 5;
    const seg = String(Math.max(0, Math.ceil(s.tiempo / FPS)));
    ctx.strokeText(seg, ANCHO / 2, 56);
    ctx.fillText(seg, ANCHO / 2, 56);
  }

  #mensajes(s) {
    let texto = null;
    let sub = null;
    if (s.fase === 'intro') {
      texto = s.faseFrame < 85 ? `RONDA ${s.ronda}` : '¡PELEA!';
    } else if (s.fase === 'ko') {
      texto = s.motivo === 'tiempo' ? '¡TIEMPO!' : 'K.O.';
      if (s.faseFrame > 50) {
        sub = s.ganadorRonda === -1 ? 'Empate: nadie suma la ronda' : `${this.personajes[s.ganadorRonda].nombre} gana la ronda`;
      }
    } else if (s.fase === 'fin') {
      texto = `¡${this.personajes[s.ganador].nombre.toUpperCase()} GANA!`;
      sub = `${s.victorias[0]} - ${s.victorias[1]}`;
    }
    if (!texto) return;
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.font = 'italic 900 72px system-ui, sans-serif';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#f2c94c';
    ctx.strokeText(texto, ANCHO / 2, ALTO / 2 - 20);
    ctx.fillText(texto, ANCHO / 2, ALTO / 2 - 20);
    if (sub) {
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.lineWidth = 5;
      ctx.fillStyle = '#fff';
      ctx.strokeText(sub, ANCHO / 2, ALTO / 2 + 26);
      ctx.fillText(sub, ANCHO / 2, ALTO / 2 + 26);
    }
  }
}

function retrato(ctx, x, y, r, cara, borde, ap) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(0, 0, r + 3, 0, Math.PI * 2);
  ctx.fill();
  cabeza(ctx, r, cara, ap);
  ctx.lineWidth = 3;
  ctx.strokeStyle = borde;
  ctx.beginPath();
  ctx.arc(0, 0, r + 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Flecha "1P"/"2P" sobre la cabeza para distinguir a los jugadores.
function indicador(ctx, x, alt, st, i) {
  const y = SUELO - alt - st.altoPx - 28;
  ctx.save();
  ctx.fillStyle = COLOR_JUGADOR[i];
  ctx.beginPath();
  ctx.moveTo(x - 7, y + 10);
  ctx.lineTo(x + 7, y + 10);
  ctx.lineTo(x, y + 18);
  ctx.closePath();
  ctx.fill();
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000a';
  ctx.strokeText(`${i + 1}P`, x, y + 6);
  ctx.fillText(`${i + 1}P`, x, y + 6);
  ctx.restore();
}

function sombra(ctx, x, alt, st) {
  const escala = Math.max(0.4, 1 - alt / 300);
  ctx.fillStyle = `rgba(0,0,0,${0.35 * escala})`;
  ctx.beginPath();
  ctx.ellipse(x, SUELO + 4, 46 * st.escala * st.grosor * escala, 9 * escala, 0, 0, Math.PI * 2);
  ctx.fill();
}

function chispa(ctx, c) {
  const y = SUELO - c.alt;
  const t = c.f / 14;
  const r = (c.fuerte ? 34 : 24) * (0.5 + t);
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.translate(c.x, y);
  ctx.fillStyle = c.bloqueo ? '#8fd3ff' : '#fff3a0';
  ctx.strokeStyle = c.bloqueo ? '#2f8fd6' : '#ff8a00';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const rr = k % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function crearFondo() {
  const c = document.createElement('canvas');
  c.width = ANCHO;
  c.height = ALTO;
  const ctx = c.getContext('2d');
  const cielo = ctx.createLinearGradient(0, 0, 0, SUELO);
  cielo.addColorStop(0, '#1b1036');
  cielo.addColorStop(0.6, '#7a2f5a');
  cielo.addColorStop(1, '#f08a4b');
  ctx.fillStyle = cielo;
  ctx.fillRect(0, 0, ANCHO, SUELO);
  // Sol
  ctx.fillStyle = '#ffd37a';
  ctx.beginPath();
  ctx.arc(ANCHO * 0.7, SUELO - 120, 70, 0, Math.PI * 2);
  ctx.fill();
  // Edificios
  let x = 0;
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280);
  while (x < ANCHO) {
    const w = 50 + azar() * 70;
    const h = 90 + azar() * 190;
    ctx.fillStyle = '#24163a';
    ctx.fillRect(x, SUELO - 60 - h, w, h + 60);
    ctx.fillStyle = '#ffd37a55';
    for (let wy = SUELO - 50 - h; wy < SUELO - 70; wy += 18) {
      for (let wx = x + 8; wx < x + w - 10; wx += 14) if (azar() > 0.55) ctx.fillRect(wx, wy, 6, 9);
    }
    x += w + 4;
  }
  // Piso
  const piso = ctx.createLinearGradient(0, SUELO - 40, 0, ALTO);
  piso.addColorStop(0, '#5a4636');
  piso.addColorStop(1, '#2a1f17');
  ctx.fillStyle = piso;
  ctx.fillRect(0, SUELO - 30, ANCHO, ALTO - SUELO + 30);
  ctx.strokeStyle = '#0003';
  ctx.lineWidth = 2;
  for (let i = -10; i <= 20; i++) {
    ctx.beginPath();
    ctx.moveTo(ANCHO / 2 + i * 30, SUELO - 30);
    ctx.lineTo(ANCHO / 2 + i * 90, ALTO);
    ctx.stroke();
  }
  return c;
}

/** Carga una imagen y resuelve con null si falla (el juego usa la cara genérica). */
export function cargarImagen(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export { dibujarLuchador, COLOR_JUGADOR };
