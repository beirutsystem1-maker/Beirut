import { useState, useEffect, useCallback } from 'react';

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

interface UseBCVRateReturn {
  rate: number;         // Tasa BCV oficial — siempre de la API
  parallelRate: number; // Tasa paralela — editable manualmente, persiste
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  source: string;
  isStale: boolean;
  refresh: () => void;
  setManualRate: (rate: number | null) => void;
  setManualBcvRate: (rate: number | null) => void;
}

const BCV_API_URL = 'https://ve.dolarapi.com/v1/dolares';
const ONE_MINUTE_MS = 60 * 1000;
const DEFAULT_BCV = 42.50;
const DEFAULT_PARALLEL = 52.00;

export function useBCVRate(): UseBCVRateReturn {
  // ── Tasa BCV oficial ─────────────────────────────────────────────
  const [rate, setRate] = useState<number>(() => {
    const manual = localStorage.getItem('bcv_rate_manual_oficial');
    if (manual) return parseFloat(manual);
    const saved = localStorage.getItem('bcv_rate_usd');
    return saved ? parseFloat(saved) : DEFAULT_BCV;
  });

  // ── Tasa Paralela (manual) ────────────────────────────────────────
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

  // ── setManualRate: solo cambia parallelRate ───────────────────────
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

  // ── setManualBcvRate: solo cambia rate (BCV oficial) ──────────────
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

  // ── fetchRate: obtiene BCV oficial de la API ──────────────────────
  const fetchRate = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(BCV_API_URL, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data && Array.isArray(data)) {
        const oficial = data.find((d: any) => d.fuente === 'oficial');
        const paralelo = data.find((d: any) => d.fuente === 'paralelo');

        // Actualizar caché de tasa BCV oficial (solo si no hay manual activa)
        if (oficial?.promedio) {
          localStorage.setItem('bcv_rate_usd', oficial.promedio.toString());
          const hasManual = localStorage.getItem('bcv_rate_manual_oficial');
          if (!hasManual) {
            setRate(oficial.promedio);
          }
        }

        // Actualizar caché de paralela (solo si no hay manual activa)
        if (paralelo?.promedio) {
          localStorage.setItem('bcv_rate_parallel', paralelo.promedio.toString());
          const hasManual = localStorage.getItem('bcv_rate_manual_parallel');
          if (!hasManual) {
            setParallelRate(paralelo.promedio);
          }
        }

        const now = new Date();
        setLastUpdated(now);
        localStorage.setItem('bcv_rate_updated', now.toISOString());
        setSource('BCV via DolarAPI');
        setIsStale(false);

        // Subir al historial en base de datos (Supabase)
        if (supabase && oficial?.promedio) {
          supabase.from('bcv_history').insert([
            { rate: oficial.promedio, source: 've.dolarapi.com', updated_at: now.toISOString() }
          ]).then(({ error }) => {
            if (error) console.error('Error guardando historial BCV:', error.message);
          });
        }
      }
    } catch (err) {
      console.error('Error fetching BCV rate:', err);
      setError('Tasa no actualizada, usando último valor disponible');

      // Fallback offline: usar caché guardado
      const savedRate = localStorage.getItem('bcv_rate_usd');
      if (savedRate) setRate(parseFloat(savedRate));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Efecto: Actualización automática diaria a las 9:00 AM ─────────
  useEffect(() => {
    const checkStaleness = () => {
      if (!lastUpdated) {
        setIsStale(true);
        return;
      }
      const diff = Date.now() - lastUpdated.getTime();
      setIsStale(diff > 12 * 60 * 60 * 1000); // Consideramos stale después de 12h
    };

    checkStaleness();
    const staleInterval = setInterval(checkStaleness, 60000);

    const checkAndFetchAuto = () => {
      const nowNode = new Date();
      const lastUpdateStr = localStorage.getItem('bcv_rate_updated');
      const lastUpd = lastUpdateStr ? new Date(lastUpdateStr) : null;

      if (!lastUpd) {
        fetchRate();
        return;
      }

      const isSameDay = lastUpd.toDateString() === nowNode.toDateString();
      const wasUpdatedAfter9 = lastUpd.getHours() >= 9;
      const isNowAfter9 = nowNode.getHours() >= 9;

      // Actualizar automáticamente si hoy son pasadas las 9:00 AM y aún no nos hemos actualizado
      if (isNowAfter9 && (!isSameDay || !wasUpdatedAfter9)) {
        fetchRate();
      }
    };

    // Validar apenas entra
    if (isLoading) checkAndFetchAuto();

    // Comprobar cada 1 minuto (silenciosamente)
    const intervalId = setInterval(() => {
      checkAndFetchAuto();
    }, ONE_MINUTE_MS);

    // Initial timeout to hide loading if nothing triggered
    setTimeout(() => setIsLoading(false), 2000);

    return () => {
      clearInterval(intervalId);
      clearInterval(staleInterval);
    };
  }, [fetchRate, lastUpdated]); // Quitamos "isLoading" de las deps para no crear loop

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
