import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';
import { createPortal } from 'react-dom';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastMessage {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
    duration?: number;
    action?: {
        label: string;
        onClick: () => void;
    };
}

interface ToastContextType {
    addToast: (toast: Omit<ToastMessage, 'id'>) => void;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

const Toast = ({
    toast,
    onRemove
}: {
    toast: ToastMessage;
    onRemove: (id: string) => void;
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        if (isHovered) return;

        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(() => onRemove(toast.id), 300); // Wait for exit animation
        }, toast.duration || 5000);

        return () => clearTimeout(timer);
    }, [toast, isHovered, onRemove]);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(() => onRemove(toast.id), 300);
    };

    const variants = {
        success: {
            bg: 'bg-emerald-50/80 dark:bg-emerald-950/30',
            border: 'border-emerald-200/40 dark:border-emerald-800/40',
            icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />,
            title: 'text-emerald-900 dark:text-emerald-100',
            body: 'text-emerald-700 dark:text-emerald-400',
            button: 'text-emerald-700 bg-emerald-100/50 hover:bg-emerald-200/60 dark:text-emerald-300 dark:bg-emerald-900/30 dark:hover:bg-emerald-800/40 border-emerald-200/50 dark:border-emerald-800/50'
        },
        warning: {
            bg: 'bg-amber-50/80 dark:bg-amber-950/30',
            border: 'border-amber-200/40 dark:border-amber-800/40',
            icon: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500" />,
            title: 'text-amber-900 dark:text-amber-100',
            body: 'text-amber-700 dark:text-amber-400',
            button: 'text-amber-700 bg-amber-100/50 hover:bg-amber-200/60 dark:text-amber-300 dark:bg-amber-900/30 dark:hover:bg-amber-800/40 border-amber-200/50 dark:border-amber-800/50'
        },
        error: {
            bg: 'bg-rose-50/80 dark:bg-rose-950/30',
            border: 'border-rose-200/40 dark:border-rose-800/40',
            icon: <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-500" />,
            title: 'text-rose-900 dark:text-rose-100',
            body: 'text-rose-700 dark:text-rose-400',
            button: 'text-rose-700 bg-rose-100/50 hover:bg-rose-200/60 dark:text-rose-300 dark:bg-rose-900/30 dark:hover:bg-rose-800/40 border-rose-200/50 dark:border-rose-800/50'
        },
        info: {
            bg: 'bg-slate-50/80 dark:bg-slate-900/30',
            border: 'border-slate-200/40 dark:border-slate-700/40',
            icon: <CheckCircle2 className="w-5 h-5 text-slate-600 dark:text-slate-400" />,
            title: 'text-slate-900 dark:text-slate-100',
            body: 'text-slate-600 dark:text-slate-400',
            button: 'text-slate-700 bg-slate-200/50 hover:bg-slate-300/60 dark:text-slate-300 dark:bg-slate-800/40 dark:hover:bg-slate-700/50 border-slate-300/50 dark:border-slate-700/50'
        }
    };

    const v = variants[toast.type];

    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`
                pointer-events-auto flex w-full max-w-sm flex-col overflow-hidden rounded-xl border backdrop-blur-xl shadow-lg dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)]
                ${v.bg} ${v.border}
                transform transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]
                ${isExiting ? 'opacity-0 translate-y-3 scale-95' : 'opacity-100 translate-y-0 scale-100'}
            `}
            style={{ animation: isExiting ? 'none' : 'slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
            <div className="p-4 flex gap-3 items-start">
                <div className="flex-shrink-0 mt-0.5">{v.icon}</div>
                <div className="flex-1 w-0">
                    <p className={`text-sm font-semibold tracking-tight ${v.title}`}>
                        {toast.title}
                    </p>
                    {toast.message && (
                        <p className={`mt-1 text-sm leading-relaxed ${v.body}`}>
                            {toast.message}
                        </p>
                    )}
                    {toast.action && (
                        <div className="mt-3">
                            <button
                                onClick={() => {
                                    toast.action?.onClick();
                                    handleClose();
                                }}
                                className={`
                                    inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-xs font-semibold
                                    transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-transparent
                                    ${v.button}
                                `}
                            >
                                {toast.action.label}
                            </button>
                        </div>
                    )}
                </div>
                <button
                    onClick={handleClose}
                    className={`flex-shrink-0 inline-flex rounded-lg p-1 focus:outline-none focus:ring-2 focus:ring-offset-1 transition-colors ${v.body} hover:bg-black/5 dark:hover:bg-white/10`}
                    aria-label="Cerrar"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Optional Progress Bar (only visible when not hovered) */}
            <div className={`h-[3px] w-full bg-black/5 dark:bg-white/5 ${isHovered ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}>
                <div
                    className="h-full bg-black/10 dark:bg-white/20 origin-left"
                    style={{
                        animation: isHovered || isExiting ? 'none' : `shrinkX ${toast.duration || 5000}ms linear forwards`
                    }}
                />
            </div>
        </div>
    );
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { ...toast, id }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ addToast, removeToast }}>
            {children}
            {typeof document !== 'undefined' && createPortal(
                <div className="fixed bottom-0 right-0 z-[9999] flex flex-col gap-3 p-4 md:p-6 pb-20 md:pb-6 pointer-events-none max-w-full sm:max-w-md w-full">
                    {toasts.map(t => (
                        <div key={t.id} className="flex justify-end w-full">
                            <Toast toast={t} onRemove={removeToast} />
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </ToastContext.Provider>
    );
}
