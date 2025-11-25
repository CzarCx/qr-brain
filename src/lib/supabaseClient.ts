import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://msnktspkrqloiyzzdlad.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbmt0c3BrcnFsb2l5enpkbGFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxNTM3MTAsImV4cCI6MjA3MTcyOTcxMH0.C1Vfl5A6DCrPLEyWvT1gEatWXWSdw2GjqQ2KiFBszPA'

if (!supabaseUrl) {
  throw new Error('Missing Supabase URL. Make sure it is set in your .env.local file');
}

if (!supabaseAnonKey) {
  throw new Error('Missing Supabase Anon Key. Make sure it is set in your .env.local file');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Separate client for the second database
const supabaseUrl2 = process.env.NEXT_PUBLIC_SUPABASE_URL_2
const supabaseAnonKey2 = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_2

if (!supabaseUrl2) {
  throw new Error('Missing Supabase URL 2. Make sure it is set in your .env.local file');
}

if (!supabaseAnonKey2) {
  throw new Error('Missing Supabase Anon Key 2. Make sure it is set in your .env.local file');
}

export const supabaseDB2 = createClient(supabaseUrl2, supabaseAnonKey2);
