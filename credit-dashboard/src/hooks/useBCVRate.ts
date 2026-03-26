import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001/api';
const DOLAR_API_URL = 'https://ve.dolarapi.com/v1/dolares';

// Refrescar cada 30 minutos
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_BCV      = 42.50;
const DEFAULT_PARALLEL = 52.00;

interface UseBCVRateReturn {
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

export function useBCVRate(): UseBCVRateReturn {
  const [rate, setRate] = useState<number>(() => {
    const manual = localStorage.getItem('bcv_rate_manual_oficial');
    if (manual) return parseFloat(manual);
    const saved = localStorage.getItem('bcv_rate_usd');
    return saved ? parseFloat(saved) : DEFAULT_BCV;
  });

  const [parallelRate, setParallelRate] = useState<number>(() => {
    const manual = localStorage.getItem('bcv_rate_manual_parallel');
    if (manual) return parseFloat(manual);
    const cached = localStorage.getItem('bcv_rate_parallel');
    return cached ? parseFloat(cached) : DEFAULT_PARALLEL;
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(() => {
    const saved = localStorage.getItem('bcv_rate_updated');
    return saved ? new Date(saved) : null;
  });
  const [source, setSource] = useState<string>('BCV via DolarAPI');
  const [isStale, setIsStale] = useState<boolean>(false);

  // Evitar múltiples fetches simultáneos
  const isFetchingRef = useRef(false);

  // ── setManualRate: solo cambia parallelRate ──────────────────────────────────
  const setManualRate = useCallback((newRate: number | null) => {
    if (newRate === null) {
      localStorage.removeItem('bcv_rate_manual_parallel');
      const cached = localStorage.getItem('bcv_rate_parallel');
      setParallelRate(cached ? parseFloat(cached) : DEFAULT_PARALLEL);
    } else {
      localStorage.setItem('bcv_rate_manual_parallel', newRate.toString());
      setParallelRate(newRate);
    }
  }, []);

  // ── setManualBcvRate: solo cambia rate (BCV oficial) ─────────────────────────
  const setManualBcvRate = useCallback((newRate: number | null) => {
    if (newRate === null) {
      localStorage.removeItem('bcv_rate_manual_oficial');
      const cached = localStorage.getItem('bcv_rate_usd');
      setRate(cached ? parseFloat(cached) : DEFAULT_BCV);
    } else {
      localStorage.setItem('bcv_rate_manual_oficial', newRate.toString());
      setRate(newRate);
    }
  }, []);

  // ── fetchRate: Intenta server local → DolarAPI ──────────────────────────────
  const fetchRate = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    let oficial: number | null = null;
    let paralelo: number | null = null;
    let srcLabel = '';

    // 1. Intentar endpoint del servidor local (que scrappea bcv.org.ve)
    try {
      const res = await fetch(`${SERVER_URL}/bcv/rate`, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        if (data.oficial && data.oficial > 1) {
          oficial = data.oficial;
          paralelo = data.paralelo || null;
          srcLabel = `BCV via servidor (${data.source})`;
          console.log(`[BCV] ✅ Tasa del servidor local: ${oficial} Bs/USD (${data.source})`);
        }
      }
    } catch {
      console.warn('[BCV] Servidor local no disponible, usando DolarAPI...');
    }

    // 2. Fallback: DolarAPI directamente desde el browser
    if (!oficial) {
      try {
        const res = await fetch(DOLAR_API_URL, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const off = data.find((d: any) => d.fuente === 'oficial');
            const par = data.find((d: any) => d.fuente === 'paralelo');
            if (off?.promedio) {
              oficial = off.promedio;
              paralelo = par?.promedio || null;
              srcLabel = 'BCV via DolarAPI';
              console.log(`[BCV] ✅ Tasa de DolarAPI: ${oficial} Bs/USD`);
            }
          }
        }
      } catch (err2) {
        console.error('[BCV] DolarAPI también falló:', err2);
      }
    }

    if (oficial) {
      // Guardar en caché
      localStorage.setItem('bcv_rate_usd', oficial.toString());
      const hasManualOficial = localStorage.getItem('bcv_rate_manual_oficial');
      if (!hasManualOficial) setRate(oficial);

      if (paralelo) {
        localStorage.setItem('bcv_rate_parallel', paralelo.toString());
        const hasManualParalelo = localStorage.getItem('bcv_rate_manual_parallel');
        if (!hasManualParalelo) setParallelRate(paralelo);
      }

      const now = new Date();
      setLastUpdated(now);
      setSource(srcLabel);
      setIsStale(false);
      localStorage.setItem('bcv_rate_updated', now.toISOString());

      // Guardar historial en Supabase
      if (supabase) {
        supabase.from('bcv_history').insert([
          { rate: oficial, source: srcLabel, updated_at: now.toISOString() }
        ]).then(({ error: e }) => {
          if (e) console.error('Error guardando historial BCV:', e.message);
        });
      }

      setError(null);
    } else {
      // Sin datos frescos — usar caché y avisar
      const savedRate = localStorage.getItem('bcv_rate_usd');
      if (savedRate) setRate(parseFloat(savedRate));
      setError('Tasa no actualizada, usando último valor disponible');
      setIsStale(true);
    }

    setIsLoading(false);
    isFetchingRef.current = false;
  }, []);

  // ── Efecto: fetch al montar + cada 30 minutos ────────────────────────────────
  useEffect(() => {
    // Calcular si la tasa en caché es reciente (< 30 minutos)
    const lastUpdateStr = localStorage.getItem('bcv_rate_updated');
    const lastUpd = lastUpdateStr ? new Date(lastUpdateStr) : null;
    const staleMs = lastUpd ? Date.now() - lastUpd.getTime() : Infinity;

    if (staleMs > REFRESH_INTERVAL_MS) {
      // La tasa es vieja o nunca se cargó → fetch inmediato
      fetchRate();
    } else {
      // Tasa reciente → solo apagar el spinner
      setIsLoading(false);
      // Programar el próximo fetch en el tiempo restante
      const msUntilNext = REFRESH_INTERVAL_MS - staleMs;
      const timeout = setTimeout(() => fetchRate(), msUntilNext);
      return () => clearTimeout(timeout);
    }

    // Actualizar badge de "stale" cada minuto
    const staleInterval = setInterval(() => {
      const su = localStorage.getItem('bcv_rate_updated');
      const lu = su ? new Date(su) : null;
      const diff = lu ? Date.now() - lu.getTime() : Infinity;
      setIsStale(diff > REFRESH_INTERVAL_MS);
    }, 60_000);

    // Intervalo de refresco cada 30 minutos
    const refreshInterval = setInterval(() => fetchRate(), REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(staleInterval);
      clearInterval(refreshInterval);
    };
  }, [fetchRate]);

  return {
    rate,
    parallelRate,
    isLoading,
    error,
    lastUpdated,
    source,
    isStale,
    refresh: fetchRate,
    setManualRate,
    setManualBcvRate,
  };
}

export function useExchangeRate() {
  const { rate, parallelRate, isLoading, error, refresh } = useBCVRate();

  const convertToUSD = useCallback((bsAmount: number): number => {
    return bsAmount / rate;
  }, [rate]);

  const convertToBS = useCallback((usdAmount: number): number => {
    return usdAmount * rate;
  }, [rate]);

  const formatBS = useCallback((usdAmount: number): string => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: 'VES',
    }).format(usdAmount * rate);
  }, [rate]);

  return {
    rate,
    parallelRate,
    isLoading,
    error,
    refresh,
    convertToUSD,
    convertToBS,
    formatBS,
  };
}
