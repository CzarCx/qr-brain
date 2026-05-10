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
  Settings2
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

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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
              {mainNavLinks.map((link) => {
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
             <Link href="/registro-personal" className={cn(
                 "p-2 rounded-full transition-colors",
                 pathname === '/registro-personal'
                 ? 'bg-starbucks-green text-white'
                 : 'text-gray-500 hover:bg-starbucks-cream hover:text-starbucks-dark'
             )}>
                <UserPlus className="h-6 w-6" />
                <span className="sr-only">Registrar Personal</span>
            </Link>

            {/* Mobile Menu Trigger */}
            <div className="lg:hidden">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-starbucks-green">
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px] sm:w-[350px]">
                  <SheetHeader className="border-b pb-4 mb-4">
                    <SheetTitle className="text-starbucks-green flex items-center gap-2 text-left">
                      <Home className="h-5 w-5" />
                      Menú del Sistema
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col space-y-2">
                    {mainNavLinks.map((link) => {
                      const isActive = pathname === link.href;
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            'flex items-center gap-4 px-4 py-3 rounded-lg text-sm font-bold transition-colors',
                            isActive
                              ? 'bg-starbucks-green text-white'
                              : 'text-starbucks-dark hover:bg-starbucks-cream'
                          )}
                        >
                          <div className={cn("p-2 rounded-md", isActive ? "bg-white/20" : "bg-gray-100")}>
                            {link.icon}
                          </div>
                          {link.label}
                        </Link>
                      );
                    })}
                  </div>
                  <div className="mt-8 pt-4 border-t">
                    <Link
                      href="/registro-personal"
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-4 px-4 py-3 rounded-lg text-sm font-bold transition-colors',
                        pathname === '/registro-personal'
                          ? 'bg-starbucks-green text-white'
                          : 'text-starbucks-dark hover:bg-starbucks-cream'
                      )}
                    >
                      <div className="p-2 rounded-md bg-gray-100">
                        <UserPlus className="h-5 w-5" />
                      </div>
                      Registrar Personal
                    </Link>
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
