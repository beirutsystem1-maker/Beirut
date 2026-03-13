const express = require('express');
const router = express.Router();
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Multer ────────────────────────────────────────────────────────────────────
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Solo se aceptan archivos PDF'));
    }
});

// ── Gemini client ─────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = 'gemini-2.5-flash';

// ── Prompt robusto ────────────────────────────────────────────────────────────
function buildPrompt(tasa) {
    return `Eres un sistema OCR especializado en documentos comerciales venezolanos (facturas, notas de entrega, remisiones, notas de crédito, etc.).

TAREA: Extrae los datos del documento adjunto y devuelve ÚNICAMENTE un JSON válido, sin texto adicional, sin bloques markdown.

TASA DE CAMBIO: ${tasa} Bs por 1 USD

FORMATO NUMÉRICO VENEZOLANO: Los números usan punto (.) como separador de miles y coma (,) como decimal.
Ejemplos: "6.465,51" = 6465.51 | "538,79" = 538.79 | "1.034,48" = 1034.48
Al convertir, divide el valor en Bs entre ${tasa}.

INSTRUCCIONES:
1. Extrae el número de documento (puede llamarse "Nota de Entrega Nro.", "Factura Nro.", "N°", etc.)
2. Extrae la fecha de emisión en formato DD/MM/YYYY
3. Por cada producto/ítem en la tabla, extrae:
   - nombre: descripción completa del producto
   - cantidad: número entero o decimal
   - precio_unitario_usd: precio unitario en Bs ÷ ${tasa} (redondeado a 2 decimales)
   - subtotal_usd: precio_unitario_usd × cantidad (redondeado a 2 decimales)
4. Si hay IVA/impuesto, extrae el monto total de impuesto en Bs y conviértelo a USD
5. El gran_total_usd = suma de todos los subtotal_usd + iva_usd

FORMATO DE SALIDA (JSON puro, sin markdown):
{
  "documento": "0000019886",
  "fecha": "09/03/2026",
  "tasa_aplicada": ${tasa},
  "items": [
    {
      "producto": "NOMBRE COMPLETO DEL PRODUCTO",
      "cantidad": 2,
      "precio_unitario_usd": 0.88,
      "subtotal_usd": 1.76
    }
  ],
  "iva_usd": 1.68,
  "gran_total_usd": 10.49
}

REGLAS CRÍTICAS:
- Devuelve SOLO el JSON, sin texto antes ni después
- Si no encuentras un campo, usa "" para texto y 0 para números
- NO omitas ningún producto de la tabla
- Convierte TODOS los montos de Bs a USD dividiendo entre ${tasa}`;
}

// ── Limpieza de JSON ──────────────────────────────────────────────────────────
function extractJSON(text) {
    // Remove markdown code blocks if present
    let clean = text.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    // Try to find JSON object if there's extra text
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
        clean = clean.substring(start, end + 1);
    }
    return clean;
}

// ── POST /api/pdf/extract ─────────────────────────────────────────────────────
router.post('/extract', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo PDF.' });

        const exchangeRate = parseFloat(req.body.exchangeRate) || 1;
        const userApiKey = req.body.userApiKey || null;
        const _usingPersonalKey = !!userApiKey;

        console.log(`[OCR] Procesando PDF — tasa: ${exchangeRate} — personalKey: ${_usingPersonalKey} — archivo: ${req.file.originalname} (${Math.round(req.file.size / 1024)}KB)`);

        let envApiKey = process.env.GEMINI_API_KEY;
        if (!envApiKey) {
            const isPackaged = __dirname.includes('resources') || process.execPath.includes('BeirutGestor');
            let envPathFallback;
            if (isPackaged && process.env.RESOURCES_PATH) {
                envPathFallback = require('path').join(process.env.RESOURCES_PATH, 'server', '.env');
            } else if (isPackaged) {
                envPathFallback = require('path').join(__dirname, '..', '.env');
            } else {
                envPathFallback = require('path').resolve(__dirname, '..', '.env');
            }
            require('dotenv').config({ path: envPathFallback });
            envApiKey = process.env.GEMINI_API_KEY;
        }

        const apiKeyToUse = userApiKey || envApiKey;
        if (!apiKeyToUse) {
            return res.status(500).json({ error: 'No se encontró API Key de Gemini (ni personal ni global).' });
        }

        const currentGenAI = new GoogleGenerativeAI(apiKeyToUse);
        const pdfBase64 = req.file.buffer.toString('base64');
        const model = currentGenAI.getGenerativeModel({ model: MODEL_NAME });

        const result = await model.generateContent([
            {
                inlineData: {
                    data: pdfBase64,
                    mimeType: 'application/pdf'
                }
            },
            buildPrompt(exchangeRate)
        ]);

        const rawText = result.response.text().trim();
        console.log('[OCR] Respuesta Gemini (preview):', rawText.substring(0, 400));

        // Limpiar y parsear JSON
        let geminiData;
        try {
            const jsonText = extractJSON(rawText);
            geminiData = JSON.parse(jsonText);
        } catch (parseErr) {
            console.error('[OCR] Error parseando JSON:', parseErr.message);
            console.error('[OCR] Texto completo recibido:\n', rawText);
            return res.status(422).json({
                error: 'Gemini no pudo estructurar el documento. Verifica que el PDF sea legible.',
                raw: rawText.substring(0, 800)
            });
        }

        // ── Mapear al formato del frontend ────────────────────────────────────
        const items = Array.isArray(geminiData.items) ? geminiData.items : [];
        const products = items.map(item => ({
            codigo: '',
            nombre: String(item.producto || 'Producto'),
            cantidad: Number(item.cantidad) || 1,
            precio: Number(item.precio_unitario_usd) || 0
        }));

        const round2 = (num) => Math.round((Number(num) || 0) * 100) / 100;

        const subtotalFromItems = products.reduce((sum, p) => sum + p.cantidad * p.precio, 0);
        const ivaUsd = round2(geminiData.iva_usd);
        const grandTotal = round2(geminiData.gran_total_usd) || round2(subtotalFromItems + ivaUsd);

        const responseData = {
            documento: String(geminiData.documento || '').trim() || ('PDF-' + Date.now()),
            fechaEmision: String(geminiData.fecha || new Date().toISOString().split('T')[0]),
            totalOperacion: grandTotal,
            divisas: grandTotal,
            vendedor: '',
            products: products.map(p => ({ ...p, precio: round2(p.precio) })),
            iva: ivaUsd,
            tasaAplicada: exchangeRate
        };

        console.log(`[OCR] ✅ Extraído — doc: ${responseData.documento}, productos: ${products.length}, total: $${responseData.totalOperacion}, IVA: $${responseData.iva}`);
        
        // Track usage
        const db = require('../db');
        const newQuota = db.incrementOcrQuota();
        console.log(`[OCR] Cuota uso diario: ${newQuota.used}/${newQuota.limit}`);

        return res.json({ success: true, data: responseData, quota: newQuota });

    } catch (err) {
        console.error('[OCR] Error general:', err.message);
        return res.status(500).json({ error: 'Error procesando PDF con Gemini: ' + err.message });
    }
});

router.get('/quota', (req, res) => {
    try {
        const db = require('../db');
        return res.json(db.getOcrQuota());
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

module.exports = router;
