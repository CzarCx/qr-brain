
'use client';
import type {Metadata} from 'next';
import './globals.css';
import Navbar from '@/components/Navbar'; // Import the new Navbar component
import { useEffect, useState, useRef }from 'react';
import { Cog, Send, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase, supabaseEtiquetas } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";


// export const metadata: Metadata = {
//   title: 'Escáner de Códigos',
//   description: 'Escáner de Códigos de Barra y QR',
// };

type UnassignedLabel = {
  code: string;
  personal_inc: string | null;
  code_i: string | null;
  deli_date: string | null;
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  
  const { toast } = useToast();
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackCategory, setFeedbackCategory] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUnassignedDialogOpen, setIsUnassignedDialogOpen] = useState(false);
  const [unassignedLabels, setUnassignedLabels] = useState<UnassignedLabel[]>([]);
  const [reportTime, setReportTime] = useState('02:20');


  const notifiedCheckins = useRef(new Set<string>());
  const dailyReportRun = useRef(new Set<string>());

  const playNotificationSound = () => {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, context.currentTime); // A4 note
    gainNode.gain.setValueAtTime(1.8, context.currentTime); // Increased volume
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.5);
  };


  useEffect(() => {
    const savedTime = localStorage.getItem('unassignedReportTime');
    if (savedTime) {
      setReportTime(savedTime);
    }
    
    const runTimedTasks = async () => {
      const now = new Date();
      const todayStr = now.toDateString(); 

      // Check for upcoming check-ins
      const { data, error } = await supabase
        .from('personal_name')
        .select('name, checkin_time')
        .not('checkin_time', 'is', null);

      if (error) {
        console.error('Error fetching check-in times:', error);
      } else if (data) {
          data.forEach(person => {
            if (!person.checkin_time) return;

            const [hours, minutes] = person.checkin_time.split(':').map(Number);
            
            const checkinDate = new Date();
            checkinDate.setHours(hours, minutes, 0, 0);

            const diffMinutes = (checkinDate.getTime() - now.getTime()) / 1000 / 60;
            
            const notificationKey = `${person.name}-${todayStr}`;

            if (diffMinutes > 14 && diffMinutes <= 15 && !notifiedCheckins.current.has(notificationKey)) {
              playNotificationSound();
              toast({
                variant: 'success',
                title: "Alerta de Llegada",
                description: `${person.name} está a punto de llegar (15 min).`,
                duration: 10000,
              });
              notifiedCheckins.current.add(notificationKey);
            }
          });
      }
      
      // Check for unassigned labels at user-defined time
      const reportKey = `unassigned-${todayStr}`;
      const [reportHour, reportMinute] = reportTime.split(':').map(Number);

      if (now.getHours() === reportHour && now.getMinutes() === reportMinute && !dailyReportRun.current.has(reportKey)) {
          dailyReportRun.current.add(reportKey);
          
          try {
              const { data: etiquetasData, error: etiquetasError } = await supabaseEtiquetas
                  .from('etiquetas_i')
                  .select('code, personal_inc, code_i, deli_date')
                  .order('deli_date', { ascending: true, nullsFirst: false });

              if (etiquetasError) throw etiquetasError;

              const { data: personalData, error: personalError } = await supabase
                  .from('personal')
                  .select('code');
              if (personalError) throw personalError;

              const assignedCodes = new Set((personalData || []).map(p => p.code));
              const unassigned = (etiquetasData || []).filter(etiqueta => !assignedCodes.has(etiqueta.code));

              if (unassigned.length > 0) {
                  playNotificationSound();
                  setUnassignedLabels(unassigned.map(u => ({ 
                      code: u.code, 
                      personal_inc: u.personal_inc,
                      code_i: u.code_i,
                      deli_date: u.deli_date
                   })));
                  setIsUnassignedDialogOpen(true);
              }

          } catch (err: any) {
              const errorMessage = err.message || 'No se pudieron obtener las etiquetas no asignadas.';
              console.error("Error fetching unassigned codes:", errorMessage, err);
              toast({
                  variant: "destructive",
                  title: "Error al generar reporte",
                  description: errorMessage,
              });
          }
      }

      // Daily reset
      if (now.getHours() === 0 && now.getMinutes() === 0) {
          notifiedCheckins.current.clear();
          dailyReportRun.current.clear();
      }
    };
    
    runTimedTasks();
    const intervalId = setInterval(runTimedTasks, 60000);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'id') {
          const htmlElement = document.documentElement;
          if (htmlElement.id === '__next_error__') {
            console.warn("Next.js error overlay detected. Reloading page...");
            window.location.reload();
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['id'],
    });

    return () => {
      clearInterval(intervalId);
      observer.disconnect();
    };
  }, [toast, reportTime]);

  const handleFeedbackSubmit = async () => {
    if (!feedbackTitle || !feedbackCategory || !feedbackDescription) {
        toast({
            variant: "destructive",
            title: "Campos incompletos",
            description: "Por favor, completa todos los campos para enviar tu ticket.",
        });
        return;
    }

    setIsSubmitting(true);
    try {
        const { error } = await supabaseEtiquetas
            .from('feedback')
            .insert([{ 
                title: feedbackTitle, 
                cat: feedbackCategory, 
                description: feedbackDescription 
            }]);

        if (error) throw error;

        toast({
            title: "¡Gracias por tu ayuda!",
            description: "Tu ticket ha sido enviado correctamente.",
        });

        setIsFeedbackDialogOpen(false);
        setFeedbackTitle('');
        setFeedbackCategory('');
        setFeedbackDescription('');

    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Error al enviar",
            description: `No se pudo enviar tu ticket. Error: ${error.message}`,
        });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setReportTime(newTime);
    localStorage.setItem('unassignedReportTime', newTime);
    toast({
        title: "Hora de reporte actualizada",
        description: `El reporte diario se generará a las ${newTime}.`,
        variant: 'success'
    });
  };

  return (
    <html lang="es">
      <head>
        <title>Escáner de Códigos</title>
        <meta name="description" content="Escáner de Códigos de Barra y QR" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-starbucks-light-gray">
        <TooltipProvider>
           <Dialog open={isFeedbackDialogOpen} onOpenChange={setIsFeedbackDialogOpen}>
            <DialogTrigger asChild>
                <div className="fixed top-20 right-4 z-[100] cursor-pointer">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="p-2 bg-yellow-400 text-yellow-900 rounded-full shadow-lg transition-transform hover:scale-110">
                                <Cog className="h-6 w-6" />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Ajustes y Retroalimentación</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Ajustes y Retroalimentación</DialogTitle>
                    <DialogDescription>
                        Configura las notificaciones o reporta un problema.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 pt-4 pb-2">
                    <div>
                        <Label htmlFor="report-time" className="font-semibold">Hora del Reporte Diario</Label>
                        <p className="text-sm text-muted-foreground mt-1 mb-2">Elige a qué hora recibir el pop-up con las etiquetas no asignadas.</p>
                        <Input
                            id="report-time"
                            type="time"
                            value={reportTime}
                            onChange={handleTimeChange}
                            className="bg-transparent"
                        />
                    </div>
                    
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">Enviar Ticket</span>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="title">
                                Título
                            </Label>
                            <Input id="title" value={feedbackTitle} onChange={(e) => setFeedbackTitle(e.target.value)} placeholder="Un resumen corto del problema/idea" />
                        </div>
                         <div className="space-y-1.5">
                            <Label htmlFor="category">
                                Categoría
                            </Label>
                            <Select onValueChange={setFeedbackCategory} value={feedbackCategory}>
                                <SelectTrigger id="category">
                                    <SelectValue placeholder="Selecciona una categoría" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Observacion">Observación</SelectItem>
                                    <SelectItem value="Reporte de error">Reporte de error</SelectItem>
                                    <SelectItem value="Sugerencia">Sugerencia</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="description">
                                Descripción
                            </Label>
                            <Textarea id="description" value={feedbackDescription} onChange={(e) => setFeedbackDescription(e.target.value)} placeholder="Describe el problema o tu sugerencia con más detalle." />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleFeedbackSubmit} disabled={isSubmitting}>
                        {isSubmitting ? 'Enviando...' : <><Send className="mr-2 h-4 w-4" /> Enviar Ticket</>}
                    </Button>
                </DialogFooter>
            </DialogContent>
            </Dialog>

            <Dialog open={isUnassignedDialogOpen} onOpenChange={setIsUnassignedDialogOpen}>
              <DialogContent className="sm:max-w-2xl">
                  <DialogHeader>
                      <DialogTitle>
                        <div className="flex items-center gap-2 text-destructive">
                           <AlertTriangle className="h-6 w-6" />
                           Reporte de Etiquetas No Asignadas
                        </div>
                      </DialogTitle>
                      <DialogDescription>
                          Las siguientes etiquetas existen en el sistema pero aún no han sido asignadas a ningún operario.
                          Este reporte se generó a las {reportTime}.
                      </DialogDescription>
                  </DialogHeader>
                  <div className="max-h-[60vh] overflow-y-auto p-1 border rounded-md bg-gray-50">
                      {unassignedLabels.length > 0 ? (
                          <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Imprimió</TableHead>
                                    <TableHead>Lote</TableHead>
                                    <TableHead>Fecha Entrega</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                               {unassignedLabels.map(label => (
                                  <TableRow key={label.code}>
                                      <TableCell className="font-mono text-sm">{label.code}</TableCell>
                                      <TableCell>{label.personal_inc || 'N/A'}</TableCell>
                                      <TableCell>{label.code_i || 'N/A'}</TableCell>
                                      <TableCell>{label.deli_date ? new Date(label.deli_date).toLocaleDateString('es-MX') : 'N/A'}</TableCell>
                                  </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                      ) : (
                          <p className="text-sm text-gray-500 text-center py-4">No se encontraron etiquetas no asignadas.</p>
                      )}
                  </div>
                  <DialogFooter>
                      <Button variant="outline" onClick={() => setIsUnassignedDialogOpen(false)}>Cerrar</Button>
                  </DialogFooter>
              </DialogContent>
          </Dialog>

            <Navbar />
            <main className="pt-16">
                {children}
            </main>
            <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
