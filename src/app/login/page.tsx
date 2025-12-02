'use client';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseDB2 } from '@/lib/supabaseClient';


export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabaseDB2.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.push('/');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <div className="flex justify-center items-center min-h-screen bg-starbucks-light-gray">
        <div className="w-full max-w-md p-8 space-y-8 bg-starbucks-white rounded-xl shadow-2xl">
            <header className="text-center">
                <h1 className="text-2xl md:text-3xl font-bold text-starbucks-green">Iniciar Sesión</h1>
                <p className="text-gray-600 mt-1">Accede a tu cuenta para continuar.</p>
            </header>
            <Auth
                supabaseClient={supabaseDB2}
                appearance={{ theme: ThemeSupa }}
                theme="default"
                providers={['google']}
                localization={{
                    variables: {
                      sign_in: {
                        email_label: 'Correo electrónico',
                        password_label: 'Contraseña',
                        button_label: 'Iniciar sesión',
                        social_provider_text: 'Iniciar con {{provider}}',
                        link_text: '¿Ya tienes una cuenta? Inicia sesión',
                      },
                      sign_up: {
                        email_label: 'Correo electrónico',
                        password_label: 'Contraseña',
                        button_label: 'Registrarse',
                        social_provider_text: 'Registrarse con {{provider}}',
                        link_text: '¿No tienes una cuenta? Regístrate',
                      }
                    },
                  }}
            />
        </div>
    </div>
  );
}
