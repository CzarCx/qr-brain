
'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
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
  isGuest: boolean;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
  hasRole: (code: string) => boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [isMetadataLoaded, setIsMetadataLoaded] = useState(false);
  
  const router = useRouter();
  const pathname = usePathname();
  
  const isSyncing = useRef(false);
  const lastSyncedUserId = useRef<string | null>(null);

  /**
   * Sincroniza el perfil y roles del usuario desde la base de datos de etiquetas.
   */
  const syncProfileAndRoles = useCallback(async (currentUser: User) => {
    // Evitar múltiples sincronizaciones simultáneas o redundantes para el mismo usuario
    if (isSyncing.current || (lastSyncedUserId.current === currentUser.id && isMetadataLoaded)) {
      setLoading(false);
      return;
    }

    isSyncing.current = true;
    console.log("[AuthProvider] Sincronizando metadatos para:", currentUser.email);

    try {
      // Consultas en paralelo para optimizar tiempo de carga
      const [profileRes, rolesRes] = await Promise.all([
        supabaseEtiquetas.from('table_profiles').select('*').eq('id', currentUser.id).maybeSingle(),
        supabaseEtiquetas.from('user_roles').select('roles(code)').eq('user_id', currentUser.id)
      ]);

      if (profileRes.error) console.warn("[AuthProvider] Error cargando perfil:", profileRes.error.message);
      if (rolesRes.error) console.warn("[AuthProvider] Error cargando roles:", rolesRes.error.message);

      if (profileRes.data) {
        setProfile(profileRes.data as Profile);
      }

      if (rolesRes.data) {
        const codes = (rolesRes.data as any[])
          .map((r: any) => r.roles?.code)
          .filter(Boolean);
        setRoles(codes);
        console.log("[AuthProvider] Roles cargados:", codes);
      }
      
      lastSyncedUserId.current = currentUser.id;
      setIsMetadataLoaded(true);
    } catch (err) {
      console.error("[AuthProvider] Excepción crítica en sincronización:", err);
    } finally {
      isSyncing.current = false;
      setLoading(false);
    }
  }, [isMetadataLoaded]);

  useEffect(() => {
    // 1. Verificación de modo invitado (prioridad alta para flujo rápido)
    const guestMode = localStorage.getItem('auth_guest_mode') === 'true';
    if (guestMode) {
      setIsGuest(true);
      setLoading(false);
      return;
    }

    // 2. Fallback de seguridad: Si después de 12 segundos el sistema sigue bloqueado, forzar desbloqueo.
    // Esto previene que una consulta colgada o una red lenta bloquee la app permanentemente.
    const safetyTimeout = setTimeout(() => {
      if (loading) {
        console.warn("[AuthProvider] Tiempo de espera de inicialización agotado. Forzando desbloqueo de UI.");
        setLoading(false);
      }
    }, 12000);

    // 3. Inicialización proactiva de sesión
    const initAuth = async () => {
      try {
        const { data: { session: initialSession }, error } = await supabaseEtiquetas.auth.getSession();
        
        if (error) throw error;

        if (initialSession) {
          setSession(initialSession);
          setUser(initialSession.user);
          await syncProfileAndRoles(initialSession.user);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("[AuthProvider] Error en inicialización proactiva:", err);
        setLoading(false);
      }
    };

    initAuth();

    // 4. Escuchador de cambios de estado de autenticación (Maneja login, logout y refresco de tokens)
    const { data: { subscription } } = supabaseEtiquetas.auth.onAuthStateChange(async (event, currentSession) => {
      console.log("[AuthProvider] Evento de Auth detectado:", event);

      if (currentSession) {
        setSession(currentSession);
        setUser(currentSession.user);
        
        // Sincronizar en eventos clave si no se ha hecho
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
          if (lastSyncedUserId.current !== currentSession.user.id) {
            await syncProfileAndRoles(currentSession.user);
          }
        }
      } else {
        // Limpieza de estados si no hay sesión
        setSession(null);
        setUser(null);
        setProfile(null);
        setRoles([]);
        setLoading(false);
        setIsMetadataLoaded(false);
        lastSyncedUserId.current = null;
      }
    });

    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, [syncProfileAndRoles]); // Dependencia estable

  /**
   * Cierre de sesión seguro.
   */
  const signOut = async () => {
    setLoading(true);
    try {
      localStorage.removeItem('auth_guest_mode');
      setIsGuest(false);
      await supabaseEtiquetas.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
      setRoles([]);
      lastSyncedUserId.current = null;
      setIsMetadataLoaded(false);
      router.replace('/login');
    } catch (err) {
      console.error("[AuthProvider] Error al cerrar sesión:", err);
    } finally {
      setLoading(false);
    }
  };

  const continueAsGuest = () => {
    localStorage.setItem('auth_guest_mode', 'true');
    setIsGuest(true);
    setLoading(false);
    router.push('/main');
  };

  const hasRole = (code: string) => {
    if (isGuest) return true;
    return roles.includes('ADMIN') || roles.includes(code);
  };

  /**
   * Lógica de protección de rutas y redirecciones.
   */
  useEffect(() => {
    if (loading) return;

    const isPublicRoute = pathname === '/login';
    
    if (isGuest) {
      if (isPublicRoute) router.replace('/main');
      return;
    }

    if (!user) {
      if (!isPublicRoute) router.replace('/login');
      return;
    }

    if (isPublicRoute) {
      router.replace('/main');
      return;
    }

    // Validación de permisos por ruta
    if (isMetadataLoaded && !roles.includes('ADMIN')) {
      const requiredRoles = ROUTE_PERMISSIONS[pathname];
      if (requiredRoles && requiredRoles.length > 0) {
        const hasPermission = requiredRoles.some(r => roles.includes(r));
        if (!hasPermission && pathname !== '/main') {
          console.warn(`[AuthProvider] Acceso denegado a ${pathname}. Redirigiendo...`);
          router.replace('/main');
        }
      }
    }
  }, [user, loading, isMetadataLoaded, pathname, roles, router, isGuest]);

  return (
    <AuthContext.Provider value={{ session, user, profile, roles, loading, isGuest, signOut, continueAsGuest, hasRole }}>
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
                <p className="text-sm font-black text-gray-800 uppercase tracking-[0.3em] animate-pulse">Sincronizando Accesos</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Validando credenciales de etiquetas...</p>
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
