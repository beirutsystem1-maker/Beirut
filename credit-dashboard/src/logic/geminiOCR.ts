/**
 * geminiOCR.ts
 * Llama a Gemini Vision directamente desde el browser —
 * sin pasar por el servidor, sin límites de cuota del servidor.
 *
 * Usa el endpoint REST oficial de Google AI Studio:
 * POST https://generativelanguage.googleapis.com/v1/models/{model}:generateContent?key={apiKey}
 */

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_ENDPOINT = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent`;

/**
 * Lista los modelos disponibles para la API key dada (diagnóstico).
 * Llama en consola del navegador: import('/src/logic/geminiOCR.ts').then(m => m.listAvailableModels('TU_KEY'))
 */
export async function listAvailableModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${GEMINI_BASE}/models?key=${apiKey}`);
  const data = await res.json();
  const names = (data.models || []).map((m: any) => m.name);
  console.log('[Gemini] Modelos disponibles:', names);
  return names;
}

// ─── Tipo de respuesta ────────────────────────────────────────────────────────
export interface OCRResult {
  documento: string;
  fechaEmision: string;
  totalOperacion: number;
  divisas: number;
  vendedor: string;
  products: Array<{
    codigo: string;
    nombre: string;
    cantidad: number;
    precio: number;
  }>;
  iva: number;
  tasaAplicada: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildPrompt(tasa: number): string {
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
   - producto: descripción completa del producto
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

function extractJSON(text: string): string {
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result = "data:application/pdf;base64,XXXXX"
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Función principal ────────────────────────────────────────────────────────
export async function extractInvoiceFromPDF(
  file: File,
  exchangeRate: number,
  apiKey: string
): Promise<OCRResult> {
  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

  const pdfBase64 = await fileToBase64(file);

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            inline_data: {
              mime_type: 'application/pdf',
              data: pdfBase64,
            },
          },
          { text: buildPrompt(exchangeRate) },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  };

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const message = errBody?.error?.message || response.statusText;
    throw new Error(`Gemini API error (${response.status}): ${message}`);
  }

  const data = await response.json();
  const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  if (!rawText) throw new Error('Gemini no devolvió texto. Verifica que el PDF sea legible.');

  let geminiData: any;
  try {
    geminiData = JSON.parse(extractJSON(rawText));
  } catch {
    throw new Error(`No se pudo parsear la respuesta de Gemini. Respuesta: ${rawText.substring(0, 300)}`);
  }

  const items: any[] = Array.isArray(geminiData.items) ? geminiData.items : [];
  const products = items.map(item => ({
    codigo: '',
    nombre: String(item.producto || 'Producto'),
    cantidad: Number(item.cantidad) || 1,
    precio: round2(item.precio_unitario_usd),
  }));

  const subtotalFromItems = products.reduce((s, p) => s + p.cantidad * p.precio, 0);
  const ivaUsd = round2(geminiData.iva_usd);
  const grandTotal = round2(geminiData.gran_total_usd) || round2(subtotalFromItems + ivaUsd);

  return {
    documento: String(geminiData.documento || '').trim() || 'PDF-' + Date.now(),
    fechaEmision: String(geminiData.fecha || new Date().toISOString().split('T')[0]),
    totalOperacion: grandTotal,
    divisas: grandTotal,
    vendedor: '',
    products,
    iva: ivaUsd,
    tasaAplicada: exchangeRate,
  };
}
