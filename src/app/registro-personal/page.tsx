'use client';

import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UserPlus, CheckCircle, AlertTriangle } from 'lucide-react';

export default function RegistroPersonal() {
  const [firstName, setFirstName] = useState('');
  const [lastName1, setLastName1] = useState('');
  const [lastName2, setLastName2] = useState('');
  const [rol, setRol] = useState('');
  const [organization, setOrganization] = useState('');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | null,
    message: string
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);

    if (!firstName.trim() || !lastName1.trim() || !lastName2.trim() || !rol || !organization) {
      setNotification({ type: 'error', message: 'Por favor, completa todos los campos.' });
      return;
    }

    setLoading(true);
    const fullName = [firstName.trim(), lastName1.trim(), lastName2.trim()].filter(Boolean).join(' ');


    try {
      const { error } = await supabase
        .from('personal_name')
        .insert([{ name: fullName, rol, organization }]);

      if (error) {
        throw error;
      }

      setNotification({ type: 'success', message: '¡Personal registrado exitosamente!' });
      setFirstName('');
      setLastName1('');
      setLastName2('');
      setRol('');
      setOrganization('');

    } catch (e: any) {
      console.error("Error al registrar personal:", e);
      let errorMessage = e.message || (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
      if (typeof errorMessage === 'string' && errorMessage.includes("Could not find the 'organization' column")) {
        errorMessage = "La columna 'organization' no se encuentra en la tabla 'personal_name'. Por favor, verifica que la columna exista en tu base de datos de Supabase.";
      }
      setNotification({ type: 'error', message: `Error al registrar: ${errorMessage}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Registro de Personal</title>
      </Head>
      <main className="text-starbucks-dark flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto bg-starbucks-white rounded-xl shadow-2xl p-6 md:p-8 space-y-6">
          <header className="text-center">
            <UserPlus className="mx-auto h-16 w-16 text-starbucks-green mb-4" />
            <h1 className="text-2xl md:text-3xl font-bold text-starbucks-green">Registro de Personal</h1>
            <p className="text-gray-600 mt-1">Añade nuevos miembros al equipo.</p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-sm font-bold text-starbucks-dark">Nombre(s):</Label>
              <Input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ej. Juan"
                className="form-input"
                disabled={loading}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lastName1" className="text-sm font-bold text-starbucks-dark">Primer Apellido:</Label>
                  <Input
                    id="lastName1"
                    type="text"
                    value={lastName1}
                    onChange={(e) => setLastName1(e.target.value)}
                    placeholder="Ej. Pérez"
                    className="form-input"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName2" className="text-sm font-bold text-starbucks-dark">Segundo Apellido:</Label>
                  <Input
                    id="lastName2"
                    type="text"
                    value={lastName2}
                    onChange={(e) => setLastName2(e.target.value)}
                    placeholder="Ej. García"
                    className="form-input"
                    disabled={loading}
                  />
                </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rol" className="text-sm font-bold text-starbucks-dark">Rol:</Label>
              <Select onValueChange={setRol} value={rol} disabled={loading}>
                <SelectTrigger id="rol" className="bg-transparent hover:bg-gray-50">
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="barra">Barra</SelectItem>
                  <SelectItem value="entrega">Entrega</SelectItem>
                  <SelectItem value="operativo">Operativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="organization" className="text-sm font-bold text-starbucks-dark">Empresa:</Label>
              <Select onValueChange={setOrganization} value={organization} disabled={loading}>
                <SelectTrigger id="organization" className="bg-transparent hover:bg-gray-50">
                  <SelectValue placeholder="Selecciona una empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INMATMEX">INMATMEX</SelectItem>
                  <SelectItem value="PALO DE ROSA">PALO DE ROSA</SelectItem>
                  <SelectItem value="TOLEXAL">TOLEXAL</SelectItem>
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
