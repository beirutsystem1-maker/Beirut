import { GoogleGenerativeAI } from '@google/generative-ai';
import { toLocalDateString } from '../utils/dates';

const MODEL_NAME = 'gemini-2.5-flash-lite';

function buildPrompt(tasa: number) {
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

function extractJSON(text: string) {
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

export async function extractInvoiceData(file: File, envApiKey: string, userApiKey: string, exchangeRate: number) {
    const apiKey = userApiKey || envApiKey;
    if (!apiKey) {
        throw new Error('No se encontró API Key de Gemini. Configúrala en los ajustes.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // Extraer base64 guardando el tipo Mime
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));

    const result = await model.generateContent([
        {
            inlineData: {
                data: base64,
                mimeType: file.type || 'application/pdf'
            }
        },
        buildPrompt(exchangeRate)
    ]);

    const rawText = result.response.text().trim();
    
    let geminiData;
    try {
        const jsonText = extractJSON(rawText);
        geminiData = JSON.parse(jsonText);
    } catch (parseErr: any) {
        throw new Error('Gemini no pudo estructurar el documento. Verifica que el archivo sea legible.\nDetalle: ' + rawText.substring(0, 500));
    }

    const items = Array.isArray(geminiData.items) ? geminiData.items : [];
    const products = items.map((item: any) => ({
        codigo: '',
        nombre: String(item.producto || 'Producto'),
        cantidad: Number(item.cantidad) || 1,
        precio: Number(item.precio_unitario_usd) || 0
    }));

    const round2 = (num: number) => Math.round((Number(num) || 0) * 100) / 100;
    const subtotalFromItems = products.reduce((sum: number, p: any) => sum + p.cantidad * p.precio, 0);
    const ivaUsd = round2(geminiData.iva_usd);
    const grandTotal = round2(geminiData.gran_total_usd) || round2(subtotalFromItems + ivaUsd);

    return {
        documento: String(geminiData.documento || '').trim() || ('DOC-' + Date.now()),
        fechaEmision: String(geminiData.fecha || toLocalDateString(new Date())),
        totalOperacion: grandTotal,
        divisas: grandTotal,
        vendedor: '',
        products: products.map((p: any) => ({ ...p, precio: round2(p.precio) })),
        iva: ivaUsd,
        tasaAplicada: exchangeRate
    };
}
