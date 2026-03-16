import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
export interface FichaCalendarioDato {
    id: string;
    clienteId: string;
    clienteNombre: string;
    emision: string; // YYYY-MM-DD
    vencimiento: string; // YYYY-MM-DD
    estado: 'mora' | 'pendiente' | 'parcial' | 'pagado';
    original: number;
    pagado: number;
}

interface Props {
    fichas: FichaCalendarioDato[];
    clientes: { id: string; name: string; }[];
    factorRecargo: number; // e.g. 30 for 30%
    onRegistrarPago: (fichaId: string, clienteId: string) => void;
    onVerHistorial: (fichaId: string, clienteId: string) => void;
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const PRIORIDAD = { mora: 3, pendiente: 2, parcial: 1, pagado: 0 };
function estadoMasGrave(fichasDelDia: FichaCalendarioDato[]) {
    return fichasDelDia.reduce((peor, f) => PRIORIDAD[f.estado] > PRIORIDAD[peor] ? f.estado : peor, 'pagado' as 'mora' | 'pendiente' | 'parcial' | 'pagado');
}

export function CalendarioCreditos({ fichas, clientes, factorRecargo, onRegistrarPago, onVerHistorial }: Props) {
    const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
    const [selectedClientId, setSelectedClientId] = useState<string>('all');
    
    // PASO 1 — Estados para la ventana flotante
    const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
    const [fichasDelDia, setFichasDelDia] = useState<FichaCalendarioDato[]>([]);

    const filteredFichas = useMemo(() => {
        if (selectedClientId === 'all') return fichas;
        return fichas.filter(f => f.clienteId === selectedClientId);
    }, [fichas, selectedClientId]);

    const groupByDate = useMemo(() => {
        const map = new Map<string, FichaCalendarioDato[]>();
        for (const f of filteredFichas) {
            if (!map.has(f.emision)) map.set(f.emision, []);
            map.get(f.emision)!.push(f);
        }
        return map;
    }, [filteredFichas]);

    // PASO 2 — Conectar el clic en un día
    const handleDiaClick = (fechaISO: string) => {
        if (diaSeleccionado === fechaISO) {
            setDiaSeleccionado(null);
            setFichasDelDia([]);
            return;
        }

        const fichasDia = groupByDate.get(fechaISO) || [];
        if (fichasDia.length === 0) return;

        setDiaSeleccionado(fechaISO);
        setFichasDelDia(fichasDia);
    };

    // PASO 7 — Cerrar al cambiar de año
    const changeYear = (delta: number) => {
        setDiaSeleccionado(null);
        setFichasDelDia([]);
        setCurrentYear(y => y + delta);
    };

    // PASO 8 — Cerrar al cambiar filtro de cliente
    const handleFiltroCliente = (clienteId: string) => {
        setDiaSeleccionado(null);
        setFichasDelDia([]);
        setSelectedClientId(clienteId);
    };

    const cerrarVentana = () => {
        setDiaSeleccionado(null);
        setFichasDelDia([]);
    };

    const ESTADO_GRID = {
        mora: 'bg-[#FCEBEB] text-[#A32D2D]',
        pendiente: 'bg-[#FAEEDA] text-[#854F0B]',
        parcial: 'bg-[#EAF3DE] text-[#27500A]',
        pagado: 'bg-[#EAF3DE] text-[#27500A]'
    };

    const renderMonthGrid = (monthIndex: number) => {
        const date = new Date(currentYear, monthIndex, 1);
        const daysInMonth = new Date(currentYear, monthIndex + 1, 0).getDate();
        const firstDayOfWeek = date.getDay();
        const prevMonthDays = new Date(currentYear, monthIndex, 0).getDate();

        const cells = [];
        
        // Días de otros meses (anterior)
        for (let i = 0; i < firstDayOfWeek; i++) {
            const dayNum = prevMonthDays - firstDayOfWeek + i + 1;
            cells.push(
                <div key={`empty-${i}`} className="w-[18px] h-[18px] text-[10px] mx-auto flex items-center justify-center text-[#D3D1C7] select-none">
                    {dayNum}
                </div>
            );
        }

        let daysWithFichasCount = 0;
        let peorEstadoMes: 'pagado'|'parcial'|'pendiente'|'mora' = 'pagado';

        for (let d = 1; d <= daysInMonth; d++) {
            const dateKey = `${currentYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayFichas = groupByDate.get(dateKey) || [];
            
            const isToday = new Date().toLocaleDateString('en-CA') === dateKey;
            const hasFichas = dayFichas.length > 0;

            if (hasFichas) {
                daysWithFichasCount++;
                const peorDia = estadoMasGrave(dayFichas);
                if (PRIORIDAD[peorDia] > PRIORIDAD[peorEstadoMes]) peorEstadoMes = peorDia;
            }

            const estadoColor = hasFichas ? ESTADO_GRID[estadoMasGrave(dayFichas)] : '';
            const esDiaSeleccionado = diaSeleccionado === dateKey;

            let classes = "w-[18px] h-[18px] rounded-full text-[10px] mx-auto flex items-center justify-center select-none transition-transform ";
            if (hasFichas) {
                classes += `cursor-pointer font-medium hover:scale-110 ${estadoColor}`;
            } else if (isToday) {
                classes += `bg-[#1A1B2E] text-[#CECBF6] font-[600]`;
            } else {
                classes += `text-[#888780] hover:bg-[#E2E0D8] cursor-pointer`;
            }

            if (esDiaSeleccionado) {
                classes += ` ring-[2px] ring-[#1a1a18] ring-offset-[1.5px] scale-110 font-bold`;
            }

            cells.push(
                <div 
                    key={dateKey}
                    onClick={() => handleDiaClick(dateKey)}
                    className="relative flex justify-center cursor-pointer"
                >
                    <div className={classes}>
                        <span className="leading-none">{d}</span>
                    </div>
                </div>
            );
        }

        // Si la cuadrícula no llega a 42 celdas, llenamos con días del siguiente mes para que quede estético y uniforme
        const totalCellsSoFar = firstDayOfWeek + daysInMonth;
        const totalRows = Math.ceil(totalCellsSoFar / 7);
        const targetCells = totalRows * 7;
        
        for (let i = totalCellsSoFar; i < targetCells; i++) {
            const nextMonthDayNum = i - totalCellsSoFar + 1;
            cells.push(
                <div key={`next-empty-${i}`} className="w-[18px] h-[18px] text-[10px] mx-auto flex items-center justify-center text-[#D3D1C7] select-none">
                    {nextMonthDayNum}
                </div>
            );
        }

        return (
            <div key={monthIndex} className="mes flex flex-col p-[10px_10px_8px] w-full relative">
                <div className="flex items-center justify-between mb-[8px] pl-[4px]">
                    <span className="text-[11px] font-[500] text-[#1A1B2E] uppercase tracking-[0.07em]">
                        {MONTH_NAMES[monthIndex]}
                    </span>
                    {daysWithFichasCount > 0 && (
                        <span className="text-[10px] font-medium text-[#B4B2A9]">
                            {daysWithFichasCount}
                        </span>
                    )}
                </div>
                <div className="grid grid-cols-7 gap-x-[2px] justify-items-center mb-[4px]">
                    {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((wd, i) => (
                        <div key={i} className="w-full text-center text-[10px] text-[#B4B2A9] font-medium leading-none">{wd}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-x-[2px] gap-y-[4px] justify-items-center content-start">
                    {cells}
                </div>
            </div>
        );
    };

    const activeFichasInYear = filteredFichas.filter(f => f.emision.startsWith(currentYear.toString())).length;

    return (
        <div className="w-[787px] mx-auto bg-[#FAFAF8] border-[0.5px] border-[#E2E0D8] rounded-[12px] font-sans flex flex-col relative shrink-0">
            
            {/* Header / Controles */}
            <div className="flex items-center justify-between p-[12px_20px] bg-white border-b-[0.5px] border-[#E2E0D8] rounded-t-[12px] shrink-0">
                <div className="flex items-center gap-[10px]">
                    <div className="w-[28px] h-[28px] bg-[#EEEDFE] rounded-[6px] flex items-center justify-center flex-shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#534AB7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-[14px] font-[500] text-[#1A1B2E] leading-tight mb-[1px]">Calendario de créditos</h2>
                        <p className="text-[11px] text-[#888780] leading-none">{activeFichasInYear} ficha{activeFichasInYear !== 1 ? 's' : ''}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-[12px]">
                    <div className="relative">
                        <select
                            value={selectedClientId}
                            onChange={e => handleFiltroCliente(e.target.value)}
                            className="h-[28px] px-[12px] rounded-[6px] border-[0.5px] border-[#E2E0D8] bg-white text-[12px] font-medium text-[#1A1B2E] focus:outline-none hover:bg-[#F9F9F9] transition-colors max-w-[150px] truncate appearance-none pr-[24px]"
                        >
                            <option value="all">Todos los clientes</option>
                            {clientes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <div className="absolute right-[8px] top-1/2 -translate-y-1/2 pointer-events-none text-[#5F5E5A]">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                    </div>

                    <div className="flex items-center justify-between h-[28px] bg-[#F1EFE8] rounded-[6px] overflow-hidden">
                        <button onClick={() => changeYear(-1)} className="w-[24px] h-full flex items-center justify-center text-[#5F5E5A] hover:bg-[#E8E6DF] transition-colors"><ChevronLeft className="w-[14px] h-[14px]" /></button>
                        <span className="min-w-[40px] px-1 text-center text-[13px] font-[500] text-[#2C2C2A]">{currentYear}</span>
                        <button onClick={() => changeYear(1)} className="w-[24px] h-full flex items-center justify-center text-[#5F5E5A] hover:bg-[#E8E6DF] transition-colors"><ChevronRight className="w-[14px] h-[14px]" /></button>
                    </div>
                </div>
            </div>

            {/* Grid 6x2 */}
            <style dangerouslySetInnerHTML={{__html: `
                .mes { border-right: 0.5px solid #E2E0D8; border-bottom: 0.5px solid #E2E0D8; }
                .mes:nth-child(6n)  { border-right: none; }
                .mes:nth-child(n+7) { border-bottom: none; }
            `}} />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 w-full">
                {Array.from({ length: 12 }).map((_, i) => renderMonthGrid(i))}
            </div>

            {/* Footer / Leyenda */}
            <div className="flex items-center justify-between p-[8px_20px] bg-white border-t-[0.5px] border-[#E2E0D8] rounded-b-[12px] shrink-0">
                <div className="flex items-center gap-[24px]">
                    <div className="flex items-center gap-[6px]">
                        <span className="w-[8px] h-[8px] rounded-full bg-[#1A1B2E]"></span>
                        <span className="text-[11px] font-medium text-[#888780]">Hoy</span>
                    </div>
                    <div className="flex items-center gap-[6px]">
                        <span className="w-[8px] h-[8px] rounded-full bg-[#FAEEDA]"></span>
                        <span className="text-[11px] font-medium text-[#888780]">Pendiente</span>
                    </div>
                    <div className="flex items-center gap-[6px]">
                        <span className="w-[8px] h-[8px] rounded-full bg-[#FCEBEB]"></span>
                        <span className="text-[11px] font-medium text-[#888780]">En mora</span>
                    </div>
                    <div className="flex items-center gap-[6px]">
                        <span className="w-[8px] h-[8px] rounded-full bg-[#EAF3DE]"></span>
                        <span className="text-[11px] font-medium text-[#888780]">Parcial / Pagado</span>
                    </div>
                </div>
                <div className="text-[11px] font-medium text-[#B4B2A9] text-right">
                    Hoy: {new Date().toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
            </div>

            {/* PASO 3 — OVERLAY Y VENTANA FLOTANTE */}
            {diaSeleccionado && (
                <div 
                    className="fixed inset-0 z-[9999] bg-[rgba(0,0,0,0.35)] flex items-center justify-center p-[1rem] max-sm:items-end animate-fade-in"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) cerrarVentana();
                    }}
                >
                    <VentanaFlotante 
                        fecha={diaSeleccionado}
                        fichas={fichasDelDia}
                        factorRecargo={factorRecargo}
                        onCerrar={cerrarVentana}
                        onRegistrarPago={(fichaId, clienteId) => {
                            cerrarVentana();
                            onRegistrarPago(fichaId, clienteId);
                        }}
                        onVerHistorial={(fichaId, clienteId) => {
                            cerrarVentana();
                            onVerHistorial(fichaId, clienteId);
                        }}
                    />
                </div>
            )}
        </div>
    );
}

// PASO 4 — COMPONENTE VentanaFlotante
function VentanaFlotante({ fecha, fichas, factorRecargo, onCerrar, onRegistrarPago, onVerHistorial }: {
    fecha: string;
    fichas: FichaCalendarioDato[];
    factorRecargo: number;
    onCerrar: () => void;
    onRegistrarPago: (fid: string, cid: string) => void;
    onVerHistorial: (fid: string, cid: string) => void;
}) {
    const fechaObj = new Date(fecha + 'T12:00:00');
    // Generar: "VIERNES · 2 OCT. 2026"
    const dayName = fechaObj.toLocaleDateString('es-VE', { weekday: 'long' }).toUpperCase();
    const day = fechaObj.getDate();
    const monthName = fechaObj.toLocaleDateString('es-VE', { month: 'short' }).toUpperCase().replace('.', '');
    const year = fechaObj.getFullYear();
    const displayString = `${dayName} · ${day} ${monthName}. ${year}`;
    
    const FACTOR = 1 + (factorRecargo / 100);
    
    // Suma de los "TOTAL (+X%)" de todas las facturas del día
    const totalSaldosConRecargo = fichas.reduce((acc, f) => {
        const saldo = f.original - f.pagado;
        return acc + (saldo > 0 ? saldo * FACTOR : 0);
    }, 0);

    return (
        <div 
            className="relative w-full max-w-[360px] max-h-[80vh] flex flex-col bg-[#ffffff] border-[0.5px] border-[#E2E0D8] rounded-[10px] overflow-hidden max-sm:max-h-[90vh] max-sm:rounded-[10px_10px_0_0] shadow-2xl animate-fade-in"
            onClick={e => e.stopPropagation()}
        >
            {/* HEADER */}
            <div className="shrink-0 bg-[#FAFAF8] border-b-[0.5px] border-[#E2E0D8] p-[11px_14px] flex items-center justify-between">
                <div>
                    <h3 className="text-[12px] font-[500] text-[#1A1B2E] uppercase tracking-[0.06em] mb-[2px]">{displayString}</h3>
                    <p className="text-[10px] text-[#888780]">
                        {fichas.length} factura{fichas.length !== 1 ? 's' : ''} · ${totalSaldosConRecargo.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})} total
                    </p>
                </div>
                <button 
                    onClick={onCerrar} 
                    className="w-[28px] h-[28px] rounded-full bg-white border-[0.5px] border-[#E2E0D8] text-[#888780] flex items-center justify-center hover:bg-[#F9F9F9] transition-colors"
                >
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* GRID DE FICHAS (scrollable) */}
            <div className="overflow-y-auto flex-1 p-[10px_12px] flex flex-col gap-[8px]" style={{ overscrollBehavior: 'contain' }}>
                {fichas.map(f => (
                    <FichaCard 
                        key={f.id} 
                        ficha={f} 
                        factor={FACTOR} 
                        factorStr={`+${factorRecargo}%`}
                        onRegistrarPago={onRegistrarPago} 
                        onVerHistorial={onVerHistorial} 
                    />
                ))}
            </div>
        </div>
    );
}

// PASO 5 — COMPONENTE FichaCard
function FichaCard({ ficha, factor, factorStr, onRegistrarPago, onVerHistorial }: {
    ficha: FichaCalendarioDato;
    factor: number;
    factorStr: string;
    onRegistrarPago: (fid: string, cid: string) => void;
    onVerHistorial: (fid: string, cid: string) => void;
}) {
    const saldo = ficha.original - ficha.pagado;
    const total = saldo * factor;
    const pct = ficha.original > 0 ? Math.round(ficha.pagado / ficha.original * 100) : 0;

    const getInitials = (name: string) => {
        const parts = name.trim().split(' ');
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase() || 'NA';
    };

    const ESTADO_CFG = { 
        mora:      { label: 'En mora',   bg: '#FCEBEB', text: '#A32D2D', border: '#A32D2D' }, 
        pendiente: { label: 'Pendiente', bg: '#FAEEDA', text: '#854F0B', border: '#BA7517' }, 
        pagado:    { label: 'Al día',    bg: '#EAF3DE', text: '#27500A', border: '#3B6D11' }, 
        parcial:   { label: 'Parcial',   bg: '#EAF3DE', text: '#27500A', border: '#3B6D11' }, 
    };
    const cfg = ESTADO_CFG[ficha.estado] || ESTADO_CFG.pendiente;

    const fmtNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
        <div className="bg-[#FAFAF8] rounded-[8px] p-[16px] relative overflow-hidden shrink-0 flex flex-col gap-[14px] border-[0.5px] border-[#E2E0D8]">
            {/* Borde lateral */}
            <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: cfg.border }} />

            {/* HEADER: Avatar, Nombre, Badge */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-[10px] overflow-hidden">
                    <div 
                        className="w-[32px] h-[32px] shrink-0 rounded-full flex items-center justify-center font-[600] text-[12px]"
                        style={{ background: cfg.bg, color: cfg.text }}
                    >
                        {getInitials(ficha.clienteNombre)}
                    </div>
                    <div className="truncate">
                        <p className="text-[14px] font-[600] text-[#1A1B2E] truncate leading-tight">{ficha.clienteNombre || 'Cliente'}</p>
                        <p className="text-[11px] text-[#888780] mt-[2px] truncate">{ficha.id}</p>
                    </div>
                </div>
                
                <div 
                    className="shrink-0 px-[10px] py-[3px] rounded-[99px] text-[10px] font-[600]"
                    style={{ background: cfg.bg, color: cfg.text }}
                >
                    {cfg.label}
                </div>
            </div>

            {/* MONTOS BASE / +30% */}
            <div className="flex justify-between items-center relative">
                <div>
                    <p className="text-[9px] uppercase text-[#B4B2A9] font-[600] tracking-wider mb-[2px]">BASE</p>
                    <p className="text-[16px] font-[500] text-[#1A1B2E] leading-none">${fmtNum(saldo)}</p>
                </div>
                <div className="text-right">
                    <p className="text-[9px] uppercase text-[#B4B2A9] font-[600] tracking-wider mb-[2px]">{factorStr}</p>
                    <p className="text-[16px] font-[500] leading-none text-[#3B6D11]">${fmtNum(saldo <= 0 ? 0 : total)}</p>
                </div>
            </div>

            {/* BARRA PROGRESO */}
            <div className="h-[3px] bg-[#E2E0D8] rounded-full overflow-hidden w-full">
                <div className="h-full rounded-full transition-all duration-500 relative" style={{ width: `${Math.max(pct, 2)}%`, background: cfg.border }}>
                </div>
            </div>

            {/* BOTONES */}
            <div className="flex gap-[8px] mt-[4px]">
                <button 
                    disabled={saldo <= 0} 
                    onClick={() => onRegistrarPago(ficha.id, ficha.clienteId)} 
                    className={`flex-[1.5] py-[8px] rounded-[6px] text-[12px] font-[600] transition-colors flex items-center justify-center gap-[2px]
                        ${saldo <= 0 ? 'bg-[#E2E0D8] text-[#888780] cursor-not-allowed' : 'bg-[#1A1B2E] text-[#CECBF6] hover:bg-[#252640] cursor-pointer'}
                    `}
                >
                    {saldo > 0 && <span className="text-[13px] leading-none">+</span>} Registrar pago
                </button>
                <button 
                    onClick={() => onVerHistorial(ficha.id, ficha.clienteId)} 
                    className="flex-1 py-[8px] rounded-[6px] bg-white border-[0.5px] border-[#E2E0D8] text-[12px] font-[600] text-[#5F5E5A] hover:bg-[#F9F9F9] transition-colors cursor-pointer"
                >
                    Historial
                </button>
            </div>
        </div>
    );
}
