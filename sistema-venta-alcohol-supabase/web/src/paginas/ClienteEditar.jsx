import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, verificar } from '../supabase.js'
import { Alerta, Cargando } from '../componentes/Comunes.jsx'
import { formatearRut, normalizarRut } from '../util.js'

const VACIO = { rut: '', razon_social: '', giro: '', direccion: '', comuna: '', ciudad: '', email: '', telefono: '', activo: true }

export default function ClienteEditar() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [c, setC] = useState(id ? null : VACIO)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    supabase.from('cliente').select('*').eq('id', id).single()
      .then((r) => { try { const d = verificar(r); setC({ ...d, rut: formatearRut(d.rut) }) } catch (e) { setError(e.message) } })
  }, [id])

  const campo = (nombre) => ({ value: c[nombre] ?? '', onChange: (e) => setC({ ...c, [nombre]: e.target.value }) })

  async function guardar(e) {
    e.preventDefault()
    const rut = normalizarRut(c.rut)
    if (!rut) return setError('El RUT no es válido (revise el dígito verificador).')
    const fila = { ...c, rut }
    delete fila.id
    try {
      verificar(id
        ? await supabase.from('cliente').update(fila).eq('id', id)
        : await supabase.from('cliente').insert(fila))
      navigate('/clientes')
    } catch (e) {
      setError(e.message.includes('duplicate') ? 'Ya existe un cliente con ese RUT.' : e.message)
    }
  }

  if (!c) return error ? <Alerta>{error}</Alerta> : <Cargando />
  return (
    <div style={{ maxWidth: 720 }}>
      <h3>{id ? 'Editar cliente' : 'Nuevo cliente'}</h3>
      <Alerta onCerrar={() => setError('')}>{error}</Alerta>
      <form className="card p-3" onSubmit={guardar}>
        <div className="row g-3">
          <div className="col-md-4"><label className="form-label" htmlFor="f-rut">RUT</label><input id="f-rut" className="form-control" required placeholder="12.345.678-9" {...campo('rut')} /></div>
          <div className="col-md-8"><label className="form-label" htmlFor="f-razon-social">Razón social</label><input id="f-razon-social" className="form-control" required maxLength={150} {...campo('razon_social')} /></div>
          <div className="col-md-6"><label className="form-label" htmlFor="f-giro">Giro</label><input id="f-giro" className="form-control" maxLength={150} {...campo('giro')} /></div>
          <div className="col-md-6"><label className="form-label" htmlFor="f-direccion">Dirección</label><input id="f-direccion" className="form-control" maxLength={200} {...campo('direccion')} /></div>
          <div className="col-md-4"><label className="form-label" htmlFor="f-comuna">Comuna</label><input id="f-comuna" className="form-control" maxLength={60} {...campo('comuna')} /></div>
          <div className="col-md-4"><label className="form-label" htmlFor="f-ciudad">Ciudad</label><input id="f-ciudad" className="form-control" maxLength={60} {...campo('ciudad')} /></div>
          <div className="col-md-4"><label className="form-label" htmlFor="f-telefono">Teléfono</label><input id="f-telefono" className="form-control" maxLength={30} {...campo('telefono')} /></div>
          <div className="col-md-8"><label className="form-label" htmlFor="f-email">Email</label><input id="f-email" type="email" className="form-control" maxLength={120} {...campo('email')} /></div>
          <div className="col-md-4 form-check form-switch pt-4 ps-5">
            <input className="form-check-input" type="checkbox" id="activo" checked={c.activo} onChange={(e) => setC({ ...c, activo: e.target.checked })} />
            <label className="form-check-label" htmlFor="activo">Activo</label>
          </div>
        </div>
        <div className="form-text">Para emitir factura el cliente debe tener giro, dirección y comuna.</div>
        <div className="mt-3 d-flex gap-2">
          <button className="btn btn-primary">Guardar</button>
          <Link className="btn btn-outline-secondary" to="/clientes">Cancelar</Link>
        </div>
      </form>
    </div>
  )
}
