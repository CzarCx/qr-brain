
'use client';

import React, { forwardRef } from 'react';
import Barcode from 'react-barcode';

type TicketData = {
  ticketId: string;
  date: string;
  time: string;
  deadline: string;
  encargado: string;
  area: string;
  packer: string;
  resumen: { pieces: number; sub_cat: string; orders: number }[];
  desglose: { units: number; sub_cat: string; packages: number }[];
  totalPaquetes: number;
};

const TicketPreview = forwardRef<HTMLDivElement, { data: TicketData }>(({ data }, ref) => {
  return (
    <div 
      ref={ref} 
      className="p-6 bg-white text-black font-mono mx-auto shadow-sm print:shadow-none"
      style={{ 
        width: '80mm',
        fontSize: '12px',
        lineHeight: '1.4',
        color: 'black'
      }}
    >
      {/* Centered Header */}
      <div className="text-center space-y-1 mb-4">
        <h1 className="text-lg font-bold uppercase tracking-tighter">Ticket de Requerimientos</h1>
        <p className="text-[10px] uppercase font-bold">Bodega de Producción</p>
        <p className="text-[10px]">{data.date} - {data.time}</p>
      </div>

      <div className="border-t border-dashed border-black my-2"></div>

      {/* Info Section */}
      <div className="space-y-1 text-[11px] uppercase">
        <div className="flex justify-between gap-2">
          <span className="flex-shrink-0">ENCARGADO:</span>
          <span className="font-bold truncate text-right">{data.encargado}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="flex-shrink-0">AREA:</span>
          <span className="font-bold text-right">{data.area}</span>
        </div>
        <div className="flex justify-between gap-2 border-b border-black pb-1">
          <span className="flex-shrink-0">EMPACADOR:</span>
          <span className="font-bold text-right">{data.packer}</span>
        </div>
        <div className="flex justify-between pt-1 font-bold">
          <span>HORA LÍMITE:</span>
          <span className="text-sm">{data.deadline}</span>
        </div>
      </div>

      <div className="border-t border-dashed border-black my-2"></div>

      {/* Resumen Section */}
      <div className="space-y-1">
        <div className="flex justify-between font-bold text-[10px] border-b border-black mb-1">
          <span>SUBCATEGORIA</span>
          <span>PIEZAS</span>
        </div>
        {data.resumen.map((item, index) => (
          <div key={index} className="flex justify-between items-start gap-2 text-[11px]">
            <span className="uppercase text-left flex-1 break-words">{item.sub_cat}</span>
            <span className="font-bold flex-shrink-0">{item.pieces}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-black my-2"></div>

      {/* Desglose Section */}
      <div className="text-center font-bold text-[10px] uppercase mb-2 underline decoration-dotted underline-offset-4">Desglose de Pedidos</div>
      <div className="space-y-1">
        <div className="flex justify-between font-bold text-[9px] border-b border-black mb-1">
          <span>UNIDADES X PAQUETE</span>
          <span>BULTOS</span>
        </div>
        {data.desglose.map((item, index) => (
          <div key={index} className="flex justify-between text-[10px] leading-tight mb-1">
            <span className="uppercase flex-1 pr-2">{item.units} UND - {item.sub_cat}</span>
            <span className="font-bold flex-shrink-0">x{item.packages}</span>
          </div>
        ))}
      </div>

      <div className="border-t-2 border-black my-3"></div>

      {/* Totals */}
      <div className="flex justify-between items-center font-bold text-sm py-1">
        <span>TOTAL PAQUETES:</span>
        <span className="text-xl border-2 border-black px-2">{data.totalPaquetes}</span>
      </div>

      {/* Barcode Render */}
      <div className="flex flex-col items-center justify-center mt-6 space-y-1">
        <Barcode 
          value={data.ticketId} 
          width={1.2} 
          height={35} 
          fontSize={10}
          background="transparent"
          margin={0}
        />
        <p className="text-[9px] font-bold tracking-widest">{data.ticketId}</p>
      </div>
      
      <div className="border-t border-dashed border-black mt-4 mb-2"></div>

      <div className="text-center text-[9px] font-bold space-y-1">
        <p>SISTEMA DE CONTROL DE CALIDAD</p>
        <p>PRODUCCIÓN EFICIENTE</p>
        <p className="pt-2">*** FIN DE TICKET ***</p>
      </div>
    </div>
  );
});

TicketPreview.displayName = 'TicketPreview';

export default TicketPreview;
