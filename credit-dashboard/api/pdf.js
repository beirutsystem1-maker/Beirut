/**
 * Vercel Serverless Function — PDF Extract via Gemini Vision
 * Route: /api/pdf  (POST)
 *
 * Written in ESM syntax because package.json has "type": "module".
 * Parses a PDF invoice using Google Gemini Vision AI and returns structured JSON.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.5-flash';

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

function extractJSON(text) {
    let clean = text.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
        clean = clean.substring(start, end + 1);
    }
    return clean;
}

/**
 * Parse multipart/form-data manually from the raw body buffer.
 */
function parseMultipart(buffer, boundary) {
    const sep = Buffer.from(`--${boundary}`);
    const parts = [];
    let start = 0;

    while (start < buffer.length) {
        const sepIdx = buffer.indexOf(sep, start);
        if (sepIdx === -1) break;
        const headerStart = sepIdx + sep.length + 2;
        const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart);
        if (headerEnd === -1) break;

        const headerStr = buffer.slice(headerStart, headerEnd).toString('utf8');
        const contentStart = headerEnd + 4;
        const nextSep = buffer.indexOf(sep, contentStart);
        const contentEnd = nextSep === -1 ? buffer.length : nextSep - 2;
        const content = buffer.slice(contentStart, contentEnd);

        const nameMatch = headerStr.match(/name="([^"]+)"/);
        const filenameMatch = headerStr.match(/filename="([^"]+)"/);
        const ctMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);

        if (nameMatch) {
            parts.push({
                name: nameMatch[1],
                filename: filenameMatch ? filenameMatch[1] : null,
                contentType: ctMatch ? ctMatch[1].trim() : 'text/plain',
                data: content
            });
        }
        start = nextSep === -1 ? buffer.length : nextSep;
    }
    return parts;
}

async function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
        if (!boundaryMatch) {
            return res.status(400).json({ error: 'Content-Type no es multipart/form-data válido' });
        }

        const rawBody = await readBody(req);
        const parts = parseMultipart(rawBody, boundaryMatch[1]);

        const filePart = parts.find(p => p.filename && p.contentType.includes('pdf'));
        const exchangeRatePart = parts.find(p => p.name === 'exchangeRate');
        const userApiKeyPart = parts.find(p => p.name === 'userApiKey');

        if (!filePart) {
            return res.status(400).json({ error: 'No se recibió ningún archivo PDF.' });
        }

        const exchangeRate = parseFloat(exchangeRatePart?.data.toString() || '1') || 1;
        const userApiKey = userApiKeyPart?.data.toString().trim() || null;

        const apiKey = userApiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'No se encontró API Key de Gemini. Configura GEMINI_API_KEY en Vercel.' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const pdfBase64 = filePart.data.toString('base64');
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const result = await model.generateContent([
            { inlineData: { data: pdfBase64, mimeType: 'application/pdf' } },
            buildPrompt(exchangeRate)
        ]);

        const rawText = result.response.text().trim();

        let geminiData;
        try {
            geminiData = JSON.parse(extractJSON(rawText));
        } catch {
            return res.status(422).json({
                error: 'Gemini no pudo estructurar el documento. Verifica que el PDF sea legible.',
                raw: rawText.substring(0, 800)
            });
        }

        const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
        const items = Array.isArray(geminiData.items) ? geminiData.items : [];
        const products = items.map(item => ({
            codigo: '',
            nombre: String(item.producto || 'Producto'),
            cantidad: Number(item.cantidad) || 1,
            precio: round2(item.precio_unitario_usd)
        }));

        const subtotalFromItems = products.reduce((s, p) => s + p.cantidad * p.precio, 0);
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

        return res.status(200).json({ success: true, data: responseData });

    } catch (err) {
        console.error('[OCR Serverless] Error:', err.message);
        return res.status(500).json({ error: 'Error procesando PDF con Gemini: ' + err.message });
    }
}
