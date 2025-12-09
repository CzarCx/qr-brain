
'use client';
import type {Metadata} from 'next';
import './globals.css';
import Navbar from '@/components/Navbar'; // Import the new Navbar component
import { useEffect } from 'react';

// export const metadata: Metadata = {
//   title: 'Escáner de Códigos',
//   description: 'Escáner de Códigos de Barra y QR',
// };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  
  useEffect(() => {
    // This is a workaround for the "Cannot transition to a new state" error.
    // If the Next.js error overlay appears, reload the page.
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'id') {
          const htmlElement = document.documentElement;
          if (htmlElement.id === '__next_error__') {
            console.warn("Next.js error overlay detected. Reloading page...");
            window.location.reload();
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['id'],
    });

    // Cleanup observer on component unmount
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <html lang="es">
      <head>
        <title>Escáner de Códigos</title>
        <meta name="description" content="Escáner de Códigos de Barra y QR" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-starbucks-light-gray">
        <Navbar />
        <main className="pt-16">
            {children}
        </main>
      </body>
    </html>
  );
}
