import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase, verificar } from '../supabase.js'
import { useSesion } from '../sesion.jsx'
import { Alerta, Cargando, FiltroFechas, useCarga } from '../componentes/Comunes.jsx'
import { fechaCorta, hoy, numero, pesos, primerDiaMes } from '../util.js'

/** Administrador: panel con indicadores. Vendedor: va directo a la caja. */
export default function Inicio() {
  const { esAdmin } = useSesion()
  if (!esAdmin) return <Navigate to="/ventas/nueva" replace />
  return <Panel />
}

function Panel() {
  const [filtro, setFiltro] = useState({ desde: primerDiaMes(), hasta: hoy() })
  const { datos: r, error, cargando } = useCarga(
    async () => verificar(await supabase.rpc('reporte_resumen', { p_desde: filtro.desde, p_hasta: filtro.hasta })),
    [filtro.desde, filtro.hasta])

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-2">
        <h3 className="mb-3">Panel de administración</h3>
        <FiltroFechas {...filtro} onCambio={setFiltro} />
      </div>
      <Alerta>{error}</Alerta>
      {cargando || !r ? <Cargando /> : (
        <>
          <div className="row g-3 mb-3">
            <Indicador titulo="Ventas de hoy" valor={pesos(r.ventas_hoy)} pie={`${r.documentos_hoy} documentos`} />
            <Indicador titulo="Ventas del período" valor={pesos(r.ventas_periodo)} pie={`${r.documentos_periodo} documentos`} />
            <Indicador titulo="Ticket promedio" valor={pesos(r.documentos_periodo ? Math.round(r.ventas_periodo / r.documentos_periodo) : 0)} />
            <div className="col-md-3">
              <Link className="text-decoration-none" to="/productos?stockBajo=1">
                <div className={`card p-3 tarjeta-indicador h-100 ${r.productos_stock_bajo > 0 ? 'border border-danger' : ''}`}>
                  <div className="text-muted small">Productos con stock bajo</div>
                  <div className={`valor ${r.productos_stock_bajo > 0 ? 'text-danger' : ''}`}>{r.productos_stock_bajo}</div>
                  <div className="small">Ver detalle</div>
                </div>
              </Link>
            </div>
          </div>
          <div className="row g-3">
            <Tabla titulo="Ventas por día" columnas={['Día', 'Docs', 'Total']}
              filas={r.por_dia.map((f) => [fechaCorta(f.dia), f.documentos, pesos(f.total)])} />
            <Tabla titulo="Productos más vendidos" columnas={['Producto', 'Unid.', 'Total']}
              filas={r.top_productos.map((f) => [f.producto, numero(f.unidades), pesos(f.total)])} />
            <Tabla titulo="Ventas por vendedor" columnas={['Vendedor', 'Docs', 'Total']}
              filas={r.por_vendedor.map((f) => [f.vendedor, f.documentos, pesos(f.total)])} />
          </div>
        </>
      )}
    </>
  )
}

function Indicador({ titulo, valor, pie }) {
  return (
    <div className="col-md-3">
      <div className="card p-3 tarjeta-indicador h-100">
        <div className="text-muted small">{titulo}</div>
        <div className="valor">{valor}</div>
        {pie && <div className="small">{pie}</div>}
      </div>
    </div>
  )
}

function Tabla({ titulo, columnas, filas }) {
  return (
    <div className="col-lg-4">
      <div className="card p-3 h-100">
        <h6>{titulo}</h6>
        <table className="table table-sm mb-0">
          <thead><tr>{columnas.map((c, i) => <th key={c} className={i ? 'text-end' : ''}>{c}</th>)}</tr></thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>{f.map((v, j) => <td key={j} className={j ? 'text-end' : ''}>{v}</td>)}</tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={3} className="text-muted">Sin ventas en el período.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
