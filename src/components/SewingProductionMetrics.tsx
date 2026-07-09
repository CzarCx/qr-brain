'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSewingProduction } from '@/hooks/use-sewing-production';
import { SewingProcessName, SewingProcessTime } from '@/types/sewing';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { 
  Clock, 
  Scissors, 
  Thread, 
  CheckCircle2, 
  Package, 
  Zap, 
  TrendingUp, 
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Activity,
  BarChart3
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const PROCESS_COLORS: Record<string, string> = {
  'CORTE': '#3b82f6', // blue
  'COSTURA': '#8b5cf6', // purple
  'OJILLADO': '#f59e0b', // amber
  'DOBLADO': '#10b981', // emerald
  'ETIQUETADO': '#ec4899', // pink
  'VERIFICACION': '#6366f1', // indigo
  'EMPAQUE': '#006241', // starbucks green
};

const PROCESS_ICONS: Record<string, any> = {
  'CORTE': Scissors,
  'COSTURA': Zap,
  'OJILLADO': Activity,
  'DOBLADO': Package,
  'ETIQUETADO': TrendingUp,
  'VERIFICACION': CheckCircle2,
  'EMPAQUE': Package,
};

export function SewingProductionMetrics() {
  const { processTimes, fetchProcessTimes, loading } = useSewingProduction();
  const [expandedSKUs, setExpandedSKUs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchProcessTimes();
  }, [fetchProcessTimes]);

  const metrics = useMemo(() => {
    if (processTimes.length === 0) return null;

    // Averages by process
    const processGroups: Record<string, { totalTime: number, totalPieces: number }> = {};
    const skuGroups: Record<string, { totalTime: number, totalPieces: number, processes: Record<string, { time: number, pieces: number }> }> = {};

    processTimes.forEach(record => {
      // Global
      if (!processGroups[record.process_name]) {
        processGroups[record.process_name] = { totalTime: 0, totalPieces: 0 };
      }
      processGroups[record.process_name].totalTime += record.time_minutes;
      processGroups[record.process_name].totalPieces += record.quantity_pieces;

      // SKU Specific
      if (!skuGroups[record.sku]) {
        skuGroups[record.sku] = { totalTime: 0, totalPieces: 0, processes: {} };
      }
      skuGroups[record.sku].totalTime += record.time_minutes;
      skuGroups[record.sku].totalPieces += record.quantity_pieces;
      
      if (!skuGroups[record.sku].processes[record.process_name]) {
        skuGroups[record.sku].processes[record.process_name] = { time: 0, pieces: 0 };
      }
      skuGroups[record.sku].processes[record.process_name].time += record.time_minutes;
      skuGroups[record.sku].processes[record.process_name].pieces += record.quantity_pieces;
    });

    const globalAverages = Object.entries(processGroups).map(([name, data]) => ({
      name,
      avg: data.totalPieces > 0 ? (data.totalTime / data.totalPieces) : 0,
      color: PROCESS_COLORS[name] || '#ccc'
    }));

    const totalPiecesGlobal = processTimes.reduce((acc, r) => acc + r.quantity_pieces, 0);
    const totalTimeGlobal = processTimes.reduce((acc, r) => acc + r.time_minutes, 0);
    const globalAvgTotal = totalPiecesGlobal > 0 ? (totalTimeGlobal / totalPiecesGlobal) : 0;

    const skuMetrics = Object.entries(skuGroups).map(([sku, data]) => {
      const avgTotal = data.totalPieces > 0 ? (data.totalTime / data.totalPieces) : 0;
      
      // Dynamic performance indicator
      let performance: 'fast' | 'normal' | 'slow' = 'normal';
      if (avgTotal < globalAvgTotal * 0.9) performance = 'fast';
      else if (avgTotal > globalAvgTotal * 1.1) performance = 'slow';

      return {
        sku,
        totalPieces: data.totalPieces,
        avgTotal,
        performance,
        processAverages: Object.entries(data.processes).map(([pName, pData]) => ({
          name: pName as SewingProcessName,
          avg: pData.pieces > 0 ? (pData.time / pData.pieces) : 0
        }))
      };
    }).sort((a, b) => b.totalPieces - a.totalPieces);

    return {
      globalAverages,
      globalAvgTotal,
      skuMetrics,
      totalRecords: processTimes.length
    };
  }, [processTimes]);

  const toggleSku = (sku: string) => {
    setExpandedSKUs(prev => ({ ...prev, [sku]: !prev[sku] }));
  };

  if (loading && processTimes.length === 0) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 animate-pulse">
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-lg font-black text-starbucks-dark flex items-center gap-2">
          <Clock className="h-5 w-5 text-starbucks-green" />
          MÉTRICAS DE PRODUCCIÓN
        </h2>
        <Badge variant="outline" className="text-[10px] font-bold text-gray-400">
          BASADO EN {metrics.totalRecords} REGISTROS
        </Badge>
      </div>

      {/* Global Average Cards */}
      <div className="flex overflow-x-auto pb-4 md:grid md:grid-cols-5 gap-4 px-1 snap-x no-scrollbar">
        <MetricCard 
          label="PROMEDIO TOTAL" 
          value={`${metrics.globalAvgTotal.toFixed(1)}m`} 
          subValue="Por pieza"
          icon={Clock}
          color="bg-starbucks-cream border-starbucks-green"
          className="snap-center min-w-[160px] md:min-w-0"
        />
        {metrics.globalAverages.slice(0, 4).map((m) => (
          <MetricCard 
            key={m.name}
            label={`${m.name} PROM.`} 
            value={`${m.avg.toFixed(1)}m`} 
            icon={PROCESS_ICONS[m.name] || Activity}
            color={`border-l-4`}
            style={{ borderLeftColor: m.color }}
            className="snap-center min-w-[160px] md:min-w-0"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <Card className="lg:col-span-1 shadow-sm border-gray-100">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              Tiempos por Proceso
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[200px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.globalAverages} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis 
                  dataKey="name" 
                  fontSize={8} 
                  fontWeight="bold" 
                  axisLine={false} 
                  tickLine={false}
                  tickFormatter={(val) => val.substring(0, 5)}
                />
                <YAxis fontSize={9} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '10px' }}
                  cursor={{ fill: 'transparent' }}
                />
                <Bar dataKey="avg" radius={[4, 4, 0, 0]} barSize={20}>
                  {metrics.globalAverages.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* SKU Performance List */}
        <Card className="lg:col-span-2 shadow-sm border-gray-100">
          <CardHeader className="py-4 border-b">
            <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-starbucks-green" />
              Rendimiento por SKU
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
              {metrics.skuMetrics.map((sku) => (
                <div key={sku.sku} className="border-b last:border-0">
                  <Collapsible open={!!expandedSKUs[sku.sku]} onOpenChange={() => toggleSku(sku.sku)}>
                    <CollapsibleTrigger className="w-full text-left p-3 hover:bg-gray-50 transition-colors flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <PerformanceIndicator status={sku.performance} />
                        <div>
                          <p className="text-[10px] font-black text-gray-500 font-mono leading-none">{sku.sku}</p>
                          <p className="text-xs font-bold text-starbucks-dark">{sku.totalPieces} piezas totales</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-[9px] font-bold text-gray-400 uppercase">TIEMPO PROM.</p>
                          <p className="text-sm font-black text-starbucks-green">{sku.avgTotal.toFixed(1)}m</p>
                        </div>
                        {expandedSKUs[sku.sku] ? <ChevronUp className="h-4 w-4 text-gray-300" /> : <ChevronDown className="h-4 w-4 text-gray-300" />}
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="bg-gray-50 px-4 py-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {sku.processAverages.map(p => (
                          <div key={p.name} className="space-y-1">
                            <p className="text-[9px] font-black text-gray-400 uppercase flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PROCESS_COLORS[p.name] }} />
                              {p.name}
                            </p>
                            <p className="text-xs font-black">{p.avg.toFixed(1)}m</p>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value, subValue, icon: Icon, color, className, style }: any) {
  return (
    <div className={cn("bg-white border rounded-xl p-4 transition-all hover:shadow-md", color, className)} style={style}>
      <div className="flex justify-between items-start mb-1">
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-gray-300" />}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-black text-starbucks-dark tracking-tighter">{value}</span>
        {subValue && <span className="text-[10px] font-bold text-gray-400">{subValue}</span>}
      </div>
    </div>
  );
}

function PerformanceIndicator({ status }: { status: 'fast' | 'normal' | 'slow' }) {
  const config = {
    fast: { color: 'bg-green-500', label: 'RÁPIDO' },
    normal: { color: 'bg-yellow-400', label: 'NORMAL' },
    slow: { color: 'bg-red-500', label: 'LENTO' },
  };
  
  return (
    <div className="flex flex-col items-center">
      <div className={cn("w-3 h-3 rounded-full mb-0.5 shadow-sm", config[status].color)} />
      <span className="text-[7px] font-black text-gray-400">{config[status].label}</span>
    </div>
  );
}
