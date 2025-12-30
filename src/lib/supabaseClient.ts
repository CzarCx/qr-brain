
import { createClient } from '@supabase/supabase-js'

// DB para personal, reportes, calificación, entrega
const supabaseUrl = 'https://fjeffdiayxvbiteewgvz.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZWZmZGlheXh2Yml0ZWV3Z3Z6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMTkyOTcsImV4cCI6MjA3NzU5NTI5N30.xOC4_UjVZq2Zs2hnLeAbb694sF9GAMlGmrrgFVTdwKc'

// DB para consultar etiquetas_i
const supabaseEtiquetasUrl = 'https://zknhnivznhifhhpexipy.supabase.co'
const supabaseEtiquetasAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprbmhuaXZ6bmhpZmhocGV4aXB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxOTYwODQsImV4cCI6MjA4MTc3MjA4NH0.upqkbcP8BQZhitKSkOpLRcGuwB4mwi9JcrlVWJUCpb8'

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las credenciales de Supabase para la base de datos principal.');
}

if (!supabaseEtiquetasUrl || !supabaseEtiquetasAnonKey) {
  throw new Error('Faltan las credenciales de Supabase para la base de datos de etiquetas.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
export const supabaseEtiquetas = createClient(supabaseEtiquetasUrl, supabaseEtiquetasAnonKey);
