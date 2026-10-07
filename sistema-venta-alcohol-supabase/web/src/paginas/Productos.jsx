import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, verificar } from '../supabase.js'
import { useSesion } from '../sesion.jsx'
import { Alerta, Cargando, useCarga } from '../componentes/Comunes.jsx'
import { numero, pesos } from '../util.js'

export default function Productos() {
  const { esAdmin } = useSesion()
  const [params, setParams] = useSearchParams()
  const [buscar, setBuscar] = useState('')
  const stockBajo = params.get('stockBajo') === '1'

  // producto_costo solo devuelve filas al administrador (RLS); al vendedor le llega null
  const { datos, error, cargando } = useCarga(async () => verificar(
    await supabase.from('producto')
      .select('*, categoria(nombre), producto_costo(precio_compra)')
      .order('nombre')
  ), [])

  const texto = buscar.trim().toLowerCase()
  const lista = (datos || [])
    .filter((p) => esAdmin || p.activo)
    .filter((p) => !stockBajo || (p.activo && p.stock <= p.stock_minimo))
    .filter((p) => !texto || p.nombre.toLowerCase().includes(texto) || p.codigo === buscar.trim())

  return (
    <>
      <div className="d-flex justify-content-between align-items-center">
        <h3>Productos</h3>
        {esAdmin && (
          <div className="d-flex gap-2">
            <Link className="btn btn-outline-secondary" to="/stock"><i className="bi bi-box-arrow-in-down" /> Movimientos de stock</Link>
            <Link className="btn btn-primary" to="/productos/nuevo"><i className="bi bi-plus-lg" /> Nuevo producto</Link>
          </div>
        )}
      </div>
      <div className="row g-2 mb-3">
        <div className="col-md-5">
          <input className="form-control" placeholder="Buscar por nombre o código" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </div>
        <div className="col-auto form-check form-switch ms-2 pt-2">
          <input className="form-check-input" type="checkbox" id="stockBajo" checked={stockBajo}
            onChange={(e) => setParams(e.target.checked ? { stockBajo: '1' } : {})} />
          <label className="form-check-label" htmlFor="stockBajo">Solo stock bajo</label>
        </div>
      </div>
      <Alerta>{error}</Alerta>
      {cargando ? <Cargando /> : (
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover table-sm mb-0">
              <thead className="table-light">
                <tr>
                  <th>Código</th><th>Nombre</th><th>Categoría</th><th className="text-end">Grado</th><th className="text-end">ml</th>
                  {esAdmin && <th className="text-end">P. compra</th>}
                  <th className="text-end">P. venta</th><th className="text-end">Stock</th><th className="text-end">Mín.</th>
                  {esAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className={p.activo ? '' : 'text-muted'}>
                    <td>{p.codigo}</td>
                    <td>{p.nombre} {!p.activo && <span className="badge bg-secondary">Inactivo</span>}</td>
                    <td>{p.categoria?.nombre}</td>
                    <td className="text-end">{numero(p.grado_alcoholico)}°</td>
                    <td className="text-end">{numero(p.volumen_ml)}</td>
                    {esAdmin && <td className="text-end">{pesos(p.producto_costo?.precio_compra)}</td>}
                    <td className="text-end">{pesos(p.precio_venta)}</td>
                    <td className={`text-end ${p.stock <= p.stock_minimo ? 'stock-bajo' : ''}`}>{numero(p.stock)}</td>
                    <td className="text-end">{numero(p.stock_minimo)}</td>
                    {esAdmin && (
                      <td className="text-end text-nowrap">
                        <Link className="btn btn-sm btn-outline-primary me-1" to={`/productos/${p.id}`}>Editar</Link>
                        <Link className="btn btn-sm btn-outline-secondary" to={`/kardex?producto=${p.id}`}>Kardex</Link>
                      </td>
                    )}
                  </tr>
                ))}
                {lista.length === 0 && <tr><td colSpan={10} className="text-muted p-3">No hay productos.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
