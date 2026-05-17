'use client';

import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/navigation';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Mail, Lock, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: authError } = await supabaseEtiquetas.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          throw new Error('Credenciales inválidas. Verifica tu correo y contraseña.');
        }
        throw authError;
      }

      router.push('/main');
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al intentar iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Acceso al Sistema | Control de Producción</title>
      </Head>
      <main className="min-h-screen flex items-center justify-center bg-starbucks-light-gray p-4">
        <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
          <div className="flex justify-center mb-8">
            <div className="bg-starbucks-green p-4 rounded-3xl shadow-xl transform -rotate-3 transition-transform hover:rotate-0">
               <ShieldCheck className="h-12 w-12 text-white" />
            </div>
          </div>
          
          <Card className="shadow-2xl border-none overflow-hidden">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl font-black text-starbucks-dark tracking-tighter">SISTEMA DE CONTROL</CardTitle>
              <CardDescription className="text-gray-400 font-bold uppercase text-[10px] tracking-widest mt-1">Acceso Administrativo y Operativo</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-5 pt-4">
                {error && (
                  <Alert variant="destructive" className="animate-in slide-in-from-top-2 duration-300">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error de Acceso</AlertTitle>
                    <AlertDescription className="text-xs">{error}</AlertDescription>
                  </Alert>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[10px] font-black uppercase text-gray-500 ml-1">Correo Electrónico</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="usuario@empresa.com" 
                      className="pl-10 h-12 bg-gray-50/50"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center ml-1">
                    <Label htmlFor="password" className="text-[10px] font-black uppercase text-gray-500">Contraseña</Label>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input 
                      id="password" 
                      type="password" 
                      placeholder="••••••••" 
                      className="pl-10 h-12 bg-gray-50/50"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 bg-starbucks-green hover:bg-starbucks-dark text-white font-black tracking-tighter transition-all"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    'ENTRAR AL SISTEMA'
                  )}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="bg-gray-50 border-t flex justify-center py-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase">Seguridad Protegida por Supabase</p>
            </CardFooter>
          </Card>
          
          <div className="text-center mt-8">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">INMATMEX • PALO DE ROSA • TOLEXAL</p>
          </div>
        </div>
      </main>
    </>
  );
}
