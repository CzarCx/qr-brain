'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ScanLine, PackageCheck, UserCheck, UserPlus, Home } from 'lucide-react';
import Image from 'next/image';
import { useEffect } from 'react';
import { supabaseDB2 } from '@/lib/supabaseClient';

const mainNavLinks = [
  { href: '/', label: 'Asignar', icon: <UserCheck className="h-5 w-5" /> },
  { href: '/calificar', label: 'Calificar', icon: <ScanLine className="h-5 w-5" /> },
  { href: '/entrega', label: 'Entrega', icon: <PackageCheck className="h-5 w-5" /> },
];

const secondaryNavLinks = [
    { href: '/registro-personal', label: 'Registrar Personal', icon: <UserPlus className="h-5 w-5" /> },
]

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabaseDB2.auth.getSession();
      if (!session && pathname !== '/login') {
        router.push('/login');
      }
    };

    // We don't want to check for user on the login page itself
    if (pathname !== '/login') {
      checkUser();
    }
    
    const { data: { subscription } } = supabaseDB2.auth.onAuthStateChange((event, session) => {
      if (!session && pathname !== '/login') {
        router.push('/login');
      } else if (session && pathname === '/login') {
        router.push('/');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (pathname === '/login') {
    return null; // Don't render navbar on login page
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-starbucks-white shadow-md">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex-shrink-0 p-2">
                <Home className="h-6 w-6 text-starbucks-green" />
            </Link>
          </div>
          <div className="flex-1 flex justify-center px-2 lg:ml-6 lg:justify-center">
            <div className="flex space-x-1 sm:space-x-2">
              {mainNavLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-md text-xs font-medium transition-colors w-20 sm:w-24',
                      isActive
                        ? 'bg-starbucks-green text-white'
                        : 'text-starbucks-dark hover:bg-starbucks-cream hover:text-starbucks-dark'
                    )}
                  >
                    {link.icon}
                    <span>{link.label}</span>
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
