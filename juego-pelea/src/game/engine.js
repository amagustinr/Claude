// Motor de la pelea: simulación pura a 60 pasos por segundo, sin dibujo ni red.
// En línea solo el anfitrión ejecuta este motor; el invitado recibe instantáneas del estado.

import { derivarStats } from './stats.js';

export const ANCHO = 960;
export const ALTO = 540;
export const SUELO = 470;
export const FPS = 60;
export const RONDAS_PARA_GANAR = 2; // al mejor de 3

const GRAVEDAD = 0.62;
const DURACION_RONDA = 99 * FPS;
const FRAMES_INTRO = 130;
const FRAMES_KO = 160;
const PARED = 40;

// Definición de cada ataque. nivel: 'alto' (se bloquea de pie), 'medio' (de pie o agachado), 'bajo' (solo agachado).
// alcance en px a escala 1; franja vertical como fracción de la altura del atacante.
const ATAQUES = {
  'golpe-pie':      { base: 'golpe',  danio: 45, aturde: 14, empuje: 4, alcance: 62, franja: [0.66, 0.86], nivel: 'medio' },
  'patada-pie':     { base: 'patada', danio: 70, aturde: 20, empuje: 7, alcance: 88, franja: [0.34, 0.56], nivel: 'medio' },
  'golpe-agachado': { base: 'golpe',  danio: 38, aturde: 12, empuje: 3, alcance: 56, franja: [0.34, 0.50], nivel: 'medio' },
  'patada-agachado':{ base: 'patada', danio: 55, aturde: 24, empuje: 5, alcance: 92, franja: [0.00, 0.14], nivel: 'bajo' },
  'golpe-aire':     { base: 'golpe',  danio: 50, aturde: 16, empuje: 4, alcance: 56, franja: [0.40, 0.72], nivel: 'alto' },
  'patada-aire':    { base: 'patada', danio: 65, aturde: 18, empuje: 6, alcance: 72, franja: [0.10, 0.45], nivel: 'alto' },
};

export const ENTRADA_VACIA = Object.freeze({ l: false, r: false, u: false, d: false, p: false, k: false, pS: 0, kS: 0, uS: 0 });

function luchadorInicial(indice) {
  return {
    x: indice === 0 ? 300 : ANCHO - 300,
    alt: 0, vx: 0, vy: 0,
    vida: 0,
    estado: 'quieto', ef: 0,
    lado: indice === 0 ? 1 : -1,
    ataque: null, // { tipo: 'golpe-pie', conecto: false }
    bloqueando: false,
    buffer: null, // { accion, frames }
  };
}

export class Pelea {
  /** @param {object[]} personajes los dos registros de la tabla personajes */
  constructor(personajes) {
    this.personajes = personajes;
    this.stats = personajes.map(derivarStats);
    this.prevSeq = [{ p: 0, k: 0, u: 0 }, { p: 0, k: 0, u: 0 }];
    this.s = {
      fase: 'intro', faseFrame: 0,
      ronda: 1, tiempo: DURACION_RONDA,
      victorias: [0, 0],
      ganadorRonda: null, // 0, 1 o -1 (empate)
      ganador: null,      // ganador del combate
      chispas: [], nChispa: 0,
      p: [luchadorInicial(0), luchadorInicial(1)],
    };
    this.iniciarRonda();
  }

  iniciarRonda() {
    const s = this.s;
    s.p = [luchadorInicial(0), luchadorInicial(1)];
    s.p.forEach((f, i) => (f.vida = this.stats[i].vidaMax));
    s.fase = 'intro';
    s.faseFrame = 0;
    s.tiempo = DURACION_RONDA;
    s.ganadorRonda = null;
    s.chispas = [];
  }

  /** Avanza un frame. entradas = [entradaJugador1, entradaJugador2] */
  paso(entradas) {
    const s = this.s;
    s.faseFrame++;
    const pulsado = entradas.map((e, i) => this.#detectarPulsaciones(e ?? ENTRADA_VACIA, i));

    if (s.fase === 'intro' && s.faseFrame >= FRAMES_INTRO) {
      s.fase = 'pelea';
      s.faseFrame = 0;
    }

    for (let i = 0; i < 2; i++) {
      const f = s.p[i];
      const otro = s.p[1 - i];
      if (s.fase === 'pelea') this.#controlar(f, otro, entradas[i] ?? ENTRADA_VACIA, pulsado[i], this.stats[i]);
      else if (s.fase === 'ko' || s.fase === 'fin') this.#animarFinal(f, i);
      this.#fisica(f);
    }

    if (s.fase === 'pelea') {
      this.#resolverImpactos(0);
      this.#resolverImpactos(1);
    }
    this.#separar();
    s.chispas = s.chispas.filter((c) => ++c.f < 14);

    if (s.fase === 'pelea') {
      s.tiempo--;
      const [a, b] = s.p;
      if (a.vida <= 0 || b.vida <= 0 || s.tiempo <= 0) this.#terminarRonda();
    } else if (s.fase === 'ko' && s.faseFrame >= FRAMES_KO) {
      if (s.victorias.some((v) => v >= RONDAS_PARA_GANAR)) {
        s.fase = 'fin';
        s.faseFrame = 0;
        s.ganador = s.victorias[0] > s.victorias[1] ? 0 : 1;
      } else {
        s.ronda++;
        this.iniciarRonda();
      }
    }
  }

  // Cada botón de acción viaja con un contador (pS, kS, uS) que sube en cada pulsación;
  // así una pulsación muy corta no se pierde aunque llegue por red entre dos frames.
  #detectarPulsaciones(e, i) {
    const prev = this.prevSeq[i];
    const r = { p: e.pS !== prev.p, k: e.kS !== prev.k, u: e.uS !== prev.u };
    this.prevSeq[i] = { p: e.pS, k: e.kS, u: e.uS };
    return r;
  }

  #controlar(f, otro, e, pulsado, st) {
    f.ef++;
    // Memoriza la última acción pulsada unos frames, para que no se pierda si llegó durante otra acción.
    if (pulsado.p) f.buffer = { accion: 'golpe', frames: 8 };
    else if (pulsado.k) f.buffer = { accion: 'patada', frames: 8 };
    else if (pulsado.u && !f.buffer) f.buffer = { accion: 'salto', frames: 6 };
    else if (f.buffer && --f.buffer.frames <= 0) f.buffer = null;

    const enSuelo = f.alt <= 0;
    const haciaAtras = f.lado === 1 ? e.l : e.r;

    if (f.estado === 'golpeado' || f.estado === 'bloqueo') {
      if (f.ef >= f.aturdido && enSuelo) this.#cambiar(f, 'quieto');
      return;
    }

    if (f.estado === 'ataque') {
      const def = ATAQUES[f.ataque.tipo];
      const t = st[def.base];
      if (f.ataque.tipo.endsWith('aire')) {
        if (enSuelo) this.#cambiar(f, 'quieto'); // al aterrizar termina el ataque aéreo
      } else if (f.ef >= t.arranque + t.activo + t.recuperacion) {
        this.#cambiar(f, e.d ? 'agachado' : 'quieto');
      }
      return;
    }

    if (!enSuelo) {
      // En el aire solo se puede atacar una vez.
      if (f.buffer && f.buffer.accion !== 'salto' && !f.usoAereo) {
        f.usoAereo = true;
        this.#atacar(f, `${f.buffer.accion}-aire`);
      }
      return;
    }

    // En el suelo y libre: mirar siempre al rival.
    f.lado = otro.x >= f.x ? 1 : -1;
    f.usoAereo = false;
    f.bloqueando = haciaAtras && !e.u;

    const accion = f.buffer?.accion;
    if (accion === 'golpe' || accion === 'patada') {
      this.#atacar(f, `${accion}-${e.d ? 'agachado' : 'pie'}`);
      f.vx = 0;
      return;
    }
    if (accion === 'salto' || (e.u && f.estado !== 'salto')) {
      f.buffer = null;
      const dir = e.l === e.r ? 0 : e.r ? 1 : -1;
      f.vy = st.salto;
      f.alt = 0.01;
      f.vx = dir * st.velocidad * 0.95;
      f.bloqueando = false;
      this.#cambiar(f, 'salto');
      return;
    }
    if (e.d) {
      f.vx = 0;
      if (f.estado !== 'agachado') this.#cambiar(f, 'agachado');
      return;
    }
    if (e.l !== e.r) {
      const dir = e.r ? 1 : -1;
      f.vx = dir * st.velocidad * (dir === f.lado ? 1 : 0.8);
      if (f.estado !== 'caminar') this.#cambiar(f, 'caminar');
      return;
    }
    f.vx = 0;
    if (f.estado !== 'quieto') this.#cambiar(f, 'quieto');
  }

  #atacar(f, tipo) {
    f.buffer = null;
    f.bloqueando = false;
    f.ataque = { tipo, conecto: false };
    this.#cambiar(f, 'ataque');
  }

  #cambiar(f, estado) {
    if (estado !== 'ataque') f.ataque = null;
    f.estado = estado;
    f.ef = 0;
  }

  #animarFinal(f, i) {
    f.ef++;
    const s = this.s;
    if (f.estado === 'ko') return;
    const gano = s.fase === 'fin' ? s.ganador === i : s.ganadorRonda === i;
    if (f.alt <= 0 && f.estado !== 'victoria' && f.estado !== 'golpeado') {
      this.#cambiar(f, gano ? 'victoria' : 'quieto');
    }
    if (f.estado === 'golpeado' && f.ef > 20 && f.alt <= 0) this.#cambiar(f, gano ? 'victoria' : 'quieto');
  }

  #fisica(f) {
    if (f.alt > 0 || f.vy > 0) {
      f.alt += f.vy;
      f.vy -= GRAVEDAD;
      if (f.alt <= 0) {
        f.alt = 0;
        f.vy = 0;
        if (f.estado === 'salto') this.#cambiar(f, 'quieto');
      }
    } else if (f.estado !== 'caminar') {
      f.vx *= 0.82; // fricción (retroceso de golpes)
      if (Math.abs(f.vx) < 0.05) f.vx = 0;
    }
    f.x = Math.min(ANCHO - PARED, Math.max(PARED, f.x + f.vx));
  }

  /** Caja de daño del luchador i, en coordenadas del mundo (y hacia arriba desde el suelo). */
  cajaCuerpo(i) {
    const f = this.s.p[i];
    const st = this.stats[i];
    const agachado = f.estado === 'agachado' || f.ataque?.tipo.endsWith('agachado') || (f.estado === 'bloqueo' && f.bloqueoBajo);
    const ancho = 44 * st.escala * st.grosor;
    const alto = st.altoPx * (agachado ? 0.62 : 1);
    return { x1: f.x - ancho / 2, x2: f.x + ancho / 2, y1: f.alt, y2: f.alt + alto, agachado };
  }

  /** Caja de golpe del ataque activo del luchador i, o null. */
  cajaAtaque(i) {
    const f = this.s.p[i];
    if (f.estado !== 'ataque' || f.ataque.conecto) return null;
    const def = ATAQUES[f.ataque.tipo];
    const st = this.stats[i];
    const t = st[def.base];
    const aire = f.ataque.tipo.endsWith('aire');
    const activo = aire ? f.ef >= t.arranque && f.ef < t.arranque + 12 : f.ef >= t.arranque && f.ef < t.arranque + t.activo;
    if (!activo) return null;
    const cuerpo = 22 * st.escala * st.grosor;
    const inicio = f.x + f.lado * cuerpo * 0.5;
    const fin = f.x + f.lado * (cuerpo + def.alcance * st.escala);
    return {
      x1: Math.min(inicio, fin), x2: Math.max(inicio, fin),
      y1: f.alt + def.franja[0] * st.altoPx, y2: f.alt + def.franja[1] * st.altoPx,
      def,
    };
  }

  #resolverImpactos(i) {
    const golpe = this.cajaAtaque(i);
    if (!golpe) return;
    const j = 1 - i;
    const cuerpo = this.cajaCuerpo(j);
    const toca = golpe.x1 < cuerpo.x2 && golpe.x2 > cuerpo.x1 && golpe.y1 < cuerpo.y2 && golpe.y2 > cuerpo.y1;
    if (!toca) return;

    const a = this.s.p[i];
    const d = this.s.p[j];
    const def = golpe.def;
    a.ataque.conecto = true;

    const puedeBloquear = d.bloqueando && d.alt <= 0 && ['quieto', 'caminar', 'agachado', 'bloqueo'].includes(d.estado);
    const bloquea = puedeBloquear && (def.nivel === 'medio' || (def.nivel === 'bajo') === cuerpo.agachado);

    let danio = def.danio * this.stats[i].danio * this.stats[j].defensa;
    const empuje = def.empuje * this.stats[j].empuje * a.lado;

    if (bloquea) {
      danio *= 0.12;
      d.bloqueoBajo = cuerpo.agachado;
      this.#cambiar(d, 'bloqueo');
      d.aturdido = 10;
      d.vx = empuje * 0.6;
    } else {
      this.#cambiar(d, 'golpeado');
      d.aturdido = def.aturde;
      d.vx = empuje;
      d.bloqueando = false;
      if (d.alt > 0) d.vy = Math.max(d.vy, 3); // golpeado en el aire: sale despedido
    }
    d.vida = Math.max(0, d.vida - Math.round(danio));

    this.s.chispas.push({
      id: ++this.s.nChispa,
      x: (Math.max(golpe.x1, cuerpo.x1) + Math.min(golpe.x2, cuerpo.x2)) / 2,
      alt: (Math.max(golpe.y1, cuerpo.y1) + Math.min(golpe.y2, cuerpo.y2)) / 2,
      f: 0,
      bloqueo: bloquea,
      fuerte: def.base === 'patada',
    });
  }

  // Los cuerpos no se atraviesan (salvo cuando uno salta por encima del otro).
  #separar() {
    const [a, b] = this.s.p;
    const minimo = (44 * this.stats[0].escala * this.stats[0].grosor + 44 * this.stats[1].escala * this.stats[1].grosor) / 2;
    const dx = b.x - a.x;
    const saltaEncima = Math.max(a.alt, b.alt) > Math.min(this.stats[0].altoPx, this.stats[1].altoPx) * 0.55;
    if (Math.abs(dx) >= minimo || saltaEncima || this.s.p.some((f) => f.estado === 'ko')) return;
    const solape = (minimo - Math.abs(dx)) / 2;
    const dir = dx === 0 ? (a.lado === 1 ? 1 : -1) : Math.sign(dx);
    a.x = Math.min(ANCHO - PARED, Math.max(PARED, a.x - dir * solape));
    b.x = Math.min(ANCHO - PARED, Math.max(PARED, b.x + dir * solape));
    // Si uno quedó contra la pared, empuja todo al otro.
    const sobra = minimo - Math.abs(b.x - a.x);
    if (sobra > 0.5) {
      if (a.x <= PARED || a.x >= ANCHO - PARED) b.x += dir * sobra;
      else a.x -= dir * sobra;
    }
  }

  #terminarRonda() {
    const s = this.s;
    const [a, b] = s.p;
    const pa = a.vida / this.stats[0].vidaMax;
    const pb = b.vida / this.stats[1].vidaMax;
    s.ganadorRonda = pa === pb ? -1 : pa > pb ? 0 : 1;
    s.motivo = a.vida <= 0 || b.vida <= 0 ? 'ko' : 'tiempo';
    if (s.ganadorRonda >= 0) {
      s.victorias[s.ganadorRonda]++;
      const perdedor = s.p[1 - s.ganadorRonda];
      if (perdedor.vida <= 0) {
        this.#cambiar(perdedor, 'ko');
        perdedor.vx = -perdedor.lado * 6;
        perdedor.vy = Math.max(perdedor.vy, 5);
        perdedor.alt = Math.max(perdedor.alt, 0.01);
      }
    }
    s.fase = 'ko';
    s.faseFrame = 0;
  }

  /** Copia compacta del estado para enviar por red (~15 veces por segundo). */
  instantanea() {
    const r1 = (n) => Math.round(n * 10) / 10;
    const s = this.s;
    return {
      fase: s.fase, faseFrame: s.faseFrame, ronda: s.ronda, tiempo: s.tiempo,
      victorias: s.victorias, ganadorRonda: s.ganadorRonda, ganador: s.ganador, motivo: s.motivo,
      chispas: s.chispas.map((c) => ({ ...c, x: r1(c.x), alt: r1(c.alt) })),
      p: s.p.map((f) => ({
        x: r1(f.x), alt: r1(f.alt), vx: r1(f.vx), vy: r1(f.vy), vida: f.vida,
        estado: f.estado, ef: f.ef, lado: f.lado, ataque: f.ataque, bloqueando: f.bloqueando, bloqueoBajo: f.bloqueoBajo,
      })),
    };
  }
}

export function totalFramesAtaque(stats, tipo) {
  const t = stats[ATAQUES[tipo].base];
  return { ...t, total: t.arranque + t.activo + t.recuperacion };
}
