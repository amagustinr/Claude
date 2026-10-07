// Controlador de pantallas del juego: inicio → sala de espera → selección → pelea.

import { configurado, urlFoto, cargarPersonajesDisponibles } from './supabase.js';
import { Lobby } from './net/lobby.js';
import { Sala } from './net/sala.js';
import { Teclado, controlesTactiles } from './game/input.js';
import { PartidaSimulada, PartidaRemota } from './game/partida.js';
import { cargarImagen } from './game/render.js';
import { dibujarLuchador } from './game/cuerpo.js';
import { derivarStats } from './game/stats.js';
import { poseDe } from './game/poses.js';
import { ENTRADA_VACIA } from './game/engine.js';
import { Cpu } from './game/cpu.js';

const $ = (id) => document.getElementById(id);

const st = {
  modo: null, // 'linea' | 'practica'
  miId: crypto.randomUUID(),
  nombre: '',
  lobby: null,
  sala: null,
  soyAnfitrion: false,
  rivalNombre: '',
  personajes: [],
  miSel: null,
  rivalSel: null,
  miListo: false,
  rivalListo: false,
  partida: null,
  teclado: null,
  entradaRival: ENTRADA_VACIA,
  latido: null,
  retoEnviado: null, // { para, sala, nombre }
  retoRecibido: null,
};

// ---------------------------------------------------------------- utilidades de UI
function mostrar(pantalla) {
  document.querySelectorAll('.pantalla').forEach((p) => p.classList.toggle('activa', p.id === `pantalla-${pantalla}`));
}

const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let resolverDialogo = null;
function preguntar(texto, { si = 'Aceptar', no = 'Rechazar' } = {}) {
  cerrarDialogo(false);
  $('dialogo-texto').textContent = texto;
  $('dialogo-si').textContent = si ?? '';
  $('dialogo-si').classList.toggle('oculto', !si);
  $('dialogo-no').textContent = no ?? '';
  $('dialogo-no').classList.toggle('oculto', !no);
  $('dialogo').showModal();
  return new Promise((resolve) => (resolverDialogo = resolve));
}
function cerrarDialogo(valor) {
  if ($('dialogo').open) $('dialogo').close();
  const r = resolverDialogo;
  resolverDialogo = null;
  r?.(valor);
}
$('dialogo-si').onclick = () => cerrarDialogo(true);
$('dialogo-no').onclick = () => cerrarDialogo(false);
$('dialogo').addEventListener('cancel', (ev) => { ev.preventDefault(); cerrarDialogo(false); });

const avisar = (texto) => preguntar(texto, { si: 'Entendido', no: null });

// ---------------------------------------------------------------- inicio
$('nombre').value = localStorage.getItem('nombreJugador') ?? '';
if (!configurado) {
  $('aviso-config').classList.remove('oculto');
  $('btn-en-linea').disabled = true;
  $('btn-practica').disabled = true;
}

function leerNombre() {
  const nombre = $('nombre').value.trim();
  if (nombre.length < 2) {
    $('nombre').focus();
    avisar('Escribe un nombre de al menos 2 letras.');
    return null;
  }
  localStorage.setItem('nombreJugador', nombre);
  return nombre;
}

$('btn-practica').onclick = async () => {
  const nombre = leerNombre();
  if (!nombre) return;
  st.nombre = nombre;
  st.modo = 'practica';
  await irASeleccion();
};

$('btn-en-linea').onclick = async () => {
  const nombre = leerNombre();
  if (!nombre) return;
  st.nombre = nombre;
  st.modo = 'linea';
  $('btn-en-linea').disabled = true;
  try {
    await entrarLobby();
  } catch (err) {
    avisar(err.message);
  } finally {
    $('btn-en-linea').disabled = false;
  }
};

document.querySelectorAll('[data-ir="inicio"]').forEach((b) => (b.onclick = async () => {
  await st.lobby?.salir();
  st.lobby = null;
  mostrar('inicio');
}));

// ---------------------------------------------------------------- sala de espera
async function entrarLobby() {
  if (!st.lobby) {
    st.lobby = new Lobby({
      miId: st.miId,
      nombre: st.nombre,
      alCambiarJugadores: pintarJugadores,
      alReto: recibirReto,
      alRespuesta: recibirRespuesta,
      alCancelarReto: (r) => {
        if (st.retoRecibido?.sala === r.sala) {
          st.retoRecibido = null;
          cerrarDialogo(false);
          $('lobby-estado').textContent = 'El reto fue cancelado.';
        }
      },
    });
    await st.lobby.entrar();
  }
  await st.lobby.marcarEstado('libre');
  $('lobby-yo').textContent = `Tú: ${st.nombre}`;
  $('lobby-estado').textContent = '';
  pintarJugadores(st.lobby.jugadores());
  mostrar('lobby');
}

function pintarJugadores(jugadores) {
  const ul = $('lista-jugadores');
  ul.innerHTML = '';
  $('lobby-vacio').classList.toggle('oculto', jugadores.length > 0);
  for (const j of jugadores) {
    const li = document.createElement('li');
    const ocupado = j.estado !== 'libre';
    li.innerHTML = `<span class="punto ${ocupado ? 'ocupado' : ''}"></span>
      <span class="nombre">${escapar(j.nombre)}</span>
      <span class="nota">${ocupado ? 'peleando' : 'disponible'}</span>`;
    const b = document.createElement('button');
    b.textContent = 'Desafiar';
    b.className = 'primario';
    b.disabled = ocupado || Boolean(st.retoEnviado) || Boolean(st.sala);
    b.onclick = () => enviarReto(j);
    li.append(b);
    ul.append(li);
  }
}

async function enviarReto(jugador) {
  const sala = st.lobby.retar(jugador.id);
  st.retoEnviado = { para: jugador.id, sala, nombre: jugador.nombre };
  pintarJugadores(st.lobby.jugadores());
  const limite = setTimeout(() => cerrarDialogo('tiempo'), 20000);
  const r = await preguntar(`Esperando a que ${jugador.nombre} acepte…`, { si: null, no: 'Cancelar' });
  clearTimeout(limite);
  // r === 'aceptado' lo pone recibirRespuesta; cualquier otro valor es cancelación.
  if (r !== 'aceptado' && st.retoEnviado?.sala === sala) {
    st.lobby.cancelarReto(jugador.id, sala);
    if (r === 'tiempo') $('lobby-estado').textContent = `${jugador.nombre} no respondió.`;
    st.retoEnviado = null;
    pintarJugadores(st.lobby.jugadores());
  }
}

async function recibirRespuesta(r) {
  if (st.retoEnviado?.sala !== r.sala) return;
  if (!r.acepta) {
    st.retoEnviado = null;
    cerrarDialogo('rechazado');
    $('lobby-estado').textContent = `${r.nombre} rechazó el reto.`;
    pintarJugadores(st.lobby.jugadores());
    return;
  }
  st.retoEnviado = null;
  cerrarDialogo('aceptado');
  await entrarSala(r.sala, true, r.nombre);
}

async function recibirReto(reto) {
  // Si ya estoy ocupado, rechazo automáticamente.
  if (st.sala || st.retoEnviado || st.retoRecibido) {
    st.lobby.responder(reto, false);
    return;
  }
  st.retoRecibido = reto;
  const acepta = await preguntar(`${reto.nombre} te desafía a pelear. ¿Aceptas?`);
  if (st.retoRecibido?.sala !== reto.sala) return; // lo canceló el retador
  st.retoRecibido = null;
  st.lobby.responder(reto, acepta === true);
  if (acepta === true) await entrarSala(reto.sala, false, reto.nombre);
}

// ---------------------------------------------------------------- sala de combate
async function entrarSala(salaId, soyAnfitrion, rivalNombre) {
  st.soyAnfitrion = soyAnfitrion;
  st.rivalNombre = rivalNombre;
  st.sala = new Sala({
    salaId,
    miId: st.miId,
    nombre: st.nombre,
    soyAnfitrion,
    handlers: {
      rivalConectado: (nombre) => {
        st.rivalNombre = nombre;
        pintarEstadoSeleccion();
        // Por si el rival entró después de que yo eligiera.
        if (st.miSel) st.sala.enviar('listo', { listo: st.miListo, personajeId: st.miSel });
      },
      rivalSeFue: async () => {
        const enPelea = Boolean(st.partida);
        await salirDeSala();
        await entrarLobby();
        avisar(enPelea ? 'Tu rival se desconectó durante la pelea.' : 'Tu rival salió de la sala.');
      },
      sel: ({ personajeId }) => {
        st.rivalSel = personajeId;
        st.rivalListo = false;
        pintarPersonajes();
      },
      listo: ({ listo, personajeId }) => {
        st.rivalSel = personajeId;
        st.rivalListo = listo;
        pintarPersonajes();
        comprobarInicio();
      },
      inicio: ({ p1, p2 }) => {
        if (!st.soyAnfitrion) comenzarPelea(p1, p2);
      },
      in: ({ e }) => {
        if (st.soyAnfitrion) st.entradaRival = e;
      },
      st: ({ s }) => {
        if (!st.soyAnfitrion && st.partida instanceof PartidaRemota) st.partida.recibir(s);
      },
      volver: () => {
        if (!$('fin-combate').classList.contains('oculto')) irASeleccion();
      },
    },
  });
  try {
    await st.sala.entrar();
    await st.lobby.marcarEstado('jugando');
    await irASeleccion();
  } catch (err) {
    await salirDeSala();
    avisar(err.message);
  }
}

async function salirDeSala() {
  terminarPartida();
  await st.sala?.salir();
  st.sala = null;
  st.rivalSel = null;
  st.rivalListo = false;
}

// ---------------------------------------------------------------- selección
async function irASeleccion() {
  terminarPartida();
  st.miListo = false; // st.rivalListo no se toca: el rival pudo marcar listo antes de que yo volviera
  $('fin-combate').classList.add('oculto');
  mostrar('seleccion');
  $('titulo-seleccion').textContent = st.modo === 'practica' ? 'Modo práctica: elige tu luchador' : 'Elige tu luchador';
  pintarEstadoSeleccion();
  try {
    st.personajes = await cargarPersonajesDisponibles();
  } catch (err) {
    $('sel-estado').textContent = `No se pudieron cargar los personajes: ${err.message}`;
    return;
  }
  if (!st.personajes.some((p) => p.id === st.miSel)) st.miSel = null;
  if (st.miSel && st.sala) st.sala.enviar('sel', { personajeId: st.miSel });
  pintarPersonajes();
}

function pintarEstadoSeleccion() {
  $('sel-rival').textContent = st.modo === 'practica' ? 'Rival: CPU' : `Rival: ${st.rivalNombre || '…'}`;
}

function pintarPersonajes() {
  const grilla = $('grilla-personajes');
  grilla.innerHTML = '';
  if (!st.personajes.length) {
    grilla.innerHTML = '<p class="nota">No hay personajes disponibles. El administrador debe crearlos en el panel.</p>';
  }
  for (const p of st.personajes) {
    const div = document.createElement('div');
    div.className = 'personaje';
    div.classList.toggle('mio', p.id === st.miSel);
    div.classList.toggle('rival', st.modo === 'linea' && p.id === st.rivalSel);
    const barra = (nombre, v) =>
      `<div class="stat"><span>${nombre}</span><span class="barrita"><i style="width:${v}%"></i></span><b>${v}</b></div>`;
    div.innerHTML = `
      ${p.id === st.miSel ? `<span class="marca yo">TÚ${st.miListo ? ' ✓' : ''}</span>` : ''}
      ${st.modo === 'linea' && p.id === st.rivalSel ? `<span class="marca el">RIVAL${st.rivalListo ? ' ✓' : ''}</span>` : ''}
      <canvas class="figura" width="300" height="340"></canvas>
      <h3>${escapar(p.nombre)}</h3>
      <div class="contextura">${p.sexo === 'F' ? 'Mujer' : 'Hombre'} · ${p.altura_cm} cm · ${p.peso_kg} kg · ${escapar(p.complexion)}</div>
      ${barra('Fuerza', p.fuerza)}${barra('Agilidad', p.agilidad)}${barra('Resistencia', p.resistencia)}`;
    dibujarFigura(div.querySelector('canvas'), p);
    div.onclick = () => elegir(p.id);
    grilla.append(div);
  }
  const btn = $('btn-listo');
  btn.disabled = !st.miSel;
  if (st.modo === 'practica') {
    btn.textContent = '¡Pelear!';
    $('sel-estado').textContent = st.miSel ? 'La CPU elegirá un luchador al azar.' : 'Toca un personaje para elegirlo.';
  } else {
    btn.textContent = st.miListo ? 'Cancelar listo' : '¡Listo!';
    $('sel-estado').textContent = !st.miSel
      ? 'Toca un personaje para elegirlo.'
      : !st.miListo
        ? 'Pulsa ¡Listo! cuando estés conforme.'
        : st.rivalListo
          ? 'Ambos listos. ¡Comienza la pelea!'
          : `Esperando a que ${st.rivalNombre || 'tu rival'} esté listo…`;
  }
}

// Luchador de cuerpo entero en la tarjeta (misma escala para todos, así se nota la altura).
const imagenes = new Map();
async function dibujarFigura(canvas, p) {
  const url = urlFoto(p);
  if (url && !imagenes.has(url)) imagenes.set(url, cargarImagen(url));
  const cara = url ? await imagenes.get(url) : null;
  const ctx = canvas.getContext('2d');
  const stats = derivarStats(p);
  const k = 1.2;
  const suelo = 330;
  ctx.fillStyle = '#0006';
  ctx.beginPath();
  ctx.ellipse(150, suelo, 55 * stats.escala * stats.grosor, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const f = { x: 150 / k, alt: 0, lado: 1, estado: 'quieto', ef: 0 };
  dibujarLuchador(ctx, f, poseDe(f, stats), stats, cara, suelo / k);
}

function elegir(id) {
  if (st.miListo) return; // primero hay que cancelar el listo
  st.miSel = id;
  st.sala?.enviar('sel', { personajeId: id });
  pintarPersonajes();
}

$('btn-listo').onclick = () => {
  if (!st.miSel) return;
  if (st.modo === 'practica') {
    const cpu = st.personajes[Math.floor(Math.random() * st.personajes.length)];
    comenzarPelea(st.miSel, cpu.id);
    return;
  }
  st.miListo = !st.miListo;
  st.sala.enviar('listo', { listo: st.miListo, personajeId: st.miSel });
  pintarPersonajes();
  comprobarInicio();
};

function comprobarInicio() {
  if (!st.soyAnfitrion || !st.miListo || !st.rivalListo || !st.miSel || !st.rivalSel || st.partida) return;
  st.sala.enviar('inicio', { p1: st.miSel, p2: st.rivalSel });
  comenzarPelea(st.miSel, st.rivalSel);
}

$('btn-salir-seleccion').onclick = async () => {
  if (st.modo === 'practica') return mostrar('inicio');
  await salirDeSala();
  await entrarLobby();
};

// ---------------------------------------------------------------- pelea
async function comenzarPelea(p1Id, p2Id) {
  if (st.partida) return;
  const buscar = (id) => st.personajes.find((p) => p.id === id);
  const personajes = [buscar(p1Id), buscar(p2Id)];
  if (personajes.some((p) => !p)) {
    avisar('Uno de los personajes ya no está disponible. Elige otro.');
    return irASeleccion();
  }
  st.partida = 'cargando';
  st.miListo = false;
  st.rivalListo = false;
  const caras = await Promise.all(personajes.map((p) => cargarImagen(urlFoto(p))));
  $('fin-combate').classList.add('oculto');
  mostrar('pelea');
  const canvas = $('lienzo');
  st.entradaRival = ENTRADA_VACIA;

  if (st.modo === 'practica') {
    st.teclado = new Teclado();
    const cpu = new Cpu(1);
    let entradaCpu = ENTRADA_VACIA;
    st.partida = new PartidaSimulada({
      canvas, personajes, caras,
      antesDePaso: (pelea) => (entradaCpu = cpu.decidir(pelea)),
      entradas: () => [(st.teclado?.leer() ?? ENTRADA_VACIA), entradaCpu],
      alTerminar: (g) => finDeCombate(g === 0),
    });
  } else if (st.soyAnfitrion) {
    st.teclado = new Teclado();
    st.partida = new PartidaSimulada({
      canvas, personajes, caras,
      entradas: () => [(st.teclado?.leer() ?? ENTRADA_VACIA), st.entradaRival],
      alInstantanea: (s) => st.sala?.enviar('st', { s }),
      alTerminar: (g) => finDeCombate(g === 0),
    });
  } else {
    // Invitado: envía sus teclas al anfitrión cuando cambian y, por seguridad, cada 250 ms.
    st.teclado = new Teclado({ alCambiar: (e) => st.sala?.enviar('in', { e }) });
    st.latido = setInterval(() => st.sala?.enviar('in', { e: (st.teclado?.leer() ?? ENTRADA_VACIA) }), 250);
    st.partida = new PartidaRemota({ canvas, personajes, caras, alTerminar: (g) => finDeCombate(g === 1) });
  }
  st.quitarTactil = controlesTactiles($('tactil'), st.teclado);
}

function finDeCombate(gane) {
  $('fin-texto').textContent = gane ? '¡Ganaste el combate! 🏆' : 'Perdiste el combate';
  $('btn-revancha').textContent = st.modo === 'practica' ? 'Otra vez' : 'Revancha';
  $('fin-combate').classList.remove('oculto');
  st.quitarTactil?.();
  st.quitarTactil = null;
  st.teclado?.destruir();
  st.teclado = null;
  clearInterval(st.latido);
}

function terminarPartida() {
  if (st.partida && st.partida !== 'cargando') st.partida.detener();
  st.partida = null;
  st.teclado?.destruir();
  st.teclado = null;
  clearInterval(st.latido);
  st.quitarTactil?.();
  st.quitarTactil = null;
}

$('btn-revancha').onclick = () => {
  st.sala?.enviar('volver');
  irASeleccion();
};

async function salirDePelea() {
  if (st.modo === 'practica') {
    terminarPartida();
    return irASeleccion();
  }
  await salirDeSala();
  await entrarLobby();
}
$('btn-salir-pelea').onclick = salirDePelea;
$('btn-abandonar').onclick = async () => {
  if (await preguntar('¿Seguro que quieres abandonar la pelea?', { si: 'Abandonar', no: 'Seguir' })) salirDePelea();
};

window.addEventListener('beforeunload', () => {
  st.sala?.salir();
  st.lobby?.salir();
});
