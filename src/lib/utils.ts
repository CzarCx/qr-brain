import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Si una petición a Supabase se cuelga sin resolver ni rechazar (token de sesión
// vencido a medio refrescar, service worker con su propio timeout, red caída a
// medias), un simple try/catch/finally nunca llega a ejecutarse y el estado de
// loading queda pegado para siempre, bloqueando cualquier acción futura. Esto
// garantiza que la promesa siempre termine, sin importar dónde se cuelgue.
export function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Tiempo de espera agotado')), ms)),
  ]);
}

// Distingue un fallo de RED de un error de datos. Hace falta porque el fallo de red
// no llega de forma uniforme: a veces es un TypeError ("Load failed" en Safari,
// "Failed to fetch" en Chrome), a veces el service worker responde "no-response",
// y withTimeout rechaza con "Tiempo de espera agotado". Se usa para degradar a
// offline (snapshot / cola) en vez de bloquear al operario con un modal de error.
// navigator.onLine no basta: en iOS reporta "online" con señal fantasma.
export function esErrorDeRed(e: any): boolean {
  return (
    e?.name === 'TypeError' ||
    /no-response|Failed to fetch|Load failed|NetworkError|respondWith|Tiempo de espera agotado/i.test(e?.message ?? '')
  );
}

// En Android, justo tras iniciar el stream la cámara a veces todavía no reporta
// `torch` en sus capabilities (el hardware tarda un momento en exponerlo) aunque
// sí lo soporte. Se reintenta unas veces antes de aceptar el resultado como final.
export async function getCameraCapabilitiesWithRetry(
  track: MediaStreamTrack,
  attempts = 5,
  delayMs = 300
): Promise<MediaTrackCapabilities | null> {
  let caps: MediaTrackCapabilities | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      caps = track.getCapabilities?.() ?? null;
    } catch {
      caps = null;
    }
    if (caps && (caps as any).torch) return caps;
    if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return caps;
}

// ── Marketplace ─────────────────────────────────────────────────────────────
// Valor normalizado para `personal.marketplace`, derivado del `origen` (plataforma)
// del item. Cubre las dos variantes de TikTok ('TikTok' del autocompletado y
// 'TikTok Shop' del modo externo). Cualquier otra externa (Amazon, Estafeta, Otro…)
// se normaliza genéricamente a MAYÚSCULAS con espacios -> '_'.
export function marketplaceFromOrigen(origen?: string | null): string {
  const o = (origen || 'Mercado Libre').trim().toLowerCase();
  if (o.includes('tiktok')) return 'TIKTOK';
  if (o.includes('mercado')) return 'MERCADO_LIBRE';
  if (o.includes('walmart')) return 'WALMART';
  if (o.includes('fedex')) return 'FEDEX';
  return o.toUpperCase().replace(/\s+/g, '_');
}

// TikTok/Walmart/FedEx no tienen "empresa/marca interna": su organización por defecto
// es INMATMEX. El resto (Mercado Libre) conserva la empresa/tienda tal cual.
const MARKETPLACES_INMATMEX = new Set(['TIKTOK', 'WALMART', 'FEDEX']);
export function resolveOrganizationParaMarketplace(marketplace: string, empresa?: string | null): string | null {
  const emp = empresa && empresa !== '---' ? empresa : null;
  if (MARKETPLACES_INMATMEX.has(marketplace)) return emp ?? 'INMATMEX';
  return emp;
}
