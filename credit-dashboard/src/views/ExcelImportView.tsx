import { useState, useCallback, useRef, useEffect } from 'react';
// Importación dinámica para reducir bundle size
// import * as XLSX from 'xlsx';
import {
    UploadCloud, X, Package, ChevronDown, ChevronUp,
    Plus, RefreshCw, Sparkles, FileText, Hash,
    Calendar, DollarSign, Layers, ShoppingCart, Trash2
} from 'lucide-react';
import { AssignCreditModal } from '../components/AssignCreditModal';
import { useBCV } from '../hooks/BCVContext';
// PDF is processed via Vercel Serverless Function at /api/pdf
const PDF_API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/pdf/extract` : '/api/pdf';

// ─── Types ──────────────────────────────────────────────────────────────────
interface ProductRow {
    codigo: string;
    nombre: string;
    cantidad: number;
    precio: number;
    subtotal?: number; // Added to decouple quantity * price from the total line cost
    isSubtotalManual?: boolean; // Flag to indicate user edited the subtotal directly
}

interface InvoiceRow {
    documento: string;
    totalOperacion: number;
    divisas: number;
    vendedor: string;
    fechaEmision: string;
    products: ProductRow[];
    assignedTo?: string;
    assignedClientName?: string;
    currency?: 'USD' | 'Bs';
    originalTotal?: number;
    iva?: number;
    tasaAplicada?: number;
    isFromOCR?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtUSD(n: number): string {
    if (!n && n !== 0) return '–';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isIvaOrTax(nombre: string): boolean {
    const upper = nombre.toUpperCase();
    return upper.includes('IVA') || upper.includes('IMPUESTO') || upper.includes('IGTF');
}

function toNum(v: unknown): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
        let str = v.trim();
        if (!str) return 0;
        str = str.replace(/[BS$\s]/gi, '');
        if (str.includes(',') && str.includes('.')) {
            if (str.indexOf('.') < str.indexOf(',')) {
                return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
            } else {
                return parseFloat(str.replace(/,/g, '')) || 0;
            }
        }
        if (str.includes(',') && !str.includes('.')) return parseFloat(str.replace(',', '.')) || 0;
        if (str.includes('.') && !str.includes(',')) {
            const parts = str.split('.');
            if (parts.length > 2 || parts[parts.length - 1].length === 3) return parseFloat(str.replace(/\./g, '')) || 0;
            return parseFloat(str) || 0;
        }
        return parseFloat(str) || 0;
    }
    return 0;
}

function toStr(v: unknown): string {
    if (v == null) return '';
    if (v instanceof Date) return v.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return String(v).trim();
}

function parseExcelFile(wb: any): InvoiceRow[] {
    const XLSX = (window as any).__XLSX_LIB__ || (window as any).XLSX;
    if (!XLSX) {
        console.error("XLSX lib not loaded");
        return [];
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true }) as unknown[][];
    if (!raw || raw.length < 2) return [];

    let mainHeaderIdx = -1;
    for (let i = 0; i < Math.min(raw.length, 20); i++) {
        const cells = (raw[i] as unknown[]).map(toStr).map(s => s.toLowerCase());
        if (cells.some(c => c.includes('documento')) && cells.some(c => c.includes('vendedor'))) { mainHeaderIdx = i; break; }
    }
    if (mainHeaderIdx === -1) mainHeaderIdx = 0;

    const mainH = (raw[mainHeaderIdx] as unknown[]).map(toStr).map(s => s.toLowerCase());
    const findCol = (headers: string[], keywords: string[]): number => {
        for (const kw of keywords) { const idx = headers.findIndex(h => h.includes(kw)); if (idx !== -1) return idx; }
        return -1;
    };

    const M_DOC = findCol(mainH, ['documento']);
    const M_TOTALOP = findCol(mainH, ['total operaci']);
    const M_NETO = findCol(mainH, ['total neto']);
    const M_IMPUESTO = findCol(mainH, ['impuesto']);
    const M_IGTF = findCol(mainH, ['total igtf', 'igtf']);
    const M_VEND = findCol(mainH, ['vendedor']);
    const M_FECHA = findCol(mainH, ['fecha emisi', 'emision', 'fecha']);

    const invoices: InvoiceRow[] = [];
    let current: InvoiceRow | null = null;
    let P_COD = -1, P_NOM = -1, P_CANT = -1, P_PREC = -1;
    let inProductSection = false;
    let lastSeenDate = '';
    let currentIva = 0;

    for (let i = mainHeaderIdx + 1; i < raw.length; i++) {
        const row = raw[i] as unknown[];
        const cells = row.map(toStr);
        const low = cells.map(s => s.toLowerCase());

        const maybeDateCol = cells.find(c => /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(c) || /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(c));
        if (maybeDateCol) { const m = maybeDateCol.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/); if (m) lastSeenDate = m[1]; }
        if (cells.every(c => c === '')) continue;

        const hasNombre = low.some(c => c === 'nombre');
        const hasCantidad = low.some(c => c === 'cantidad');
        const hasPrecio = low.some(c => c === 'precio');
        const hasVendedor = low.some(c => c.includes('vendedor'));

        if (hasNombre && hasCantidad && hasPrecio && !hasVendedor) {
            P_NOM = low.indexOf('nombre'); P_CANT = low.indexOf('cantidad'); P_PREC = low.indexOf('precio');
            const cIdx = low.findIndex(c => c.includes('cód') || c === 'código' || c === 'codigo');
            P_COD = cIdx >= 0 ? cIdx : 0; inProductSection = true; continue;
        }

        const docVal = M_DOC >= 0 ? cells[M_DOC] : '';
        if (docVal && /^\d{5,}/.test(docVal)) {
            inProductSection = false; P_COD = P_NOM = P_CANT = P_PREC = -1;
            let extractedDate = M_FECHA >= 0 ? cells[M_FECHA] : '';
            if (!extractedDate || extractedDate === '-') extractedDate = lastSeenDate;

            currentIva = M_IMPUESTO >= 0 ? toNum(row[M_IMPUESTO]) : 0;
            const igtf = M_IGTF >= 0 ? toNum(row[M_IGTF]) : 0;

            current = {
                documento: docVal,
                fechaEmision: extractedDate,
                vendedor: M_VEND >= 0 ? cells[M_VEND] : '',
                totalOperacion: M_TOTALOP >= 0 ? toNum(row[M_TOTALOP]) : 0,
                divisas: M_NETO >= 0 ? toNum(row[M_NETO]) : 0,
                products: [],
                iva: currentIva + igtf,
            };
            invoices.push(current); continue;
        }

        if (!current || !inProductSection || P_NOM < 0) continue;
        const nombre = cells[P_NOM];
        if (!nombre) continue;
        if (nombre.toUpperCase().includes('CREDITO') || nombre.toUpperCase().includes('CRÉDITO')) continue;
        if (isIvaOrTax(nombre)) continue; // Skip IVA rows in body

        current.products.push({
            codigo: P_COD >= 0 ? cells[P_COD] : '',
            nombre: nombre.trim(),
            cantidad: P_CANT >= 0 ? toNum(row[P_CANT]) : 0,
            precio: P_PREC >= 0 ? toNum(row[P_PREC]) : 0
        });
    }
    return invoices.filter(inv => inv.documento);
}

function detectCurrency(text: string, totalAmount: number): 'USD' | 'Bs' {
    const t = text.toLowerCase();
    if (t.includes('bs') || t.includes('bolívar') || t.includes('bolivares') || t.includes('ves')) return 'Bs';
    if (t.includes('usd') || t.includes('dólar') || t.includes('dolares') || t.includes('$')) return 'USD';
    if (totalAmount > 5000) return 'Bs';
    return 'USD';
}

function EditableCell({ value, onChange, className = "" }: { value: number; onChange: (v: number) => void; className?: string; }) {
    const fmt = (v: number) => v === 0 ? '' : (Math.round(v * 100) / 100).toFixed(2);
    const [local, setLocal] = useState(fmt(value));
    useEffect(() => { setLocal(fmt(value)); }, [value]);

    return (
        <input
            type="text"
            value={local}
            onChange={e => setLocal(e.target.value)}
            onBlur={() => {
                const trimmed = local.trim();
                if (trimmed === '') { setLocal('0.00'); onChange(0); return; }
                let parsed = parseFloat(trimmed.replace(',', '.'));
                if (isNaN(parsed) || parsed < 0) { setLocal(fmt(value)); return; }
                parsed = Math.round(parsed * 100) / 100;
                setLocal(parsed.toFixed(2));
                if (parsed !== Math.round(value * 100) / 100) onChange(parsed);
            }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            className={`w-28 text-right px-3 py-1.5 font-mono text-sm font-bold text-foreground bg-transparent border border-transparent rounded-lg cursor-pointer hover:bg-background/80 hover:border-border/80 focus:bg-accent/15 focus:border-accent/50 focus:ring-2 focus:ring-accent/40 focus:outline-none focus:cursor-text transition-all ${className}`}
        />
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function ExcelImportView() {
    const { parallelRate, isLoading: isLoadingRate, refresh } = useBCV();
    const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
    const [error, setError] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
    const [invoiceToAssign, setInvoiceToAssign] = useState<InvoiceRow | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExpandCard = (idx: number) => {
        if (expandedIdx === idx) {
            setExpandedIdx(null);
            return;
        }
        setExpandedIdx(idx);
    };

    const round2 = (num: number) => Math.round((Number(num) || 0) * 100) / 100;

    const convertInvoiceWithRate = useCallback((inv: InvoiceRow, rate: number): InvoiceRow => {
        if (inv.isFromOCR) return inv; // OCR values are already converted by Gemini. Do not touch.
        
        if (inv.currency === 'Bs') {
            return {
                ...inv,
                originalTotal: inv.totalOperacion,
                totalOperacion: round2(inv.totalOperacion / rate),
                products: inv.products.map(p => ({ ...p, precio: round2(p.precio / rate) })),
                tasaAplicada: rate
            };
        }
        return inv;
    }, []);




    const processFile = useCallback((file: File) => {
        setError(''); setInvoices([]);
        const processResult = (result: InvoiceRow[]) => {
            if (result.length === 0) { setError('No se encontraron facturas en el archivo.'); return; }
            setInvoices(result); setExpandedIdx(0);
        };

        if (file.name.toLowerCase().endsWith('.pdf')) {
            setLoading(true);
            const rateToUse = parallelRate || 1;

            const formData = new FormData();
            formData.append('file', file);
            formData.append('exchangeRate', String(rateToUse));

            fetch(PDF_API_URL, {
                method: 'POST',
                body: formData,
            })
                .then(async res => {
                    const json = await res.json();
                    if (!res.ok) throw new Error(json.error || 'Error procesando PDF');
                    return json.data;
                })
                .then(d => {
                    const cleanProducts = (d.products || []).filter((p: ProductRow) => {
                        const nombre = (p.nombre || '').toUpperCase();
                        if (nombre.includes('CREDITO') || nombre.includes('CRÉDITO')) return false;
                        if (isIvaOrTax(nombre)) return false;
                        return true;
                    }).map((p: ProductRow) => ({
                        ...p,
                        precio: round2(p.precio * 1.16) // Aplica IVA 16% directo al precio unitario
                    }));

                    processResult([{
                        documento: d.documento || 'PDF-' + Date.now(),
                        fechaEmision: d.fechaEmision,
                        totalOperacion: d.totalOperacion,
                        divisas: d.divisas,
                        vendedor: d.vendedor,
                        products: cleanProducts,
                        currency: 'USD',
                        tasaAplicada: d.tasaAplicada,
                        isFromOCR: true
                    }]);
                })
                .catch(err => setError(`Error procesando PDF: ${err.message}`))
                .finally(() => setLoading(false));
        } else {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const data = new Uint8Array(e.target!.result as ArrayBuffer);
                // Lazy load xlsx here
                const XLSX = await import('xlsx');
                (window as any).__XLSX_LIB__ = XLSX;
                
                const wb = XLSX.read(data, { type: 'array', cellDates: true });
                const result = parseExcelFile(wb);
                const totalAmount = result.reduce((s, inv) => s + inv.totalOperacion, 0);
                const currency = detectCurrency(JSON.stringify(result), totalAmount);
                const rateToUse = parallelRate || 1;

                const withCurrency = result.map(inv => {
                    // Aplica IVA 16% a cada producto del Excel importado directamente en el precio unitario
                    const productsWithIva = inv.products.map(p => ({
                        ...p,
                        precio: round2(p.precio * 1.16)
                    }));
                    
                    return { 
                        ...inv,
                        products: productsWithIva,
                        currency, 
                        originalTotal: currency === 'Bs' ? inv.totalOperacion : undefined,
                        tasaAplicada: rateToUse
                    };
                });

                if (currency === 'Bs') {
                    processResult(withCurrency.map(inv => convertInvoiceWithRate(inv, rateToUse)));
                } else {
                    processResult(withCurrency);
                }
            };
            reader.readAsArrayBuffer(file);
        }
    }, [parallelRate, convertInvoiceWithRate]);
    const updateProductPrice = (invIdx: number, pIdx: number, newPrice: number) => {
        setInvoices(prev => {
            const next = [...prev];
            const inv = { ...next[invIdx] };
            const prods = [...inv.products];
            const p = prods[pIdx];
            
            p.precio = round2(newPrice);
            if (!p.isSubtotalManual) {
                p.subtotal = round2(p.cantidad * p.precio);
            }
            
            prods[pIdx] = p;
            inv.products = prods;
            
            const sumProds = prods.reduce((s, pr) => s + (pr.subtotal !== undefined ? pr.subtotal : pr.cantidad * pr.precio), 0);
            inv.totalOperacion = round2(sumProds);
            
            next[invIdx] = inv;
            return next;
        });
    };

    const updateProductQuantity = (invIdx: number, pIdx: number, newQuantity: number) => {
        setInvoices(prev => {
            const next = [...prev];
            const inv = { ...next[invIdx] };
            const prods = [...inv.products];
            const p = prods[pIdx];
            
            p.cantidad = round2(newQuantity);
            if (!p.isSubtotalManual) {
                p.subtotal = round2(p.cantidad * p.precio);
            }
            
            prods[pIdx] = p;
            inv.products = prods;
            
            const sumProds = prods.reduce((s, pr) => s + (pr.subtotal !== undefined ? pr.subtotal : pr.cantidad * pr.precio), 0);
            inv.totalOperacion = round2(sumProds);
            
            next[invIdx] = inv;
            return next;
        });
    };

    const updateProductSubtotal = (invIdx: number, pIdx: number, newSubtotal: number) => {
        setInvoices(prev => {
            const next = [...prev];
            const inv = { ...next[invIdx] };
            const prods = [...inv.products];
            const p = prods[pIdx];
            
            p.subtotal = round2(newSubtotal);
            p.isSubtotalManual = true; // Mark as manually edited so price updates don't overwrite it
            
            prods[pIdx] = p;
            inv.products = prods;
            
            const sumProds = prods.reduce((s, pr) => s + (pr.subtotal !== undefined ? pr.subtotal : pr.cantidad * pr.precio), 0);
            inv.totalOperacion = round2(sumProds);
            
            next[invIdx] = inv;
            return next;
        });
    };

    const deleteProduct = (invIdx: number, pIdx: number) => {
        setInvoices(prev => {
            const next = [...prev];
            const inv = { ...next[invIdx] };
            
            inv.products = inv.products.filter((_, idx) => idx !== pIdx);
            
            const sumProds = inv.products.reduce((s, pr) => s + (pr.subtotal !== undefined ? pr.subtotal : pr.cantidad * pr.precio), 0);
            inv.totalOperacion = round2(sumProds);
            
            next[invIdx] = inv;
            return next;
        });
    };

    const handleTotalChange = (invIdx: number, newTotal: number) => {
        setInvoices(prev => { const next = [...prev]; next[invIdx] = { ...next[invIdx], totalOperacion: newTotal }; return next; });
    };

    // ── Upload zone ──────────────────────────────────────────────────────────
    if (!invoices.length && !loading) {
        return (
            <div className="max-w-4xl mx-auto space-y-6 p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#635BFF] to-[#0047FF] flex items-center justify-center shadow-[0_0_20px_rgba(99,91,255,0.4)]">
                            <Package className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black tracking-tight">Facturación</h2>
                            <p className="text-xs text-muted-foreground font-medium">Excel con parseo directo · PDF con Gemini Vision IA</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                    </div>
                </div>

                {error && (
                    <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-2xl text-sm font-medium flex items-center gap-2">
                        <X className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {/* Drop Zone */}
                <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); }}
                    className={`
                        relative cursor-pointer rounded-3xl border-2 border-dashed p-16 text-center
                        transition-all duration-300 overflow-hidden group
                        ${isDragging
                            ? 'border-[#635BFF] bg-[#635BFF]/8 scale-[1.01]'
                            : 'border-border hover:border-[#635BFF]/50 hover:bg-[#635BFF]/3'
                        }
                    `}
                >
                    {/* Glow background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-[#635BFF]/5 via-transparent to-[#0047FF]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                    <div className="relative flex flex-col items-center gap-4">
                        <div className={`w-20 h-20 rounded-3xl flex items-center justify-center transition-all duration-300 ${isDragging ? 'bg-[#635BFF]/20 scale-110' : 'bg-muted/60 group-hover:bg-[#635BFF]/10 group-hover:scale-105'}`}>
                            <UploadCloud className={`w-9 h-9 transition-colors duration-300 ${isDragging ? 'text-[#635BFF]' : 'text-muted-foreground group-hover:text-[#635BFF]'}`} />
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-lg font-bold">
                                {isDragging ? '¡Suelta el archivo!' : 'Arrastra tu factura aquí'}
                            </p>
                            <p className="text-sm text-muted-foreground">o haz clic para seleccionar</p>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                                <Layers className="w-3 h-3" /> Excel / XLSX
                            </div>
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#635BFF]/10 border border-[#635BFF]/20 rounded-full text-[#635BFF] text-xs font-semibold">
                                <Sparkles className="w-3 h-3" /> PDF con IA
                            </div>
                        </div>
                    </div>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.pdf" className="hidden"
                        onChange={(e) => { if (e.target.files?.[0]) processFile(e.target.files[0]); }} />
                </div>

                {/* Info cards */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
                        <div className="flex items-center gap-2 text-emerald-500">
                            <Layers className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Excel</span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">Importa reportes de Valery directamente. Parseo instantáneo sin conexión.</p>
                    </div>
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-[#635BFF]/5 to-[#0047FF]/5 border border-[#635BFF]/20 space-y-2">
                        <div className="flex items-center gap-2 text-[#635BFF]">
                            <Sparkles className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">PDF + Gemini IA</span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">Extrae productos, cantidades, IVA y convierte VES→USD automáticamente.</p>
                    </div>
                </div>


            </div>
        );
    }

    // ── Loading ──────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="max-w-4xl mx-auto p-6 flex flex-col items-center justify-center min-h-[60vh] gap-6">
                <div className="relative w-20 h-20">
                    <div className="absolute inset-0 rounded-full border-4 border-[#635BFF]/20" />
                    <div className="absolute inset-0 rounded-full border-4 border-t-[#635BFF] animate-spin" />
                    <div className="absolute inset-3 rounded-full bg-[#635BFF]/10 flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-[#635BFF]" />
                    </div>
                </div>
                <div className="text-center space-y-1">
                    <p className="font-bold text-lg">Analizando con Gemini Vision</p>
                    <p className="text-sm text-muted-foreground">Extrayendo productos, precios y convirtiendo a USD...</p>
                </div>
                <div className="flex gap-2">
                    {['Leyendo PDF', 'Detectando ítems', 'Convirtiendo VES→USD'].map((step, i) => (
                        <span key={i} className="px-3 py-1 text-xs rounded-full bg-[#635BFF]/10 text-[#635BFF] font-medium border border-[#635BFF]/20 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }}>
                            {step}
                        </span>
                    ))}
                </div>
            </div>
        );
    }

    // ── Invoice list ─────────────────────────────────────────────────────────
    return (
        <div className="max-w-5xl mx-auto flex flex-col p-6 gap-5" style={{ maxHeight: 'calc(100vh - 80px)' }}>

            {/* ── Header bar ── */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#635BFF] to-[#0047FF] flex items-center justify-center shadow-[0_0_20px_rgba(99,91,255,0.4)]">
                        <Package className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black tracking-tight">Facturación</h2>
                        <p className="text-xs text-muted-foreground">{invoices.length} factura{invoices.length !== 1 ? 's' : ''} importada{invoices.length !== 1 ? 's' : ''}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
    
                    <button onClick={refresh} disabled={isLoadingRate} title="Actualizar tasa" className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:text-[#635BFF] hover:border-[#635BFF]/40 transition-all disabled:opacity-50">
                        <RefreshCw className={`w-4 h-4 ${isLoadingRate ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => setInvoices([])} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border bg-card text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                        <X className="w-3.5 h-3.5" /> Limpiar
                    </button>
                </div>
            </div>

            {/* ── Rate banner ── */}
            {(() => {
                let effectiveRate = parallelRate;
                let rateLabel = "Tasa Global Aplicada";
                
                if (invoices.length > 0) {
                    const firstInv = invoices[0];
                    if (firstInv.tasaAplicada) {
                        effectiveRate = firstInv.tasaAplicada;
                        rateLabel = "Tasa de Importación";
                    }
                }

                return (
                    <div className="flex flex-wrap items-center gap-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 shadow-lg">
                        <div className="flex items-center gap-2 text-sm">
                            <DollarSign className="w-4 h-4 text-emerald-400" />
                            <span className="text-slate-400">{rateLabel}:</span>
                            <span className="font-mono font-bold text-base text-emerald-400">
                                {effectiveRate.toFixed(2)}
                            </span>
                            <span className="text-slate-500 text-xs">Bs/$</span>
                        </div>

                        {invoices.some(inv => inv.isFromOCR) && (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-[#635BFF]/20 border border-[#635BFF]/30 rounded-full text-[#635BFF] text-xs font-bold">
                                <Sparkles className="w-3 h-3" />
                                Gemini Vision
                            </div>
                        )}
                    </div>
                );
            })()}

            {error && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-2xl text-sm font-medium">{error}</div>
            )}

            {/* ── Invoice Cards ── */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1 scrollbar-thin pb-4">
                {invoices.map((inv, idx) => {
                    const isExpanded = expandedIdx === idx;

                    return (
                        <div
                            key={idx}
                            className="rounded-3xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200"
                        >

                            {/* Card header */}
                            <button
                                onClick={() => handleExpandCard(idx)}
                                className="w-full flex items-center justify-between px-6 py-5 text-left group"
                            >
                                <div className="flex items-center gap-4">
                                    {/* Icon */}
                                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${inv.isFromOCR ? 'bg-gradient-to-br from-[#635BFF]/20 to-[#0047FF]/20 border border-[#635BFF]/30' : 'bg-muted border border-border'}`}>
                                        {inv.isFromOCR
                                            ? <Sparkles className="w-5 h-5 text-[#635BFF]" />
                                            : <FileText className="w-5 h-5 text-muted-foreground" />
                                        }
                                    </div>
                                    {/* Info */}
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-base tracking-tight">{inv.documento}</span>
                                            {inv.isFromOCR && (
                                                <span className="px-2 py-0.5 rounded-full bg-[#635BFF]/15 text-[#635BFF] text-[10px] font-black uppercase tracking-widest border border-[#635BFF]/20">
                                                    OCR IA
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {inv.fechaEmision}</span>
                                            <span className="flex items-center gap-1"><ShoppingCart className="w-3 h-3" /> {inv.products.length} producto{inv.products.length !== 1 ? 's' : ''}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Total + actions */}
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Total</p>
                                        {inv.currency === 'Bs' && inv.originalTotal ? (
                                            <div>
                                                <p className="text-xs text-amber-500/70 line-through font-mono">Bs {new Intl.NumberFormat('es-VE').format(inv.originalTotal)}</p>
                                                <p className="font-black text-lg text-emerald-500 font-mono">$ {fmtUSD(inv.totalOperacion)}</p>
                                            </div>
                                        ) : (
                                            <p className="font-black text-xl font-mono text-foreground">$ {fmtUSD(inv.totalOperacion)}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setInvoices(prev => prev.filter((_, i) => i !== idx)); setExpandedIdx(null); }}
                                            className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white hover:scale-110 transition-all shadow-sm"
                                            title="Descartar factura"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setInvoiceToAssign({ ...inv }); }}
                                            className="w-9 h-9 rounded-xl bg-[#635BFF] text-white flex items-center justify-center hover:bg-[#524ae3] hover:scale-110 transition-all shadow-[0_4px_12px_rgba(99,91,255,0.4)]"
                                            title="Asignar a cliente"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className={`w-8 h-8 rounded-xl border border-border flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors`}>
                                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </div>
                                </div>
                            </button>

                            {/* Expanded detail — Centered modal */}
                            {isExpanded && (
                                <div
                                    className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm animate-fade-in flex items-center justify-center p-4 sm:p-6"
                                    onClick={() => setExpandedIdx(null)}
                                >
                                    <div
                                        className="bg-card w-full max-w-4xl border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-in"
                                        style={{ maxHeight: '90vh' }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30 shrink-0 rounded-t-2xl">
                                            <div>
                                                <h3 className="text-lg font-bold text-foreground">Detalle de Factura <span className="font-mono text-[#635BFF]">{inv.documento}</span></h3>
                                                <p className="text-sm text-muted-foreground mt-0.5">{inv.products.length} producto{inv.products.length !== 1 ? 's' : ''}</p>
                                            </div>
                                            <button
                                                onClick={() => setExpandedIdx(null)}
                                                className="p-2 -mr-2 text-muted-foreground hover:bg-muted hover:text-foreground rounded-full transition-colors"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>

                                        <div className="flex-1 overflow-y-auto scrollbar-thin">
                                            {/* OCR banner */}
                                            {inv.isFromOCR && (
                                                <div className="px-6 py-3 bg-gradient-to-r from-[#635BFF]/8 to-teal-500/8 border-b border-[#635BFF]/15 flex flex-wrap items-center gap-x-5 gap-y-1">
                                                    <div className="flex items-center gap-2 text-[#635BFF] text-xs font-bold">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-[#635BFF] animate-pulse" />
                                                        Conversión Gemini Vision
                                                    </div>
                                                    <span className="text-xs text-muted-foreground">Tasa fijada y aplicada: <span className="font-mono font-bold text-amber-500">{Number(inv.tasaAplicada || 0).toFixed(2)} Bs/$</span></span>
                                                    <span className="ml-auto text-xs text-muted-foreground">Gran Total: <span className="font-mono font-bold text-emerald-500">$ {fmtUSD(inv.totalOperacion)}</span></span>
                                                </div>
                                            )}

                                            {/* Table */}
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur shadow-[0_1px_2px_rgba(0,0,0,0.05)] border-b border-border">
                                                        <tr>
                                                            <th className="text-left px-6 py-3.5 text-xs font-black uppercase tracking-widest text-muted-foreground/80">
                                                                <span className="flex items-center gap-1.5"><Hash className="w-3 h-3" />Producto</span>
                                                            </th>
                                                            <th className="text-center px-4 py-3.5 text-xs font-black uppercase tracking-widest text-muted-foreground/80">Cant.</th>
                                                            <th className="text-right px-4 py-3.5 text-xs font-black uppercase tracking-widest text-muted-foreground/80">Precio (USD)</th>
                                                            <th className="text-right px-4 py-3.5 text-xs font-black uppercase tracking-widest text-muted-foreground/80">Subtotal</th>
                                                            <th className="px-3 py-3.5 w-10"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {inv.products.map((p, pi) => {
                                                            const subtotal = p.subtotal !== undefined ? p.subtotal : p.cantidad * p.precio;
                                                            return (
                                                                <tr key={pi} className="border-b border-border/50 hover:bg-muted/30 transition-colors group/row">
                                                                    <td className="px-6 py-3.5 font-medium">{p.nombre}</td>
                                                                    <td className="px-4 py-3.5 text-center">
                                                                        <EditableCell 
                                                                            value={p.cantidad} 
                                                                            onChange={(v) => updateProductQuantity(idx, pi, v)} 
                                                                            className="w-16 text-center font-bold"
                                                                        />
                                                                    </td>
                                                                    <td className="px-4 py-3.5 text-right">
                                                                        <EditableCell value={p.precio} onChange={(v) => updateProductPrice(idx, pi, v)} />
                                                                    </td>
                                                                    <td className="px-4 py-3.5 text-right">
                                                                        <EditableCell 
                                                                            value={subtotal} 
                                                                            onChange={(v) => updateProductSubtotal(idx, pi, v)} 
                                                                            className={p.isSubtotalManual ? 'text-amber-500 font-bold' : 'font-semibold font-mono'}
                                                                        />
                                                                    </td>
                                                                    <td className="px-3 py-3.5 text-center">
                                                                        <button
                                                                            onClick={() => deleteProduct(idx, pi)}
                                                                            className="p-1.5 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-lg opacity-0 group-hover/row:opacity-100 transition-all focus:opacity-100"
                                                                            title="Eliminar fila"
                                                                        >
                                                                            <X className="w-4 h-4" />
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <div className="border-t border-border bg-muted/20 shrink-0 rounded-b-2xl">
                                            <table className="w-full text-sm">
                                                <tfoot>
                                                    <tr className="border-b border-border/30">
                                                        <td colSpan={3} className="px-6 py-3.5 text-right text-xs font-bold text-muted-foreground uppercase tracking-widest">Total productos</td>
                                                        <td className="px-6 py-3.5 text-right font-mono text-sm font-bold text-foreground pr-5">$ {fmtUSD(round2(inv.products.reduce((s, p) => s + (p.subtotal !== undefined ? p.subtotal : p.cantidad * p.precio), 0)))}</td>
                                                        <td className="w-10"></td>
                                                    </tr>
                                                    {/* Gran Total */}
                                                    <tr className="bg-gradient-to-r from-[#635BFF]/10 via-[#635BFF]/5 to-transparent shadow-[inset_0_2px_15px_rgba(99,91,255,0.05)] rounded-b-2xl">
                                                        <td colSpan={3} className="px-6 py-5 text-right text-xs font-black uppercase tracking-widest text-[#635BFF]">Gran Total</td>
                                                        <td className="px-4 py-5 text-right pr-2">
                                                            <EditableCell
                                                                value={inv.totalOperacion}
                                                                onChange={(v) => handleTotalChange(idx, v)}
                                                                className="text-xl font-black text-[#635BFF] pr-3 bg-white/40 dark:bg-black/20 hover:bg-white/60 dark:hover:bg-black/40 border border-[#635BFF]/20 hover:border-[#635BFF]/50"
                                                            />
                                                        </td>
                                                        <td className="w-10"></td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <AssignCreditModal
                isOpen={!!invoiceToAssign}
                onClose={() => setInvoiceToAssign(null)}
                invoice={invoiceToAssign}
                onAssign={(doc) => {
                    setInvoices(prev => prev.filter(i => i.documento !== doc));
                    setInvoiceToAssign(null);
                }}
            />


        </div>
    );
}
