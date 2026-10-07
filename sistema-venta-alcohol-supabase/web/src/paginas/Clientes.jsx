import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, verificar } from '../supabase.js'
import { Alerta, Cargando, useCarga } from '../componentes/Comunes.jsx'
import { formatearRut } from '../util.js'

export default function Clientes() {
  const [buscar, setBuscar] = useState('')
  const { datos, error, cargando } = useCarga(async () => verificar(await supabase.from('cliente').select('*').order('razon_social')), [])

  const t = buscar.trim().toLowerCase()
  const tRut = t.replace(/[^0-9k]/g, '')
  const lista = (datos || []).filter((c) => !t || c.razon_social.toLowerCase().includes(t)
    || (tRut && c.rut.toLowerCase().replace('-', '').startsWith(tRut)))

  return (
    <>
      <div className="d-flex justify-content-between align-items-center">
        <h3>Clientes</h3>
        <Link className="btn btn-primary" to="/clientes/nuevo"><i className="bi bi-plus-lg" /> Nuevo cliente</Link>
      </div>
      <input className="form-control mb-3" style={{ maxWidth: 420 }} placeholder="Buscar por RUT o razón social" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      <Alerta>{error}</Alerta>
      {cargando ? <Cargando /> : (
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover table-sm mb-0">
              <thead className="table-light"><tr><th>RUT</th><th>Razón social</th><th>Giro</th><th>Comuna</th><th>Email</th><th /></tr></thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className={c.activo ? '' : 'text-muted'}>
                    <td className="text-nowrap">{formatearRut(c.rut)}</td>
                    <td>{c.razon_social} {!c.activo && <span className="badge bg-secondary">Inactivo</span>}</td>
                    <td>{c.giro}</td><td>{c.comuna}</td><td>{c.email}</td>
                    <td className="text-end"><Link className="btn btn-sm btn-outline-primary" to={`/clientes/${c.id}`}>Editar</Link></td>
                  </tr>
                ))}
                {lista.length === 0 && <tr><td colSpan={6} className="text-muted p-3">No hay clientes.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
