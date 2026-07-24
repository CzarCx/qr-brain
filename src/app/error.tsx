'use client';

/**
 * Error boundary de ruta (App Router). Sustituye la pantalla blanca de
 * "Application error: a client-side exception has occurred" por una pantalla
 * legible que MUESTRA el mensaje real del error, para poder diagnosticar sin
 * tener que abrir la consola del navegador (imposible de hacer cómodo en un
 * celular de piso), y ofrece "Reintentar" (reset) sin recargar toda la app.
 */

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app/error]', error);
  }, [error]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#f5f7f9] p-4 z-[9999]">
      <div className="w-full max-w-md space-y-5 rounded-3xl bg-white p-7 shadow-2xl text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-red-50 p-5">
            <AlertTriangle className="h-10 w-10 text-red-500" />
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Ocurrió un error</h2>
          <p className="text-sm text-gray-500">
            Algo falló en la aplicación. Puedes reintentar sin perder la sesión.
          </p>
        </div>

        {/* El mensaje real, para poder diagnosticar de un vistazo / captura. */}
        <div className="rounded-2xl border border-red-100 bg-red-50/60 p-3 text-left">
          <p className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-1">Detalle</p>
          <p className="text-xs font-mono font-bold text-red-700 break-words">
            {error?.message || 'Error desconocido'}
          </p>
          {error?.digest && (
            <p className="mt-1 text-[10px] font-mono text-red-400">digest: {error.digest}</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => reset()}
            className="flex-1 h-12 rounded-2xl bg-starbucks-green hover:bg-starbucks-dark text-white font-black text-xs tracking-widest transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw className="h-4 w-4" /> REINTENTAR
          </button>
          <a
            href="/main"
            className="h-12 px-4 rounded-2xl border border-gray-200 text-gray-600 font-black text-xs tracking-widest transition-all flex items-center justify-center gap-2"
          >
            <Home className="h-4 w-4" /> INICIO
          </a>
        </div>
      </div>
    </div>
  );
}
