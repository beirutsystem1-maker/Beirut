import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001/api';
const DOLAR_API_URL = 'https://ve.dolarapi.com/v1/dolares';
// API alternativa: devuelve VES por 1 USD directamente
const EXCHANGERATE_API_URL = 'https://open.er-api.com/v6/latest/USD';

// Refrescar cada 1 minuto
const REFRESH_INTERVAL_MS = 1 * 60 * 1000;
// Si la caché tiene más de 2 horas, ignorarla completamente
const CACHE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const DEFAULT_BCV      = 100;
const DEFAULT_PARALLEL = 120;

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
    // Si la caché guardada es muy vieja (>2h), no usarla como valor inicial
    const updatedStr = localStorage.getItem('bcv_rate_updated');
    const cacheAge = updatedStr ? Date.now() - new Date(updatedStr).getTime() : Infinity;
    if (cacheAge > CACHE_MAX_AGE_MS) {
      // Limpiar caché vieja para evitar mostrar datos obsoletos
      localStorage.removeItem('bcv_rate_usd');
      localStorage.removeItem('bcv_rate_manual_oficial');
      localStorage.removeItem('bcv_rate_updated');
      return DEFAULT_BCV;
    }
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

  // ── fetchRate: Intenta server local → DolarAPI → ExchangeRate-API ───────────
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
      const res = await fetch(`${SERVER_URL}/bcv/rate`, { signal: AbortSignal.timeout(4000) });
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
      console.warn('[BCV] Servidor local no disponible, probando DolarAPI...');
    }

    // 2. Fallback A: DolarAPI — verificar que los datos no sean viejos (>24h)
    if (!oficial) {
      try {
        const res = await fetch(DOLAR_API_URL, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const off = data.find((d: any) => d.fuente === 'oficial');
            const par = data.find((d: any) => d.fuente === 'paralelo');
            if (off?.promedio) {
              // Verificar que DolarAPI tiene datos recientes (<48h)
              const apiAge = off.fechaActualizacion
                ? Date.now() - new Date(off.fechaActualizacion).getTime()
                : 0;
              const MAX_API_AGE = 48 * 60 * 60 * 1000; // 48 horas
              if (apiAge < MAX_API_AGE) {
                oficial = off.promedio;
                paralelo = par?.promedio || null;
                srcLabel = 'BCV via DolarAPI';
                console.log(`[BCV] ✅ Tasa de DolarAPI: ${oficial} Bs/USD`);
              } else {
                console.warn(`[BCV] DolarAPI datos muy viejos (${Math.round(apiAge/3600000)}h), probando alternativa...`);
              }
            }
          }
        }
      } catch (err2) {
        console.error('[BCV] DolarAPI falló:', err2);
      }
    }

    // 3. Fallback B: open.er-api.com (tasa USD→VES en tiempo real)
    if (!oficial) {
      try {
        const res = await fetch(EXCHANGERATE_API_URL, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          if (data?.rates?.VES && data.rates.VES > 1) {
            oficial = data.rates.VES;
            srcLabel = 'USD→VES via ExchangeRate-API';
            console.log(`[BCV] ✅ Tasa ExchangeRate-API: ${oficial} Bs/USD`);
          }
        }
      } catch (err3) {
        console.error('[BCV] ExchangeRate-API también falló:', err3);
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

  // ── Efecto: fetch al montar + cada 1 minuto ─────────────────────────────────
  useEffect(() => {
    // Siempre hacer fetch inmediato al montar
    fetchRate();

    // Intervalo de refresco cada 1 minuto
    const refreshInterval = setInterval(() => fetchRate(), REFRESH_INTERVAL_MS);

    // Actualizar badge de "stale" cada 30 segundos
    const staleInterval = setInterval(() => {
      const su = localStorage.getItem('bcv_rate_updated');
      const lu = su ? new Date(su) : null;
      const diff = lu ? Date.now() - lu.getTime() : Infinity;
      setIsStale(diff > REFRESH_INTERVAL_MS);
    }, 30_000);

    return () => {
      clearInterval(refreshInterval);
      clearInterval(staleInterval);
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
