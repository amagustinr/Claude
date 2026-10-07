import { useState } from 'react'
import { supabase } from '../supabase.js'
import { Alerta } from '../componentes/Comunes.jsx'

export default function CambiarClave() {
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
  const [msg, setMsg] = useState({ tipo: '', texto: '' })

  async function guardar(e) {
    e.preventDefault()
    if (clave.length < 8) return setMsg({ tipo: 'danger', texto: 'La clave debe tener al menos 8 caracteres.' })
    if (clave !== repetir) return setMsg({ tipo: 'danger', texto: 'Las claves no coinciden.' })
    const { error } = await supabase.auth.updateUser({ password: clave })
    if (error) return setMsg({ tipo: 'danger', texto: error.message })
    setClave(''); setRepetir('')
    setMsg({ tipo: 'success', texto: 'Clave actualizada.' })
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <h3>Cambiar clave</h3>
      <Alerta tipo={msg.tipo}>{msg.texto}</Alerta>
      <form onSubmit={guardar}>
        <div className="mb-3">
          <label className="form-label" htmlFor="f-clave-nueva">Clave nueva</label>
          <input id="f-clave-nueva" type="password" className="form-control" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" required />
        </div>
        <div className="mb-3">
          <label className="form-label" htmlFor="f-repetir-clave">Repetir clave</label>
          <input id="f-repetir-clave" type="password" className="form-control" value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" required />
        </div>
        <button className="btn btn-primary">Guardar</button>
      </form>
    </div>
  )
}
