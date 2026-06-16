'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { Session, User } from '@supabase/supabase-js';
import { Loader2, Database, WifiOff, RefreshCw, UserCircle2, Save, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

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
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [isMetadataLoaded, setIsMetadataLoaded] = useState(false);
  
  // State for missing name prompt
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [newName, setNewName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  
  const router = useRouter();
  const pathname = usePathname();
  
  const isSyncing = useRef(false);
  const lastSyncedUserId = useRef<string | null>(null);

  /**
   * Verifica la conectividad real con la base de datos de etiquetas
   */
  const checkConnectivity = useCallback(async () => {
    setDbStatus('checking');
    try {
      const { error } = await supabaseEtiquetas.from('roles').select('id').limit(1);
      if (error) throw error;
      
      setDbStatus('connected');
      return true;
    } catch (err) {
      console.error('[AuthProvider] Error de conexión con BD Etiquetas:', err);
      setDbStatus('error');
      setLoading(false);
      return false;
    }
  }, []);

  /**
   * Sincroniza el perfil y roles del usuario desde la base de datos de etiquetas.
   */
  const syncProfileAndRoles = useCallback(async (currentUser: User) => {
    if (isSyncing.current) return;
    if (lastSyncedUserId.current === currentUser.id && isMetadataLoaded) {
      setLoading(false);
      return;
    }

    isSyncing.current = true;

    try {
      const [profileRes, rolesRes] = await Promise.all([
        supabaseEtiquetas.from('table_profiles').select('id, email, name, last_seen').eq('id', currentUser.id).maybeSingle(),
        supabaseEtiquetas.from('user_roles').select('roles(code)').eq('user_id', currentUser.id)
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data as Profile);
        // Show prompt if name is missing AND it's not guest mode
        if (!profileRes.data.name) {
          setShowNamePrompt(true);
        }
      }

      if (rolesRes.data) {
        const codes = (rolesRes.data as any[])
          .map((r: any) => r.roles?.code)
          .filter(Boolean);
        setRoles(codes);
      }
      
      lastSyncedUserId.current = currentUser.id;
      setIsMetadataLoaded(true);
    } catch (err) {
      console.error("[AuthProvider] Error en sincronización:", err);
    } finally {
      isSyncing.current = false;
      setLoading(false);
    }
  }, [isMetadataLoaded]);

  useEffect(() => {
    if (dbStatus === 'checking') {
      checkConnectivity();
    }
  }, [dbStatus, checkConnectivity]);

  useEffect(() => {
    if (dbStatus !== 'connected') return;

    const guestMode = typeof window !== 'undefined' && localStorage.getItem('auth_guest_mode') === 'true';
    if (guestMode) {
      setIsGuest(true);
      setLoading(false);
      return;
    }

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
        console.error("[AuthProvider] Error en rehidratación:", err);
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabaseEtiquetas.auth.onAuthStateChange(async (event, currentSession) => {
      if (currentSession) {
        setSession(currentSession);
        setUser(currentSession.user);
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
        
        if (event === 'SIGNED_OUT' && !localStorage.getItem('auth_guest_mode')) {
          router.replace('/login');
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [dbStatus, syncProfileAndRoles, router]);

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
      setShowNamePrompt(false);
      router.replace('/login');
    } catch (err) {
      console.error("[AuthProvider] Error durante logout:", err);
      window.location.href = '/login';
    } finally {
      setTimeout(() => setLoading(false), 500);
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

  const handleSaveName = async () => {
    if (!newName.trim() || !user) return;
    
    setIsSavingName(true);
    try {
      const { error } = await supabaseEtiquetas
        .from('table_profiles')
        .update({ name: newName.trim().toUpperCase() })
        .eq('id', user.id);

      if (error) throw error;

      setProfile(prev => prev ? { ...prev, name: newName.trim().toUpperCase() } : null);
      setShowNamePrompt(false);
    } catch (err: any) {
      alert("No se pudo guardar el nombre: " + err.message);
    } finally {
      setIsSavingName(false);
    }
  };

  useEffect(() => {
    if (loading || dbStatus !== 'connected') return;

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

    if (isMetadataLoaded && !roles.includes('ADMIN')) {
      const requiredRoles = ROUTE_PERMISSIONS[pathname];
      if (requiredRoles && requiredRoles.length > 0) {
        const hasPermission = requiredRoles.some(r => roles.includes(r));
        if (!hasPermission && pathname !== '/main') {
          router.replace('/main');
        }
      }
    }
  }, [user, loading, isMetadataLoaded, pathname, roles, router, isGuest, dbStatus]);

  if (dbStatus === 'checking') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-[9999]">
        <div className="flex flex-col items-center gap-6 animate-in fade-in duration-500">
          <div className="relative">
            <Database className="h-12 w-12 text-starbucks-green animate-pulse" />
            <Loader2 className="h-20 w-20 text-starbucks-green/20 animate-spin absolute -top-4 -left-4" />
          </div>
          <div className="text-center space-y-2">
            <p className="text-sm font-black text-gray-800 uppercase tracking-[0.3em]">Validando Conexión</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Estableciendo enlace con BD Etiquetas...</p>
          </div>
        </div>
      </div>
    );
  }

  if (dbStatus === 'error') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#f5f7f9] p-4 z-[9999]">
        <div className="w-full max-w-md space-y-6 animate-in fade-in zoom-in duration-500">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border-none text-center space-y-6">
            <div className="flex justify-center">
              <div className="bg-red-50 p-6 rounded-full">
                <WifiOff className="h-12 w-12 text-red-500" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Error de Conexión</h2>
              <p className="text-sm text-gray-500 font-medium leading-relaxed px-4">
                No fue posible conectar con <span className="font-bold text-gray-700">BD Etiquetas</span>.<br />
                Verifique la disponibilidad de la base de datos e intente nuevamente.
              </p>
            </div>
            
            <Alert variant="destructive" className="bg-red-50/50 border-red-100 text-left rounded-2xl py-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-1">Estado del Sistema</div>
              <AlertDescription className="text-xs font-bold text-red-600">Servicio de datos no disponible temporalmente.</AlertDescription>
            </Alert>

            <Button 
              onClick={() => checkConnectivity()} 
              className="w-full h-14 bg-starbucks-green hover:bg-starbucks-dark text-white rounded-2xl font-black text-sm tracking-widest transition-all gap-2 shadow-lg shadow-starbucks-green/20"
            >
              <RefreshCw className="h-4 w-4" />
              REINTENTAR CONEXIÓN
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
        <>
          {children}
          
          {/* Global Modal for missing Name in Profile */}
          {showNamePrompt && !isGuest && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[1000] p-4">
              <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 w-full max-w-[340px] animate-in fade-in zoom-in duration-300">
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="p-4 rounded-3xl bg-starbucks-cream text-starbucks-green">
                    <UserCircle2 className="h-10 w-10" />
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Completar Perfil</h3>
                    <p className="text-sm text-gray-500 font-medium leading-relaxed">
                      Para continuar, por favor ingresa tu <span className="font-bold">nombre completo</span>. Este se usará para tus registros en el sistema.
                    </p>
                  </div>

                  <div className="w-full space-y-4">
                    <Input 
                      placeholder="Ej. Juan Pérez García" 
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="h-12 rounded-2xl font-bold text-center uppercase focus-visible:ring-starbucks-green/20"
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                    />
                    
                    <Button 
                      onClick={handleSaveName}
                      disabled={isSavingName || !newName.trim()}
                      className="w-full h-12 rounded-2xl bg-starbucks-green hover:bg-starbucks-dark text-white font-black text-xs tracking-widest transition-all shadow-lg shadow-starbucks-green/20"
                    >
                      {isSavingName ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4" />
                          GUARDAR Y CONTINUAR
                        </div>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
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