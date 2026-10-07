import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, verificar } from '../supabase.js'
import { Alerta, Cargando, useCarga } from '../componentes/Comunes.jsx'
import { TablaMovimientos } from './Kardex.jsx'

const AYUDA = {
  ENTRADA: 'Compra a proveedor: suma la cantidad al stock.',
  SALIDA: 'Merma, rotura o consumo interno: resta la cantidad.',
  AJUSTE: 'Inventario físico: escriba el stock real contado; el sistema calcula la diferencia.',
}

export default function Stock() {
  const [params] = useSearchParams()
  const [form, setForm] = useState({ producto_id: params.get('producto') || '', tipo: 'ENTRADA', cantidad: '', referencia: '' })
  const [msg, setMsg] = useState({ tipo: '', texto: '' })

  const { datos, error, cargando, recargar } = useCarga(async () => {
    const [productos, movimientos] = await Promise.all([
      supabase.from('producto').select('id, codigo, nombre, stock').eq('activo', true).order('nombre'),
      supabase.from('v_movimiento').select('*').in('tipo', ['ENTRADA', 'SALIDA', 'AJUSTE']).order('id', { ascending: false }).limit(20),
    ])
    return { productos: verificar(productos), movimientos: verificar(movimientos) }
  }, [])

  const actual = datos?.productos.find((p) => String(p.id) === String(form.producto_id))

  async function registrar(e) {
    e.preventDefault()
    try {
      const nuevo = verificar(await supabase.rpc('registrar_movimiento_stock', {
        p_producto_id: Number(form.producto_id), p_tipo: form.tipo,
        p_cantidad: Number(form.cantidad), p_referencia: form.referencia,
      }))
      setMsg({ tipo: 'success', texto: `Movimiento registrado. Stock de ${actual.nombre}: ${nuevo}.` })
      setForm({ ...form, cantidad: '', referencia: '' })
      recargar()
    } catch (e) { setMsg({ tipo: 'danger', texto: e.message }) }
  }

  if (cargando && !datos) return <Cargando />
  return (
    <>
      <h3>Movimientos de stock</h3>
      <Alerta>{error}</Alerta>
      <Alerta tipo={msg.tipo} onCerrar={() => setMsg({})}>{msg.texto}</Alerta>
      {datos && (
        <>
          <form className="card p-3 mb-4" onSubmit={registrar} style={{ maxWidth: 820 }}>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label" htmlFor="f-producto">Producto</label>
                <select id="f-producto" className="form-select" required value={form.producto_id} onChange={(e) => setForm({ ...form, producto_id: e.target.value })}>
                  <option value="">Seleccione...</option>
                  {datos.productos.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.codigo}) · stock {p.stock}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor="f-tipo">Tipo</label>
                <select id="f-tipo" className="form-select" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                  <option>ENTRADA</option><option>SALIDA</option><option>AJUSTE</option>
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor="f-cantidad">{form.tipo === 'AJUSTE' ? 'Stock contado' : 'Cantidad'}</label>
                <input id="f-cantidad" type="number" min={form.tipo === 'AJUSTE' ? 0 : 1} className="form-control" required value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} />
              </div>
              <div className="col-md-9">
                <label className="form-label" htmlFor="f-referencia">Referencia</label>
                <input id="f-referencia" className="form-control" maxLength={150} placeholder="Ej.: Factura proveedor N° 1234" value={form.referencia} onChange={(e) => setForm({ ...form, referencia: e.target.value })} />
              </div>
              <div className="col-md-3 d-grid align-items-end"><button className="btn btn-primary">Registrar</button></div>
            </div>
            <div className="form-text">{AYUDA[form.tipo]} {actual && <>Stock actual: <strong>{actual.stock}</strong>.</>}</div>
          </form>
          <div className="d-flex justify-content-between">
            <h5>Últimos movimientos manuales</h5>
            <Link to="/kardex">Ver kardex completo</Link>
          </div>
          <TablaMovimientos movimientos={datos.movimientos} />
        </>
      )}
    </>
  )
}
