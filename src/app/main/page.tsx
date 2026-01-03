'use client';

import Link from 'next/link';
import Head from 'next/head';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, UserCheck, ClipboardList, ScanLine, PackageCheck, UserPlus } from 'lucide-react';
import Image from 'next/image';


const navLinks = [
  { href: '/', label: 'Asignar', icon: <UserCheck className="h-8 w-8 text-white" />, description: 'Asigna productos a personal.' },
  { href: '/ppc', label: 'PPC', icon: <ClipboardList className="h-8 w-8 text-white" />, description: 'Revisa y califica la calidad.' },
  { href: '/calificar', label: 'Calificar', icon: <ScanLine className="h-8 w-8 text-white" />, description: 'Confirma el etiquetado.' },
  { href: '/entrega', label: 'Entrega', icon: <PackageCheck className="h-8 w-8 text-white" />, description: 'Registra la salida de paquetes.' },
  { href: '/registro-personal', label: 'Registrar', icon: <UserPlus className="h-8 w-8 text-white" />, description: 'Añade nuevos miembros al equipo.' },
];

export default function MainPage() {
  return (
    <>
      <Head>
        <title>Menú Principal</title>
      </Head>
      <main className="flex items-center justify-center min-h-screen bg-starbucks-light-gray p-4">
        <Card className="w-full max-w-4xl mx-auto shadow-2xl">
          <CardHeader className="text-center p-6 bg-starbucks-green text-white rounded-t-xl">
             <Image src="/INMATMEX.png" alt="INMATMEX Logo" width={80} height={80} className="mx-auto mb-4" />
            <CardTitle className="text-3xl font-bold">Bienvenido al Sistema de Control</CardTitle>
            <CardDescription className="text-gray-200 mt-2 text-lg">Selecciona un módulo para comenzar</CardDescription>
          </CardHeader>
          <CardContent className="p-6 md:p-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {navLinks.map((link) => (
                <Link href={link.href} key={link.href} passHref>
                  <div className="group bg-starbucks-white border border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center text-center h-full transform transition-transform duration-300 ease-in-out hover:scale-105 hover:shadow-lg hover:bg-starbucks-cream">
                    <div className="bg-starbucks-accent rounded-full p-4 mb-4">
                      {link.icon}
                    </div>
                    <h3 className="text-xl font-bold text-starbucks-dark mb-2">{link.label}</h3>
                    <p className="text-gray-600 text-sm mb-4">{link.description}</p>
                    <Button variant="ghost" className="mt-auto text-starbucks-green font-bold group-hover:underline">
                      Ir al módulo <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}