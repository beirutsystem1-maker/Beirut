/**
 * bcv.js — Scraper de Tasa BCV Oficial
 * GET /api/bcv/rate
 * 
 * Intenta obtener la tasa USD oficial del Banco Central de Venezuela
 * directamente desde su web. Cachea la respuesta 10 minutos en memoria
 * para no sobrecargar el servidor del BCV.
 */

const express = require('express');
const router = express.Router();

// ── Caché en memoria (10 minutos) ─────────────────────────────────────────────
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

// ── Intenta obtener la tasa del BCV directamente ─────────────────────────────
async function scrapeBCV() {
    const response = await fetch('https://www.bcv.org.ve/', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-VE,es;q=0.9',
        },
        signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error(`BCV HTTP ${response.status}`);
    const html = await response.text();

    // El BCV muestra la tasa USD en un elemento con id="dolar"
    // Estructura: <div id="dolar"><strong>42,12</strong></div>
    //             o a veces: <div id="dolar">...<strong>42,12345</strong>...
    const match = html.match(/id=["']dolar["'][^>]*>[\s\S]*?<strong[^>]*>([\d.,]+)<\/strong>/i)
        || html.match(/<strong[^>]*>\s*([\d]{2}[.,][\d]+)\s*<\/strong>/);

    if (!match) throw new Error('No se pudo extraer la tasa USD del HTML del BCV');

    // El BCV Venezuela usa coma como decimal: "42,1234" → 42.1234
    const raw = match[1].trim().replace(/\./g, '').replace(',', '.');
    const rate = parseFloat(raw);

    if (isNaN(rate) || rate < 1) throw new Error(`Tasa inválida extraída: "${match[1]}"`);
    return rate;
}

// ── Fallback: DolarAPI ────────────────────────────────────────────────────────
async function fetchDolarAPI() {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares', {
        signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`DolarAPI HTTP ${res.status}`);
    const data = await res.json();
    const oficial = data.find(d => d.fuente === 'oficial');
    const paralelo = data.find(d => d.fuente === 'paralelo');
    if (!oficial?.promedio) throw new Error('DolarAPI no retornó tasa oficial');
    return {
        oficial: oficial.promedio,
        paralelo: paralelo?.promedio || null,
    };
}

// ── GET /api/bcv/rate ─────────────────────────────────────────────────────────
router.get('/rate', async (_req, res) => {
    // Devolver caché si aún es válida
    if (_cache && (Date.now() - _cacheTime) < CACHE_TTL) {
        return res.json({ ..._cache, cached: true });
    }

    let oficial = null;
    let paralelo = null;
    let source = '';

    // 1. Intentar scrapping directo del BCV
    try {
        oficial = await scrapeBCV();
        source = 'bcv.org.ve';
        console.log(`[BCV] ✅ Tasa scrapeada del BCV: ${oficial} Bs/USD`);
    } catch (err) {
        console.warn(`[BCV] ⚠ Scraping falló (${err.message}), usando DolarAPI...`);
    }

    // 2. Si falló, usar DolarAPI como fallback
    if (!oficial) {
        try {
            const dolar = await fetchDolarAPI();
            oficial = dolar.oficial;
            paralelo = dolar.paralelo;
            source = 've.dolarapi.com';
            console.log(`[BCV] ✅ Tasa de DolarAPI: ${oficial} Bs/USD`);
        } catch (err2) {
            console.error(`[BCV] ❌ Ambas fuentes fallaron: ${err2.message}`);
            return res.status(503).json({
                error: 'No se pudo obtener la tasa BCV. Intente de nuevo más tarde.',
            });
        }
    }

    const payload = {
        oficial,
        paralelo,
        source,
        updatedAt: new Date().toISOString(),
        cached: false,
    };

    // Guardar en caché
    _cache = payload;
    _cacheTime = Date.now();

    return res.json(payload);
});

module.exports = router;
