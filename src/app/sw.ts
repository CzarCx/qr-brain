// @ts-nocheck
// Service worker de Serwist: precachea el shell de la app (JS/CSS/HTML del build
// de Next) para que cargue sin red tras la primera visita. Excluido de tsc en
// tsconfig.json porque requiere el lib "webworker", incompatible con el lib "dom"
// que usa el resto del proyecto.
import { defaultCache } from '@serwist/next/worker';
import { Serwist, NetworkOnly } from 'serwist';

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Los datos de Supabase (PostgREST /rest/v1, Auth /auth/v1) son transaccionales y en
    // vivo: NUNCA deben servirse desde caché. El defaultCache los trata como "cross-origin"
    // y les aplica NetworkFirst con networkTimeoutSeconds: 10; en el celular, con señal
    // lenta, el fetch superaba esos 10s y el SW devolvía la respuesta VIEJA (p. ej. la
    // lista de paqueterías vacía de antes de arreglar el RLS) aunque la base ya estuviera
    // correcta — por eso "solo fallaba en el celular". Esta regla va PRIMERO (gana la
    // primera que hace match) y fuerza ir a la red siempre.
    {
      matcher: ({ url }) => url.hostname.endsWith('.supabase.co'),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
