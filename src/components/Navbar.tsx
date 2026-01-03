
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ScanLine, PackageCheck, UserCheck, UserPlus, Home, ClipboardList, Printer } from 'lucide-react';
import Image from 'next/image';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

const mainNavLinks = [
  { href: '/', label: 'Asignar', icon: <UserCheck className="h-5 w-5" /> },
  { href: '/ppc', label: 'PPC', icon: <ClipboardList className="h-5 w-5" /> },
  { href: '/calificar', label: 'Calificar', icon: <ScanLine className="h-5 w-5" /> },
  { href: '/entrega', label: 'Entrega', icon: <PackageCheck className="h-5 w-5" /> },
];

const secondaryNavLinks = [
    { href: '/registro-personal', label: 'Registrar Personal', icon: <UserPlus className="h-5 w-5" /> },
]

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-starbucks-white shadow-md">
      <div className="max-w-7xl mx-auto px-1 sm:px-4 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex-shrink-0 p-2">
                <Home className="h-6 w-6 text-starbucks-green" />
            </Link>
          </div>
          <div className="flex-1 flex justify-center px-1 lg:ml-6 lg:justify-center">
            <div className="flex space-x-1 w-full">
              {mainNavLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2 rounded-md text-[10px] sm:text-xs font-medium',
                      'transform transition-transform duration-200 ease-in-out hover:scale-110',
                      isActive
                        ? 'bg-starbucks-green text-white scale-105'
                        : 'text-starbucks-dark hover:bg-starbucks-cream hover:text-starbucks-dark'
                    )}
                  >
                    {link.icon}
                    <span className="text-center">{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
           <div className="flex items-center">
             <Link href="/registro-personal" className={cn(
                 "p-2 rounded-full text-sm font-medium transition-colors",
                 pathname === '/registro-personal'
                 ? 'bg-starbucks-cream text-starbucks-dark'
                 : 'text-gray-500 hover:bg-starbucks-cream hover:text-starbucks-dark'
             )}>
                <UserPlus className="h-6 w-6" />
                <span className="sr-only">Registrar Personal</span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
