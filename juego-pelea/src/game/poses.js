// Poses del esqueleto. Ángulos en grados, absolutos:
//  - piernas y brazos: 0 = hacia abajo, positivo = hacia adelante (hacia donde mira el luchador).
//  - torso: 0 = vertical, positivo = inclinado hacia adelante.
// "d" = extremidad delantera, "t" = trasera. muslo/pierna y brazo/antebrazo.

import { totalFramesAtaque } from './engine.js';

const P = (torso, md, pd, mt, pt, bd, ad, bt, at) => ({ torso, md, pd, mt, pt, bd, ad, bt, at });

const GUARDIA = { bd: 35, ad: 150, bt: 15, at: 160 };
const BASE = {
  quieto:   P(4, 14, -2, -14, -8, GUARDIA.bd, GUARDIA.ad, GUARDIA.bt, GUARDIA.at),
  agachado: P(18, 78, -30, 32, -88, 45, 140, 25, 150),
  salto:    P(8, 55, -40, 10, -70, 60, 150, 30, 160),
  golpeado: P(-22, 8, 10, -25, -15, -20, 40, -35, 10),
  bloqueo:  P(-4, 12, -2, -16, -10, 70, 175, 55, 170),
  victoria: P(-2, 8, 0, -8, 0, 20, 170, 170, 178),
};

const mezclar = (a, b, t) => {
  const r = {};
  for (const k in a) r[k] = a[k] + (b[k] - a[k]) * t;
  return r;
};

/** Progreso 0..1..0 de un ataque: sube en el arranque, se mantiene en activo y baja en la recuperación. */
function extension(ef, t) {
  if (ef < t.arranque) return ef / t.arranque;
  if (ef < t.arranque + t.activo) return 1;
  return Math.max(0, 1 - (ef - t.arranque - t.activo) / t.recuperacion);
}

export function poseDe(f, stats) {
  const ef = f.ef ?? 0;
  switch (f.estado) {
    case 'caminar': {
      const fase = Math.sin(ef * 0.22 * Math.sign(f.vx || 1) * f.lado);
      return { ...BASE.quieto, md: 14 + 22 * fase, pd: -6 + 10 * fase, mt: -14 - 22 * fase, pt: -8 - 10 * fase };
    }
    case 'quieto': {
      const respira = Math.sin(ef * 0.08) * 3;
      return { ...BASE.quieto, bd: BASE.quieto.bd + respira, bt: BASE.quieto.bt - respira };
    }
    case 'agachado':
      return f.bloqueando ? { ...BASE.agachado, bd: 75, ad: 175, bt: 60, at: 170 } : BASE.agachado;
    case 'salto':
      return BASE.salto;
    case 'golpeado':
      return BASE.golpeado;
    case 'bloqueo':
      return f.bloqueoBajo ? { ...BASE.agachado, bd: 75, ad: 175, bt: 60, at: 170 } : BASE.bloqueo;
    case 'victoria':
      return BASE.victoria;
    case 'ko':
      return BASE.golpeado;
    case 'ataque':
      return poseAtaque(f, stats, ef);
    default:
      return BASE.quieto;
  }
}

function poseAtaque(f, stats, ef) {
  const tipo = f.ataque?.tipo ?? 'golpe-pie';
  const t = totalFramesAtaque(stats, tipo);
  const e = tipo.endsWith('aire') ? Math.min(1, ef / t.arranque) : extension(ef, t);
  switch (tipo) {
    case 'golpe-pie':
      return mezclar(BASE.quieto, P(14, 20, -4, -22, -10, 88, 90, 10, 150), e);
    case 'patada-pie':
      return mezclar(BASE.quieto, P(-18, 92, 88, -12, -8, 20, 110, -10, 140), e);
    case 'golpe-agachado':
      return mezclar(BASE.agachado, P(28, 78, -30, 32, -88, 78, 82, 25, 150), e);
    case 'patada-agachado':
      return mezclar(BASE.agachado, P(-10, 82, 88, 40, -95, 60, 150, -40, -20), e);
    case 'golpe-aire':
      return mezclar(BASE.salto, P(14, 55, -40, 10, -70, 120, 115, 30, 160), e);
    case 'patada-aire':
      return mezclar(BASE.salto, P(-12, 70, 62, 20, -80, 40, 140, 10, 160), e);
    default:
      return BASE.quieto;
  }
}

export function suavizarPose(actual, objetivo, factor = 0.45) {
  if (!actual) return { ...objetivo };
  return mezclar(actual, objetivo, factor);
}
