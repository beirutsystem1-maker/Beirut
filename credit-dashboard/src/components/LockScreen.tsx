import { useState } from 'react';
import type { FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { useSettings } from '../logic/SettingsContext';

interface LockScreenProps {
    onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
    const [code, setCode] = useState('');
    const [error, setError] = useState(false);
    const { settings } = useSettings();

    // Shared generic security code for the app
    const SECURITY_CODE = 'AdminHr';

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (code === SECURITY_CODE) {
            setError(false);
            onUnlock();
        } else {
            setError(true);
            setCode('');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 dark:bg-gray-900 transition-colors duration-200">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="mx-auto h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <Lock className="h-6 w-6 text-primary" />
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
                    {settings.companyName} Control
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
                    Ingrese el código de seguridad para acceder al sistema
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <div>
                            <label htmlFor="code" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Código de Acceso
                            </label>
                            <div className="mt-1">
                                <input
                                    id="code"
                                    name="code"
                                    type="password"
                                    required
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    placeholder="••••••••"
                                    className={`block w-full px-3 py-2 border rounded-md shadow-sm sm:text-sm focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white ${error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'}`}
                                    autoFocus
                                />
                            </div>
                            {error && (
                                <p className="mt-2 text-sm text-red-600 dark:text-red-400 font-medium">
                                    Código incorrecto. Intente nuevamente.
                                </p>
                            )}
                        </div>

                        <div>
                            <button
                                type="submit"
                                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                            >
                                Desbloquear Sistema
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
