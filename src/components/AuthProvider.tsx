'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
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
};

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

  useEffect(() => {
    // Carga inicial de sesión
    const initAuth = async () => {
      const { data: { session: initialSession } } = await supabaseEtiquetas.auth.getSession();
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      
      if (initialSession?.user) {
        await syncProfileAndRoles(initialSession.user);
      }
      
      setLoading(false);
    };

    initAuth();

    // Listener para cambios de estado de autenticación
    const { data: { subscription } } = supabaseEtiquetas.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await syncProfileAndRoles(session.user);
      } else {
        setProfile(null);
        setRoles([]);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const syncProfileAndRoles = async (currentUser: User) => {
    try {
      // 1. Obtener/Sincronizar Perfil Básico
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

      // 2. Obtener Roles RBAC (JOIN user_roles -> roles)
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
        // Extraer los códigos de los roles (un usuario puede tener múltiples)
        const codes = roleRecords
          .map((r: any) => r.roles?.code)
          .filter(Boolean);
        setRoles(codes);
      }
    } catch (err) {
      console.error("Error en sincronización de perfil/roles:", err);
    }
  };

  /**
   * Helper para verificar si el usuario tiene un rol específico.
   * El rol ADMIN siempre devuelve true.
   */
  const hasRole = (code: string) => {
    return roles.includes('ADMIN') || roles.includes(code);
  };

  const signOut = async () => {
    await supabaseEtiquetas.auth.signOut();
    router.push('/login');
  };

  // Protección de Rutas y RBAC Guard
  useEffect(() => {
    if (!loading) {
      const isPublicRoute = pathname === '/login';
      
      if (!session && !isPublicRoute) {
        router.push('/login');
        return;
      }

      if (session) {
        if (isPublicRoute) {
          router.push('/main');
        } else {
          // Lógica de Validación RBAC por Path
          const requiredRoles = ROUTE_PERMISSIONS[pathname];
          
          // Si la ruta requiere roles y el usuario no es ADMIN
          if (requiredRoles && !roles.includes('ADMIN')) {
            const hasPermission = requiredRoles.some(r => roles.includes(r));
            if (!hasPermission) {
              console.warn(`Acceso denegado para ${user?.email} en ${pathname}. Roles actuales: ${roles.join(', ')}`);
              // Redirigir al dashboard principal si no tiene permiso
              router.push('/main');
            }
          }
        }
      }
    }
  }, [session, loading, pathname, router, roles, user]);

  return (
    <AuthContext.Provider value={{ session, user, profile, roles, loading, signOut, hasRole }}>
      {loading ? (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-[9999]">
          <Loader2 className="h-10 w-10 text-starbucks-green animate-spin mb-4" />
          <p className="text-sm font-bold text-gray-500 uppercase tracking-widest animate-pulse">Validando Permisos...</p>
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
