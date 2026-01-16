'use client';

import Link from 'next/link';
import Head from 'next/head';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserCog, UserCheck, ClipboardList, ScanLine, PackageCheck, UserPlus } from 'lucide-react';

const navItems = [
  {
    href: '/',
    title: 'Asignar Empaquetado',
    description: 'Asigna etiquetas de productos a los operarios.',
    icon: <UserCheck className="h-8 w-8 text-starbucks-green" />,
    cta: 'Ir a Asignar',
  },
  {
    href: '/ppc',
    title: 'PPC',
    description: 'Marca etiquetas como "Producción Por Calificar".',
    icon: <ClipboardList className="h-8 w-8 text-starbucks-green" />,
    cta: 'Ir a PPC',
  },
  {
    href: '/calificar',
    title: 'Calificar Calidad',
    description: 'Escanea y califica la calidad del empaquetado.',
    icon: <ScanLine className="h-8 w-8 text-starbucks-green" />,
    cta: 'Ir a Calificar',
  },
  {
    href: '/entrega',
    title: 'Módulo de Entrega',
    description: 'Registra los paquetes que salen a entrega.',
    icon: <PackageCheck className="h-8 w-8 text-starbucks-green" />,
    cta: 'Ir a Entrega',
  },
  {
    href: '/registro-personal',
    title: 'Registrar Personal',
    description: 'Añade y gestiona los miembros del equipo.',
    icon: <UserPlus className="h-8 w-8 text-starbucks-green" />,
    cta: 'Ir a Registro',
  },
  {
    href: 'https://admin-mod-cerebro-jphk.vercel.app/',
    title: 'Panel de Administración',
    description: 'Accede al panel de control y reportes.',
    icon: <UserCog className="h-8 w-8 text-starbucks-green" />,
    cta: 'Ir al Panel',
    isExternal: true,
  },
];


export default function MainPage() {
  return (
    <>
      <Head>
        <title>Menú Principal</title>
      </Head>
      <main className="flex items-center justify-center min-h-screen bg-starbucks-light-gray p-4">
        <Card className="w-full max-w-5xl mx-auto shadow-2xl overflow-hidden">
          <CardHeader className="text-center p-6 bg-starbucks-green text-white">
            <CardTitle className="text-3xl font-bold tracking-tight">Bienvenido al Sistema de Control</CardTitle>
            <CardDescription className="text-gray-200 mt-2 text-lg">Selecciona un módulo para comenzar</CardDescription>
          </CardHeader>
          <CardContent className="p-6 md:p-8 bg-white">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {navItems.map((item) => {
                const CardLink = item.isExternal ? 'a' : Link;
                const linkProps = item.isExternal 
                    ? { href: item.href, target: '_blank', rel: 'noopener noreferrer' } 
                    : { href: item.href };

                return (
                  <CardLink key={item.href} {...linkProps} className="block group">
                    <div className="bg-starbucks-white border border-gray-200 rounded-xl p-6 text-center h-full transform transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-xl hover:border-starbucks-green">
                      <div className="bg-gray-100 rounded-full p-4 mb-4 inline-block transition-colors duration-300 group-hover:bg-green-100">
                        {item.icon}
                      </div>
                      <h3 className="text-lg font-bold text-starbucks-dark mb-1">{item.title}</h3>
                      <p className="text-gray-600 text-sm mb-4 h-10">{item.description}</p>
                      <Button variant="ghost" className="mt-auto font-bold text-starbucks-green group-hover:bg-starbucks-green group-hover:text-white">
                        {item.cta}
                      </Button>
                    </div>
                  </CardLink>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
