import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useClients } from '../logic/ClientContext';
import type { Invoice } from '../logic/ClientContext';
import {
    useClientTransactions,
} from '../logic/useClients';
import type { Transaction } from '../logic/useClients';
import {
    Calendar, ChevronDown, ChevronUp, Archive,
    X, FileText, Loader2, CheckCircle2,
    DollarSign, Eye
} from 'lucide-react';
import { parseLocalDate } from '../utils/dates';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FichaEntry {
    clientId: string;
    clientName: string;
    invoiceId: string;
    valeryNoteId: string;
    orig: number;       // totalAmount
    emision: string;
    vence: string;
    invoice: Invoice;
}

interface MesGroup {
    key: string;        // "2026-03"
    label: string;      // "Marzo 2026"
    fichas: FichaEntry[];
    origTotal: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}
function fmtDate(d: string) {
    if (!d) return '—';
    return parseLocalDate(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}
function getMonthKey(dateStr: string): string {
    const d = parseLocalDate(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function getMonthLabel(dateStr: string): string {
    return parseLocalDate(dateStr)
        .toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })
        .replace(/^\w/, c => c.toUpperCase());
}

// ─── VerFichaModal — Detalle de productos y pagos ─────────────────────────────

function VerFichaModal({
    ficha, onClose, clientId,
}: { ficha: FichaEntry; onClose: () => void; clientId: string; }) {
    const invoice = ficha.invoice;
    const products = invoice.products || [];

    const surchargePercent = (() => {
        const s = localStorage.getItem('beirutSurchargePercent');
        return s !== null && s !== '' ? parseFloat(s) : 30;
    })();
    const factor = 1 + surchargePercent / 100;

    // Obtener los pagos realizados
    const { data: transactions = [], isLoading: isLoadingTx } = useClientTransactions(clientId);
    const pagos = transactions.filter(
        (tx: Transaction) => tx.invoiceId === invoice.id && tx.type === 'payment'
    );

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
             onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[500px] flex flex-col overflow-hidden animate-scale-in max-h-[90vh]">
                {/* Header */}
                <div className="shrink-0 px-5 pt-4 pb-3 border-b border-gray-100 bg-emerald-50/50">
                    <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-gray-900 tracking-tight">
                                {invoice.valeryNoteId || invoice.id.split('-')[0]}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-100 text-emerald-700">
                                FINALIZADA
                            </span>
                        </div>
                        <button onClick={onClose}
                                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors tooltip text-sm">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    
                    <p className="text-sm font-bold text-gray-800">{ficha.clientName}</p>
                    <p className="text-[11px] font-medium text-gray-500 mt-1">
                        Emisión: {fmtDate(invoice.issueDate)} &nbsp;·&nbsp; Vencía: {fmtDate(invoice.dueDate)}
                    </p>
                </div>

                {/* Body (scrollable) */}
                <div className="flex-1 overflow-y-auto min-h-0 bg-gray-50/30">
                    
                    {/* Productos */}
                    <div className="px-5 py-4 border-b border-gray-100">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" /> Productos de la deuda original
                        </h4>
                        
                        <div className="bg-white border text-sm border-gray-100 rounded-xl overflow-hidden shadow-sm">
                            <div className="grid grid-cols-[minmax(120px,1fr)_40px_70px_70px] gap-2 px-3 py-2 bg-gray-50/80 border-b border-gray-100 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                <span>Producto</span>
                                <span className="text-center">Cant</span>
                                <span className="text-right">Precio</span>
                                <span className="text-right">Total</span>
                            </div>
                            
                            {products.length === 0 ? (
                                <p className="text-center py-4 text-xs text-gray-400 font-medium">No hay detalles de producto guardados.</p>
                            ) : (
                                <div className="divide-y divide-gray-50">
                                    {products.map((p: any, i: number) => {
                                        const cant = parseFloat(p.quantity) || 0;
                                        const precio = parseFloat(p.unit_price !== undefined ? p.unit_price : p.unitPrice) || 0;
                                        const subtotal = Math.round(cant * precio * 100) / 100;
                                        return (
                                            <div key={i} className="grid grid-cols-[minmax(120px,1fr)_40px_70px_70px] gap-2 px-3 py-2.5 items-center">
                                                <span className="text-[12px] font-semibold text-gray-800 truncate" title={p.description}>
                                                    {p.description}
                                                </span>
                                                <span className="text-[12px] font-bold text-gray-500 text-center">{cant}</span>
                                                <span className="text-[12px] font-bold text-indigo-400 text-right">{fmt(precio)}</span>
                                                <span className="text-[12px] font-bold text-gray-800 text-right">{fmt(subtotal)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        
                        <div className="mt-3 flex justify-between items-end bg-indigo-50/50 p-3 rounded-xl border border-indigo-100/50">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-indigo-400/80 tracking-widest mb-0.5">Monto Original Base</p>
                                <p className="font-mono text-xl font-black text-indigo-900 leading-none">{fmt(ficha.orig)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] uppercase font-bold text-amber-500/80 tracking-widest mb-0.5">Total (+{surchargePercent}%)</p>
                                <p className="font-mono text-lg font-black text-amber-600 leading-none">{fmt(ficha.orig * factor)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Pagos */}
                    <div className="px-5 py-4">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <DollarSign className="w-3.5 h-3.5" /> Pagos Registrados
                        </h4>
                        
                        {isLoadingTx ? (
                            <div className="flex items-center justify-center py-6 gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
                                <span className="text-xs text-gray-400">Cargando pagos...</span>
                            </div>
                        ) : pagos.length === 0 ? (
                            <div className="text-center py-6 bg-white border border-gray-100 rounded-xl">
                                <p className="text-xs text-gray-400">La ficha se cerró sin registros de pagos parciales en sistema.</p>
                            </div>
                        ) : (
                            <div className="space-y-2.5 bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                                {pagos.map((tx: Transaction) => (
                                    <div key={tx.id} className="flex justify-between items-center group">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-bold text-gray-700">
                                                    {new Date(tx.createdAt).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    <span className="text-gray-400 font-normal ml-1">· {tx.paymentMethod || 'Efectivo/Transferencia'}</span>
                                                </p>
                                                <p className="text-[9px] font-mono text-gray-400 mt-0.5" title={tx.id}>{tx.id.slice(-8)}</p>
                                            </div>
                                        </div>
                                        <p className="font-mono font-black text-emerald-600 text-sm">+{fmt(tx.amountUsd)}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─── FichaCard ────────────────────────────────────────────────────────────────

function FichaCard({
    ficha, showClientName, onVerFicha,
}: {
    ficha: FichaEntry;
    showClientName: boolean;
    onVerFicha: (f: FichaEntry) => void;
}) {
    return (
        <div style={{ background: '#fafaf8', border: '1px solid #E5E7EB', borderRadius: 12 }}>
            <div className="px-4 py-3.5">

                {/* Row 1: icon + ID + badge + client name */}
                <div className="flex items-center gap-2 mb-2.5">
                    <Archive className="w-4 h-4 shrink-0 text-emerald-500" />
                    <span className="font-mono font-bold text-sm text-gray-800 truncate">{ficha.valeryNoteId || ficha.invoiceId.split('-')[0]}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 bg-emerald-100 text-emerald-700">
                        Finalizada
                    </span>
                    {showClientName && (
                        <span className="text-[10px] text-gray-400 font-medium ml-1 truncate hidden sm:inline">{ficha.clientName}</span>
                    )}
                </div>

                {/* Row 2: dates */}
                <div className="flex items-center gap-4 mb-3 flex-wrap">
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Emisión: {fmtDate(ficha.emision)}
                    </span>
                    <span className="text-[11px] text-gray-500 flex items-center gap-1">
                        Vencía: {fmtDate(ficha.vence)}
                    </span>
                </div>

                {/* Row 3: amounts */}
                <div className="flex items-end justify-between mb-3 bg-emerald-50/50 rounded-lg p-2.5 border border-emerald-100">
                    <div>
                        <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-widest mb-0.5">Total Original</p>
                        <p className="text-[18px] font-black text-emerald-700 leading-none font-mono tracking-tight">
                            {fmt(ficha.orig)}
                        </p>
                    </div>
                    <div>
                        <button
                            onClick={() => onVerFicha(ficha)}
                            className="bg-white hover:bg-emerald-50 text-emerald-600 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                        >
                            <Eye className="w-3.5 h-3.5" /> Ver Detalle
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}

// ─── MonthCard ────────────────────────────────────────────────────────────────

function MonthCard({
    group, showClientName, onVerFicha,
}: {
    group: MesGroup;
    showClientName: boolean;
    onVerFicha: (f: FichaEntry) => void;
}) {
    const [expanded, setExpanded] = useState(true);

    return (
        <div style={{ border: `1.5px solid #E5E7EB`, borderRadius: 16, overflow: 'hidden', background: '#fff' }}>
            {/* Header */}
            <div
                onClick={() => setExpanded(e => !e)}
                className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/60 transition-colors select-none gap-4"
            >
                {/* Left: icon + title + subtitle */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-emerald-50">
                        <Archive className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[15px] font-bold text-gray-800 capitalize">{group.label}</p>
                        <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                            {group.fichas.length} {group.fichas.length === 1 ? 'ficha finalizada' : 'fichas finalizadas'}
                        </p>
                    </div>
                </div>

                {/* Right: chevron */}
                <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right hidden sm:block">
                         <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 mb-0.5">Total Facturado</p>
                         <p className="text-[15px] font-black text-emerald-700 font-mono leading-none">
                             {fmt(group.origTotal)}
                         </p>
                     </div>
                    <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors bg-gray-50 text-gray-400"
                    >
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                </div>
            </div>

            {/* Body: fichas */}
            {expanded && (
                <div className="p-3 space-y-2 bg-gray-50/30">
                    {group.fichas.map(ficha => (
                        <FichaCard
                            key={ficha.invoiceId}
                            ficha={ficha}
                            showClientName={showClientName}
                            onVerFicha={onVerFicha}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── HistorialFichasPagadasView (main export) ──────────────────────────────────────────

export function HistorialFichasPagadasView() {
    const { clients, isLoading } = useClients();

    const [clienteFilter, setClienteFilter] = useState<string>('all');
    const [fichaDetalle, setFichaDetalle] = useState<FichaEntry | null>(null);

    // Filter to ONLY paid invoices (balance <= 0 OR status == pagado)
    const allFichasPagadas: FichaEntry[] = useMemo(() => {
        return clients.flatMap(client =>
            (client.invoices || [])
                .filter((inv: Invoice) => inv.balance <= 0 || inv.status === 'pagado')
                .map((inv: Invoice): FichaEntry => {
                    const orig = Number(inv.totalAmount) || 0;
                    return {
                        clientId: client.id,
                        clientName: client.name,
                        invoiceId: inv.id,
                        valeryNoteId: inv.valeryNoteId || '',
                        orig,
                        emision: inv.issueDate,
                        vence: inv.dueDate,
                        invoice: inv,
                    };
                })
        );
    }, [clients]);

    // Apply client filter
    const filteredFichas = useMemo(() =>
        clienteFilter === 'all'
            ? allFichasPagadas
            : allFichasPagadas.filter(f => f.clientId === clienteFilter),
        [allFichasPagadas, clienteFilter]
    );

    // Group by month, most recent first
    const mesGroups: MesGroup[] = useMemo(() => {
        const map = new Map<string, FichaEntry[]>();
        for (const f of filteredFichas) {
            if (!f.emision) continue;
            const key = getMonthKey(f.emision);
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(f);
        }
        return [...map.entries()]
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([key, fichas]) => {
                const origTotal = fichas.reduce((s, f) => s + f.orig, 0);
                return {
                    key,
                    label: getMonthLabel(fichas[0].emision),
                    fichas,
                    origTotal,
                };
            });
    }, [filteredFichas]);

    const showClientName = clienteFilter === 'all';

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-28 gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-emerald-500 border-r-transparent animate-spin" />
                <p className="text-sm text-gray-400 font-medium">Cargando historial...</p>
            </div>
        );
    }

    // Stats bar
    const totalFichas = filteredFichas.length;
    const totalMonto = filteredFichas.reduce((s, f) => s + f.orig, 0);

    return (
        <div className="space-y-6 max-w-4xl mx-auto">

            {/* ── Toolbar ── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <Archive className="w-6 h-6 text-emerald-500" />
                        Historial de Fichas Finalizadas
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5 font-medium">
                        {totalFichas} ficha{totalFichas !== 1 ? 's' : ''} archivada{totalFichas !== 1 ? 's' : ''} en total
                    </p>
                </div>

                {/* Client filter */}
                <div className="flex items-center gap-2">
                    <label className="text-[11px] text-gray-400 font-bold uppercase tracking-widest hidden sm:block">Filtrar</label>
                    <div className="relative">
                        <select
                            value={clienteFilter}
                            onChange={e => setClienteFilter(e.target.value)}
                            className="h-9 pl-3 pr-8 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all cursor-pointer appearance-none shadow-sm"
                        >
                            <option value="all">Todos los clientes</option>
                            {clients.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    </div>
                </div>
            </div>

            {/* ── Summary Strip ── */}
            {totalFichas > 0 && (
                <div className="grid grid-cols-2 gap-3 max-w-sm">
                    <div className="bg-white border border-emerald-100 rounded-2xl px-4 py-3 shadow-sm flex flex-col items-center">
                        <p className="text-[9px] text-emerald-600/70 font-bold uppercase tracking-widest mb-1">Total Fichas</p>
                        <p className="text-2xl font-black text-emerald-600 leading-none">{totalFichas}</p>
                    </div>
                    <div className="bg-white border border-emerald-100 rounded-2xl px-4 py-3 shadow-sm flex flex-col items-center">
                        <p className="text-[9px] text-emerald-600/70 font-bold uppercase tracking-widest mb-1">Total Crédito Otor.</p>
                        <p className="text-xl font-black text-emerald-600 leading-none font-mono">{fmt(totalMonto)}</p>
                    </div>
                </div>
            )}

            {/* ── Empty state ── */}
            {mesGroups.length === 0 && (
                <div className="py-24 text-center border-2 border-dashed border-gray-200 rounded-2xl bg-white">
                    <Archive className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="font-semibold text-gray-500">Sin fichas finalizadas</p>
                    <p className="text-xs text-gray-400 mt-1">
                        {clienteFilter !== 'all'
                            ? 'Este cliente no tiene notas entregadas y completamente pagadas.'
                            : 'Aún no hay facturas completamente saldadas en el sistema.'}
                    </p>
                </div>
            )}

            {/* ── Groups ── */}
            <div className="space-y-4">
                {mesGroups.map(group => (
                    <MonthCard
                        key={group.key}
                        group={group}
                        showClientName={showClientName}
                        onVerFicha={setFichaDetalle}
                    />
                ))}
            </div>

            {/* Modal de Detalle */}
            {fichaDetalle && (
                <VerFichaModal
                    ficha={fichaDetalle}
                    clientId={fichaDetalle.clientId}
                    onClose={() => setFichaDetalle(null)}
                />
            )}
        </div>
    );
}
