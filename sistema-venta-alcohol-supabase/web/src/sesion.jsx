import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from './supabase.js'

// Equivale al usuario autenticado (User.Identity / Claims en ASP.NET).
const ContextoSesion = createContext(null)

export function ProveedorSesion({ children }) {
  const [sesion, setSesion] = useState(undefined)   // undefined = cargando
  const [perfil, setPerfil] = useState(null)
  const [aviso, setAviso] = useState('')
  const location = useLocation()
  const perfilRef = useRef(null)

  const cargarPerfil = useCallback(async (s) => {
    if (!s) { perfilRef.current = null; setPerfil(null); return }
    const { data, error } = await supabase.from('perfil').select('*').eq('id', s.user.id).maybeSingle()
    if (error) {
      // error de red: se mantiene el perfil anterior; si no había, se avisa en el login
      if (!perfilRef.current) setAviso('No se pudo cargar su perfil: ' + error.message)
      return
    }
    if (!data || !data.activo) {
      setAviso('Su usuario está desactivado. Consulte al administrador.')
      perfilRef.current = null
      setPerfil(null)
      await supabase.auth.signOut()
      return
    }
    perfilRef.current = data
    setPerfil(data)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      cargarPerfil(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSesion(s)
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') cargarPerfil(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [cargarPerfil])

  // En cada cambio de página se vuelve a leer el perfil: si el administrador lo desactivó
  // o le cambió el rol, se aplica en la siguiente acción (igual que en la versión .NET).
  useEffect(() => {
    if (sesion) cargarPerfil(sesion)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const valor = {
    cargando: sesion === undefined || (sesion && !perfil && !aviso),
    sesion,
    perfil,
    esAdmin: perfil?.rol === 'administrador',
    aviso,
    limpiarAviso: () => setAviso(''),
    salir: () => supabase.auth.signOut(),
  }
  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>
}

export const useSesion = () => useContext(ContextoSesion)
