import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, verificar } from '../supabase.js'
import { useSesion } from '../sesion.jsx'
import { Alerta, Cargando, FiltroFechas, useCarga } from '../componentes/Comunes.jsx'
import { fechaHora, formatearRut, hoy, pesos, sumarDias } from '../util.js'

export default function Ventas() {
  const { esAdmin } = useSesion()
  const [filtro, setFiltro] = useState({ desde: sumarDias(hoy(), -7), hasta: hoy(), tipo: '' })

  // El vendedor solo recibe sus propias ventas: lo filtra la política RLS de "venta", no este código.
  const { datos: ventas, error, cargando } = useCarga(async () => {
    let q = supabase.from('v_venta').select('*')
      .gte('dia', filtro.desde).lte('dia', filtro.hasta)
      .order('fecha', { ascending: false }).limit(1000)
    if (filtro.tipo) q = q.eq('tipo_documento_id', filtro.tipo)
    return verificar(await q)
  }, [filtro.desde, filtro.hasta, filtro.tipo])

  const validas = (ventas || []).filter((v) => !v.anulada)
  const total = validas.reduce((s, v) => s + Number(v.total), 0)

  return (
    <>
      <div className="d-flex justify-content-between align-items-center">
        <h3>{esAdmin ? 'Ventas' : 'Mis ventas'}</h3>
        <Link className="btn btn-success" to="/ventas/nueva"><i className="bi bi-cart-plus" /> Nueva venta</Link>
      </div>
      <FiltroFechas desde={filtro.desde} hasta={filtro.hasta} onCambio={(f) => setFiltro({ ...filtro, ...f })}>
        <div className="col-auto">
          <label className="form-label small mb-0" htmlFor="f-documento">Documento</label>
          <select id="f-documento" className="form-select" value={filtro.tipo} onChange={(e) => setFiltro({ ...filtro, tipo: e.target.value })}>
            <option value="">Todos</option>
            <option value="1">Boleta</option>
            <option value="2">Factura</option>
          </select>
        </div>
      </FiltroFechas>
      <Alerta>{error}</Alerta>
      {cargando ? <Cargando /> : (
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover table-sm mb-0">
              <thead className="table-light">
                <tr><th>Fecha</th><th>Documento</th><th>Cliente</th>{esAdmin && <th>Vendedor</th>}<th>Pago</th><th className="text-end">Total</th><th /></tr>
              </thead>
              <tbody>
                {ventas.map((v) => (
                  <tr key={v.id} className={v.anulada ? 'text-decoration-line-through text-muted' : ''}>
                    <td>{fechaHora(v.fecha)}</td>
                    <td>{v.tipo_documento} N° {v.folio} {v.anulada && <span className="badge bg-danger">Anulada</span>}</td>
                    <td>{v.cliente ? `${v.cliente} (${formatearRut(v.rut_cliente)})` : ''}</td>
                    {esAdmin && <td>{v.vendedor}</td>}
                    <td>{v.medio_pago}</td>
                    <td className="text-end">{pesos(v.total)}</td>
                    <td className="text-end"><Link className="btn btn-sm btn-outline-primary" to={`/ventas/${v.id}`}>Ver</Link></td>
                  </tr>
                ))}
                {ventas.length === 0 && <tr><td colSpan={7} className="text-muted p-3">No hay ventas en el período.</td></tr>}
              </tbody>
              <tfoot>
                <tr className="fw-bold"><td colSpan={esAdmin ? 5 : 4}>{validas.length} documentos válidos</td><td className="text-end">{pesos(total)}</td><td /></tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
