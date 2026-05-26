'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { Session, User } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';

/**
 * Mapeo de permisos por ruta. 
 * Define qué roles (roles.code) tienen acceso a cada path.
 */
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
  '/main': [], // Panel principal accesible para todos los usuarios logueados
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
  roles: string[]; // Códigos de roles (roles.code)
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

  useEffect(() => {
    const initAuth = async () => {
      if (isInitialized.current) return;
      isInitialized.current = true;

      try {
        const { data: { session: initialSession } } = await supabaseEtiquetas.auth.getSession();
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        
        if (initialSession?.user) {
          await syncProfileAndRoles(initialSession.user);
        }
      } catch (error) {
        console.error("Error inicializando sesión:", error);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabaseEtiquetas.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setLoading(true);
        await syncProfileAndRoles(session.user);
      } else {
        setProfile(null);
        setRoles([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const syncProfileAndRoles = async (currentUser: User) => {
    try {
      const { data: profileData, error: profileError } = await supabaseEtiquetas
        .from('table_profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (profileError) throw profileError;

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
        const { data: inserted, error: insertError } = await supabaseEtiquetas
          .from('table_profiles')
          .insert([newProfile])
          .select()
          .single();
        
        if (!insertError) setProfile(inserted as Profile);
      }

      const { data: roleRecords, error: roleError } = await supabaseEtiquetas
        .from('user_roles')
        .select(`
          roles (
            code
          )
        `)
        .eq('user_id', currentUser.id) as any;

      if (roleError) {
        console.error("Error al obtener roles del usuario:", roleError.message);
      } else if (roleRecords) {
        const codes = roleRecords
          .map((r: any) => r.roles?.code)
          .filter(Boolean);
        setRoles(codes);
      }
    } catch (err) {
      console.error("Error en sincronización de perfil/roles:", err);
    } finally {
        setLoading(false);
    }
  };

  /**
   * Helper para verificar si el usuario tiene un rol específico.
   * El rol ADMIN es un superusuario con acceso total.
   */
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
      if (!isPublicRoute) {
        router.replace('/login');
      }
      return;
    }

    if (session) {
      if (isPublicRoute) {
        router.replace('/main');
        return;
      }

      // Los administradores no tienen restricciones
      if (roles.includes('ADMIN')) return;

      const requiredRoles = ROUTE_PERMISSIONS[pathname];
      
      // Si la ruta tiene restricciones y el usuario no tiene los roles necesarios, redirigir al panel principal
      if (requiredRoles && requiredRoles.length > 0) {
        const hasPermission = requiredRoles.some(r => roles.includes(r));
        if (!hasPermission && pathname !== '/main') {
          router.replace('/main');
        }
      }
    }
  }, [session, loading, pathname, router, roles]);

  return (
    <AuthContext.Provider value={{ session, user, profile, roles, loading, signOut, hasRole }}>
      {loading ? (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-[9999]">
          <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
            <Loader2 className="h-12 w-12 text-starbucks-green animate-spin" />
            <p className="text-sm font-black text-gray-500 uppercase tracking-[0.2em]">Validando Permisos...</p>
          </div>
        </div>
      ) : (
          <>
            {/* Si no es ruta pública y no hay sesión pero loading es false, Next se encargará vía router.replace en el useEffect */}
            {children}
          </>
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
