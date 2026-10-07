import { useCallback, useEffect, useState } from 'react'

export function Cargando() {
  return (
    <div className="text-center my-5 text-muted">
      <div className="spinner-border spinner-border-sm me-2" /> Cargando...
    </div>
  )
}

export function Alerta({ tipo = 'danger', children, onCerrar }) {
  if (!children) return null
  return (
    <div className={`alert alert-${tipo} d-flex justify-content-between align-items-start`}>
      <div>{children}</div>
      {onCerrar && <button type="button" className="btn-close" onClick={onCerrar} />}
    </div>
  )
}

/** Ejecuta una carga asíncrona y expone { datos, error, cargando, recargar }. */
export function useCarga(funcion, deps) {
  const [estado, setEstado] = useState({ datos: null, error: '', cargando: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cargar = useCallback(funcion, deps)
  const recargar = useCallback(async () => {
    setEstado((e) => ({ ...e, cargando: true, error: '' }))
    try {
      setEstado({ datos: await cargar(), error: '', cargando: false })
    } catch (e) {
      setEstado({ datos: null, error: e.message, cargando: false })
    }
  }, [cargar])
  useEffect(() => { recargar() }, [recargar])
  return { ...estado, recargar }
}

export function FiltroFechas({ desde, hasta, onCambio, children }) {
  return (
    <div className="row g-2 align-items-end mb-3 no-print">
      <div className="col-auto">
        <label className="form-label small mb-0">Desde</label>
        <input type="date" className="form-control" value={desde} onChange={(e) => onCambio({ desde: e.target.value, hasta })} />
      </div>
      <div className="col-auto">
        <label className="form-label small mb-0">Hasta</label>
        <input type="date" className="form-control" value={hasta} onChange={(e) => onCambio({ desde, hasta: e.target.value })} />
      </div>
      {children}
    </div>
  )
}
