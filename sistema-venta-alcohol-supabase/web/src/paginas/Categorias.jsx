import { useState } from 'react'
import { supabase, verificar } from '../supabase.js'
import { Alerta, Cargando, useCarga } from '../componentes/Comunes.jsx'

export default function Categorias() {
  const [nueva, setNueva] = useState('')
  const [error, setError] = useState('')
  const { datos, error: errorCarga, cargando, recargar } = useCarga(
    async () => verificar(await supabase.from('categoria').select('*').order('nombre')), [])

  async function ejecutar(promesa) {
    try { verificar(await promesa); setError(''); recargar(); return true } catch (e) {
      setError(e.message.includes('duplicate') ? 'Ya existe una categoría con ese nombre.' : e.message)
      return false
    }
  }

  async function agregar(e) {
    e.preventDefault()
    if (await ejecutar(supabase.from('categoria').insert({ nombre: nueva.trim() }))) setNueva('')
  }

  const renombrar = (c) => {
    const nombre = prompt('Nuevo nombre de la categoría', c.nombre)
    if (nombre && nombre.trim() !== c.nombre) ejecutar(supabase.from('categoria').update({ nombre: nombre.trim() }).eq('id', c.id))
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h3>Categorías</h3>
      <Alerta onCerrar={() => setError('')}>{error || errorCarga}</Alerta>
      <form className="d-flex gap-2 mb-3" onSubmit={agregar}>
        <input className="form-control" placeholder="Nueva categoría" maxLength={60} required value={nueva} onChange={(e) => setNueva(e.target.value)} />
        <button className="btn btn-primary text-nowrap"><i className="bi bi-plus-lg" /> Agregar</button>
      </form>
      {cargando ? <Cargando /> : (
        <ul className="list-group">
          {datos.map((c) => (
            <li key={c.id} className="list-group-item d-flex justify-content-between align-items-center">
              <span className={c.activo ? '' : 'text-muted text-decoration-line-through'}>{c.nombre}</span>
              <span className="d-flex gap-1">
                <button className="btn btn-sm btn-outline-primary" onClick={() => renombrar(c)}>Renombrar</button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => ejecutar(supabase.from('categoria').update({ activo: !c.activo }).eq('id', c.id))}>
                  {c.activo ? 'Desactivar' : 'Activar'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
