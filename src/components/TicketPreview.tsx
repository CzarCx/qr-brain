
'use client';

import React, { forwardRef } from 'react';

type TicketData = {
  date: string;
  encargado: string;
  area: string;
  packer: string;
  items: { sub_cat: string; quantity: number }[];
  totalPieces: number;
};

const TicketPreview = forwardRef<HTMLDivElement, { data: TicketData }>(({ data }, ref) => {
  return (
    <div 
      ref={ref} 
      className="p-6 bg-white text-black font-mono mx-auto shadow-sm print:shadow-none"
      style={{ 
        width: '80mm',
        minHeight: '100mm',
        fontSize: '12px',
        lineHeight: '1.3'
      }}
    >
      <div className="text-center border-b border-black border-dashed pb-4 mb-4">
        <h1 className="text-lg font-bold tracking-tighter uppercase">Ticket de Requerimientos</h1>
        <p className="text-[10px] mt-1">{data.date}</p>
      </div>
      
      <div className="space-y-1 mb-4 text-[11px]">
        <div className="flex justify-between">
          <span className="font-bold">ENCARGADO:</span>
          <span className="truncate pl-2 uppercase">{data.encargado}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold">ÁREA:</span>
          <span className="uppercase">{data.area}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold">EMPACADOR:</span>
          <span className="text-right pl-2 uppercase">{data.packer}</span>
        </div>
      </div>

      <div className="border-t border-b border-black border-dashed py-2 mb-2">
        <div className="flex justify-between font-bold text-[10px] mb-1">
          <span>SUBCATEGORÍA</span>
          <span>CANT.</span>
        </div>
        <div className="space-y-1">
          {data.items.length > 0 ? data.items.map((item, index) => (
            <div key={index} className="flex justify-between text-[11px] items-start">
              <span className="truncate pr-2 uppercase">{item.sub_cat}</span>
              <span className="font-bold">{item.quantity}</span>
            </div>
          )) : (
            <div className="text-center text-[10px] py-2">Sin productos</div>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center pt-2 font-bold text-base">
        <span>TOTAL PIEZAS:</span>
        <span>{data.totalPieces}</span>
      </div>
      
      <div className="mt-10 text-center text-[9px] border-t border-black border-dashed pt-4">
        <p>SISTEMA DE CONTROL DE CALIDAD</p>
        <p>PRODUCCIÓN EFICIENTE</p>
        <p className="mt-2 font-bold">*** FIN DE TICKET ***</p>
      </div>
    </div>
  );
});

TicketPreview.displayName = 'TicketPreview';

export default TicketPreview;
