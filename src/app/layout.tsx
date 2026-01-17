
'use client';
import type {Metadata} from 'next';
import './globals.css';
import Navbar from '@/components/Navbar'; // Import the new Navbar component
import { useEffect, useState }from 'react';
import { Cog, Send } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabaseEtiquetas } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';


// export const metadata: Metadata = {
//   title: 'Escáner de Códigos',
//   description: 'Escáner de Códigos de Barra y QR',
// };

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


  useEffect(() => {
    // This is a workaround for the "Cannot transition to a new state" error.
    // If the Next.js error overlay appears, reload the page.
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

    // Cleanup observer on component unmount
    return () => {
      observer.disconnect();
    };
  }, []);

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
                            <p>Reportar un problema o sugerencia</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Centro de Retroalimentación</DialogTitle>
                    <DialogDescription>
                        ¿Encontraste un error o tienes una idea? Compártela con nosotros para futuras actualizaciones.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="title" className="text-right">
                            Título
                        </Label>
                        <Input id="title" value={feedbackTitle} onChange={(e) => setFeedbackTitle(e.target.value)} className="col-span-3" placeholder="Un resumen corto del problema/idea" />
                    </div>
                     <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="category" className="text-right">
                            Categoría
                        </Label>
                        <Select onValueChange={setFeedbackCategory} value={feedbackCategory}>
                            <SelectTrigger id="category" className="col-span-3">
                                <SelectValue placeholder="Selecciona una categoría" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Observacion">Observación</SelectItem>
                                <SelectItem value="Reporte de error">Reporte de error</SelectItem>
                                <SelectItem value="Sugerencia">Sugerencia</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="description" className="text-right">
                            Descripción
                        </Label>
                        <Textarea id="description" value={feedbackDescription} onChange={(e) => setFeedbackDescription(e.target.value)} className="col-span-3" placeholder="Describe el problema o tu sugerencia con más detalle." />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleFeedbackSubmit} disabled={isSubmitting}>
                        {isSubmitting ? 'Enviando...' : <><Send className="mr-2 h-4 w-4" /> Enviar Ticket</>}
                    </Button>
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
