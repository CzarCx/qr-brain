
'use client';

import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { supabaseDB2 } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UserPlus, CheckCircle, AlertTriangle } from 'lucide-react';

export default function RegistroPersonal() {
  const [name, setName] = useState('');
  const [rol, setRol] = useState('');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | null,
    message: string
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);

    if (!name.trim() || !rol) {
      setNotification({ type: 'error', message: 'Por favor, completa todos los campos.' });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabaseDB2
        .from('personal_name')
        .insert([{ name, rol }]);

      if (error) {
        throw error;
      }

      setNotification({ type: 'success', message: '¡Personal registrado exitosamente!' });
      setName('');
      setRol('');

    } catch (e: any) {
      console.error("Error al registrar personal:", e);
      setNotification({ type: 'error', message: `Error al registrar: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Registro de Personal</title>
      </Head>
      <main className="bg-starbucks-light-gray text-starbucks-dark min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto bg-starbucks-white rounded-xl shadow-2xl p-6 md:p-8 space-y-6">
          <header className="text-center">
            <UserPlus className="mx-auto h-16 w-16 text-starbucks-green mb-4" />
            <h1 className="text-2xl md:text-3xl font-bold text-starbucks-green">Registro de Personal</h1>
            <p className="text-gray-600 mt-1">Añade nuevos miembros al equipo.</p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-bold text-starbucks-dark">Nombre Completo:</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Juan Pérez"
                className="form-input"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rol" className="text-sm font-bold text-starbucks-dark">Rol:</Label>
              <Select onValueChange={setRol} value={rol} disabled={loading}>
                <SelectTrigger id="rol" className="form-input">
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="barra">Barra</SelectItem>
                  <SelectItem value="entrega">Entrega</SelectItem>
                  {/* Puedes añadir más roles aquí si es necesario */}
                </SelectContent>
              </Select>
            </div>

            {notification && (
              <Alert variant={notification.type === 'error' ? 'destructive' : 'default'} className={notification.type === 'success' ? 'border-green-500 text-green-700' : ''}>
                {notification.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                <AlertTitle>{notification.type === 'success' ? 'Éxito' : 'Error'}</AlertTitle>
                <AlertDescription>
                  {notification.message}
                </AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={loading} className="w-full bg-starbucks-accent hover:bg-starbucks-green text-white font-bold py-3">
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                  <span>Guardando...</span>
                </div>
              ) : (
                'Registrar Personal'
              )}
            </Button>
          </form>
        </div>
      </main>
    </>
  );
}
