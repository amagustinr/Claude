import { useState } from 'react'
import { supabase, verificar } from '../supabase.js'
import { useSesion } from '../sesion.jsx'
import { Alerta, Cargando, useCarga } from '../componentes/Comunes.jsx'
import { fechaHora } from '../util.js'

const NUEVO = { usuario: '', nombre_completo: '', rol: 'vendedor', clave: '' }

/** Llama a la función de Cloudflare /api/usuarios con el token de la sesión. */
async function llamarApi(cuerpo) {
  const { data } = await supabase.auth.getSession()
  const r = await fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
    body: JSON.stringify(cuerpo),
  })
  const res = await r.json().catch(() => ({ error: `Error ${r.status}. ¿Está publicada la función /api/usuarios?` }))
  if (!r.ok) throw new Error(res.error || `Error ${r.status}`)
  return res
}

export default function Usuarios() {
  const { perfil: yo } = useSesion()
  const [nuevo, setNuevo] = useState(null)
  const [editando, setEditando] = useState(null)
  const [msg, setMsg] = useState({ tipo: '', texto: '' })
  const { datos, error, cargando, recargar } = useCarga(
    async () => verificar(await supabase.from('perfil').select('*').order('usuario')), [])

  const ok = (texto) => { setMsg({ tipo: 'success', texto }); recargar() }
  const falla = (e) => setMsg({ tipo: 'danger', texto: e.message })

  async function crear(e) {
    e.preventDefault()
    try { await llamarApi({ accion: 'crear', ...nuevo }); setNuevo(null); ok('Usuario creado.') } catch (er) { falla(er) }
  }

  async function guardar(e) {
    e.preventDefault()
    try {
      const { id, nombre_completo, rol, activo } = editando
      verificar(await supabase.from('perfil').update({ nombre_completo, rol, activo }).eq('id', id))
      setEditando(null); ok('Usuario actualizado.')
    } catch (er) { falla(er) }
  }

  async function restablecerClave(u) {
    const clave = prompt(`Nueva clave para ${u.usuario} (mínimo 8 caracteres)`)
    if (!clave) return
    try { await llamarApi({ accion: 'clave', id: u.id, clave }); ok(`Clave de ${u.usuario} cambiada.`) } catch (er) { falla(er) }
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center">
        <h3>Usuarios</h3>
        <button className="btn btn-primary" onClick={() => { setNuevo(NUEVO); setEditando(null) }}><i className="bi bi-person-plus" /> Nuevo usuario</button>
      </div>
      <Alerta>{error}</Alerta>
      <Alerta tipo={msg.tipo} onCerrar={() => setMsg({})}>{msg.texto}</Alerta>

      {nuevo && (
        <form className="card p-3 mb-3" onSubmit={crear} style={{ maxWidth: 820 }}>
          <h6>Nuevo usuario</h6>
          <div className="row g-2">
            <div className="col-md-3"><input className="form-control" placeholder="usuario" required value={nuevo.usuario} onChange={(e) => setNuevo({ ...nuevo, usuario: e.target.value })} /></div>
            <div className="col-md-4"><input className="form-control" placeholder="Nombre completo" required value={nuevo.nombre_completo} onChange={(e) => setNuevo({ ...nuevo, nombre_completo: e.target.value })} /></div>
            <div className="col-md-2">
              <select className="form-select" value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>
                <option value="vendedor">Vendedor</option><option value="administrador">Administrador</option>
              </select>
            </div>
            <div className="col-md-3"><input type="password" className="form-control" placeholder="Clave (mín. 8)" required minLength={8} autoComplete="new-password" value={nuevo.clave} onChange={(e) => setNuevo({ ...nuevo, clave: e.target.value })} /></div>
          </div>
          <div className="mt-2 d-flex gap-2">
            <button className="btn btn-primary btn-sm">Crear</button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setNuevo(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {cargando ? <Cargando /> : (
        <div className="card">
          <table className="table table-sm mb-0">
            <thead className="table-light"><tr><th>Usuario</th><th>Nombre</th><th>Perfil</th><th>Estado</th><th>Creado</th><th /></tr></thead>
            <tbody>
              {datos.map((u) => editando?.id === u.id ? (
                <tr key={u.id}>
                  <td>{u.usuario}</td>
                  <td><input className="form-control form-control-sm" value={editando.nombre_completo} onChange={(e) => setEditando({ ...editando, nombre_completo: e.target.value })} /></td>
                  <td>
                    <select className="form-select form-select-sm" value={editando.rol} onChange={(e) => setEditando({ ...editando, rol: e.target.value })}>
                      <option value="vendedor">Vendedor</option><option value="administrador">Administrador</option>
                    </select>
                  </td>
                  <td>
                    <div className="form-check form-switch">
                      <input className="form-check-input" type="checkbox" checked={editando.activo} onChange={(e) => setEditando({ ...editando, activo: e.target.checked })} />
                    </div>
                  </td>
                  <td />
                  <td className="text-end text-nowrap">
                    <button className="btn btn-sm btn-primary me-1" onClick={guardar}>Guardar</button>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditando(null)}>Cancelar</button>
                  </td>
                </tr>
              ) : (
                <tr key={u.id} className={u.activo ? '' : 'text-muted'}>
                  <td>{u.usuario} {u.id === yo.id && <span className="badge bg-info">Usted</span>}</td>
                  <td>{u.nombre_completo}</td>
                  <td>{u.rol === 'administrador' ? 'Administrador' : 'Vendedor'}</td>
                  <td>{u.activo ? 'Activo' : <span className="badge bg-secondary">Inactivo</span>}</td>
                  <td>{fechaHora(u.creado_en)}</td>
                  <td className="text-end text-nowrap">
                    <button className="btn btn-sm btn-outline-primary me-1" onClick={() => { setEditando(u); setNuevo(null) }}>Editar</button>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => restablecerClave(u)}>Cambiar clave</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="form-text mt-2">Al desactivar un usuario o cambiarle el perfil, el cambio se aplica en su siguiente acción.</div>
    </>
  )
}
