
'use client';

import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { supabase, supabaseEtiquetas } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UserPlus, CheckCircle, AlertTriangle, Edit, Trash2, Clock } from 'lucide-react';
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
  checkin_time: string | null;
  checkout_time: string | null;
  break_time_i: string | null;
  break_time_f: string | null;
};

export default function RegistroPersonal() {
  const [firstName, setFirstName] = useState('');
  const [lastName1, setLastName1] = useState('');
  const [lastName2, setLastName2] = useState('');
  const [rol, setRol] = useState('');
  const [organization, setOrganization] = useState('');
  const [checkinTime, setCheckinTime] = useState('');
  const [checkoutTime, setCheckoutTime] = useState('');
  const [breakTimeI, setBreakTimeI] = useState('');
  const [breakTimeF, setBreakTimeF] = useState('');
  
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
  const [editCheckinTime, setEditCheckinTime] = useState('');
  const [editCheckoutTime, setEditCheckoutTime] = useState('');
  const [editBreakTimeI, setEditBreakTimeI] = useState('');
  const [editBreakTimeF, setEditBreakTimeF] = useState('');

  const fetchPersonal = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabaseEtiquetas
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
      const { error } = await supabaseEtiquetas
        .from('personal_name')
        .insert([{ 
            name: fullName, 
            rol, 
            organization,
            checkin_time: checkinTime || null,
            checkout_time: checkoutTime || null,
            break_time_i: breakTimeI || null,
            break_time_f: breakTimeF || null
        }]);

      if (error) {
        throw error;
      }

      setNotification({ type: 'success', message: '¡Personal registrado exitosamente!' });
      setFirstName('');
      setLastName1('');
      setLastName2('');
      setRol('');
      setOrganization('');
      setCheckinTime('');
      setCheckoutTime('');
      setBreakTimeI('');
      setBreakTimeF('');
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
    // Intentar reconstruir apellidos (esto es aproximado debido a que guardamos full name)
    const ln2 = nameParts.length > 2 ? nameParts.pop() || '' : '';
    const ln1 = nameParts.length > 1 ? nameParts.pop() || '' : '';
    const fn = nameParts.join(' ');
    
    setEditFirstName(fn);
    setEditLastName1(ln1);
    setEditLastName2(ln2);
    setEditRol(personal.rol);
    setEditOrganization(personal.organization);
    setEditCheckinTime(personal.checkin_time || '');
    setEditCheckoutTime(personal.checkout_time || '');
    setEditBreakTimeI(personal.break_time_i || '');
    setEditBreakTimeF(personal.break_time_f || '');
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingPersonal) return;
    setLoading(true);
    const fullName = [editFirstName.trim(), editLastName1.trim(), editLastName2.trim()].filter(Boolean).join(' ');
    const { error } = await supabaseEtiquetas
      .from('personal_name')
      .update({ 
          name: fullName, 
          rol: editRol, 
          organization: editOrganization,
          checkin_time: editCheckinTime || null,
          checkout_time: editCheckoutTime || null,
          break_time_i: editBreakTimeI || null,
          break_time_f: editBreakTimeF || null
      })
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
    const { error } = await supabaseEtiquetas
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
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="rol" className="text-sm font-bold text-starbucks-dark">Rol:</Label>
                        <Select onValueChange={setRol} value={rol} disabled={loading}>
                          <SelectTrigger id="rol" className="bg-transparent hover:bg-gray-50">
                            <SelectValue placeholder="Rol" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="barra">Barra</SelectItem>
                            <SelectItem value="almacenista">Almacenista</SelectItem>
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
                            <SelectValue placeholder="Empresa" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="INMATMEX">INMATMEX</SelectItem>
                            <SelectItem value="PALO DE ROSA">PALO DE ROSA</SelectItem>
                            <SelectItem value="TOLEXAL">TOLEXAL</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                  </div>

                  <div className="p-4 bg-starbucks-cream rounded-lg space-y-4">
                      <div className="flex items-center gap-2 text-starbucks-green font-bold text-sm">
                          <Clock className="h-4 w-4" />
                          Horario Laboral
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                              <Label htmlFor="checkin" className="text-xs font-semibold">Entrada:</Label>
                              <Input id="checkin" type="time" value={checkinTime} onChange={(e) => setCheckinTime(e.target.value)} className="bg-white" disabled={loading} />
                          </div>
                          <div className="space-y-1.5">
                              <Label htmlFor="checkout" className="text-xs font-semibold">Salida:</Label>
                              <Input id="checkout" type="time" value={checkoutTime} onChange={(e) => setCheckoutTime(e.target.value)} className="bg-white" disabled={loading} />
                          </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 border-t border-gray-200 pt-3">
                          <div className="space-y-1.5">
                              <Label htmlFor="break-i" className="text-xs font-semibold">Comida Inicio:</Label>
                              <Input id="break-i" type="time" value={breakTimeI} onChange={(e) => setBreakTimeI(e.target.value)} className="bg-white" disabled={loading} />
                          </div>
                          <div className="space-y-1.5">
                              <Label htmlFor="break-f" className="text-xs font-semibold">Comida Fin:</Label>
                              <Input id="break-f" type="time" value={breakTimeF} onChange={(e) => setBreakTimeF(e.target.value)} className="bg-white" disabled={loading} />
                          </div>
                      </div>
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
                <CardDescription>Lista del personal actual y sus horarios.</CardDescription>
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
                <div className="border rounded-lg max-h-[70vh] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-starbucks-cream z-10">
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Rol / Empresa</TableHead>
                          <TableHead>Entrada/Salida</TableHead>
                          <TableHead>Comida</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading && personalList.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow>
                        ) : personalList.length > 0 ? personalList.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium text-xs md:text-sm">{p.name}</TableCell>
                            <TableCell className="text-xs">
                                <div className="font-semibold uppercase text-starbucks-green">{p.rol}</div>
                                <div className="text-gray-500">{p.organization}</div>
                            </TableCell>
                            <TableCell className="text-xs">
                                {p.checkin_time ? p.checkin_time.substring(0, 5) : '--:--'} a {p.checkout_time ? p.checkout_time.substring(0, 5) : '--:--'}
                            </TableCell>
                            <TableCell className="text-xs">
                                {p.break_time_i ? p.break_time_i.substring(0, 5) : '--:--'} - {p.break_time_f ? p.break_time_f.substring(0, 5) : '--:--'}
                            </TableCell>
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
                           <TableRow><TableCell colSpan={5} className="text-center py-8">No hay personal registrado.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Personal</DialogTitle>
              <DialogDescription>
                Modifica los datos y horarios del registro.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-1">
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
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-rol">Rol</Label>
                     <Select onValueChange={setEditRol} value={editRol} disabled={loading}>
                        <SelectTrigger id="edit-rol"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="barra">Barra</SelectItem>
                            <SelectItem value="almacenista">Almacenista</SelectItem>
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
              
              <div className="p-3 bg-gray-50 rounded-lg space-y-3 border">
                  <Label className="text-starbucks-green font-bold">Horarios</Label>
                  <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-gray-500">Entrada</Label>
                          <Input type="time" value={editCheckinTime} onChange={(e) => setEditCheckinTime(e.target.value)} disabled={loading} />
                      </div>
                      <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-gray-500">Salida</Label>
                          <Input type="time" value={editCheckoutTime} onChange={(e) => setEditCheckoutTime(e.target.value)} disabled={loading} />
                      </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-gray-500">Comida Inicio</Label>
                          <Input type="time" value={editBreakTimeI} onChange={(e) => setEditBreakTimeI(e.target.value)} disabled={loading} />
                      </div>
                      <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-gray-500">Comida Fin</Label>
                          <Input type="time" value={editBreakTimeF} onChange={(e) => setEditBreakTimeF(e.target.value)} disabled={loading} />
                      </div>
                  </div>
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
