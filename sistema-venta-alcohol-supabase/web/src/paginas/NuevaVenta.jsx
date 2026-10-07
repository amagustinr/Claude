import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, verificar } from '../supabase.js'
import { Alerta } from '../componentes/Comunes.jsx'
import { MEDIOS_PAGO, TIPO, formatearRut, normalizarRut, pesos } from '../util.js'

const CLIENTE_VACIO = { razon_social: '', giro: '', direccion: '', comuna: '', ciudad: '' }

export default function NuevaVenta() {
  const navigate = useNavigate()
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState(null)
  const [carrito, setCarrito] = useState([])   // [{ id, nombre, precio, stock, cantidad }]
  const [tipo, setTipo] = useState(TIPO.BOLETA)
  const [medioPago, setMedioPago] = useState(MEDIOS_PAGO[0])
  const [edadVerificada, setEdadVerificada] = useState(false)
  const [rut, setRut] = useState('')
  const [cliente, setCliente] = useState(null)       // cliente encontrado
  const [nuevoCliente, setNuevoCliente] = useState(null)  // formulario de cliente nuevo
  const [mensaje, setMensaje] = useState('')
  const [emitiendo, setEmitiendo] = useState(false)
  const buscador = useRef(null)
  const temporizador = useRef(null)

  const total = carrito.reduce((s, it) => s + it.precio * it.cantidad, 0)

  // ---------- Búsqueda de productos ----------
  async function buscarProductos(q, agregarExacto) {
    q = q.trim()
    if (!q) { setResultados(null); return }
    const limpio = q.replace(/["\\]/g, '')   // los valores van entre comillas en el filtro "or"
    const { data, error } = await supabase.from('producto')
      .select('id, codigo, nombre, precio_venta, stock')
      .eq('activo', true)
      .or(`codigo.eq."${limpio}",nombre.ilike."%${limpio}%"`)
      .order('nombre').limit(15)
    if (error) return setMensaje(error.message)
    const exacto = data.find((p) => p.codigo === q) || (agregarExacto && data.length === 1 ? data[0] : null)
    if (agregarExacto && exacto) {
      agregar(exacto); setTexto(''); setResultados(null)
      return
    }
    setResultados(data)
  }

  function alEscribir(valor) {
    setTexto(valor)
    clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => buscarProductos(valor, false), 250)
  }

  function alPresionar(e) {
    // Con lector de código de barras: escanea y envía Enter -> se agrega solo
    if (e.key === 'Enter') { e.preventDefault(); clearTimeout(temporizador.current); buscarProductos(texto, true) }
  }

  // ---------- Carrito ----------
  function agregar(p) {
    setCarrito((c) => {
      const actual = c.find((x) => x.id === p.id)
      const cantidad = (actual?.cantidad || 0) + 1
      if (cantidad > p.stock) { setMensaje(`Stock insuficiente para ${p.nombre} (disponible: ${p.stock}).`); return c }
      setMensaje('')
      const item = { id: p.id, nombre: p.nombre, precio: Number(p.precio_venta), stock: p.stock, cantidad }
      return actual ? c.map((x) => (x.id === p.id ? item : x)) : [...c, item]
    })
    buscador.current?.focus()
  }

  function cambiarCantidad(id, valor) {
    setCarrito((c) => c.map((x) => {
      if (x.id !== id) return x
      let n = parseInt(valor, 10) || 1
      if (n > x.stock) { n = x.stock; setMensaje(`Solo hay ${x.stock} unidades de ${x.nombre}.`) }
      return { ...x, cantidad: Math.max(1, n) }
    }))
  }

  // ---------- Cliente (factura) ----------
  async function buscarCliente() {
    setCliente(null); setNuevoCliente(null)
    const r = normalizarRut(rut)
    if (!r) return setMensaje('El RUT no es válido.')
    setMensaje('')
    const { data, error } = await supabase.from('cliente').select('*').eq('rut', r).maybeSingle()
    if (error) return setMensaje(error.message)
    if (data && !data.activo) return setMensaje('El cliente está desactivado.')
    if (data) setCliente(data)
    else setNuevoCliente({ ...CLIENTE_VACIO, rut: r })
  }

  async function guardarClienteNuevo() {
    const c = nuevoCliente
    if (!c.razon_social || !c.giro || !c.direccion || !c.comuna) return setMensaje('Para factura complete razón social, giro, dirección y comuna.')
    const { data, error } = await supabase.from('cliente').insert(c).select().single()
    if (error) return setMensaje(error.message)
    setCliente(data); setNuevoCliente(null); setMensaje('')
  }

  // ---------- Emitir ----------
  async function emitir() {
    setMensaje('')
    if (carrito.length === 0) return setMensaje('Agregue al menos un producto.')
    if (!edadVerificada) return setMensaje('Debe verificar la mayoría de edad del comprador.')
    if (tipo === TIPO.FACTURA) {
      if (!cliente) return setMensaje('Busque o registre el cliente para la factura.')
      if (!cliente.giro || !cliente.direccion || !cliente.comuna) return setMensaje('El cliente no tiene giro, dirección o comuna. Complételos en Clientes.')
    }
    setEmitiendo(true)
    try {
      // Una sola llamada = una transacción en la base (función registrar_venta)
      const idVenta = verificar(await supabase.rpc('registrar_venta', {
        p_tipo_documento_id: tipo,
        p_cliente_id: tipo === TIPO.FACTURA ? cliente.id : null,
        p_medio_pago: medioPago,
        p_edad_verificada: edadVerificada,
        p_items: carrito.map((x) => ({ producto_id: x.id, cantidad: x.cantidad })),
      }))
      navigate(`/ventas/${idVenta}?imprimir=1`)
    } catch (e) {
      setMensaje(e.message)
      setEmitiendo(false)
    }
  }

  useEffect(() => () => clearTimeout(temporizador.current), [])

  return (
    <div className="row g-3">
      <div className="col-lg-5">
        <div className="card p-3">
          <h5><i className="bi bi-upc-scan" /> Agregar productos</h5>
          <input ref={buscador} className="form-control form-control-lg" placeholder="Escanee código de barras o escriba el nombre"
            value={texto} onChange={(e) => alEscribir(e.target.value)} onKeyDown={alPresionar} autoFocus autoComplete="off" />
          <div className="form-text">Con lector de código: escanee y el producto se agrega solo (Enter).</div>
          <div className="list-group mt-2">
            {resultados?.length === 0 && <div className="list-group-item text-muted">Sin resultados</div>}
            {resultados?.map((p) => (
              <button key={p.id} type="button" disabled={p.stock <= 0}
                className="list-group-item list-group-item-action d-flex justify-content-between"
                onClick={() => agregar(p)}>
                <span><strong>{p.nombre}</strong><br /><small className="text-muted">{p.codigo}</small></span>
                <span className="text-end">{pesos(p.precio_venta)}<br /><small>Stock: {p.stock}</small></span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="col-lg-7">
        <div className="card p-3">
          <h5><i className="bi bi-cart" /> Detalle de la venta</h5>
          <div className="table-responsive">
            <table className="table table-sm">
              <thead><tr><th>Producto</th><th className="text-end">Precio</th><th className="text-center">Cant.</th><th className="text-end">Subtotal</th><th /></tr></thead>
              <tbody>
                {carrito.length === 0 && <tr><td colSpan={5} className="text-muted">Sin productos.</td></tr>}
                {carrito.map((it) => (
                  <tr key={it.id}>
                    <td>{it.nombre}</td>
                    <td className="text-end">{pesos(it.precio)}</td>
                    <td className="text-center">
                      <input type="number" min="1" max={it.stock} value={it.cantidad} style={{ width: 80 }}
                        className="form-control form-control-sm d-inline-block" onChange={(e) => cambiarCantidad(it.id, e.target.value)} />
                    </td>
                    <td className="text-end">{pesos(it.precio * it.cantidad)}</td>
                    <td><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setCarrito((c) => c.filter((x) => x.id !== it.id))}><i className="bi bi-x" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-end mb-3">
            <div className="text-muted small">Total (IVA incluido)</div>
            <div className="fs-2 fw-bold">{pesos(total)}</div>
          </div>

          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Documento</label>
              <div className="btn-group w-100">
                <input type="radio" className="btn-check" id="docBoleta" checked={tipo === TIPO.BOLETA} onChange={() => setTipo(TIPO.BOLETA)} />
                <label className="btn btn-outline-primary" htmlFor="docBoleta">Boleta</label>
                <input type="radio" className="btn-check" id="docFactura" checked={tipo === TIPO.FACTURA} onChange={() => setTipo(TIPO.FACTURA)} />
                <label className="btn btn-outline-primary" htmlFor="docFactura">Factura</label>
              </div>
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="f-medio-de-pago">Medio de pago</label>
              <select id="f-medio-de-pago" className="form-select" value={medioPago} onChange={(e) => setMedioPago(e.target.value)}>
                {MEDIOS_PAGO.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>

            {tipo === TIPO.FACTURA && (
              <div className="col-12">
                <label className="form-label">RUT del cliente</label>
                <div className="input-group">
                  <input className="form-control" placeholder="12.345.678-9" value={rut}
                    onChange={(e) => { setRut(e.target.value); setCliente(null); setNuevoCliente(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarCliente() } }} />
                  <button className="btn btn-outline-secondary" type="button" onClick={buscarCliente}>Buscar</button>
                </div>
                {cliente && (
                  <div className="small mt-1 text-success">
                    <i className="bi bi-check-circle" /> {cliente.razon_social} · {formatearRut(cliente.rut)} · {cliente.giro}
                  </div>
                )}
                {nuevoCliente && (
                  <div className="border rounded p-2 mt-2 bg-light">
                    <div className="small mb-2">Cliente no registrado. Complete sus datos:</div>
                    <div className="row g-2">
                      {[['razon_social', 'Razón social', 12], ['giro', 'Giro', 6], ['direccion', 'Dirección', 6], ['comuna', 'Comuna', 6], ['ciudad', 'Ciudad', 6]].map(([campo, etiqueta, ancho]) => (
                        <div className={`col-md-${ancho}`} key={campo}>
                          <input className="form-control form-control-sm" placeholder={etiqueta} value={nuevoCliente[campo]}
                            onChange={(e) => setNuevoCliente({ ...nuevoCliente, [campo]: e.target.value })} />
                        </div>
                      ))}
                    </div>
                    <button type="button" className="btn btn-sm btn-primary mt-2" onClick={guardarClienteNuevo}>Registrar cliente</button>
                  </div>
                )}
              </div>
            )}

            <div className="col-12">
              <div className="p-2 border rounded bg-warning-subtle d-flex align-items-center gap-2">
                <input className="form-check-input m-0 flex-shrink-0" type="checkbox" id="edad" checked={edadVerificada} onChange={(e) => setEdadVerificada(e.target.checked)} />
                <label className="fw-semibold" htmlFor="edad">
                  Verifiqué con documento de identidad que el comprador es mayor de 18 años
                </label>
              </div>
            </div>
            <div className="col-12 d-grid">
              <Alerta onCerrar={() => setMensaje('')}>{mensaje}</Alerta>
              <button className="btn btn-success btn-lg" disabled={emitiendo} onClick={emitir}>
                <i className="bi bi-check2-circle" /> {emitiendo ? 'Emitiendo...' : 'Emitir documento'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
