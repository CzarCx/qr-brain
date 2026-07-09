// @ts-nocheck
// Service worker de Serwist: precachea el shell de la app (JS/CSS/HTML del build
// de Next) para que cargue sin red tras la primera visita. Excluido de tsc en
// tsconfig.json porque requiere el lib "webworker", incompatible con el lib "dom"
// que usa el resto del proyecto.
import { defaultCache } from '@serwist/next/worker';
import { Serwist } from 'serwist';

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
