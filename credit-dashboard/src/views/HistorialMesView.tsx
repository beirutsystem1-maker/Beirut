/**
 * HistorialMesView — Módulo 4
 * Agrupa todas las fichas/facturas de todos los clientes por mes.
 * Filtro por cliente, acciones de pago / eliminar / editar fecha.
 */
import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useClients } from '../logic/ClientContext';
import type { Invoice } from '../logic/ClientContext';
import { useBCV } from '../hooks/BCVContext';
import {
    useDeleteInvoice,
    useUpdateInvoiceDueDate,
    useRegisterPayment,
    useClientTransactions,
} from '../logic/useClients';
import type { Transaction } from '../logic/useClients';
import {
    Calendar, ChevronDown, ChevronUp, Trash2,
    Edit2, Save, X, FileText, Loader2, CheckCircle2,
    AlertTriangle, DollarSign,
} from 'lucide-react';
import { parseLocalDate } from '../utils/dates';

// ─── Types ───────────────────────────────────────────────────────────────────

type EstadoFicha = 'mora' | 'pendiente' | 'aldia';

interface FichaEntry {
    clientId: string;
    clientName: string;
    invoiceId: string;
    valeryNoteId: string;
    estado: EstadoFicha;
    orig: number;       // totalAmount
    pag: number;        // totalAmount - balance  (ya pagado)
    saldoBase: number;  // balance  (= orig - pag)
    total: number;      // saldoBase * FACTOR (con recargo)
    pct: number;        // Math.round(pag / orig * 100)
    emision: string;
    vence: string;
    invoice: Invoice;
}

interface MesGroup {
    key: string;        // "2026-03"
    label: string;      // "Marzo 2026"
    fichas: FichaEntry[];
    estadoHeredado: EstadoFicha;
    saldoBaseTotal: number;
    totalTotal: number;
    pctCubierto: number;
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
function deriveEstado(inv: Invoice): EstadoFicha {
    if (inv.status === 'en mora') return 'mora';
    if (inv.balance <= 0) return 'aldia';
    return 'pendiente';
}

const ESTADO_LABEL: Record<EstadoFicha, string> = {
    mora: 'En Mora', pendiente: 'Pendiente', aldia: 'Al día',
};
const ESTADO_CLASSES: Record<EstadoFicha, string> = {
    mora: 'bg-red-100 text-red-700',
    pendiente: 'bg-amber-100 text-amber-700',
    aldia: 'bg-emerald-100 text-emerald-700',
};
const ESTADO_ICON_COLOR: Record<EstadoFicha, string> = {
    mora: 'text-red-500', pendiente: 'text-amber-500', aldia: 'text-emerald-500',
};

// ─── RegistrarPagoModal ───────────────────────────────────────────────────────

function RegistrarPagoModal({
    ficha, onClose, onSuccess,
}: { ficha: FichaEntry; onClose: () => void; onSuccess: () => void }) {
    const [amount, setAmount] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const registerPayment = useRegisterPayment();

    const num = parseFloat(amount) || 0;
    const descuento = Math.min(num, ficha.saldoBase);
    const nuevaDeuda = Math.max(0, ficha.saldoBase - descuento);

    const handleConfirm = async () => {
        if (descuento <= 0) return;
        setError(null);
        try {
            await registerPayment.mutateAsync({
                clientId: ficha.clientId,
                invoiceId: ficha.invoiceId,
                amount: descuento,
            });
            setToast(`${fmt(descuento)} registrado ✓`);
            setAmount('');
            setTimeout(() => { setToast(null); onSuccess(); onClose(); }, 2000);
        } catch {
            setError('No se pudo registrar el pago. Verifica tu conexión.');
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 animate-fade-in"
            onClick={e => { if (e.target === e.currentTarget && !registerPayment.isPending) onClose(); }}
        >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[380px] overflow-hidden animate-scale-in">
                {/* Header */}
                <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Registrar Pago</p>
                        <p className="font-bold text-gray-900 text-sm mt-0.5">{ficha.clientName}</p>
                        <p className="font-mono text-xs text-gray-400 mt-0.5">{ficha.valeryNoteId || ficha.invoiceId.split('-')[0]}</p>
                    </div>
                    <button onClick={onClose} disabled={registerPayment.isPending} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors mt-0.5">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-4">
                    {toast && (
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            <p className="text-sm text-emerald-700 font-medium">{toast}</p>
                        </div>
                    )}
                    {error && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                            <p className="text-sm text-red-600">{error}</p>
                        </div>
                    )}

                    {/* Saldo pendiente info */}
                    <div className="bg-gray-50 rounded-xl px-4 py-3 flex justify-between items-center">
                        <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-widest">Saldo pendiente</span>
                        <span className="font-mono font-black text-gray-900 text-base">{fmt(ficha.saldoBase)}</span>
                    </div>

                    {/* Amount input */}
                    <div>
                        <label className="text-[11px] text-gray-400 font-bold uppercase tracking-widest block mb-1.5">Monto a abonar (USD)</label>
                        <div className="flex items-stretch border border-gray-200 rounded-xl overflow-hidden focus-within:border-[#1D9E75] focus-within:ring-2 focus-within:ring-[#1D9E75]/20 transition-all">
                            <span className="px-3 text-sm font-bold text-gray-400 bg-gray-50 flex items-center border-r border-gray-200">$</span>
                            <input
                                type="number" min="0" step="0.01"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
                                placeholder="0.00"
                                autoFocus
                                className="flex-1 px-3 py-3 text-base font-mono font-bold text-gray-900 focus:outline-none bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        </div>
                    </div>

                    {/* Preview */}
                    {num > 0 && (
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 space-y-1.5">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-500">Descuento aplicado</span>
                                <span className="font-mono font-bold text-emerald-600">−{fmt(descuento)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-500">Nueva deuda</span>
                                <span className="font-mono font-bold text-gray-900">{fmt(nuevaDeuda)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 pb-5 flex gap-2.5">
                    <button
                        onClick={onClose}
                        disabled={registerPayment.isPending}
                        className="flex-1 h-11 rounded-xl border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >Cancelar</button>
                    <button
                        onClick={handleConfirm}
                        disabled={registerPayment.isPending || descuento <= 0}
                        style={{ background: descuento > 0 ? '#1D9E75' : '#D1D5DB' }}
                        className="flex-1 h-11 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed"
                    >
                        {registerPayment.isPending
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</>
                            : <><DollarSign className="w-4 h-4" /> Confirmar Pago</>}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─── HistorialPanel — "Ver historial" slide-up panel ─────────────────────────

function HistorialPanel({
    ficha, onClose,
}: { ficha: FichaEntry; onClose: () => void }) {
    const { data: transactions = [], isLoading } = useClientTransactions(ficha.clientId);
    const pagos = transactions.filter(
        (tx: Transaction) => tx.invoiceId === ficha.invoiceId && tx.type === 'payment'
    );

    return createPortal(
        <div
            className="fixed inset-0 z-[9998] bg-black/30 flex items-end sm:items-center justify-center p-4 animate-fade-in"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[420px] animate-scale-in overflow-hidden">
                <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between">
                    <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Historial de Pagos</p>
                        <p className="font-mono font-black text-gray-800 text-sm mt-0.5">{ficha.valeryNoteId || ficha.invoiceId.split('-')[0]}</p>
                        <p className="text-[11px] text-gray-400">{ficha.clientName}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors mt-0.5">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Summary */}
                <div className="px-5 py-3 bg-gray-50 flex items-center justify-between border-b border-gray-100">
                    <div className="text-center flex-1">
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Original</p>
                        <p className="font-mono font-black text-gray-700 text-sm">{fmt(ficha.orig)}</p>
                    </div>
                    <div className="text-center flex-1 border-x border-gray-200">
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Pagado</p>
                        <p className="font-mono font-black text-emerald-600 text-sm">{fmt(ficha.pag)}</p>
                    </div>
                    <div className="text-center flex-1">
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Saldo</p>
                        <p className="font-mono font-black text-gray-900 text-sm">{fmt(ficha.saldoBase)}</p>
                    </div>
                </div>

                {/* Transactions */}
                <div className="px-5 py-4 max-h-[300px] overflow-y-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-6 gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
                            <span className="text-xs text-gray-400">Cargando...</span>
                        </div>
                    ) : pagos.length === 0 ? (
                        <div className="text-center py-8">
                            <DollarSign className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                            <p className="text-sm text-gray-400">Sin pagos registrados para esta ficha</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {pagos.map((tx: Transaction) => (
                                <div key={tx.id} className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] font-bold text-gray-700">
                                            {new Date(tx.createdAt).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            <span className="text-gray-400 font-normal"> · {tx.paymentMethod || 'App'}</span>
                                        </p>
                                        <p className="text-[10px] font-mono text-gray-400 mt-0.5">{tx.id.slice(-12)}</p>
                                    </div>
                                    <p className="font-mono font-black text-emerald-600 text-sm shrink-0">+{fmt(tx.amountUsd)}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─── DueDateEditorInline ──────────────────────────────────────────────────────

function DueDateEditorInline({
    invoiceId, clientId, vence, isOverdue,
}: { invoiceId: string; clientId: string; vence: string; isOverdue: boolean }) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(vence?.slice(0, 10) || '');
    const updateDue = useUpdateInvoiceDueDate();

    if (editing) {
        return (
            <div className="flex items-center gap-1">
                <input
                    type="date" value={val}
                    onChange={e => setVal(e.target.value)}
                    className="text-[11px] border border-indigo-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                />
                <button
                    onClick={async () => {
                        if (!val) return;
                        await updateDue.mutateAsync({ invoiceId, clientId, dueDate: val });
                        setEditing(false);
                    }}
                    disabled={updateDue.isPending}
                    className="p-0.5 rounded text-emerald-500 hover:text-emerald-600 disabled:opacity-40"
                >
                    {updateDue.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                </button>
                <button onClick={() => setEditing(false)} className="p-0.5 rounded text-gray-400 hover:text-red-400">
                    <X className="w-3 h-3" />
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1">
            <span className={`text-[11px] font-semibold ${isOverdue ? 'text-red-500' : 'text-gray-500'}`}>
                Vence: {fmtDate(vence)}
            </span>
            <button onClick={() => setEditing(true)} className="p-0.5 rounded text-gray-300 hover:text-indigo-500 transition-colors" title="Editar vencimiento">
                <Edit2 className="w-2.5 h-2.5" />
            </button>
        </div>
    );
}

// ─── PagosAplicados ───────────────────────────────────────────────────────────

function PagosAplicados({ clientId, invoiceId }: { clientId: string; invoiceId: string }) {
    const { data: transactions = [], isLoading } = useClientTransactions(clientId);
    const pagos = transactions.filter(
        (tx: Transaction) => tx.invoiceId === invoiceId && tx.type === 'payment'
    );

    if (isLoading) return (
        <div className="flex items-center gap-2 py-2">
            <Loader2 className="w-3 h-3 animate-spin text-gray-300" />
            <span className="text-[11px] text-gray-400">Cargando pagos...</span>
        </div>
    );

    if (pagos.length === 0) return (
        <p className="text-[11px] text-gray-400 italic py-1">Sin pagos aplicados registrados</p>
    );

    return (
        <div className="space-y-1.5 pt-1">
            {pagos.map((tx: Transaction) => (
                <div key={tx.id} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <div className="flex-1 flex items-center justify-between min-w-0">
                        <span className="font-mono text-[10px] text-gray-400 truncate">
                            {tx.id.slice(-10)} · {new Date(tx.createdAt).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })} · {tx.paymentMethod || 'App'}
                        </span>
                        <span className="text-[11px] font-bold text-emerald-600 font-mono shrink-0 ml-2">+{fmt(tx.amountUsd)}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── FichaCard ────────────────────────────────────────────────────────────────

function FichaCard({
    ficha, showClientName, onRegistrarPago, onVerHistorial,
}: {
    ficha: FichaEntry;
    showClientName: boolean;
    onRegistrarPago: (f: FichaEntry) => void;
    onVerHistorial: (f: FichaEntry) => void;
}) {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showPagos, setShowPagos] = useState(false);
    const deleteInvoice = useDeleteInvoice();
    const isOverdue = ficha.estado === 'mora';

    const barPct = Math.min(ficha.pct, 100);
    const barColor = barPct >= 60 ? '#22C55E' : barPct > 0 ? '#3B82F6' : '#EF4444';

    return (
        <div style={{ background: '#fafaf8', border: '1px solid #E5E7EB', borderRadius: 12 }}>
            <div className="px-4 py-3.5">

                {/* Row 1: icon + ID + badge + [client name] + delete */}
                <div className="flex items-center gap-2 mb-2.5">
                    <FileText className={`w-4 h-4 shrink-0 ${ESTADO_ICON_COLOR[ficha.estado]}`} />
                    <span className="font-mono font-bold text-sm text-gray-800 truncate">{ficha.valeryNoteId || ficha.invoiceId.split('-')[0]}</span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${ESTADO_CLASSES[ficha.estado]}`}>
                        {ESTADO_LABEL[ficha.estado]}
                    </span>
                    {showClientName && (
                        <span className="text-[10px] text-gray-400 font-medium ml-1 truncate hidden sm:inline">{ficha.clientName}</span>
                    )}
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="ml-auto p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                        title="Eliminar ficha"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Row 2: dates */}
                <div className="flex items-center gap-4 mb-3 flex-wrap">
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {fmtDate(ficha.emision)}
                    </span>
                    <DueDateEditorInline
                        invoiceId={ficha.invoiceId}
                        clientId={ficha.clientId}
                        vence={ficha.vence}
                        isOverdue={isOverdue}
                    />
                </div>

                {/* Row 3: amounts */}
                <div className="flex items-end justify-between mb-3">
                    <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">Saldo Base</p>
                        <p className="text-[22px] font-black text-gray-900 leading-none font-mono tracking-tight">
                            {fmt(ficha.saldoBase)}
                        </p>
                        {ficha.pag > 0 && (
                            <p className="text-[10px] text-gray-400 mt-1 font-medium">
                                Orig: <span className="font-mono">{fmt(ficha.orig)}</span>
                            </p>
                        )}
                    </div>
                    <div className="text-right">
                        <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: '#BA7517' }}>Total</p>
                        <p className="text-[18px] font-black leading-none font-mono tracking-tight" style={{ color: '#BA7517' }}>
                            {fmt(ficha.total)}
                        </p>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="mb-3">
                    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: '#F3F4F6' }}>
                        <div
                            className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${barPct}%`, background: barColor }}
                        />
                    </div>
                    <div className="flex justify-between mt-1">
                        <span className="text-[9px] font-bold" style={{ color: barColor }}>{barPct}% cubierto</span>
                        {ficha.pag > 0 && (
                            <span className="text-[9px] text-gray-400 font-medium">Abonado: {fmt(ficha.pag)}</span>
                        )}
                    </div>
                </div>

                {/* Pagos aplicados — collapsible */}
                <div className="border-t border-gray-100 pt-2 mb-3">
                    <button
                        onClick={() => setShowPagos(p => !p)}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-gray-700 transition-colors w-full text-left"
                    >
                        {showPagos ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        Pagos aplicados
                        {ficha.pag > 0 && <span className="ml-auto text-emerald-600 font-mono">{fmt(ficha.pag)}</span>}
                    </button>
                    {showPagos && (
                        <div className="mt-2 pl-1">
                            <PagosAplicados clientId={ficha.clientId} invoiceId={ficha.invoiceId} />
                        </div>
                    )}
                </div>

                {/* Footer actions */}
                <div className="flex gap-2">
                    <button
                        onClick={() => onRegistrarPago(ficha)}
                        disabled={ficha.saldoBase <= 0}
                        style={{ background: ficha.saldoBase > 0 ? '#1D9E75' : '#E5E7EB' }}
                        className="flex-1 h-9 rounded-xl text-white text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all disabled:cursor-not-allowed disabled:text-gray-400"
                    >
                        <span className="text-[15px] leading-none font-light">＋</span> Registrar pago
                    </button>
                    <button
                        onClick={() => onVerHistorial(ficha)}
                        className="flex-1 h-9 rounded-xl border border-gray-200 text-gray-600 text-[12px] font-bold hover:bg-gray-50 transition-colors"
                    >
                        Ver historial
                    </button>
                </div>
            </div>

            {/* Delete confirm portal */}
            {showDeleteConfirm && createPortal(
                <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white shadow-2xl rounded-2xl p-6 max-w-[320px] w-full animate-scale-in flex flex-col items-center text-center">
                        <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
                            <Trash2 className="w-6 h-6 text-red-500" />
                        </div>
                        <h3 className="font-bold text-lg mb-1.5 text-gray-900">Eliminar Ficha</h3>
                        <p className="font-mono text-sm font-black text-red-500 mb-2 bg-red-50 px-3 py-1 rounded-lg">{ficha.valeryNoteId || ficha.invoiceId.split('-')[0]}</p>
                        <p className="text-xs text-gray-400 font-medium mb-6">{ficha.clientName}</p>
                        <p className="text-sm text-gray-500 mb-6 leading-relaxed">Esta acción es irreversible y eliminará la ficha permanentemente.</p>
                        <div className="flex gap-3 w-full">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={deleteInvoice.isPending}
                                className="flex-1 h-10 rounded-xl font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm"
                            >Cancelar</button>
                            <button
                                onClick={async () => {
                                    try {
                                        await deleteInvoice.mutateAsync({ invoiceId: ficha.invoiceId, clientId: ficha.clientId });
                                        setShowDeleteConfirm(false);
                                    } catch (e) {
                                        console.error('Error eliminando ficha', e);
                                    }
                                }}
                                disabled={deleteInvoice.isPending}
                                className="flex-1 h-10 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 text-sm flex items-center justify-center gap-2"
                            >
                                {deleteInvoice.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

// ─── MonthCard ────────────────────────────────────────────────────────────────

function MonthCard({
    group, showClientName, onRegistrarPago, onVerHistorial,
}: {
    group: MesGroup;
    showClientName: boolean;
    onRegistrarPago: (f: FichaEntry) => void;
    onVerHistorial: (f: FichaEntry) => void;
}) {
    const [expanded, setExpanded] = useState(true);

    const borderColor = group.estadoHeredado === 'mora'
        ? '#FCA5A5'
        : group.estadoHeredado === 'aldia'
            ? '#6EE7B7'
            : '#FCD34D';

    const iconBg = group.estadoHeredado === 'mora'
        ? { bg: '#FEF2F2', text: '#EF4444' }
        : group.estadoHeredado === 'aldia'
            ? { bg: '#ECFDF5', text: '#22C55E' }
            : { bg: '#FFFBEB', text: '#F59E0B' };

    const barColorMonth = group.estadoHeredado === 'aldia'
        ? '#22C55E'
        : group.estadoHeredado === 'mora'
            ? '#EF4444'
            : '#6366F1';

    return (
        <div style={{ border: `1.5px solid ${borderColor}`, borderRadius: 16, overflow: 'hidden', background: '#fff' }}>
            {/* Header */}
            <div
                onClick={() => setExpanded(e => !e)}
                className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/60 transition-colors select-none gap-4"
            >
                {/* Left: icon + title + subtitle */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: iconBg.bg }}>
                        <Calendar className="w-5 h-5" style={{ color: iconBg.text }} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[15px] font-bold text-gray-800 capitalize">{group.label}</p>
                        <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                            {group.fichas.length} {group.fichas.length === 1 ? 'ficha' : 'fichas'} · {group.pctCubierto}% cubierto
                        </p>
                    </div>
                </div>

                {/* Right: SALDO BASE + TOTAL + chevron */}
                <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right hidden sm:block">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Saldo Base</p>
                        <p className="text-[15px] font-black text-gray-900 font-mono leading-none">
                            {fmt(group.saldoBaseTotal)}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: '#BA7517' }}>Total</p>
                        <p className="text-[15px] font-black font-mono leading-none" style={{ color: '#BA7517' }}>
                            {fmt(group.totalTotal)}
                        </p>
                    </div>
                    <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors"
                        style={{ background: group.estadoHeredado === 'aldia' ? '#ECFDF5' : '#F1F5F9', color: group.estadoHeredado === 'aldia' ? '#22C55E' : '#94A3B8' }}
                    >
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                </div>
            </div>

            {/* Month progress bar line */}
            <div className="h-0.5 w-full" style={{ background: '#F3F4F6' }}>
                <div
                    className="h-full transition-all duration-700 ease-out"
                    style={{ width: `${Math.min(group.pctCubierto, 100)}%`, background: barColorMonth }}
                />
            </div>

            {/* Body: fichas */}
            {expanded && (
                <div className="p-3 space-y-2">
                    {group.fichas.map(ficha => (
                        <FichaCard
                            key={ficha.invoiceId}
                            ficha={ficha}
                            showClientName={showClientName}
                            onRegistrarPago={onRegistrarPago}
                            onVerHistorial={onVerHistorial}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── HistorialMesView (main export) ──────────────────────────────────────────

export function HistorialMesView() {
    const { clients, isLoading } = useClients();
    useBCV(); // keep context subscription for rate reactivity

    const surchargePercent = (() => {
        const s = localStorage.getItem('beirutSurchargePercent');
        return s !== null && s !== '' ? parseFloat(s) : 30;
    })();
    // FACTOR: total con recargo = saldoBase * (1 + surcharge%)
    const FACTOR = 1 + surchargePercent / 100;

    const [clienteFilter, setClienteFilter] = useState<string>('all');
    const [pagoFicha, setPagoFicha] = useState<FichaEntry | null>(null);
    const [historialFicha, setHistorialFicha] = useState<FichaEntry | null>(null);

    // Build flat list of all fichas, sorted by client+date
    const allFichas: FichaEntry[] = useMemo(() => {
        return clients.flatMap(client =>
            (client.invoices || []).map((inv: Invoice): FichaEntry => {
                const orig = Number(inv.totalAmount) || 0;
                const pag = Math.max(0, orig - (Number(inv.balance) || 0));
                const saldoBase = Number(inv.balance) || 0;
                const total = Math.round(saldoBase * FACTOR * 100) / 100;
                const pct = orig > 0 ? Math.round(pag / orig * 100) : (saldoBase <= 0 ? 100 : 0);
                return {
                    clientId: client.id,
                    clientName: client.name,
                    invoiceId: inv.id,
                    valeryNoteId: inv.valeryNoteId || '',
                    estado: deriveEstado(inv),
                    orig, pag, saldoBase, total, pct,
                    emision: inv.issueDate,
                    vence: inv.dueDate,
                    invoice: inv,
                };
            })
        );
    }, [clients, FACTOR]);

    // Apply client filter
    const filteredFichas = useMemo(() =>
        clienteFilter === 'all'
            ? allFichas
            : allFichas.filter(f => f.clientId === clienteFilter),
        [allFichas, clienteFilter]
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
                const pagTotal = fichas.reduce((s, f) => s + f.pag, 0);
                const estadoHeredado: EstadoFicha =
                    fichas.some(f => f.estado === 'mora') ? 'mora' :
                        fichas.some(f => f.estado === 'pendiente') ? 'pendiente' : 'aldia';
                return {
                    key,
                    label: getMonthLabel(fichas[0].emision),
                    fichas,
                    estadoHeredado,
                    saldoBaseTotal: fichas.reduce((s, f) => s + f.saldoBase, 0),
                    totalTotal: fichas.reduce((s, f) => s + f.total, 0),
                    pctCubierto: origTotal > 0 ? Math.round(pagTotal / origTotal * 100) : 100,
                };
            });
    }, [filteredFichas]);

    const showClientName = clienteFilter === 'all';

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-28 gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-[#635BFF] border-r-transparent animate-spin" />
                <p className="text-sm text-gray-400 font-medium">Cargando historial...</p>
            </div>
        );
    }

    // Stats bar
    const totalFichas = filteredFichas.length;
    const totalSaldoBase = filteredFichas.reduce((s, f) => s + f.saldoBase, 0);
    const totalEnTotal = filteredFichas.reduce((s, f) => s + f.total, 0);
    const fichasMora = filteredFichas.filter(f => f.estado === 'mora').length;

    return (
        <div className="space-y-6 max-w-4xl mx-auto">

            {/* ── Toolbar ── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">Historial × Mes</h2>
                    <p className="text-xs text-gray-400 mt-0.5 font-medium">
                        {totalFichas} ficha{totalFichas !== 1 ? 's' : ''} · {mesGroups.length} {mesGroups.length === 1 ? 'mes' : 'meses'}
                        {fichasMora > 0 && <span className="text-red-500 font-bold ml-2">· {fichasMora} en mora</span>}
                    </p>
                </div>

                {/* Client filter */}
                <div className="flex items-center gap-2">
                    <label className="text-[11px] text-gray-400 font-bold uppercase tracking-widest hidden sm:block">Filtrar</label>
                    <div className="relative">
                        <select
                            value={clienteFilter}
                            onChange={e => setClienteFilter(e.target.value)}
                            className="h-9 pl-3 pr-8 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#635BFF]/30 focus:border-[#635BFF]/50 transition-all cursor-pointer appearance-none shadow-sm"
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
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1">Total Fichas</p>
                        <p className="text-2xl font-black text-gray-900 leading-none">{totalFichas}</p>
                    </div>
                    <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1">Saldo Base</p>
                        <p className="text-xl font-black text-gray-900 leading-none font-mono">{fmt(totalSaldoBase)}</p>
                    </div>
                    <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
                        <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: '#BA7517' }}>Total (+{surchargePercent}%)</p>
                        <p className="text-xl font-black leading-none font-mono" style={{ color: '#BA7517' }}>{fmt(totalEnTotal)}</p>
                    </div>
                </div>
            )}

            {/* ── Empty state ── */}
            {mesGroups.length === 0 && (
                <div className="py-24 text-center border-2 border-dashed border-gray-200 rounded-2xl">
                    <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="font-semibold text-gray-500">Sin fichas para mostrar</p>
                    <p className="text-xs text-gray-400 mt-1">
                        {clienteFilter !== 'all'
                            ? 'Este cliente no tiene facturas registradas.'
                            : 'No hay facturas en el sistema aún.'}
                    </p>
                </div>
            )}

            {/* ── Month Cards ── */}
            <div className="space-y-4">
                {mesGroups.map(group => (
                    <MonthCard
                        key={group.key}
                        group={group}
                        showClientName={showClientName}
                        onRegistrarPago={f => setPagoFicha(f)}
                        onVerHistorial={f => setHistorialFicha(f)}
                    />
                ))}
            </div>

            {/* ── Modals ── */}
            {pagoFicha && (
                <RegistrarPagoModal
                    ficha={pagoFicha}
                    onClose={() => setPagoFicha(null)}
                    onSuccess={() => setPagoFicha(null)}
                />
            )}
            {historialFicha && (
                <HistorialPanel
                    ficha={historialFicha}
                    onClose={() => setHistorialFicha(null)}
                />
            )}
        </div>
    );
}
