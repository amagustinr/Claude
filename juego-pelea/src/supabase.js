import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && anonKey);

if (!configurado) {
  console.error('Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY (ver .env.example).');
}

export const supabase = configurado
  ? createClient(url, anonKey, {
      // La pelea envía ~15 estados por segundo; el límite por defecto del cliente es 10.
      realtime: { params: { eventsPerSecond: 40 } },
    })
  : null;

export const BUCKET_CARAS = 'caras';

/** URL pública de la foto de un personaje (o null si no tiene). */
export function urlFoto(personaje) {
  if (!personaje?.foto_path || !supabase) return null;
  const { data } = supabase.storage.from(BUCKET_CARAS).getPublicUrl(personaje.foto_path);
  // ?v= evita que el navegador muestre una foto anterior cacheada.
  return `${data.publicUrl}?v=${encodeURIComponent(personaje.actualizado_en ?? '')}`;
}

/** Personajes que se pueden usar en el juego (RLS ya filtra los no disponibles). */
export async function cargarPersonajesDisponibles() {
  const { data, error } = await supabase
    .from('personajes')
    .select('*')
    .eq('disponible', true)
    .order('nombre');
  if (error) throw error;
  return data;
}
