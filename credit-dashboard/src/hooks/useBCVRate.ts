import { useState, useEffect, useCallback } from 'react';

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
  // Viene de la API, pero el usuario puede sobreescribirla manualmente.
  // Se lee primero de `bcv_rate_manual_oficial`. Si no, `bcv_rate_usd`.
  const [rate, setRate] = useState<number>(() => {
    const manual = localStorage.getItem('bcv_rate_manual_oficial');
    if (manual) return parseFloat(manual);
    const saved = localStorage.getItem('bcv_rate_usd');
    return saved ? parseFloat(saved) : DEFAULT_BCV;
  });

  // ── Tasa Paralela (manual) ────────────────────────────────────────
  // El usuario la fija manualmente en el header. Se lee de
  // `bcv_rate_manual_parallel` (manual) o `bcv_rate_parallel` (caché API).
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
      // Al quitar la manual, volvemos al caché API de paralelo
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
      // Al quitar la manual, volvemos al caché API de BCV
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
      }
    } catch (err) {
      console.error('Error fetching BCV rate:', err);
      setError('No se pudo obtener la tasa del BCV');

      // Fallback offline: usar caché guardado
      const savedRate = localStorage.getItem('bcv_rate_usd');
      if (savedRate) setRate(parseFloat(savedRate));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Efecto: fetch al montar + cada 1 hora ────────────────────────
  useEffect(() => {
    const checkStaleness = () => {
      if (!lastUpdated) {
        setIsStale(true);
        return;
      }
      const diff = Date.now() - lastUpdated.getTime();
      setIsStale(diff > ONE_MINUTE_MS);
    };

    // Check immediately and then every 10 seconds
    checkStaleness();
    const staleInterval = setInterval(checkStaleness, 10000);

    const shouldRefreshNow = !lastUpdated || (Date.now() - lastUpdated.getTime()) > ONE_MINUTE_MS;

    if (shouldRefreshNow) {
      fetchRate();
    } else {
      setIsLoading(false);
    }

    // Refresco automático cada 1 minuto mientras la pestaña está abierta
    const intervalId = setInterval(() => {
      fetchRate();
    }, ONE_MINUTE_MS);

    return () => {
      clearInterval(intervalId);
      clearInterval(staleInterval);
    };
  }, [fetchRate, lastUpdated]);

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
