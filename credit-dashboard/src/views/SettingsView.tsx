import { useState } from 'react';
import { ShieldAlert, Trash2, Database, Loader2, X, AlertTriangle, KeyRound, Building2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings } from '../logic/SettingsContext';
import { SERVER_URL } from '../logic/useClients';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export function SettingsView() {
    const { settings, updateSettings } = useSettings();
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusText, setStatusText] = useState('');
    const queryClient = useQueryClient();

    // Modal States
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetPassword, setResetPassword] = useState('');
    const [resetError, setResetError] = useState('');

    const [showDemoModal, setShowDemoModal] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const executeReset = async () => {
        if (resetPassword !== "AdminHrc") {
            setResetError("Contraseña incorrecta. Acceso denegado.");
            return;
        }

        setResetError('');
        setIsProcessing(true);
        setStatusText("Limpiando base de datos en Supabase...");

        try {
            if (!supabase) throw new Error("Supabase client not initialized");
            
            // Delete payments and invoices first to avoid FK constraints, then clients
            const uuidNull = '00000000-0000-0000-0000-000000000000';
            
            const { error: err1 } = await supabase.from('invoice_products').delete().neq('id', uuidNull);
            if (err1) throw new Error('Error limpiando productos: ' + err1.message);

            const { error: err2 } = await supabase.from('payments').delete().neq('id', uuidNull);
            if (err2) throw new Error('Error limpiando pagos: ' + err2.message);

            const { error: err3 } = await supabase.from('invoices').delete().neq('id', uuidNull);
            if (err3) throw new Error('Error limpiando facturas: ' + err3.message);

            const { error: err4 } = await supabase.from('clients').delete().neq('id', uuidNull);
            if (err4) throw new Error('Error limpiando clientes: ' + err4.message);

            localStorage.clear();
            queryClient.invalidateQueries();

            setShowResetModal(false);
            setSuccessMessage("Sistema restablecido con éxito a valores de fábrica.");
            setTimeout(() => window.location.reload(), 2000);
        } catch (error: any) {
            setResetError(`Error durante la limpieza: ${error.message}`);
            setIsProcessing(false);
            setStatusText("");
        }
    };

    const handleLoadDemo = async () => {
        setIsProcessing(true);
        setStatusText("Inyectando datos de prueba...");
        setShowDemoModal(false);

        try {
            if (!supabase) throw new Error("Supabase client not initialized");

            const demoClients = [
                { name: "La Gran Distribuidora C.A.", rif: "J-30123456-7" },
                { name: "Inversiones Mar Azul", rif: "J-40555666-8" },
                { name: "Bodegón Caracas Express", rif: "J-50111222-3" },
                { name: "Suministros del Norte", rif: "J-29888777-1" },
                { name: "Farmacia San José", rif: "J-31444555-9" }
            ];

            const amounts = [1500, 850, 450, 120, 340];
            const states = ['en mora', 'en mora', 'pendiente', 'pagado', 'pagado'];
            const jan2026 = "2026-01-15";
            const feb2026 = "2026-02-10";

            for (let i = 0; i < demoClients.length; i++) {
                // Insert Client
                const { data: clientData, error: clientErr } = await supabase.from('clients').insert({
                    name: demoClients[i].name,
                    rif: demoClients[i].rif,
                    phone: '+584140000000',
                    email: 'demo@empresa.com',
                    is_active: true
                }).select('id').single();
                
                if (clientErr) throw clientErr;
                const cid = clientData.id;

                // Insert Invoice
                const { data: invData, error: invErr } = await supabase.from('invoices').insert({
                    client_id: cid,
                    valery_note_id: `NE-DEMO-${i}`,
                    issue_date: jan2026,
                    due_date: feb2026,
                    total_amount: amounts[i],
                    balance: states[i] === 'pagado' ? 0 : amounts[i],
                    status: states[i]
                }).select('id').single();

                if (invErr) throw invErr;
                const invId = invData.id;

                // Insert Product
                const { error: prodErr } = await supabase.from('invoice_products').insert({
                    invoice_id: invId,
                    description: `Producto Demo ${i}`,
                    quantity: 1,
                    unit_price: amounts[i]
                });

                if (prodErr) throw prodErr;
            }

            queryClient.invalidateQueries();
            setSuccessMessage("Modo Demo cargado exitosamente. Se inyectaron 5 clientes ficticios interactivos.");
            setTimeout(() => setSuccessMessage(''), 4000);
        } catch (error: any) {
            alert(`Error generando demo: ${error.message}`);
        } finally {
            setIsProcessing(false);
            setStatusText("");
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in p-6 relative">
            <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Panel de Control</p>
                <h2 className="text-2xl font-bold tracking-tight">Configuración Maestra (Cloud)</h2>
            </div>

            <div className="bg-white dark:bg-card border border-border rounded-2xl p-6 md:p-8 shadow-sm">

                <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                        <ShieldAlert className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-foreground">Gestión Global en Supabase</h3>
                        <p className="text-sm text-muted-foreground font-medium">Acciones irreversibles y configuración central.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                    {/* Botón Configuración de la Empresa */}
                    <div className="bg-slate-50/40 dark:bg-slate-900/20 border-2 border-slate-100 dark:border-slate-800 rounded-2xl p-6 hover:shadow-lg hover:shadow-slate-500/5 transition-all group col-span-1 md:col-span-2">
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-card flex items-center justify-center text-slate-600 dark:text-slate-400 shadow-sm border border-slate-200 dark:border-slate-700">
                                <Building2 className="w-6 h-6 group-hover:scale-110 transition-transform" />
                            </div>
                        </div>
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-2 text-lg">Personalización de la Empresa</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                            Cambia el nombre de la empresa y otros detalles que se muestran globalmente en la interfaz del sistema.
                        </p>
                        <div className="max-w-md">
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                                Nombre de la Empresa
                            </label>
                            <input 
                                type="text"
                                value={settings.companyName}
                                onChange={(e) => updateSettings({ companyName: e.target.value })}
                                placeholder="Ej: Beirut"
                                className="w-full h-11 px-4 rounded-xl bg-white dark:bg-card border-2 border-slate-200 dark:border-slate-700 focus:border-[#635BFF] focus:ring-4 focus:ring-[#635BFF]/10 outline-none transition-all text-sm font-bold text-foreground"
                            />
                        </div>
                    </div>

                    {/* Botón Reinicio de Fábrica */}
                    <div className="bg-rose-50/40 dark:bg-rose-950/20 border-2 border-rose-100 dark:border-rose-900/50 rounded-2xl p-6 hover:shadow-lg hover:shadow-rose-500/10 transition-all group flex flex-col h-full">
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-card flex items-center justify-center text-rose-500 shadow-sm border border-rose-100 dark:border-rose-800">
                                <Trash2 className="w-6 h-6 group-hover:scale-110 transition-transform" />
                            </div>
                        </div>
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-2 text-lg">Reinicio de Fábrica</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed flex-1">
                            Borra permanentemente todos los datos de la nube. Prepara el sistema en blanco para una instalación nueva.
                        </p>
                        <button
                            disabled={isProcessing}
                            onClick={() => { setResetPassword(''); setResetError(''); setShowResetModal(true); }}
                            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-rose-500 hover:bg-rose-600 outline-none text-white rounded-xl font-bold text-sm shadow-[0_4px_14px_0_rgba(225,29,72,0.39)] hover:shadow-[0_6px_20px_rgba(225,29,72,0.23)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Limpieza Total
                        </button>
                    </div>

                    {/* Botón Modo Demo */}
                    <div className="bg-blue-50/40 dark:bg-blue-950/20 border-2 border-blue-100 dark:border-blue-900/50 rounded-2xl p-6 hover:shadow-lg hover:shadow-blue-500/10 transition-all group flex flex-col h-full">
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-card flex items-center justify-center text-blue-500 shadow-sm border border-blue-100 dark:border-blue-800">
                                <Database className="w-6 h-6 group-hover:scale-110 transition-transform" />
                            </div>
                        </div>
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-2 text-lg">Modo Demo</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed flex-1">
                            Genera 5 clientes en la nube con facturas ficticias para realizar pruebas visuales del panel.
                        </p>
                        <button
                            disabled={isProcessing}
                            onClick={() => setShowDemoModal(true)}
                            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#635BFF] hover:bg-[#524ae3] outline-none text-white rounded-xl font-bold text-sm shadow-[0_4px_14px_0_rgba(99,91,255,0.39)] hover:shadow-[0_6px_20px_rgba(99,91,255,0.23)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Cargar Datos Demo
                        </button>
                    </div>
                </div>

                {isProcessing && (
                    <div className="mt-8 flex flex-col items-center justify-center gap-3 animate-fade-in">
                        <Loader2 className="w-8 h-8 animate-spin text-[#635BFF]" />
                        <p className="text-sm font-bold text-slate-600 dark:text-slate-300 animate-pulse">{statusText}</p>
                    </div>
                )}
            </div>

            {/* Custom Modern Sucess Toast embedded intentionally for Settings */}
            {successMessage && !isProcessing && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-bounce-in">
                    <div className="bg-emerald-500 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-emerald-500/20 flex items-center gap-2 border border-emerald-400">
                        <Database className="w-4 h-4" />
                        {successMessage}
                    </div>
                </div>
            )}

            {/* MODAL: RESET DE FÁBRICA */}
            {showResetModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget && !isProcessing) setShowResetModal(false); }}>
                    <div className="relative w-full max-w-md bg-card rounded-[20px] shadow-2xl overflow-hidden animate-scale-in border border-border">
                        <div className="px-6 pt-8 pb-6 flex flex-col items-center text-center">
                            <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-950/50 flex flex-col items-center justify-center text-rose-600 mb-4 shadow-inner ring-4 ring-rose-50 dark:ring-rose-950">
                                <AlertTriangle className="w-8 h-8" />
                            </div>
                            <h2 className="text-xl font-black text-rose-600 dark:text-rose-500 tracking-tight mb-2">
                                ¿Reiniciar Sistema de Fábrica?
                            </h2>
                            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                                Esta acción <strong className="text-foreground">eliminará permanentemente</strong> todos los datos de Supabase. Esta operación no se puede deshacer.
                            </p>

                            <div className="w-full text-left bg-muted/30 rounded-xl p-4 border border-border/50">
                                <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                                    <KeyRound className="w-3.5 h-3.5" /> Clave de Autorización Admin
                                </label>
                                <input
                                    type="password"
                                    placeholder="Introduce la contraseña"
                                    value={resetPassword}
                                    onChange={(e) => setResetPassword(e.target.value)}
                                    // Submit on enter
                                    onKeyDown={(e) => { if (e.key === 'Enter') executeReset(); }}
                                    className="w-full h-11 px-4 rounded-lg bg-background border border-border focus:border-[#635BFF] focus:ring-2 focus:ring-[#635BFF]/20 outline-none transition-all text-sm font-medium"
                                />
                                {resetError && (
                                    <p className="text-rose-500 text-xs font-bold mt-2 animate-pulse">{resetError}</p>
                                )}
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-muted/40 border-t border-border flex gap-3">
                            <button
                                onClick={() => setShowResetModal(false)}
                                disabled={isProcessing}
                                className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-background border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={executeReset}
                                disabled={isProcessing || !resetPassword}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm bg-rose-600 text-white hover:bg-rose-700 shadow-[0_4px_14px_0_rgba(225,29,72,0.39)] transition-colors disabled:opacity-50"
                            >
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Sí, Borrar Todo
                            </button>
                        </div>
                        <button onClick={() => setShowResetModal(false)} className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL: CARGAR DEMO */}
            {showDemoModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget && !isProcessing) setShowDemoModal(false); }}>
                    <div className="relative w-full max-w-sm bg-card rounded-[20px] shadow-2xl overflow-hidden animate-scale-in border border-border">
                        <div className="px-6 pt-8 pb-6 flex flex-col items-center text-center">
                            <div className="w-16 h-16 rounded-full bg-[#635BFF]/10 flex flex-col items-center justify-center text-[#635BFF] mb-4 shadow-inner ring-4 ring-[#635BFF]/5">
                                <Database className="w-8 h-8" />
                            </div>
                            <h2 className="text-xl font-black text-foreground tracking-tight mb-2">
                                Inyectar Modo Demo (Sistema Local y Nube)
                            </h2>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Se generarán <strong className="text-foreground">5 clientes ficticios</strong> con historial cruzado en Supabase. ¿Deseas continuar?
                            </p>
                        </div>

                        <div className="px-6 py-4 bg-muted/40 border-t border-border flex gap-3">
                            <button
                                onClick={() => setShowDemoModal(false)}
                                disabled={isProcessing}
                                className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-background border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleLoadDemo}
                                disabled={isProcessing}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm bg-[#635BFF] text-white hover:bg-[#524ae3] shadow-[0_4px_14px_0_rgba(99,91,255,0.39)] transition-colors disabled:opacity-50"
                            >
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Sí, Cargar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
