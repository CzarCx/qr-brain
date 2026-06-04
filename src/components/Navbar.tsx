'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { 
  ScanLine, 
  PackageCheck, 
  UserCheck, 
  UserPlus, 
  Home, 
  ClipboardList, 
  Undo2, 
  Boxes, 
  Scissors,
  Menu,
  Settings2,
  LogOut,
  User as UserIcon,
  LayoutGrid,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth, ROUTE_PERMISSIONS } from '@/components/AuthProvider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const mainNavLinks = [
  { href: '/', label: 'Asignar', icon: <UserCheck className="h-5 w-5" /> },
  { href: '/almacen', label: 'Almacén', icon: <Boxes className="h-5 w-5" /> },
  { href: '/ppc', label: 'PPC', icon: <ClipboardList className="h-5 w-5" /> },
  { href: '/calificar', label: 'Calificar', icon: <ScanLine className="h-5 w-5" /> },
  { href: '/entrega', label: 'Entrega', icon: <PackageCheck className="h-5 w-5" /> },
  { href: '/devoluciones', label: 'Devolución', icon: <Undo2 className="h-5 w-5" /> },
  { href: '/sewing-tickets', label: 'Costura', icon: <Scissors className="h-5 w-5" /> },
  { href: '/sewing-tickets/status', label: 'Status Rápido', icon: <Settings2 className="h-5 w-5" /> },
];

const externalLinks = [
  {
    href: "https://etiquetas-extractor.vercel.app",
    label: "Extractor de Etiquetas",
    desc: "Herramienta de extracción"
  },
  {
    href: "https://desktop-inventory-mtm.vercel.app",
    label: "Gestión Inventarios (Jair)",
    desc: "Pedidos internos e inventarios"
  },
  {
    href: "https://cerebro2.vercel.app/perfil",
    label: "Control RH (Austin)",
    desc: "Asistencia y nómina"
  },
  {
    href: "https://cerebro2-0.vercel.app/producto-estrella",
    label: "Corte de Caja (César)",
    desc: "Márgenes ML y SKUs"
  },
  {
    href: "https://analizador-de-csv-2.vercel.app/historical-analysis/operations",
    label: "Gastos y Ventas (Melanie)",
    desc: "Análisis 80/20 y movimientos"
  },
  {
    href: "https://invetario-compras.vercel.app",
    label: "Compras (César)",
    desc: "Nacionales e internacionales"
  }
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { session, profile, roles, hasRole, signOut } = useAuth();

  if (pathname === '/login') return null;

  const visibleLinks = mainNavLinks.filter(link => {
    const requiredRoles = ROUTE_PERMISSIONS[link.href];
    if (!requiredRoles) return true;
    return roles.includes('ADMIN') || requiredRoles.some(r => roles.includes(r));
  });

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-starbucks-white shadow-md">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Home */}
          <div className="flex items-center">
            <Link href="/main" className="flex-shrink-0 p-2 hover:bg-starbucks-cream rounded-full transition-colors">
                <Home className="h-6 w-6 text-starbucks-green" />
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex flex-1 justify-center px-4">
            <div className="flex space-x-1">
              {visibleLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-md text-xs font-medium transition-all duration-200 hover:scale-105',
                      isActive
                        ? 'bg-starbucks-green text-white shadow-sm'
                        : 'text-starbucks-dark hover:bg-starbucks-cream'
                    )}
                  >
                    {link.icon}
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* User Actions & Mobile Toggle */}
          <div className="flex items-center gap-2">
             {/* External Modules Menu */}
             <div className="hidden md:block">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-10 px-3 text-starbucks-dark hover:bg-starbucks-cream gap-2">
                            <LayoutGrid className="h-5 w-5 text-starbucks-green" />
                            <span className="text-xs font-black uppercase tracking-tight">Módulos</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-72" align="end">
                        <DropdownMenuLabel className="text-[10px] font-black uppercase text-gray-400 tracking-widest px-3 py-2">Plataformas Externas</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {externalLinks.map((ext) => (
                            <DropdownMenuItem key={ext.href} asChild>
                                <a 
                                    href={ext.href} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="flex flex-col items-start gap-0.5 p-3 cursor-pointer hover:bg-starbucks-cream/50 transition-colors"
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <span className="text-xs font-black text-starbucks-dark uppercase">{ext.label}</span>
                                        <ExternalLink className="h-3 w-3 text-gray-300" />
                                    </div>
                                    <span className="text-[9px] font-bold text-gray-400 line-clamp-1">{ext.desc}</span>
                                </a>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
             </div>

             {session && (
               <DropdownMenu>
                 <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                      <Avatar className="h-9 w-9 border-2 border-starbucks-green/20">
                        <AvatarFallback className="bg-starbucks-cream text-starbucks-green font-black">
                          {profile?.email?.[0].toUpperCase() ?? 'U'}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-black leading-none text-starbucks-dark">{profile?.email}</p>
                        <p className="text-[10px] font-bold leading-none text-muted-foreground uppercase tracking-widest mt-1">
                          Roles: {roles.length > 0 ? roles.join(', ') : 'SIN ROLES'}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {hasRole('ADMIN') && (
                      <DropdownMenuItem asChild>
                         <Link href="/registro-personal" className="cursor-pointer font-bold">
                            <UserPlus className="mr-2 h-4 w-4" />
                            <span>Registrar Personal</span>
                         </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut} className="text-red-600 cursor-pointer focus:text-red-600 focus:bg-red-50">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Cerrar Sesión</span>
                    </DropdownMenuItem>
                 </DropdownMenuContent>
               </DropdownMenu>
             )}

            {/* Mobile Menu Trigger */}
            <div className="lg:hidden">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-starbucks-green">
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[300px] sm:w-[400px] p-0 flex flex-col">
                  <SheetHeader className="p-6 border-b bg-starbucks-cream/30">
                    <SheetTitle className="text-starbucks-green flex items-center gap-2 text-left font-black uppercase tracking-tighter">
                      <Home className="h-5 w-5" />
                      Menú del Sistema
                    </SheetTitle>
                  </SheetHeader>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
                    <div className="space-y-1">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 mb-2">Módulos de Control</p>
                        {visibleLinks.map((link) => {
                          const isActive = pathname === link.href;
                          return (
                            <Link
                              key={link.href}
                              href={link.href}
                              onClick={() => setOpen(false)}
                              className={cn(
                                'flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-bold transition-all active:scale-95',
                                isActive
                                  ? 'bg-starbucks-green text-white shadow-lg'
                                  : 'text-starbucks-dark hover:bg-starbucks-cream'
                              )}
                            >
                              <div className={cn("p-2 rounded-lg", isActive ? "bg-white/20" : "bg-gray-100")}>
                                {link.icon}
                              </div>
                              {link.label}
                            </Link>
                          );
                        })}
                    </div>

                    <div className="space-y-1">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 mb-2">Plataformas Externas</p>
                        <div className="grid grid-cols-1 gap-2">
                            {externalLinks.map((ext) => (
                                <a
                                    key={ext.href}
                                    href={ext.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 border border-gray-100 hover:border-starbucks-green/30 transition-colors"
                                >
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-starbucks-dark uppercase">{ext.label}</span>
                                        <span className="text-[9px] font-bold text-gray-400">{ext.desc}</span>
                                    </div>
                                    <ExternalLink className="h-3 w-3 text-gray-300" />
                                </a>
                            ))}
                        </div>
                    </div>
                  </div>

                  <div className="p-4 border-t bg-gray-50 space-y-2">
                    {hasRole('ADMIN') && (
                      <Link
                        href="/registro-personal"
                        onClick={() => setOpen(false)}
                        className={cn(
                          'flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-bold transition-colors',
                          pathname === '/registro-personal'
                            ? 'bg-starbucks-green text-white'
                            : 'text-starbucks-dark hover:bg-gray-200'
                        )}
                      >
                        <div className="p-2 rounded-lg bg-white shadow-sm">
                          <UserPlus className="h-5 w-5 text-starbucks-green" />
                        </div>
                        Registrar Personal
                      </Link>
                    )}
                    <Button 
                      variant="ghost" 
                      onClick={signOut}
                      className="w-full justify-start gap-4 px-4 py-6 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <div className="p-2 rounded-lg bg-white shadow-sm">
                        <LogOut className="h-5 w-5" />
                      </div>
                      Cerrar Sesión
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
