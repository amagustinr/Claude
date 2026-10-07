'use strict';
/* Simula una partida completa con 3 jugadores contra el servidor real (puerto aleatorio).
   Ejecutar: npm test */
const assert = require('assert');
const { io: ioc } = require('socket.io-client');
const G = require('../lib/game');
const srv = require('../server');

srv.TIMING.COUNTDOWN_MS = 200;
srv.TIMING.COLLECT_MS = 200;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));

function client(url, id) {
  const s = ioc(url, { transports: ['websocket'], forceNew: true });
  s.last = null;
  s.on('state', (st) => (s.last = st));
  s.pid = id;
  return new Promise((res) => s.on('connect', async () => { await emit(s, 'hello', { playerId: id }); res(s); }));
}
async function until(fn, ms = 3000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (fn()) return; await wait(20); }
  throw new Error('Timeout esperando condición');
}

(async () => {
  // --- pruebas unitarias de puntaje
  assert.strictEqual(G.normalize('  Ávila   Ñandú '), 'avila ñandu');
  assert.ok(G.startsWithLetter('Árbol', 'A'));
  assert.ok(!G.startsWithLetter('Nandu', 'Ñ'));
  const sc = G.scoreRound(['a', 'b', 'c'],
    { a: ['Ana', 'Perro', 'Pera'], b: ['ana', 'Pato', ''], c: ['Andrea', 'Puma', 'Piña'] },
    { a: [true, true, true], b: [true, true, false], c: [true, false, true] }, 3);
  assert.deepStrictEqual(sc.a.points, [5, 10, 10]);
  assert.deepStrictEqual(sc.b.points, [5, 10, 0]);
  assert.deepStrictEqual(sc.c.points, [10, 0, 10]);
  const solo = G.scoreRound(['a', 'b'], { a: ['X'], b: [''] }, { a: [true], b: [false] }, 1);
  assert.strictEqual(solo.a.points[0], 20);
  console.log('✓ puntaje y normalización');

  // --- servidor
  await new Promise((r) => srv.server.listen(0, r));
  const url = `http://localhost:${srv.server.address().port}`;
  const ana = await client(url, 'jugador-ana-0001');
  const beto = await client(url, 'jugador-beto-0002');
  const caro = await client(url, 'jugador-caro-0003');

  const cats = ['Nombre', 'Animal', 'Fruta'];
  let res = await emit(ana, 'room:create', { name: 'Primos', isPublic: false, password: 'secreto', categories: cats, playerName: 'Ana' });
  assert.ok(res.ok, res.error);
  const roomId = res.roomId;
  const list = await emit(beto, 'rooms:subscribe', null);
  assert.ok(list.some((r) => r.id === roomId && !r.isPublic), 'la sala privada aparece en el buscador');

  res = await emit(beto, 'room:join', { roomId, password: 'mal', playerName: 'Beto' });
  assert.ok(res.needPassword, 'contraseña incorrecta rechazada');
  res = await emit(beto, 'room:join', { roomId, password: 'secreto', playerName: 'Beto' });
  assert.ok(res.ok);
  res = await emit(caro, 'room:join', { roomId, password: 'secreto', playerName: 'ana' });
  assert.ok(res.error, 'nombre duplicado rechazado');
  res = await emit(caro, 'room:join', { roomId, password: 'secreto', playerName: 'Caro' });
  assert.ok(res.ok);
  await until(() => ana.last && ana.last.players.length === 3);
  console.log('✓ crear sala privada, buscarla y entrar con contraseña');

  // --- listos -> arranca sola
  ana.emit('player:ready', { ready: true });
  beto.emit('player:ready', { ready: true });
  await wait(100);
  assert.strictEqual(ana.last.room.phase, 'lobby', 'no arranca hasta que todos estén listos');
  caro.emit('player:ready', { ready: true });
  await until(() => ana.last.room.phase === 'countdown');
  assert.strictEqual(ana.last.round.letter, null, 'la letra no se revela en la cuenta regresiva');
  await until(() => ana.last.room.phase === 'playing');
  const L = ana.last.round.letter;
  console.log(`✓ ronda arranca sola cuando todos están listos (letra ${L})`);

  // --- respuestas y STOP
  const A = [`${L}na`, `${L}ato`, `${L}era`];
  const B = [`${L}NA`, `${L}uma`, ''];
  const C = [`${L}ndrea`, `Zzz`, `${L}iña`];
  beto.emit('round:answers', { answers: B });
  caro.emit('round:answers', { answers: C });
  res = await emit(ana, 'round:stop', { answers: [A[0], '', ''] });
  assert.ok(res.error, 'no se puede STOP con campos vacíos');
  res = await emit(ana, 'round:stop', { answers: A });
  assert.ok(res.ok);
  await until(() => beto.last.room.phase === 'collecting');
  assert.strictEqual(beto.last.round.stoppedByName, 'Ana');
  await until(() => ana.last.room.phase === 'validating');
  console.log('✓ STOP cierra la ronda a todos');

  // --- validación cruzada rotativa
  const players = [ana, beto, caro];
  const targets = players.map((p) => p.last.round.review.targetId);
  assert.strictEqual(new Set(targets).size, 3, 'cada jugador revisa a uno distinto');
  players.forEach((p) => assert.notStrictEqual(p.last.round.review.targetId, p.pid, 'nadie se revisa a sí mismo'));
  const byId = { [ana.pid]: A, [beto.pid]: B, [caro.pid]: C };
  for (const p of players) {
    const rv = p.last.round.review;
    assert.deepStrictEqual(rv.answers, byId[rv.targetId].map((x) => x.trim()));
    // El revisor de Caro rechaza además su "Fruta" para probar la anulación manual.
    const marks = rv.defaults.slice();
    if (rv.targetId === caro.pid) marks[2] = false;
    res = await emit(p, 'review:apply', { marks });
    assert.ok(res.ok);
  }
  await until(() => ana.last.room.phase === 'lobby' && ana.last.lastResult);
  const lr = ana.last.lastResult;
  const row = (id) => lr.rows.find((r) => r.id === id);
  // Nombre: Ana y Beto repiten (5), Caro única (10). Animal: Caro inválida -> Ana y Beto distintos (10).
  // Fruta: Beto vacía, Caro anulada -> Ana única respuesta válida (20).
  assert.deepStrictEqual(row(ana.pid).points, [5, 10, 20]);
  assert.deepStrictEqual(row(beto.pid).points, [5, 10, 0]);
  assert.deepStrictEqual(row(caro.pid).points, [10, 0, 0]);
  assert.strictEqual(ana.last.players.find((p) => p.id === ana.pid).total, 35);
  assert.ok(ana.last.players.every((p) => !p.ready), 'al volver a la sala nadie está listo');
  console.log('✓ validación cruzada, Aplicar y puntaje:', lr.rows.map((r) => `${r.name}=${r.roundTotal}`).join(', '));

  // --- reconexión
  caro.disconnect();
  await until(() => ana.last.players.find((p) => p.id === caro.pid).connected === false);
  const caro2 = await client(url, 'jugador-caro-0003');
  await until(() => caro2.last && caro2.last.room.id === roomId);
  assert.strictEqual(caro2.last.players.find((p) => p.id === caro.pid).total, 10);
  console.log('✓ reconexión conserva sala y puntaje');

  // --- segunda ronda + anfitrión fuerza revisión de un jugador ausente
  [ana, beto, caro2].forEach((s) => s.emit('player:ready', { ready: true }));
  await until(() => ana.last.room.phase === 'playing');
  const L2 = ana.last.round.letter;
  assert.notStrictEqual(L2, L, 'no se repite la letra');
  await emit(ana, 'round:stop', { answers: [`${L2}a`, `${L2}b`, `${L2}c`] });
  await until(() => ana.last.room.phase === 'validating');
  await emit(ana, 'review:apply', { marks: null });
  res = await emit(beto, 'review:force', null);
  assert.ok(res.error, 'solo el anfitrión fuerza');
  await emit(ana, 'review:force', null);
  await until(() => ana.last.room.phase === 'lobby' && ana.last.lastResult.num === 2);
  assert.strictEqual(ana.last.history.length, 2);
  console.log(`✓ segunda ronda (letra ${L2}) y "forzar pendientes" del anfitrión`);

  // --- salir de la sala
  await emit(beto, 'room:leave', null);
  await until(() => ana.last.players.length === 2);
  console.log('✓ salir de la sala');

  [ana, beto, caro2].forEach((s) => s.disconnect());
  srv.io.close();
  srv.server.close();
  console.log('\nTodas las pruebas pasaron.');
  process.exit(0);
})().catch((e) => { console.error('✗', e); process.exit(1); });
