// Formatos y validaciones (equivale a la clase Formato y Rut de la capa Negocio)
const fmtPesos = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const fmtNumero = new Intl.NumberFormat('es-CL')
const fmtFecha = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

export const pesos = (n) => fmtPesos.format(Number(n || 0))
export const numero = (n) => fmtNumero.format(Number(n || 0))
export const fechaHora = (f) => (f ? fmtFecha.format(new Date(f)) : '')
export const fechaCorta = (iso) => (iso ? iso.split('-').reverse().join('-') : '')

/** Fecha de hoy en Chile como 'yyyy-mm-dd' */
export function hoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
}
export function sumarDias(iso, dias) {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
export const primerDiaMes = () => hoy().slice(0, 8) + '01'

/** RUT chileno (módulo 11). Devuelve '12345678-9' o null si no es válido. */
export function normalizarRut(rut) {
  const limpio = (rut || '').replace(/[^0-9kK]/g, '').toUpperCase()
  if (limpio.length < 2) return null
  const cuerpo = limpio.slice(0, -1).replace(/^0+/, '')
  const dv = limpio.slice(-1)
  if (!cuerpo || !/^\d+$/.test(cuerpo)) return null
  let suma = 0, factor = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const resto = 11 - (suma % 11)
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto)
  return dv === esperado ? `${cuerpo}-${dv}` : null
}

/** 12345678-9 -> 12.345.678-9 */
export function formatearRut(rut) {
  if (!rut || !rut.includes('-')) return rut || ''
  const [c, dv] = rut.split('-')
  return fmtNumero.format(Number(c)) + '-' + dv
}

export const MEDIOS_PAGO = ['Efectivo', 'Débito', 'Crédito', 'Transferencia']
export const TIPO = { BOLETA: 1, FACTURA: 2 }
