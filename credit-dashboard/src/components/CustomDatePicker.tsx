import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

interface CustomDatePickerProps {
    value: string; // YYYY-MM-DD
    onChange: (date: string) => void;
    label?: string;
}

const DAYS_OF_WEEK = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function CustomDatePicker({ value, onChange, label }: CustomDatePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const parseDate = (dateVal: string | Date | undefined | null): Date | null => {
        if (!dateVal) return null;

        let d: Date;
        if (typeof dateVal === 'string') {
            if (dateVal.includes('/')) {
                const parts = dateVal.split(' ')[0].split('/');
                if (parts.length === 3) {
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1;
                    const year = parseInt(parts[2], 10);
                    d = new Date(year, month, day);
                    if (!isNaN(d.getTime())) return d;
                }
            } else if (dateVal.includes('-')) {
                const parts = dateVal.split('-');
                if (parts.length === 3) {
                    d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                    if (!isNaN(d.getTime())) return d;
                }
            }
        }

        d = new Date(dateVal);
        return isNaN(d.getTime()) ? null : d;
    };

    const [currentMonth, setCurrentMonth] = useState(() => {
        const d = parseDate(value) || new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1);
    });

    // Portal refs and state
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

    const updatePosition = () => {
        if (isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            // Calculate available space below
            const spaceBelow = window.innerHeight - rect.bottom;
            const popupHeight = 350; // Approximate height of the calendar

            // If there's not enough space below, show it above
            const showAbove = spaceBelow < popupHeight && rect.top > popupHeight;

            setPopupStyle({
                position: 'fixed',
                top: showAbove ? rect.top - popupHeight - 8 : rect.bottom + 8,
                left: rect.left,
                width: 320, // Fixed width from original design
                zIndex: 9999, // Ensure it's above everything including modals
            });
        }
    };

    useEffect(() => {
        if (isOpen) {
            updatePosition();
            window.addEventListener('scroll', updatePosition, true); // Use capture phase for scrolling in modals
            window.addEventListener('resize', updatePosition);
        }
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const isClickInsideTrigger = triggerRef.current?.contains(target);
            const isClickInsidePopup = popupRef.current?.contains(target);

            if (!isClickInsideTrigger && !isClickInsidePopup) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (year: number, month: number) => {
        return new Date(year, month, 1).getDay();
    };

    const handlePrevMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const handleDateClick = (day: number) => {
        const year = currentMonth.getFullYear();
        const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');
        onChange(`${year}-${month}-${dayStr}`);
        setIsOpen(false);
    };

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const days = [];
    for (let i = 0; i < firstDay; i++) {
        days.push(<div key={`empty-${i}`} className="p-2 w-9 h-9" />);
    }

    const selectedDate = value ? parseDate(value) : null;

    for (let day = 1; day <= daysInMonth; day++) {
        const isSelected = selectedDate &&
            selectedDate.getDate() === day &&
            selectedDate.getMonth() === month &&
            selectedDate.getFullYear() === year;

        const isToday = new Date().getDate() === day &&
            new Date().getMonth() === month &&
            new Date().getFullYear() === year;

        days.push(
            <button
                type="button"
                key={`day-${day}`}
                onClick={() => handleDateClick(day)}
                className={`
                    w-9 h-9 flex items-center justify-center rounded-xl text-sm transition-colors
                    ${isSelected ? 'bg-[#635BFF] text-white font-semibold shadow-md' :
                        isToday ? 'bg-muted text-foreground font-bold' :
                            'text-foreground font-medium hover:bg-muted hover:text-[#635BFF]'}
                `}
            >
                {day}
            </button>
        );
    }

    const formatDisplayDate = (dateStr: string) => {
        if (!dateStr) return 'Seleccionar Fecha';
        const d = parseDate(dateStr);
        if (!d) return 'Seleccionar Fecha';

        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = d.getFullYear();
        return `${dd}/${mm}/${yy}`;
    };

    return (
        <div className="relative" ref={containerRef}>
            {label && (
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                    {label}
                </label>
            )}
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    w-full min-h-[44px] px-4 py-2.5 bg-background border rounded-xl flex items-center justify-between
                    font-medium text-sm transition-all
                    ${isOpen ? 'border-[#635BFF] ring-2 ring-[#635BFF]/20' : 'border-border hover:border-[#635BFF]/40 outline-none'}
                `}
            >
                <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
                    {formatDisplayDate(value)}
                </span>
                <CalendarIcon className="w-4 h-4 text-muted-foreground" />
            </button>

            {isOpen && createPortal(
                <div
                    ref={popupRef}
                    style={popupStyle}
                    className="p-5 bg-card border border-border/80 shadow-2xl dark:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] rounded-[20px] animate-in fade-in zoom-in-95 duration-200"
                >
                    <div className="flex items-center justify-between mb-5">
                        <button
                            type="button"
                            onClick={handlePrevMonth}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="font-semibold text-[15px] text-foreground">
                            {MONTHS[month]} {year}
                        </div>
                        <button
                            type="button"
                            onClick={handleNextMonth}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1.5 mb-3">
                        {DAYS_OF_WEEK.map(day => (
                            <div key={day} className="text-center text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                                {day}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-y-2 gap-x-1.5 place-items-center">
                        {days}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
