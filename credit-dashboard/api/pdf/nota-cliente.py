"""
nota_cliente.py — Vercel Serverless Function (Python)
Genera un PDF estilo "nota simple" (A4, escala de grises, sin colores)
con el estado de cuenta de un cliente, mostrando solo facturas activas.
"""

import json
import io
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Table, TableStyle
)
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# ─── Constantes de estilo ─────────────────────────────────────────────────────
MARGIN = 20 * mm
PAGE_W, PAGE_H = A4

FONT       = "Helvetica"
FONT_BOLD  = "Helvetica-Bold"

# Grises
NEGRO      = colors.HexColor("#000000")
GRIS_OSC   = colors.HexColor("#333333")
GRIS_MED   = colors.HexColor("#666666")
GRIS_CLAR  = colors.HexColor("#AAAAAA")
BLANCO     = colors.white

# Tamaños de fuente
FS_EMPRESA  = 15
FS_SUBTITULO = 9
FS_DATOS    = 8.5
FS_FACTURA_H = 9
FS_ITEM     = 8
FS_TOTAL    = 11

def _estilos():
    s = getSampleStyleSheet()
    return {
        "empresa": ParagraphStyle("empresa", fontName=FONT_BOLD, fontSize=FS_EMPRESA, textColor=NEGRO, alignment=TA_CENTER, spaceAfter=1 * mm),
        "subtitulo": ParagraphStyle("subtitulo", fontName=FONT, fontSize=FS_SUBTITULO, textColor=GRIS_MED, alignment=TA_CENTER, spaceAfter=0),
        "datos_lbl": ParagraphStyle("datos_lbl", fontName=FONT_BOLD, fontSize=FS_DATOS, textColor=GRIS_MED, alignment=TA_LEFT),
        "datos_val": ParagraphStyle("datos_val", fontName=FONT, fontSize=FS_DATOS, textColor=NEGRO, alignment=TA_LEFT),
        "fac_num": ParagraphStyle("fac_num", fontName=FONT_BOLD, fontSize=FS_FACTURA_H, textColor=NEGRO, alignment=TA_LEFT),
        "fac_fecha": ParagraphStyle("fac_fecha", fontName=FONT, fontSize=FS_ITEM, textColor=GRIS_MED, alignment=TA_RIGHT),
        "fac_estado": ParagraphStyle("fac_estado", fontName=FONT_BOLD, fontSize=FS_ITEM - 0.5, textColor=GRIS_OSC, alignment=TA_LEFT),
        "item_desc": ParagraphStyle("item_desc", fontName=FONT, fontSize=FS_ITEM, textColor=NEGRO, leftIndent=5 * mm, alignment=TA_LEFT),
        "item_precio": ParagraphStyle("item_precio", fontName=FONT, fontSize=FS_ITEM, textColor=NEGRO, alignment=TA_RIGHT),
        "subtotal_lbl": ParagraphStyle("subtotal_lbl", fontName=FONT_BOLD, fontSize=FS_ITEM, textColor=GRIS_OSC, alignment=TA_RIGHT),
        "total_lbl": ParagraphStyle("total_lbl", fontName=FONT_BOLD, fontSize=FS_TOTAL, textColor=NEGRO, alignment=TA_LEFT),
        "total_val": ParagraphStyle("total_val", fontName=FONT_BOLD, fontSize=FS_TOTAL, textColor=NEGRO, alignment=TA_RIGHT),
        "nota_pie": ParagraphStyle("nota_pie", fontName=FONT, fontSize=7, textColor=GRIS_MED, alignment=TA_LEFT, leading=10),
        "footer": ParagraphStyle("footer", fontName=FONT, fontSize=7, textColor=GRIS_CLAR, alignment=TA_CENTER, leading=10),
    }

def _fmt_usd(valor: float) -> str:
    return f"${valor:,.2f}"

def _fmt_fecha(fecha_str: str) -> str:
    if not fecha_str:
        return "—"
    try:
        dt = datetime.strptime(fecha_str[:10], "%Y-%m-%d")
        return dt.strftime("%d/%m/%Y")
    except Exception:
        return fecha_str

def _hr_grueso(doc) -> HRFlowable:
    return HRFlowable(width="100%", thickness=1, color=NEGRO, spaceAfter=4 * mm, spaceBefore=4 * mm)

def _hr_fino(doc) -> HRFlowable:
    return HRFlowable(width="100%", thickness=0.3, color=GRIS_CLAR, spaceAfter=3 * mm, spaceBefore=3 * mm)

def generar_nota_cliente(cliente: dict, facturas: list, meta: dict) -> bytes:
    ESTADOS_ACTIVOS = {"activa", "pendiente", "mora", "en mora", "active", "vencida"}
    facturas_activas = [
        f for f in facturas
        if str(f.get("estado", "")).strip().lower() in ESTADOS_ACTIVOS
    ]

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN)

    ST = _estilos()
    story = []

    # ENCABEZADO
    story.append(Paragraph(meta.get("empresa", "BEIRUT"), ST["empresa"]))
    story.append(Paragraph("Estado de Cuenta", ST["subtitulo"]))
    story.append(Spacer(1, 3 * mm))
    story.append(_hr_grueso(doc))

    # DATOS DEL CLIENTE
    tasa_dia = meta.get("tasa_dia", 0)
    fecha_emision = _fmt_fecha(meta.get("fecha_emision", ""))

    datos_tabla = [
        [
            Paragraph("Cliente:", ST["datos_lbl"]), Paragraph(cliente.get("nombre", ""), ST["datos_val"]),
            Paragraph("Fecha de emisión:", ST["datos_lbl"]), Paragraph(fecha_emision, ST["datos_val"]),
        ],
        [
            Paragraph("Cédula / RIF:", ST["datos_lbl"]), Paragraph(cliente.get("cedula", "—"), ST["datos_val"]),
            Paragraph("Tasa del día:", ST["datos_lbl"]), Paragraph(f"Bs. {tasa_dia:,.2f} / USD" if tasa_dia else "—", ST["datos_val"]),
        ],
        [
            Paragraph("Teléfono:", ST["datos_lbl"]), Paragraph(cliente.get("telefono", "—"), ST["datos_val"]),
            Paragraph("", ST["datos_lbl"]), Paragraph("", ST["datos_val"]),
        ],
    ]

    col_w = [(PAGE_W - 2 * MARGIN) * p for p in [0.13, 0.32, 0.22, 0.33]]
    t_datos = Table(datos_tabla, colWidths=col_w)
    t_datos.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(t_datos)
    story.append(_hr_grueso(doc))

    # FACTURAS
    ancho_content = PAGE_W - 2 * MARGIN
    LABELS_ESTADO = {"activa": "ACTIVA", "active": "ACTIVA", "pendiente": "PENDIENTE", "mora": "EN MORA", "en mora": "EN MORA", "vencida": "VENCIDA"}

    for idx, fac in enumerate(facturas_activas):
        fac_id     = fac.get("id", f"#{idx + 1}")
        f_emision  = _fmt_fecha(fac.get("fecha_emision", ""))
        f_venc     = _fmt_fecha(fac.get("fecha_vencimiento", ""))
        estado_raw = str(fac.get("estado", "")).strip().lower()
        estado_lbl = LABELS_ESTADO.get(estado_raw, estado_raw.upper())

        cab_data = [[
            Paragraph(f"Factura  {fac_id}  ·  {estado_lbl}", ST["fac_num"]),
            Paragraph(f"Emisión: {f_emision}   Vence: {f_venc}", ST["fac_fecha"]),
        ]]
        t_cab = Table(cab_data, colWidths=[ancho_content * 0.55, ancho_content * 0.45])
        t_cab.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BOTTOMPADDING", (0, 0), (-1, -1), 1), ("TOPPADDING", (0, 0), (-1, -1), 1)]))
        story.append(t_cab)
        story.append(Spacer(1, 2 * mm))

        items = fac.get("items", [])
        if items:
            for item in items:
                qty   = item.get("cantidad", 1)
                desc  = item.get("descripcion", "Ítem")
                p_u   = item.get("precio_unitario", 0)
                sub   = item.get("subtotal", qty * float(p_u))
                
                fila_data = [[Paragraph(f"{qty} × {desc}", ST["item_desc"]), Paragraph(_fmt_usd(sub), ST["item_precio"])]]
                t_item = Table(fila_data, colWidths=[ancho_content * 0.75, ancho_content * 0.25])
                t_item.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 1), ("TOPPADDING", (0, 0), (-1, -1), 1)]))
                story.append(t_item)
        else:
            story.append(Paragraph("    (Sin detalle de ítems)", ST["item_desc"]))

        story.append(Spacer(1, 1.5 * mm))
        story.append(HRFlowable(width="100%", thickness=0.3, color=GRIS_CLAR, spaceBefore=1 * mm, spaceAfter=1.5 * mm))

        total_fac = fac.get("total_con_recargo", 0)
        sub_data = [[Paragraph("", ST["subtotal_lbl"]), Paragraph(f"Total:   {_fmt_usd(total_fac)}", ST["subtotal_lbl"])]]
        t_sub = Table(sub_data, colWidths=[ancho_content * 0.5, ancho_content * 0.5])
        t_sub.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BOTTOMPADDING", (0, 0), (-1, -1), 1), ("TOPPADDING", (0, 0), (-1, -1), 1)]))
        story.append(t_sub)

        if idx < len(facturas_activas) - 1:
            story.append(HRFlowable(width="100%", thickness=0.3, color=GRIS_CLAR, spaceBefore=4 * mm, spaceAfter=4 * mm))

    # TOTAL FINAL
    formato = meta.get("formato", "paralela")
    tasa_dia = meta.get("tasa_dia", 0)
    total_general = sum(float(f.get("total_con_recargo", 0)) for f in facturas_activas)
    
    if formato == "bcv" and tasa_dia:
        total_bs = total_general * float(tasa_dia)
        txt_total_val = f"Bs. {total_bs:,.2f}"
    else:
        txt_total_val = _fmt_usd(total_general)

    story.append(Spacer(1, 2 * mm))
    story.append(_hr_grueso(doc))

    total_data = [[Paragraph("TOTAL A PAGAR", ST["total_lbl"]), Paragraph(txt_total_val, ST["total_val"])]]
    t_total = Table(total_data, colWidths=[ancho_content * 0.6, ancho_content * 0.4])
    t_total.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BOTTOMPADDING", (0, 0), (-1, -1), 2), ("TOPPADDING", (0, 0), (-1, -1), 2)]))
    story.append(t_total)
    story.append(_hr_grueso(doc))

    # NOTA AL PIE
    recargo_pct = meta.get("recargo_porcentaje", 0)
    vencimiento_general = meta.get("vencimiento_general", "")
    nota_texto = "* Montos calculados en Bolívares al cambio. Dispone de 2 días para realizar el pago manteniendo esta tarifa actual. Para pagos efectuados directamente en divisas, le ofrecemos un descuento sobre el monto total de su deuda."
    if vencimiento_general:
        nota_texto += f"  Vencimiento general: {_fmt_fecha(vencimiento_general)}."
    if tasa_dia:
        nota_texto += f"  Tasa BCV referencial: Bs. {float(tasa_dia):,.2f}/USD."

    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(nota_texto, ST["nota_pie"]))
    story.append(Spacer(1, 6 * mm))

    # FOOTER
    fecha_gen = datetime.now().strftime("%d/%m/%Y %H:%M")
    story.append(HRFlowable(width="100%", thickness=0.3, color=GRIS_CLAR, spaceBefore=0, spaceAfter=2 * mm))
    story.append(Paragraph(f"{meta.get('empresa', 'Beirut')} · Sistema de Créditos  |  Generado: {fecha_gen}  |  Documento informativo — no fiscal", ST["footer"]))

    doc.build(story)
    buf.seek(0)
    return buf.read()


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                raise ValueError("Body vacío")
            
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            cliente_dict = data.get('cliente', {})
            facturas_list = data.get('facturas', [])
            meta_dict = data.get('meta', {})
            
            pdf_bytes = generar_nota_cliente(cliente_dict, facturas_list, meta_dict)
            
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/pdf')
            # Vercel needs this to be set as a correct array format or standard string
            safe_name = cliente_dict.get("nombre", "Cliente").replace(" ", "_").replace("/", "-")
            self.send_header('Content-Disposition', f'attachment; filename="estado_cuenta_{safe_name}.pdf"')
            self.end_headers()
            self.wfile.write(pdf_bytes)
            
        except Exception as e:
            trace_err = traceback.format_exc()
            self.send_response(500)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            error_data = {"error": str(e), "traceback": trace_err}
            self.wfile.write(json.dumps(error_data).encode('utf-8'))
