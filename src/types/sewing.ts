
/**
 * @fileOverview Definición de tipos para el módulo de tickets de costura.
 */

export interface SewingTicket {
  id?: number;
  created_at?: string;
  codigo_barra: string;
  fecha_impresion: string | null;
  hora_vaciado: string | null;
  responsable_vaciado: string | null;
  cuenta: string | null;
  fecha_entrega_paquete: string | null;
  id_venta: string | null;
  nombre_producto: string | null;
  cantidad: number | null;
  tipo: string | null;
  responsable_impresion: string | null;
  impresa: boolean | null;
  asignada_a: string | null;
  cortada: boolean | null;
  confeccion: boolean | null;
  perforado: boolean | null;
  ojillado: boolean | null;
  empaquetado: boolean | null;
  lista_para_recoleccion: boolean | null;
  recolectada_por: string | null;
}
