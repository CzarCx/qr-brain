import Head from 'next/head';

export default function ImpresionesBarraPage() {
  return (
    <>
      <Head>
        <title>Impresiones Barra</title>
      </Head>
       <main className="text-starbucks-dark flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto bg-starbucks-white rounded-xl shadow-2xl p-6 md:p-8 space-y-6">
          <header className="text-center">
            <h1 className="text-2xl md:text-3xl font-bold text-starbucks-green">Impresiones Barra</h1>
            <p className="text-gray-600 mt-1">Página para impresiones de barra.</p>
          </header>
          {/* El contenido de la página irá aquí */}
        </div>
      </main>
    </>
  );
}
