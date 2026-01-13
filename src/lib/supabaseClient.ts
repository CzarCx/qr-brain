
import { createClient } from '@supabase/supabase-js'

// DB para personal, reportes, calificación, entrega
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// DB para consultar etiquetas_i
const supabaseEtiquetasUrl = process.env.NEXT_PUBLIC_SUPABASE_ETIQUETAS_URL;
const supabaseEtiquetasAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ETIQUETAS_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las credenciales de Supabase para la base de datos principal en el archivo .env');
}

if (!supabaseEtiquetasUrl || !supabaseEtiquetasAnonKey) {
  throw new Error('Faltan las credenciales de Supabase para la base de datos de etiquetas en el archivo .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
export const supabaseEtiquetas = createClient(supabaseEtiquetasUrl, supabaseEtiquetasAnonKey);
