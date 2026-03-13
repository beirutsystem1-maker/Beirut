import {
    X, FileText, AlertCircle, AlertTriangle, TrendingUp, Eye, CheckCircle,
    Loader2, DollarSign, History, Download, ArrowDownLeft, CreditCard,
    RefreshCw, ChevronLeft, ChevronRight, Calendar, ChevronDown, ChevronUp, Lock, Unlock, EyeOff, Edit2, Save, FileDown, Trash2
} from 'lucide-react';
import { useUpdateInvoiceProducts, useDeleteInvoice } from '../logic/useClients';
import { generateTicket } from '../utils/generateTicket';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Client, Invoice } from '../logic/ClientContext';
import { useClients } from '../logic/ClientContext';
import { useClientTransactions, useUpdateInvoiceDueDate } from '../logic/useClients';
import { useBCV } from '../hooks/BCVContext';
import type { Transaction } from '../logic/useClients';

interface ClientMasterProfileProps {
    client: Client | null;
    onClose: () => void;
    onViewChange?: (view: any) => void;
}

function formatCurrency(v: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(d: string) {
    return new Date(d).toLocaleString('es-VE', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// InvoiceRow
// ─────────────────────────────────────────────────────────────────────────────
function InvoiceRow({ invoice, onSelect, showBaseDebt, showSurchargeDebt }: { invoice: Invoice; onSelect: (inv: Invoice) => void; showBaseDebt: boolean; showSurchargeDebt: boolean }) {
    const surchargePercent = (() => { const s = localStorage.getItem('beirutSurchargePercent'); return s !== null && s !== '' ? parseFloat(s) : 30; })();

    return (
        <div className="bg-background border border-border rounded-xl overflow-hidden shadow-sm transition-all duration-200 hover:border-accent/40 hover:shadow-md">
            <div
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none"
                onClick={() => onSelect(invoice)}
            >
                <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${invoice.status === 'en mora' ? 'bg-rose-100 text-rose-600' : invoice.status === 'pagado' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                        <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-bold text-foreground font-mono">{invoice.id}</span>
                            <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${invoice.status === 'en mora' ? 'bg-rose-100 text-rose-700' : invoice.status === 'pagado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {invoice.status}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span>Emisión: <span className="font-semibold text-foreground/80">{formatDate(invoice.issueDate)}</span></span>
                            <span>Vence: <strong className={new Date(invoice.dueDate) < new Date() && invoice.status !== 'pagado' ? 'text-rose-500' : ''}>{formatDate(invoice.dueDate)}</strong></span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-3 sm:gap-4 w-full sm:w-auto">
                    <div className="text-right flex-1 sm:flex-none">
                        <div className="flex flex-col items-end">
                            <span className={`text-[10px] font-semibold uppercase tracking-widest mb-0.5 text-muted-foreground`}>
                                Saldo Base
                            </span>
                            <span className={`text-base font-mono font-black leading-none ${
                                !showBaseDebt ? 'text-muted-foreground/30' :
                                invoice.status === 'pagado' ? 'text-emerald-500' 
                                : invoice.status === 'en mora' ? 'text-rose-500' : 'text-foreground'
                            }`}>
                                {showBaseDebt ? formatCurrency(invoice.balance) : '****'}
                            </span>
                        </div>
                        
                        {invoice.balance > 0 && (
                            <div className="mt-1.5 flex flex-col items-end border-t border-border/40 pt-1">
                                <span className="text-[9px] font-bold text-amber-600 dark:text-amber-500 tracking-wider">TOTAL</span>
                                <span className={`text-sm font-mono font-bold leading-tight ${!showSurchargeDebt ? 'text-muted-foreground/30' : 'text-amber-600 dark:text-amber-500'}`}>
                                    {showSurchargeDebt ? formatCurrency(invoice.balance * (1 + surchargePercent / 100)) : '****'}
                                </span>
                            </div>
                        )}
                        
                        {invoice.balance <= 0 && invoice.totalAmount > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-1">Total abonado: {formatCurrency(invoice.totalAmount)}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 bg-muted/50 hover:bg-muted text-muted-foreground px-2 py-1.5 rounded-lg transition-colors ml-1 shrink-0">
                        <Eye className="w-4 h-4" />
                        <span className="text-xs font-medium hidden sm:inline">Ver</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// InvoiceDetailModal — READ-ONLY
// ─────────────────────────────────────────────────────────────────────────────
function InvoiceDetailModal({
    invoice,
    onClose,
    showBaseDebt,
    showSurchargeDebt,
    surchargePercent,
    bcvRate,
    clientId,
}: {
    invoice: Invoice;
    onClose: () => void;
    showBaseDebt: boolean;
    showSurchargeDebt: boolean;
    surchargePercent: number;
    bcvRate: number;
    clientId: string;
}) {
    // Clone products into local editable state (strings allow empty field while typing)
    const [editedProducts, setEditedProducts] = useState<{ description: string; quantity: string; unit_price: string }[]>(() =>
        (invoice.products || []).map((p: any) => ({
            description: p.description,
            quantity: String(Number(p.quantity)),
            unit_price: String(Number(p.unit_price !== undefined ? p.unit_price : p.unitPrice)),
        }))
    );
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Paginación
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;
    const totalPages = Math.ceil(editedProducts.length / itemsPerPage);

    useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages);
        }
    }, [editedProducts.length, currentPage, totalPages]);

    const paginatedProducts = editedProducts.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const updateProducts = useUpdateInvoiceProducts();
    const deleteInvoice = useDeleteInvoice();

    const factor = 1 + surchargePercent / 100;

    // Computed totals from edited rows (parse strings → numbers)
    const subtotalBase = editedProducts.reduce((s, p) => s + (parseFloat(p.quantity) || 0) * (parseFloat(p.unit_price) || 0), 0);
    // IVA 16% always applies
    const hasOriginalIva = true;
    const currentIva = Math.round(subtotalBase * 0.16 * 100) / 100;
    const totalEfectivo = subtotalBase + currentIva;

    // BCV Mode: parallel eye OFF, BCV eye ON → show everything in Bs using BCV rate
    const bcvMode = !showBaseDebt && showSurchargeDebt;

    // Subtotal Operacion uses the invoice's balance (what's owed), scaled by total change ratio
    const scaleRatio = (invoice.totalAmount || 0) > 0 ? totalEfectivo / invoice.totalAmount : 1;
    const subtotalOperacion = invoice.balance * scaleRatio;
    const totalTasaBCVusd = subtotalOperacion * factor;
    const totalTasaBCVbs = totalTasaBCVusd * bcvRate;


    const updateField = (i: number, field: 'quantity' | 'unit_price', val: string) => {
        setEditedProducts(prev => prev.map((p, idx) =>
            idx === i ? { ...p, [field]: val } : p
        ));
        setSaveSuccess(false);
    };

        const removeProduct = (i: number) => {
            setEditedProducts(prev => prev.filter((_, idx) => idx !== i));
            setSaveSuccess(false);
        };

        const handleSave = async () => {
            setIsSaving(true);
            setShowConfirm(false);
            try {
                // Parse string values to numbers before saving
                const productsToSave = editedProducts.map(p => ({
                    ...p,
                    quantity: parseFloat(p.quantity) || 0,
                    unit_price: parseFloat(p.unit_price) || 0,
                }));
                // editedProducts always holds base parallel USD prices.
                // The BCV display (price * factor) is visual only — no conversion needed here.
                await updateProducts.mutateAsync({ invoiceId: invoice.id, clientId, products: productsToSave, apply_iva: hasOriginalIva });
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (e) {
            console.error('Error saving products', e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await deleteInvoice.mutateAsync({ invoiceId: invoice.id, clientId });
            onClose();
        } catch (e: any) {
            setDeleteError(e.message || 'Error al eliminar la factura');
            console.error(e);
        } finally {
            setIsDeleting(false);
            // Don't close modal on error so user can see it
        }
    };

    let topBorderColor = 'border-t-amber-500';
    if (invoice.status === 'en mora') topBorderColor = 'border-t-rose-500';
    if (invoice.status === 'pagado') topBorderColor = 'border-t-emerald-500';

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm animate-fade-in"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className={`relative w-full max-w-md bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-border border-t-4 ${topBorderColor} animate-scale-in`}>
                {/* Header */}
                <div className="px-4 py-3 border-b border-border/50 flex justify-between items-center bg-muted/20 shrink-0">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-bold text-foreground text-base">{invoice.id}</span>
                            <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${invoice.status === 'en mora' ? 'bg-rose-100 text-rose-700' : invoice.status === 'pagado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {invoice.status}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                            <span>Emisión: <span className="font-semibold text-foreground/80">{formatDate(invoice.issueDate)}</span></span>
                            <span>Vence: <strong className={new Date(invoice.dueDate) < new Date() && invoice.status !== 'pagado' ? 'text-rose-500' : ''}>{formatDate(invoice.dueDate)}</strong></span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {invoice.status !== 'pagado' && (
                            <button 
                                onClick={() => {
                                    setDeleteError(null);
                                    setShowDeleteConfirm(true);
                                }}
                                className="p-1.5 rounded-full hover:bg-rose-50 text-rose-500 transition-colors"
                                title="Eliminar Factura"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                        <button onClick={onClose} className="p-1.5 rounded-full bg-background border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shadow-sm shrink-0">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Cabecera Fija del Desglose */}
                <div className="px-4 py-3 bg-card/80 backdrop-blur-sm z-20 shrink-0 border-b border-border/50">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5" /> Desglose de Productos
                        </p>
                        {bcvMode
                            ? <p className="text-[10px] text-amber-500/80 italic font-semibold flex items-center gap-1"><EyeOff className="w-3 h-3" /> Solo lectura en modo BCV</p>
                            : <p className="text-[10px] text-muted-foreground italic">Click en Cant. o Precio para editar</p>
                        }
                    </div>
                </div>

                {/* Tabla Scrolleable de Productos */}
                <div className="flex-1 overflow-y-auto w-full scrollbar-thin bg-background/50 relative">
                    <table className="w-full text-xs">
                        <thead className="bg-card/95 sticky top-0 z-10 backdrop-blur-md shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                            <tr>
                                <th className="text-left font-semibold text-muted-foreground/80 py-2.5 px-4 border-b border-border/60 w-[35%]">Producto</th>
                                <th className="text-center font-semibold text-muted-foreground/80 py-2.5 px-3 border-b border-border/60 w-[15%]">Cant.</th>
                                <th className="text-right font-semibold text-muted-foreground/80 py-2.5 px-3 border-b border-border/60 w-[20%]">Prec. Unit</th>
                                <th className="text-right font-semibold text-muted-foreground/80 py-2.5 px-4 border-b border-border/60 w-[25%]">Total</th>
                                <th className="px-2 border-b border-border/60 w-[5%]"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                            {paginatedProducts.map((p, pageIndex) => {
                                const i = (currentPage - 1) * itemsPerPage + pageIndex;
                                return (
                                    <tr key={i} className="hover:bg-muted/40 group transition-colors">
                                        <td className="py-2 px-4 font-medium max-w-[110px] sm:max-w-[140px] truncate text-foreground" title={p.description}>
                                            {p.description}
                                        </td>
                                        {/* Quantity (read-only in bcvMode) */}
                                        <td className="py-1 px-1 sm:px-2 text-center">
                                            <input
                                                type="number"
                                                min={0}
                                                step={1}
                                                value={p.quantity}
                                                readOnly={bcvMode}
                                                onFocus={e => !bcvMode && e.target.select()}
                                                onChange={e => !bcvMode && updateField(i, 'quantity', e.target.value)}
                                                className={`w-16 text-center bg-transparent font-mono font-semibold rounded-lg px-2 py-1 border transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${bcvMode ? 'text-muted-foreground/60 border-transparent cursor-default' : 'group-hover:bg-background/80 text-foreground focus:outline-none focus:bg-accent/15 focus:ring-2 focus:ring-accent/40 border-transparent hover:border-border/80 focus:border-accent/50 cursor-pointer focus:cursor-text'}`}
                                            />
                                        </td>
                                        {/* Unit Price */}
                                        <td className="py-1 px-1 sm:px-2 text-right">
                                            {showBaseDebt ? (
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.01}
                                                    value={p.unit_price}
                                                    onFocus={e => e.target.select()}
                                                    onChange={e => updateField(i, 'unit_price', e.target.value)}
                                                    className="w-full min-w-[60px] max-w-[80px] text-right bg-transparent group-hover:bg-background/80 text-muted-foreground hover:text-foreground font-mono font-medium focus:outline-none focus:bg-accent/15 focus:ring-2 focus:ring-accent/40 rounded-lg px-1 sm:px-2 py-1 border border-transparent hover:border-border/80 focus:border-accent/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-pointer focus:cursor-text"
                                                />
                                            ) : bcvMode ? (
                                                <span className="text-amber-600 dark:text-amber-400 font-mono text-[11px] font-semibold">
                                                    {formatCurrency((parseFloat(p.unit_price) || 0) * factor)}
                                                </span>
                                            ) : <span className="text-muted-foreground/40 font-mono">****</span>}
                                        </td>
                                        {/* Row total */}
                                        <td className="py-1.5 px-4 text-right font-mono font-medium text-foreground whitespace-nowrap">
                                            {(() => {
                                                const base = (parseFloat(p.quantity) || 0) * (parseFloat(p.unit_price) || 0);
                                                if (showBaseDebt) return formatCurrency(base);
                                                if (bcvMode) return <span className="text-amber-600 dark:text-amber-400 text-[11px] font-semibold">{formatCurrency(base * factor)}</span>;
                                                return <span className="text-muted-foreground/40 font-mono">****</span>;
                                            })()}
                                        </td>
                                        {/* Delete button — hidden in bcvMode */}
                                        <td className="px-2 py-1.5 text-center align-middle">
                                            {!bcvMode && (
                                                <button
                                                    onClick={() => removeProduct(i)}
                                                    className="p-1 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                                                    title="Eliminar producto"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-2 border-t border-border/40 bg-muted/10 sticky bottom-0 backdrop-blur-md">
                            <span className="text-[10px] text-muted-foreground/70 font-semibold uppercase tracking-wider">
                                Mostrando {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, editedProducts.length)} de {editedProducts.length}
                            </span>
                            <div className="flex items-center gap-1.5 bg-background border border-border/50 rounded-lg p-0.5 shadow-sm">
                                <button 
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                    title="Página anterior"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-xs font-bold text-foreground min-w-[2.5rem] text-center font-mono">
                                    {currentPage} <span className="text-muted-foreground/50 font-medium">/ {totalPages}</span>
                                </span>
                                <button 
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                    title="Página siguiente"
                                >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Totales Fijo (Pegado Abajo del Scroll) */}
                <div className="w-full shrink-0 bg-transparent border-t border-border/50 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
                    <table className="w-full text-xs">
                        {/* Fake width header to force alignment of totals with tbody above */}
                        <thead className="invisible h-0">
                            <tr>
                                <th className="w-[35%] p-0"></th><th className="w-[15%] p-0"></th><th className="w-[20%] p-0"></th><th className="w-[25%] p-0"></th><th className="w-[5%] p-0"></th>
                            </tr>
                        </thead>
                        <tfoot className="bg-card">
                            {/* Subtotal */}
                            <tr>
                                <td colSpan={3} className="py-2.5 px-3 text-right text-xs font-semibold text-foreground uppercase tracking-wider">
                                    Subtotal
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono font-bold text-foreground">
                                    {showBaseDebt
                                        ? formatCurrency(subtotalBase)
                                        : bcvMode
                                            ? <span className="text-amber-600 dark:text-amber-400 font-bold">{formatCurrency(subtotalBase * factor)}</span>
                                            : '****'
                                    }
                                </td>
                                <td></td>
                            </tr>
                            {/* IVA */}
                            {hasOriginalIva && (
                                <tr>
                                    <td colSpan={3} className="py-2 px-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                        IVA (16%)
                                    </td>
                                    <td className="py-2 px-4 text-right font-mono text-sm font-semibold text-amber-500/90 dark:text-amber-500">
                                        {showBaseDebt
                                            ? formatCurrency(currentIva)
                                            : bcvMode
                                                ? <span className="text-amber-600 dark:text-amber-400">{formatCurrency(currentIva * factor)}</span>
                                                : '****'
                                        }
                                    </td>
                                    <td></td>
                                </tr>
                            )}
                            {/* Gran Total */}
                            <tr className="bg-background/40">
                                <td colSpan={3} className="py-3 px-3 text-right text-xs font-black uppercase tracking-widest text-foreground">
                                    Gran Total
                                </td>
                                <td colSpan={2} className="py-3 px-4 text-right font-mono text-base font-black text-foreground">
                                    {showBaseDebt ? (
                                        formatCurrency(totalEfectivo)
                                    ) : bcvMode ? (
                                        <div className="flex flex-col items-end gap-0.5">
                                            <span className="text-amber-600 dark:text-amber-500 font-black text-base">{formatCurrency(totalEfectivo * factor)}</span>
                                            <span className="text-xs font-bold text-amber-600/70 dark:text-amber-400/70">
                                                Bs. {new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalEfectivo * factor * bcvRate)}
                                            </span>
                                        </div>
                                    ) : '****'}
                                </td>
                            </tr>
                            {/* Total Tasa BCV */}
                            {invoice.balance > 0 && showBaseDebt && showSurchargeDebt && (
                                <tr className="bg-amber-50/60 dark:bg-amber-950/20">
                                    <td colSpan={3} className="py-2.5 px-3 text-right">
                                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Total Tasa BCV</span>
                                        <p className="text-[10px] text-amber-500/70 mt-0.5">Tasa {bcvRate.toFixed(2)} Bs/USD</p>
                                    </td>
                                    <td colSpan={2} className="py-2.5 px-4 text-right">
                                        <p className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400">
                                            {formatCurrency(totalTasaBCVusd)}
                                        </p>
                                        <p className="text-sm font-mono font-black text-amber-600 dark:text-amber-400 leading-tight">
                                            Bs. {new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalTasaBCVbs)}
                                        </p>
                                    </td>
                                </tr>
                            )}
                        </tfoot>
                    </table>
                </div>

                {/* Mensaje Informativo Abonos */}
                <div className="w-full shrink-0 bg-card pt-3 pb-3 px-4">
                    {invoice.status !== 'pagado' && (
                        <div className="flex items-start gap-2.5 bg-[#635BFF]/5 border border-[#635BFF]/20 rounded-xl px-4 py-2.5">
                            <DollarSign className="w-4 h-4 text-[#635BFF] shrink-0 mt-0.5" />
                            <p className="text-[11px] text-[#635BFF]/80 leading-relaxed">
                                Para registrar un abono usar el botón <strong className="text-[#635BFF] font-bold">"Registrar Pago"</strong> inferior.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer: save + close */}
                <div className="px-4 py-3 border-t border-border bg-background flex items-center justify-between gap-2 shrink-0">
                    {bcvMode ? (
                        <span className="text-[11px] text-amber-600 font-semibold flex items-center gap-1">
                            <EyeOff className="w-3.5 h-3.5" /> Activa el modo paralelo para editar
                        </span>
                    ) : (
                        <>
                            {saveSuccess && (
                                <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 animate-fade-in">
                                    <CheckCircle className="w-3.5 h-3.5" /> Guardado
                                </span>
                            )}
                            {!saveSuccess && <span />}
                        </>
                    )}
                    <div className="flex gap-2">
                        <button onClick={onClose} className="h-9 px-4 rounded-lg font-semibold border border-border text-muted-foreground hover:bg-muted transition-all text-sm">
                            Cerrar
                        </button>
                        {!bcvMode && (
                            <button
                                onClick={() => setShowConfirm(true)}
                                disabled={isSaving}
                                className="h-9 px-4 rounded-lg font-bold bg-[#635BFF] text-white hover:bg-[#524ae3] transition-all text-sm flex items-center gap-1.5 disabled:opacity-60"
                            >
                                {isSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando...</> : <><Save className="w-3.5 h-3.5" /> Guardar</>}
                            </button>
                        )}
                    </div>
                </div>

                {/* Confirmation Dialog Overlay */}
                {showConfirm && createPortal(
                    <div className="fixed inset-0 z-[90] bg-background/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                        <div className="bg-card border border-[#635BFF]/30 shadow-2xl rounded-2xl p-6 max-w-[300px] w-full animate-scale-in flex flex-col items-center text-center">
                            <div className="w-14 h-14 bg-[#635BFF]/10 text-[#635BFF] rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                                <Save className="w-7 h-7" />
                            </div>
                            <h3 className="font-bold text-lg mb-2 text-foreground tracking-tight">¿Guardar cambios?</h3>
                            <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                                Las cantidades y precios de esta factura se actualizarán en la base de datos de manera permanente.
                            </p>
                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => setShowConfirm(false)}
                                    className="flex-1 h-10 rounded-xl font-bold bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 text-sm"
                                    disabled={isSaving}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="flex-1 h-10 rounded-xl font-bold bg-[#635BFF] text-white hover:bg-[#524ae3] hover:shadow-[0_0_15px_rgba(99,91,255,0.4)] hover:scale-105 transition-all duration-200 text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:hover:scale-100"
                                >
                                    {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> ...</> : <><Save className="w-4 h-4" /> Confirmar</>}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
                
                {/* Delete Confirmation Dialog Overlay */}
                {showDeleteConfirm && createPortal(
                    <div className="fixed inset-0 z-[90] bg-background/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                        <div className="bg-card border border-rose-500/30 shadow-2xl rounded-2xl p-6 max-w-[300px] w-full animate-scale-in flex flex-col items-center text-center">
                            <div className="w-14 h-14 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                                <Trash2 className="w-7 h-7" />
                            </div>
                            <h3 className="font-bold text-lg mb-1.5 text-foreground tracking-tight">¿Eliminar factura?</h3>
                            <p className="text-sm font-mono font-black text-rose-500 mb-2 bg-rose-500/10 px-3 py-1 rounded-lg">{invoice.id}</p>
                            
                            {deleteError ? (
                                <div className="mb-6 p-3 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 w-full flex items-start gap-2.5">
                                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                                    <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 text-left">{deleteError}</p>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                                    Esta factura y sus productos serán eliminados del sistema irremediablemente.
                                </p>
                            )}

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="flex-1 h-10 rounded-xl font-bold bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 text-sm"
                                    disabled={isDeleting}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={isDeleting}
                                    className="flex-1 h-10 rounded-xl font-bold bg-rose-600 text-white hover:bg-rose-700 hover:shadow-[0_0_15px_rgba(225,29,72,0.4)] hover:scale-105 transition-all duration-200 text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:hover:scale-100"
                                >
                                    {isDeleting
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> ...</>
                                        : <><Trash2 className="w-4 h-4" /> Eliminar</>
                                    }
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: derive visual status & group invoices by month
// ─────────────────────────────────────────────────────────────────────────────
type DerivedStatus = 'pagado' | 'abonado_parcial' | 'pendiente';

function deriveInvoiceStatus(inv: Invoice): DerivedStatus {
    if (inv.balance <= 0) return 'pagado';
    if (inv.balance < inv.totalAmount) return 'abonado_parcial';
    return 'pendiente';
}

function getMonthLabel(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })
        .replace(/^\w/, c => c.toUpperCase());
}

function getMonthKey(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface MonthGroup {
    key: string;       // "2026-03"
    label: string;     // "Marzo 2026"
    invoices: Invoice[];
    totalOriginal: number;
    totalPending: number;
}

function groupInvoicesByMonth(invoices: Invoice[]): MonthGroup[] {
    const map = new Map<string, Invoice[]>();
    for (const inv of invoices) {
        const key = getMonthKey(inv.issueDate);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(inv);
    }

    const groups: MonthGroup[] = [];
    for (const [key, invs] of map.entries()) {
        // Within each month, sort oldest first
        invs.sort((a, b) => new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime());
        groups.push({
            key,
            label: getMonthLabel(invs[0].issueDate),
            invoices: invs,
            totalOriginal: invs.reduce((s, i) => s + i.totalAmount, 0),
            totalPending: invs.reduce((s, i) => s + i.balance, 0),
        });
    }

    // Most recent month first
    groups.sort((a, b) => b.key.localeCompare(a.key));
    return groups;
}

// ─────────────────────────────────────────────────────────────────────────────
// DueDateEditor — inline editable due date for an invoice
// ─────────────────────────────────────────────────────────────────────────────
function DueDateEditor({ invoice, clientId, isOverdue }: { invoice: Invoice; clientId: string; isOverdue: boolean }) {
    const [editing, setEditing] = useState(false);
    const [dateVal, setDateVal] = useState(invoice.dueDate?.slice(0, 10) || '');
    const updateDue = useUpdateInvoiceDueDate();

    if (editing) {
        return (
            <div className="flex items-center gap-1 mt-0.5">
                <input
                    type="date"
                    value={dateVal}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={e => setDateVal(e.target.value)}
                    className="text-[10px] border border-accent rounded px-1.5 py-0.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                    onClick={async () => {
                        if (!dateVal) return;
                        await updateDue.mutateAsync({ invoiceId: invoice.id, clientId, dueDate: dateVal });
                        setEditing(false);
                    }}
                    disabled={updateDue.isPending}
                    className="p-0.5 rounded text-emerald-500 hover:text-emerald-600 disabled:opacity-40"
                    title="Guardar"
                >
                    {updateDue.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                </button>
                <button onClick={() => setEditing(false)} className="p-0.5 rounded text-muted-foreground hover:text-rose-400" title="Cancelar">
                    <X className="w-3 h-3" />
                </button>
            </div>
        );
    }
    return (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
            Vence:
            <strong className={isOverdue ? 'text-rose-500' : ''}>{formatDate(invoice.dueDate)}</strong>
            <button onClick={() => setEditing(true)} className="p-0.5 rounded text-muted-foreground hover:text-accent transition-colors" title="Editar vencimiento">
                <Edit2 className="w-2.5 h-2.5" />
            </button>
        </p>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// CreditCard — individual invoice card inside a month group
// ─────────────────────────────────────────────────────────────────────────────
function CreditFicha({ invoice, clientId, showBaseDebt, showSurchargeDebt }: { invoice: Invoice; clientId: string; showBaseDebt: boolean; showSurchargeDebt: boolean }) {
    const surchargePercent = (() => { const s = localStorage.getItem('beirutSurchargePercent'); return s !== null && s !== '' ? parseFloat(s) : 30; })();
    const status = deriveInvoiceStatus(invoice);
    const paid = invoice.totalAmount - invoice.balance;
    const pct = invoice.totalAmount > 0 ? Math.round((paid / invoice.totalAmount) * 100) : 0;
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const deleteInvoice = useDeleteInvoice();

    const statusConfig: Record<DerivedStatus, { label: string; bg: string; text: string; barColor: string }> = {
        pagado: { label: 'Pagado', bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-400', barColor: 'bg-emerald-500' },
        abonado_parcial: { label: 'Abonado parcial', bg: 'bg-sky-100 dark:bg-sky-900/40', text: 'text-sky-700 dark:text-sky-400', barColor: 'bg-sky-500' },
        pendiente: { label: 'Pendiente', bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-400', barColor: 'bg-amber-500' },
    };
    const cfg = statusConfig[status];

    const handleDelete = async () => {
        setDeleteError(null);
        try {
            await deleteInvoice.mutateAsync({ invoiceId: invoice.id, clientId });
            setShowDeleteConfirm(false);
        } catch (e: any) {
            setDeleteError(e.message || 'Error al eliminar la factura');
            console.error('Error eliminando factura', e);
            // Keep the modal open to show the error
        }
    };

    return (
        <div className={`rounded-xl border transition-all duration-200 hover:shadow-md ${status === 'pagado'
            ? 'border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/30 dark:bg-emerald-950/10'
            : status === 'abonado_parcial'
                ? 'border-sky-200/60 dark:border-sky-800/40 bg-sky-50/20 dark:bg-sky-950/10'
                : 'border-border bg-background'
            }`}>
            <div className="px-4 py-3">
                {/* Row 1: ID + Status badge + Delete button */}
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <FileText className={`w-4 h-4 ${status === 'pagado' ? 'text-emerald-500' : status === 'abonado_parcial' ? 'text-sky-500' : 'text-amber-500'
                            }`} />
                        <span className="font-mono font-bold text-sm text-foreground">{invoice.id}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                            {cfg.label}
                        </span>
                        <button
                            onClick={() => {
                                setDeleteError(null);
                                setShowDeleteConfirm(true);
                            }}
                            className="p-1 rounded-lg text-muted-foreground/50 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                            title="Eliminar factura"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Row 2: Date + amounts */}
                <div className="flex items-end justify-between mb-2.5">
                    <div className="space-y-0.5">
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(invoice.issueDate)}
                        </p>
                        <DueDateEditor
                            invoice={invoice}
                            clientId={clientId}
                            isOverdue={new Date(invoice.dueDate) < new Date() && status !== 'pagado'}
                        />
                    </div>
                    <div className="text-right min-h-[60px] flex flex-col justify-end items-end shrink-0 w-28">
                        <p className="text-[10px] text-muted-foreground">Original: <span className="font-mono font-semibold text-foreground/70">{showBaseDebt ? formatCurrency(invoice.totalAmount) : '****'}</span></p>
                        <p className={`text-sm font-mono font-black tracking-tight ${
                                !showBaseDebt ? 'text-muted-foreground/30' :
                                status === 'pagado' ? 'text-emerald-600 dark:text-emerald-400' 
                                : status === 'abonado_parcial' ? 'text-sky-600 dark:text-sky-400' : 'text-foreground'
                            }`}>
                            {showBaseDebt ? (status === 'pagado' ? formatCurrency(0) : formatCurrency(invoice.balance)) : '****'}
                        </p>
                        {invoice.balance > 0 && (
                            <p className={`text-[10px] font-bold ${!showSurchargeDebt ? 'text-muted-foreground/30' : 'text-amber-600 dark:text-amber-500'} mt-0.5 whitespace-nowrap`}>
                                TOTAL: <span className="font-mono">
                                    {showSurchargeDebt ? formatCurrency(invoice.balance * (1 + surchargePercent / 100)) : '****'}
                                </span>
                            </p>
                        )}
                    </div>
                </div>

                {/* Row 3: Progress bar */}
                <div className="relative">
                    <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${cfg.barColor}`}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-1">
                        <span className={`text-[9px] font-bold ${cfg.text}`}>{pct}% cubierto</span>
                        {paid > 0 && status !== 'pagado' && (
                            <span className="text-[9px] text-muted-foreground">Abonado: {formatCurrency(paid)}</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Delete confirmation overlay */}
            {showDeleteConfirm && createPortal(
                <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-card border border-rose-500/30 shadow-2xl rounded-2xl p-6 max-w-[300px] w-full animate-scale-in flex flex-col items-center text-center">
                        <div className="w-14 h-14 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                            <Trash2 className="w-7 h-7" />
                        </div>
                        <h3 className="font-bold text-lg mb-1.5 text-foreground tracking-tight">¿Eliminar factura?</h3>
                        <p className="text-sm font-mono font-black text-rose-500 mb-2 bg-rose-500/10 px-3 py-1 rounded-lg">{invoice.id}</p>
                        
                        {deleteError ? (
                            <div className="mb-6 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 w-full flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                                <div className="text-left">
                                    <p className="text-xs font-bold text-rose-700 dark:text-rose-400 mb-0.5">Error de Servidor</p>
                                    <p className="text-[11px] font-medium text-rose-600/90 dark:text-rose-400/80">{deleteError}</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                                Esta factura y sus productos serán eliminados del sistema irremediablemente.
                            </p>
                        )}
                        
                        <div className="flex gap-3 w-full">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 h-10 rounded-xl font-bold bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 text-sm"
                                disabled={deleteInvoice.isPending}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleteInvoice.isPending}
                                className="flex-1 h-10 rounded-xl font-bold bg-rose-600 text-white hover:bg-rose-700 hover:shadow-[0_0_15px_rgba(225,29,72,0.4)] hover:scale-105 transition-all duration-200 text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:hover:scale-100"
                            >
                                {deleteInvoice.isPending
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> ...</>
                                    : <><Trash2 className="w-4 h-4" /> Eliminar</>
                                }
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MonthBox — monthly container ("cajita")
// ─────────────────────────────────────────────────────────────────────────────
function MonthBox({ group, defaultExpanded = false, clientId, showBaseDebt, showSurchargeDebt }: { group: MonthGroup; defaultExpanded?: boolean; clientId: string; showBaseDebt: boolean; showSurchargeDebt: boolean }) {
    const monthSurchargePercent = (() => { const s = localStorage.getItem('beirutSurchargePercent'); return s !== null && s !== '' ? parseFloat(s) : 30; })();
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const allPaid = group.totalPending <= 0;
    const pctMonth = group.totalOriginal > 0
        ? Math.round(((group.totalOriginal - group.totalPending) / group.totalOriginal) * 100)
        : 100;

    return (
        <div className={`rounded-2xl border overflow-hidden transition-all duration-300 ${allPaid
            ? 'border-emerald-200/50 dark:border-emerald-800/30'
            : 'border-border'
            }`}>
            {/* Month header */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className={`px-4 py-3 flex items-center justify-between cursor-pointer transition-colors ${allPaid
                    ? 'hover:bg-emerald-50/80 bg-emerald-50/50 dark:bg-emerald-950/15 dark:hover:bg-emerald-950/25'
                    : 'hover:bg-muted/50 bg-muted/30'
                    }`}>
                <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${allPaid
                        ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400'
                        : 'bg-accent/10 text-accent'
                        }`}>
                        <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-foreground">{group.label}</h4>
                        <p className="text-[10px] text-muted-foreground">
                            {group.invoices.length} {group.invoices.length === 1 ? 'ficha' : 'fichas'} · {pctMonth}% cubierto
                        </p>
                    </div>
                </div>
                <div className="text-right flex items-center gap-4">
                    <div className="text-right min-h-[50px] flex flex-col justify-end">
                        {group.totalPending > 0 ? (
                            <>
                                <p className={`text-[9px] uppercase font-bold tracking-wider text-muted-foreground`}>
                                    Pendiente Base
                                </p>
                                <p className={`text-base font-mono font-black tracking-tight leading-none ${!showBaseDebt ? 'text-muted-foreground/30' : 'text-foreground'}`}>
                                    {showBaseDebt ? formatCurrency(group.totalPending) : '****'}
                                </p>
                                <p className={`text-[9px] font-bold mt-1 uppercase ${!showSurchargeDebt ? 'text-muted-foreground/30' : 'text-amber-600 dark:text-amber-500'}`}>Total General</p>
                                <p className={`text-sm font-mono font-bold leading-none ${!showSurchargeDebt ? 'text-muted-foreground/30' : 'text-amber-600 dark:text-amber-500'}`}>
                                    {showSurchargeDebt ? formatCurrency(group.totalPending * (1 + parseFloat(String(monthSurchargePercent)) / 100)) : '****'}
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-[9px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400">Saldado</p>
                                <p className="text-base font-mono font-black text-emerald-600 dark:text-emerald-400 tracking-tight flex items-center gap-1 justify-end">
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    {formatCurrency(0)}
                                </p>
                            </>
                        )}
                    </div>
                    <div className={`p-1.5 rounded-full transition-colors ${allPaid ? 'bg-emerald-100/50 text-emerald-600 dark:bg-emerald-900/30' : 'bg-muted/70 text-muted-foreground'}`}>
                        {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                        ) : (
                            <ChevronDown className="w-4 h-4" />
                        )}
                    </div>
                </div>
            </div>

            {/* Month progress bar */}
            <div className="h-1 w-full bg-muted/40">
                <div
                    className={`h-full transition-all duration-700 ease-out ${allPaid ? 'bg-emerald-500' : 'bg-accent'}`}
                    style={{ width: `${pctMonth}%` }}
                />
            </div>

            {/* Invoice cards */}
            {isExpanded && (
                <div className="p-3 space-y-2 animate-slide-down">
                    {group.invoices.map(inv => (
                        <CreditFicha key={inv.id} invoice={inv} clientId={clientId} showBaseDebt={showBaseDebt} showSurchargeDebt={showSurchargeDebt} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PaymentHistoryTab — monthly grouped credit view + collapsible transactions
// ─────────────────────────────────────────────────────────────────────────────
function PaymentHistoryTab({ clientId, clientName, clientPhone, invoices, showBaseDebt, showSurchargeDebt }: {
    clientId: string;
    clientName: string;
    clientPhone?: string;
    invoices: Invoice[];
    showBaseDebt: boolean;
    showSurchargeDebt: boolean;
}) {
    const { data: transactions = [], isLoading, isError } = useClientTransactions(clientId);
    const [showTransactions, setShowTransactions] = useState(false);
    const { parallelRate, rate } = useBCV();

    const totalPaid = transactions
        .filter(tx => tx.type === 'payment')
        .reduce((sum, tx) => sum + tx.amountUsd, 0);

    const monthGroups = useMemo(() => groupInvoicesByMonth(invoices), [invoices]);

    /** Send the full account statement via WhatsApp */
    function handleWhatsAppStatement() {
        if (!clientPhone || clientPhone.trim() === '' || clientPhone === '+58 ') {
            alert(`El cliente no tiene un numero de WhatsApp registrado.`);
            return;
        }

        const surchargePercent = (() => {
            const s = localStorage.getItem('beirutSurchargePercent');
            return s !== null && s !== '' ? parseFloat(s) : 30;
        })();

        const factor = 1 + surchargePercent / 100;

        const pendingInvoices = invoices.filter(inv => inv.balance > 0)
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

        const totalDebt = pendingInvoices.reduce((s, i) => s + i.balance, 0);
        const totalConRecargo = totalDebt * factor;

        // Formato para los productos y facturas
        const fichasLines = pendingInvoices.length > 0
            ? pendingInvoices.map((inv: any) => {
                const montoConRecargo = inv.balance * factor;
                const id = inv.id.length > 14 ? inv.id.slice(-14) : inv.id;
                const monto = `$${montoConRecargo.toFixed(2)}`;
                const dots = '.'.repeat(Math.max(2, 22 - id.length - monto.length));
                
                let prodLines = '';
                if (inv.products && inv.products.length > 0) {
                    prodLines = '\n' + inv.products.map((p: any) => {
                        const price = (p.unit_price !== undefined ? p.unit_price : p.unitPrice);
                        let subLine = "";
                        if (showBaseDebt && showSurchargeDebt) {
                            subLine = `  ▸ ${p.quantity}x ${p.description} ($${price.toFixed(2)} -> $${(price * factor).toFixed(2)})`;
                        } else if (showBaseDebt && !showSurchargeDebt) {
                            subLine = `  ▸ ${p.quantity}x ${p.description} ($${price.toFixed(2)})`;
                        } else if (!showBaseDebt && showSurchargeDebt) {
                            subLine = `  ▸ ${p.quantity}x ${p.description} ($${(price * factor).toFixed(2)})`;
                        }
                        return subLine;
                    }).join('\n');
                }

                // If both hidden just fallback to showing original
                if (!showBaseDebt && !showSurchargeDebt) {
                    return `  ${id}${dots}$${inv.balance.toFixed(2)}${prodLines}`;
                }

                return `  ${id}${dots}${monto}${prodLines}`;
            }).join('\n')
            : '  Sin saldos pendientes.';

        // Formato para el historial de transacciones
        const txLines = transactions.length > 0
            ? transactions.slice(0, 15).map(tx => {
                const label = getTxLabel(tx.type);
                const sign = tx.type === 'payment' || tx.type === 'refund' ? '-' : '+';
                const dateStr = new Date(tx.createdAt).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' });
                return `  ${dateStr} | ${label} ${sign}$${tx.amountUsd.toFixed(2)}`;
            }).join('\n')
            : '  Sin historial registrado.';

        const today = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

        let msg = '';
        if (totalDebt > 0) {
            msg = `*BEIRUT · ESTADO DE CUENTA*\n` +
                  `_${today}_\n` +
                  `_${clientName}_\n` +
                  `\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\n`;
            
            if (showBaseDebt || showSurchargeDebt) {
                msg += `*FACTURAS ACTIVAS:*\n` +
                       fichasLines + `\n` +
                       `\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\n`;
            } else {
                msg += `*FACTURAS ACTIVAS OCULTAS*\n` +
                       `\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\n`;
            }
            
            msg += `*HISTORIAL DE PAGOS:*\n` +
                   txLines + `\n` +
                   `\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\n`;
                   
            if (showBaseDebt && showSurchargeDebt) {
                msg += `  Monto en Efectivo (USD): *$${totalDebt.toFixed(2)}*\n` +
                       `  Total Tasa BCV (USD):    *$${totalConRecargo.toFixed(2)}*\n`;
                msg += `\n*Equivalente en Bolívares*\n` +
                       `Monto en Efectivo Bs: *Bs. ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalDebt * parallelRate)}*\n` +
                       `Total Tasa BCV Bs:    *Bs. ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalConRecargo * rate)}*\n`;
            } else if (showBaseDebt && !showSurchargeDebt) {
                msg += `  Monto en Efectivo (USD): *$${totalDebt.toFixed(2)}*\n`;
                msg += `\n*Equivalente en Bolívares*\n` +
                       `Monto en Efectivo Bs: *Bs. ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalDebt * parallelRate)}*\n`;
            } else if (!showBaseDebt && showSurchargeDebt) {
                msg += `  Total Tasa BCV (USD): *$${totalConRecargo.toFixed(2)}*\n`;
                msg += `\n*Equivalente en Bolívares*\n` +
                       `Total Tasa BCV Bs: *Bs. ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalConRecargo * rate)}*\n`;
            } else {
                msg += `  Saldo:        *$${totalDebt.toFixed(2)}*\n`;
            }
            
            const ratesText = [];
            if (showBaseDebt) ratesText.push(`referencial: ${parallelRate.toFixed(2)}`);
            if (showSurchargeDebt) ratesText.push(`BCV: ${rate.toFixed(2)}`);
            
            if (ratesText.length > 0) {
                msg += `(Tasa ${ratesText.join(' Bs/USD | ')} Bs/USD)\n`;
            }
            msg += `\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\n` +
                   `_Beirut CRM_`;
        } else {
            msg = `*BEIRUT CRM*\n\nHola *${clientName}*, tu cuenta esta al dia. Gracias!\n\n*HISTORIAL DE PAGOS:*\n${txLines}`;
        }

        const phone = clientPhone.replace('+', '').replace(/\s/g, '');
        window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`, '_blank');
    }

    function getTxLabel(type: Transaction['type']) {
        switch (type) {
            case 'payment': return 'Pago Recibido';
            case 'refund': return 'Devolución';
            case 'fee': return 'Recargo / Mora';
            case 'extension': return 'Ampliación';
            default: return 'Transacción';
        }
    }

    function getTxIcon(type: Transaction['type']) {
        switch (type) {
            case 'payment': return <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />;
            case 'refund': return <RefreshCw className="w-3.5 h-3.5 text-blue-500" />;
            case 'fee': return <ChevronRight className="w-3.5 h-3.5 text-rose-500" />;
            default: return <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />;
        }
    }

    /** Open a printable ticket in a new window */
    function handleTicketStatement() {
        const localSurcharge = (() => {
            const s = localStorage.getItem('beirutSurchargePercent');
            return s !== null && s !== '' ? parseFloat(s) : 30;
        })();
        generateTicket({
            clientName,
            clientPhone,
            invoices,
            transactions,
            surchargePercent: localSurcharge,
        });
    }

    /** Generate and trigger download of a plain-text account statement */
    function handleDownloadStatement() {
        const totalDebt = invoices.reduce((s, i) => s + i.balance, 0);
        const lines: string[] = [
            '═══════════════════════════════════════════════════════',
            '           ESTADO DE CUENTA — BEIRUT                   ',
            '═══════════════════════════════════════════════════════',
            `Cliente: ${clientName}`,
            `Fecha de emisión: ${new Date().toLocaleDateString('es-VE')}`,
            '',
            '─── FICHAS DE CRÉDITO ──────────────────────────────────',
            ...invoices.map(inv => {
                const st = deriveInvoiceStatus(inv);
                const stLabel = st === 'pagado' ? 'Pagado' : st === 'abonado_parcial' ? 'Abonado parcial' : 'Pendiente';
                return `  ${inv.id.padEnd(16)} ${stLabel.padEnd(18)}  Saldo: ${formatCurrency(inv.balance)}`;
            }),
            '',
            `  DEUDA TOTAL PENDIENTE:               ${formatCurrency(totalDebt)}`,
            '',
            '─── HISTORIAL DE TRANSACCIONES ─────────────────────────',
            ...transactions.map(tx =>
                `  ${formatDateTime(tx.createdAt).padEnd(20)} ${getTxLabel(tx.type).padEnd(18)} ${formatCurrency(tx.amountUsd).padStart(10)}`
            ),
            '',
            `  TOTAL ABONADO HISTÓRICO:             ${formatCurrency(totalPaid)}`,
            '',
            '═══════════════════════════════════════════════════════',
            '  Documento generado automáticamente por Beirut CRM    ',
            '═══════════════════════════════════════════════════════',
        ];

        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `estado-cuenta-${clientName.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-accent border-r-transparent animate-spin" />
                <p className="text-xs text-muted-foreground">Cargando historial...</p>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
                <AlertCircle className="w-8 h-8 text-rose-400" />
                <p className="text-xs text-muted-foreground">Error al cargar el historial.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* ── Summary strip: Download + WhatsApp ── */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex-1 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-0.5">Total Abonado Histórico</p>
                    <p className="text-xl font-mono font-black text-emerald-700 dark:text-emerald-300 tracking-tighter">{formatCurrency(totalPaid)}</p>
                    <p className="text-[10px] text-emerald-600/70 mt-0.5">{transactions.filter(t => t.type === 'payment').length} transacción(es)</p>
                </div>
                <div className="flex flex-col gap-2">
                    <button
                        onClick={handleWhatsAppStatement}
                        className="flex flex-col items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#25D366]/40 bg-[#25D366]/5 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all group"
                        title="Enviar Estado de Cuenta por WhatsApp"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        <span className="text-[10px] font-semibold text-center leading-tight">Enviar<br />WA</span>
                    </button>
                    <button
                        onClick={handleTicketStatement}
                        className="flex flex-col items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-blue-400/40 bg-blue-50/5 text-blue-500 hover:bg-blue-600 hover:text-white transition-all group"
                        title="Ver Ticket Imprimible"
                    >
                        <FileDown className="w-4 h-4" />
                        <span className="text-[10px] font-semibold text-center leading-tight">Ver<br />Ticket</span>
                    </button>
                    <button
                        onClick={handleDownloadStatement}
                        className="flex flex-col items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground hover:border-accent/40 transition-all group"
                        title="Descargar Estado de Cuenta"
                    >
                        <Download className="w-4 h-4 group-hover:text-accent transition-colors" />
                        <span className="text-[10px] font-semibold text-center leading-tight">Descargar<br />Cuenta</span>
                    </button>
                </div>
            </div>

            {/* ── Monthly grouped invoice cajitas ── */}
            {monthGroups.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed border-border rounded-2xl">
                    <History className="w-10 h-10 text-muted-foreground/25 mx-auto mb-3" />
                    <p className="font-semibold text-foreground text-sm">Sin fichas de crédito</p>
                    <p className="text-xs text-muted-foreground mt-1">Las notas de entrega asignadas aparecerán aquí agrupadas por mes.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {monthGroups.map((group) => (
                        <MonthBox key={group.key} group={group} defaultExpanded={false} clientId={clientId} showBaseDebt={showBaseDebt} showSurchargeDebt={showSurchargeDebt} />
                    ))}
                </div>
            )}

            {/* ── Collapsible transaction log ── */}
            {transactions.length > 0 && (
                <div className="rounded-xl border border-border overflow-hidden">
                    <button
                        onClick={() => setShowTransactions(prev => !prev)}
                        className="w-full px-4 py-2.5 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <History className="w-3.5 h-3.5" />
                            Detalle de Transacciones ({transactions.length})
                        </span>
                        {showTransactions
                            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        }
                    </button>

                    {showTransactions && (
                        <div className="divide-y divide-border/50">
                            {transactions.map(tx => (
                                <div key={tx.id} className="px-4 py-2.5 hover:bg-muted/20 transition-colors">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center shrink-0">
                                                {getTxIcon(tx.type)}
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-xs font-semibold text-foreground">{getTxLabel(tx.type)}</span>
                                                <p className="text-[10px] text-muted-foreground">{formatDateTime(tx.createdAt)} · <span className="font-mono">{tx.invoiceId}</span></p>
                                            </div>
                                        </div>
                                        <p className={`text-sm font-mono font-bold shrink-0 ${tx.type === 'payment' || tx.type === 'refund' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                                            {tx.type === 'payment' || tx.type === 'refund' ? '−' : '+'}{formatCurrency(tx.amountUsd)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// GlobalPaymentModal
// ─────────────────────────────────────────────────────────────────────────────
interface GlobalPaymentModalProps {
    client: Client;
    totalDebt: number;
    onClose: () => void;
    onPaymentsConfirmed: (distributions: { invoiceId: string; amount: number }[]) => void;
    registerPayment: (clientId: string, invoiceId: string, amountUsd: number) => Promise<void>;
}

function GlobalPaymentModal({ client, totalDebt, onClose, onPaymentsConfirmed, registerPayment }: GlobalPaymentModalProps) {
    const { rate: exchangeRate, isLoading: isLoadingRate, refresh: refreshRate, setManualRate } = useBCV();
    const [paymentAmount, setPaymentAmount] = useState<string>('');
    const [paymentMethod, setPaymentMethod] = useState<'usd' | 'ves'>('usd');
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [paymentSuccess, setPaymentSuccess] = useState<boolean>(false);
    const [lastDistribution, setLastDistribution] = useState<{ invoiceId: string; amount: number }[]>([]);
    const [isModalRateUnlocked, setIsModalRateUnlocked] = useState<boolean>(false);

    const [surchargePercent, setSurchargePercent] = useState<number | string>(() => {
        const saved = localStorage.getItem('beirutSurchargePercent');
        return saved !== null && saved !== '' ? parseFloat(saved) : '';
    });
    const [surchargeUnlocked, setSurchargeUnlocked] = useState<boolean>(false);

    const numericPayment = parseFloat(paymentAmount) || 0;
    const saldoDeudaReal = numericPayment;
    const baseBsAmount = saldoDeudaReal * exchangeRate;
    const PORCENTAJE_AJUSTE_BS = (typeof surchargePercent === 'number' ? surchargePercent : parseFloat(surchargePercent as string) || 0) / 100;
    const surchargeBs = paymentMethod === 'ves' ? baseBsAmount * PORCENTAJE_AJUSTE_BS : 0;
    const totalACobrarBs = baseBsAmount + surchargeBs;
    const totalACobrarUsd = paymentMethod === 'ves' ? totalACobrarBs / exchangeRate : saldoDeudaReal;

    function buildDistribution(amountUsd: number): { invoiceId: string; amount: number }[] {
        const activeInvoices = (client.invoices || [])
            .filter((inv: Invoice) => inv.balance > 0)
            .sort((a: Invoice, b: Invoice) => {
                const order: Record<string, number> = { 'en mora': 0, 'pendiente': 1 };
                const oa = order[a.status] ?? 2;
                const ob = order[b.status] ?? 2;
                if (oa !== ob) return oa - ob;
                return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            });

        const distribution: { invoiceId: string; amount: number }[] = [];
        let remaining = amountUsd;
        for (const inv of activeInvoices) {
            if (remaining <= 0) break;
            const applied = Math.min(remaining, inv.balance);
            distribution.push({ invoiceId: inv.id, amount: parseFloat(applied.toFixed(2)) });
            remaining -= applied;
        }
        return distribution;
    }

    const handleConfirm = async () => {
        if (saldoDeudaReal <= 0) return;
        setIsProcessing(true);
        setPaymentError(null);
        const distribution = buildDistribution(saldoDeudaReal);
        try {
            for (const { invoiceId, amount } of distribution) {
                await registerPayment(client.id, invoiceId, amount);
            }
            setLastDistribution(distribution);
            onPaymentsConfirmed(distribution);
            setPaymentSuccess(true);
            setPaymentAmount('');
        } catch (err) {
            setPaymentError('No se pudo registrar el pago. Verifica tu conexión e intenta de nuevo.');
        } finally {
            setIsProcessing(false);
        }
    };

    const previewDistribution = saldoDeudaReal > 0 ? buildDistribution(saldoDeudaReal) : [];

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={(e) => { if (e.target === e.currentTarget && !isProcessing) onClose(); }}
        >
            <div className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-border border-t-4 border-t-emerald-500 animate-scale-in">
                <div className="px-5 py-4 border-b border-border/50 flex justify-between items-center bg-muted/20 shrink-0">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Registrar Pago</p>
                        <h3 className="text-base font-bold text-foreground">{client.name}</h3>
                    </div>
                    <button onClick={onClose} disabled={isProcessing} className="p-1.5 rounded-full bg-background border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 shrink-0">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {paymentSuccess && (
                        <div className="m-4 flex flex-col gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 animate-slide-down">
                            <div className="flex items-center gap-2.5">
                                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Pago registrado ✓</p>
                            </div>
                            <div className="pl-6 space-y-0.5">
                                {lastDistribution.map(d => (
                                    <p key={d.invoiceId} className="text-[10px] text-emerald-600 dark:text-emerald-500">
                                        <strong>{d.invoiceId}</strong>: −{formatCurrency(d.amount)}
                                    </p>
                                ))}
                            </div>
                        </div>
                    )}
                    {paymentError && (
                        <div className="mx-4 mt-4 flex items-center gap-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2.5">
                            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                            <p className="text-[10px] text-rose-600 dark:text-rose-400">{paymentError}</p>
                        </div>
                    )}

                    <div className="px-5 py-4">
                        <div className="bg-muted/40 rounded-xl px-4 py-3 flex justify-between items-center mb-4">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Deuda Acumulada</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{(client.invoices || []).filter(i => i.balance > 0).length} nota(s) activa(s)</p>
                            </div>
                            <p className={`text-2xl font-mono font-black tracking-tighter ${totalDebt > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-500'}`}>
                                {formatCurrency(totalDebt)}
                            </p>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Monto a Abonar (USD)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">$</span>
                                    <input
                                        type="number"
                                        value={paymentAmount}
                                        onChange={(e) => { setPaymentAmount(e.target.value); setPaymentSuccess(false); setPaymentError(null); }}
                                        placeholder="0.00"
                                        max={totalDebt}
                                        className="w-full bg-background border border-border rounded-lg pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                                    />
                                </div>
                                {saldoDeudaReal > totalDebt && (
                                    <p className="text-[10px] text-rose-500 mt-1">⚠ El monto supera la deuda total ({formatCurrency(totalDebt)})</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Método de Pago</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => setPaymentMethod('usd')} className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${paymentMethod === 'usd' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm' : 'bg-background border-border text-muted-foreground hover:bg-muted'}`}>
                                        Divisas (Efectivo/Zelle)
                                    </button>
                                    <button onClick={() => setPaymentMethod('ves')} className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${paymentMethod === 'ves' ? 'bg-amber-50 border-amber-500 text-amber-700 shadow-sm' : 'bg-background border-border text-muted-foreground hover:bg-muted'}`}>
                                        Bolívares (BDV)
                                    </button>
                                </div>
                                {paymentMethod === 'ves' && (
                                    <div className="mt-1.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/50 rounded-lg px-3 py-2">
                                        <p className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold mb-0.5">⚠ Recargo Operativo — Solo afecta el monto en Bs.</p>
                                        <p className="text-[10px] text-amber-600 dark:text-amber-500 leading-relaxed">
                                            El {(PORCENTAJE_AJUSTE_BS * 100).toFixed(0)}% es un costo de la transacción. Su deuda en USD se reducirá exactamente en <strong>${saldoDeudaReal > 0 ? saldoDeudaReal.toFixed(2) : '0.00'}</strong>.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="bg-background rounded-lg border border-border/50 overflow-hidden relative">
                                {isLoadingRate && (
                                    <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-10">
                                        <div className="w-4 h-4 rounded-full border-2 border-accent border-r-transparent animate-spin" />
                                    </div>
                                )}
                                {paymentMethod === 'ves' ? (
                                    <div className="divide-y divide-border/50 text-xs text-muted-foreground">
                                        <div className="flex justify-between items-center px-4 py-2 bg-background/60">
                                            <span className="font-semibold text-foreground">Descuento de Deuda (USD)</span>
                                            <span className="font-mono font-bold text-foreground">{formatCurrency(saldoDeudaReal)}</span>
                                        </div>
                                        <div className="flex justify-between items-center px-4 py-2">
                                            <span className="flex items-center gap-1">
                                                Equivalente Bs.
                                                <button 
                                                    onClick={refreshRate} 
                                                    disabled={isLoadingRate}
                                                    className="p-0.5 rounded hover:bg-accent/10 text-accent disabled:opacity-50"
                                                    title="Actualizar tasa"
                                                >
                                                    <RefreshCw className={`w-3 h-3 ${isLoadingRate ? 'animate-spin' : ''}`} />
                                                </button>
                                                <span className="flex items-center gap-1.5 ml-1">
                                                    (Tasa: 
                                                    <div className={`flex items-center bg-background/50 rounded px-1.5 py-0.5 transition-all duration-300 relative group border ${isModalRateUnlocked ? 'border-accent ring-1 ring-accent/30 shadow-[0_0_8px_rgba(99,91,255,0.15)] bg-background' : 'border-border/50 hover:border-border'}`}>
                                                        <input 
                                                            type="number" 
                                                            value={exchangeRate}
                                                            readOnly={!isModalRateUnlocked}
                                                            onChange={(e) => {
                                                                const val = parseFloat(e.target.value);
                                                                setManualRate(isNaN(val) ? null : val);
                                                            }}
                                                            onBlur={() => setIsModalRateUnlocked(false)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === 'Escape') {
                                                                    e.currentTarget.blur();
                                                                }
                                                            }}
                                                            step="0.01"
                                                            className={`w-14 bg-transparent text-center font-mono focus:outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isModalRateUnlocked ? 'text-accent font-bold' : 'text-foreground'}`}
                                                            title={isModalRateUnlocked ? 'Editar Tasa' : 'Tasa Bloqueada'}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsModalRateUnlocked(!isModalRateUnlocked)}
                                                            className={`ml-1 pt-0.5 pb-0.5 px-0.5 rounded transition-colors outline-none ${isModalRateUnlocked ? 'text-accent hover:bg-accent/10' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}
                                                            title={isModalRateUnlocked ? 'Bloquear Tasa' : 'Desbloquear Tasa'}
                                                        >
                                                            {isModalRateUnlocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                                        </button>
                                                    </div>)
                                                </span>
                                            </span>
                                            <span className="font-mono">Bs. {new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(baseBsAmount)}</span>
                                        </div>
                                        <div className="flex justify-between items-center px-4 py-2 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/10">
                                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                <span className="shrink-0">Recargo</span>
                                                {/* Lock / unlock toggle */}
                                                <button
                                                    type="button"
                                                    title={surchargeUnlocked ? 'Bloquear porcentaje' : 'Editar porcentaje'}
                                                    onClick={() => setSurchargeUnlocked(u => !u)}
                                                    className={`p-0.5 rounded transition-colors shrink-0 ${surchargeUnlocked
                                                        ? 'text-amber-500 hover:text-amber-700'
                                                        : 'text-muted-foreground hover:text-amber-500'
                                                        }`}
                                                >
                                                    {surchargeUnlocked
                                                        ? <Unlock className="w-3 h-3" />
                                                        : <Lock className="w-3 h-3" />
                                                    }
                                                </button>
                                                {surchargeUnlocked ? (
                                                    <div className="flex items-center gap-0.5">
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            max={100}
                                                            step={1}
                                                            value={surchargePercent}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                if (val === '') {
                                                                    setSurchargePercent('');
                                                                    localStorage.setItem('beirutSurchargePercent', '');
                                                                } else {
                                                                    const v = Math.min(100, Math.max(0, parseFloat(val) || 0));
                                                                    setSurchargePercent(v);
                                                                    localStorage.setItem('beirutSurchargePercent', v.toString());
                                                                }
                                                            }}
                                                            className="w-12 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded px-1 py-0.5 text-xs font-mono font-bold text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                                                        />
                                                        <span className="text-xs font-bold">%</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs font-bold">({typeof surchargePercent === 'number' ? surchargePercent.toFixed(0) : 0}%)</span>
                                                )}
                                                <em className="text-[9px] not-italic opacity-70 ml-0.5">— no afecta deuda</em>
                                            </div>
                                            <span className="font-mono shrink-0">+ Bs. {new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(surchargeBs)}</span>
                                        </div>
                                        <div className="flex justify-between items-center px-4 py-3 bg-muted/20 text-foreground">
                                            <span className="font-bold">Total a Transferir (BDV)</span>
                                            <span className="font-mono font-black text-sm">Bs. {new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalACobrarBs)}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex justify-between items-center px-4 py-3 text-foreground bg-muted/20">
                                        <span className="font-bold text-xs">Total a Entregar (USD)</span>
                                        <span className="font-mono font-black text-sm">{formatCurrency(totalACobrarUsd)}</span>
                                    </div>
                                )}
                            </div>

                            {previewDistribution.length > 0 && (
                                <div className="bg-background rounded-lg border border-border/50 overflow-hidden">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-4 pt-2.5 pb-1.5">Distribución por Factura</p>
                                    <div className="divide-y divide-border/30">
                                        {previewDistribution.map(d => {
                                            const inv = (client.invoices || []).find(i => i.id === d.invoiceId);
                                            return (
                                                <div key={d.invoiceId} className="flex justify-between items-center px-4 py-1.5 text-xs">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${inv?.status === 'en mora' ? 'bg-rose-500' : 'bg-amber-400'}`} />
                                                        <span className="font-mono text-muted-foreground">{d.invoiceId}</span>
                                                        <span className={`text-[9px] uppercase font-bold ${inv?.status === 'en mora' ? 'text-rose-500' : 'text-amber-500'}`}>{inv?.status}</span>
                                                    </div>
                                                    <span className="font-mono font-semibold text-foreground">−{formatCurrency(d.amount)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-5 py-3 border-t border-border bg-background flex gap-2 shrink-0">
                    <button onClick={onClose} disabled={isProcessing} className="flex-1 h-10 rounded-xl text-sm font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isProcessing || saldoDeudaReal <= 0 || saldoDeudaReal > totalDebt}
                        className="flex-1 h-10 rounded-xl text-sm font-bold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                        {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</> : 'Confirmar Pago'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ClientMasterProfile — main client profile with 2-tab navigation
// ─────────────────────────────────────────────────────────────────────────────
export function ClientMasterProfile({ client, onClose }: ClientMasterProfileProps) {
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'facturas' | 'historial'>('facturas');
    const { registerPaymentOnInvoice, updateClient } = useClients();
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState({
        name: client?.name || '',
        rif: client?.rif || '',
        phone: client?.phone || '',
        email: client?.email || ''
    });
    const [isSaving, setIsSaving] = useState(false);

    // ── Sync editData whenever the active client changes ─────────────────────
    useEffect(() => {
        if (client) {
            setEditData({
                name: client.name || '',
                rif: client.rif || '',
                phone: client.phone || '',
                email: client.email || ''
            });
            setIsEditing(false); // always exit edit mode when switching clients
        }
    }, [client?.id]); // only re-run when the CLIENT ID changes, not on every re-render
    const [surchargePercent, setSurchargePercent] = useState<number | string>(() => {
        const s = localStorage.getItem('beirutSurchargePercent');
        return s !== null && s !== '' ? parseFloat(s) : 30;
    });

    const { parallelRate, rate: bcvRate } = useBCV();
    const [showInBs, setShowInBs] = useState<boolean>(false);
    
    // Replace hideBaseDebt with dual visibility states
    const [showBaseDebt, setShowBaseDebt] = useState<boolean>(client?.showBaseDebt ?? (localStorage.getItem('beirutShowBaseDebt') !== 'false'));
    const [showSurchargeDebt, setShowSurchargeDebt] = useState<boolean>(client?.showSurchargeDebt ?? (localStorage.getItem('beirutShowSurchargeDebt') !== 'false'));

    const [surchargeUnlocked, setSurchargeUnlocked] = useState(false);
    const [balanceOverrides, setBalanceOverrides] = useState<Record<string, number>>({});
    // IDs of invoices currently playing the exit animation
    const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
    // IDs already migrated (hidden from Facturas Activas)
    const [migratedIds, setMigratedIds] = useState<Set<string>>(new Set());

    // ── Observer: auto-migrate invoices when their balance hits 0 ──────────────
    useEffect(() => {
        if (!client?.invoices) return;
        const newlyPaid: string[] = [];
        for (const [invoiceId, balance] of Object.entries(balanceOverrides)) {
            if (balance <= 0 && !migratedIds.has(invoiceId)) {
                newlyPaid.push(invoiceId);
            }
        }
        if (newlyPaid.length === 0) return;

        // 1. Start exit animation
        setExitingIds(prev => new Set([...prev, ...newlyPaid]));

        // 2. After animation ends, mark as migrated and auto-switch tab if all paid
        const timer = setTimeout(() => {
            setExitingIds(prev => {
                const next = new Set(prev);
                newlyPaid.forEach(id => next.delete(id));
                return next;
            });
            setMigratedIds(prev => new Set([...prev, ...newlyPaid]));

            // Auto-switch to historial if no active invoices remain
            const remaining = (client.invoices || []).filter(
                (inv: Invoice) => (balanceOverrides[inv.id] ?? inv.balance) > 0 && !newlyPaid.includes(inv.id)
            );
            if (remaining.length === 0) {
                setTimeout(() => setActiveTab('historial'), 150);
            }
        }, 460);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [balanceOverrides]);

    const handlePaymentsConfirmed = useCallback((distributions: { invoiceId: string; amount: number }[]) => {
        setBalanceOverrides(prev => {
            const next = { ...prev };
            for (const { invoiceId, amount } of distributions) {
                const base = next[invoiceId] !== undefined ? next[invoiceId] : (client?.invoices?.find((i: Invoice) => i.id === invoiceId)?.balance ?? 0);
                next[invoiceId] = Math.max(0, base - amount);
            }
            return next;
        });
    }, [client]);

    if (!client) return null;

    const invoicesWithOverrides = (client.invoices || []).map((inv: Invoice) => ({
        ...inv,
        balance: balanceOverrides[inv.id] !== undefined ? balanceOverrides[inv.id] : inv.balance,
    }));

    const totalDebt = invoicesWithOverrides.reduce((sum: number, inv: Invoice) => sum + inv.balance, 0);
    const globalStatus = invoicesWithOverrides.every((i: Invoice) => i.balance <= 0) ? 'pagado'
        : invoicesWithOverrides.some((i: Invoice) => i.status === 'en mora' && i.balance > 0) ? 'en mora'
            : 'pendiente';
    const activeInvCount = invoicesWithOverrides.filter((i: Invoice) => i.balance > 0).length;

    // Facturas Activas: only show balance > 0 and not yet migrated (but keep exiting ones for animation)
    const sortedInvoices = [...invoicesWithOverrides]
        .filter((inv: Invoice) => inv.balance > 0 || exitingIds.has(inv.id))
        .filter((inv: Invoice) => !migratedIds.has(inv.id))
        .sort((a: Invoice, b: Invoice) => {
            const statusA = a.balance <= 0 ? 'pagado' : a.status;
            const statusB = b.balance <= 0 ? 'pagado' : b.status;
            const order: Record<string, number> = { 'en mora': 0, 'pendiente': 1, 'pagado': 2 };
            if (order[statusA] !== order[statusB]) return order[statusA] - order[statusB];
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        });

    const clientWithOverrides: Client = { ...client, invoices: invoicesWithOverrides };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm animate-fade-in"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-border animate-scale-in">

                {/* A. Header */}
                <div className={`px-6 pt-5 pb-4 relative overflow-hidden transition-colors duration-500 shrink-0
                    ${globalStatus === 'en mora' ? 'bg-rose-50/60 dark:bg-rose-950/20' : globalStatus === 'pagado' ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : 'bg-muted/40'}
                `}>
                    <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full bg-background/60 text-muted-foreground hover:bg-background hover:text-foreground transition-colors z-10">
                        <X className="w-4 h-4" />
                    </button>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pr-8">
                        <div className="flex-1 w-full sm:w-auto">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider
                                    ${globalStatus === 'en mora' ? 'bg-rose-500 text-white' : globalStatus === 'pagado' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}
                                `}>
                                    {globalStatus === 'en mora' ? 'Riesgo / En Mora' : globalStatus === 'pagado' ? 'Solvente / Al Día' : 'Con Saldo Activo'}
                                </span>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        placeholder="RIF / Cédula"
                                        value={editData.rif}
                                        onChange={e => setEditData({ ...editData, rif: e.target.value })}
                                        className="font-mono text-xs font-bold bg-background/90 px-2 py-0.5 rounded-md border border-accent/50 text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                                    />
                                ) : (
                                    <span className="font-mono text-xs font-bold bg-background/70 px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground">{client.rif}</span>
                                )}
                            </div>
                            
                            <div className="flex items-center gap-3">
                                {isEditing ? (
                                    <input
                                        type="text"
                                        placeholder="Nombre del cliente"
                                        value={editData.name}
                                        onChange={e => setEditData({ ...editData, name: e.target.value })}
                                        className="text-xl font-bold tracking-tight text-foreground bg-background/90 px-2.5 py-1 rounded-md border border-accent/50 w-full max-w-[300px] focus:outline-none focus:ring-1 focus:ring-accent mb-1"
                                        autoFocus
                                    />
                                ) : (
                                    <h2 className="text-xl font-bold tracking-tight text-foreground">{client.name}</h2>
                                )}
                                
                                {!isEditing ? (
                                    <button 
                                        onClick={() => setIsEditing(true)}
                                        className="p-1.5 rounded-full text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors shrink-0"
                                        title="Editar datos del cliente"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                ) : (
                                    <button 
                                        onClick={async () => {
                                            setIsSaving(true);
                                            try {
                                                await updateClient({ id: client.id, ...editData });
                                                setIsEditing(false);
                                                onClose();
                                            } catch (error) {
                                                console.error('Failed to update client:', error);
                                            } finally {
                                                setIsSaving(false);
                                            }
                                        }}
                                        disabled={isSaving}
                                        className="p-1.5 rounded-full bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors shrink-0 disabled:opacity-50"
                                        title="Guardar cambios"
                                    >
                                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    </button>
                                )}
                            </div>
                            
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                                {isEditing ? (
                                    <>
                                        <input
                                            type="tel"
                                            placeholder="Teléfono"
                                            value={editData.phone}
                                            onChange={e => setEditData({ ...editData, phone: e.target.value })}
                                            className="bg-background/90 px-2 py-0.5 rounded-md border border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent w-32"
                                        />
                                        <input
                                            type="email"
                                            placeholder="Correo electrónico"
                                            value={editData.email}
                                            onChange={e => setEditData({ ...editData, email: e.target.value })}
                                            className="bg-background/90 px-2 py-0.5 rounded-md border border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent w-48"
                                        />
                                    </>
                                ) : (
                                    <>
                                        <span>{client.phone}</span>
                                        <span>{client.email}</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="bg-background/80 backdrop-blur border border-border/50 px-4 py-3 rounded-xl shadow-sm text-right shrink-0 min-w-fit sm:min-w-[13rem] space-y-1 flex flex-col justify-center">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground flex items-center justify-end gap-1.5 flex-nowrap">
                                Deuda Acumulada
                                <button
                                    onClick={() => setShowInBs(!showInBs)}
                                    className={`p-1 rounded-md transition-colors shrink-0 ${showInBs ? 'text-emerald-500 bg-emerald-500/10' : 'text-muted-foreground hover:bg-muted'}`}
                                    title={showInBs ? 'Mostrando en Bolívares' : 'Mostrar en Bolívares'}
                                >
                                    <DollarSign className="w-3.5 h-3.5" />
                                </button>
                                <div className="flex items-center bg-background border border-border/50 rounded-lg ml-0.5 overflow-hidden shadow-sm shadow-black/5 dark:shadow-white/5 shrink-0">
                                    <button
                                        onClick={() => {
                                            const n = !showBaseDebt;
                                            setShowBaseDebt(n);
                                            updateClient({ id: client.id, showBaseDebt: n });
                                        }}
                                        className={`flex items-center justify-center w-7 h-7 transition-colors focus:outline-none shrink-0 border-none ${!showBaseDebt ? 'text-muted-foreground/40 hover:bg-muted hover:text-muted-foreground/70' : 'text-foreground hover:bg-muted'}`}
                                        title={showBaseDebt ? 'Ocultar Deuda Base (Tasa Paralela)' : 'Mostrar Deuda Base (Tasa Paralela)'}
                                    >
                                        {!showBaseDebt ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                    <div className="w-[1px] h-4 bg-border/50 shrink-0"></div>
                                    <button
                                        onClick={() => {
                                            const n = !showSurchargeDebt;
                                            setShowSurchargeDebt(n);
                                            updateClient({ id: client.id, showSurchargeDebt: n });
                                        }}
                                        className={`flex items-center justify-center w-7 h-7 transition-colors focus:outline-none shrink-0 border-none ${!showSurchargeDebt ? 'text-amber-500/40 hover:bg-muted hover:text-amber-500/70' : 'text-amber-500 hover:bg-muted'}`}
                                        title={showSurchargeDebt ? 'Ocultar Total BCV' : 'Mostrar Total BCV'}
                                    >
                                        {!showSurchargeDebt ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            </p>

                            {/* Tasa badges — Paralela (negro) + BCV (ámbar) */}
                            <div className="flex items-center justify-end gap-1.5 mb-1">
                                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-bold font-mono transition-opacity ${
                                    showBaseDebt
                                        ? 'bg-background border-border/60 text-foreground'
                                        : 'bg-background border-border/30 text-muted-foreground/40'
                                }`}>
                                    <span className="text-[8px] uppercase tracking-wide font-bold text-muted-foreground">Para</span>
                                    {parallelRate.toFixed(2)}
                                </div>
                                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-bold font-mono transition-opacity ${
                                    showSurchargeDebt
                                        ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-300/60 dark:border-amber-700/40 text-amber-700 dark:text-amber-400'
                                        : 'bg-background border-border/30 text-muted-foreground/40'
                                }`}>
                                    <span className="text-[8px] uppercase tracking-wide font-bold opacity-70">BCV</span>
                                    {bcvRate.toFixed(2)}
                                </div>
                            </div>

                            <p className={`text-2xl font-mono font-black tracking-tighter leading-none mb-1 ${!showBaseDebt ? 'text-muted-foreground/30' : 'text-foreground'}`}>
                                {showBaseDebt 
                                    ? (showInBs ? `Bs. ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalDebt * parallelRate)}` : formatCurrency(totalDebt))
                                    : '****'
                                }
                            </p>
                            <p className="text-[10px] font-semibold text-muted-foreground mb-3">{activeInvCount} {activeInvCount === 1 ? 'Nota Activa' : 'Notas Activas'}</p>
                            
                            {totalDebt > 0 && (
                                <div className="pt-3 border-t border-border/40">
                                    <div className="flex items-center justify-end gap-1 mb-1">
                                        {surchargeUnlocked && (
                                            <>
                                                <input
                                                    type="number" min={0} max={200} step={1}
                                                    value={surchargePercent}
                                                    disabled={!surchargeUnlocked}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        if (val === '') {
                                                            setSurchargePercent('');
                                                            localStorage.setItem('beirutSurchargePercent', '0');
                                                            return;
                                                        }
                                                        const num = Math.max(0, parseFloat(val) || 0);
                                                        setSurchargePercent(num);
                                                        localStorage.setItem('beirutSurchargePercent', num.toString());
                                                    }}
                                                    className={`w-12 bg-transparent text-right font-mono font-bold text-xs focus:outline-none ${surchargeUnlocked ? 'border-b border-muted-foreground' : ''}`}
                                                />
                                                <span className="text-xs font-bold mr-1">%</span>
                                            </>
                                        )}
                                        <button
                                            onClick={() => setSurchargeUnlocked(u => !u)}
                                            className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors"
                                            title={surchargeUnlocked ? 'Bloquear y Ocultar Porcentaje' : 'Editar Porcentaje'}
                                        >
                                            {surchargeUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                    {/* Cifra ámbar: usa tasa BCV oficial */}
                                    <p className={`text-2xl font-mono font-black tracking-tight ${!showSurchargeDebt ? 'text-muted-foreground/30' : 'text-amber-500'}`}>
                                        {showSurchargeDebt
                                            ? (showInBs 
                                                ? `Bs. ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalDebt * (1 + (parseFloat(String(surchargePercent)) || 0) / 100) * bcvRate)}` 
                                                : formatCurrency(totalDebt * (1 + (parseFloat(String(surchargePercent)) || 0) / 100)))
                                            : '****'
                                        }
                                    </p>
                                    {/* Bs equivalente con tasa BCV cuando showInBs está activo */}
                                    {showInBs && showSurchargeDebt && (
                                        <p className="text-[9px] text-amber-500/70 font-mono mt-0.5">
                                            Tasa BCV {bcvRate.toFixed(2)} Bs/USD
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* B. Tab bar */}
                <div className="flex border-b border-border bg-background shrink-0">
                    <button
                        onClick={() => setActiveTab('facturas')}
                        className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 border-b-2 ${activeTab === 'facturas'
                            ? 'border-accent text-accent'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        <FileText className="w-3.5 h-3.5" />
                        Facturas Activas
                        {activeInvCount > 0 && (
                            <span className={`text-[9px] font-black px-1.5 rounded-full ${activeTab === 'facturas' ? 'bg-accent text-white' : 'bg-muted text-muted-foreground'}`}>
                                {activeInvCount}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('historial')}
                        className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 border-b-2 ${activeTab === 'historial'
                            ? 'border-accent text-accent'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        <History className="w-3.5 h-3.5" />
                        Historial de Pagos
                    </button>
                </div>

                {/* C. Tab body — scrollable */}
                <div className="flex-1 overflow-y-auto px-6 py-5 bg-card/50">
                    {activeTab === 'facturas' && (
                        <div className="space-y-4">
                            <div className="flex items-center">
                                <h3 className="text-base font-bold text-foreground">Expediente de Facturas</h3>
                            </div>

                            {/* All-paid banner */}
                            {sortedInvoices.length === 0 && activeInvCount === 0 && invoicesWithOverrides.length > 0 && (
                                <div className="animate-slide-down flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3.5">
                                    <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">¡Todas las deudas saldadas! 🎉</p>
                                        <p className="text-xs text-emerald-600/80 mt-0.5">Revisa el historial para ver el detalle.</p>
                                    </div>
                                </div>
                            )}

                            {sortedInvoices.length > 0 ? (
                                <div className="space-y-2">
                                    {sortedInvoices.map(inv => (
                                        <div
                                            key={inv.id}
                                            className={exitingIds.has(inv.id) ? 'animate-invoice-exit' : ''}
                                        >
                                            <InvoiceRow invoice={inv} onSelect={(i) => setSelectedInvoiceId(i.id)} showBaseDebt={showBaseDebt} showSurchargeDebt={showSurchargeDebt} />
                                        </div>
                                    ))}
                                </div>
                            ) : activeInvCount > 0 ? (
                                // Still have active invoices but list is empty (shouldn't happen)
                                null
                            ) : invoicesWithOverrides.length === 0 ? (
                                <div className="py-12 text-center border-2 border-dashed border-border rounded-2xl">
                                    <FileText className="w-10 h-10 text-muted-foreground/25 mx-auto mb-3" />
                                    <p className="font-semibold text-foreground text-sm">Sin créditos registrados</p>
                                    <p className="text-xs text-muted-foreground mt-1 max-w-[220px] mx-auto">Este cliente no tiene notas de entrega pendientes.</p>
                                </div>
                            ) : null}
                        </div>
                    )}

                    {activeTab === 'historial' && (
                        <PaymentHistoryTab
                            clientId={client.id}
                            clientName={client.name}
                            clientPhone={client.phone}
                            invoices={invoicesWithOverrides}
                            showBaseDebt={showBaseDebt}
                            showSurchargeDebt={showSurchargeDebt}
                        />
                    )}
                </div>

                {/* D. Footer — fixed actions */}
                <div className="px-6 py-4 border-t border-border bg-background flex items-center justify-between gap-3 shrink-0">
                    <button onClick={onClose} className="h-9 px-4 rounded-full font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all text-sm">
                        Cerrar Ficha
                    </button>
                    <button
                        onClick={() => setShowPaymentModal(true)}
                        disabled={totalDebt <= 0}
                        className="h-10 px-6 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold hover:shadow-lg hover:shadow-emerald-500/20 active:scale-95 transition-all outline-none ring-2 ring-transparent focus:ring-emerald-500/30 flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                        Registrar Pago
                    </button>
                </div>

                {/* Invoice detail sub-modal */}
                {(() => {
                    if (!selectedInvoiceId) return null;
                    const invoiceData = invoicesWithOverrides.find(i => i.id === selectedInvoiceId);
                    if (!invoiceData) {
                        // Automatically close if the invoice disappeared (e.g. after successful delete)
                        setTimeout(() => setSelectedInvoiceId(null), 0);
                        return null;
                    }
                    return (
                        <InvoiceDetailModal
                            invoice={invoiceData}
                            onClose={() => setSelectedInvoiceId(null)}
                            showBaseDebt={showBaseDebt}
                            showSurchargeDebt={showSurchargeDebt}
                            surchargePercent={typeof surchargePercent === 'number' ? surchargePercent : parseFloat(surchargePercent as string) || 0}
                            bcvRate={bcvRate}
                            clientId={client.id}
                        />
                    );
                })()}
            </div>

            {/* Global payment modal */}
            {showPaymentModal && (
                <GlobalPaymentModal
                    client={clientWithOverrides}
                    totalDebt={totalDebt}
                    onClose={() => setShowPaymentModal(false)}
                    onPaymentsConfirmed={(distributions) => {
                        handlePaymentsConfirmed(distributions);
                        setShowPaymentModal(false);
                        // Note: tab switch is now handled by the useEffect observer
                    }}
                    registerPayment={registerPaymentOnInvoice}
                />
            )}
        </div>
    );
}
