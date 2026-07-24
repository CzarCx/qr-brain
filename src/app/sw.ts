// @ts-nocheck
// Service worker de Serwist: precachea el shell de la app (JS/CSS/HTML del build
// de Next) para que cargue sin red tras la primera visita. Excluido de tsc en
// tsconfig.json porque requiere el lib "webworker", incompatible con el lib "dom"
// que usa el resto del proyecto.
import { defaultCache } from '@serwist/next/worker';
import { Serwist, NetworkOnly, CacheFirst } from 'serwist';

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  // Se precachea el .wasm del escáner (zxing) junto al shell, para que el escáner de
  // /devoluciones y /entrega funcione SIN conexión desde la primera vez (sin depender de
  // haberlo abierto online antes). La revisión se ata a la versión de zxing-wasm: súbela
  // si actualizas el paquete, para forzar el recacheo.
  precacheEntries: [
    ...(self.__SW_MANIFEST ?? []),
    { url: '/wasm/zxing_reader.wasm', revision: 'zxing-wasm-3.1.1' },
    // Página offline estática (autocontenida, sin chunks de Next): se precachea
    // para poder servirla como fallback de navegación cuando no hay red. Súbele el
    // revision si editas public/offline.html, para forzar el recacheo.
    { url: '/offline.html', revision: 'offline-v1' },
  ],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Fallback de navegación: cuando una navegación (recarga/entrar a una ruta) falla
  // sin conexión y NetworkFirst no la tiene en caché —ruta no visitada este deploy,
  // o caché expirada—, en vez del "sin internet" del navegador (el dino) se sirve
  // /offline.html. Las rutas que SÍ se visitaron online siguen sirviéndose reales
  // desde la caché de NetworkFirst; esto solo cubre el hueco. El plugin de fallback
  // se adjunta automáticamente a las estrategias de runtimeCaching (incl. defaultCache).
  fallbacks: {
    entries: [
      {
        // `mode === 'navigate'` es el detector canónico de navegaciones y el más
        // confiable en Safari iOS (donde `destination` a veces llega vacío). Se
        // deja `destination` como respaldo por si algún navegador no puebla `mode`.
        url: '/offline.html',
        matcher: ({ request }) => request.mode === 'navigate' || request.destination === 'document',
      },
    ],
  },
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
    // El .wasm del escáner de /devoluciones (zxing-wasm, ~1 MiB): CacheFirst para que
    // tras la primera carga sobreviva sin red — el piso escanea offline y no debe
    // re-descargar el binario en cada arranque de la cámara.
    {
      matcher: ({ url }) => url.pathname.startsWith('/wasm/'),
      handler: new CacheFirst({ cacheName: 'wasm-cache' }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
