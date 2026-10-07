import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, verificar } from '../supabase.js'
import { Alerta, Cargando } from '../componentes/Comunes.jsx'
import { numero } from '../util.js'

const VACIO = { codigo: '', nombre: '', categoria_id: '', grado_alcoholico: 0, volumen_ml: 750, precio_compra: 0, precio_venta: 0, stock_minimo: 0, activo: true, stock: 0 }

export default function ProductoEditar() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [p, setP] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        setCategorias(verificar(await supabase.from('categoria').select('id, nombre, activo').order('nombre')))
        if (!id) return setP(VACIO)
        const d = verificar(await supabase.from('producto').select('*, producto_costo(precio_compra)').eq('id', id).single())
        setP({ ...d, precio_compra: d.producto_costo?.precio_compra ?? 0 })
      } catch (e) { setError(e.message) }
    })()
  }, [id])

  const campo = (nombre) => ({ value: p[nombre], onChange: (e) => setP({ ...p, [nombre]: e.target.value }) })

  async function guardar(e) {
    e.preventDefault()
    try {
      verificar(await supabase.rpc('guardar_producto', {
        p_id: id ? Number(id) : null,
        p_codigo: p.codigo, p_nombre: p.nombre, p_categoria_id: Number(p.categoria_id),
        p_grado_alcoholico: Number(p.grado_alcoholico), p_volumen_ml: Number(p.volumen_ml),
        p_precio_compra: Number(p.precio_compra), p_precio_venta: Number(p.precio_venta),
        p_stock_minimo: Number(p.stock_minimo), p_activo: p.activo,
      }))
      navigate('/productos')
    } catch (e) { setError(e.message) }
  }

  if (!p) return error ? <Alerta>{error}</Alerta> : <Cargando />
  return (
    <div style={{ maxWidth: 720 }}>
      <h3>{id ? 'Editar producto' : 'Nuevo producto'}</h3>
      <Alerta onCerrar={() => setError('')}>{error}</Alerta>
      <form onSubmit={guardar} className="card p-3">
        <div className="row g-3">
          <div className="col-md-4"><label className="form-label" htmlFor="f-codigo">Código</label><input id="f-codigo" className="form-control" required maxLength={30} {...campo('codigo')} /></div>
          <div className="col-md-8"><label className="form-label" htmlFor="f-nombre">Nombre</label><input id="f-nombre" className="form-control" required maxLength={120} {...campo('nombre')} /></div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="f-categoria">Categoría</label>
            <select id="f-categoria" className="form-select" required {...campo('categoria_id')}>
              <option value="">Seleccione...</option>
              {categorias.filter((c) => c.activo || c.id === p.categoria_id).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="col-md-4"><label className="form-label" htmlFor="f-grado-alcoholico">Grado alcohólico (°)</label><input id="f-grado-alcoholico" type="number" step="0.1" min="0" max="99" className="form-control" {...campo('grado_alcoholico')} /></div>
          <div className="col-md-4"><label className="form-label" htmlFor="f-volumen-ml">Volumen (ml)</label><input id="f-volumen-ml" type="number" min="0" className="form-control" {...campo('volumen_ml')} /></div>
          <div className="col-md-4"><label className="form-label" htmlFor="f-precio-de-compra">Precio de compra</label><input id="f-precio-de-compra" type="number" min="0" className="form-control" {...campo('precio_compra')} /></div>
          <div className="col-md-4"><label className="form-label" htmlFor="f-precio-de-venta-iva-incl">Precio de venta (IVA incl.)</label><input id="f-precio-de-venta-iva-incl" type="number" min="0" required className="form-control" {...campo('precio_venta')} /></div>
          <div className="col-md-4"><label className="form-label" htmlFor="f-stock-minimo">Stock mínimo</label><input id="f-stock-minimo" type="number" min="0" className="form-control" {...campo('stock_minimo')} /></div>
          <div className="col-md-6">
            <label className="form-label">Stock actual</label>
            <div className="form-control-plaintext">
              {numero(p.stock)} unidades · <Link to={id ? `/stock?producto=${id}` : '/stock'}>registrar entrada o ajuste</Link>
            </div>
          </div>
          <div className="col-md-6 form-check form-switch pt-4 ps-5">
            <input className="form-check-input" type="checkbox" id="activo" checked={p.activo} onChange={(e) => setP({ ...p, activo: e.target.checked })} />
            <label className="form-check-label" htmlFor="activo">Activo (se puede vender)</label>
          </div>
        </div>
        <div className="mt-3 d-flex gap-2">
          <button className="btn btn-primary">Guardar</button>
          <Link className="btn btn-outline-secondary" to="/productos">Cancelar</Link>
        </div>
      </form>
    </div>
  )
}
