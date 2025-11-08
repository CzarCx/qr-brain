import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('Missing Supabase URL. Make sure it is set in your .env.local file');
}

if (!supabaseAnonKey) {
  throw new Error('Missing Supabase Anon Key. Make sure it is set in your .env.local file');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
