import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X, FileText } from 'lucide-react';
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

const formatMoney = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const PRIORIDAD = { mora: 3, pendiente: 2, parcial: 1, pagado: 0 };
function estadoMasGrave(fichasDelDia: FichaCalendarioDato[]) {
    return fichasDelDia.reduce((peor, f) => PRIORIDAD[f.estado] > PRIORIDAD[peor] ? f.estado : peor, 'pagado' as 'mora' | 'pendiente' | 'parcial' | 'pagado');
}

export function CalendarioCreditos({ fichas, clientes, factorRecargo, onRegistrarPago, onVerHistorial }: Props) {
    const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
    const [selectedClientId, setSelectedClientId] = useState<string>('all');
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    const FACTOR = 1 + (factorRecargo / 100);

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

    const changeYear = (delta: number) => {
        setCurrentYear(y => y + delta);
        setSelectedDate(null);
    };

    const colorClasses = {
        mora: 'bg-[#E24B4A] text-white',
        pendiente: 'bg-[#EF9F27] text-white', // prompt requests color: #fff here
        parcial: 'bg-[#378ADD] text-white',
        pagado: 'bg-[#1D9E75] text-white'
    };

    const handleDayClick = (dateStr: string, hasFichas: boolean) => {
        if (!hasFichas) return;
        if (selectedDate === dateStr) {
            setSelectedDate(null);
        } else {
            setSelectedDate(dateStr);
        }
    };

    const renderMonthGrid = (monthIndex: number) => {
        const date = new Date(currentYear, monthIndex, 1);
        const daysInMonth = new Date(currentYear, monthIndex + 1, 0).getDate();
        const firstDayOfWeek = date.getDay(); // 0 = Sunday

        const cells = [];
        // padding
        for (let i = 0; i < firstDayOfWeek; i++) {
            cells.push(<div key={`empty-${i}`} className="w-6 h-6" />);
        }

        let daysWithFichasCount = 0;
        let peorEstadoMes: 'pagado'|'parcial'|'pendiente'|'mora' = 'pagado';

        for (let d = 1; d <= daysInMonth; d++) {
            const dateKey = `${currentYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayFichas = groupByDate.get(dateKey) || [];
            
            const isToday = new Date().toLocaleDateString('en-CA') === dateKey; // en-CA gives YYYY-MM-DD local
            const hasFichas = dayFichas.length > 0;
            const multipleFichas = dayFichas.length > 1;

            if (hasFichas) {
                daysWithFichasCount++;
                const peorDia = estadoMasGrave(dayFichas);
                if (PRIORIDAD[peorDia] > PRIORIDAD[peorEstadoMes]) peorEstadoMes = peorDia;
            }

            const estadoColor = hasFichas ? colorClasses[estadoMasGrave(dayFichas)] : '';
            const isSelected = selectedDate === dateKey;

            cells.push(
                <div 
                    key={dateKey}
                    onClick={() => handleDayClick(dateKey, hasFichas)}
                    className={`w-6 h-6 flex flex-col items-center justify-center text-[11px] select-none transition-all relative z-10
                        ${hasFichas ? 'rounded-full cursor-pointer hover:opacity-80 hover:scale-110 font-medium ' + estadoColor : 'text-[#888780]'}
                        ${!hasFichas && isToday ? 'bg-[#1a1a18] text-white rounded-full' : ''}
                        ${isSelected ? 'ring-2 ring-white ring-offset-[1px] ring-offset-[#1a1a18]' : ''}
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
                        onChange={e => setSelectedClientId(e.target.value)}
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

            {/* Overlay Window */}
            {selectedDate && (
                <div 
                    className="absolute inset-0 bg-[#0f0f0c47] backdrop-blur-[1px] rounded-[10px] z-20 flex items-center justify-center"
                    onClick={() => setSelectedDate(null)}
                >
                    <div 
                        className="bg-white border border-[#e8e6e0] rounded-[14px] w-[95vw] sm:w-max sm:min-w-[340px] max-w-[920px] max-h-[80%] overflow-y-auto flex flex-col shadow-[0_8px_32px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.06)] animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()} // prevent closing overlay
                    >
                        {(() => {
                            const dateObj = new Date(selectedDate + 'T12:00:00'); // ensure local timezone isn't nudged
                            const headerDate = dateObj.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                            const dayFichas = groupByDate.get(selectedDate) || [];

                            return (
                                <>
                                    <div className="sticky top-0 bg-white/95 backdrop-blur z-10 p-4 border-b border-[#e8e6e0] flex items-center justify-between">
                                        <div>
                                            <h3 className="text-[13px] font-medium text-[#1a1a18] capitalize">{headerDate}</h3>
                                            <p className="text-[11px] text-[#888780]">{dayFichas.length} ficha{dayFichas.length !== 1 ? 's' : ''}</p>
                                        </div>
                                        <button onClick={() => setSelectedDate(null)} className="w-[24px] h-[24px] flex items-center justify-center rounded-[5px] text-[#888780] hover:bg-[#f5f4f0] transition-colors">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    <div className="p-4 flex flex-row flex-wrap gap-4 justify-center sm:justify-start">
                                        {dayFichas.map(ficha => {
                                            const saldoBase = ficha.original - ficha.pagado;
                                            const total = saldoBase * FACTOR;
                                            const pct = Math.round((ficha.pagado / ficha.original) * 100) || 0;
                                            const isPagado = saldoBase <= 0;

                                            let colorHex = '#1D9E75';
                                            if (ficha.estado === 'mora') colorHex = '#E24B4A';
                                            else if (ficha.estado === 'pendiente') colorHex = '#EF9F27';
                                            else if (ficha.estado === 'parcial') colorHex = '#378ADD';

                                            let progressColor = '#E24B4A';
                                            if (pct >= 60) progressColor = '#1D9E75';
                                            else if (pct > 0) progressColor = '#378ADD';

                                            return (
                                                <div key={ficha.id} className="relative bg-[#fafaf8] border border-[#e8e6e0] rounded-[10px] p-[14px] flex flex-col gap-2 w-full sm:w-[280px] shrink-0">
                                                    <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: colorHex }}></div>
                                                    
                                                    <div className="flex items-start justify-between pl-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <FileText className="w-3.5 h-3.5 text-[#b4b2a9]" />
                                                            <span className="text-[12px] font-medium text-[#1a1a18]">{ficha.id}</span>
                                                        </div>
                                                        <div className="px-1.5 py-[1px] rounded-[20px] text-[9px] font-medium uppercase tracking-wider" 
                                                             style={{ backgroundColor: `${colorHex}15`, color: colorHex }}>
                                                            {ficha.estado}
                                                        </div>
                                                    </div>

                                                    {(selectedClientId === 'all' || selectedClientId === '') && (
                                                        <div className="pl-1 text-[11px] font-medium text-[#1a1a18] mt-[-4px]">
                                                            {ficha.clienteNombre}
                                                        </div>
                                                    )}

                                                    <div className="flex justify-between items-end mt-1 pl-1">
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-medium text-[#888780] uppercase tracking-wide">SALDO BASE</span>
                                                            <span className={`text-[16px] font-medium leading-none mt-1 ${isPagado ? 'text-[#1D9E75]' : 'text-[#1a1a18]'}`}>
                                                                {formatMoney(saldoBase)}
                                                            </span>
                                                            <span className="text-[10px] text-[#888780] mt-0.5">Orig: {formatMoney(ficha.original)}</span>
                                                        </div>
                                                        <div className="flex flex-col items-end text-right">
                                                            <span className="text-[9px] font-medium text-[#888780] uppercase tracking-wide mt-1">TOTAL (+30%)</span>
                                                            <span className={`text-[12px] font-medium leading-none mt-0.5 ${isPagado ? 'text-[#1D9E75]' : 'text-[#BA7517]'}`}>
                                                                {formatMoney(total)}
                                                            </span>
                                                            <span className="text-[10px] text-[#888780] mt-0.5">Abonado: {formatMoney(ficha.pagado)}</span>
                                                        </div>
                                                    </div>

                                                    <div className="pl-1 mt-1 pr-1">
                                                        <div className="w-full h-[3px] bg-[#e8e6e0] rounded-[2px] overflow-hidden mb-1">
                                                            <div className="h-full rounded-[2px] transition-all" style={{ width: `${pct}%`, backgroundColor: progressColor }}></div>
                                                        </div>
                                                        <span className="text-[9px] font-medium" style={{ color: progressColor }}>{pct}% cubierto</span>
                                                    </div>

                                                    <div className="pl-1 text-[10px] text-[#888780] mb-1">
                                                        Emisión: <strong className="text-[#1a1a18] font-medium">{ficha.emision}</strong><br/>
                                                        Vence: <strong className="text-[#1a1a18] font-medium">{ficha.vencimiento}</strong>
                                                    </div>

                                                    <div className="flex items-center gap-2 mt-2">
                                                        <button 
                                                            onClick={() => onRegistrarPago(ficha.id, ficha.clienteId)}
                                                            disabled={isPagado}
                                                            className={`flex-[3] h-7 rounded-[5px] text-[11px] font-medium flex items-center justify-center transition-colors
                                                                ${isPagado 
                                                                    ? 'bg-[#f0efe8] text-[#b4b2a9] cursor-not-allowed' 
                                                                    : 'bg-[#1D9E75] text-white hover:bg-[#168a65] shadow-sm'
                                                                }`}
                                                        >
                                                            + Registrar pago
                                                        </button>
                                                        <button 
                                                            onClick={() => onVerHistorial(ficha.id, ficha.clienteId)}
                                                            className="flex-[2] h-7 rounded-[5px] text-[11px] font-medium flex items-center justify-center bg-white border border-[#d3d1c7] text-[#444441] hover:bg-[#f5f4f0] transition-colors shadow-sm"
                                                        >
                                                            Ver historial
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
}
