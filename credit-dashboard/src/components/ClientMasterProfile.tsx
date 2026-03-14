import {
    X, FileText, AlertCircle, Eye, CheckCircle2,
    Loader2, RefreshCw, ChevronDown, ChevronUp, Lock, Unlock, EyeOff, Edit2, Save, Trash2, DollarSign, CheckCircle
} from 'lucide-react';
import { useUpdateInvoiceProducts, useDeleteInvoice } from '../logic/useClients';
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Client, Invoice } from '../logic/ClientContext';
import { useClients } from '../logic/ClientContext';
import { useBCV } from '../hooks/BCVContext';

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
    clientId,
    onInvoiceUpdated
}: {
    invoice: Invoice;
    onClose: () => void;
    showBaseDebt: boolean;
    showSurchargeDebt: boolean;
    surchargePercent: number;
    clientId: string;
    onInvoiceUpdated?: (invoiceId: string, delta: number, newTotal: number) => void;
}) {
    // Clone products into local editable state (strings allow empty field while typing)
    const [editedProducts, setEditedProducts] = useState<{ description: string; quantity: string; unit_price: string }[]>(() =>
        (invoice.products || []).map((p: any) => ({
            description: p.description,
            quantity: String(Number(p.quantity)),
            unit_price: String(Number(p.unit_price !== undefined ? p.unit_price : p.unitPrice)),
        }))
    );
    const [currentSavedTotal, setCurrentSavedTotal] = useState(invoice.totalAmount || 0);
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

    const updateProducts = useUpdateInvoiceProducts();
    const deleteInvoice = useDeleteInvoice();

    // === LÓGICA DE CÁLCULO V4 (Math.round en cada paso) ===
    const factor = 1 + surchargePercent / 100;

    // Constantes previamente omitidas (V3 a V4)
    const hasOriginalIva = true; // El IVA del 16% siempre aplica por ahora
    const bcvMode = !showBaseDebt && showSurchargeDebt; // Ocular paralelo, mostrar BCV
    
    // Subtotal: redondear fila por fila antes de acumular
    const subtotal = editedProducts.reduce((acc, p) => 
        acc + Math.round((parseFloat(p.quantity) || 0) * (parseFloat(p.unit_price) || 0) * 100) / 100, 
    0);
    
    const iva = hasOriginalIva ? Math.round(subtotal * 0.16 * 100) / 100 : 0;
    const granTotal = Math.round((subtotal + iva) * 100) / 100;


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

            // ACCIÓN 1 — Actualizar la Factura: enviar productos al servidor
            // El servidor recalcula subtotal, IVA 16%, total USD y balance
            const savedData = await updateProducts.mutateAsync({
                invoiceId: invoice.id,
                clientId,
                products: productsToSave,
                apply_iva: hasOriginalIva,
            });

            // ACCIÓN 2 — Actualizar la Ficha del Cliente:
            // ANTES: total_anterior = currentSavedTotal (capturado antes de este guardado)
            // DESPUÉS: usar el total_amount oficial del servidor para evitar deriva de redondeo
            const total_anterior = currentSavedTotal;
            const total_nuevo = savedData?.total_amount != null
                ? Number(savedData.total_amount)
                : granTotal; // fallback al cálculo local
            const delta = total_nuevo - total_anterior;

            // Aplica delta al saldo visible del cliente (suma si positivo, resta si negativo)
            if (onInvoiceUpdated) {
                onInvoiceUpdated(invoice.id, delta, total_nuevo);
            }
            // Actualizar el total guardado localmente para la próxima edición
            setCurrentSavedTotal(total_nuevo);

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
        }
    };

    // Estado para ocultar/mostrar BCV en el resumen
    const [showLocalBCV, setShowLocalBCV] = useState(false);

    // Formateadores auxiliares V4 locales para inputs y totales
    const formatNumber = (num: number) => (Math.round(num * 100) / 100).toFixed(2);

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 animate-fade-in"
             onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            
            {/* Modal — 2 columnas */}
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[700px] max-h-[88vh] flex flex-col overflow-hidden animate-scale-in">

                {/* ZONA 1: Header — shrink-0 */}
                <div className="shrink-0 px-5 pt-4 pb-3 border-b border-gray-100">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <span className="text-base font-bold text-gray-900 tracking-tight">
                                {invoice.id}
                            </span>
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider
                                ${invoice.status === 'en mora' ? 'bg-red-100 text-red-700 animate-pulse' : 
                                  invoice.status === 'pagado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100/60 text-amber-700'}`}>
                                {invoice.status}
                            </span>
                            <span className="text-xs font-medium text-gray-400">
                                {editedProducts.length} producto{editedProducts.length !== 1 ? 's' : ''}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                            {invoice.status !== 'pagado' && (
                                <button onClick={() => { setDeleteError(null); setShowDeleteConfirm(true); }}
                                        className="text-red-400 hover:text-red-600 p-1 rounded-md hover:bg-red-50 transition-colors tooltip text-sm"
                                        title="Eliminar Factura">
                                    <Trash2 className="w-[18px] h-[18px]" />
                                </button>
                            )}
                            <button onClick={onClose}
                                    className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition-colors text-sm"
                                    title="Cerrar">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    
                    <p className="text-[11px] font-medium text-gray-400 mt-1">
                        Emisión: {formatDate(invoice.issueDate)} &nbsp;·&nbsp; 
                        Vence: <span className={new Date(invoice.dueDate) < new Date() && invoice.status !== 'pagado' ? 'text-red-500 font-bold' : 'text-gray-500 font-bold'}>{formatDate(invoice.dueDate)}</span>
                    </p>
                </div>

                {/* ZONA 2: Body 2 columnas — flex-1 min-h-0 */}
                <div className="flex flex-col sm:flex-row flex-1 min-h-0">

                    {/* COLUMNA IZQUIERDA — productos con scroll */}
                    <div className="flex-1 flex flex-col min-h-0 sm:border-r border-gray-100">

                        {/* Header columnas — fijo, no scrollea */}
                        <div className="shrink-0 grid grid-cols-[minmax(120px,1fr)_40px_70px_70px_24px] gap-2 px-4 py-2 bg-gray-50/50 border-b border-gray-100">
                            <span className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">Producto</span>
                            <span className="text-[10px] text-gray-400 font-bold tracking-widest uppercase text-center">Cant</span>
                            <span className="text-[10px] text-gray-400 font-bold tracking-widest uppercase text-right">Precio</span>
                            <span className="text-[10px] text-gray-400 font-bold tracking-widest uppercase text-right">Total</span>
                            <span /> {/* espacio para botón X */}
                        </div>

                        {/* Filas de productos — ÚNICA zona con scroll */}
                        <div className="flex-1 overflow-y-auto min-h-0 px-4 scrollbar-thin">
                            {editedProducts.map((p, i) => (
                                <div key={i} className="group grid grid-cols-[minmax(120px,1fr)_40px_70px_70px_24px] gap-2 py-2.5 border-b border-gray-50 items-center">

                                    {/* Nombre truncado */}
                                    <span className="text-[12px] font-semibold text-gray-800 uppercase tracking-wide truncate" title={p.description}>
                                        {p.description}
                                    </span>

                                    {/* Cantidad — input */}
                                    <div className="px-1 text-center">
                                       <input
                                            type="number" min={0} step={1} value={p.quantity}
                                            readOnly={bcvMode}
                                            onFocus={e => !bcvMode && e.target.select()}
                                            onChange={e => !bcvMode && updateField(i, 'quantity', e.target.value)}
                                            className={`w-full text-center bg-transparent font-bold text-gray-600 rounded py-0.5 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${bcvMode ? 'cursor-default opacity-80' : 'hover:bg-blue-50 focus:outline-none focus:bg-blue-50 cursor-pointer focus:cursor-text text-[13px]'}`}
                                        />
                                    </div>

                                    {/* Precio — input */}
                                    <div className="px-1 text-right">
                                        {showBaseDebt ? (
                                            <input
                                                type="text" 
                                                value={bcvMode ? "" : p.unit_price.toString().replace('.', ',')} // Display comma
                                                onFocus={e => e.target.select()}
                                                onChange={e => {
                                                    const val = e.target.value.replace(',', '.');
                                                    if (!isNaN(Number(val))) updateField(i, 'unit_price', val);
                                                }}
                                                className="w-full text-right bg-transparent text-indigo-400 font-bold hover:text-indigo-600 rounded py-0.5 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none hover:bg-blue-50 focus:outline-none focus:bg-blue-50 cursor-pointer focus:cursor-text text-[13px]"
                                            />
                                        ) : bcvMode ? (
                                            <span className="text-amber-500 font-bold text-[13px]">
                                                {formatCurrency((parseFloat(p.unit_price) || 0) * factor)}
                                            </span>
                                        ) : <span className="text-gray-300 font-bold text-[13px]">****</span>}
                                    </div>

                                    {/* Total fila */}
                                    <span className="text-[13px] font-bold text-gray-800 text-right pr-1">
                                        {(() => {
                                            const q = parseFloat(p.quantity) || 0;
                                            const u = parseFloat(p.unit_price) || 0;
                                            const base = Math.round(q * u * 100) / 100;
                                            
                                            if (showBaseDebt) return `$${formatNumber(base)}`;
                                            if (bcvMode) return <span className="text-amber-500 font-bold">{formatCurrency((q * u) * factor)}</span>;
                                            return <span className="text-gray-300">****</span>;
                                        })()}
                                    </span>

                                    {/* Botón eliminar — visible hover */}
                                    <div className="flex justify-center">
                                       {!bcvMode && invoice.status !== 'pagado' && (
                                            <button
                                                onClick={() => removeProduct(i)}
                                                title="Eliminar producto"
                                                className="opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-500 text-xs transition-opacity flex items-center justify-center p-1 rounded hover:bg-red-50">
                                                <X className="w-3.5 h-3.5" strokeWidth={3} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {editedProducts.length === 0 && (
                                <div className="flex items-center justify-center h-32 text-[13px] font-medium text-gray-400">
                                    Sin productos en este desglose
                                </div>
                            )}
                            
                            {saveSuccess && (
                                <div className="mt-4 flex justify-center w-full">
                                    <span className="bg-emerald-50 text-emerald-600 text-[11px] font-bold px-3 py-1 rounded-full animate-fade-in flex items-center gap-1.5">
                                        <CheckCircle2 className="w-3 h-3" /> GUARDADO OK
                                    </span>
                                </div>
                            )}
                        </div>

                    </div>

                    {/* COLUMNA DERECHA — resumen siempre visible */}
                    <div className="w-full sm:w-[240px] shrink-0 flex flex-col justify-between p-5 bg-white">
                        
                        <div>
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-4">
                                Resumen
                            </p>

                            <div className="flex flex-col gap-2 mb-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-[12px] font-medium text-gray-500">Subtotal</span>
                                    <span className="text-[13px] font-semibold text-gray-600">
                                        {showBaseDebt ? `$${formatNumber(subtotal)}` : bcvMode ? <span className="text-amber-500">{formatCurrency(subtotal * factor)}</span> : '****'}
                                    </span>
                                </div>
                                {hasOriginalIva && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-[12px] font-bold text-amber-500/90 tracking-wide">IVA 16%</span>
                                        <span className="text-[13px] font-bold text-amber-600">
                                            {showBaseDebt ? `$${formatNumber(iva)}` : bcvMode ? <span className="text-amber-500">{formatCurrency(iva * factor)}</span> : '****'}
                                        </span>
                                    </div>
                                )}
                                <div className="border-t border-gray-100 pt-3 mt-1 flex justify-between items-end">
                                    <span className="text-[11px] font-bold text-gray-800 uppercase tracking-widest pb-0.5">
                                        Total
                                    </span>
                                    <span className="text-[20px] font-black text-gray-900 leading-none tracking-tight">
                                        {showBaseDebt ? `$${formatNumber(granTotal)}` : bcvMode ? <span className="text-amber-500 tracking-tight leading-none">{formatCurrency(granTotal * factor)}</span> : '****'}
                                    </span>
                                </div>
                                
                                {invoice.balance === 0 && (
                                    <div className="mt-2 border-t border-gray-100 pt-2 flex justify-between items-end">
                                        <span className="text-[11px] font-bold text-gray-800 uppercase tracking-widest pb-0.5">ESTADO</span>
                                        <span className="text-base font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                                            <CheckCircle2 className="w-4 h-4" /> Saldado
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* BCV colapsable V4 */}
                            {invoice.balance > 0 && showBaseDebt && showSurchargeDebt && (
                                <div className="bg-[#fffdf5] border border-amber-100/60 rounded-xl p-3 mb-4 shadow-sm">
                                    <div className="flex justify-between items-center mb-1.5 cursor-pointer select-none" onClick={() => setShowLocalBCV(!showLocalBCV)}>
                                        <span className="text-[10px] text-amber-600 font-bold uppercase tracking-widest">
                                            Total BCV
                                        </span>
                                        <span className="text-[10px] text-amber-500 font-black">
                                            {showLocalBCV ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                        </span>
                                    </div>
                                    {showLocalBCV && (
                                        <div className="animate-fade-in">
                                            <p className="text-[9px] font-semibold text-amber-500/80 mb-1.5">
                                                Al Cambio Tasa BCV
                                            </p>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[20px] font-black text-amber-500 leading-none">
                                                    <span className="text-[14px] mr-1">$</span>
                                                    {formatNumber(granTotal * factor)}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Mensaje info V4 */}
                            {invoice.status !== 'pagado' && (
                                <div className="bg-[#f6f8fa] border border-[#e5e9f0] rounded-xl p-3 flex flex-col items-center text-center gap-1.5">
                                    <div className="w-6 h-6 rounded-full bg-emerald-100/50 text-emerald-600 flex items-center justify-center">
                                       <span className="font-bold text-xs">$</span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 font-medium leading-tight">
                                        Para registrar un abono usar el botón inferior en pantalla completa.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Botones */}
                        <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-gray-100">
                            <div className="flex gap-2 w-full">
                                <button onClick={onClose}
                                        className="flex-1 h-10 rounded-xl text-[13px] font-bold text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-700 transition-colors">
                                    Cerrar
                                </button>
                                {!bcvMode && invoice.status !== 'pagado' && (
                                    <button onClick={() => setShowConfirm(true)} disabled={isSaving}
                                            className="flex-1 h-10 rounded-xl text-[13px] font-bold bg-[#A594F9] text-white hover:bg-[#8e7be8] hover:shadow-md transition-all flex items-center justify-center gap-1.5">
                                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Guardar'}
                                    </button>
                                )}
                            </div>
                        </div>

                    </div>
                </div>

                {/* Dialog Confirmar Guardado */}
                {showConfirm && createPortal(
                    <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                        <div className="bg-white shadow-2xl rounded-2xl p-6 max-w-[320px] w-full animate-scale-in flex flex-col items-center text-center">
                            <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mb-4">
                                <Save className="w-6 h-6" />
                            </div>
                            <h3 className="font-bold text-lg mb-2 text-gray-900">Confirmar Guardado</h3>
                            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                                Las cantidades y precios se actualizarán en la base de datos con los nuevos montos redondeados.
                            </p>
                            <div className="flex gap-3 w-full">
                                <button onClick={() => setShowConfirm(false)} disabled={isSaving} className="flex-1 h-10 rounded-xl font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm">
                                    Cancelar
                                </button>
                                <button onClick={handleSave} disabled={isSaving} className="flex-1 h-10 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 text-sm flex items-center justify-center gap-2">
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Dialog Confirmar Borrado */}
                {showDeleteConfirm && createPortal(
                    <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                        <div className="bg-white shadow-2xl rounded-2xl p-6 max-w-[320px] w-full animate-scale-in flex flex-col items-center text-center">
                            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-4">
                                <Trash2 className="w-6 h-6" />
                            </div>
                            <h3 className="font-bold text-lg mb-1.5 text-gray-900">Eliminar Factura</h3>
                            <p className="text-sm font-mono font-bold text-red-500 mb-4 bg-red-50 px-3 py-1 rounded-lg">{invoice.id}</p>
                            
                            {deleteError ? (
                                <div className="mb-6 p-3 rounded-lg bg-red-50 w-full">
                                    <p className="text-xs font-semibold text-red-600">{deleteError}</p>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                                    Esta acción es irreversible y eliminará el documento físico original.
                                </p>
                            )}

                            <div className="flex gap-3 w-full">
                                <button onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting} className="flex-1 h-10 rounded-xl font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm">
                                    Cancelar
                                </button>
                                <button onClick={handleDelete} disabled={isDeleting} className="flex-1 h-10 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 text-sm flex items-center justify-center gap-2">
                                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Eliminar'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        </div>,
        document.body
    );
}
// GlobalPaymentModal — spec v2 (diseño plano, ojitos duales BDV)
// ─────────────────────────────────────────────────────────────────────────────
interface GlobalPaymentModalProps {
    client: Client;
    totalDebt: number;
    onClose: () => void;
    onPaymentsConfirmed: (distributions: { invoiceId: string; amount: number }[]) => void;
    registerPayment: (clientId: string, invoiceId: string, amountUsd: number) => Promise<void>;
}

function GlobalPaymentModal({ client, totalDebt, onClose, onPaymentsConfirmed, registerPayment }: GlobalPaymentModalProps) {
    // ── Config del sistema ──────────────────────────────────────────────────
    const { rate: TASA_BCV, isLoading: isLoadingRate, refresh: refreshRate } = useBCV();
    const recargoBCV = (() => {
        const s = localStorage.getItem('beirutSurchargePercent');
        return s !== null && s !== '' ? parseFloat(s) / 100 : 0.30;
    })();

    // ── Estado UI ──────────────────────────────────────────────────────────
    const [method, setMethod] = useState<'usd' | 'ves'>('usd');
    const [amount, setAmount] = useState('');
    const [showUsdBruto, setShowUsdBruto] = useState(true);   // ojito 1
    const [showUsdReal, setShowUsdReal] = useState(true);     // ojito 2
    const [isProcessing, setIsProcessing] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const num = parseFloat(amount) || 0;

    // ── Cálculo según método ────────────────────────────────────────────────
    const usdBruto   = method === 'ves' ? num / TASA_BCV : 0;
    // El sistema configura "50%" pero significa descontarle -50% al precio BCV bruto
    const usdReal    = method === 'ves' ? usdBruto * (1 - recargoBCV) : 0;
    const descuento  = method === 'ves'
        ? Math.min(usdReal, totalDebt)
        : Math.min(num, totalDebt);
    const nuevaDeuda = Math.max(0, totalDebt - descuento);

    const notasActivas = (client.invoices || []).filter(i => i.balance > 0).length;
    const initials = (client.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    // ── Distribución y confirmación ────────────────────────────────────────
    function buildDistribution(amountUsd: number) {
        const active = (client.invoices || [])
            .filter((i: Invoice) => i.balance > 0)
            .sort((a: Invoice, b: Invoice) => {
                const ord: Record<string, number> = { 'en mora': 0, 'pendiente': 1 };
                if ((ord[a.status] ?? 2) !== (ord[b.status] ?? 2)) return (ord[a.status] ?? 2) - (ord[b.status] ?? 2);
                return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            });
        const dist: { invoiceId: string; amount: number }[] = [];
        let remaining = amountUsd;
        for (const inv of active) {
            if (remaining <= 0) break;
            const applied = Math.min(remaining, inv.balance);
            dist.push({ invoiceId: inv.id, amount: parseFloat(applied.toFixed(2)) });
            remaining -= applied;
        }
        return dist;
    }

    const handleConfirm = async () => {
        if (descuento <= 0) return;
        setIsProcessing(true);
        setError(null);
        const dist = buildDistribution(descuento);
        try {
            for (const { invoiceId, amount: amt } of dist) {
                await registerPayment(client.id, invoiceId, amt);
            }
            onPaymentsConfirmed(dist);
            const msg = method === 'usd'
                ? `$${descuento.toFixed(2)} via Efectivo/Zelle registrado`
                : `Bs ${num.toFixed(2)} = $${usdReal.toFixed(2)} USD real (descuento -${(recargoBCV * 100).toFixed(0)}%) registrado via BDV`;
            setToast(msg);
            setAmount('');
            setTimeout(() => { setToast(null); onClose(); }, 2800);
        } catch {
            setError('No se pudo registrar el pago. Verifica tu conexión.');
        } finally {
            setIsProcessing(false);
        }
    };

    const switchMethod = (m: 'usd' | 'ves') => { setMethod(m); setAmount(''); setError(null); };

    // ── Colores del spec ────────────────────────────────────────────────────
    const C = {
        green:       '#1D9E75',
        greenBg:     '#E1F5EE',
        greenText:   '#085041',
        red:         '#A32D2D',
        redBg:       '#FCEBEB',
        orange:      '#854F0B',
        orangeBg:    '#FAEEDA',
        orangeBorder:'#EF9F27',
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 animate-fade-in"
            onClick={e => { if (e.target === e.currentTarget && !isProcessing) onClose(); }}
        >
            <div style={{ background: '#fff', border: '0.5px solid #D1D5DB', borderRadius: 12, maxWidth: 440, width: '100%', fontFamily: 'inherit' }}
                 className="flex flex-col max-h-[92vh] overflow-hidden animate-scale-in">

                {/* ── HEADER ───────────────────────────────────────────── */}
                <div style={{ padding: '16px 20px 14px', borderBottom: '0.5px solid #E5E7EB' }} className="flex items-center gap-3">
                    {/* Avatar */}
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.greenBg, color: C.greenText, fontWeight: 500, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 400, marginBottom: 1 }}>REGISTRAR PAGO</p>
                        <p style={{ fontSize: 15, fontWeight: 500, color: '#111827', lineHeight: 1.2 }} className="truncate">{client.name}</p>
                        <p style={{ fontSize: 11, color: C.red, fontWeight: 400, marginTop: 1 }}>
                            {notasActivas} nota{notasActivas !== 1 ? 's' : ''} activa{notasActivas !== 1 ? 's' : ''} · ${totalDebt.toFixed(2)} pendiente
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isProcessing}
                        style={{ width: 28, height: 28, borderRadius: 8, border: '0.5px solid #D1D5DB', background: '#F9FAFB', color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* ── BODY scrollable ──────────────────────────────────── */}
                <div className="overflow-y-auto flex-1" style={{ padding: '16px 20px' }}>

                    {/* Toast éxito */}
                    {toast && (
                        <div style={{ background: C.greenBg, border: `0.5px solid ${C.green}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: C.green }} />
                            <p style={{ fontSize: 12, color: C.greenText, fontWeight: 500 }}>{toast}</p>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div style={{ background: C.redBg, border: `0.5px solid ${C.red}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertCircle className="w-4 h-4 shrink-0" style={{ color: C.red }} />
                            <p style={{ fontSize: 12, color: C.red, fontWeight: 400 }}>{error}</p>
                        </div>
                    )}

                    {/* ── 1. SELECTOR DE MÉTODO ─────────────────────────── */}
                    <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 400, marginBottom: 6 }}>Método de Pago</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                        {(['usd', 'ves'] as const).map(m => {
                            const active = method === m;
                            return (
                                <button
                                    key={m}
                                    onClick={() => switchMethod(m)}
                                    style={{
                                        padding: '9px 12px',
                                        borderRadius: 8,
                                        border: active ? `1.5px solid ${C.green}` : '0.5px solid #D1D5DB',
                                        background: active ? C.greenBg : '#F9FAFB',
                                        color: active ? C.greenText : '#6B7280',
                                        fontWeight: active ? 500 : 400,
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        transition: 'all .15s',
                                    }}
                                >
                                    {m === 'usd' ? 'Efectivo / Zelle' : 'Bolívares (BDV)'}
                                </button>
                            );
                        })}
                    </div>

                    {/* ── 2. INPUT DE MONTO ─────────────────────────────── */}
                    <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 400, marginBottom: 6 }}>
                        {method === 'usd' ? 'Monto a Abonar (USD)' : 'Monto a Pagar (Bs)'}
                    </p>
                    <div style={{ position: 'relative', marginBottom: 14 }}>
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9CA3AF', fontWeight: 500, pointerEvents: 'none' }}>
                            {method === 'usd' ? '$' : 'Bs'}
                        </span>
                        <input
                            type="number"
                            className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={amount}
                            onChange={e => { setAmount(e.target.value); setError(null); }}
                            placeholder="0.00"
                            max={method === 'usd' ? totalDebt : undefined}
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                border: '0.5px solid #D1D5DB', borderRadius: 8,
                                padding: '8px 12px 8px 32px',
                                fontSize: 14, fontWeight: 400, color: '#111827',
                                background: '#fff', outline: 'none',
                            }}
                            onFocus={e => { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.boxShadow = `0 0 0 1px ${C.green}`; }}
                            onBlur={e => { e.currentTarget.style.borderColor = '#D1D5DB'; e.currentTarget.style.boxShadow = 'none'; }}
                        />
                    </div>
                    {method === 'usd' && num > totalDebt && (
                        <p style={{ fontSize: 11, color: C.red, marginBottom: 10, marginTop: -10 }}>⚠ El monto supera la deuda (${totalDebt.toFixed(2)})</p>
                    )}

                    {/* ── 3. BANNER RECARGO (solo BDV) ──────────────────── */}
                    {method === 'ves' && (
                        <div style={{ background: C.orangeBg, border: `0.5px solid ${C.orangeBorder}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: 11, color: C.orange, fontWeight: 400, lineHeight: 1.5 }}>
                                <span style={{ fontWeight: 500 }}>Descuento activo: -{(recargoBCV * 100).toFixed(0)}%</span>
                                {' · '}
                                Tasa BCV: {isLoadingRate ? '…' : TASA_BCV.toFixed(2)} Bs/$
                                <button onClick={refreshRate} disabled={isLoadingRate} style={{ marginLeft: 6, color: C.orange, background: 'none', border: 'none', cursor: 'pointer', padding: 0, verticalAlign: 'middle' }}>
                                    <RefreshCw className={`w-3 h-3 inline ${isLoadingRate ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── 4. DESGLOSE BDV con ojitos ────────────────────── */}
                    {method === 'ves' && (
                        <div style={{ border: '0.5px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
                            {/* Cabecera ojitos */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', background: '#F9FAFB', borderBottom: '0.5px solid #E5E7EB' }}>
                                <p style={{ fontSize: 10, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Desglose</p>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    {/* Ojito 1 — Monto real (USD bruto) */}
                                    <button
                                        onClick={() => setShowUsdBruto(v => !v)}
                                        title={showUsdBruto ? 'Ocultar monto bruto' : 'Mostrar monto bruto'}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            padding: '3px 8px', borderRadius: 6,
                                            border: `0.5px solid ${showUsdBruto ? C.green : '#D1D5DB'}`,
                                            background: showUsdBruto ? C.greenBg : '#F3F4F6',
                                            color: showUsdBruto ? C.greenText : '#9CA3AF',
                                            fontSize: 10, fontWeight: 400, cursor: 'pointer',
                                        }}
                                    >
                                        {showUsdBruto ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                        Monto real
                                    </button>
                                    {/* Ojito 2 — Con recargo (USD real) */}
                                    <button
                                        onClick={() => setShowUsdReal(v => !v)}
                                        title={showUsdReal ? 'Ocultar monto con recargo' : 'Mostrar monto con recargo'}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            padding: '3px 8px', borderRadius: 6,
                                            border: `0.5px solid ${showUsdReal ? C.green : '#D1D5DB'}`,
                                            background: showUsdReal ? C.greenBg : '#F3F4F6',
                                            color: showUsdReal ? C.greenText : '#9CA3AF',
                                            fontSize: 10, fontWeight: 400, cursor: 'pointer',
                                        }}
                                    >
                                        {showUsdReal ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                        Con recargo
                                    </button>
                                </div>
                            </div>

                            {/* Fila USD bruto (ojito 1) */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', borderBottom: '0.5px solid #F3F4F6' }}>
                                <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 400 }}>BCV</span>
                                <span style={{ fontSize: 12, color: '#111827', fontWeight: 500, fontFamily: 'monospace' }}>
                                    {showUsdBruto ? `$${usdBruto.toFixed(2)}` : '****'}
                                </span>
                            </div>

                            {/* Fila USD real (ojito 2) — naranja */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', background: '#FFFBF5' }}>
                                <span style={{ fontSize: 12, color: C.orange, fontWeight: 400 }}>
                                    Dólares ( $ )
                                </span>
                                <span style={{ fontSize: 12, color: C.orange, fontWeight: 500, fontFamily: 'monospace' }}>
                                    {showUsdReal ? `$${usdReal.toFixed(2)}` : '****'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* ── 5. RESUMEN (siempre visible) ──────────────────── */}
                    <div style={{ border: '0.5px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', marginBottom: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', borderBottom: '0.5px solid #F3F4F6' }}>
                            <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 400 }}>Deuda total</span>
                            <span style={{ fontSize: 12, color: C.red, fontWeight: 500, fontFamily: 'monospace' }}>${totalDebt.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', borderBottom: '0.5px solid #F3F4F6' }}>
                            <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 400 }}>Descuento aplicado</span>
                            <span style={{ fontSize: 12, color: C.green, fontWeight: 500, fontFamily: 'monospace' }}>−${descuento.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', background: '#F9FAFB' }}>
                            <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>Nueva deuda USD</span>
                            <span style={{ fontSize: 13, color: nuevaDeuda > 0 ? C.red : C.green, fontWeight: 500, fontFamily: 'monospace' }}>${nuevaDeuda.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                {/* ── FOOTER BOTONES ────────────────────────────────────── */}
                <div style={{ padding: '12px 20px', borderTop: '0.5px solid #E5E7EB', display: 'flex', gap: 10, background: '#fff' }}>
                    <button
                        onClick={onClose}
                        disabled={isProcessing}
                        style={{ flex: 1, height: 40, borderRadius: 8, border: '0.5px solid #D1D5DB', background: '#fff', color: '#6B7280', fontSize: 13, fontWeight: 400, cursor: 'pointer' }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isProcessing || descuento <= 0}
                        style={{
                            flex: 1, height: 40, borderRadius: 8, border: 'none',
                            background: descuento > 0 ? C.green : '#D1D5DB',
                            color: '#fff', fontSize: 13, fontWeight: 500,
                            cursor: descuento > 0 ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            transition: 'background .15s',
                        }}
                    >
                        {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</> : 'Confirmar Pago'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ClientMasterProfile — main client profile with 2-tab navigation
// ─────────────────────────────────────────────────────────────────────────────
export function ClientMasterProfile({ client, onClose }: ClientMasterProfileProps) {
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
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
    const [totalAmountOverrides, setTotalAmountOverrides] = useState<Record<string, number>>({});
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

    const handleInvoiceUpdated = useCallback((invoiceId: string, delta: number, newTotal?: number) => {
        // CASO A (delta > 0): subió precio/cant/producto → saldo del cliente SUBE
        // CASO B (delta < 0): bajó precio/cant/eliminó → saldo del cliente BAJA
        setBalanceOverrides(prev => {
            const next = { ...prev };
            const base = next[invoiceId] !== undefined ? next[invoiceId] : (client?.invoices?.find((i: Invoice) => i.id === invoiceId)?.balance ?? 0);
            next[invoiceId] = Math.max(0, base + delta);
            return next;
        });
        // También actualizar totalAmount para que la próxima apertura del modal
        // tenga el total_anterior correcto y no calcule un delta incorrecto
        if (newTotal !== undefined) {
            setTotalAmountOverrides(prev => ({ ...prev, [invoiceId]: newTotal }));
        }
    }, [client]);

    if (!client) return null;

    const invoicesWithOverrides = (client.invoices || []).map((inv: Invoice) => ({
        ...inv,
        balance: balanceOverrides[inv.id] !== undefined ? balanceOverrides[inv.id] : inv.balance,
        // Actualizar totalAmount para que InvoiceDetailModal use el total correcto
        // como total_anterior en la siguiente edición (evita delta incorrecto)
        totalAmount: totalAmountOverrides[inv.id] !== undefined ? totalAmountOverrides[inv.id] : inv.totalAmount,
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
            <div className="relative w-full max-w-[520px] bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-border animate-scale-in">

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

                {/* Expediente body — scrollable */}
                <div className="flex-1 overflow-y-auto px-6 py-5 bg-card/50">
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
                            clientId={client.id}
                            onInvoiceUpdated={handleInvoiceUpdated}
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
                    }}
                    registerPayment={registerPaymentOnInvoice}
                />
            )}
        </div>
    );
}
