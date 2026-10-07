// Equivalente web de RegistrarDahuaAxis.cs
const $ = id => document.getElementById(id);
const campos = ['nombreSucursal', 'descripcion', 'usuario', 'contrasena', 'ip', 'monitor', 'posicion', 'webcam'];
let idActual = null;
let colId = 'id', colNombre = 'Sucursal';

function toast(msg, tipo = 'ok') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast visible ${tipo}`;
  clearTimeout(toast.tid);
  toast.tid = setTimeout(() => t.classList.remove('visible'), 3500);
}

async function api(url, opciones) {
  const r = await fetch(url, opciones);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || data.detail || `Error ${r.status}`);
  return data;
}

// ---- CargarSucursales ----
async function cargarSucursales() {
  try {
    const t = await api('/api/sucursales');
    colId = t.columnas.find(c => c.toLowerCase() === 'id') ?? t.columnas[0];
    colNombre = t.columnas.find(c => c.toLowerCase() === 'sucursal')
             ?? t.columnas.find(c => c.toLowerCase().includes('sucursal')) ?? t.columnas[1];

    const cmb = $('cmbSucursales');
    cmb.innerHTML = '<option value="">— Seleccionar sucursal —</option>';
    for (const f of t.filas) cmb.add(new Option(`${f[colNombre] ?? ''}`, f[colId]));

    $('tabla').querySelector('thead').innerHTML =
      '<tr>' + t.columnas.map(c => `<th>${esc(c)}</th>`).join('') + '</tr>';
    const tbody = $('tabla').querySelector('tbody');
    tbody.innerHTML = '';
    for (const f of t.filas) {
      const tr = document.createElement('tr');
      tr.dataset.id = f[colId];
      tr.innerHTML = t.columnas.map(c => `<td>${esc(f[c])}</td>`).join('');
      tr.onclick = () => seleccionar(f[colId]);
      tbody.appendChild(tr);
    }
    marcarFila();
  } catch (e) {
    toast('Error al cargar sucursales: ' + e.message, 'error');
  }
}

// ---- cmbSucursales_SelectionChangeCommitted ----
async function seleccionar(id) {
  if (!id) return;
  try {
    const c = await api(`/api/sucursales/${id}`);
    idActual = c.id;
    for (const k of campos) $(k).value = c[k] ?? '';
    $('activar').checked = !!c.activar;
    const tipo = $('tipoCam');
    if (![...tipo.options].some(o => o.value == c.tipoCam)) tipo.add(new Option(`${c.tipoCam}`, c.tipoCam));
    tipo.value = c.tipoCam;
    $('contrasena').value = '';
    $('ayudaPass').textContent = c.tieneContrasena ? 'Déjala vacía para conservar la actual.' : '';
    $('lblId').textContent = `Editando ID ${c.id}`;
    $('cmbSucursales').value = c.id;
    marcarFila();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

function marcarFila() {
  document.querySelectorAll('#tabla tbody tr').forEach(tr => tr.classList.toggle('sel', tr.dataset.id == idActual));
}

// ---- Limpiar_campos ----
function limpiar() {
  idActual = null;
  for (const k of campos) $(k).value = '';
  $('activar').checked = false;
  $('tipoCam').value = '2';
  $('ayudaPass').textContent = '';
  $('lblId').textContent = 'Nuevo registro';
  $('cmbSucursales').value = '';
  marcarFila();
  $('nombreSucursal').focus();
}

// ---- btnGuardar_Click ----
async function guardar(e) {
  e.preventDefault();
  const body = {
    nombreSucursal: $('nombreSucursal').value.trim(),
    descripcion: $('descripcion').value.trim(),
    usuario: $('usuario').value.trim(),
    contrasena: $('contrasena').value,
    ip: $('ip').value.trim(),
    activar: $('activar').checked,
    monitor: parseInt($('monitor').value, 10) || 0,
    posicion: parseInt($('posicion').value, 10) || 0,
    webcam: $('webcam').value.trim(),
    tipoCam: parseInt($('tipoCam').value, 10) || 0,
  };
  $('btnGuardar').disabled = true;
  try {
    const nuevo = idActual == null;
    await api(nuevo ? '/api/sucursales' : `/api/sucursales/${idActual}`, {
      method: nuevo ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    toast(nuevo ? 'Cámara registrada.' : 'Cámara actualizada.');
    await cargarSucursales();
    limpiar();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    $('btnGuardar').disabled = false;
  }
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

$('frm').addEventListener('submit', guardar);
$('btnNuevo').onclick = limpiar;
$('btnRefrescar').onclick = cargarSucursales;
$('cmbSucursales').onchange = e => e.target.value ? seleccionar(e.target.value) : limpiar();

limpiar();
cargarSucursales();
