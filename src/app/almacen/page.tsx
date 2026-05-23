'use client';
import {useEffect, useRef, useState, useCallback, useMemo} from 'react';
import Head from 'next/head';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { supabase } from '@/lib/supabaseClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Trash2, Zap, ZoomIn, PackageSearch, CheckCircle2, Boxes } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/components/AuthProvider';

type ScanResult = {
    name: string | null;
    product: string | null;
    code: string;
    found: boolean;
    error?: string;
    status?: string | null;
    quantity?: number | null;
    organization?: string | null;
};

type Encargado = {
  name: string;
  rol: string;
  organization: string;
};

export default function AlmacenPage() {
  const { profile } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const [message, setMessage] = useState({ text: 'Apunte la cámara a un código QR.', type: 'info' as 'info' | 'success' | 'error' | 'warning', show: false });
  const [lastScannedResult, setLastScannedResult] = useState<ScanResult | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedScannerMode, setSelectedScannerMode] = useState('camara');
  const [encargado, setEncargado] = useState(''); 
  const [encargadosList, setEncargadosList] = useState<Encargado[]>([{ name: 'Almacenista', rol: 'almacenista', organization: 'Almacén' }]);
  const [scanMode, setScanMode] = useState('individual');
  const [massScannedCodes, setMassScannedCodes] = useState<ScanResult[]>([]);
  const [cameraCapabilities, setCameraCapabilities] = useState<any>(null);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const isMobile = useIsMobile();
  const [dbError, setDbError] = useState<string | null>(null);

  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const lastScanTimeRef = useRef(Date.now());
  const MIN_SCAN_INTERVAL = 1500;
  const massScannedCodesRef = useRef(new Set<string>());
  const physicalScannerInputRef = useRef<HTMLInputElement | null>(null);
  const bufferRef = useRef('');

   const showAppMessage = (text: string, type: 'success' | 'error' | 'info' | 'warning') => {
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
    setMessage({ text, type, show: true });
    messageTimeoutRef.current = setTimeout(() => {
      setMessage(prev => ({ ...prev, show: false }));
    }, 2500);
  };

   useEffect(() => {
    setIsMounted(true);
    
    const fetchEncargados = async () => {
        const { data, error } = await supabase
            .from('personal_name')
            .select('name, rol, organization')
            .eq('rol', 'almacenista');

        if (error) {
            console.error('Error fetching data:', error);
        } else if (data && data.length > 0) {
             const uniqueEncargados = Array.from(new Map(data.map(item => [item.name, item])).values());
             if (!uniqueEncargados.some(e => e.name === 'Almacenista')) {
                uniqueEncargados.unshift({ name: 'Almacenista', rol: 'almacenista', organization: 'Almacén' });
             }
             setEncargadosList(uniqueEncargados as Encargado[]);
        } else {
             setEncargadosList([{ name: 'Almacenista', rol: 'almacenista', organization: 'Almacén' }]);
        }
    };
    fetchEncargados();
  }, []);

  // Vincular encargado con el perfil de usuario logueado
  useEffect(() => {
    if (profile?.name) {
      setEncargado(profile.name);
    } else if (isMounted && !encargado) {
       setEncargado('Almacenista');
    }
  }, [profile, isMounted]);

  const groupedEncargadoOptions = useMemo(() => {
    if (encargadosList.length === 0) return [];
    const grouped = encargadosList.reduce((acc, person) => {
        const org = person.organization || 'Sin Empresa';
        if (!acc[org]) acc[org] = [];
        acc[org].push({ value: person.name, label: person.name });
        return acc;
    }, {} as Record<string, { value: string; label: string }[]>);

    return Object.keys(grouped).sort().map(org => ({
        label: org,
        options: grouped[org].sort((a, b) => a.label.localeCompare(b.label))
    }));
  }, [encargadosList]);

  const playBeep = () => {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gainNode.gain.setValueAtTime(0.5, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 0.1);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.1);
  };

  const onScanSuccess = useCallback(async (decodedText: string) => {
    if (loading || Date.now() - lastScanTimeRef.current < MIN_SCAN_INTERVAL) return;
    
    lastScanTimeRef.current = Date.now();
    setLoading(true);
    showAppMessage('Validando código...', 'info');

    let finalCode = decodedText.trim();
    try {
        const parsed = JSON.parse(decodedText);
        if (parsed && parsed.id) finalCode = String(parsed.id);
    } catch (e) {}

    if (scanMode === 'masivo' && massScannedCodesRef.current.has(finalCode)) {
        showAppMessage(`Duplicado: ${finalCode}`, 'warning');
        setLoading(false);
        return;
    }

    try {
        const { data, error } = await supabase
            .from('personal')
            .select('name, product, status, quantity, organization')
            .eq('code', finalCode)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (data) {
            playBeep();
            const result: ScanResult = {
                name: data.name,
                product: data.product,
                code: finalCode,
                found: true,
                status: data.status,
                quantity: data.quantity,
                organization: data.organization
            };

            if (data.status === 'SURTIDO') {
                showAppMessage(`Ya marcado como SURTIDO.`, 'warning');
                setLastScannedResult(result);
            } else {
                 if (scanMode === 'individual') {
                    setLastScannedResult(result);
                    showAppMessage('Código validado correctamente.', 'success');
                } else {
                    setMassScannedCodes(prev => [result, ...prev]);
                    massScannedCodesRef.current.add(finalCode);
                    showAppMessage(`Añadido: ${finalCode}`, 'success');
                }
            }
        } else {
            showAppMessage('Etiqueta no encontrada en producción.', 'error');
        }
    } catch (e: any) {
        showAppMessage(`Error: ${e.message}`, 'error');
    } finally {
        setLoading(false);
    }
  }, [loading, scanMode]);

  const handleSurtir = async () => {
    if (!lastScannedResult?.code) return;
    setLoading(true);
    try {
        const { error } = await supabase
            .from('personal')
            .update({ status: 'SURTIDO', date_surtido: new Date().toISOString(), name_surtido: encargado })
            .eq('code', lastScannedResult.code);

        if (error) throw error;
        showAppMessage('Paquete marcado como SURTIDO.', 'success');
        setLastScannedResult(null);
    } catch (e: any) {
        alert(`Error al actualizar: ${e.message}`);
    } finally {
        setLoading(false);
    }
  };

  const handleMassSurtir = async () => {
    if (massScannedCodes.length === 0) return;
    setLoading(true);
    try {
        const codes = massScannedCodes.map(item => item.code);
        const { error } = await supabase
            .from('personal')
            .update({ status: 'SURTIDO', date_surtido: new Date().toISOString(), name_surtido: encargado })
            .in('code', codes);

        if (error) throw error;
        alert(`Se marcaron ${codes.length} paquetes como SURTIDO.`);
        setMassScannedCodes([]);
        massScannedCodesRef.current.clear();
    } catch (e: any) {
        alert(`Error: ${e.message}`);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    if (!isMounted || !readerRef.current) return;
    if (!html5QrCodeRef.current) html5QrCodeRef.current = new Html5Qrcode(readerRef.current.id, false);
    const qrCode = html5QrCodeRef.current;

    if (scannerActive && selectedScannerMode === 'camara') {
      qrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScanSuccess, () => {})
      .catch(err => {
          console.error(err);
          setScannerActive(false);
      });
    } else {
      if (qrCode.isScanning) qrCode.stop();
    }
    return () => { if (qrCode.isScanning) qrCode.stop(); };
  }, [scannerActive, selectedScannerMode, isMounted, onScanSuccess]);

  return (
    <>
      <Head><title>Módulo de Almacén</title></Head>
      <main className="text-starbucks-dark flex items-center justify-center p-4">
        <div className="w-full max-w-2xl mx-auto bg-starbucks-white rounded-xl shadow-2xl p-4 md:p-6 space-y-6">
          <header className="text-center">
            <div className="inline-block p-3 bg-starbucks-cream rounded-full mb-2">
                <Boxes className="h-8 w-8 text-starbucks-green" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-starbucks-green">Módulo de Almacén</h1>
            <p className="text-gray-600 text-sm">Escanea etiquetas para validar el surtido.</p>
          </header>

          <div className="space-y-4">
              <div>
                  <Label className="font-bold">Encargado de Almacén:</Label>
                   <Combobox
                      groupedOptions={groupedEncargadoOptions}
                      value={isMounted ? encargado : ''}
                      onValueChange={setEncargado}
                      placeholder="Selecciona almacenista..."
                      emptyMessage="No se encontró."
                      disabled={scannerActive}
                  />
              </div>

              <div className="grid grid-cols-2 gap-2">
                  <Button variant={selectedScannerMode === 'camara' ? 'default' : 'outline'} onClick={() => setSelectedScannerMode('camara')} disabled={scannerActive}>CÁMARA</Button>
                  <Button variant={selectedScannerMode === 'fisico' ? 'default' : 'outline'} onClick={() => setSelectedScannerMode('fisico')} disabled={scannerActive}>ESCÁNER USB</Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                  <Button variant={scanMode === 'individual' ? 'secondary' : 'outline'} onClick={() => setScanMode('individual')} disabled={scannerActive}>Individual</Button>
                  <Button variant={scanMode === 'masivo' ? 'secondary' : 'outline'} onClick={() => setScanMode('masivo')} disabled={scannerActive}>Masivo</Button>
              </div>
          </div>

          <div className="bg-starbucks-cream p-4 rounded-lg">
            <div className="scanner-container relative min-h-[200px] border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                <div id="reader" ref={readerRef} className="w-full" style={{ display: scannerActive && selectedScannerMode === 'camara' ? 'block' : 'none' }}></div>
                {!scannerActive && <p className="text-gray-500">Escáner inactivo</p>}
                {message.show && <div className={`scanner-message absolute inset-0 flex items-center justify-center bg-black/50 text-white z-50 rounded-lg`}>{message.text}</div>}
            </div>
            <div className="mt-4 flex justify-center gap-2">
                <Button onClick={() => setScannerActive(true)} disabled={scannerActive || !encargado} className="bg-blue-600">Iniciar</Button>
                <Button onClick={() => setScannerActive(false)} variant="destructive" disabled={!scannerActive}>Detener</Button>
            </div>
          </div>

          {isMounted && isMobile && scannerActive && selectedScannerMode === 'camara' && cameraCapabilities && (
                <div id="camera-controls" className="flex items-center gap-4 mt-4 p-2 rounded-lg bg-gray-200">
                    {cameraCapabilities.torch && (
                        <Button variant="ghost" size="icon" onClick={() => setIsFlashOn(prev => !prev)} className={isFlashOn ? 'bg-yellow-400' : ''}>
                            <Zap className="h-5 w-5" />
                        </Button>
                    )}
                    {cameraCapabilities.zoom && (
                         <div className="flex-1 flex items-center gap-2">
                            <ZoomIn className="h-5 w-5" />
                            <input
                                id="zoom-slider"
                                type="range"
                                min={cameraCapabilities.zoom.min}
                                max={cameraCapabilities.zoom.max}
                                step={cameraCapabilities.zoom.step}
                                value={zoom}
                                onChange={(e) => setZoom(parseFloat(e.target.value))}
                                className="w-full"
                            />
                        </div>
                    )}
                </div>
            )}

          {lastScannedResult && scanMode === 'individual' && (
              <div className="p-4 border rounded-lg bg-white shadow-sm space-y-3">
                  <div className="flex justify-between items-start">
                      <div>
                          <h3 className="text-xs font-bold text-gray-500 uppercase">Código</h3>
                          <p className="font-mono text-lg">{lastScannedResult.code}</p>
                      </div>
                      <div className="text-right">
                          <h3 className="text-xs font-bold text-gray-500 uppercase">Estado Actual</h3>
                          <span className={`text-xs px-2 py-1 rounded-full font-bold ${lastScannedResult.status === 'SURTIDO' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {lastScannedResult.status || 'PENDIENTE'}
                          </span>
                      </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <h3 className="text-xs font-bold text-gray-500 uppercase">Producto</h3>
                          <p className="text-sm">{lastScannedResult.product}</p>
                      </div>
                      <div>
                          <h3 className="text-xs font-bold text-gray-500 uppercase">Cantidad</h3>
                          <p className="text-sm font-bold">{lastScannedResult.quantity} pzas</p>
                      </div>
                  </div>
                  <Button onClick={handleSurtir} disabled={loading || lastScannedResult.status === 'SURTIDO'} className="w-full bg-starbucks-green">
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar como SURTIDO
                  </Button>
              </div>
          )}

          {scanMode === 'masivo' && (
              <div className="space-y-4">
                  <div className="flex justify-between items-center">
                      <h2 className="font-bold">Lista Masiva ({massScannedCodes.length})</h2>
                      <Button onClick={handleMassSurtir} disabled={loading || massScannedCodes.length === 0} className="bg-starbucks-green">Surtir Todos</Button>
                  </div>
                  <div className="max-h-60 overflow-auto border rounded-md">
                      <Table>
                          <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Producto</TableHead><TableHead>Cant</TableHead></TableRow></TableHeader>
                          <TableBody>
                              {massScannedCodes.map(item => (
                                  <TableRow key={item.code}>
                                      <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                      <TableCell className="text-xs">{item.product}</TableCell>
                                      <TableCell className="text-xs">{item.quantity}</TableCell>
                                  </TableRow>
                              ))}
                          </TableBody>
                      </Table>
                  </div>
              </div>
          )}
        </div>
      </main>
    </>
  );
}
