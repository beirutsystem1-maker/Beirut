import { createContext, useContext, type ReactNode } from 'react';
import { useBCVRate } from './useBCVRate';

interface BCVContextType {
  rate: number;
  parallelRate: number;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  source: string;
  isStale: boolean;
  refresh: () => void;
  setManualRate: (rate: number | null) => void;
  setManualBcvRate: (rate: number | null) => void;
}

const BCVContext = createContext<BCVContextType | undefined>(undefined);

export function BCVProvider({ children }: { children: ReactNode }) {
  const { rate, parallelRate, isLoading, error, lastUpdated, source, isStale, refresh, setManualRate, setManualBcvRate } = useBCVRate();

  return (
    <BCVContext.Provider value={{ rate, parallelRate, isLoading, error, lastUpdated, source, isStale, refresh, setManualRate, setManualBcvRate }}>
      {children}
    </BCVContext.Provider>
  );
}

export function useBCV() {
  const context = useContext(BCVContext);
  if (context === undefined) {
    throw new Error('useBCV must be used within a BCVProvider');
  }
  return context;
}
