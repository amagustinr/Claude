import { createClient } from '@supabase/supabase-js'

// Equivale a la cadena de conexión. La llave "anon" es pública: la seguridad real
// está en las políticas RLS de la base de datos, no en ocultar esta llave.
const url = import.meta.env.VITE_SUPABASE_URL
const llave = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !llave) {
  throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver .env.example).')
}

export const supabase = createClient(url, llave)

export const DOMINIO_USUARIOS = import.meta.env.VITE_DOMINIO_USUARIOS || 'botilleria.local'

/** Convierte "admin" en "admin@botilleria.local" (Supabase Auth exige un correo). */
export const correoDeUsuario = (usuario) =>
  usuario.includes('@') ? usuario.trim().toLowerCase() : `${usuario.trim().toLowerCase()}@${DOMINIO_USUARIOS}`

/** Lanza el error de Supabase como excepción (como ReglaNegocioException en .NET). */
export function verificar({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}
