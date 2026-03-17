import { useState, useEffect } from 'react';
import { X, Search, CheckCircle2, AlertTriangle, User, DollarSign } from 'lucide-react';
import { useClientSearch } from '../logic/useClients';
import { useClients } from '../logic/ClientContext';
import { supabase } from '../lib/supabase';
import { CustomDatePicker } from './CustomDatePicker';
import { toLocalDateString } from '../utils/dates';

/**
 * Normalizes any date string to YYYY-MM-DD (ISO) for Supabase.
 * Handles DD/MM/YYYY, DD-MM-YYYY, and already-correct YYYY-MM-DD formats.
 */
function normalizeToISO(dateStr: string): string {
    if (!dateStr) return '';
    // Already in YYYY-MM-DD format
    if (/^\d{4}[-]\d{2}[-]\d{2}$/.test(dateStr)) return dateStr;
    // DD/MM/YYYY or DD-MM-YYYY
    const match = dateStr.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (match) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const year = match[3].length === 2 ? '20' + match[3] : match[3];
        return `${year}-${month}-${day}`;
    }
    return dateStr; // fallback: return as-is
}
interface AssignCreditModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: {
        documento: string;
        fechaEmision: string;
        totalOperacion: number;
        products?: {
            codigo: string;
            nombre: string;
            cantidad: number;
            precio: number;
        }[];
    } | null;
    onAssign: (invoiceDoc: string, clientId: string, clientName: string) => void;
}

interface ClientSearchResult {
    id: string;
    name: string;
    rif: string;
}

function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}

export function AssignCreditModal({ isOpen, onClose, invoice, onAssign }: AssignCreditModalProps) {
    const { appendExcelInvoice, refetchClients } = useClients();
    const [search, setSearch] = useState('');
    const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);
    const [dueDate, setDueDate] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const debouncedSearch = useDebounce(search, 500);

    const { data: clients = [], isLoading } = useClientSearch(debouncedSearch, isOpen);

    useEffect(() => {
        if (!isOpen) {
            setSearch('');
            setSelectedClient(null);
            setError(null);
            setIsSubmitting(false);
            setDueDate('');
        } else if (invoice) {
            setDueDate(normalizeToISO(invoice.fechaEmision) || toLocalDateString(new Date()));
        }
    }, [isOpen, invoice]);

    if (!isOpen || !invoice) return null;

    const handleAssign = async () => {
        if (!selectedClient) return;
        setIsSubmitting(true);
        setError(null);

        try {
            const { data: clientInvoices, error: checkErr } = await supabase
                .from('invoices')
                .select('valery_note_id')
                .eq('client_id', selectedClient.id);

            if (checkErr) throw checkErr;

            if (clientInvoices.some((i: any) => i.valery_note_id === invoice.documento)) {
                setError(`La nota ${invoice.documento} ya ha sido asignada previamente a un cliente.`);
                setIsSubmitting(false);
                return;
            }

            await appendExcelInvoice({
                clientId: selectedClient.id,
                docNumber: invoice.documento,
                issueDate: normalizeToISO(invoice.fechaEmision),
                dueDate: dueDate,
                totalAmount: invoice.totalOperacion,
                iva: (invoice as any).iva || 0,
                products: invoice.products || []
            });

            refetchClients(); // Explicitly force UI query invalidation to repaint debt/balances
            onAssign(invoice.documento, selectedClient.id, selectedClient.name);
        } catch (err: any) {
            if (err.message && err.message.includes('invoices_valery_note_id_key')) {
                setError(`La nota ${invoice.documento} ya ha sido asignada previamente a un cliente.`);
            } else {
                setError(err.message || 'Error al intentar asignar el crédito.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none">
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-fade-in"
                onClick={onClose}
            />

            <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
                <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-muted/30">
                    <div>
                        <h2 className="text-lg font-bold text-foreground">Asignar Crédito a Cliente</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Vincular nota <span className="font-mono font-medium text-foreground">{invoice.documento}</span>
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 md:p-8 space-y-6 overflow-y-auto">
                    <div className="flex items-center justify-between bg-[#635BFF]/5 border border-[#635BFF]/20 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#635BFF]/10 flex items-center justify-center text-[#635BFF]">
                                <DollarSign className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Gran Total a Asignar</p>
                                <p className="text-xl font-bold font-mono text-foreground leading-none">${invoice.totalOperacion.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-start gap-3 text-sm">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <p>{error}</p>
                        </div>
                    )}

                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-foreground">Buscar Cliente</label>
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Buscar por RIF o Nombre..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#635BFF]/50 transition-shadow text-sm"
                            />
                        </div>

                        {search.trim().length > 1 && !selectedClient && (
                            <div className="mt-2 border border-border rounded-xl bg-card overflow-hidden shadow-sm max-h-48 overflow-y-auto">
                                {isLoading ? (
                                    <div className="p-4 text-center text-sm text-muted-foreground">Buscando...</div>
                                ) : clients.length > 0 ? (
                                    clients.map((client: ClientSearchResult) => (
                                        <button
                                            key={client.id}
                                            onClick={() => {
                                                setSelectedClient(client);
                                                setSearch('');
                                            }}
                                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left border-b border-border last:border-0"
                                        >
                                            <div>
                                                <p className="font-semibold text-foreground text-sm">{client.name}</p>
                                                <p className="text-xs text-muted-foreground font-mono mt-0.5">{client.rif}</p>
                                            </div>
                                            <div className="w-6 h-6 rounded-full border border-border flex items-center justify-center">
                                                <div className="w-2.5 h-2.5 rounded-full bg-transparent" />
                                            </div>
                                        </button>
                                    ))
                                ) : (
                                    <div className="p-4 text-center text-sm text-muted-foreground">No se encontraron clientes.</div>
                                )}
                            </div>
                        )}

                        {selectedClient && (
                            <div className="mt-4 space-y-4 animate-fade-in">
                                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                            <User className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-foreground text-sm">{selectedClient.name}</p>
                                            <p className="text-xs text-muted-foreground font-mono">{selectedClient.rif}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedClient(null)}
                                        className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline px-2 py-1"
                                    >
                                        Cambiar
                                    </button>
                                </div>

                                <div className="p-5 rounded-2xl border border-[#635BFF]/10 bg-[#635BFF]/[0.02] dark:bg-[#635BFF]/5 shadow-sm relative overflow-visible">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-[#635BFF]/50 rounded-l-2xl" />
                                    <div className="mb-4">
                                        <h3 className="text-sm font-bold text-foreground">Configuración de Mora</h3>
                                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                            Establece la <strong>fecha límite de pago</strong>. Si el cliente no paga para esta fecha, el sistema comenzará a calcular la mora automáticamente.
                                        </p>
                                    </div>
                                    <CustomDatePicker
                                        label="Fecha de Vencimiento"
                                        value={dueDate}
                                        onChange={setDueDate}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-border bg-muted/10 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        disabled={isSubmitting}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleAssign}
                        disabled={!selectedClient || isSubmitting}
                        className={`
                            flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all
                            ${!selectedClient || isSubmitting
                                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                                : 'bg-[#635BFF] text-white hover:bg-[#524BFF] hover:shadow-lg hover:shadow-[#635BFF]/20 active:scale-[0.98]'
                            }
                        `}
                    >
                        {isSubmitting ? 'Asignando...' : (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                Confirmar Asignación
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
