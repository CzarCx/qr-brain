import Head from 'next/head';

export default function PpcPage() {
  return (
    <>
      <Head>
        <title>PPC</title>
      </Head>
      <main className="text-starbucks-dark flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto bg-starbucks-white rounded-xl shadow-2xl p-6 md:p-8 space-y-6">
          <header className="text-center">
            <h1 className="text-2xl md:text-3xl font-bold text-starbucks-green">PPC</h1>
            <p className="text-gray-600 mt-1">Página de Plan de Producción y Calidad.</p>
          </header>
          {/* El contenido de la página irá aquí */}
        </div>
      </main>
    </>
  );
}
