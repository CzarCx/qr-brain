/**
 * @fileOverview Definición de tipos para el módulo de tickets de costura.
 * Refleja exactamente el esquema de la tabla public.sewing_tickets.
 */

export interface SewingTicket {
  id?: number;
  codigo_barra: string;
  fecha_impresion: string | null;
  hora_vaciado: string | null;
  responsable_vaciado: string | null;
  cuenta: string | null;
  fecha_entrega_paquete: string | null;
  id_venta?: string | null; 
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
  created_at?: string;
  updated_at?: string;
  pack_id: number | null;
  sales_num: number | null;
  sku: string | null;
  alias?: string | null;
  impreso?: boolean | null;
  esti_time?: number | null;
}

export type SewingProcessName = 
  | 'CORTE' 
  | 'COSTURA' 
  | 'OJILLADO' 
  | 'DOBLADO' 
  | 'ETIQUETADO' 
  | 'VERIFICACION' 
  | 'EMPAQUE';

export interface SewingProcessTime {
  id?: number;
  ticket_id?: number | null;
  sku: string;
  process_name: SewingProcessName;
  time_minutes: number;
  quantity_pieces: number;
  operator_name: string;
  observations?: string | null;
  created_at?: string;
}
