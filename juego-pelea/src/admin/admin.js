// Panel de administración de personajes (solo usuarios registrados en la tabla public.admins).

import { supabase, configurado, urlFoto, BUCKET_CARAS } from '../supabase.js';
import { derivarStats } from '../game/stats.js';
import { dibujarLuchador, TRAJES, PEINADOS, TONOS_PIEL } from '../game/cuerpo.js';
import { poseDe } from '../game/poses.js';
import { totalFramesAtaque } from '../game/engine.js';

const $ = (id) => document.getElementById(id);
const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LADO_FOTO = 256; // px: las caras se guardan como cuadrados de 256x256

const st = {
  personajes: [],
  editando: null, // personaje que se edita, o null si es nuevo
  nuevaFoto: null, // Blob listo para subir
  imagenPrevia: null, // HTMLImageElement para la vista previa del luchador
};

function mostrar(vista) {
  document.querySelectorAll('.pantalla').forEach((p) => p.classList.toggle('activa', p.id === `vista-${vista}`));
}

// ---------------------------------------------------------------- sesión
async function iniciar() {
  if (!configurado) {
    $('login-error').textContent = 'Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.';
    return;
  }
  const { data } = await supabase.auth.getSession();
  if (data.session) await entrarPanel(data.session.user);
}

async function entrarPanel(usuario) {
  const { data, error } = await supabase.from('admins').select('user_id').eq('user_id', usuario.id).maybeSingle();
  if (error || !data) {
    await supabase.auth.signOut();
    $('login-error').textContent = error ? `Error al validar el acceso: ${error.message}` : 'Este usuario no tiene permisos de administrador.';
    mostrar('login');
    return;
  }
  $('admin-usuario').textContent = usuario.email;
  mostrar('panel');
  limpiarFormulario();
  await cargarLista();
}

$('form-login').onsubmit = async (ev) => {
  ev.preventDefault();
  $('login-error').textContent = '';
  const { data, error } = await supabase.auth.signInWithPassword({
    email: $('email').value.trim(),
    password: $('clave').value,
  });
  if (error) {
    $('login-error').textContent = error.message === 'Invalid login credentials' ? 'Usuario o contraseña incorrectos.' : error.message;
    return;
  }
  $('clave').value = '';
  await entrarPanel(data.user);
};

$('btn-salir').onclick = async () => {
  await supabase.auth.signOut();
  mostrar('login');
};

// ---------------------------------------------------------------- listado
async function cargarLista() {
  const { data, error } = await supabase.from('personajes').select('*').order('nombre');
  if (error) {
    mensaje(`No se pudo cargar la lista: ${error.message}`, true);
    return;
  }
  st.personajes = data;
  pintarTabla();
}

function pintarTabla() {
  const tbody = $('tabla-personajes');
  tbody.innerHTML = '';
  if (!st.personajes.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="nota">Aún no hay personajes. Crea el primero con el formulario.</td></tr>';
    return;
  }
  for (const p of st.personajes) {
    const tr = document.createElement('tr');
    const foto = urlFoto(p);
    tr.innerHTML = `
      <td>${foto ? `<img src="${foto}" alt="" />` : '<img alt="" />'}</td>
      <td><b>${escapar(p.nombre)}</b></td>
      <td class="nota">${p.sexo === 'F' ? 'Mujer' : 'Hombre'} · ${p.altura_cm} cm · ${p.peso_kg} kg · ${escapar(p.complexion)}<br />${escapar(TRAJES[p.traje]?.split(' (')[0] ?? 'Karate')}</td>
      <td>${p.fuerza} / ${p.agilidad} / ${p.resistencia}</td>
      <td><label class="switch"><input type="checkbox" ${p.disponible ? 'checked' : ''} /> ${p.disponible ? 'Sí' : 'No'}</label></td>
      <td><div class="acciones-fila"><button data-a="editar">Editar</button><button data-a="borrar" class="peligro">Eliminar</button></div></td>`;
    tr.querySelector('input[type=checkbox]').onchange = (ev) => cambiarDisponible(p, ev.target.checked);
    tr.querySelector('[data-a=editar]').onclick = () => editar(p);
    tr.querySelector('[data-a=borrar]').onclick = () => borrar(p);
    tbody.append(tr);
  }
}

async function cambiarDisponible(p, disponible) {
  const { error } = await supabase.from('personajes').update({ disponible }).eq('id', p.id);
  if (error) mensaje(`No se pudo actualizar: ${error.message}`, true);
  await cargarLista();
}

async function borrar(p) {
  if (!confirm(`¿Eliminar a ${p.nombre}? Esta acción no se puede deshacer.`)) return;
  const { error } = await supabase.from('personajes').delete().eq('id', p.id);
  if (error) return mensaje(`No se pudo eliminar: ${error.message}`, true);
  if (p.foto_path) await supabase.storage.from(BUCKET_CARAS).remove([p.foto_path]);
  if (st.editando?.id === p.id) limpiarFormulario();
  mensaje(`${p.nombre} eliminado.`);
  await cargarLista();
}

// ---------------------------------------------------------------- formulario
const campos = ['fuerza', 'agilidad', 'resistencia'];
for (const c of campos) {
  $(`f-${c}`).addEventListener('input', (ev) => (ev.target.nextElementSibling.value = ev.target.value));
}

// ---------------------------------------------------------------- apariencia
const COLORES_AP = ['color_ropa', 'color_detalle', 'color_pelo', 'color_piel'];
for (const [valor, texto] of Object.entries(TRAJES)) $('f-traje').append(new Option(texto, valor));
for (const [valor, texto] of Object.entries(PEINADOS)) $('f-peinado').append(new Option(texto, valor));
for (const color of TONOS_PIEL) {
  const b = document.createElement('button');
  b.type = 'button';
  b.title = 'Tono de piel';
  b.style.background = color;
  b.onclick = () => ($('f-color_piel').value = color);
  $('tonos-piel').append(b);
}
$('btn-azar').onclick = () => {
  const hsl = (h, s, l) => {
    const f = (n) => {
      const k = (n + h / 30) % 12;
      const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(c * 255).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };
  const h = Math.random() * 360;
  $('f-color_ropa').value = hsl(h, 0.7, 0.45);
  $('f-color_detalle').value = hsl((h + 150 + Math.random() * 60) % 360, 0.8, 0.55);
  $('f-color_pelo').value = hsl(Math.random() * 40, 0.5, 0.1 + Math.random() * 0.5);
};

function editar(p) {
  st.editando = p;
  st.nuevaFoto = null;
  $('form-titulo').textContent = `Editando: ${p.nombre}`;
  $('f-nombre').value = p.nombre;
  document.querySelector(`input[name=sexo][value=${p.sexo}]`).checked = true;
  $('f-altura').value = p.altura_cm;
  $('f-peso').value = p.peso_kg;
  $('f-complexion').value = p.complexion;
  for (const c of campos) {
    $(`f-${c}`).value = p[c];
    $(`f-${c}`).nextElementSibling.value = p[c];
  }
  $('f-disponible').checked = p.disponible;
  $('f-traje').value = p.traje ?? 'karate';
  $('f-peinado').value = p.peinado ?? 'corto';
  for (const c of COLORES_AP) if (p[c]) $(`f-${c}`).value = p[c];
  $('f-foto').value = '';
  ponerFotoPrevia(urlFoto(p));
  $('btn-cancelar').classList.remove('oculto');
  mensaje('');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function limpiarFormulario() {
  st.editando = null;
  st.nuevaFoto = null;
  $('form-personaje').reset();
  for (const c of campos) $(`f-${c}`).nextElementSibling.value = 50;
  $('form-titulo').textContent = 'Nuevo personaje';
  $('btn-cancelar').classList.add('oculto');
  ponerFotoPrevia(null);
}
$('btn-cancelar').onclick = () => {
  limpiarFormulario();
  mensaje('');
};

function ponerFotoPrevia(url) {
  if (!url) {
    $('f-foto-preview').removeAttribute('src');
    st.imagenPrevia = null;
    return;
  }
  $('f-foto-preview').src = url;
  const img = new Image();
  img.onload = () => (st.imagenPrevia = img);
  img.src = url;
}

$('f-foto').onchange = async (ev) => {
  const archivo = ev.target.files[0];
  if (!archivo) return;
  if (archivo.size > 10 * 1024 * 1024) {
    ev.target.value = '';
    return mensaje('La imagen pesa más de 10 MB.', true);
  }
  try {
    st.nuevaFoto = await recortarCuadrada(archivo);
    ponerFotoPrevia(URL.createObjectURL(st.nuevaFoto));
  } catch {
    mensaje('No se pudo leer la imagen.', true);
  }
};

/** Recorta al centro, reduce a 256x256 y convierte a WEBP (o PNG si el navegador no soporta WEBP). */
function recortarCuadrada(archivo) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const lado = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = c.height = LADO_FOTO;
      c.getContext('2d').drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, LADO_FOTO, LADO_FOTO);
      URL.revokeObjectURL(img.src);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/webp', 0.9);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(archivo);
  });
}

function leerFormulario() {
  return {
    nombre: $('f-nombre').value.trim(),
    sexo: document.querySelector('input[name=sexo]:checked').value,
    altura_cm: Number($('f-altura').value),
    peso_kg: Number($('f-peso').value),
    complexion: $('f-complexion').value,
    fuerza: Number($('f-fuerza').value),
    agilidad: Number($('f-agilidad').value),
    resistencia: Number($('f-resistencia').value),
    disponible: $('f-disponible').checked,
    traje: $('f-traje').value,
    peinado: $('f-peinado').value,
    ...Object.fromEntries(COLORES_AP.map((c) => [c, $(`f-${c}`).value])),
  };
}

$('form-personaje').onsubmit = async (ev) => {
  ev.preventDefault();
  const datos = leerFormulario();
  const btn = $('btn-guardar');
  btn.disabled = true;
  mensaje('Guardando…');
  const id = st.editando?.id ?? crypto.randomUUID();
  const fotoAnterior = st.editando?.foto_path ?? null;
  let fotoSubida = null;
  try {
    if (st.nuevaFoto) {
      const ext = st.nuevaFoto.type === 'image/webp' ? 'webp' : 'png';
      fotoSubida = `${id}/cara-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET_CARAS)
        .upload(fotoSubida, st.nuevaFoto, { contentType: st.nuevaFoto.type, cacheControl: '31536000' });
      if (error) throw new Error(`Error al subir la foto: ${error.message}`);
      datos.foto_path = fotoSubida;
    }

    const { error } = st.editando
      ? await supabase.from('personajes').update(datos).eq('id', id)
      : await supabase.from('personajes').insert({ id, ...datos });
    if (error) {
      if (fotoSubida) await supabase.storage.from(BUCKET_CARAS).remove([fotoSubida]);
      throw new Error(error.code === '23505' ? 'Ya existe un personaje con ese nombre.' : error.message);
    }
    if (fotoSubida && fotoAnterior) await supabase.storage.from(BUCKET_CARAS).remove([fotoAnterior]);

    mensaje(`${datos.nombre} guardado.`);
    limpiarFormulario();
    await cargarLista();
  } catch (err) {
    mensaje(err.message, true);
  } finally {
    btn.disabled = false;
  }
};

function mensaje(texto, esError = false) {
  const p = $('form-msg');
  p.textContent = texto;
  p.className = esError ? 'error' : 'nota';
}

// ---------------------------------------------------------------- vista previa animada
const lienzo = $('vista-previa');
const ctx = lienzo.getContext('2d');
const POSES_PREVIA = ['quieto', 'golpe-pie', 'quieto', 'patada-pie', 'agachado', 'patada-agachado'];
let frame = 0;
function dibujarPrevia() {
  frame++;
  const datos = leerFormulario();
  const stats = derivarStats(datos);
  const k = 1.15;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, lienzo.width, lienzo.height);
  ctx.fillStyle = '#0005';
  ctx.beginPath();
  ctx.ellipse(lienzo.width / 2, 305, 50 * stats.escala * stats.grosor, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  // Cambia de pose cada 1,5 s para ver el traje en movimiento
  const nombre = POSES_PREVIA[Math.floor(frame / 90) % POSES_PREVIA.length];
  const f = { x: lienzo.width / 2 / k - 12, alt: 0, lado: 1, estado: nombre, ef: frame };
  if (nombre.includes('-')) {
    f.estado = 'ataque';
    f.ataque = { tipo: nombre };
    f.ef = totalFramesAtaque(stats, nombre).arranque + 1;
  }
  dibujarLuchador(ctx, f, poseDe(f, stats), stats, st.imagenPrevia, 305 / k);
  requestAnimationFrame(dibujarPrevia);
}
requestAnimationFrame(dibujarPrevia);

iniciar();
