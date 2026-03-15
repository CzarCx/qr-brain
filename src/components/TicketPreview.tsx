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
      className="p-4 bg-white text-black font-sans mx-auto shadow-sm print:shadow-none"
      style={{ 
        width: '80mm',
        minHeight: '120mm',
        fontSize: '11px',
        lineHeight: '1.2'
      }}
    >
      {/* Header Grid */}
      <div className="border-[1.5px] border-black">
        {/* TICKET PICKER */}
        <div className="text-center font-bold border-b border-black py-1 uppercase text-sm">
          TICKET PICKER
        </div>

        {/* Date and Time Row */}
        <div className="grid grid-cols-2 border-b border-black">
          <div className="border-r border-black px-2 py-1 text-center font-bold">{data.date}</div>
          <div className="px-2 py-1 text-center font-bold">{data.time}</div>
        </div>

        {/* Deadline Row */}
        <div className="grid grid-cols-2 border-b border-black">
          <div className="border-r border-black px-2 py-1 text-center font-bold text-red-600">{data.deadline}</div>
          <div className="px-2 py-1"></div>
        </div>

        {/* Total Highlight Row */}
        <div className="grid grid-cols-2 border-b border-black">
          <div className="bg-[#ffff00] border-r border-black px-2 py-1 text-center font-bold">{data.totalPaquetes}</div>
          <div className="px-2 py-1"></div>
        </div>

        {/* Encargado Name */}
        <div className="text-center border-b border-black py-1 px-1 font-bold uppercase text-[10px]">
          {data.encargado}
        </div>

        {/* Area Name */}
        <div className="grid grid-cols-2 border-b border-black">
          <div className="border-r border-black px-2 py-1 font-bold uppercase">{data.area}</div>
          <div className="px-2 py-1"></div>
        </div>

        {/* Packer Name */}
        <div className="text-center border-b border-black py-1 px-1 font-bold uppercase text-[10px]">
          {data.packer}
        </div>

        <div className="py-1"></div>

        {/* Resumen Table Headers */}
        <div className="grid grid-cols-[60px_1fr_60px] border-t border-b border-black font-bold text-center uppercase text-[9px]">
          <div className="border-r border-black py-1">PIEZAS</div>
          <div className="border-r border-black py-1">SUBCATEGORIA</div>
          <div className="py-1 text-red-600">PEDIDOS</div>
        </div>

        {/* Resumen Rows */}
        {data.resumen.map((item, index) => (
          <div key={index} className="grid grid-cols-[60px_1fr_60px] border-b border-black text-center text-[10px]">
            <div className="border-r border-black py-1 font-bold">{item.pieces}</div>
            <div className="bg-[#d9ead3] border-r border-black py-1 px-1 text-left font-bold uppercase text-[9px] leading-tight flex items-center">
              {item.sub_cat}
            </div>
            <div className="py-1 font-bold text-red-600">{item.orders}</div>
          </div>
        ))}

        <div className="py-1 bg-white"></div>

        {/* Barcode Section Header */}
        <div className="border-t border-b border-black px-2 py-1 font-bold text-red-600 text-[9px]">
          CODIGO DE BARRA
        </div>

        {/* DESGLOSE HEADER */}
        <div className="text-center border-b border-black py-1 font-bold uppercase text-[10px]">
          DESGLOSE DE PEDIDOS
        </div>

        {/* Desglose Table Headers */}
        <div className="grid grid-cols-[70px_1fr_60px] border-b border-black font-bold text-center uppercase text-[8px]">
          <div className="border-r border-black flex flex-col justify-center items-center py-1 leading-tight">
            <span>UNIDADES</span>
            <span>DENTRO</span>
            <span>DEL</span>
            <span>PAQUETE</span>
          </div>
          <div className="border-r border-black flex items-end justify-center py-1">
            SUBCATEGORIA
          </div>
          <div className="flex flex-col justify-center items-center py-1 leading-tight">
            <span># DE</span>
            <span>PAQUETES</span>
          </div>
        </div>

        {/* Desglose Rows */}
        {data.desglose.map((item, index) => (
          <div key={index} className="grid grid-cols-[70px_1fr_60px] border-b border-black text-center text-[10px]">
            <div className="border-r border-black py-1 font-bold flex items-center justify-center">{item.units}</div>
            <div className="bg-[#d9ead3] border-r border-black py-1 px-1 text-left font-bold uppercase text-[9px] leading-tight flex items-center">
              {item.sub_cat}
            </div>
            <div className="py-1 font-bold flex items-center justify-center">{item.packages}</div>
          </div>
        ))}

        <div className="py-1 bg-white"></div>

        {/* Total Footer */}
        <div className="grid grid-cols-[1fr_60px] border-t border-black">
          <div className="border-r border-black px-2 py-1 text-right font-bold text-[9px] flex items-center justify-end">
            TOTAL DE PAQUETES
          </div>
          <div className="bg-[#ffff00] py-1 font-bold text-center flex items-center justify-center">
            {data.totalPaquetes}
          </div>
        </div>

        {/* Barcode Footer Header */}
        <div className="border-t border-black px-2 py-1 font-bold text-red-600 text-[9px]">
          CODIGO DE BARRAS
        </div>
      </div>

      {/* Barcode Render */}
      <div className="flex justify-center mt-4">
        <Barcode 
          value={data.ticketId} 
          width={1.2} 
          height={30} 
          fontSize={8}
          background="transparent"
          margin={0}
        />
      </div>
      
      <div className="mt-4 text-center text-[8px] space-y-1">
        <p className="font-bold">SISTEMA DE CONTROL DE CALIDAD - PRODUCCIÓN EFICIENTE</p>
        <p className="font-bold">*** FIN DE TICKET ***</p>
      </div>
    </div>
  );
});

TicketPreview.displayName = 'TicketPreview';

export default TicketPreview;
