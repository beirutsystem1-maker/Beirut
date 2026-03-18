import { useState, useEffect, type ReactNode } from 'react';
import {
    Users, Moon, Sun,
    ChevronLeft, ChevronRight, Bell, Search,
    CreditCard, FileSpreadsheet, Settings,
    Lock, Unlock, CalendarDays
} from 'lucide-react';
import { useTheme } from '../logic/ThemeProvider';
import type { ViewState } from '../App';
import { SyncStatusBadge } from './SyncStatusBadge';
import { useSettings } from '../logic/SettingsContext';
import { useBCV } from '../hooks/BCVContext';


const NAV_ITEMS = [
    { id: 'clients' as ViewState, label: 'Directorio', icon: Users },
    { id: 'excel' as ViewState, label: 'Facturación Excel', icon: FileSpreadsheet },
    { id: 'historial' as ViewState, label: 'Historial × Mes', icon: CalendarDays },
    { id: 'settings' as ViewState, label: 'Configuración', icon: Settings },
];

const PAGE_TITLES: Record<ViewState, string> = {
    clients: 'Directorio de Clientes',
    excel: 'Importación de Facturación',
    settings: 'Configuración y Control Maestro',
    historial: 'Historial × Mes',
};

export function Layout({
    children,
    currentView,
    onViewChange,
    searchTerm,
    setSearchTerm,
}: {
    children: ReactNode;
    currentView: ViewState;
    onViewChange: (v: ViewState) => void;
    searchTerm?: string;
    setSearchTerm?: (term: string) => void;
}) {
    const { theme, setTheme } = useTheme();
    const { settings } = useSettings();
    const { rate, parallelRate, setManualRate, setManualBcvRate, isLoading: isLoadingRate, lastUpdated, isStale } = useBCV();
    
    // Se inicializa desde localStorage, o true por defecto para que siempre esté colapsado como pidió el usuario
    const [collapsed, setCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar_collapsed');
        return saved !== null ? JSON.parse(saved) : true;
    });
    
    useEffect(() => {
        localStorage.setItem('sidebar_collapsed', JSON.stringify(collapsed));
    }, [collapsed]);
    
    // Tasa Paralela Local State
    const [tasaInputValue, setTasaInputValue] = useState(parallelRate.toString());
    const [isRateUnlocked, setIsRateUnlocked] = useState(false);
    
    // Tasa BCV Local State
    const [tasaBcvInputValue, setTasaBcvInputValue] = useState(rate.toString());
    const [isBcvRateUnlocked, setIsBcvRateUnlocked] = useState(false);
    
    
    // Sync text input with actual rate when it changes externally
    useEffect(() => {
        setTasaInputValue(parallelRate.toString());
    }, [parallelRate]);

    useEffect(() => {
        setTasaBcvInputValue(rate.toString());
    }, [rate]);

    const handleNavClick = (id: ViewState) => {
        setSearchTerm?.('');
        onViewChange(id);
    };

    return (
        <div className="h-screen flex bg-background text-foreground font-sans overflow-hidden">
            {/* ============ SIDEBAR ============ */}
            <aside
                className={`
                    hidden md:flex flex-col border-r border-border
                    transition-[width] duration-300 ease-in-out flex-shrink-0
                    bg-gradient-to-b from-[#0A2540] to-[#0d1f38]
                    h-full
                    ${collapsed ? 'w-[72px]' : 'w-[240px]'}
                `}
            >
                {/* Logo */}
                <div className={`h-16 flex items-center border-b border-white/10 transition-all duration-300 ${collapsed ? 'px-4 justify-center' : 'px-5 gap-3'}`}>
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#635BFF] to-[#0047FF] flex items-center justify-center flex-shrink-0 shadow-[0_0_18px_rgba(99,91,255,0.5)]">
                        <CreditCard className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
                    </div>
                    {!collapsed && (
                        <div className="animate-fade-in min-w-0">
                            <p className="text-base font-extrabold tracking-[0.2em] text-white leading-none uppercase">{settings.companyName}</p>
                            <p className="text-[9px] font-medium tracking-widest text-white/40 uppercase mt-0.5">Sistema de Control</p>
                        </div>
                    )}
                </div>

                {/* Nav */}
                <nav className="flex-1 p-3 space-y-1 overflow-hidden">
                    {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
                        const isActive = currentView === id;
                        return (
                            <button
                                key={id}
                                onClick={() => handleNavClick(id)}
                                title={collapsed ? label : undefined}
                                className={`
                                    relative w-full flex items-center gap-3 rounded-xl
                                    transition-all duration-200 ease-out group
                                    ${collapsed ? 'px-0 py-3 justify-center' : 'px-3.5 py-2.5'}
                                    ${isActive
                                        ? 'bg-[#635BFF]/20 text-white shadow-[0_0_14px_rgba(99,91,255,0.25)] ring-1 ring-[#635BFF]/30'
                                        : 'text-white/50 hover:bg-white/5 hover:text-white'
                                    }
                                `}
                            >
                                {/* Active left bar */}
                                {isActive && (
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#635BFF] rounded-full shadow-[0_0_8px_rgba(99,91,255,0.8)]" />
                                )}
                                <Icon className={`w-5 h-5 flex-shrink-0 transition-colors ${isActive ? 'text-[#635BFF]' : ''}`} />
                                {!collapsed && (
                                    <span className={`text-sm font-semibold truncate ${isActive ? 'text-white' : ''}`}>{label}</span>
                                )}

                                {/* Tooltip for collapsed */}
                                {collapsed && (
                                    <span className="
                                        absolute left-full ml-3 px-2.5 py-1.5 rounded-lg
                                        bg-[#0A2540] text-white text-xs font-semibold whitespace-nowrap
                                        border border-white/10 shadow-xl
                                        opacity-0 pointer-events-none
                                        group-hover:opacity-100 group-hover:pointer-events-auto
                                        transition-opacity duration-150 z-50
                                    ">
                                        {label}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>

                {/* Bottom actions */}
                <div className="p-3 border-t border-white/10 space-y-1">
                    {/* Theme toggle */}
                    <button
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        title={theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
                        className={`
                            w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5
                            text-white/40 hover:bg-white/5 hover:text-white
                            transition-colors duration-150
                            ${collapsed ? 'justify-center px-0' : ''}
                        `}
                    >
                        {theme === 'dark'
                            ? <Sun className="w-5 h-5 flex-shrink-0" />
                            : <Moon className="w-5 h-5 flex-shrink-0" />
                        }
                        {!collapsed && (
                            <span className="text-sm">{theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}</span>
                        )}
                    </button>

                    {/* Collapse toggle */}
                    <button
                        onClick={() => setCollapsed((c: boolean) => !c)}
                        title={collapsed ? 'Expandir' : 'Colapsar'}
                        className={`
                            w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5
                            text-white/40 hover:bg-white/5 hover:text-white
                            transition-colors duration-150
                            ${collapsed ? 'justify-center px-0' : ''}
                        `}
                    >
                        {collapsed
                            ? <ChevronRight className="w-5 h-5 flex-shrink-0" />
                            : <ChevronLeft className="w-5 h-5 flex-shrink-0" />
                        }
                        {!collapsed && <span className="text-sm">Colapsar</span>}
                    </button>
                </div>
            </aside>

            {/* ============ MAIN CONTENT ============ */}
            <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
                {/* ---- Top Header ---- */}
                <header className="h-16 border-b border-border bg-card/80 glass flex items-center justify-between px-4 md:px-6 gap-4 flex-shrink-0 sticky top-0 z-20 backdrop-blur-md">
                    {/* Left: page title */}
                    <div className="flex items-center gap-3 min-w-0">
                        {/* Mobile logo */}
                        <div className="md:hidden w-8 h-8 rounded-xl bg-gradient-to-br from-[#635BFF] to-[#0A2540] flex items-center justify-center flex-shrink-0 shadow-[0_0_12px_rgba(99,91,255,0.4)]">
                            <CreditCard className="w-4 h-4 text-white" />
                        </div>
                        <div className="hidden md:flex flex-col justify-center">
                            <h1 className="text-sm font-bold text-foreground leading-none">
                                {PAGE_TITLES[currentView]}
                            </h1>
                            <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                                {new Date().toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                        <h1 className="text-base font-extrabold tracking-widest md:hidden text-foreground uppercase">{settings.companyName}</h1>
                    </div>

                    {/* Center: Search bar */}
                    <div className="flex-1 max-w-sm hidden sm:block">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Buscar clientes, notas, pagos..."
                                value={searchTerm || ''}
                                onChange={(e) => setSearchTerm?.(e.target.value)}
                                className="
                                    w-full h-9 pl-9 pr-4 rounded-full
                                    border border-border bg-muted/40
                                    text-sm placeholder:text-muted-foreground
                                    focus:outline-none focus:ring-2 focus:ring-[#635BFF]/40 focus:border-[#635BFF]/50
                                    transition-all duration-200
                                "
                            />
                        </div>
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                        {/* Global BCV Rate Input (Ambar) */}
                        <div 
                            className={`hidden sm:flex items-center rounded-full px-3 h-9 transition-all duration-300 relative group overflow-hidden ${isBcvRateUnlocked ? 'bg-amber-500/10 border border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.25)] ring-2 ring-amber-500/20' : isStale ? 'bg-rose-500/10 border border-rose-500/50' : 'bg-muted/40 border border-border/60 hover:border-border/80'}`}
                            title={lastUpdated ? `Actualizada: ${lastUpdated.toLocaleString('es-VE')}${isStale ? ' ⚠️ ADVERTENCIA: Tasa desactualizada (más de 1 min)' : ''}` : 'Obteniendo tasa...'}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/10 to-amber-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out pointer-events-none" />
                            
                            <div className="flex items-center gap-1.5 mr-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${isBcvRateUnlocked || isStale ? 'bg-amber-500 animate-pulse' : 'bg-amber-500/60'}`} />
                                <span className={`text-[10px] font-black uppercase tracking-widest leading-none ${isBcvRateUnlocked ? 'text-amber-500' : 'text-amber-500/80'}`}>BCV</span>
                            </div>
                            
                            <div className="flex flex-col items-start leading-none gap-0.5">
                                <input
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    value={tasaBcvInputValue}
                                    readOnly={!isBcvRateUnlocked}
                                    onChange={(e) => setTasaBcvInputValue(e.target.value)}
                                    onBlur={(e) => {
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val) && val > 0) {
                                            setManualBcvRate(val);
                                        } else {
                                            setTasaBcvInputValue(rate.toString());
                                        }
                                        setIsBcvRateUnlocked(false);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.currentTarget.blur();
                                        }
                                        if (e.key === 'Escape') {
                                            setTasaBcvInputValue(rate.toString());
                                            e.currentTarget.blur();
                                        }
                                    }}
                                    className={`w-20 bg-transparent text-[13px] font-mono font-bold focus:outline-none placeholder:text-muted-foreground/50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isBcvRateUnlocked ? 'text-amber-500' : 'text-foreground'}`}
                                    placeholder="Tasa"
                                />
                                {lastUpdated && (
                                    <span className={`text-[7px] font-bold uppercase tracking-tighter ${isStale ? 'text-rose-500' : 'text-muted-foreground/60'}`}>
                                        {isStale ? '⚠️ ' : ''}{lastUpdated.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </div>
                            
                            <button
                                onClick={() => setIsBcvRateUnlocked(!isBcvRateUnlocked)}
                                className={`ml-1 flex items-center justify-center w-6 h-6 rounded-full transition-all outline-none ${isBcvRateUnlocked ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-md scale-110' : 'text-muted-foreground/60 hover:text-amber-500 hover:bg-amber-500/10'}`}
                                title={isBcvRateUnlocked ? 'Bloquear Tasa BCV' : 'Desbloquear Tasa BCV para Editar Manualmente'}
                            >
                                {isBcvRateUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3 h-3" />}
                            </button>

                            {(isLoadingRate || isStale) && <span className={`absolute bottom-0 left-0 w-full h-[2px] ${isStale ? 'bg-rose-500' : 'bg-gradient-to-r from-transparent via-amber-500 to-transparent'} animate-pulse`} />}
                        </div>

                        {/* Global Parallel Rate Input (Azul/Violeta) */}
                        <div className={`hidden sm:flex items-center rounded-full px-3 h-9 transition-all duration-300 relative group overflow-hidden ${isRateUnlocked ? 'bg-[#635BFF]/10 border border-[#635BFF]/50 shadow-[0_0_15px_rgba(99,91,255,0.25)] ring-2 ring-[#635BFF]/20' : 'bg-muted/40 border border-border/60 hover:border-border/80'}`}>
                            <div className="absolute inset-0 bg-gradient-to-r from-[#635BFF]/0 via-[#635BFF]/10 to-[#635BFF]/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out pointer-events-none" />
                            
                            <div className="flex items-center gap-1.5 mr-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${isRateUnlocked ? 'bg-[#635BFF] animate-pulse' : 'bg-[#635BFF]/60'}`} />
                                <span className={`text-[10px] font-black uppercase tracking-widest leading-none ${isRateUnlocked ? 'text-[#635BFF]' : 'text-[#635BFF]/80'}`}>PARA</span>
                            </div>
                            
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={tasaInputValue}
                                readOnly={!isRateUnlocked}
                                onChange={(e) => setTasaInputValue(e.target.value)}
                                onBlur={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val) && val > 0) {
                                        setManualRate(val);
                                    } else {
                                        setTasaInputValue(parallelRate.toString());
                                    }
                                    setIsRateUnlocked(false);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.currentTarget.blur();
                                    }
                                    if (e.key === 'Escape') {
                                        setTasaInputValue(parallelRate.toString());
                                        e.currentTarget.blur();
                                    }
                                }}
                                className={`w-16 bg-transparent text-sm font-mono font-bold focus:outline-none placeholder:text-muted-foreground/50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isRateUnlocked ? 'text-[#635BFF]' : 'text-foreground'}`}
                                title={isRateUnlocked ? 'Editar Tasa Global' : 'Tasa Global Bloqueada'}
                                placeholder="Tasa"
                            />
                            
                            <button
                                onClick={() => setIsRateUnlocked(!isRateUnlocked)}
                                className={`ml-1 flex items-center justify-center w-6 h-6 rounded-full transition-all outline-none ${isRateUnlocked ? 'bg-[#635BFF] text-white hover:bg-[#524ae3] shadow-md scale-110' : 'text-muted-foreground/60 hover:text-[#635BFF] hover:bg-[#635BFF]/10'}`}
                                title={isRateUnlocked ? 'Bloquear Tasa' : 'Desbloquear Tasa para Editar'}
                            >
                                {isRateUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3 h-3" />}
                            </button>

                            {isLoadingRate && <span className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#635BFF] to-transparent animate-pulse" title="Actualizando tasa..." />}
                        </div>

                        {/* Sync Status Badge */}
                        <SyncStatusBadge />
                        <button className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150">
                            <Bell className="w-5 h-5" />
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#635BFF] rounded-full ring-2 ring-card animate-pulse" />
                        </button>
                        {/* Mobile theme toggle */}
                        <button
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
                        >
                            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                        {/* Company badge */}
                        <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-border ml-1">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#635BFF] to-[#0A2540] flex items-center justify-center text-white text-xs font-extrabold cursor-pointer ring-2 ring-[#635BFF]/20 hover:ring-[#635BFF]/50 transition-all duration-200 shadow-[0_0_10px_rgba(99,91,255,0.3)]">
                                {settings.companyName.charAt(0).toUpperCase()}
                            </div>
                            <div className="hidden lg:block text-left">
                                <p className="text-xs font-bold text-foreground leading-none">{settings.companyName}</p>
                                <p className="text-[10px] text-muted-foreground">Control de Crédito</p>
                            </div>
                        </div>
                    </div>
                </header>

                {/* ---- Page Content ---- */}
                <div className="flex-1 overflow-y-auto bg-background/50">
                    <div className="p-4 md:p-8 w-full min-h-full">
                        {children}
                    </div>
                </div>

                {/* ---- Mobile Bottom Nav ---- */}
                <nav className="md:hidden border-t border-border bg-card flex items-center justify-around py-2 flex-shrink-0">
                    {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
                        const isActive = currentView === id;
                        return (
                            <button
                                key={id}
                                onClick={() => onViewChange(id)}
                                className={`flex flex-col items-center gap-0.5 p-2 rounded-xl transition-all ${isActive
                                    ? 'text-[#635BFF] bg-[#635BFF]/10'
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                <Icon className="w-5 h-5" />
                                <span className="text-[10px] font-semibold">{label.split(' ')[0]}</span>
                            </button>
                        );
                    })}
                </nav>
            </main>
        </div>
    );
}
