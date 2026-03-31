/**
 * api/bcv-rate.js — Vercel Serverless Function
 * GET /api/bcv-rate
 *
 * Obtiene la tasa USD oficial del BCV en tiempo real.
 * Intenta 3 fuentes en orden:
 *   1. Scraping directo de bcv.org.ve
 *   2. DolarAPI (ve.dolarapi.com)
 *   3. ExchangeRate-API (open.er-api.com)
 *
 * Cachea la respuesta 8 minutos para no sobrecargar las fuentes.
 */

// Caché en memoria de la instancia serverless (puede sobrevivir entre requests)
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 8 * 60 * 1000; // 8 minutos

/**
 * Scrape directo a bcv.org.ve
 * El BCV publica su tasa en un <strong> después del bloque <span>USD</span>
 */
async function scrapeBCV() {
    const oldTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
        const res = await fetch('https://www.bcv.org.ve/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'es-VE,es;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
            },
            signal: AbortSignal.timeout(9000),
        });

        if (!res.ok) throw new Error(`BCV HTTP ${res.status}`);
        const html = await res.text();

        // El BCV publica la tasa dentro de: <span>USD</span>...<strong>NNN,NNNNNNNNN</strong>
        const match = html.match(/<span>\s*USD\s*<\/span>[\s\S]*?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i);
        if (!match) throw new Error('No se pudo extraer la tasa USD del HTML del BCV');

        const raw = match[1].trim()
            .replace(/\./g, '')   // quitar separadores de miles
            .replace(',', '.');   // decimal venezolano → punto

        const rate = parseFloat(raw);
        if (isNaN(rate) || rate < 1) throw new Error(`Tasa inválida: "${match[1]}"`);

        console.log(`[BCV Vercel] ✅ Scraping BCV: ${rate} Bs/USD`);
        return { oficial: rate, paralelo: null, source: 'bcv.org.ve' };
    } finally {
        if (oldTls === undefined) {
            delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        } else {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = oldTls;
        }
    }
}

/** Fallback A: DolarAPI */
async function fetchDolarAPI() {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares', {
        signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`DolarAPI HTTP ${res.status}`);
    const data = await res.json();
    const oficial = data.find(d => d.fuente === 'oficial');
    const paralelo = data.find(d => d.fuente === 'paralelo');
    if (!oficial?.promedio) throw new Error('DolarAPI sin tasa oficial');

    // Verificar que los datos no sean de más de 48h
    if (oficial.fechaActualizacion) {
        const age = Date.now() - new Date(oficial.fechaActualizacion).getTime();
        if (age > 48 * 60 * 60 * 1000) {
            throw new Error(`DolarAPI datos muy viejos (${Math.round(age / 3600000)}h)`);
        }
    }

    console.log(`[BCV Vercel] ✅ DolarAPI: ${oficial.promedio} Bs/USD`);
    return {
        oficial: oficial.promedio,
        paralelo: paralelo?.promedio || null,
        source: 've.dolarapi.com',
    };
}

/** Fallback B: ExchangeRate-API */
async function fetchExchangeRate() {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
        signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`ExchangeRate-API HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.rates?.VES || data.rates.VES < 1) {
        throw new Error('ExchangeRate-API sin tasa VES válida');
    }
    console.log(`[BCV Vercel] ✅ ExchangeRate-API: ${data.rates.VES} Bs/USD`);
    return { oficial: data.rates.VES, paralelo: null, source: 'open.er-api.com' };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET')    return res.status(405).json({ error: 'Método no permitido' });

    // Servir caché si es reciente
    if (_cache && (Date.now() - _cacheTime) < CACHE_TTL) {
        return res.status(200).json({ ..._cache, cached: true });
    }

    let result = null;

    // 1. Scraping BCV
    try { result = await scrapeBCV(); } catch (e) {
        console.warn(`[BCV Vercel] ⚠ BCV scraping falló: ${e.message}`);
    }

    // 2. DolarAPI
    if (!result) {
        try { result = await fetchDolarAPI(); } catch (e) {
            console.warn(`[BCV Vercel] ⚠ DolarAPI falló: ${e.message}`);
        }
    }

    // 3. ExchangeRate-API
    if (!result) {
        try { result = await fetchExchangeRate(); } catch (e) {
            console.error(`[BCV Vercel] ❌ Todas las fuentes fallaron: ${e.message}`);
        }
    }

    if (!result) {
        return res.status(503).json({
            error: 'No se pudo obtener la tasa BCV. Todas las fuentes fallaron.',
        });
    }

    const payload = {
        oficial:   result.oficial,
        paralelo:  result.paralelo,
        source:    result.source,
        updatedAt: new Date().toISOString(),
        cached:    false,
    };

    _cache     = payload;
    _cacheTime = Date.now();

    return res.status(200).json(payload);
}
