import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export interface AppSettings {
    companyName: string;
    adminName: string;
    language: string;
}

const defaultSettings: AppSettings = {
    companyName: 'Beirut',
    adminName: 'Administrador',
    language: 'es',
};

interface SettingsContextType {
    settings: AppSettings;
    updateSettings: (newSettings: Partial<AppSettings>) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<AppSettings>(() => {
        try {
            const stored = localStorage.getItem('app_global_settings');
            if (stored) return JSON.parse(stored);
        } catch (e) {
            console.error('Failed to parse settings', e);
        }
        return defaultSettings;
    });

    useEffect(() => {
        localStorage.setItem('app_global_settings', JSON.stringify(settings));
        document.title = `${settings.companyName} | Sistema de Control`;
    }, [settings]);

    const updateSettings = (newSettings: Partial<AppSettings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    return (
        <SettingsContext.Provider value={{ settings, updateSettings }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}
