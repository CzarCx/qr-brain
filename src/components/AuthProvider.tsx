'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { Session, User } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';

type Profile = {
  id: string;
  email: string | null;
  role: 'ADMIN' | 'USER';
  last_seen: string | null;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Escuchar cambios en la sesión
    const { data: { subscription } } = supabaseEtiquetas.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await syncProfile(session.user);
      } else {
        setProfile(null);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const syncProfile = async (currentUser: User) => {
    try {
      // 1. Intentar obtener el perfil
      const { data, error } = await supabaseEtiquetas
        .from('table_profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (error) throw error;

      const now = new Date().toISOString();

      if (data) {
        // 2. Actualizar last_seen
        await supabaseEtiquetas
          .from('table_profiles')
          .update({ last_seen: now })
          .eq('id', currentUser.id);
        setProfile(data as Profile);
      } else {
        // 3. Crear perfil si no existe (Sincronización automática)
        const newProfile = {
          id: currentUser.id,
          email: currentUser.email,
          role: 'USER',
          last_seen: now
        };
        const { data: inserted, error: insertError } = await supabaseEtiquetas
          .from('table_profiles')
          .insert([newProfile])
          .select()
          .single();
        
        if (insertError) console.error("Error creating profile:", insertError);
        else setProfile(inserted as Profile);
      }
    } catch (err) {
      console.error("Profile sync error:", err);
    }
  };

  const signOut = async () => {
    await supabaseEtiquetas.auth.signOut();
    router.push('/login');
  };

  // Protección de rutas (Client Side)
  useEffect(() => {
    if (!loading) {
      const isPublicRoute = pathname === '/login';
      if (!session && !isPublicRoute) {
        router.push('/login');
      } else if (session && isPublicRoute) {
        router.push('/main');
      }
    }
  }, [session, loading, pathname, router]);

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut }}>
      {loading ? (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-[9999]">
          <Loader2 className="h-10 w-10 text-starbucks-green animate-spin mb-4" />
          <p className="text-sm font-bold text-gray-500 uppercase tracking-widest animate-pulse">Iniciando Sistema...</p>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
