// Visor de cámaras: equivalente web de CamarasDahuaAxis.cs
//  - Grilla (2x2 para 4 cámaras) con el nombre centrado arriba
//  - Reconexión automática (el WinForms verificaba cada 5 s)
//  - F5 = recargar cámaras. Cada 5 min revisa si cambió la lista en la BD (sin cortar el video)
//  - Doble clic en una cámara = verla sola en calidad PRINCIPAL (HD); Esc/doble clic = volver a la grilla
//    (la grilla usa el substream: menos ancho de banda desde las sucursales)

const INTERVALO_VERIFICAR = 5_000;        // igual que camaraTimer
const INTERVALO_REVISAR_CAMBIOS = 300_000; // cada 5 min: ¿cambió la lista de cámaras en la BD?
const MINUTOS_MAX_AMPLIADA = 5;           // la vista ampliada (HD) vuelve sola a la grilla
const SEGUNDOS_SIN_IMAGEN = 20;           // si el video no avanza en este tiempo -> reconectar

const params = new URLSearchParams(location.search);
const monitor = parseInt(params.get('monitor') || '', 10);
if (!monitor) location.replace('/');

const $ = id => document.getElementById(id);
const grilla = $('grilla');
/** @type {{cam:any, celda:HTMLElement, player:any, ultimoTiempo:number, ultimoAvance:number, modo:string, hd:boolean}[]} */
let celdas = [];
let listaActual = '';      // JSON de la última lista de cámaras, para detectar cambios
let tSolo = 0;

document.title = `Cámaras - Monitor ${monitor}`;
$('etqMonitor').textContent = `Monitor ${monitor}`;

// ---------------- Reproductor (basado en video-rtc.js de go2rtc) ----------------
async function cargarReproductor() {
  if (customElements.get('camara-stream')) return;
  const { VideoRTC } = await import('/go2rtc/video-rtc.js');

  class CamaraStream extends VideoRTC {
    constructor() {
      super();
      this.mode = 'webrtc,mse,hls,mjpeg';
      this.media = 'video';           // sin audio, como ":no-audio" en VLC
      this.background = true;         // seguir reproduciendo aunque la pestaña no esté visible
      this.pcConfig = { ...this.pcConfig, iceServers: [] };  // red local: sin STUN externos
    }
    oninit() {
      super.oninit();
      this.video.controls = false;
      this.video.muted = true;
    }
    onconnect() {
      const r = super.onconnect();
      if (r) this.emitir('conectando');
      return r;
    }
    onopen() {
      const r = super.onopen();
      this.onmessage['ui'] = msg => {
        if (msg.type === 'error') this.emitir('error', msg.value);
        else if (['mse', 'hls', 'mp4', 'mjpeg'].includes(msg.type)) this.emitir('modo', msg.type.toUpperCase());
      };
      return r;
    }
    onpcvideo(ev) {
      super.onpcvideo(ev);
      if (this.pcState !== WebSocket.CLOSED) this.emitir('modo', 'WebRTC');
    }
    onclose() {
      this.emitir('desconectado');
      return super.onclose();
    }
    emitir(tipo, valor) {
      this.dispatchEvent(new CustomEvent('camara', { detail: { tipo, valor } }));
    }
  }
  customElements.define('camara-stream', CamaraStream);
}

// ---------------- Grilla ----------------
function columnasPara(n) {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

function construirGrilla(camaras) {
  destruirReproductores();
  grilla.innerHTML = '';
  const cols = columnasPara(camaras.length);
  const filas = Math.max(1, Math.ceil(camaras.length / cols));
  grilla.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grilla.style.gridTemplateRows = `repeat(${filas}, 1fr)`;

  celdas = camaras.map(cam => {
    const celda = document.createElement('div');
    celda.className = 'celda';
    celda.innerHTML = `<div class="estado">Conectando…</div><div class="nombre"></div><div class="modo"></div>`;
    celda.querySelector('.nombre').textContent = cam.nombre;
    celda.addEventListener('dblclick', () => alternarSolo(celda));
    grilla.appendChild(celda);
    const c = { cam, celda, player: null, ultimoTiempo: -1, ultimoAvance: Date.now(), modo: '', hd: false };
    crearReproductor(c);
    return c;
  });

  if (!camaras.length) {
    grilla.innerHTML = '';
    mostrarAviso('Sin cámaras', `No hay cámaras registradas para el monitor ${monitor}.`);
  }
}

function crearReproductor(c) {
  if (c.player) { try { c.player.ondisconnect(); } catch { } c.player.remove(); }
  const el = document.createElement('camara-stream');
  el.addEventListener('camara', e => {
    const { tipo, valor } = e.detail;
    if (tipo === 'conectando') estadoCelda(c, 'Conectando…');
    // Un modo puede fallar (p. ej. WebRTC con H.265) mientras otro (MSE) sí reproduce
    if (tipo === 'error' && !(el.video?.readyState >= 2)) estadoCelda(c, `Sin señal<br><small>${escapar(valor)}</small>`);
    if (tipo === 'modo') { c.modo = valor; c.celda.querySelector('.modo').textContent = valor; }
  });
  const stream = c.hd && c.cam.streamHd ? c.cam.streamHd : c.cam.stream;
  el.src = `/go2rtc/api/ws?src=${encodeURIComponent(stream)}`;
  c.celda.classList.toggle('hd', c.hd && stream !== c.cam.stream);
  c.celda.prepend(el);
  c.player = el;
  c.ultimoTiempo = -1;
  c.ultimoAvance = Date.now();
}

function destruirReproductores() {
  for (const c of celdas) {
    try { c.player?.ondisconnect(); } catch { }
    c.player?.remove();
  }
  celdas = [];
}

function estadoCelda(c, html) {
  const e = c.celda.querySelector('.estado');
  if (html) { e.innerHTML = `<div>${html}</div>`; e.classList.remove('oculto'); }
  else e.classList.add('oculto');
}

function escapar(s) {
  return String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

// ---------------- Verificación (equivale a VerificarCamara) ----------------
function verificar() {
  const ahora = Date.now();
  for (const c of celdas) {
    const v = c.player?.video;
    if (!v) continue;
    if (c.modo === 'MJPEG') { estadoCelda(c, null); continue; }  // MJPEG no usa <video>

    if (v.currentTime !== c.ultimoTiempo && v.readyState >= 2) {
      c.ultimoTiempo = v.currentTime;
      c.ultimoAvance = ahora;
      estadoCelda(c, null);
    } else if (ahora - c.ultimoAvance > SEGUNDOS_SIN_IMAGEN * 1000) {
      console.warn(`Cámara "${c.cam.nombre}" sin imagen, reconectando…`);
      estadoCelda(c, 'Reconectando…');
      crearReproductor(c);
    } else if (ahora - c.ultimoAvance > 8000) {
      estadoCelda(c, 'Sin señal…');
    }
  }
}

// ---------------- Carga / recarga (equivale a InicializarCamaras / RecargarCamaras) ----------------
let recargando = false;
async function cargar(forzar = false) {
  if (recargando) return;
  recargando = true;
  try {
    ocultarAviso();
    await cargarReproductor();
    const r = await fetch(`/api/monitor/${monitor}/camaras${forzar ? '?recargar=true' : ''}`);
    if (!r.ok) {
      const p = await r.json().catch(() => ({}));
      throw new Error(p.detail || p.error || `Error ${r.status}`);
    }
    const lista = await r.json();
    listaActual = JSON.stringify(lista);
    grilla.classList.remove('solo');
    construirGrilla(lista);
  } catch (err) {
    console.error(err);
    mostrarAviso('No se pudieron cargar las cámaras', err.message +
      '. Se reintentará automáticamente en 15 segundos.');
    setTimeout(() => { if (!celdas.length) cargar(); }, 15_000);
  } finally {
    recargando = false;
  }
}

function mostrarAviso(titulo, texto) {
  $('avisoTitulo').textContent = titulo;
  $('avisoTexto').textContent = texto;
  $('aviso').hidden = false;
}
function ocultarAviso() { $('aviso').hidden = true; }

// ---------------- UI ----------------
function alternarSolo(celda) {
  const yaSolo = !celda || (grilla.classList.contains('solo') && celda.classList.contains('activa'));
  grilla.classList.toggle('solo', !yaSolo);
  clearTimeout(tSolo);
  for (const c of celdas) {
    const activa = !yaSolo && c.celda === celda;
    c.celda.classList.toggle('activa', activa);
    // Ampliada = stream principal (HD); al volver, de nuevo el substream
    if (c.hd !== activa) { c.hd = activa; crearReproductor(c); }
  }
  if (!yaSolo) tSolo = setTimeout(() => alternarSolo(null), MINUTOS_MAX_AMPLIADA * 60_000);
}

// Revisa si cambió la lista de cámaras (alta/baja/cambio en la BD) sin cortar los videos que siguen igual
async function revisarCambios() {
  if (recargando) return;
  try {
    const r = await fetch(`/api/monitor/${monitor}/camaras`);
    if (!r.ok) return;
    const lista = await r.json();
    const json = JSON.stringify(lista);
    if (json !== listaActual) {
      console.info('La lista de cámaras cambió: reconstruyendo la grilla');
      listaActual = json;
      grilla.classList.remove('solo');
      construirGrilla(lista);
    }
  } catch { /* servidor caído: los videos reintentan solos */ }
}

function pantallaCompleta() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => { });
}

function alternarAjuste() {
  grilla.classList.toggle('estirar');
  try { localStorage.setItem('camaras.estirar', grilla.classList.contains('estirar') ? '1' : ''); } catch { }
}
try { if (localStorage.getItem('camaras.estirar')) grilla.classList.add('estirar'); } catch { }

let tBarra = 0;
function mostrarBarra() {
  $('barra').classList.add('visible');
  document.body.style.cursor = '';
  clearTimeout(tBarra);
  tBarra = setTimeout(() => { $('barra').classList.remove('visible'); document.body.style.cursor = 'none'; }, 3000);
}
document.addEventListener('mousemove', mostrarBarra);

$('btnRecargar').onclick = () => cargar(true);
$('btnPantalla').onclick = pantallaCompleta;
$('btnAjuste').onclick = alternarAjuste;
$('btnMonitor').onclick = () => { location.href = '/'; };
$('avisoReintentar').onclick = () => cargar(true);

document.addEventListener('keydown', e => {
  if (e.key === 'F5' && !e.ctrlKey) { e.preventDefault(); cargar(true); }       // F5 = RecargarCamaras
  else if (e.key === 'f' || e.key === 'F') pantallaCompleta();
  else if (e.key === 'a' || e.key === 'A') alternarAjuste();
  else if (e.key === 'Escape' && grilla.classList.contains('solo')) alternarSolo(null);
});

setInterval(verificar, INTERVALO_VERIFICAR);
setInterval(revisarCambios, INTERVALO_REVISAR_CAMBIOS);
window.addEventListener('beforeunload', destruirReproductores);

mostrarBarra();
cargar();
