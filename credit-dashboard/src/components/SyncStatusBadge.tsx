import { useState, useEffect } from 'react';
import { Cloud, WifiOff, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function SyncStatusBadge() {
    const [isOnline, setIsOnline] = useState<boolean | null>(null);

    useEffect(() => {
        let isMounted = true;
        
        async function checkConnection() {
            try {
                // simple ping check by fetching 1 row
                const { error } = await supabase.from('clients').select('id').limit(1);
                if (isMounted) setIsOnline(!error);
            } catch {
                if (isMounted) setIsOnline(false);
            }
        }

        checkConnection();
        const interval = setInterval(checkConnection, 30000);
        
        window.addEventListener('online', checkConnection);
        window.addEventListener('offline', () => setIsOnline(false));
        
        return () => { 
            isMounted = false; 
            clearInterval(interval);
            window.removeEventListener('online', checkConnection);
            window.removeEventListener('offline', () => setIsOnline(false));
        };
    }, []);

    if (isOnline === null) {
        return (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border text-muted-foreground text-[10px] font-bold uppercase tracking-wide">
                <RefreshCw className="w-3 h-3 animate-spin" />
            </div>
        );
    }

    if (isOnline) {
        return (
            <div
                title="Conectado a Supabase en la nube"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-[10px] font-bold uppercase tracking-wide shadow-sm"
            >
                <Cloud className="w-3 h-3" />
                <span className="hidden sm:inline">Nube Activa</span>
            </div>
        );
    }

    return (
        <div
            title="Sin conexión a internet"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-500 text-[10px] font-bold uppercase tracking-wide cursor-help shadow-sm"
        >
            <WifiOff className="w-3 h-3" />
            <span className="hidden sm:inline">Desconectado</span>
        </div>
    );
}
