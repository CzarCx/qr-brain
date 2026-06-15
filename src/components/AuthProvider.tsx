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
   * Utiliza la nueva estructura: user_roles -> roles(code)
   */
  const syncProfileAndRoles = useCallback(async (currentUser: User) => {
    if (isSyncing.current) return;
    
    // Si ya cargamos metadatos para este usuario, no repetir a menos que cambie
    if (lastSyncedUserId.current === currentUser.id && isMetadataLoaded) {
      setLoading(false);
      return;
    }

    isSyncing.current = true;
    console.log('[AuthProvider] Diagnostic: Sincronizando metadatos para:', currentUser.email);

    try {
      // Consultas en paralelo para optimizar tiempo de carga
      // NOTA: Se eliminó el campo 'role' de table_profiles ya que fue migrado a user_roles
      const [profileRes, rolesRes] = await Promise.all([
        supabaseEtiquetas.from('table_profiles').select('id, email, name, last_seen').eq('id', currentUser.id).maybeSingle(),
        supabaseEtiquetas.from('user_roles').select('roles(code)').eq('user_id', currentUser.id)
      ]);

      if (profileRes.error) console.error("[AuthProvider] Error cargando perfil:", profileRes.error.message);
      if (rolesRes.error) console.error("[AuthProvider] Error cargando roles:", rolesRes.error.message);

      if (profileRes.data) {
        setProfile(profileRes.data as Profile);
      }

      if (rolesRes.data) {
        const codes = (rolesRes.data as any[])
          .map((r: any) => r.roles?.code)
          .filter(Boolean);
        setRoles(codes);
        console.log("[AuthProvider] Roles detectados:", codes);
      }
      
      lastSyncedUserId.current = currentUser.id;
      setIsMetadataLoaded(true);
    } catch (err) {
      console.error("[AuthProvider] Excepción crítica en sincronización de sesión:", err);
    } finally {
      isSyncing.current = false;
      setLoading(false);
      
      // Log de diagnóstico final
      console.log('--- SESSION DIAGNOSTIC ---');
      console.log('USER:', currentUser.id);
      console.log('ROLES:', rolesRes?.data ? 'OK' : 'EMPTY');
      console.log('METADATA_LOADED:', true);
      console.log('LOADING_STATE:', false);
    }
  }, [isMetadataLoaded]);

  useEffect(() => {
    // 1. Verificación de modo invitado
    const guestMode = typeof window !== 'undefined' && localStorage.getItem('auth_guest_mode') === 'true';
    if (guestMode) {
      setIsGuest(true);
      setLoading(false);
      return;
    }

    // 2. Temporizador de seguridad para evitar Loading infinito
    const safetyTimeout = setTimeout(() => {
      if (loading) {
        console.warn("[AuthProvider] Fail-safe activado: Tiempo de espera agotado.");
        setLoading(false);
      }
    }, 12000);

    // 3. Inicialización proactiva de sesión
    const initAuth = async () => {
      try {
        const { data: { session: initialSession }, error } = await supabaseEtiquetas.auth.getSession();
        
        if (error) throw error;

        if (initialSession) {
          console.log("[AuthProvider] Sesión persistente recuperada");
          setSession(initialSession);
          setUser(initialSession.user);
          await syncProfileAndRoles(initialSession.user);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("[AuthProvider] Error en rehidratación de sesión:", err);
        setLoading(false);
      }
    };

    initAuth();

    // 4. Escuchador de eventos de autenticación
    const { data: { subscription } } = supabaseEtiquetas.auth.onAuthStateChange(async (event, currentSession) => {
      console.log("[AuthProvider] Evento de Supabase:", event);

      if (currentSession) {
        setSession(currentSession);
        setUser(currentSession.user);
        
        // Sincronizar solo si el usuario cambió o si es un evento crítico como refresco de token
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          await syncProfileAndRoles(currentSession.user);
        }
      } else {
        setSession(null);
        setUser(null);
        setProfile(null);
        setRoles([]);
        setLoading(false);
        setIsMetadataLoaded(false);
        lastSyncedUserId.current = null;
        
        if (event === 'SIGNED_OUT') {
           router.replace('/login');
        }
      }
    });

    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, [syncProfileAndRoles, router]);

  /**
   * Cierre de sesión seguro y limpieza de caché.
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
      console.error("[AuthProvider] Error durante el logout:", err);
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
   * Protección de rutas
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

    // Validación estricta de permisos basada en la nueva estructura de roles
    if (isMetadataLoaded && !roles.includes('ADMIN')) {
      const requiredRoles = ROUTE_PERMISSIONS[pathname];
      if (requiredRoles && requiredRoles.length > 0) {
        const hasPermission = requiredRoles.some(r => roles.includes(r));
        if (!hasPermission && pathname !== '/main') {
          console.warn(`[AuthProvider] Acceso denegado a ${pathname}.`);
          router.replace('/main');
        }
      }
    }
  }, [user, loading, isMetadataLoaded, pathname, roles, router, isGuest]);

  return (
    <AuthContext.Provider value={{ session, user, profile, roles, loading, isGuest, signOut, continueAsGuest, hasRole }}>
      {loading ? (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-[9999]">
          <div className="flex flex-col items-center gap-6 animate-in fade-in duration-500">
            <div className="relative">
                <Loader2 className="h-16 w-16 text-starbucks-green animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-6 w-6 bg-starbucks-green rounded-full animate-pulse" />
                </div>
            </div>
            <div className="text-center space-y-2">
                <p className="text-sm font-black text-gray-800 uppercase tracking-[0.3em] animate-pulse">Sincronizando Accesos</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Validando permisos de producción...</p>
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