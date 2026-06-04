'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { Session, User } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';

export const ROUTE_PERMISSIONS: Record<string, string[]> = {
  '/': ['BAR_MANAGER'],
  '/almacen': ['WAREHOUSE_MANAGER'],
  '/ppc': ['USER'],
  '/calificar': ['QUALITY_CONTROL'],
  '/entrega': ['DELIVERY_MANAGER'],
  '/devoluciones': ['DELIVERY_MANAGER'],
  '/sewing-tickets': ['SEWING_MANAGER'],
  '/sewing-tickets/impresos': ['SEWING_MANAGER'],
  '/sewing-tickets/status': ['SEWING_MANAGER'],
  '/registro-personal': ['ADMIN'],
  '/main': [],
};

type Profile = {
  id: string;
  email: string | null;
  name: string | null;
  role: 'ADMIN' | 'USER';
  last_seen: string | null;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: string[];
  loading: boolean;
  signOut: () => Promise<void>;
  hasRole: (code: string) => boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const isInitialized = useRef(false);

  const syncProfileAndRoles = async (currentUser: User) => {
    try {
      const { data: profileData } = await supabaseEtiquetas
        .from('table_profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      const now = new Date().toISOString();

      if (profileData) {
        await supabaseEtiquetas
          .from('table_profiles')
          .update({ last_seen: now })
          .eq('id', currentUser.id);
        setProfile(profileData as Profile);
      } else {
        const newProfile = {
          id: currentUser.id,
          email: currentUser.email,
          role: 'USER',
          last_seen: now
        };
        const { data: inserted } = await supabaseEtiquetas
          .from('table_profiles')
          .insert([newProfile])
          .select()
          .single();
        
        if (inserted) setProfile(inserted as Profile);
      }

      const { data: roleRecords } = await supabaseEtiquetas
        .from('user_roles')
        .select(`
          roles (
            code
          )
        `)
        .eq('user_id', currentUser.id);

      if (roleRecords) {
        const codes = (roleRecords as any[])
          .map((r: any) => r.roles?.code)
          .filter(Boolean);
        setRoles(codes);
      }
    } catch (err) {
      console.error("Error en sincronización de perfil:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      if (isInitialized.current) return;
      isInitialized.current = true;

      try {
        const { data: { session: initialSession } } = await supabaseEtiquetas.auth.getSession();
        if (initialSession) {
          setSession(initialSession);
          setUser(initialSession.user);
          await syncProfileAndRoles(initialSession.user);
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error("Error inicializando sesión:", error);
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabaseEtiquetas.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'SIGNED_IN' && currentSession) {
        setSession(currentSession);
        setUser(currentSession.user);
        await syncProfileAndRoles(currentSession.user);
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setProfile(null);
        setRoles([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const hasRole = (code: string) => {
    return roles.includes('ADMIN') || roles.includes(code);
  };

  const signOut = async () => {
    await supabaseEtiquetas.auth.signOut();
    router.push('/login');
  };

  useEffect(() => {
    if (loading) return;

    const isPublicRoute = pathname === '/login';
    
    if (!session) {
      if (!isPublicRoute) router.replace('/login');
      return;
    }

    if (isPublicRoute) {
      router.replace('/main');
      return;
    }

    if (roles.includes('ADMIN')) return;

    const requiredRoles = ROUTE_PERMISSIONS[pathname];
    if (requiredRoles && requiredRoles.length > 0) {
      const hasPermission = requiredRoles.some(r => roles.includes(r));
      if (!hasPermission && pathname !== '/main') {
        router.replace('/main');
      }
    }
  }, [session, loading, pathname, roles, router]);

  return (
    <AuthContext.Provider value={{ session, user, profile, roles, loading, signOut, hasRole }}>
      {loading ? (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-[9999]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 text-starbucks-green animate-spin" />
            <p className="text-sm font-black text-gray-500 uppercase tracking-widest">Iniciando Sistema...</p>
          </div>
        </div>
      ) : (
        <>{children}</>
      )}
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
