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

    const colorClasses = {
        mora: 'bg-[#E24B4A] text-white',
        pendiente: 'bg-[#EF9F27] text-white',
        parcial: 'bg-[#378ADD] text-white',
        pagado: 'bg-[#1D9E75] text-white'
    };

    const renderMonthGrid = (monthIndex: number) => {
        const date = new Date(currentYear, monthIndex, 1);
        const daysInMonth = new Date(currentYear, monthIndex + 1, 0).getDate();
        const firstDayOfWeek = date.getDay();

        const cells = [];
        for (let i = 0; i < firstDayOfWeek; i++) {
            cells.push(<div key={`empty-${i}`} className="w-6 h-6" />);
        }

        let daysWithFichasCount = 0;
        let peorEstadoMes: 'pagado'|'parcial'|'pendiente'|'mora' = 'pagado';

        for (let d = 1; d <= daysInMonth; d++) {
            const dateKey = `${currentYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayFichas = groupByDate.get(dateKey) || [];
            
            const isToday = new Date().toLocaleDateString('en-CA') === dateKey;
            const hasFichas = dayFichas.length > 0;
            const multipleFichas = dayFichas.length > 1;

            if (hasFichas) {
                daysWithFichasCount++;
                const peorDia = estadoMasGrave(dayFichas);
                if (PRIORIDAD[peorDia] > PRIORIDAD[peorEstadoMes]) peorEstadoMes = peorDia;
            }

            const estadoColor = hasFichas ? colorClasses[estadoMasGrave(dayFichas)] : '';
            // PASO 9 — Marcar día seleccionado
            const esDiaSeleccionado = diaSeleccionado === dateKey;

            cells.push(
                <div 
                    key={dateKey}
                    onClick={() => handleDiaClick(dateKey)}
                    className={`w-6 h-6 flex flex-col items-center justify-center text-[11px] select-none transition-all relative z-10
                        ${hasFichas ? 'rounded-full cursor-pointer hover:opacity-80 hover:scale-110 font-medium ' + estadoColor : 'text-[#888780]'}
                        ${!hasFichas && isToday ? 'bg-[#1a1a18] text-white rounded-full' : ''}
                        ${esDiaSeleccionado ? 'outline-[2.5px] outline-solid outline-[#1a1a18] outline-offset-[1.5px] scale-110' : ''}
                    `}
                >
                    <span className="leading-none">{d}</span>
                    {multipleFichas && (
                        <span className="absolute -bottom-[2px] w-[3px] h-[3px] bg-white rounded-full shadow-[0_0_2px_rgba(0,0,0,0.5)]"></span>
                    )}
                </div>
            );
        }

        // badge configs
        let badgeBg = 'bg-transparent';
        let badgeColor = 'text-[#d3d1c7]';
        let badgeText = '—';

        if (daysWithFichasCount > 0) {
            badgeText = `${daysWithFichasCount}f`;
            if (peorEstadoMes === 'mora') { badgeBg = 'bg-[#FCEBEB]'; badgeColor = 'text-[#A32D2D]'; }
            else if (peorEstadoMes === 'pendiente') { badgeBg = 'bg-[#FAEEDA]'; badgeColor = 'text-[#633806]'; }
            else { badgeBg = 'bg-[#E1F5EE]'; badgeColor = 'text-[#085041]'; }
        }

        return (
            // The class 'mes' goes on the wrapper
            <div key={monthIndex} className="mes flex flex-col p-4 w-full relative">
                <div className="flex items-center justify-between mb-3 px-1">
                    <span className="text-[13px] font-medium text-[#1a1a18]">{MONTH_NAMES[monthIndex].substring(0,3)}</span>
                    <span className={`px-[5px] py-[2px] rounded-[4px] text-[10px] font-bold tracking-wide leading-none ${badgeBg} ${badgeColor}`}>
                        {badgeText}
                    </span>
                </div>
                <div className="grid grid-cols-7 gap-x-[2px] justify-items-center mb-1">
                    {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((wd, i) => (
                        <div key={i} className="w-6 text-center text-[10px] text-[#b4b2a9] font-medium">{wd}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-x-[2px] gap-y-[2px] justify-items-center">
                    {cells}
                </div>
            </div>
        );
    };

    const activeFichasInYear = filteredFichas.filter(f => f.emision.startsWith(currentYear.toString())).length;

    return (
        <div className="relative w-full bg-[#ffffff] border border-[#e8e6e0] rounded-[10px] overflow-hidden font-sans">
            
            {/* Header / Controles */}
            <div className="flex items-center justify-between p-5 border-b border-[#e8e6e0]">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">📅</span>
                        <div>
                            <h2 className="text-base font-medium text-[#1a1a18] leading-tight">Calendario de créditos</h2>
                            <p className="text-[11px] text-[#888780] font-medium mt-0.5">{activeFichasInYear} ficha{activeFichasInYear !== 1 ? 's' : ''} · {currentYear}</p>
                        </div>
                    </div>
                    {/* Leyenda dots */}
                    <div className="ml-8 hidden md:flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#E24B4A]"></span>
                        <span className="w-2 h-2 rounded-full bg-[#EF9F27]"></span>
                        <span className="w-2 h-2 rounded-full bg-[#378ADD]"></span>
                        <span className="w-2 h-2 rounded-full bg-[#1D9E75]"></span>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-between w-[96px] h-[28px] border border-[#d3d1c7] rounded-[7px] bg-white overflow-hidden">
                        <button onClick={() => changeYear(-1)} className="w-[26px] h-full flex items-center justify-center text-[#888780] hover:bg-[#f5f4f0] hover:text-[#1a1a18] transition-colors"><ChevronLeft className="w-3.5 h-3.5" /></button>
                        <span className="w-[44px] text-center text-[12px] font-medium text-[#1a1a18]">{currentYear}</span>
                        <button onClick={() => changeYear(1)} className="w-[26px] h-full flex items-center justify-center text-[#888780] hover:bg-[#f5f4f0] hover:text-[#1a1a18] transition-colors"><ChevronRight className="w-3.5 h-3.5" /></button>
                    </div>

                    <select
                        value={selectedClientId}
                        onChange={e => handleFiltroCliente(e.target.value)}
                        className="h-[28px] px-2 rounded-[7px] border border-[#d3d1c7] bg-white text-[12px] font-medium text-[#1a1a18] focus:outline-none hover:bg-[#f5f4f0] transition-colors max-w-[150px] truncate"
                    >
                        <option value="all">Todos los clientes</option>
                        {clientes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
            </div>

            {/* Grid 6x2 */}
            <style dangerouslySetInnerHTML={{__html: `
                .mes { border-right: 0.5px solid #e8e6e0; border-bottom: 0.5px solid #e8e6e0; }
                .mes:nth-child(6n)  { border-right: none; }
                .mes:nth-child(n+7) { border-bottom: none; }
                .mes.alt { background: #fafaf8; }
                .mes:not(.alt) { background: #fff; }
            `}} />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 w-full">
                {Array.from({ length: 12 }).map((_, i) => (
                    <div className={`mes ${i % 2 === 1 ? 'alt' : ''}`} key={i}>
                        {renderMonthGrid(i)}
                    </div>
                ))}
            </div>

            {/* PASO 3 — OVERLAY Y VENTANA FLOTANTE */}
            {diaSeleccionado && (
                <div 
                    className="fixed inset-0 bg-[rgba(0,0,0,0.45)] z-[9999] flex items-center justify-center animate-fade-in"
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
        <div className="bg-[#2B2B2B] rounded-[8px] w-[360px] max-w-[95%] shadow-2xl flex flex-col overflow-hidden transform scale-105 duration-200 transition-transform" 
            style={{ maxHeight: '85vh' }}
        >
            {/* HEADER */}
            <div className="bg-[#1A1B2E] p-[16px_20px] flex items-start justify-between relative shrink-0">
                <div>
                    <h3 className="text-[14px] font-bold text-[#CECBF6] tracking-wide mb-1">{displayString}</h3>
                    <p className="text-[12px] text-[#A0A2E8]">
                        {fichas.length} factura{fichas.length !== 1 ? 's' : ''} · ${totalSaldosConRecargo.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})} total
                    </p>
                </div>
                <button 
                    onClick={onCerrar} 
                    className="w-[28px] h-[28px] rounded-full bg-[#2A2B45] text-[#A0A2E8] flex items-center justify-center hover:bg-[#3E3F61] hover:text-white transition-colors border border-[#3E3F61]"
                >
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* GRID DE FICHAS (scrollable) */}
            <div className="p-[16px_16px] flex flex-col gap-[14px] overflow-y-auto dark-scrollbar" style={{ overscrollBehavior: 'contain' }}>
                <style dangerouslySetInnerHTML={{__html: `
                    .dark-scrollbar::-webkit-scrollbar { width: 6px; }
                    .dark-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .dark-scrollbar::-webkit-scrollbar-thumb { background: #4A4A4A; border-radius: 4px; }
                    .dark-scrollbar::-webkit-scrollbar-thumb:hover { background: #606060; }
                `}} />
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
        pendiente: { label: 'Pendiente', bg: '#EFEFFA', text: '#534AB7', border: '#534AB7' }, 
        pagado:    { label: 'Al día',    bg: '#E1F5EE', text: '#085041', border: '#1D9E75' }, 
        parcial:   { label: 'Parcial',   bg: '#E1F5EE', text: '#0F6E56', border: '#0F6E56' }, 
    };
    const cfg = ESTADO_CFG[ficha.estado] || ESTADO_CFG.pendiente;

    const fmtNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
        <div className="bg-[#242424] rounded-[8px] p-[16px] relative overflow-hidden shrink-0 flex flex-col gap-[14px] border border-[#3A3A3A]">
            {/* Borde lateral */}
            <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: cfg.border }} />

            {/* HEADER: Avatar, Nombre, Badge */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-[10px] overflow-hidden">
                    <div 
                        className="w-[32px] h-[32px] shrink-0 rounded-full flex items-center justify-center font-bold text-[12px]"
                        style={{ background: cfg.bg, color: cfg.text }}
                    >
                        {getInitials(ficha.clienteNombre)}
                    </div>
                    <div className="truncate">
                        <p className="text-[14px] font-semibold text-white truncate leading-tight">{ficha.clienteNombre || 'Cliente'}</p>
                        <p className="text-[11px] text-[#A0A0A0] mt-[2px] truncate">{ficha.id}</p>
                    </div>
                </div>
                
                <div 
                    className="shrink-0 px-[10px] py-[3px] rounded-full text-[11px] font-semibold"
                    style={{ background: cfg.bg, color: cfg.text }}
                >
                    {cfg.label}
                </div>
            </div>

            {/* MONTOS BASE / +30% */}
            <div className="flex justify-between items-center relative">
                <div>
                    <p className="text-[10px] uppercase text-[#A0A0A0] font-semibold tracking-wider mb-[2px]">BASE</p>
                    <p className="text-[17px] font-semibold text-white leading-none">${fmtNum(saldo)}</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] uppercase text-[#A0A0A0] font-semibold tracking-wider mb-[2px]">{factorStr}</p>
                    <p className="text-[17px] font-semibold leading-none" style={{ color: cfg.border }}>${fmtNum(saldo <= 0 ? 0 : total)}</p>
                </div>
            </div>

            {/* BARRA PROGRESO */}
            <div className="h-[3px] bg-[#3B3B3B] rounded-full overflow-hidden w-full">
                <div className="h-full rounded-full transition-all duration-500 relative" style={{ width: `${Math.max(pct, 2)}%`, background: cfg.border }}>
                     {/* The bright edge for premium look */}
                     <div className="absolute right-0 top-0 bottom-0 w-[4px] bg-white opacity-40 rounded-r-full" />
                </div>
            </div>

            {/* BOTONES */}
            <div className="flex gap-[8px] mt-[4px]">
                <button 
                    disabled={saldo <= 0} 
                    onClick={() => onRegistrarPago(ficha.id, ficha.clienteId)} 
                    className={`flex-[1.5] py-[8px] rounded-[6px] text-[12px] font-semibold transition-colors flex items-center justify-center gap-[2px] border border-transparent
                        ${saldo <= 0 ? 'bg-[#3B3B3B] text-[#808080] cursor-not-allowed border-[#4A4A4A]' : 'bg-[#1A1B2E] text-[#CECBF6] hover:bg-[#252640] hover:text-white cursor-pointer'}
                    `}
                >
                    {saldo > 0 && <span className="text-[13px] leading-none">+</span>} Registrar pago
                </button>
                <button 
                    onClick={() => onVerHistorial(ficha.id, ficha.clienteId)} 
                    className="flex-1 py-[8px] rounded-[6px] border border-[#4A4A4A] text-[12px] font-semibold text-[#D0D0D0] hover:bg-[#3B3B3B] hover:text-white transition-colors cursor-pointer"
                >
                    Historial
                </button>
            </div>
        </div>
    );
}
