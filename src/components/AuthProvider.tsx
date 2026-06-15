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
  const [isMetadataLoaded, setIsMetadataLoaded] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const isSyncing = useRef(false);

  const syncProfileAndRoles = async (currentUser: User) => {
    if (isSyncing.current) return;
    isSyncing.current = true;

    try {
      // Intentar cargar perfil y roles simultáneamente
      const [profileRes, rolesRes] = await Promise.all([
        supabaseEtiquetas.from('table_profiles').select('*').eq('id', currentUser.id).maybeSingle(),
        supabaseEtiquetas.from('user_roles').select('roles(code)').eq('user_id', currentUser.id)
      ]);

      let finalProfile = profileRes.data;

      // Si no hay perfil, crearlo (como usuario básico)
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
      }

      if (finalProfile) setProfile(finalProfile as Profile);

      if (rolesRes.data) {
        const codes = (rolesRes.data as any[])
          .map((r: any) => r.roles?.code)
          .filter(Boolean);
        setRoles(codes);
      }
      
      setIsMetadataLoaded(true);
    } catch (err) {
      console.error("Error en sincronización de sesión:", err);
      // Marcamos como cargado incluso con error para no bloquear la app infinitamente
      setIsMetadataLoaded(true);
    } finally {
      isSyncing.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        // Usar getUser() es más seguro al recargar que getSession()
        const { data: { user: initialUser }, error } = await supabaseEtiquetas.auth.getUser();
        
        if (initialUser) {
          setUser(initialUser);
          // Obtenemos la sesión para mantener compatibilidad
          const { data: { session: currentSession } } = await supabaseEtiquetas.auth.getSession();
          setSession(currentSession);
          await syncProfileAndRoles(initialUser);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("Auth init error:", err);
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabaseEtiquetas.auth.onAuthStateChange(async (event, currentSession) => {
      if (currentSession) {
        setSession(currentSession);
        setUser(currentSession.user);
        if (!isMetadataLoaded && !isSyncing.current) {
          await syncProfileAndRoles(currentSession.user);
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setProfile(null);
        setRoles([]);
        setLoading(false);
        setIsMetadataLoaded(false);
      }
    });

    // FAIL-SAFE: Desbloquear la pantalla de carga después de 6 segundos pase lo que pase
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn("Auth: Fail-safe timeout triggered. Unblocking UI.");
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

  // Lógica de redirección y protección de rutas
  useEffect(() => {
    // IMPORTANTE: No tomar decisiones de ruta si aún estamos cargando o recuperando metadatos
    if (loading || !isMetadataLoaded) return;

    const isPublicRoute = pathname === '/login';
    
    // Si no hay sesión, mandamos al login
    if (!user) {
      if (!isPublicRoute) router.replace('/login');
      return;
    }

    // Si hay sesión y estamos en login, mandamos a main
    if (isPublicRoute) {
      router.replace('/main');
      return;
    }

    // Si es ADMIN, tiene acceso total
    if (roles.includes('ADMIN')) return;

    // Verificar permisos específicos por ruta
    const requiredRoles = ROUTE_PERMISSIONS[pathname];
    if (requiredRoles && requiredRoles.length > 0) {
      const hasPermission = requiredRoles.some(r => roles.includes(r));
      if (!hasPermission && pathname !== '/main') {
        router.replace('/main');
      }
    }
  }, [user, loading, isMetadataLoaded, pathname, roles, router]);

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
                <p className="text-sm font-black text-gray-800 uppercase tracking-[0.3em] animate-pulse">Autenticando Acceso</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sincronizando con base de datos de etiquetas...</p>
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
