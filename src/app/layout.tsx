import type {Metadata} from 'next';
import './globals.css';
import Navbar from '@/components/Navbar'; // Import the new Navbar component

export const metadata: Metadata = {
  title: 'Escáner de Códigos',
  description: 'Escáner de Códigos de Barra y QR',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
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
