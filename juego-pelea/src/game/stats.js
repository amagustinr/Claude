// Convierte un registro de la tabla "personajes" en los parámetros físicos y de combate
// que usa el motor. Aquí es donde las estadísticas y la contextura afectan la pelea.

import { aparienciaDe } from './cuerpo.js';

export const ALTURA_BASE_PX = 190; // una persona de 175 cm mide 190 px en pantalla

const FACTOR_COMPLEXION = { delgada: 0.85, media: 1, robusta: 1.2 };

const lerp = (a, b, t) => a + (b - a) * t;
const norm = (v) => Math.min(100, Math.max(1, Number(v) || 50)) / 100; // 0.01 .. 1

export function derivarStats(p) {
  const fuerza = norm(p.fuerza);
  const agilidad = norm(p.agilidad);
  const resistencia = norm(p.resistencia);
  const escala = (Number(p.altura_cm) || 175) / 175;
  const peso = Number(p.peso_kg) || 75;
  const complexion = FACTOR_COMPLEXION[p.complexion] ?? 1;
  // Más pesado = más lento pero se lo empuja menos.
  const factorPeso = Math.min(1.3, Math.max(0.7, peso / 75));

  return {
    escala,
    altoPx: ALTURA_BASE_PX * escala,
    // Grosor del cuerpo para el dibujo y la caja de colisión.
    grosor: complexion * lerp(0.9, 1.15, (factorPeso - 0.7) / 0.6),
    sexo: p.sexo === 'F' ? 'F' : 'M',
    apariencia: aparienciaDe(p), // traje, colores y peinado (solo visual)

    // Resistencia: vida y reducción de daño.
    vidaMax: Math.round(lerp(800, 1400, resistencia)),
    defensa: lerp(1, 0.8, resistencia), // multiplicador del daño recibido

    // Fuerza: multiplicador del daño causado.
    danio: lerp(0.6, 1.6, fuerza),

    // Agilidad: velocidad, salto y rapidez de los ataques (en frames a 60 fps).
    velocidad: lerp(2.3, 5.2, agilidad) * lerp(1.12, 0.88, (factorPeso - 0.7) / 0.6),
    salto: lerp(11, 15, agilidad),
    golpe: { arranque: Math.round(lerp(6, 4, agilidad)), activo: 3, recuperacion: Math.round(lerp(12, 7, agilidad)) },
    patada: { arranque: Math.round(lerp(10, 7, agilidad)), activo: 4, recuperacion: Math.round(lerp(18, 11, agilidad)) },

    // Peso: cuánto retrocede al recibir un golpe.
    empuje: 1 / factorPeso,
  };
}
