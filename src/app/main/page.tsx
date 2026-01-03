
'use client';

import Link from 'next/link';
import Head from 'next/head';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, UserCog } from 'lucide-react';
import Image from 'next/image';

export default function MainPage() {
  return (
    <>
      <Head>
        <title>Menú Principal</title>
      </Head>
      <main className="flex items-center justify-center min-h-screen bg-starbucks-light-gray p-4">
        <Card className="w-full max-w-4xl mx-auto shadow-2xl">
          <CardHeader className="text-center p-6 bg-starbucks-green text-white rounded-t-xl">
            <CardTitle className="text-3xl font-bold">Bienvenido al Sistema de Control</CardTitle>
            <CardDescription className="text-gray-200 mt-2 text-lg">Selecciona un módulo para comenzar</CardDescription>
          </CardHeader>
          <CardContent className="p-6 md:p-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 justify-center">
               <a href="https://admin-mod-cerebro-jphk.vercel.app/" target="_blank" rel="noopener noreferrer" className="sm:col-span-2 lg:col-span-3 w-full lg:w-1/3 mx-auto">
                  <div className="group bg-starbucks-white border border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center text-center h-full transform transition-transform duration-300 ease-in-out hover:scale-105 hover:shadow-lg">
                    <div className="bg-gray-100 rounded-full p-4 mb-4">
                      <ExternalLink className="h-8 w-8 text-starbucks-dark" />
                    </div>
                    <h3 className="text-xl font-bold text-starbucks-dark mb-2">Panel de Administración</h3>
                    <p className="text-gray-600 text-sm mb-4">Accede al panel de control y reportes.</p>
                    <Button variant="outline" className="mt-auto font-bold border-starbucks-green text-starbucks-green hover:bg-starbucks-green hover:text-white">
                      Ir al Panel <UserCog className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </a>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
