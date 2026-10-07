/**
 * Cloudflare Pages Function: POST /api/usuarios
 *
 * Crear usuarios y cambiarles la clave requiere la llave secreta de Supabase (service_role),
 * que NUNCA debe llegar al navegador. Por eso estas dos operaciones pasan por esta función,
 * que corre en el servidor de Cloudflare (similar a un controlador de ASP.NET con [Authorize]).
 *
 * Variables de entorno (Cloudflare Pages > Settings > Variables and Secrets):
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_DOMINIO_USUARIOS
 *   SUPABASE_SERVICE_ROLE_KEY   (tipo "Secret")
 *
 * Cuerpo:
 *   { "accion": "crear", "usuario": "juan", "nombre_completo": "Juan Pérez", "rol": "vendedor", "clave": "..." }
 *   { "accion": "clave", "id": "<uuid del usuario>", "clave": "..." }
 */
const json = (cuerpo, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

export async function onRequestPost({ request, env }) {
  const url = env.VITE_SUPABASE_URL
  const anon = env.VITE_SUPABASE_ANON_KEY
  const secreta = env.SUPABASE_SERVICE_ROLE_KEY
  const dominio = env.VITE_DOMINIO_USUARIOS || 'botilleria.local'
  if (!url || !anon || !secreta) return json({ error: 'Faltan variables de entorno en Cloudflare Pages.' }, 500)

  // 1) ¿Quién llama es administrador activo? Se pregunta a la base con SU token (respeta RLS).
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Sesión no válida.' }, 401)
  const r = await fetch(`${url}/rest/v1/rpc/es_admin`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!r.ok || (await r.json()) !== true) return json({ error: 'Solo el administrador puede administrar usuarios.' }, 403)

  let datos
  try { datos = await request.json() } catch { return json({ error: 'Solicitud no válida.' }, 400) }

  const admin = { apikey: secreta, Authorization: `Bearer ${secreta}`, 'Content-Type': 'application/json' }
  const clave = String(datos.clave || '')
  if (clave.length < 8) return json({ error: 'La clave debe tener al menos 8 caracteres.' }, 400)

  if (datos.accion === 'crear') {
    const usuario = String(datos.usuario || '').trim().toLowerCase()
    const nombre = String(datos.nombre_completo || '').trim()
    const rol = datos.rol === 'administrador' ? 'administrador' : 'vendedor'
    if (!/^[a-z0-9._-]{3,50}$/.test(usuario)) {
      return json({ error: 'El usuario debe tener entre 3 y 50 caracteres: letras minúsculas, números, punto, guion.' }, 400)
    }
    if (!nombre) return json({ error: 'Indique el nombre completo.' }, 400)

    // 2) Crea el usuario en Supabase Auth (el trigger de la base crea su perfil inactivo)
    const c = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({
        email: `${usuario}@${dominio}`,
        password: clave,
        email_confirm: true,
        user_metadata: { usuario, nombre_completo: nombre },
      }),
    })
    const creado = await c.json()
    if (!c.ok) {
      const yaExiste = /already|registered|exists/i.test(creado.msg || creado.message || '')
      return json({ error: yaExiste ? 'El nombre de usuario ya existe.' : (creado.msg || creado.message || 'No se pudo crear el usuario.') }, 400)
    }

    // 3) Asigna el rol y lo activa (la llave secreta salta el RLS)
    const p = await fetch(`${url}/rest/v1/perfil?id=eq.${creado.id}`, {
      method: 'PATCH',
      headers: { ...admin, Prefer: 'return=minimal' },
      body: JSON.stringify({ nombre_completo: nombre, rol, activo: true }),
    })
    if (!p.ok) return json({ error: 'El usuario se creó, pero no se pudo asignar su rol: ' + (await p.text()) }, 500)
    return json({ id: creado.id })
  }

  if (datos.accion === 'clave') {
    if (!/^[0-9a-f-]{36}$/i.test(String(datos.id || ''))) return json({ error: 'Usuario no válido.' }, 400)
    const u = await fetch(`${url}/auth/v1/admin/users/${datos.id}`, {
      method: 'PUT',
      headers: admin,
      body: JSON.stringify({ password: clave }),
    })
    if (!u.ok) {
      const e = await u.json().catch(() => ({}))
      return json({ error: e.msg || e.message || 'No se pudo cambiar la clave.' }, 400)
    }
    return json({ ok: true })
  }

  return json({ error: 'Acción no válida.' }, 400)
}
