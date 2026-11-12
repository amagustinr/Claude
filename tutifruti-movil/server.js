const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
// Tolera cortes breves (pantalla bloqueada, cambio de app) antes de dar el socket por muerto.
const io = new Server(server, { pingInterval: 25000, pingTimeout: 60000 });

const PORT = process.env.PORT || 3000;
// Tiempo que se conserva a un jugador desconectado antes de sacarlo de la sala.
const GRACIA_MS = Number(process.env.GRACIA_MS) || 120000;

// ---------------------------------------------------------------
// Configuracion del juego
// ---------------------------------------------------------------

const CATEGORIAS_BASE = [
  'Nombre', 'Apellido', 'Animal', 'Color',
  'Fruta o verdura', 'Cosa', 'País', 'Comida'
];

const CATEGORIAS_EXTRA = [
  'Ciudad', 'Marca', 'Profesión', 'Película', 'Deporte',
  'Canción', 'Famoso', 'Parte del cuerpo', 'Instrumento', 'Flor o planta'
];

// Sin K, Q, W, X, Y, Z: en español dan rondas frustrantes.
const LETRAS = 'ABCDEFGHIJLMNOPRSTUV'.split('');
const PUNTOS = { UNICO: 100, REPETIDO: 50, VACIO: 0 };
const TIEMPOS = [0, 60, 90, 120, 180];           // 0 = sin límite
const MAX_JUGADORES = 12;
const MAX_CATEGORIAS = 12;
const CUENTA_REGRESIVA_MS = 3000;
const MARGEN_BASTA_MS = 1500;                    // tiempo para que lleguen las últimas respuestas

const FASES = {
  SALA: 'sala',
  CUENTA: 'cuenta',
  JUEGO: 'juego',
  VOTACION: 'votacion',
  RESULTADOS: 'resultados'
};

// ---------------------------------------------------------------
// Estado en memoria
// ---------------------------------------------------------------

const salas = new Map();        // codigo -> sala
const socketInfo = new Map();   // socket.id -> { uid, codigo }

function nuevoCodigo() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // sin I ni O para no confundir con 1 y 0
  let c;
  do {
    c = Array.from({ length: 4 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
  } while (salas.has(c));
  return c;
}

function crearSala() {
  const sala = {
    codigo: nuevoCodigo(),
    anfitrion: null,
    fase: FASES.SALA,
    ronda: 0,
    letra: null,
    letrasUsadas: [],
    categorias: CATEGORIAS_BASE.slice(),
    categoriasRonda: [],
    tiempo: 0,
    terminaEn: null,
    cerradoPor: null,
    jugadores: new Map(),      // uid -> { id, socketId, nombre, puntaje, listo, conectado, timer }
    respuestas: new Map(),     // uid -> [string]
    votos: new Map(),          // "uid:idx" -> Set(uid que rechaza)
    resultados: null,
    timerRonda: null,
    timerCuenta: null
  };
  salas.set(sala.codigo, sala);
  return sala;
}

function jugadoresPublicos(sala) {
  return [...sala.jugadores.values()].map(j => ({
    id: j.id,
    nombre: j.nombre,
    puntaje: j.puntaje,
    listo: j.listo,
    conectado: j.conectado
  }));
}

function snapshot(sala) {
  return {
    codigo: sala.codigo,
    anfitrion: sala.anfitrion,
    fase: sala.fase,
    ronda: sala.ronda,
    letra: sala.fase === FASES.CUENTA ? null : sala.letra,
    categorias: sala.categorias,
    categoriasRonda: sala.categoriasRonda,
    sugerencias: CATEGORIAS_EXTRA,
    tiempo: sala.tiempo,
    tiempos: TIEMPOS,
    terminaEn: sala.terminaEn,
    ahora: Date.now(),
    cerradoPor: sala.cerradoPor,
    jugadores: jugadoresPublicos(sala)
  };
}

function difundir(sala) {
  io.to(sala.codigo).emit('estado', snapshot(sala));
}

function nombreDe(sala, uid) {
  const j = sala.jugadores.get(uid);
  return j ? j.nombre : 'Jugador';
}

function limpiarListos(sala) {
  for (const j of sala.jugadores.values()) j.listo = false;
}

function conectados(sala) {
  return [...sala.jugadores.values()].filter(j => j.conectado);
}

function todosListos(sala) {
  // Un jugador con el celular bloqueado no debe trabar la partida.
  const c = conectados(sala);
  return c.length > 0 && c.every(j => j.listo);
}

function aviso(sala, texto) {
  io.to(sala.codigo).emit('aviso', texto);
}

// ---------------------------------------------------------------
// Ciclo de la ronda
// ---------------------------------------------------------------

function evaluarAvance(sala) {
  if (!todosListos(sala)) return;
  if (sala.fase === FASES.SALA || sala.fase === FASES.RESULTADOS) iniciarCuenta(sala);
  else if (sala.fase === FASES.VOTACION) mostrarResultados(sala);
}

function iniciarCuenta(sala) {
  let disponibles = LETRAS.filter(l => !sala.letrasUsadas.includes(l));
  if (disponibles.length === 0) {
    sala.letrasUsadas = [];
    disponibles = LETRAS.slice();
  }
  sala.letra = disponibles[Math.floor(Math.random() * disponibles.length)];
  sala.letrasUsadas.push(sala.letra);
  sala.ronda += 1;
  sala.categoriasRonda = sala.categorias.slice();
  sala.fase = FASES.CUENTA;
  sala.cerradoPor = null;
  sala.respuestas.clear();
  sala.votos.clear();
  sala.resultados = null;
  sala.terminaEn = null;
  limpiarListos(sala);
  difundir(sala);

  clearTimeout(sala.timerCuenta);
  sala.timerCuenta = setTimeout(() => iniciarJuego(sala), CUENTA_REGRESIVA_MS);
}

function iniciarJuego(sala) {
  if (sala.fase !== FASES.CUENTA) return;
  sala.fase = FASES.JUEGO;
  sala.terminaEn = sala.tiempo > 0 ? Date.now() + sala.tiempo * 1000 : null;
  clearTimeout(sala.timerRonda);
  if (sala.tiempo > 0) {
    sala.timerRonda = setTimeout(() => basta(sala, null), sala.tiempo * 1000);
  }
  difundir(sala);
}

// Alguien grito ¡BASTA! (o se acabo el tiempo): se pide a todos su ultima version
// y se espera un instante antes de pasar a la votacion.
function basta(sala, uid) {
  if (sala.fase !== FASES.JUEGO) return;
  clearTimeout(sala.timerRonda);
  sala.fase = FASES.VOTACION;          // bloquea nuevos "basta"
  sala.cerradoPor = uid ? nombreDe(sala, uid) : '⏰ Tiempo';
  sala.terminaEn = null;
  sala.recibiendo = true;
  limpiarListos(sala);
  io.to(sala.codigo).emit('basta', { por: sala.cerradoPor });

  setTimeout(() => {
    sala.recibiendo = false;
    for (const id of sala.jugadores.keys()) {
      if (!sala.respuestas.has(id)) sala.respuestas.set(id, []);
    }
    difundir(sala);
    io.to(sala.codigo).emit('votacion', construirVotacion(sala));
  }, MARGEN_BASTA_MS);
}

function construirVotacion(sala) {
  return {
    letra: sala.letra,
    filas: sala.categoriasRonda.map((cat, idx) => ({
      categoria: cat,
      idx,
      entradas: [...sala.jugadores.keys()].map(id => ({
        jugadorId: id,
        nombre: nombreDe(sala, id),
        valor: (sala.respuestas.get(id) || [])[idx] || '',
        valida: esValidaBasica(sala, (sala.respuestas.get(id) || [])[idx]),
        rechazos: [...(sala.votos.get(`${id}:${idx}`) || [])]
      }))
    }))
  };
}

function votar(sala, uid, jugadorId, idx, rechaza) {
  if (sala.fase !== FASES.VOTACION || sala.recibiendo) return;
  if (jugadorId === uid || !sala.jugadores.has(jugadorId)) return;
  if (!Number.isInteger(idx) || idx < 0 || idx >= sala.categoriasRonda.length) return;

  const clave = `${jugadorId}:${idx}`;
  if (!sala.votos.has(clave)) sala.votos.set(clave, new Set());
  const set = sala.votos.get(clave);
  if (rechaza) set.add(uid); else set.delete(uid);

  io.to(sala.codigo).emit('voto', { jugadorId, idx, rechazos: [...set] });
}

function esRechazado(sala, jugadorId, idx) {
  const set = sala.votos.get(`${jugadorId}:${idx}`);
  if (!set) return false;
  const otros = Math.max(sala.jugadores.size - 1, 1);
  return set.size > otros / 2;
}

function normalizar(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function esValidaBasica(sala, valor) {
  const n = normalizar(valor);
  return n.length > 1 && n.startsWith(sala.letra.toLowerCase());
}

function mostrarResultados(sala) {
  if (sala.fase !== FASES.VOTACION || sala.recibiendo) return;

  const detalle = new Map();
  for (const id of sala.jugadores.keys()) detalle.set(id, { total: 0, campos: [] });

  sala.categoriasRonda.forEach((cat, idx) => {
    const conteo = new Map();
    const validas = new Map();
    for (const id of sala.jugadores.keys()) {
      const bruto = (sala.respuestas.get(id) || [])[idx] || '';
      const ok = esValidaBasica(sala, bruto) && !esRechazado(sala, id, idx);
      validas.set(id, ok);
      if (ok) {
        const n = normalizar(bruto);
        conteo.set(n, (conteo.get(n) || 0) + 1);
      }
    }
    for (const id of sala.jugadores.keys()) {
      const bruto = (sala.respuestas.get(id) || [])[idx] || '';
      let puntos = PUNTOS.VACIO;
      let motivo = bruto ? 'invalida' : 'vacia';
      if (validas.get(id)) {
        const rep = conteo.get(normalizar(bruto)) > 1;
        puntos = rep ? PUNTOS.REPETIDO : PUNTOS.UNICO;
        motivo = rep ? 'repetida' : 'unica';
      } else if (bruto && esValidaBasica(sala, bruto)) {
        motivo = 'rechazada';
      }
      detalle.get(id).campos.push({ valor: bruto, puntos, motivo });
      detalle.get(id).total += puntos;
    }
  });

  for (const [id, d] of detalle.entries()) {
    const j = sala.jugadores.get(id);
    if (j) j.puntaje += d.total;
  }

  sala.fase = FASES.RESULTADOS;
  limpiarListos(sala);
  sala.resultados = {
    letra: sala.letra,
    ronda: sala.ronda,
    categorias: sala.categoriasRonda,
    filas: [...detalle.entries()].map(([id, d]) => ({
      jugadorId: id,
      nombre: nombreDe(sala, id),
      total: d.total,
      acumulado: sala.jugadores.get(id) ? sala.jugadores.get(id).puntaje : 0,
      campos: d.campos
    })).sort((a, b) => b.acumulado - a.acumulado || b.total - a.total)
  };
  io.to(sala.codigo).emit('resultados', sala.resultados);
  difundir(sala);
}

function reiniciar(sala) {
  clearTimeout(sala.timerRonda);
  clearTimeout(sala.timerCuenta);
  for (const j of sala.jugadores.values()) { j.puntaje = 0; j.listo = false; }
  sala.letrasUsadas = [];
  sala.ronda = 0;
  sala.fase = FASES.SALA;
  sala.letra = null;
  sala.terminaEn = null;
  sala.respuestas.clear();
  sala.votos.clear();
  sala.resultados = null;
  aviso(sala, 'Partida reiniciada: puntajes en cero.');
  difundir(sala);
}

// ---------------------------------------------------------------
// Entrada y salida de jugadores
// ---------------------------------------------------------------

function quitarJugador(sala, uid) {
  const j = sala.jugadores.get(uid);
  if (!j) return;
  clearTimeout(j.timer);
  sala.jugadores.delete(uid);
  sala.respuestas.delete(uid);
  for (const clave of [...sala.votos.keys()]) {
    if (clave.startsWith(uid + ':')) sala.votos.delete(clave);
    else sala.votos.get(clave).delete(uid);
  }

  if (sala.jugadores.size === 0) {
    clearTimeout(sala.timerRonda);
    clearTimeout(sala.timerCuenta);
    salas.delete(sala.codigo);
    return;
  }
  if (sala.anfitrion === uid) {
    const siguiente = conectados(sala)[0] || [...sala.jugadores.values()][0];
    sala.anfitrion = siguiente.id;
    aviso(sala, siguiente.nombre + ' ahora es anfitrión.');
  }
  aviso(sala, j.nombre + ' salió de la sala.');
  difundir(sala);
  evaluarAvance(sala);
}

function limpiarToken(t) {
  return String(t || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function limpiarNombre(n) {
  return String(n || '').replace(/\s+/g, ' ').trim().slice(0, 18);
}

function entrar(socket, sala, uid, nombre) {
  let j = sala.jugadores.get(uid);
  const reconexion = !!j;

  if (!j && sala.jugadores.size >= MAX_JUGADORES) {
    socket.emit('errorSala', 'La sala está llena.');
    return;
  }

  // Si el socket estaba en otra sala, sale de ella.
  const previo = socketInfo.get(socket.id);
  if (previo && previo.codigo !== sala.codigo) {
    socket.leave(previo.codigo);
    const otra = salas.get(previo.codigo);
    if (otra) quitarJugador(otra, previo.uid);
  }

  if (j) {
    // Mismo navegador que vuelve (celular que se desperto, recarga, etc.): conserva todo.
    clearTimeout(j.timer);
    j.timer = null;
    if (j.socketId && j.socketId !== socket.id) socketInfo.delete(j.socketId);
    j.socketId = socket.id;
    j.conectado = true;
    j.nombre = nombre;
  } else {
    j = { id: uid, socketId: socket.id, nombre, puntaje: 0, listo: false, conectado: true, timer: null };
    sala.jugadores.set(uid, j);
  }
  if (!sala.anfitrion || !sala.jugadores.has(sala.anfitrion)) sala.anfitrion = uid;

  socketInfo.set(socket.id, { uid, codigo: sala.codigo });
  socket.join(sala.codigo);
  socket.emit('entrada', { id: uid, codigo: sala.codigo });
  if (!reconexion) aviso(sala, nombre + ' entró a la sala.');
  difundir(sala);

  // Reenvia lo que el cliente se perdio mientras estaba desconectado.
  if (sala.fase === FASES.JUEGO && sala.respuestas.has(uid)) {
    socket.emit('misRespuestas', sala.respuestas.get(uid));
  }
  if (sala.fase === FASES.VOTACION && !sala.recibiendo) socket.emit('votacion', construirVotacion(sala));
  if (sala.fase === FASES.RESULTADOS && sala.resultados) socket.emit('resultados', sala.resultados);
}

function salaDe(socket) {
  const info = socketInfo.get(socket.id);
  if (!info) return {};
  const sala = salas.get(info.codigo);
  if (!sala || !sala.jugadores.has(info.uid)) return {};
  return { sala, uid: info.uid };
}

function respuestasLimpias(sala, datos) {
  const arr = Array.isArray(datos) ? datos : [];
  return sala.categoriasRonda.map((_, i) => String(arr[i] || '').trim().slice(0, 40));
}

// ---------------------------------------------------------------
// Sockets
// ---------------------------------------------------------------

io.on('connection', socket => {

  socket.on('crearSala', datos => {
    const { nombre, token } = (datos && typeof datos === 'object') ? datos : {};
    const n = limpiarNombre(nombre);
    if (!n) return socket.emit('errorSala', 'Escribe tu nombre.');
    const sala = crearSala();
    entrar(socket, sala, limpiarToken(token) || socket.id, n);
  });

  socket.on('unirse', datos => {
    const { nombre, token, codigo } = (datos && typeof datos === 'object') ? datos : {};
    const n = limpiarNombre(nombre);
    if (!n) return socket.emit('errorSala', 'Escribe tu nombre.');
    const sala = salas.get(String(codigo || '').toUpperCase().trim());
    if (!sala) return socket.emit('errorSala', 'No existe una sala con ese código.');
    entrar(socket, sala, limpiarToken(token) || socket.id, n);
  });

  socket.on('salir', () => {
    const { sala, uid } = salaDe(socket);
    socketInfo.delete(socket.id);
    if (!sala) return;
    socket.leave(sala.codigo);
    quitarJugador(sala, uid);
  });

  socket.on('configurar', datos => {
    const { sala, uid } = salaDe(socket);
    if (!sala || sala.anfitrion !== uid) return;
    if (sala.fase !== FASES.SALA && sala.fase !== FASES.RESULTADOS) return;
    const d = (datos && typeof datos === 'object') ? datos : {};

    if (Array.isArray(d.categorias)) {
      const vistas = new Set();
      const cats = d.categorias
        .map(c => String(c || '').replace(/\s+/g, ' ').trim().slice(0, 24))
        .filter(c => c && !vistas.has(c.toLowerCase()) && vistas.add(c.toLowerCase()))
        .slice(0, MAX_CATEGORIAS);
      if (cats.length >= 3) sala.categorias = cats;
    }
    if (TIEMPOS.includes(Number(d.tiempo))) sala.tiempo = Number(d.tiempo);
    difundir(sala);
  });

  socket.on('listo', () => {
    const { sala, uid } = salaDe(socket);
    if (!sala) return;
    if (![FASES.SALA, FASES.RESULTADOS, FASES.VOTACION].includes(sala.fase)) return;
    if (sala.fase === FASES.VOTACION && sala.recibiendo) return;
    const j = sala.jugadores.get(uid);
    j.listo = !j.listo;
    difundir(sala);
    evaluarAvance(sala);
  });

  socket.on('forzar', () => {
    // El anfitrion puede avanzar aunque no todos esten listos.
    const { sala, uid } = salaDe(socket);
    if (!sala || sala.anfitrion !== uid) return;
    if (sala.fase === FASES.SALA || sala.fase === FASES.RESULTADOS) iniciarCuenta(sala);
    else if (sala.fase === FASES.VOTACION) mostrarResultados(sala);
  });

  socket.on('respuestas', datos => {
    const { sala, uid } = salaDe(socket);
    if (!sala) return;
    const abierta = sala.fase === FASES.JUEGO || (sala.fase === FASES.VOTACION && sala.recibiendo);
    if (!abierta) return;
    sala.respuestas.set(uid, respuestasLimpias(sala, datos));
  });

  socket.on('basta', datos => {
    const { sala, uid } = salaDe(socket);
    if (!sala || sala.fase !== FASES.JUEGO) return;
    const r = respuestasLimpias(sala, datos);
    // Para cantar basta hay que haber llenado todo.
    if (r.some(v => !v)) return socket.emit('aviso', 'Completa todas las categorías para cantar ¡Basta!');
    sala.respuestas.set(uid, r);
    basta(sala, uid);
  });

  socket.on('votar', datos => {
    const { sala, uid } = salaDe(socket);
    if (!sala) return;
    const d = (datos && typeof datos === 'object') ? datos : {};
    votar(sala, uid, d.jugadorId, Number(d.idx), !!d.rechaza);
  });

  socket.on('reiniciar', () => {
    const { sala, uid } = salaDe(socket);
    if (!sala || sala.anfitrion !== uid) return;
    reiniciar(sala);
  });

  socket.on('expulsar', jugadorId => {
    const { sala, uid } = salaDe(socket);
    if (!sala || sala.anfitrion !== uid || jugadorId === uid) return;
    const j = sala.jugadores.get(jugadorId);
    if (!j) return;
    if (j.socketId) {
      const s = io.sockets.sockets.get(j.socketId);
      socketInfo.delete(j.socketId);
      if (s) { s.leave(sala.codigo); s.emit('expulsado'); }
    }
    quitarJugador(sala, jugadorId);
  });

  socket.on('disconnect', () => {
    const info = socketInfo.get(socket.id);
    socketInfo.delete(socket.id);
    if (!info) return;
    const sala = salas.get(info.codigo);
    if (!sala) return;
    const j = sala.jugadores.get(info.uid);
    // Si el jugador ya se reasocio a otro socket, este corte no cuenta.
    if (!j || j.socketId !== socket.id) return;

    j.conectado = false;
    j.socketId = null;
    // No se borra: se le da un margen para volver (el celular suele cortar el socket al bloquearse).
    j.timer = setTimeout(() => quitarJugador(sala, info.uid), GRACIA_MS);
    difundir(sala);
    evaluarAvance(sala);
  });
});

// ---------------------------------------------------------------

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/salud', (req, res) => {
  res.json({ ok: true, salas: salas.size });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Tutifruti listo en http://localhost:${PORT}`);
});
