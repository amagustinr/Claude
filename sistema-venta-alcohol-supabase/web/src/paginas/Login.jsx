import { useState } from 'react'
import { supabase, correoDeUsuario } from '../supabase.js'
import { useSesion } from '../sesion.jsx'
import { Alerta } from '../componentes/Comunes.jsx'

export default function Login() {
  const { aviso, limpiarAviso } = useSesion()
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function ingresar(e) {
    e.preventDefault()
    setError(''); limpiarAviso(); setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: correoDeUsuario(usuario), password: clave })
    setEnviando(false)
    if (error) setError(error.message === 'Invalid login credentials' ? 'Usuario o clave incorrectos.' : error.message)
  }

  return (
    <div className="container" style={{ maxWidth: 380, marginTop: '12vh' }}>
      <div className="card shadow-sm">
        <div className="card-body p-4">
          <h4 className="text-center mb-4"><i className="bi bi-cup-straw text-warning" /> Botillería</h4>
          <Alerta tipo="warning">{aviso}</Alerta>
          <Alerta>{error}</Alerta>
          <form onSubmit={ingresar}>
            <div className="mb-3">
              <label className="form-label" htmlFor="f-usuario">Usuario</label>
              <input id="f-usuario" className="form-control" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus required autoComplete="username" />
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="f-clave">Clave</label>
              <input id="f-clave" type="password" className="form-control" value={clave} onChange={(e) => setClave(e.target.value)} required autoComplete="current-password" />
            </div>
            <button className="btn btn-primary w-100" disabled={enviando}>{enviando ? 'Ingresando...' : 'Ingresar'}</button>
          </form>
        </div>
      </div>
    </div>
  )
}
