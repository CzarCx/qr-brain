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
  const isSyncing = useRef(false);

  const syncProfileAndRoles = async (currentUser: User) => {
    if (isSyncing.current) return;
    isSyncing.current = true;

    try {
      const [profileRes, rolesRes] = await Promise.all([
        supabaseEtiquetas.from('table_profiles').select('*').eq('id', currentUser.id).maybeSingle(),
        supabaseEtiquetas.from('user_roles').select('roles(code)').eq('user_id', currentUser.id)
      ]);

      let finalProfile = profileRes.data;

      if (!finalProfile && !profileRes.error) {
        const { data: newProfile, error: createError } = await supabaseEtiquetas
          .from('table_profiles')
          .insert([{
            id: currentUser.id,
            email: currentUser.email,
            role: 'USER',
            last_seen: new Date().toISOString()
          }])
          .select()
          .single();
        
        if (!createError) finalProfile = newProfile;
      } else if (finalProfile) {
        supabaseEtiquetas
          .from('table_profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', currentUser.id)
          .then();
      }

      if (finalProfile) setProfile(finalProfile as Profile);

      if (rolesRes.data) {
        const codes = (rolesRes.data as any[])
          .map((r: any) => r.roles?.code)
          .filter(Boolean);
        setRoles(codes);
      }
    } catch (err) {
      console.error("Error en sincronización de sesión:", err);
    } finally {
      isSyncing.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Initial Session Check (Garantiza desbloqueo rápido)
    const initAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabaseEtiquetas.auth.getSession();
        if (initialSession) {
          setSession(initialSession);
          setUser(initialSession.user);
          await syncProfileAndRoles(initialSession.user);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("Auth init error:", err);
        setLoading(false);
      }
    };

    initAuth();

    // 2. Auth State Listener
    const { data: { subscription } } = supabaseEtiquetas.auth.onAuthStateChange(async (event, currentSession) => {
      if (currentSession) {
        setSession(currentSession);
        setUser(currentSession.user);
        await syncProfileAndRoles(currentSession.user);
      } else {
        setSession(null);
        setUser(null);
        setProfile(null);
        setRoles([]);
        setLoading(false);
      }
    });

    // 3. Safety Fail-safe (Evita quedarse atorado si Supabase no responde)
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn("Auth timeout reached. Unlocking UI.");
        setLoading(false);
      }
    }, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const hasRole = (code: string) => {
    return roles.includes('ADMIN') || roles.includes(code);
  };

  const signOut = async () => {
    setLoading(true);
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
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
                <Loader2 className="h-16 w-16 text-starbucks-green animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-6 w-6 bg-starbucks-green rounded-full animate-pulse" />
                </div>
            </div>
            <div className="text-center space-y-2">
                <p className="text-sm font-black text-gray-800 uppercase tracking-[0.3em] animate-pulse">Sincronizando Sesión</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Validando credenciales seguras...</p>
            </div>
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
