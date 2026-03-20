import React, { useState, useMemo } from 'react';
import {
    MessageCircle, FileText, ChevronRight,
    UserPlus, User, Phone, Mail,
    CheckCircle2, AlertCircle, MapPin
} from 'lucide-react';
import { useClients, calculateClientDebt, calculateClientStatus } from '../logic/ClientContext';
import { SERVER_URL } from '../logic/useClients';
import { parseLocalDate, isOverdue } from '../utils/dates';
import type { Client, Invoice } from '../logic/ClientContext';
import { ClientMasterProfile } from '../components/ClientMasterProfile';
const STATUS_CONFIG = {
    'en mora': { label: 'En Mora', pill: 'pill-overdue', row: 'bg-rose-50/40 dark:bg-rose-950/10' },
    'pendiente': { label: 'Pendiente', pill: 'pill-warning', row: 'bg-amber-50/40 dark:bg-amber-950/10' },
    'pagado': { label: 'Al Día', pill: 'pill-active', row: '' },
};

function formatCurrency(v: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}
function formatDate(d: string) {
    return parseLocalDate(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

import { CalendarioCreditos } from '../components/CalendarioCreditos';
import type { FichaCalendarioDato } from '../components/CalendarioCreditos';
import { useBCV } from '../hooks/BCVContext';

function Avatar({ name }: { name: string }) {
    const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const colors = ['from-violet-500 to-purple-700', 'from-blue-500 to-indigo-700', 'from-emerald-500 to-teal-700', 'from-amber-500 to-orange-600', 'from-rose-500 to-pink-700'];
    return (
        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${colors[name.charCodeAt(0) % colors.length]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm`}>
            {initials}
        </div>
    );
}

// ─── Add-Client Modal ─────────────────────────────────────
interface NewClientForm {
    type: 'person' | 'company';
    name: string;
    alias?: string;
    rifPrefix: string;
    rifNumber: string;
    phone: string;
    email: string;
    address: string;
}
const BLANK: NewClientForm = { type: 'person', name: '', alias: '', rifPrefix: 'V', rifNumber: '', phone: '+58 ', email: '', address: '' };

function AddClientModal({ onClose, onSave }: { onClose: () => void; onSave: (c: NewClientForm) => void }) {
    const [form, setForm] = useState<NewClientForm>({ ...BLANK });
    const [errors, setErrors] = useState<Partial<NewClientForm>>({});
    const [saved, setSaved] = useState(false);
    const [showPrefixDropdown, setShowPrefixDropdown] = useState(false);

    const set = (k: keyof NewClientForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [k]: e.target.value }));

    const handleTypeSwitch = (type: 'person' | 'company') => {
        setForm(_f => ({
            ...BLANK,
            type,
            rifPrefix: type === 'person' ? 'V' : 'J'
        }));
    };

    const handleRifNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/[^0-9-]/g, '');
        setForm(f => ({ ...f, rifNumber: val }));
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const titleCased = val.split(' ').map(w => w ? w.charAt(0).toUpperCase() + (form.type === 'person' ? w.slice(1).toLowerCase() : w.slice(1)) : '').join(' ');
        setForm(f => ({ ...f, name: titleCased }));
    };

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value;
        // Solo permitir '+', números, espacios y guiones
        val = val.replace(/(?!^\+)[^\d\s-]/g, '');
        setForm(f => ({ ...f, phone: val }));
    };

    const validate = () => {
        const e: Partial<NewClientForm> = {};

        // RIF Validation
        const rifVal = `${form.rifPrefix}-${form.rifNumber.trim()}`;
        if (!form.rifNumber.trim()) e.rifNumber = 'El número es obligatorio';
        else if (form.type === 'person' && !/^[VE]-[0-9]{7,9}$/.test(rifVal)) {
            e.rifNumber = 'Formato inválido. Use 12345678';
        } else if (form.type === 'company' && !/^[JG]-[0-9]{8,9}-?[0-9]?$/.test(rifVal)) {
            e.rifNumber = 'Formato inválido. Use 12345678-9';
        }

        // Name Validation
        const nameVal = form.name.trim();
        if (!nameVal) {
            e.name = form.type === 'person' ? '1 Nombre y 1 Apellido requeridos' : 'Razón social requerida';
        } else if (form.type === 'person' && nameVal.split(' ').length < 2) {
            e.name = 'Debe incluir al menos 1 nombre y 1 apellido';
        }

        // Phone Validation (+58 414 1234567 or similar)
        const phoneVal = form.phone.trim();
        if (!phoneVal || phoneVal === '+58' || phoneVal === '+') e.phone = 'Teléfono obligatorio';
        else if (phoneVal.replace(/\D/g, '').length < 10) {
            e.phone = 'Mínimo 10 dígitos. Ej: +58 414 1234567';
        }

        // Email Validation
        if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
            e.email = 'Formato de correo inválido';
        }

        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSave = () => {
        if (!validate()) return;
        setSaved(true);
        setTimeout(() => {
            onSave(form);
            onClose();
        }, 900);
    };

    const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-300" onClick={handleBackdrop}>
            <div className="bg-card/95 backdrop-blur-xl border-0 sm:border border-white/20 dark:border-white/5 rounded-none sm:rounded-[24px] shadow-2xl shadow-black/10 dark:shadow-black/40 w-full h-[100dvh] sm:h-auto sm:max-w-lg mx-0 sm:mx-4 animate-in zoom-in-95 slide-in-from-bottom-8 duration-300 ease-out flex flex-col max-h-[100dvh] sm:max-h-[90vh]">

                <div className="flex justify-between items-center px-8 py-6 border-b border-border/40 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#635BFF]/20 to-[#635BFF]/5 flex items-center justify-center border border-[#635BFF]/10">
                            <UserPlus className="w-6 h-6 text-[#635BFF]" />
                        </div>
                        <div>
                            <h3 className="font-bold text-foreground text-lg sm:text-xl tracking-tight">Módulo de Clientes</h3>
                            <p className="text-xs sm:text-[11px] text-muted-foreground font-semibold uppercase tracking-widest mt-0.5">Alta en Base de Datos</p>
                        </div>
                    </div>
                </div>

                <div className="p-8 space-y-7 overflow-y-auto scrollbar-thin">
                    {/* Toggle Type */}
                    <div className="flex p-1 bg-muted/50 rounded-[14px] border border-border/40">
                        <button onClick={() => handleTypeSwitch('person')} className={`flex-1 py-3 sm:py-2 text-[14px] sm:text-[13px] font-bold rounded-xl transition-all duration-200 ${form.type === 'person' ? 'bg-card shadow-sm text-foreground ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground/80'}`}>
                            Persona Física (V, E)
                        </button>
                        <button onClick={() => handleTypeSwitch('company')} className={`flex-1 py-3 sm:py-2 text-[14px] sm:text-[13px] font-bold rounded-xl transition-all duration-200 ${form.type === 'company' ? 'bg-card shadow-sm text-foreground ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground/80'}`}>
                            Persona Jurídica (J, G)
                        </button>
                    </div>

                    {/* RIF */}
                    <Field label="Documento de Identidad (RIF/Cédula)" required icon={FileText} error={errors.rifNumber}>
                        <div className={`flex w-full h-11 rounded-xl border bg-background/50 focus-within:bg-background focus-within:ring-4 focus-within:ring-[#635BFF]/10 focus-within:border-[#635BFF]/50 transition-all duration-300 overflow-visible relative shadow-sm ${errors.rifNumber ? 'border-rose-400 focus-within:ring-rose-400/10 focus-within:border-rose-400' : 'border-border/60 hover:border-border'}`}>
                            {/* Custom Dropdown Trigger */}
                            <button
                                type="button"
                                onClick={() => setShowPrefixDropdown(!showPrefixDropdown)}
                                onBlur={() => setTimeout(() => setShowPrefixDropdown(false), 150)}
                                className="flex items-center justify-between h-full px-4 text-sm font-bold bg-muted/30 hover:bg-muted/60 transition-colors border-r border-border/60 text-foreground focus:outline-none min-w-[76px] rounded-l-xl select-none"
                            >
                                <span>{form.rifPrefix}-</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-muted-foreground transition-transform duration-200 ease-in-out ${showPrefixDropdown ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
                            </button>

                            {/* Custom Dropdown Menu */}
                            {showPrefixDropdown && (
                                <div className="absolute top-[calc(100%+8px)] left-0 w-[90px] bg-card/95 backdrop-blur-xl border border-border/60 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-200">
                                    {(form.type === 'person' ? ['V', 'E'] : ['J', 'G']).map(prefix => (
                                        <button
                                            key={prefix}
                                            type="button"
                                            onMouseDown={(e) => {
                                                e.preventDefault(); // prevent blur so click registers
                                                setForm(f => ({ ...f, rifPrefix: prefix }));
                                                setShowPrefixDropdown(false);
                                            }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-bold transition-all duration-150 flex items-center justify-between group outline-none ${form.rifPrefix === prefix ? 'bg-[#635BFF]/10 text-[#635BFF]' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                                        >
                                            {prefix}-
                                            {form.rifPrefix === prefix && <div className="w-1.5 h-1.5 rounded-full bg-[#635BFF] shadow-[0_0_8px_rgba(99,91,255,0.6)]"></div>}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <input
                                type="text"
                                placeholder={form.type === 'person' ? "12345678" : "12345678-9"}
                                value={form.rifNumber}
                                onChange={handleRifNumberChange}
                                className={`flex-1 h-full px-4 text-sm font-medium placeholder:text-muted-foreground/50 focus:outline-none bg-transparent rounded-r-xl ${errors.rifNumber ? 'bg-rose-50/30' : ''}`}
                            />
                        </div>
                    </Field>

                    {/* Name & Alias */}
                    {form.type === 'person' ? (
                        <div className="grid grid-cols-[2fr_1fr] gap-5">
                            <Field label="Nombre Completo" required icon={User} error={errors.name}>
                                <input
                                    type="text"
                                    placeholder="Ej: Juan Pérez"
                                    value={form.name}
                                    onChange={handleNameChange}
                                    className={inputCls(!!errors.name)}
                                />
                            </Field>
                            <Field label="Apodo / Alias" icon={User}>
                                <input
                                    type="text"
                                    placeholder="Ej: El Pollo"
                                    value={form.alias || ''}
                                    onChange={set('alias')}
                                    className={inputCls(false)}
                                />
                            </Field>
                        </div>
                    ) : (
                        <Field label="Razón Social Compañía" required icon={User} error={errors.name}>
                            <input
                                type="text"
                                placeholder="Ej: Comercializadora El Sol C.A."
                                value={form.name}
                                onChange={handleNameChange}
                                className={inputCls(!!errors.name)}
                            />
                        </Field>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {/* Phone */}
                        <Field label="Teléfono (Móvil/Fijo)" required icon={Phone} error={errors.phone}>
                            <input
                                type="tel"
                                placeholder="+58 414 123456"
                                value={form.phone}
                                onChange={handlePhoneChange}
                                className={inputCls(!!errors.phone)}
                            />
                        </Field>

                        {/* Email */}
                        <Field label="Correo (Opcional)" icon={Mail} error={errors.email}>
                            <input
                                type="email"
                                placeholder="correo@emp.com"
                                value={form.email}
                                onChange={set('email')}
                                className={inputCls(!!errors.email)}
                            />
                        </Field>
                    </div>

                    {/* Address */}
                    <Field label="Dirección de Facturación" icon={MapPin}>
                        <textarea
                            rows={2}
                            placeholder="Avenida principal, Edificio, Ciudad..."
                            value={form.address}
                            onChange={set('address')}
                            className={`w-full px-4 py-3 rounded-xl border border-border/60 bg-background/50 text-sm font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:bg-background focus:ring-4 focus:ring-[#635BFF]/10 focus:border-[#635BFF]/50 transition-all duration-300 resize-none hover:border-border shadow-sm`}
                        />
                    </Field>
                </div>

                <div className="flex gap-4 px-8 pb-8 shrink-0 mt-2 bg-transparent">
                    <button
                        onClick={onClose}
                        className="flex-1 min-h-[44px] sm:h-12 rounded-xl text-sm font-bold text-muted-foreground bg-transparent hover:bg-muted/60 hover:text-foreground transition-all duration-200 border border-transparent hover:border-border/50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className={`flex-[2] min-h-[44px] sm:h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-300 shadow-lg group relative overflow-hidden ${saved ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-gradient-to-r from-[#635BFF] to-[#0A2540] text-white hover:from-[#7C74FF] hover:to-[#1a3a5c] shadow-[#635BFF]/25 hover:shadow-[#635BFF]/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]'}`}
                    >
                        {saved ? (
                            <><CheckCircle2 className="w-4 h-4 animate-in zoom-in" /> Registrado en BD</>
                        ) : (
                            <>
                                <UserPlus className="w-4 h-4 transition-transform group-hover:scale-110" />
                                Inscribir Cliente
                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out z-0 pointer-events-none mix-blend-overlay rounded-xl"></div>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

function inputCls(hasError: boolean) {
    return `w-full h-11 px-4 rounded-xl border border-border/60 bg-background/50 text-sm font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:bg-background focus:ring-4 focus:ring-[#635BFF]/10 focus:border-[#635BFF]/50 transition-all duration-300 hover:border-border shadow-sm ${hasError ? 'border-rose-400 focus:ring-rose-400/10 focus:border-rose-400 bg-rose-50/30' : ''}`;
}

function Field({ label, required, icon: Icon, error, children }: {
    label: string; required?: boolean; icon: React.ElementType; error?: string; children: React.ReactNode
}) {
    return (
        <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                {label}
                {required && <span className="text-rose-500">*</span>}
            </label>
            {children}
            {error && (
                <p className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                    <AlertCircle className="w-3 h-3" /> {error}
                </p>
            )}
        </div>
    );
}

// ─── Skeleton Row ─────────────────────────────────────────
function SkeletonRow() {
    return (
        <tr className="animate-pulse border-b border-border/40 border-l-4 border-l-muted">
            <td className="px-5 py-4">
                <div className="h-6 w-16 bg-muted rounded-full" />
            </td>
            <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted shrink-0" />
                    <div className="space-y-1.5">
                        <div className="h-3.5 w-36 bg-muted rounded" />
                        <div className="h-2.5 w-24 bg-muted/70 rounded" />
                    </div>
                </div>
            </td>
            <td className="px-5 py-4 hidden md:table-cell">
                <div className="h-3 w-14 bg-muted rounded" />
            </td>
            <td className="px-5 py-4 text-right">
                <div className="h-3.5 w-16 bg-muted rounded ml-auto" />
            </td>
            <td className="px-5 py-4 hidden lg:table-cell">
                <div className="h-3 w-20 bg-muted rounded" />
            </td>
            <td className="px-5 py-4">
                <div className="flex items-center justify-end gap-2">
                    <div className="h-8 w-20 bg-muted rounded-lg hidden sm:block" />
                    <div className="w-8 h-8 bg-muted rounded-lg" />
                </div>
            </td>
        </tr>
    );
}

// ─── Main ClientList ──────────────────────────────────────
export function ClientList({ onViewChange, searchTerm = '' }: { onViewChange?: (view: any) => void; searchTerm?: string }) {
    const { clients, isLoading, addClient } = useClients();
    const [showModal, setShowModal] = useState(false);
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<'all' | 'pagado' | 'pendiente' | 'en mora'>('all');
    const { rate: tasaBCV } = useBCV();

    interface RateConfirmData {
        client: Client;
        deudaBCV: number;
        deudaParalela: number;
        activeInvoices: Invoice[];
        relevantPayments: any[];
    }
    const [rateConfirmData, setRateConfirmData] = useState<RateConfirmData | null>(null);
    
    // Always derive the actual selected client from the freshest `clients` array
    const selectedClient = useMemo(() => {
        if (!selectedClientId) return null;
        return clients.find(c => c.id === selectedClientId) || null;
    }, [clients, selectedClientId]);

    const activeClients = (filterStatus === 'all'
        ? clients
        : clients.filter(c => calculateClientStatus(c) === filterStatus)
    ).filter(c => {
        if (!searchTerm) return true;
        const lower = searchTerm.toLowerCase();
        return c.name.toLowerCase().includes(lower) || 
               c.rif.toLowerCase().includes(lower) || 
               (c.phone && c.phone.includes(searchTerm));
    });

    // Construcción de la data plana de Fichas para el Calendario
    const mappedFichas = useMemo<FichaCalendarioDato[]>(() => {
        return clients.flatMap(client => {
            return (client.invoices || []).map((inv: Invoice) => {
                const totalOriginal = inv.original || inv.balance;
                const balance = inv.balance;
                const pagado = totalOriginal - balance;

                let estado: 'mora' | 'pendiente' | 'parcial' | 'pagado' = 'pagado';
                const isPagin = balance <= 0;
                
                const isMora = !isPagin && isOverdue(inv.dueDate);
                const isParcial = !isPagin && !isMora && pagado > 0;
                
                if (isMora) estado = 'mora';
                else if (isParcial) estado = 'parcial';
                else if (isPagin) estado = 'pagado';
                else if (inv.status === 'pagado' || inv.status === 'pendiente') estado = 'pendiente';

                const isoDate = inv.dueDate; // Ya es YYYY-MM-DD
                return {
                    id: inv.id,
                    valeryNoteId: inv.valeryNoteId,
                    clienteId: client.id,
                    clienteNombre: client.name,
                    emision: isoDate,
                    vencimiento: isoDate,
                    estado,
                    original: totalOriginal,
                    pagado
                };
            });
        });
    }, [clients]);

    const surchargePercent = (() => {
        const s = localStorage.getItem('beirutSurchargePercent');
        return s !== null && s !== '' ? parseFloat(s) : 30;
    })();

    const handleRegistrarPago = (_fichaId: string, clienteId: string) => {
        // En una refactorización ideal pasaríamos estos IDs hasta el Modal
        // Por ahora redirigimos abriendo la ficha mestra que permite registrar el pago.
        setSelectedClientId(clienteId);
    };

    const handleVerHistorial = (_fichaId: string, _clienteId: string) => {
        if (onViewChange) onViewChange('historial');
    };

    const normalizePhone = (phone: string) => {
        let cleaned = phone.replace(/\D/g, '');
        // Si empieza con 04 (Venezuela local), cambiar 0 por 58
        if (cleaned.startsWith('04')) {
            cleaned = '58' + cleaned.slice(1);
        }
        return cleaned;
    };

    const openWhatsApp = async (client: Client) => {
        if (!client.phone || client.phone.trim() === '' || client.phone === '—') {
            alert(`El cliente ${client.name} no tiene un numero de WhatsApp registrado.`);
            return;
        }

        const activeInvoices = (client.invoices || []).filter((i: Invoice) => i.status === 'pendiente' || i.status === 'en mora');
        
        if (activeInvoices.length === 0) {
            alert("Este cliente no tiene deudas pendientes");
            return;
        }

        // Fetch payments for this client
        let allPayments: any[] = [];
        try {
            const res = await fetch(`${SERVER_URL}/clients/${client.id}/transactions`);
            if (res.ok) {
                allPayments = await res.json();
            }
        } catch (e) {
            console.error("Error fetching payments for WA", e);
        }

        const activeInvoiceIds = new Set(activeInvoices.map(inv => inv.id));
        const relevantPayments = allPayments.filter(p => activeInvoiceIds.has(p.invoiceId || p.invoice_id));

        const balanceBase = activeInvoices.reduce((acc, inv) => acc + inv.balance, 0);
        
        // BCV mode used in UI usually includes a surcharge
        const surchargeStr = localStorage.getItem('beirutSurchargePercent');
        const surchargePercent = surchargeStr !== null && surchargeStr !== '' ? parseFloat(surchargeStr) : 30;
        const factor = 1 + surchargePercent / 100;

        setRateConfirmData({
            client,
            deudaParalela: balanceBase,
            deudaBCV: balanceBase * factor,
            activeInvoices,
            relevantPayments
        });
    };

    const sendWhatsApp = (rateMode: 'bcv' | 'paralela') => {
        if (!rateConfirmData) return;
        const { client, deudaBCV, deudaParalela, activeInvoices, relevantPayments } = rateConfirmData;

        const EM = { bullet: '-' };
        const SEP = '---------------------';

        const isBcv = rateMode === 'bcv';
        const curSym = isBcv ? 'Bs. ' : '$';
        
        // mathFactor converts Original USD to Surcharged USD (if BCV)
        const mathFactor = isBcv ? (1 + surchargePercent / 100) : 1;
        // printFactor converts Original USD to the final display currency (Bs or $)
        const printFactor = isBcv ? mathFactor * tasaBCV : 1;
        
        // The final debt in display currency
        const deudaDisp = isBcv ? deudaBCV * tasaBCV : deudaParalela;

        const fmtNum = (n: number) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
        const fmtDate = (d: string) => parseLocalDate(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
        const fmtLongDate = (d: Date) => d.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' });

        const todayDate = new Date();
        const totalPaidUsd = relevantPayments.reduce((acc, p) => acc + (p.amountUsd || p.amount || 0), 0);
        // We display payments in the chosen currency at current rate
        const totalPaidDisp = isBcv ? totalPaidUsd * tasaBCV : totalPaidUsd;

        let msg = `*BEIRUT* \u00B7 Estado de Cuenta\n`;
        msg += `${SEP}\n`;
        msg += `*${client.name}*\n`;
        msg += `${fmtLongDate(todayDate)}\n`;
        if (isBcv) {
            msg += `_Tasa aplicada: ${fmtNum(tasaBCV)} Bs/USD_\n`;
        }
        msg += `${SEP}\n`;
        msg += `*FACTURAS ACTIVAS*\n\n`;

        const sortedInvoices = [...activeInvoices].sort((a, b) => parseLocalDate(a.dueDate).getTime() - parseLocalDate(b.dueDate).getTime());

        sortedInvoices.forEach(inv => {
            const statusLabel = inv.status === 'en mora' ? '_En mora_' : '_Pendiente_';
            const products = Array.isArray(inv.products) ? inv.products : [];

            const subtotalBase = products.length > 0
                ? products.reduce((s: number, p: any) => s + (Number(p.quantity) || 1) * (Number(p.price ?? p.precio ?? p.unitPrice) || 0), 0)
                : inv.totalAmount;

            const ivaUsd = Number((inv as any).iva ?? (inv as any).ivaAmount ?? 0);
            const totalUSD = subtotalBase + ivaUsd;
            const totalDisp = totalUSD * printFactor;

            msg += `*#${inv.valeryNoteId}* \u00B7 ${statusLabel}\n`;

            if (products.length > 0) {
                products.forEach((p: any) => {
                    const qty        = Number(p.quantity) || 1;
                    const priceBase  = Number(p.price ?? p.precio ?? p.unitPrice) || 0;
                    const priceDisp  = priceBase * printFactor;
                    const desc       = String(p.description ?? p.nombre ?? p.name ?? 'Producto');
                    msg += `  ${EM.bullet} ${qty}x ${desc} ........ ${curSym}${fmtNum(qty * priceDisp)}\n`;
                });
            } else {
                msg += `  ${EM.bullet} Productos varios ........ ${curSym}${fmtNum(subtotalBase * printFactor)}\n`;
            }

            if (ivaUsd > 0) {
                msg += `  ${EM.bullet} IVA (16%) ........ ${curSym}${fmtNum(ivaUsd * printFactor)}\n`;
            }

            msg += `  L Total: *${curSym}${fmtNum(totalDisp)}*\n\n`;
        });

        if (relevantPayments.length > 0) {
            msg += `${SEP}\n`;
            msg += `*PAGOS RECIBIDOS*\n`;
            relevantPayments.forEach(p => {
                const pAmountUsd = p.amountUsd || p.amount || 0;
                const pAmountDisp = isBcv ? pAmountUsd * tasaBCV : pAmountUsd;
                const pDate = p.createdAt || p.payment_date || '';
                msg += `  ${EM.bullet} ${pDate ? fmtDate(pDate.split('T')[0]) : '--'} \u00B7 ${p.paymentMethod || p.method || 'Pago'} .... ${curSym}${fmtNum(pAmountDisp)}\n`;
            });
            msg += `  L Total pagado: *${curSym}${fmtNum(totalPaidDisp)}*\n\n`;
        }

        msg += `${SEP}\n`;
        msg += `*RESUMEN*\n`;
        msg += `  Total deuda:     ${curSym}${fmtNum(deudaDisp + totalPaidDisp)}\n`;
        if (totalPaidDisp > 0) msg += `  Cancelado:       ${curSym}${fmtNum(totalPaidDisp)}\n`;
        
        if (deudaDisp > 0) {
            msg += `  *Saldo pendiente: ${curSym}${fmtNum(deudaDisp)}*\n\n`;
        } else {
            msg += `  *A su favor:     ${curSym}${fmtNum(Math.abs(deudaDisp))}*\n\n`;
        }

        if (isBcv) {
            msg += `\u26A0\uFE0F _Nota: Montos calculados en Bol\u00EDvares. Dispone de *2 d\u00EDas* para realizar el pago manteniendo esta tarifa actual._\n`;
        }

        msg += `${SEP}\n`;
        msg += `_Beirut \u00B7 Sistema de Cr\u00E9ditos_\n`;
        msg += `_Generado: ${fmtLongDate(todayDate)}_`;

        const normalized = normalizePhone(client.phone);
        window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`, '_blank');
        setRateConfirmData(null);
    };

    const handleSaveClient = (form: NewClientForm) => {
        // Compose name if an alias is provided for a natural person
        const finalName = form.type === 'person' && form.alias?.trim() ? `${form.name.trim()} (${form.alias.trim()})` : form.name.trim();

        addClient({
            name: finalName,
            rif: `${form.rifPrefix}-${form.rifNumber.trim()}`,
            phone: form.phone,
            email: form.email,
            address: form.address,
        });
    };

    return (
        <div className="flex-1 flex flex-col space-y-6 animate-fade-in min-h-full">

            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Gestión</p>
                    <h2 className="text-2xl font-bold tracking-tight">Directorio de Clientes</h2>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                    <button
                        onClick={() => setShowModal(true)}
                        className="flex items-center justify-center sm:justify-start gap-2 min-h-[44px] w-full sm:w-auto px-4 rounded-xl sm:rounded-full bg-gradient-to-r from-[#635BFF] to-[#0A2540] text-white text-sm font-bold hover:from-[#7C74FF] hover:to-[#1a3a5c] hover:shadow-electric transition-all duration-200 flex-shrink-0"
                    >
                        <UserPlus className="w-5 h-5 sm:w-4 sm:h-4" />
                        <span>Nuevo Cliente</span>
                    </button>
                </div>
            </div>

            {/* ── Stats ── */}
            <div className="flex flex-wrap gap-3">
                {[
                    { id: 'all', label: 'Total', value: clients.length, color: 'text-foreground', bg: 'bg-card', ring: 'ring-border/50' },
                    { id: 'en mora', label: 'En Mora', value: clients.filter(c => calculateClientStatus(c) === 'en mora').length, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50/30 dark:bg-rose-950/20', ring: 'ring-rose-400/50' },
                    { id: 'pendiente', label: 'Pendiente', value: clients.filter(c => calculateClientStatus(c) === 'pendiente').length, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50/30 dark:bg-amber-950/20', ring: 'ring-amber-400/50' },
                    { id: 'pagado', label: 'Al Día', value: clients.filter(c => calculateClientStatus(c) === 'pagado').length, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50/30 dark:bg-emerald-950/20', ring: 'ring-emerald-400/50' },
                ].map(s => (
                    <button
                        key={s.id}
                        onClick={() => setFilterStatus(s.id as any)}
                        className={`border rounded-xl px-4 py-2.5 flex items-center gap-2 shadow-sm transition-all focus:outline-none ${filterStatus === s.id ? `ring-2 ${s.ring} border-transparent bg-background` : `border-border hover:-translate-y-0.5 hover:shadow-md ${s.bg}`}`}
                    >
                        <span className={`text-lg font-bold ${s.color}`}>{s.value}</span>
                        <span className="text-xs font-semibold text-muted-foreground uppercase">{s.label}</span>
                    </button>
                ))}
            </div>

            {/* ── Dashboard Metrics & Upcoming ── */}
            {clients.length > 0 && filterStatus === 'all' && (
                <div className="grid grid-cols-1 w-full my-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                    <CalendarioCreditos 
                        fichas={mappedFichas}
                        clientes={clients.map(c => ({ id: c.id, name: c.name }))}
                        factorRecargo={surchargePercent}
                        onRegistrarPago={handleRegistrarPago}
                        onVerHistorial={handleVerHistorial}
                    />
                </div>
            )}

            {/* ── Desktop Table View & Mobile Cards View ── */}
            <div className="bg-transparent md:bg-card md:border md:border-border rounded-2xl shadow-none md:shadow-sm overflow-hidden flex flex-col pt-2 md:pt-0">

                {/* Mobile Cards (Visible only on < md) */}
                <div className="md:hidden flex flex-col gap-4">
                    {isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="bg-card border border-border rounded-2xl p-4 animate-pulse">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-full bg-muted shrink-0" />
                                    <div className="space-y-2 flex-1">
                                        <div className="h-4 w-32 bg-muted rounded" />
                                        <div className="h-3 w-20 bg-muted/70 rounded" />
                                    </div>
                                </div>
                                <div className="h-14 w-full bg-muted rounded-xl" />
                            </div>
                        ))
                    ) : (
                        activeClients.map((client, idx) => {
                            const status = calculateClientStatus(client);
                            const totalDebt = calculateClientDebt(client);
                            const activeInvoices = (client.invoices || []).filter((i: Invoice) => i.balance > 0);
                            const { label, pill } = STATUS_CONFIG[status];

                            return (
                                <div key={client.id} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm animate-fade-in-up" style={{ animationDelay: `${idx * 0.04}s` }}>
                                    <div className={`h-1.5 w-full ${status === 'en mora' ? 'bg-rose-400' : status === 'pagado' ? 'bg-emerald-400' : 'bg-amber-400'}`} />

                                    <div className="p-5">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <Avatar name={client.name} />
                                                <div>
                                                    <p className="font-bold text-foreground leading-tight text-base">{client.name}</p>
                                                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{client.rif}</p>
                                                </div>
                                            </div>
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wide shrink-0 ${pill}`}>{label}</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 mb-5 bg-muted/30 rounded-xl p-3">
                                            <div>
                                                <p className="text-[12px] sm:text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Notas Activas</p>
                                                <p className={`font-semibold text-base sm:text-sm ${activeInvoices.length > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{activeInvoices.length}</p>
                                            </div>
                                            <div>
                                                <p className="text-[12px] sm:text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Deuda Total</p>
                                                <p className={`font-bold font-mono text-base sm:text-sm ${status === 'en mora' ? 'text-rose-600 dark:text-rose-400' : totalDebt > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                    {totalDebt > 0 ? formatCurrency(totalDebt) : '—'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <button onClick={() => openWhatsApp(client)} className="flex items-center justify-center gap-2 min-h-[44px] w-full rounded-xl bg-[#25D366]/10 text-[#25D366] font-bold text-sm hover:bg-[#25D366] hover:text-white transition-colors">
                                                <MessageCircle className="w-5 h-5 sm:w-4 sm:h-4" /> Cobrar
                                            </button>
                                            <button onClick={() => setSelectedClientId(client.id)} className="flex items-center justify-center gap-2 min-h-[44px] w-full rounded-xl border border-[#635BFF]/30 text-[#635BFF] font-bold text-sm hover:bg-[#635BFF] hover:text-white transition-colors">
                                                Ver ficha <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Desktop Table (Hidden on < md) */}
                <div className="hidden md:block overflow-x-auto overflow-y-auto flex-1 min-h-[400px] relative scrollbar-thin">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-white dark:bg-card shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                            <tr className="border-b border-border bg-muted/40 backdrop-blur-sm">
                                {['Estado', 'Cliente', 'Notas Activas', 'Deuda', 'Vencimiento', 'Acciones'].map((h, i) => (
                                    <th key={h} className={`text-left text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-5 py-3 ${i === 3 ? 'text-right' : ''} ${i === 2 ? 'hidden md:table-cell' : ''} ${i === 4 ? 'hidden lg:table-cell' : ''} ${i === 5 ? 'text-right' : ''}`}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                            {isLoading ? (
                                // Skeleton placeholders while Supabase is fetching
                                Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
                            ) : (
                                activeClients.map((client, idx) => {
                                    const status = calculateClientStatus(client);
                                    const totalDebt = calculateClientDebt(client);
                                    const activeInvoices = (client.invoices || []).filter((i: Invoice) => i.balance > 0);
                                    const { label, pill } = STATUS_CONFIG[status];
                                    // Per-row left accent color by status
                                    const accentBorder = status === 'en mora'
                                        ? 'border-l-4 border-l-rose-400'
                                        : status === 'pagado'
                                            ? 'border-l-4 border-l-emerald-400'
                                            : 'border-l-4 border-l-amber-400';
                                    return (
                                        <tr key={client.id} className={`group hover:bg-muted/30 transition-colors duration-100 animate-fade-in-up ${accentBorder}`} style={{ animationDelay: `${idx * 0.04}s` }}>
                                            <td className="px-5 py-4">
                                                <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide ${pill}`}>{label}</span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <Avatar name={client.name} />
                                                    <div>
                                                        <p className="font-bold text-foreground leading-tight">{client.name}</p>
                                                        <div className="flex items-center gap-3 mt-0.5">
                                                            <p className="text-xs text-muted-foreground font-mono">{client.rif}</p>
                                                            {client.phone && <p className="text-xs text-muted-foreground hidden sm:block">{client.phone}</p>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 hidden md:table-cell">
                                                <div className="flex items-center gap-1.5">
                                                    <FileText className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                                                    <span className={`font-semibold text-xs ${activeInvoices.length > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                        {activeInvoices.length} {activeInvoices.length === 1 ? 'Nota' : 'Notas'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <span className={`font-bold font-mono ${status === 'en mora' ? 'text-rose-600 dark:text-rose-400' : totalDebt > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                    {totalDebt > 0 ? formatCurrency(totalDebt) : '—'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 hidden lg:table-cell">
                                                <span className={`text-xs font-medium ${activeInvoices.length > 0 && new Date(activeInvoices[0].dueDate) < new Date() && status !== 'pagado'
                                                    ? 'text-rose-500 font-bold'
                                                    : 'text-muted-foreground'
                                                    }`}>
                                                    {activeInvoices.length > 0 ? formatDate(activeInvoices[0].dueDate) : '—'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => setSelectedClientId(client.id)}
                                                        className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-[#635BFF] border border-[#635BFF]/30 rounded-lg px-3 py-1.5 hover:bg-[#635BFF] hover:text-white transition-all duration-150 group-hover:border-[#635BFF]/60"
                                                    >
                                                        Ver ficha <ChevronRight className="w-3 h-3" />
                                                    </button>
                                                    <button onClick={() => openWhatsApp(client)} title="Cobrar por WhatsApp" className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20 hover:bg-[#25D366] hover:text-white transition-all duration-150">
                                                        <MessageCircle className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>

                    {activeClients.length === 0 && (
                        <div className="py-16 text-center">
                            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                                <User className="w-6 h-6 text-muted-foreground/60" />
                            </div>
                            <p className="text-muted-foreground text-sm font-medium">
                                {clients.length === 0
                                    ? 'No hay clientes aún en el directorio.'
                                    : 'No se encontraron clientes con este estado.'}
                            </p>
                            {clients.length === 0 && (
                                <button onClick={() => setShowModal(true)} className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-[#635BFF] to-[#0A2540] shadow-md shadow-[#635BFF]/20 text-white text-sm font-bold hover:shadow-lg hover:-translate-y-0.5 transition-all">
                                    <UserPlus className="w-4 h-4" /> Registrar mi primer cliente
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {activeClients.length > 0 && (
                    <div className="px-5 py-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground bg-card md:bg-muted/20 mt-4 md:mt-0 rounded-xl md:rounded-none">
                        <span>{activeClients.length} cliente{activeClients.length !== 1 ? 's' : ''}</span>
                        <span>Deuda total: <strong className="text-foreground">{formatCurrency(activeClients.reduce((s, c) => s + calculateClientDebt(c), 0))}</strong></span>
                    </div>
                )}
            </div>

            {/* ── Additional Panels & Modals ── */}
            {showModal && (
                <AddClientModal
                    onClose={() => setShowModal(false)}
                    onSave={handleSaveClient}
                />
            )}

            <ClientMasterProfile
                client={selectedClient}
                onClose={() => setSelectedClientId(null)}
                onViewChange={onViewChange}
            />

            {/* Rate Selection Modal for WhatsApp */}
            {rateConfirmData && (
                <div style={{
                    position: 'fixed', inset: 0, 
                    backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
                }}>
                    <div style={{
                        background: '#FFF', borderRadius: 16, padding: 24, width: 320,
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)'
                    }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: '#1A1B2E', marginBottom: 16 }}>
                            ¿Qué monto enviar al cliente?
                        </p>

                        {/* BCV — monto amarillo */}
                        <button onClick={() => sendWhatsApp('bcv')}
                            style={{
                                background: '#FAEEDA', color: '#854F0B', border: '0.5px solid #BA7517',
                                borderRadius: 8, padding: '10px 14px', width: '100%', marginBottom: 8, cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left'
                            }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>Tasa BCV · ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(rateConfirmData.deudaBCV)}</div>
                            <div style={{ fontSize: 11, marginTop: 2, color: '#BA7517' }}>
                                Incluye equivalente en Bs. {new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(tasaBCV * rateConfirmData.deudaBCV)}
                            </div>
                        </button>

                        {/* Paralela — monto negro, solo USD */}
                        <button onClick={() => sendWhatsApp('paralela')}
                            style={{
                                background: '#F1EFE8', color: '#2C2C2A', border: '0.5px solid #888780',
                                borderRadius: 8, padding: '10px 14px', width: '100%', marginBottom: 12, cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left'
                            }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>Tasa Paralela · ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(rateConfirmData.deudaParalela)}</div>
                            <div style={{ fontSize: 11, marginTop: 2, color: '#5F5E5A' }}>
                                Solo muestra deuda en USD · sin Bs
                            </div>
                        </button>

                        <button onClick={() => setRateConfirmData(null)}
                            style={{
                                background: 'transparent', border: 'none', color: '#888780',
                                fontSize: 12, cursor: 'pointer', width: '100%'
                            }}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
