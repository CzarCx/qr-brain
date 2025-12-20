
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zknhnivznhifhhpexipy.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprbmhuaXZ6bmhpZmhocGV4aXB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxOTYwODQsImV4cCI6MjA4MTc3MjA4NH0.upqkbcP8BQZhitKSkOpLRcGuwB4mwi9JcrlVWJUCpb8'

if (!supabaseUrl) {
  throw new Error('Missing Supabase URL. Make sure it is set in your .env.local file');
}

if (!supabaseAnonKey) {
  throw new Error('Missing Supabase Anon Key. Make sure it is set in your .env.local file');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Separate client for the second database
const supabaseUrl2 = process.env.NEXT_PUBLIC_SUPABASE_URL_2 || ''
const supabaseAnonKey2 = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_2 || ''

if (!supabaseUrl2) {
  console.warn('Warning: Missing Supabase URL 2. Make sure it is set in your environment variables.');
}

if (!supabaseAnonKey2) {
  console.warn('Warning: Missing Supabase Anon Key 2. Make sure it is set in your environment variables.');
}

export const supabaseDB2 = createClient(supabaseUrl2, supabaseAnonKey2);
