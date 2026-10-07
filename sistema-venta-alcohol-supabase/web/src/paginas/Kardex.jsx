import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, verificar } from '../supabase.js'
import { Alerta, Cargando, FiltroFechas, useCarga } from '../componentes/Comunes.jsx'
import { fechaHora, hoy, numero, sumarDias } from '../util.js'

export function TablaMovimientos({ movimientos }) {
  return (
    <div className="card">
      <div className="table-responsive">
        <table className="table table-sm mb-0">
          <thead className="table-light">
            <tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th className="text-end">Cantidad</th><th className="text-end">Stock</th><th>Referencia</th><th>Usuario</th></tr>
          </thead>
          <tbody>
            {movimientos.map((m) => (
              <tr key={m.id}>
                <td>{fechaHora(m.fecha)}</td>
                <td>{m.producto}</td>
                <td>{m.tipo}</td>
                <td className={`text-end ${m.cantidad < 0 ? 'text-danger' : 'text-success'}`}>{m.cantidad > 0 ? '+' : ''}{numero(m.cantidad)}</td>
                <td className="text-end">{numero(m.stock_resultante)}</td>
                <td>{m.referencia}</td>
                <td>{m.usuario}</td>
              </tr>
            ))}
            {movimientos.length === 0 && <tr><td colSpan={7} className="text-muted p-3">Sin movimientos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Kardex() {
  const [params] = useSearchParams()
  const [filtro, setFiltro] = useState({ desde: sumarDias(hoy(), -30), hasta: hoy(), producto: params.get('producto') || '' })

  const { datos: productos } = useCarga(async () => verificar(await supabase.from('producto').select('id, nombre').order('nombre')), [])
  const { datos: movimientos, error, cargando } = useCarga(async () => {
    let q = supabase.from('v_movimiento').select('*')
      .gte('dia', filtro.desde).lte('dia', filtro.hasta)
      .order('fecha', { ascending: false }).order('id', { ascending: false }).limit(1000)
    if (filtro.producto) q = q.eq('producto_id', filtro.producto)
    return verificar(await q)
  }, [filtro.desde, filtro.hasta, filtro.producto])

  return (
    <>
      <h3>Kardex</h3>
      <FiltroFechas desde={filtro.desde} hasta={filtro.hasta} onCambio={(f) => setFiltro({ ...filtro, ...f })}>
        <div className="col-md-4">
          <label className="form-label small mb-0" htmlFor="f-producto">Producto</label>
          <select id="f-producto" className="form-select" value={filtro.producto} onChange={(e) => setFiltro({ ...filtro, producto: e.target.value })}>
            <option value="">Todos</option>
            {(productos || []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
      </FiltroFechas>
      <Alerta>{error}</Alerta>
      {cargando ? <Cargando /> : <TablaMovimientos movimientos={movimientos} />}
    </>
  )
}
