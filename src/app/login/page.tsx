'use client';

import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/navigation';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  ShieldCheck, 
  Mail, 
  Lock, 
  Loader2, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  ArrowRight 
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
        <title>Acceso Seguro | Sistema de Control</title>
      </Head>
      <main className="min-h-screen flex items-center justify-center bg-[#f5f7f9] p-4 font-body">
        <div className="w-full max-w-md animate-in fade-in zoom-in duration-700">
          
          <Card className="shadow-[0_20px_50px_rgba(0,0,0,0.05)] border-none rounded-[2.5rem] overflow-hidden bg-white p-4 md:p-8">
            <CardHeader className="text-center pb-2 space-y-4">
              <div className="flex justify-center">
                <div className="bg-[#f0f9f4] p-4 rounded-2xl border border-[#e2f2eb]">
                   <ShieldCheck className="h-8 w-8 text-[#006241]" />
                </div>
              </div>
              <div className="space-y-1">
                <CardTitle className="text-3xl font-black text-[#1a1f36] tracking-tight">Acceso Seguro</CardTitle>
                <CardDescription className="text-gray-400 font-medium text-sm">
                  Ingresa tus credenciales para continuar
                </CardDescription>
              </div>
              <div className="flex justify-center">
                <div className="h-1 w-10 bg-[#006241]/20 rounded-full"></div>
              </div>
            </CardHeader>

            <CardContent className="pt-6">
              <form onSubmit={handleLogin} className="space-y-6">
                {error && (
                  <Alert variant="destructive" className="rounded-2xl border-none bg-red-50 text-red-600 animate-in slide-in-from-top-2 duration-300">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs font-bold">{error}</AlertDescription>
                  </Alert>
                )}
                
                <div className="space-y-3">
                  <Label htmlFor="email" className="text-[10px] font-black uppercase text-gray-400 tracking-[0.15em] ml-1">
                    Correo Electrónico
                  </Label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400">
                      <Mail className="h-full w-full" />
                    </div>
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="usuario@inmatmex.com" 
                      className="pl-12 h-14 bg-[#f7f9fc] border-none rounded-2xl focus-visible:ring-2 focus-visible:ring-[#006241]/20 text-gray-700 font-bold"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="password" className="text-[10px] font-black uppercase text-gray-400 tracking-[0.15em] ml-1">
                    Contraseña
                  </Label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400">
                      <Lock className="h-full w-full" />
                    </div>
                    <Input 
                      id="password" 
                      type={showPassword ? "text" : "password"} 
                      placeholder="••••••••" 
                      className="pl-12 pr-12 h-14 bg-[#f7f9fc] border-none rounded-2xl focus-visible:ring-2 focus-visible:ring-[#006241]/20 text-gray-700 font-bold"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="remember" className="rounded-full border-gray-300 data-[state=checked]:bg-[#006241] data-[state=checked]:border-[#006241]" />
                    <label htmlFor="remember" className="text-xs font-bold text-gray-500 cursor-pointer">
                      Recordarme
                    </label>
                  </div>
                  <button type="button" className="text-xs font-bold text-[#006241] hover:underline underline-offset-4">
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-14 bg-[#00422c] hover:bg-[#006241] text-white rounded-2xl font-black text-sm tracking-widest transition-all duration-300 shadow-lg shadow-[#00422c]/20 group"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <div className="flex items-center gap-2">
                      ENTRAR AL SISTEMA
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  )}
                </Button>
              </form>
            </CardContent>
            
            <CardFooter className="flex flex-col items-center justify-center pt-8 space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-black text-gray-300 uppercase tracking-widest">
                <ShieldCheck className="h-3 w-3" />
                Conexión segura y encriptada
              </div>
            </CardFooter>
          </Card>
          
          <div className="text-center mt-12">
            <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em]">INMATMEX • SISTEMA DE CONTROL</p>
          </div>
        </div>
      </main>
    </>
  );
}
