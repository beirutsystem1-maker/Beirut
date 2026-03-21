"""
Backend Beirut - Extracción de PDF + Generación de Nota de Estado de Cuenta
FastAPI para procesar facturas PDFs y extraer datos
"""

import re
import io
import json
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import pdfplumber
from nota_pdf import generar_nota_cliente

app = FastAPI(title="Beirut PDF Extractor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def limpiar_numero_venezuela(texto: str) -> float:
    """
    Convierte formato venezolano a flotante
    Ejemplo: 7.499,99 -> 7499.99
    """
    if not texto:
        return 0.0
    
    texto = texto.strip()
    
    texto = re.sub(r'[BS$\s]', '', texto, flags=re.IGNORECASE)
    
    texto = texto.replace('.', '')
    texto = texto.replace(',', '.')
    
    try:
        return float(texto)
    except ValueError:
        return 0.0

def extraer_datos_factura(texto: str) -> Dict[str, Any]:
    """
    Extrae datos de la factura usando regex
    """
    datos = {
        'documento': '',
        'fechaEmision': '',
        'totalOperacion': 0.0,
        'divisas': 0.0,
        'vendedor': '',
        'products': []
    }
    
    lineas = texto.split('\n')
    
    patrones_documento = [
        r'(?:Nota\s*de\s*Entrega|Control|Factura|Documento|Nro\.?)\s*:?\s*([A-Z]?[\d\-]+)',
        r'Nro\.?\s*:?\s*([A-Z]?[\d\-]+)',
        r'([A-Z]?[\d]{5,})',
    ]
    
    for linea in lineas:
        for patron in patrones_documento:
            match = re.search(patron, linea, re.IGNORECASE)
            if match and not datos['documento']:
                documento = match.group(1).strip()
                if len(documento) >= 5:
                    datos['documento'] = documento
                    break
    
    patrones_fecha = [
        r'Fecha\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
        (\d{2}[/-]\d{2}[/-]\d{4})',
        r'(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})',
    ]
    
    for linea in lineas:
        for patron in patrones_fecha:
            match = re.search(patron, linea, re.IGNORECASE)
            if match:
                datos['fechaEmision'] = match.group(1)
                break
        if datos['fechaEmision']:
            break
    
    patrones_total = [
        r'Total\s*Operaci[óo]n\s*:?\s*([\d\. ,]+)',
        r'Total\s*General\s*:?\s*([\d\. ,]+)',
        r'Total\s*a\s*Pagar\s*:?\s*([\d\. ,]+)',
        r'Total\s*Bs\.?\s*:?\s*([\d\. ,]+)',
        r'TOTAL\s*:?\s*([\d\. ,]+)',
    ]
    
    for linea in lineas:
        linea_upper = linea.upper()
        if 'TOTAL' in linea_upper or 'OPERACION' in linea_upper:
            for patron in patrones_total:
                match = re.search(patron, linea, re.IGNORECASE)
                if match:
                    valor = match.group(1)
                    datos['totalOperacion'] = limpiar_numero_venezuela(valor)
                    break
            if datos['totalOperacion'] > 0:
                break
    
    patrones_divisas = [
        r'Divisas\s*:?\s*([\d\. ,]+)',
        r'USD\s*:?\s*([\d\. ,]+)',
    ]
    
    for linea in lineas:
        for patron in patrones_divisas:
            match = re.search(patron, linea, re.IGNORECASE)
            if match:
                valor = match.group(1)
                datos['divisas'] = limpiar_numero_venezuela(valor)
                break
        if datos['divisas'] > 0:
            break
    
    return datos

def extraer_productos(texto: str) -> List[Dict[str, Any]]:
    """
    Extrae productos de la factura
    """
    productos = []
    lineas = texto.split('\n')
    
    patron_producto = r'^\s*(\d+|[A-Z0-9\-]+)?\s*(.+?)\s+(\d+[\d,.]*)\s+([\d\. ,]+)\s*$'
    
    for linea in lineas:
        match = re.match(patron_producto, linea.strip())
        if match:
            codigo = match.group(1) or ''
            nombre = match.group(2).strip()
            cantidad = limpiar_numero_venezuela(match.group(3))
            precio = limpiar_numero_venezuela(match.group(4))
            
            if nombre and cantidad > 0 and precio > 0:
                if nombre.upper() not in ['SUBTOTAL', 'TOTAL', 'IVA', 'IGTF', 'DESCUENTO']:
                    productos.append({
                        'codigo': codigo,
                        'nombre': nombre,
                        'cantidad': cantidad,
                        'precio': precio
                    })
    
    return productos

@app.get("/")
async def root():
    return {"status": "ok", "message": "Beirut PDF Extractor API"}

@app.post("/api/pdf/extract")
async def extract_pdf(file: UploadFile = File(...)):
    """
    Extrae texto y datos de un archivo PDF
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos PDF")
    
    try:
        contenido = await file.read()
        
        with pdfplumber.open(io.BytesIO(contenido)) as pdf:
            texto_completo = ""
            for pagina in pdf.pages:
                texto_pagina = pagina.extract_text()
                if texto_pagina:
                    texto_completo += texto_pagina + "\n"
        
        if not texto_completo.strip():
            raise HTTPException(status_code=422, detail="No se pudo extraer texto del PDF")
        
        datos_factura = extraer_datos_factura(texto_completo)
        productos = extraer_productos(texto_completo)
        
        if datos_factura['products']:
            datos_factura['products'] = datos_factura['products']
        else:
            datos_factura['products'] = productos
        
        return {
            "text": texto_completo,
            "data": datos_factura,
            "success": True
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando PDF: {str(e)}")

@app.get("/health")
async def health():
    return {"status": "healthy"}


# ─── Modelos para la nota PDF ────────────────────────────────────────────────
class ItemFactura(BaseModel):
    cantidad: float = 1
    descripcion: str
    precio_unitario: float = 0
    subtotal: float = 0

class FacturaNota(BaseModel):
    id: str
    fecha_emision: str = ""
    fecha_vencimiento: str = ""
    estado: str  # activa | pendiente | mora | en mora
    items: List[ItemFactura] = []
    total_con_recargo: float = 0

class ClienteNota(BaseModel):
    nombre: str
    cedula: str = ""
    telefono: str = ""

class MetaNota(BaseModel):
    empresa: str = "BEIRUT"
    fecha_emision: str = ""
    tasa_dia: float = 0
    recargo_porcentaje: float = 30
    vencimiento_general: str = ""

class NotaRequest(BaseModel):
    cliente: ClienteNota
    facturas: List[FacturaNota]
    meta: MetaNota


@app.post("/api/pdf/nota-cliente",
          summary="Genera PDF de estado de cuenta estilo nota simple")
async def generar_nota_pdf(payload: NotaRequest):
    """
    Recibe los datos del cliente, sus facturas activas/pendientes/mora
    y metadata empresarial, y devuelve un PDF estilo nota simple A4
    en escala de grises listo para descargar.
    """
    try:
        cliente_dict = payload.cliente.model_dump()
        facturas_list = [
            {
                **f.model_dump(),
                "items": [i.model_dump() for i in f.items],
            }
            for f in payload.facturas
        ]
        meta_dict = payload.meta.model_dump()

        pdf_bytes = generar_nota_cliente(cliente_dict, facturas_list, meta_dict)

        nombre_archivo = (
            f"estado_cuenta_{payload.cliente.nombre.replace(' ', '_')}.pdf"
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{nombre_archivo}"',
                "Content-Length": str(len(pdf_bytes)),
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generando el PDF: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)
