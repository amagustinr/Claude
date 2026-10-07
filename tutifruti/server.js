'use strict';
/**
 * Tutifruti Online — servidor de tiempo real.
 * Express sirve la PWA (carpeta /public) y Socket.io maneja salas y rondas.
 * Todo el estado vive en memoria: si el servidor se reinicia, las salas se pierden.
 */
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const G = require('./lib/game');

const PORT = process.env.PORT || 3000;
const LIMITS = {
  MAX_ROOMS: 300,
  MAX_PLAYERS: 12,
  MIN_PLAYERS: 2,
  NAME: 20,
  ROOM_NAME: 30,
  CATEGORY: 24,
  MIN_CATEGORIES: 3,
  MAX_CATEGORIES: 12,
  ANSWER: 40,
};
const TIMING = {
  COUNTDOWN_MS: 3500, // "3, 2, 1" + letra
  COLLECT_MS: 1500, // tiempo de gracia tras el STOP para recibir las últimas respuestas
  RECONNECT_GRACE_MS: 120000, // un jugador desconectado se elimina tras 2 min
  EMPTY_ROOM_MS: 60000, // sala sin nadie conectado se elimina tras 1 min
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 20000, pingTimeout: 25000 });

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', index: 'index.html' }));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size, uptime: process.uptime() }));

/** @type {Map<string, any>} */
const rooms = new Map();
/** playerId -> roomId */
const playerRoom = new Map();

// ----------------------------------------------------------------- utilidades
const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const newId = (len = 6) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  do {
    id = Array.from(crypto.randomBytes(len), (b) => alphabet[b % alphabet.length]).join('');
  } while (rooms.has(id));
  return id;
};
const hashPass = (pass, salt) => crypto.scryptSync(String(pass), salt, 32).toString('hex');
const safeAck = (ack) => (typeof ack === 'function' ? ack : () => {});

function sanitizeCategories(list) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const v = clean(c, LIMITS.CATEGORY);
    const k = G.normalize(v);
    if (v && !seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  if (out.length < LIMITS.MIN_CATEGORIES || out.length > LIMITS.MAX_CATEGORIES) return null;
  return out;
}

function sanitizeConfig(cfg = {}) {
  const categories = sanitizeCategories(cfg.categories) || G.DEFAULT_CATEGORIES.slice();
  const tl = parseInt(cfg.timeLimit, 10);
  const timeLimit = [0, 60, 90, 120, 180].includes(tl) ? tl : 0;
  return { categories, timeLimit, includeHard: !!cfg.includeHard };
}

// ----------------------------------------------------------------- consultas
const connectedPlayers = (room) => [...room.players.values()].filter((p) => p.connected);

function roomSummary(room) {
  const host = room.players.get(room.hostId);
  return {
    id: room.id,
    name: room.name,
    isPublic: room.isPublic,
    players: connectedPlayers(room).length,
    maxPlayers: LIMITS.MAX_PLAYERS,
    phase: room.phase,
    hostName: host ? host.name : '',
  };
}

function listRooms() {
  return [...rooms.values()]
    .filter((r) => connectedPlayers(r).length > 0)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(roomSummary);
}

let browserTimer = null;
function broadcastRoomList() {
  if (browserTimer) return;
  browserTimer = setTimeout(() => {
    browserTimer = null;
    io.to('browser').emit('rooms:list', listRooms());
  }, 250);
}

/** Estado personalizado para un jugador (nunca se envían respuestas ajenas durante la ronda). */
function stateFor(room, pid) {
  const r = room.round;
  const players = [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    ready: p.ready,
    connected: p.connected,
    total: p.total,
    isHost: p.id === room.hostId,
    inRound: !!(r && r.participants.includes(p.id)),
    filled: r && room.phase === 'playing' ? (r.answers[p.id] || []).filter((a) => clean(a, 1)).length : 0,
    applied: !!(r && room.phase === 'validating' && r.applied.has(p.id)),
    reviewer: !!(r && room.phase === 'validating' && r.assignments[p.id]),
  }));

  const state = {
    serverNow: Date.now(),
    me: pid,
    room: {
      id: room.id,
      name: room.name,
      isPublic: room.isPublic,
      hostId: room.hostId,
      phase: room.phase,
      categories: room.categories,
      timeLimit: room.timeLimit,
      includeHard: room.includeHard,
      roundNum: room.roundNum,
      minPlayers: LIMITS.MIN_PLAYERS,
    },
    players,
    round: null,
    lastResult: room.lastResult,
    history: room.history,
  };

  if (r && room.phase !== 'lobby') {
    const participating = r.participants.includes(pid);
    const base = {
      num: r.num,
      letter: room.phase === 'countdown' ? null : r.letter,
      categories: r.categories,
      participating,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      stoppedByName: r.stoppedBy ? (room.players.get(r.stoppedBy) || {}).name || r.stoppedByName : null,
      stopReason: r.stopReason,
    };
    if (room.phase === 'countdown') base.letter = null;
    if (['playing', 'collecting'].includes(room.phase)) base.myAnswers = r.answers[pid] || [];
    if (room.phase === 'validating') {
      const targetId = r.assignments[pid];
      base.reviewersPending = Object.keys(r.assignments).filter((x) => !r.applied.has(x)).length;
      base.iApplied = r.applied.has(pid);
      if (targetId) {
        const target = room.players.get(targetId);
        const ans = r.answers[targetId] || [];
        base.review = {
          targetId,
          targetName: target ? target.name : r.names[targetId] || '(se fue)',
          answers: r.categories.map((_, c) => ans[c] || ''),
          defaults: r.categories.map((_, c) => G.autoValid(ans[c], r.letter)),
          startsOk: r.categories.map((_, c) => G.startsWithLetter(ans[c], r.letter)),
          duplicates: (r.dups[targetId] || []).map((ids) =>
            ids.map((id) => (room.players.get(id) || {}).name || '?')
          ),
        };
      }
    }
    state.round = base;
  }
  return state;
}

function sync(room) {
  for (const p of room.players.values()) {
    if (p.connected && p.socketId) io.to(p.socketId).emit('state', stateFor(room, p.id));
  }
  broadcastRoomList();
}

// ----------------------------------------------------------------- ciclo de ronda
function clearTimers(room) {
  for (const k of Object.keys(room.timers)) {
    clearTimeout(room.timers[k]);
    delete room.timers[k];
  }
}

function maybeStartRound(room) {
  if (room.phase !== 'lobby') return;
  const online = connectedPlayers(room);
  if (online.length < LIMITS.MIN_PLAYERS) return;
  if (!online.every((p) => p.ready)) return;

  const letter = G.pickLetter(room.usedLetters, room.includeHard);
  room.usedLetters.push(letter);
  const poolSize = room.includeHard ? G.EASY_LETTERS.length + G.HARD_LETTERS.length : G.EASY_LETTERS.length;
  if (room.usedLetters.length >= poolSize) room.usedLetters = [letter];

  room.roundNum += 1;
  const now = Date.now();
  room.round = {
    num: room.roundNum,
    letter,
    categories: room.categories.slice(),
    participants: online.map((p) => p.id),
    names: Object.fromEntries(online.map((p) => [p.id, p.name])),
    answers: {},
    startsAt: now + TIMING.COUNTDOWN_MS,
    endsAt: room.timeLimit ? now + TIMING.COUNTDOWN_MS + room.timeLimit * 1000 : null,
    stoppedBy: null,
    stoppedByName: null,
    stopReason: null,
    assignments: {},
    marks: {},
    applied: new Set(),
    dups: {},
  };
  room.phase = 'countdown';
  room.timers.countdown = setTimeout(() => {
    room.phase = 'playing';
    if (room.round.endsAt) {
      room.timers.limit = setTimeout(() => stopRound(room, null, 'time'), room.round.endsAt - Date.now());
    }
    sync(room);
  }, TIMING.COUNTDOWN_MS);
  sync(room);
}

function stopRound(room, byPid, reason) {
  if (room.phase !== 'playing') return;
  clearTimers(room);
  const r = room.round;
  r.stoppedBy = byPid;
  r.stoppedByName = byPid ? (room.players.get(byPid) || {}).name : null;
  r.stopReason = reason;
  room.phase = 'collecting';
  sync(room);
  room.timers.collect = setTimeout(() => startValidation(room), TIMING.COLLECT_MS);
}

function startValidation(room) {
  const r = room.round;
  // Solo participan en la revisión quienes jugaron y siguen en la sala.
  r.participants = r.participants.filter((id) => room.players.has(id));
  if (r.participants.length === 0) return backToLobby(room);
  r.participants.forEach((id) => {
    r.answers[id] = r.categories.map((_, c) => clean((r.answers[id] || [])[c], LIMITS.ANSWER));
  });
  r.assignments = G.buildAssignments(r.participants);
  r.dups = G.duplicatesInfo(r.participants, r.answers, r.categories.length);
  r.marks = {};
  r.applied = new Set();
  room.phase = 'validating';
  sync(room);
}

function applyReview(room, reviewerId, marks) {
  const r = room.round;
  const targetId = r.assignments[reviewerId];
  if (!targetId || r.applied.has(reviewerId)) return;
  const ans = r.answers[targetId] || [];
  r.marks[targetId] = r.categories.map((_, c) => {
    if (!clean(ans[c], 1)) return false; // vacía: siempre inválida
    return Array.isArray(marks) && typeof marks[c] === 'boolean' ? marks[c] : G.autoValid(ans[c], r.letter);
  });
  r.applied.add(reviewerId);
  if (Object.keys(r.assignments).every((id) => r.applied.has(id))) finishRound(room);
  else sync(room);
}

/** El anfitrión aplica los valores por defecto de quienes no respondieron (se fueron o están AFK). */
function forcePending(room) {
  const r = room.round;
  for (const reviewer of Object.keys(r.assignments)) {
    if (!r.applied.has(reviewer)) applyReview(room, reviewer, null);
    if (room.phase !== 'validating') break;
  }
}

function finishRound(room) {
  const r = room.round;
  const scores = G.scoreRound(r.participants, r.answers, r.marks, r.categories.length);
  const rows = r.participants.map((pid) => {
    const p = room.players.get(pid);
    if (p) p.total += scores[pid].total;
    return {
      id: pid,
      name: p ? p.name : r.names[pid] || '?',
      answers: r.answers[pid],
      valid: r.marks[pid] || r.categories.map(() => false),
      points: scores[pid].points,
      roundTotal: scores[pid].total,
      total: p ? p.total : scores[pid].total,
    };
  });
  rows.sort((a, b) => b.roundTotal - a.roundTotal || b.total - a.total);
  room.lastResult = {
    num: r.num,
    letter: r.letter,
    categories: r.categories,
    stoppedByName: r.stoppedByName,
    stopReason: r.stopReason,
    rows,
  };
  room.history.push({
    num: r.num,
    letter: r.letter,
    scores: Object.fromEntries(rows.map((x) => [x.id, x.roundTotal])),
  });
  backToLobby(room);
}

function backToLobby(room) {
  clearTimers(room);
  room.phase = 'lobby';
  room.round = null;
  for (const p of room.players.values()) p.ready = false;
  sync(room);
}

// ----------------------------------------------------------------- jugadores
function transferHostIfNeeded(room) {
  const host = room.players.get(room.hostId);
  if (host && host.connected) return;
  const next = connectedPlayers(room)[0] || [...room.players.values()][0];
  if (next) room.hostId = next.id;
}

function removePlayer(room, pid) {
  const p = room.players.get(pid);
  if (!p) return;
  if (p.removeTimer) clearTimeout(p.removeTimer);
  room.players.delete(pid);
  playerRoom.delete(pid);
  if (p.socketId) {
    const s = io.sockets.sockets.get(p.socketId);
    if (s) s.leave(room.id);
  }
  if (room.players.size === 0) return deleteRoom(room);
  transferHostIfNeeded(room);

  if (room.round) {
    const r = room.round;
    if (room.phase === 'validating') {
      // Si el que se fue debía revisar a alguien, se aplican los valores automáticos.
      if (r.assignments[pid] && !r.applied.has(pid)) applyReview(room, pid, null);
      if (room.phase !== 'validating') return;
    }
    if (['countdown', 'playing'].includes(room.phase)) {
      r.participants = r.participants.filter((id) => id !== pid);
      if (r.participants.length === 0) return backToLobby(room);
    }
  }
  maybeStartRound(room);
  sync(room);
}

function deleteRoom(room) {
  clearTimers(room);
  if (room.emptyTimer) clearTimeout(room.emptyTimer);
  for (const pid of room.players.keys()) playerRoom.delete(pid);
  rooms.delete(room.id);
  broadcastRoomList();
}

function attachSocket(room, player, socket) {
  if (player.removeTimer) {
    clearTimeout(player.removeTimer);
    player.removeTimer = null;
  }
  if (room.emptyTimer) {
    clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
  }
  player.socketId = socket.id;
  player.connected = true;
  socket.data.playerId = player.id;
  socket.data.roomId = room.id;
  socket.leave('browser');
  socket.join(room.id);
  transferHostIfNeeded(room);
}

function addPlayer(room, pid, name, socket) {
  const current = playerRoom.get(pid);
  if (current && current !== room.id && rooms.has(current)) removePlayer(rooms.get(current), pid);
  const player = {
    id: pid,
    name,
    ready: false,
    connected: true,
    socketId: socket.id,
    total: 0,
    removeTimer: null,
  };
  room.players.set(pid, player);
  playerRoom.set(pid, room.id);
  attachSocket(room, player, socket);
  return player;
}

// ----------------------------------------------------------------- sockets
io.on('connection', (socket) => {
  const pidOf = () => socket.data.playerId;
  const ctx = () => {
    const room = rooms.get(socket.data.roomId);
    const player = room && room.players.get(pidOf());
    return room && player ? { room, player } : null;
  };

  // El cliente se identifica con un id persistente (localStorage) para poder reconectarse.
  socket.on('hello', (data, ack) => {
    ack = safeAck(ack);
    const pid = clean(data && data.playerId, 40);
    if (!/^[a-zA-Z0-9_-]{8,40}$/.test(pid)) return ack({ error: 'Identificador inválido' });
    socket.data.playerId = pid;
    const roomId = playerRoom.get(pid);
    const room = roomId && rooms.get(roomId);
    const player = room && room.players.get(pid);
    if (room && player) {
      if (player.socketId && player.socketId !== socket.id) {
        const old = io.sockets.sockets.get(player.socketId);
        if (old) old.disconnect(true);
      }
      attachSocket(room, player, socket);
      ack({ ok: true, roomId: room.id });
      sync(room);
    } else {
      ack({ ok: true, roomId: null });
    }
  });

  socket.on('rooms:subscribe', (_d, ack) => {
    socket.join('browser');
    safeAck(ack)(listRooms());
  });
  socket.on('rooms:unsubscribe', () => socket.leave('browser'));

  socket.on('room:create', (data = {}, ack) => {
    ack = safeAck(ack);
    const pid = pidOf();
    if (!pid) return ack({ error: 'Sin identificación, recarga la app' });
    const playerName = clean(data.playerName, LIMITS.NAME);
    const name = clean(data.name, LIMITS.ROOM_NAME);
    if (!playerName) return ack({ error: 'Escribe tu nombre' });
    if (!name) return ack({ error: 'Escribe el nombre de la sala' });
    if (rooms.size >= LIMITS.MAX_ROOMS) return ack({ error: 'El servidor está lleno, intenta más tarde' });
    const isPublic = data.isPublic !== false;
    const password = String(data.password || '');
    if (!isPublic && password.length < 3) return ack({ error: 'La contraseña debe tener al menos 3 caracteres' });

    const cfg = sanitizeConfig(data);
    const salt = crypto.randomBytes(8).toString('hex');
    const room = {
      id: newId(),
      name,
      isPublic,
      salt,
      passHash: isPublic ? null : hashPass(password, salt),
      hostId: pid,
      ...cfg,
      phase: 'lobby',
      players: new Map(),
      usedLetters: [],
      roundNum: 0,
      round: null,
      lastResult: null,
      history: [],
      timers: {},
      emptyTimer: null,
      createdAt: Date.now(),
    };
    rooms.set(room.id, room);
    addPlayer(room, pid, playerName, socket);
    ack({ ok: true, roomId: room.id });
    sync(room);
  });

  socket.on('room:join', (data = {}, ack) => {
    ack = safeAck(ack);
    const pid = pidOf();
    if (!pid) return ack({ error: 'Sin identificación, recarga la app' });
    const room = rooms.get(clean(data.roomId, 10).toUpperCase());
    if (!room) return ack({ error: 'La sala ya no existe' });
    const playerName = clean(data.playerName, LIMITS.NAME);
    if (!playerName) return ack({ error: 'Escribe tu nombre' });

    const existing = room.players.get(pid);
    if (existing) {
      existing.name = playerName;
      attachSocket(room, existing, socket);
      ack({ ok: true, roomId: room.id });
      return sync(room);
    }
    if (!room.isPublic && hashPass(data.password || '', room.salt) !== room.passHash) {
      return ack({ error: 'Contraseña incorrecta', needPassword: true });
    }
    if (room.players.size >= LIMITS.MAX_PLAYERS) return ack({ error: 'La sala está llena' });
    const taken = [...room.players.values()].some((p) => G.normalize(p.name) === G.normalize(playerName));
    if (taken) return ack({ error: 'Ese nombre ya está en uso en la sala' });

    addPlayer(room, pid, playerName, socket);
    ack({ ok: true, roomId: room.id });
    sync(room);
  });

  socket.on('room:leave', (_d, ack) => {
    const c = ctx();
    if (c) removePlayer(c.room, c.player.id);
    socket.data.roomId = null;
    safeAck(ack)({ ok: true });
  });

  socket.on('room:config', (data = {}, ack) => {
    ack = safeAck(ack);
    const c = ctx();
    if (!c) return ack({ error: 'No estás en una sala' });
    if (c.room.hostId !== c.player.id) return ack({ error: 'Solo el anfitrión puede cambiar las reglas' });
    if (c.room.phase !== 'lobby') return ack({ error: 'Solo se puede cambiar entre rondas' });
    if (!sanitizeCategories(data.categories)) {
      return ack({ error: `Usa entre ${LIMITS.MIN_CATEGORIES} y ${LIMITS.MAX_CATEGORIES} categorías distintas` });
    }
    Object.assign(c.room, sanitizeConfig(data));
    for (const p of c.room.players.values()) p.ready = false; // las reglas cambiaron: todos confirman de nuevo
    ack({ ok: true });
    sync(c.room);
  });

  socket.on('room:kick', (data = {}, ack) => {
    ack = safeAck(ack);
    const c = ctx();
    if (!c || c.room.hostId !== c.player.id) return ack({ error: 'Solo el anfitrión puede expulsar' });
    const target = c.room.players.get(data.playerId);
    if (!target || target.id === c.player.id) return ack({ error: 'Jugador no válido' });
    if (target.socketId) io.to(target.socketId).emit('kicked');
    removePlayer(c.room, target.id);
    ack({ ok: true });
  });

  socket.on('player:ready', (data = {}) => {
    const c = ctx();
    if (!c || c.room.phase !== 'lobby') return;
    c.player.ready = !!data.ready;
    sync(c.room);
    maybeStartRound(c.room);
  });

  socket.on('round:answers', (data = {}) => {
    const c = ctx();
    if (!c || !c.room.round || !['playing', 'collecting'].includes(c.room.phase)) return;
    const r = c.room.round;
    if (!r.participants.includes(c.player.id) || !Array.isArray(data.answers)) return;
    const prevFilled = (r.answers[c.player.id] || []).filter((a) => clean(a, 1)).length;
    r.answers[c.player.id] = r.categories.map((_, i) => clean(data.answers[i], LIMITS.ANSWER));
    const filled = r.answers[c.player.id].filter(Boolean).length;
    if (c.room.phase === 'playing' && filled !== prevFilled) sync(c.room); // progreso visible para todos
  });

  socket.on('round:stop', (data = {}, ack) => {
    ack = safeAck(ack);
    const c = ctx();
    if (!c || c.room.phase !== 'playing') return ack({ error: 'La ronda ya terminó' });
    const r = c.room.round;
    if (!r.participants.includes(c.player.id)) return ack({ error: 'No participas en esta ronda' });
    if (Array.isArray(data.answers)) {
      r.answers[c.player.id] = r.categories.map((_, i) => clean(data.answers[i], LIMITS.ANSWER));
    }
    const mine = r.answers[c.player.id] || [];
    if (mine.filter(Boolean).length < r.categories.length) {
      return ack({ error: 'Completa todas las categorías antes de pulsar STOP' });
    }
    ack({ ok: true });
    stopRound(c.room, c.player.id, 'stop');
  });

  socket.on('review:apply', (data = {}, ack) => {
    ack = safeAck(ack);
    const c = ctx();
    if (!c || c.room.phase !== 'validating') return ack({ error: 'No hay validación en curso' });
    ack({ ok: true });
    applyReview(c.room, c.player.id, data.marks);
  });

  socket.on('review:force', (_d, ack) => {
    ack = safeAck(ack);
    const c = ctx();
    if (!c || c.room.phase !== 'validating') return ack({ error: 'No hay validación en curso' });
    if (c.room.hostId !== c.player.id) return ack({ error: 'Solo el anfitrión puede forzar' });
    ack({ ok: true });
    forcePending(c.room);
  });

  socket.on('disconnect', () => {
    const c = ctx();
    if (!c || c.player.socketId !== socket.id) return;
    const { room, player } = c;
    player.connected = false;
    player.ready = false;
    player.socketId = null;
    transferHostIfNeeded(room);
    player.removeTimer = setTimeout(() => {
      if (rooms.get(room.id) === room && !player.connected) removePlayer(room, player.id);
    }, TIMING.RECONNECT_GRACE_MS);
    if (connectedPlayers(room).length === 0) {
      room.emptyTimer = setTimeout(() => {
        if (rooms.get(room.id) === room && connectedPlayers(room).length === 0) deleteRoom(room);
      }, TIMING.EMPTY_ROOM_MS);
    }
    sync(room);
    maybeStartRound(room);
  });
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Tutifruti escuchando en http://localhost:${PORT}`));
}

module.exports = { server, io, rooms, TIMING, LIMITS };
