
'use client';

import React, { forwardRef } from 'react';
import Barcode from 'react-barcode';

type TicketData = {
  ticketId: string;
  secondaryBarcodeId: string;
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
      className="p-8 bg-white text-black font-mono mx-auto shadow-sm print:shadow-none flex flex-col min-h-max h-auto"
      style={{ 
        width: '90mm',
        fontSize: '14px',
        lineHeight: '1.5',
        color: 'black',
        backgroundColor: 'white'
      }}
    >
      {/* Centered Header */}
      <div className="text-center space-y-1 mb-6">
        <h1 className="text-xl font-bold uppercase tracking-tighter">Ticket de Requerimientos</h1>
        <p className="text-xs uppercase font-bold">Bodega de Producción</p>
        <p className="text-xs">{data.date} - {data.time}</p>
      </div>

      <div className="border-t border-dashed border-black my-3"></div>

      {/* Info Section */}
      <div className="space-y-1 text-sm uppercase">
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
        <div className="flex justify-between pt-2 font-bold text-base">
          <span>HORA LÍMITE:</span>
          <span>{data.deadline}</span>
        </div>
      </div>

      <div className="border-t border-dashed border-black my-4"></div>

      {/* Resumen Section */}
      <div className="space-y-1 mb-6">
        <div className="flex justify-between font-bold text-xs border-b border-black mb-2">
          <span>SUBCATEGORIA</span>
          <span>PIEZAS</span>
        </div>
        {data.resumen.map((item, index) => (
          <div key={index} className="flex justify-between items-start gap-4 text-sm leading-tight mb-1">
            <span className="uppercase text-left flex-1 break-words">{item.sub_cat}</span>
            <span className="font-bold flex-shrink-0">{item.pieces}</span>
          </div>
        ))}
      </div>

      {/* Desglose Section */}
      <div className="text-center font-bold text-sm uppercase mb-3 underline decoration-dotted underline-offset-4">
        Desglose de Pedidos
      </div>
      
      <div className="space-y-1 mb-4">
        <div className="flex justify-between font-bold text-[11px] border-b border-black mb-2">
          <span>UNIDADES X PAQUETE</span>
          <span>BULTOS</span>
        </div>
        {data.desglose.map((item, index) => (
          <div key={index} className="flex justify-between text-sm leading-tight mb-1">
            <span className="uppercase flex-1 pr-4">
              {item.units} UND - {item.sub_cat}
            </span>
            <span className="font-bold flex-shrink-0">x{item.packages}</span>
          </div>
        ))}
      </div>

      <div className="border-t-2 border-black my-6"></div>

      {/* Totals Section with Box */}
      <div className="flex justify-between items-center py-2 mb-6">
        <span className="text-lg font-bold uppercase">Total Paquetes:</span>
        <div className="border-4 border-black px-4 py-1 flex items-center justify-center">
          <span className="text-3xl font-bold">{data.totalPaquetes}</span>
        </div>
      </div>

      {/* Barcodes Section */}
      <div className="space-y-6 mt-4">
        {/* Secondary Barcode */}
        <div className="flex flex-col items-center justify-center space-y-1">
          <div className="font-bold text-[10px] uppercase mb-1">Código de Control</div>
          <Barcode 
            value={data.secondaryBarcodeId} 
            width={1.2} 
            height={30} 
            fontSize={10}
            background="transparent"
            margin={0}
            displayValue={true}
          />
        </div>

        {/* Primary Barcode */}
        <div className="flex flex-col items-center justify-center space-y-1">
          <div className="font-bold text-sm uppercase mb-1">Código de Barra</div>
          <Barcode 
            value={data.ticketId} 
            width={1.5} 
            height={50} 
            fontSize={12}
            background="transparent"
            margin={0}
            displayValue={false}
          />
          <div className="text-center font-bold text-xs space-y-0.5 mt-2">
            <p>{data.ticketId}</p>
          </div>
        </div>
      </div>
      
      <div className="border-t border-dashed border-black mt-8 mb-4"></div>

      <div className="text-center text-[10px] font-bold space-y-1 uppercase mt-auto">
        <p>Sistema de Control de Calidad</p>
        <p>Producción Eficiente</p>
        <p className="pt-4">*** Fin de Ticket ***</p>
      </div>
    </div>
  );
});

TicketPreview.displayName = 'TicketPreview';

export default TicketPreview;
