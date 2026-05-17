'use client';
import './globals.css';
import Navbar from '@/components/Navbar';
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
import { AuthProvider } from '@/components/AuthProvider';

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
    oscillator.frequency.setValueAtTime(440, context.currentTime);
    gainNode.gain.setValueAtTime(3.6, context.currentTime);
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

      try {
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
      } catch (e) {
        console.error("Failed to process check-in alerts:", e);
      }
      
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
              console.error("Error fetching unassigned codes:", err);
          }
      }
    };
    
    const intervalId = setInterval(runTimedTasks, 60000);
    return () => clearInterval(intervalId);
  }, [toast, reportTime]);

  const handleFeedbackSubmit = async () => {
    if (!feedbackTitle || !feedbackCategory || !feedbackDescription) {
        toast({
            variant: "destructive",
            title: "Campos incompletos",
            description: "Por favor, completa todos los campos.",
        });
        return;
    }

    setIsSubmitting(true);
    try {
        const { error } = await supabaseEtiquetas
            .from('feedback')
            .insert([{ title: feedbackTitle, cat: feedbackCategory, description: feedbackDescription }]);
        if (error) throw error;
        toast({ title: "¡Gracias!", description: "Ticket enviado correctamente." });
        setIsFeedbackDialogOpen(false);
        setFeedbackTitle(''); setFeedbackCategory(''); setFeedbackDescription('');
    } catch (error: any) {
        toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setReportTime(newTime);
    localStorage.setItem('unassignedReportTime', newTime);
  };

  return (
    <html lang="es">
      <head>
        <title>Sistema de Control</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
      </head>
      <body className="font-body antialiased bg-starbucks-light-gray">
        <AuthProvider>
          <TooltipProvider>
            <Dialog open={isFeedbackDialogOpen} onOpenChange={setIsFeedbackDialogOpen}>
              <DialogTrigger asChild>
                  <div className="fixed bottom-6 right-4 z-[100] cursor-pointer md:top-20 md:bottom-auto">
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <div className="p-3 bg-yellow-400 text-yellow-900 rounded-full shadow-xl transition-transform hover:scale-110 active:scale-95">
                                  <Cog className="h-6 w-6 md:h-5 md:w-5" />
                              </div>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                              <p>Ajustes</p>
                          </TooltipContent>
                      </Tooltip>
                  </div>
              </DialogTrigger>
              <DialogContent className="max-w-[90vw] sm:max-w-md rounded-xl">
                  <DialogHeader>
                      <DialogTitle>Ajustes</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-6 pt-4">
                      <div>
                          <Label htmlFor="report-time">Hora del Reporte Diario</Label>
                          <Input id="report-time" type="time" value={reportTime} onChange={handleTimeChange} className="mt-2" />
                      </div>
                      <div className="space-y-4 pt-4 border-t">
                          <Label>Enviar Ticket de Retroalimentación</Label>
                          <Input id="title" value={feedbackTitle} onChange={(e) => setFeedbackTitle(e.target.value)} placeholder="Título" />
                          <Select onValueChange={setFeedbackCategory} value={feedbackCategory}>
                              <SelectTrigger>
                                  <SelectValue placeholder="Categoría" />
                              </SelectTrigger>
                              <SelectContent>
                                  <SelectItem value="Observacion">Observación</SelectItem>
                                  <SelectItem value="Reporte de error">Error</SelectItem>
                                  <SelectItem value="Sugerencia">Sugerencia</SelectItem>
                              </SelectContent>
                          </Select>
                          <Textarea id="description" value={feedbackDescription} onChange={(e) => setFeedbackDescription(e.target.value)} placeholder="Descripción" />
                      </div>
                  </div>
                  <DialogFooter>
                      <Button onClick={handleFeedbackSubmit} disabled={isSubmitting} className="w-full">
                          {isSubmitting ? 'Enviando...' : <><Send className="mr-2 h-4 w-4" /> Enviar</>}
                      </Button>
                  </DialogFooter>
              </DialogContent>
              </Dialog>

              <Dialog open={isUnassignedDialogOpen} onOpenChange={setIsUnassignedDialogOpen}>
                <DialogContent className="max-w-[95vw] sm:max-w-2xl rounded-xl">
                    <DialogHeader>
                        <DialogTitle className="text-destructive flex items-center gap-2">
                          <AlertTriangle className="h-6 w-6" />
                          Etiquetas No Asignadas
                        </DialogTitle>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-auto border rounded-md">
                        {unassignedLabels.length > 0 ? (
                            <Table>
                              <TableHeader className="bg-gray-100">
                                  <TableRow>
                                      <TableHead>Código</TableHead>
                                      <TableHead>Lote</TableHead>
                                  </TableRow>
                              </TableHeader>
                              <TableBody>
                                {unassignedLabels.map(label => (
                                    <TableRow key={label.code}>
                                        <TableCell className="font-mono text-xs">{label.code}</TableCell>
                                        <TableCell className="text-xs">{label.code_i || 'N/A'}</TableCell>
                                    </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                        ) : (
                            <p className="text-sm text-gray-500 text-center py-4">Todo asignado.</p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsUnassignedDialogOpen(false)} className="w-full">Cerrar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

              <Navbar />
              <main className="pt-20 pb-20 md:pb-0">
                  {children}
              </main>
              <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
