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
    
    // PASO 1 — Estados para la ventana flotante
    const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
    const [fichasDelDia, setFichasDelDia] = useState<FichaCalendarioDato[]>([]);

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
                    className="absolute inset-0 bg-[#0f0f0c47] backdrop-blur-[1px] rounded-[10px] z-20 flex items-center justify-center animate-fade-in"
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
    const fechaFormateada = fechaObj.toLocaleDateString('es-VE', { 
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
    });
    const fechaDisplay = fechaFormateada.charAt(0).toUpperCase() + fechaFormateada.slice(1);
    const FACTOR = 1 + (factorRecargo / 100);

    return (
        <div className="bg-white rounded-[16px] border border-[#e8e6e0] w-[560px] max-w-[90%] max-h-[80%] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,.18),0_2px_8px_rgba(0,0,0,.06)] animate-popIn">
            {/* HEADER */}
            <div className="p-[16px_20px_12px] flex items-start justify-between">
                <div>
                    <p className="text-[14px] font-medium text-[#1a1a18]">{fechaDisplay}</p>
                    <p className="text-[11px] text-[#888780] mt-[3px]">
                        {fichas.length} ficha{fichas.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button onClick={onCerrar} className="bg-[#f5f4f0] border-none cursor-pointer w-[28px] h-[28px] rounded-full text-[14px] color-[#888780] flex items-center justify-center hover:bg-[#e8e6e0] transition-colors">✕</button>
            </div>

            <hr className="border-none border-t border-[#f0efe8] mx-[20px]" />

            {/* GRID DE FICHAS */}
            <div className="p-[14px_16px] grid grid-cols-1 sm:grid-cols-2 gap-[10px]">
                {fichas.map(f => (
                    <FichaCard 
                        key={f.id} 
                        ficha={f} 
                        factor={FACTOR} 
                        onRegistrarPago={onRegistrarPago} 
                        onVerHistorial={onVerHistorial} 
                    />
                ))}
            </div>
        </div>
    );
}

// PASO 5 — COMPONENTE FichaCard
function FichaCard({ ficha, factor, onRegistrarPago, onVerHistorial }: {
    ficha: FichaCalendarioDato;
    factor: number;
    onRegistrarPago: (fid: string, cid: string) => void;
    onVerHistorial: (fid: string, cid: string) => void;
}) {
    const saldo = ficha.original - ficha.pagado;
    const total = saldo * factor;
    const pct = ficha.original > 0 ? Math.round(ficha.pagado / ficha.original * 100) : 0;

    const colorBarra = pct >= 60 ? '#1D9E75' : pct > 0 ? '#378ADD' : '#E24B4A';
    const colorSaldo = saldo <= 0 ? '#1D9E75' : '#1a1a18';
    const colorTotal = saldo <= 0 ? '#1D9E75' : '#BA7517';

    const ESTADO_CFG = { 
        mora:      { label: 'En mora',   bg: '#FCEBEB', color: '#A32D2D', barra: '#E24B4A' }, 
        pendiente: { label: 'Pendiente', bg: '#FAEEDA', color: '#633806', barra: '#EF9F27' }, 
        pagado:    { label: 'Al día',    bg: '#E1F5EE', color: '#085041', barra: '#1D9E75' }, 
        parcial:   { label: 'Parcial',   bg: '#E6F1FB', color: '#185FA5', barra: '#378ADD' }, 
    };
    const cfg = ESTADO_CFG[ficha.estado] || ESTADO_CFG.pendiente;

    const fmtFecha = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-VE', { 
        day: '2-digit', month: 'short', year: 'numeric' 
    });
    const fmtNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
        <div className="bg-[#fafaf8] rounded-[10px] border border-[#e8e6e0] p-[12px] relative overflow-hidden">
            {/* Barra lateral de color */}
            <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: cfg.barra }} />

            {/* ID + Badge */}
            <div className="flex items-center justify-between mb-[8px]">
                <span className="text-[11px] font-medium text-[#1a1a18]">📄 {ficha.id}</span>
                <span className="text-[9px] font-medium px-[8px] py-[2px] rounded-[20px]" style={{ background: cfg.bg, color: cfg.color }}>
                    {cfg.label}
                </span>
            </div>

            {/* Nombre cliente */}
            {ficha.clienteNombre && (
                <p className="text-[10px] text-[#888780] mb-[8px] font-medium truncate">{ficha.clienteNombre}</p>
            )}

            {/* Montos */}
            <div className="flex justify-between items-end mb-[8px]">
                <div>
                    <p className="text-[9px] text-[#888780] uppercase tracking-[.04em] mb-[2px] font-bold">SALDO BASE</p>
                    <p className="text-[20px] font-medium leading-none" style={{ color: colorSaldo }}>${fmtNum(saldo)}</p>
                    <p className="text-[10px] text-[#888780] mt-[1px]">Orig: ${fmtNum(ficha.original)}</p>
                </div>
                <div className="text-right">
                    <p className="text-[9px] text-[#888780] uppercase tracking-[.04em] font-bold">TOTAL (+{Math.round((factor - 1) * 100)}%)</p>
                    <p className="text-[13px] font-medium mt-[2px]" style={{ color: colorTotal }}>${fmtNum(saldo <= 0 ? 0 : total)}</p>
                </div>
            </div>

            {/* Barra de progreso */}
            <div className="mb-[8px]">
                <div className="flex justify-between text-[9px] mb-[3px] font-medium">
                    <span style={{ color: colorBarra }}>{pct}% cubierto</span>
                    <span className="text-[#888780]">Abonado: ${fmtNum(ficha.pagado)}</span>
                </div>
                <div className="h-[4px] bg-[#e8e6e0] rounded-[2px] overflow-hidden">
                    <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, background: colorBarra }} />
                </div>
            </div>

            {/* Meta */}
            <div className="flex gap-[8px] text-[9px] text-[#888780] mb-[8px] flex-wrap font-medium">
                <span>Emisión: <strong className="text-[#1a1a18]">{fmtFecha(ficha.emision)}</strong></span>
                <span>Vence: <strong style={{ color: saldo > 0 && new Date() > new Date(ficha.vencimiento) ? '#E24B4A' : '#1a1a18' }}>{fmtFecha(ficha.vencimiento)}</strong></span>
            </div>

            {/* Botones */}
            <div className="flex gap-[6px]">
                <button 
                    disabled={saldo <= 0} 
                    onClick={() => onRegistrarPago(ficha.id, ficha.clienteId)} 
                    className={`flex-1 p-[7px_0] rounded-[7px] border-none text-[10px] font-bold transition-colors ${saldo <= 0 ? 'bg-[#f0efe8] text-[#b4b2a9] cursor-default' : 'bg-[#1D9E75] text-white cursor-pointer hover:bg-[#168a65]'}`}
                >
                    + Registrar pago
                </button>
                <button 
                    onClick={() => onVerHistorial(ficha.id, ficha.clienteId)} 
                    className="flex-1 p-[7px_0] rounded-[7px] border border-[#d3d1c7] text-[10px] font-bold bg-white text-[#444441] cursor-pointer hover:bg-[#f5f4f0] transition-colors"
                >
                    Ver historial
                </button>
            </div>
        </div>
    );
}
