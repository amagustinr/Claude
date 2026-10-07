import { useEffect, useState } from 'react'
import { supabase, verificar } from '../supabase.js'
import { Alerta, Cargando } from '../componentes/Comunes.jsx'
import { formatearRut, normalizarRut } from '../util.js'

export default function Configuracion() {
  const [c, setC] = useState(null)
  const [msg, setMsg] = useState({ tipo: '', texto: '' })

  useEffect(() => {
    supabase.from('configuracion').select('*').eq('id', 1).single().then((r) => {
      try { const d = verificar(r); setC({ ...d, rut_empresa: formatearRut(d.rut_empresa) }) } catch (e) { setMsg({ tipo: 'danger', texto: e.message }) }
    })
  }, [])

  const campo = (nombre) => ({ value: c[nombre] ?? '', onChange: (e) => setC({ ...c, [nombre]: e.target.value }) })

  async function guardar(e) {
    e.preventDefault()
    const rut = normalizarRut(c.rut_empresa)
    if (!rut) return setMsg({ tipo: 'danger', texto: 'El RUT de la empresa no es válido.' })
    try {
      const { rut_empresa, razon_social, giro, direccion, comuna, telefono, porcentaje_iva } = { ...c, rut_empresa: rut }
      verificar(await supabase.from('configuracion').update({ rut_empresa, razon_social, giro, direccion, comuna, telefono, porcentaje_iva: Number(porcentaje_iva) }).eq('id', 1))
      setMsg({ tipo: 'success', texto: 'Datos guardados.' })
    } catch (er) { setMsg({ tipo: 'danger', texto: er.message }) }
  }

  if (!c) return msg.texto ? <Alerta>{msg.texto}</Alerta> : <Cargando />
  return (
    <div style={{ maxWidth: 720 }}>
      <h3>Datos de la empresa</h3>
      <p className="text-muted">Aparecen en las boletas y facturas. El IVA se usa para desglosar el neto en cada venta.</p>
      <Alerta tipo={msg.tipo} onCerrar={() => setMsg({})}>{msg.texto}</Alerta>
      <form className="card p-3" onSubmit={guardar}>
        <div className="row g-3">
          <div className="col-md-4"><label className="form-label" htmlFor="f-rut">RUT</label><input id="f-rut" className="form-control" required {...campo('rut_empresa')} /></div>
          <div className="col-md-8"><label className="form-label" htmlFor="f-razon-social">Razón social</label><input id="f-razon-social" className="form-control" required {...campo('razon_social')} /></div>
          <div className="col-12"><label className="form-label" htmlFor="f-giro">Giro</label><input id="f-giro" className="form-control" required {...campo('giro')} /></div>
          <div className="col-md-8"><label className="form-label" htmlFor="f-direccion">Dirección</label><input id="f-direccion" className="form-control" required {...campo('direccion')} /></div>
          <div className="col-md-4"><label className="form-label" htmlFor="f-comuna">Comuna</label><input id="f-comuna" className="form-control" {...campo('comuna')} /></div>
          <div className="col-md-6"><label className="form-label" htmlFor="f-telefono">Teléfono</label><input id="f-telefono" className="form-control" {...campo('telefono')} /></div>
          <div className="col-md-3"><label className="form-label" htmlFor="f-iva">IVA (%)</label><input id="f-iva" type="number" step="0.01" min="0" max="100" className="form-control" required {...campo('porcentaje_iva')} /></div>
        </div>
        <div className="mt-3"><button className="btn btn-primary">Guardar</button></div>
      </form>
    </div>
  )
}
