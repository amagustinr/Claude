import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase, verificar } from '../supabase.js'
import { useSesion } from '../sesion.jsx'
import { Alerta, Cargando, useCarga } from '../componentes/Comunes.jsx'
import { TIPO, fechaHora, formatearRut, numero, pesos } from '../util.js'

export default function Documento() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { esAdmin } = useSesion()
  const [motivo, setMotivo] = useState('')
  const [verAnular, setVerAnular] = useState(false)
  const [error, setError] = useState('')

  const { datos, error: errorCarga, cargando, recargar } = useCarga(async () => {
    const [venta, detalle, empresa] = await Promise.all([
      supabase.from('v_venta').select('*').eq('id', id).maybeSingle(),
      supabase.from('detalle_venta').select('cantidad, precio_unitario, subtotal, producto(codigo, nombre)').eq('venta_id', id).order('id'),
      supabase.from('configuracion').select('*').eq('id', 1).single(),
    ])
    const v = verificar(venta)
    if (!v) throw new Error('El documento no existe o no tiene permiso para verlo.')
    return { v, detalle: verificar(detalle), e: verificar(empresa) }
  }, [id])

  // Recién emitido: abre el diálogo de impresión
  useEffect(() => {
    if (datos && params.get('imprimir') === '1') setTimeout(() => window.print(), 300)
  }, [datos, params])

  async function anular(ev) {
    ev.preventDefault()
    if (!confirm('¿Anular este documento? El stock se repondrá.')) return
    try {
      verificar(await supabase.rpc('anular_venta', { p_venta_id: Number(id), p_motivo: motivo }))
      setVerAnular(false); setError('')
      recargar()
    } catch (e) { setError(e.message) }
  }

  if (cargando) return <Cargando />
  if (errorCarga) return <Alerta>{errorCarga}</Alerta>
  const { v, detalle, e } = datos
  const esFactura = v.tipo_documento_id === TIPO.FACTURA
  const direccionEmpresa = e.direccion + (e.comuna ? ', ' + e.comuna : '')

  return (
    <>
      <div className="no-print d-flex justify-content-center gap-2 mb-3">
        <button className="btn btn-primary" onClick={() => window.print()}><i className="bi bi-printer" /> Imprimir</button>
        <Link className="btn btn-success" to="/ventas/nueva"><i className="bi bi-cart-plus" /> Nueva venta</Link>
        <Link className="btn btn-outline-secondary" to="/ventas">Ver ventas</Link>
        {esAdmin && !v.anulada && <button className="btn btn-outline-danger" onClick={() => setVerAnular(!verAnular)}>Anular</button>}
      </div>
      <div className="no-print"><Alerta onCerrar={() => setError('')}>{error}</Alerta></div>
      {verAnular && (
        <form className="no-print d-flex justify-content-center gap-2 mb-3" onSubmit={anular}>
          <input className="form-control w-auto" placeholder="Motivo de la anulación" maxLength={200} required value={motivo} onChange={(ev) => setMotivo(ev.target.value)} />
          <button className="btn btn-danger">Confirmar anulación</button>
        </form>
      )}

      <div className={`documento card ${esFactura ? '' : 'boleta'}`}>
        {esFactura ? (
          <>
            <div className="row mb-3">
              <div className="col-7">
                <h5 className="mb-0">{e.razon_social}</h5>
                <div className="small">Giro: {e.giro}</div>
                <div className="small">{direccionEmpresa}</div>
                <div className="small">{e.telefono}</div>
              </div>
              <div className="col-5">
                <div className="recuadro-sii">R.U.T.: {formatearRut(e.rut_empresa)}<br />FACTURA<br />N° {v.folio}</div>
              </div>
            </div>
            <table className="table table-sm table-borderless small mb-3">
              <tbody>
                <tr><th style={{ width: 120 }}>Señor(es)</th><td>{v.cliente}</td><th style={{ width: 80 }}>R.U.T.</th><td>{formatearRut(v.rut_cliente)}</td></tr>
                <tr><th>Giro</th><td>{v.giro_cliente}</td><th>Comuna</th><td>{v.comuna_cliente}</td></tr>
                <tr><th>Dirección</th><td colSpan={3}>{v.direccion_cliente}</td></tr>
                <tr><th>Fecha emisión</th><td>{fechaHora(v.fecha)}</td><th>Pago</th><td>{v.medio_pago}</td></tr>
              </tbody>
            </table>
          </>
        ) : (
          <div className="text-center mb-2">
            <strong>{e.razon_social}</strong><br />
            R.U.T.: {formatearRut(e.rut_empresa)}<br />
            {e.giro}<br />
            {direccionEmpresa}
            <div className="recuadro-sii my-2">BOLETA N° {v.folio}</div>
            Fecha: {fechaHora(v.fecha)}
          </div>
        )}

        {v.anulada && (
          <div className="text-center my-2"><span className="anulada-sello">ANULADA</span><div className="small">{v.motivo_anulacion}</div></div>
        )}

        <table className="table table-sm">
          <thead><tr><th>Cant.</th><th>Descripción</th><th className="text-end">P. unit.</th><th className="text-end">Total</th></tr></thead>
          <tbody>
            {detalle.map((d, i) => (
              <tr key={i}><td>{d.cantidad}</td><td>{d.producto.nombre}</td><td className="text-end">{pesos(d.precio_unitario)}</td><td className="text-end">{pesos(d.subtotal)}</td></tr>
            ))}
          </tbody>
        </table>

        <div className="d-flex justify-content-end">
          <table className="table table-sm w-auto">
            <tbody>
              {esFactura && (
                <>
                  <tr><th>Monto neto</th><td className="text-end">{pesos(v.neto)}</td></tr>
                  <tr><th>IVA {numero(e.porcentaje_iva)}%</th><td className="text-end">{pesos(v.iva)}</td></tr>
                </>
              )}
              <tr className="fs-5"><th>TOTAL</th><td className="text-end fw-bold">{pesos(v.total)}</td></tr>
              {!esFactura && <tr className="small text-muted"><td>IVA incluido</td><td className="text-end">{pesos(v.iva)}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="small text-muted text-center">
          Atendido por: {v.vendedor} · Pago: {v.medio_pago}<br />
          Documento interno de venta. Para validez tributaria debe emitirse el DTE correspondiente ante el SII.
        </div>
      </div>
    </>
  )
}
