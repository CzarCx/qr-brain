'use client';

import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { supabase } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UserPlus, CheckCircle, AlertTriangle, Edit, Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';


type Personal = {
  id: number;
  name: string;
  rol: string;
  organization: string;
};

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

  const [personalList, setPersonalList] = useState<Personal[]>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingPersonal, setEditingPersonal] = useState<Personal | null>(null);
  
  // State for the fields in the edit dialog
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName1, setEditLastName1] = useState('');
  const [editLastName2, setEditLastName2] = useState('');
  const [editRol, setEditRol] = useState('');
  const [editOrganization, setEditOrganization] = useState('');

  const fetchPersonal = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('personal_name')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      setNotification({ type: 'error', message: 'Error al cargar el personal.' });
    } else {
      setPersonalList(data as Personal[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPersonal();
  }, [fetchPersonal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);

    if (!firstName.trim() || !lastName1.trim() || !rol || !organization) {
      setNotification({ type: 'error', message: 'Por favor, completa Nombre, Primer Apellido, Rol y Empresa.' });
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
      fetchPersonal(); // Refresh list

    } catch (e: any) {
      console.error("Error al registrar personal:", e);
      const errorMessage = e.message || (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
      setNotification({ type: 'error', message: `Error al registrar: ${errorMessage}` });
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (personal: Personal) => {
    setEditingPersonal(personal);
    const nameParts = personal.name.split(' ');
    const lastName2 = nameParts.length > 2 ? nameParts.pop() || '' : '';
    const lastName1 = nameParts.length > 1 ? nameParts.pop() || '' : '';
    const firstName = nameParts.join(' ');
    
    setEditFirstName(firstName);
    setEditLastName1(lastName1);
    setEditLastName2(lastName2);
    setEditRol(personal.rol);
    setEditOrganization(personal.organization);
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingPersonal) return;
    setLoading(true);
    const fullName = [editFirstName.trim(), editLastName1.trim(), editLastName2.trim()].filter(Boolean).join(' ');
    const { error } = await supabase
      .from('personal_name')
      .update({ name: fullName, rol: editRol, organization: editOrganization })
      .eq('id', editingPersonal.id);
    
    if (error) {
      setNotification({ type: 'error', message: `Error al actualizar: ${error.message}` });
    } else {
      setNotification({ type: 'success', message: 'Personal actualizado exitosamente.' });
      setIsEditDialogOpen(false);
      setEditingPersonal(null);
      fetchPersonal(); // Refresh list
    }
    setLoading(false);
  };

  const handleDelete = async (id: number) => {
    setLoading(true);
    const { error } = await supabase
      .from('personal_name')
      .delete()
      .eq('id', id);

    if (error) {
      setNotification({ type: 'error', message: `Error al eliminar: ${error.message}` });
    } else {
      setNotification({ type: 'success', message: 'Registro eliminado exitosamente.' });
      fetchPersonal(); // Refresh list
    }
    setLoading(false);
  };

  return (
    <>
      <Head>
        <title>Gestión de Personal</title>
      </Head>
      <div className="text-starbucks-dark container mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          
          <div className="lg:col-span-2">
             <Card className="w-full sticky top-24">
              <CardHeader className="text-center">
                <UserPlus className="mx-auto h-12 w-12 text-starbucks-green" />
                <CardTitle className="text-2xl md:text-3xl font-bold text-starbucks-green">Registro de Personal</CardTitle>
                <CardDescription>Añade nuevos miembros al equipo.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-sm font-bold text-starbucks-dark">Nombre(s):</Label>
                    <Input id="firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Ej. Juan" className="form-input" disabled={loading} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="lastName1" className="text-sm font-bold text-starbucks-dark">Primer Apellido:</Label>
                        <Input id="lastName1" type="text" value={lastName1} onChange={(e) => setLastName1(e.target.value)} placeholder="Ej. Pérez" className="form-input" disabled={loading}/>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName2" className="text-sm font-bold text-starbucks-dark">Segundo Apellido:</Label>
                        <Input id="lastName2" type="text" value={lastName2} onChange={(e) => setLastName2(e.target.value)} placeholder="Ej. García (Opcional)" className="form-input" disabled={loading}/>
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
                        <SelectItem value="Control de calidad">Control de calidad</SelectItem>
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
                  <Button type="submit" disabled={loading} className="w-full bg-starbucks-accent hover:bg-starbucks-green text-white font-bold py-3">
                    {loading ? 'Guardando...' : 'Registrar Personal'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>Personal Registrado</CardTitle>
                <CardDescription>Lista del personal actual. Desde aquí puedes editar o eliminar registros.</CardDescription>
              </CardHeader>
              <CardContent>
                {notification && (
                  <Alert variant={notification.type === 'error' ? 'destructive' : 'default'} className={`mb-4 ${notification.type === 'success' ? 'border-green-500 text-green-700' : ''}`}>
                    {notification.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                    <AlertTitle>{notification.type === 'success' ? 'Éxito' : 'Error'}</AlertTitle>
                    <AlertDescription>
                      {notification.message}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="border rounded-lg max-h-[60vh] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-starbucks-cream z-10">
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Rol</TableHead>
                          <TableHead>Empresa</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading && personalList.length === 0 ? (
                            <TableRow><TableCell colSpan={4} className="text-center py-8">Cargando...</TableCell></TableRow>
                        ) : personalList.length > 0 ? personalList.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell>{p.rol}</TableCell>
                            <TableCell>{p.organization}</TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEditClick(p)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta acción no se puede deshacer. Se eliminará permanentemente el registro de <span className="font-bold">{p.name}</span>.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(p.id)} className="bg-destructive hover:bg-destructive/90">Eliminar</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          </TableRow>
                        )) : (
                           <TableRow><TableCell colSpan={4} className="text-center py-8">No hay personal registrado.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Personal</DialogTitle>
              <DialogDescription>
                Modifica los datos del registro. Haz clic en guardar cuando termines.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-firstName">Nombre(s)</Label>
                <Input id="edit-firstName" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} disabled={loading} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-lastName1">Primer Apellido</Label>
                    <Input id="edit-lastName1" value={editLastName1} onChange={(e) => setEditLastName1(e.target.value)} disabled={loading} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-lastName2">Segundo Apellido</Label>
                    <Input id="edit-lastName2" value={editLastName2} onChange={(e) => setEditLastName2(e.target.value)} disabled={loading} />
                  </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-rol">Rol</Label>
                 <Select onValueChange={setEditRol} value={editRol} disabled={loading}>
                    <SelectTrigger id="edit-rol"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="barra">Barra</SelectItem>
                        <SelectItem value="entrega">Entrega</SelectItem>
                        <SelectItem value="operativo">Operativo</SelectItem>
                        <SelectItem value="Control de calidad">Control de calidad</SelectItem>
                    </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-organization">Empresa</Label>
                <Select onValueChange={setEditOrganization} value={editOrganization} disabled={loading}>
                    <SelectTrigger id="edit-organization"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="INMATMEX">INMATMEX</SelectItem>
                        <SelectItem value="PALO DE ROSA">PALO DE ROSA</SelectItem>
                        <SelectItem value="TOLEXAL">TOLEXAL</SelectItem>
                    </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleUpdate} disabled={loading}>
                {loading ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
