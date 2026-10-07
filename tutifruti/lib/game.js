'use strict';
/**
 * Lógica pura del juego (sin sockets): normalización, validación automática y puntaje.
 * Se separa del servidor para poder probarla de forma aislada.
 */

const DEFAULT_CATEGORIES = [
  'Nombre',
  'Apellido',
  'País o ciudad',
  'Animal',
  'Fruta o verdura',
  'Color',
  'Cosa',
  'Marca',
];

const EASY_LETTERS = 'ABCDEFGHIJLMNOPRSTUV'.split('');
const HARD_LETTERS = ['K', 'Ñ', 'Q', 'W', 'X', 'Y', 'Z'];

const POINTS = { UNIQUE: 10, REPEATED: 5, ONLY_ONE: 20, INVALID: 0 };

/** "  Ávila  Camacho " -> "avila camacho" (sin tildes, minúsculas, espacios simples). La Ñ se conserva. */
function normalize(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/ñ/g, '\u0001')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0001/g, 'ñ')
    .replace(/\s+/g, ' ');
}

function startsWithLetter(answer, letter) {
  const a = normalize(answer);
  return a.length > 0 && a[0] === normalize(letter);
}

/** Validación automática que ve el revisor como valor por defecto. */
function autoValid(answer, letter) {
  return startsWithLetter(answer, letter);
}

function pickLetter(used, includeHard) {
  const pool = includeHard ? EASY_LETTERS.concat(HARD_LETTERS) : EASY_LETTERS.slice();
  let available = pool.filter((l) => !used.includes(l));
  if (available.length === 0) available = pool; // se reinicia el ciclo de letras
  return available[Math.floor(Math.random() * available.length)];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Validación cruzada rotativa: se baraja el orden y cada jugador revisa al siguiente.
 * Con 1 solo participante se revisa a sí mismo.
 * @returns {Object<string,string>} reviewerId -> targetId
 */
function buildAssignments(participantIds) {
  const order = shuffle(participantIds);
  const map = {};
  order.forEach((id, i) => {
    map[id] = order[(i + 1) % order.length];
  });
  return map;
}

/**
 * Para cada categoría indica con quién se repite la respuesta (solo informativo para el revisor).
 * @returns {Object<string, string[][]>} pid -> [catIndex] -> [pids con la misma respuesta]
 */
function duplicatesInfo(participantIds, answers, categoryCount) {
  const info = {};
  participantIds.forEach((p) => (info[p] = Array.from({ length: categoryCount }, () => [])));
  for (let c = 0; c < categoryCount; c++) {
    const groups = {};
    participantIds.forEach((p) => {
      const n = normalize((answers[p] || [])[c]);
      if (!n) return;
      (groups[n] = groups[n] || []).push(p);
    });
    Object.values(groups).forEach((g) => {
      if (g.length < 2) return;
      g.forEach((p) => (info[p][c] = g.filter((x) => x !== p)));
    });
  }
  return info;
}

/**
 * Puntaje por categoría:
 *  - inválida o vacía ........................ 0
 *  - única respuesta válida en la categoría .. 20
 *  - válida y no repetida .................... 10
 *  - válida pero repetida con otro jugador ... 5
 * @param {string[]} participantIds
 * @param {Object<string,string[]>} answers pid -> respuestas por categoría
 * @param {Object<string,boolean[]>} valid pid -> validez por categoría (resultado de la revisión)
 * @param {number} categoryCount
 * @returns {Object<string,{points:number[], total:number}>}
 */
function scoreRound(participantIds, answers, valid, categoryCount) {
  const result = {};
  participantIds.forEach((p) => (result[p] = { points: new Array(categoryCount).fill(0), total: 0 }));

  for (let c = 0; c < categoryCount; c++) {
    const validPlayers = participantIds.filter(
      (p) => valid[p] && valid[p][c] && normalize((answers[p] || [])[c]) !== ''
    );
    if (validPlayers.length === 1) {
      result[validPlayers[0]].points[c] = POINTS.ONLY_ONE;
      continue;
    }
    const counts = {};
    validPlayers.forEach((p) => {
      const n = normalize(answers[p][c]);
      counts[n] = (counts[n] || 0) + 1;
    });
    validPlayers.forEach((p) => {
      const n = normalize(answers[p][c]);
      result[p].points[c] = counts[n] > 1 ? POINTS.REPEATED : POINTS.UNIQUE;
    });
  }
  participantIds.forEach((p) => (result[p].total = result[p].points.reduce((a, b) => a + b, 0)));
  return result;
}

module.exports = {
  DEFAULT_CATEGORIES,
  EASY_LETTERS,
  HARD_LETTERS,
  POINTS,
  normalize,
  startsWithLetter,
  autoValid,
  pickLetter,
  shuffle,
  buildAssignments,
  duplicatesInfo,
  scoreRound,
};
