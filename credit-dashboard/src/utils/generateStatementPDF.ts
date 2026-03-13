// Dynamic import para jspdf
// import { jsPDF } from 'jspdf';
interface Product {
    description: string;
    quantity: number;
    unit_price?: number;
    unitPrice?: number;
}

interface Invoice {
    id: string;
    issueDate: string;
    dueDate?: string;
    balance: number;
    totalAmount: number;
    products?: Product[];
}

interface Transaction {
    id: string;
    type: 'payment' | 'refund' | 'fee' | 'extension';
    amountUsd: number;
    createdAt: string;
    invoiceId?: string;
}

interface StatementOptions {
    clientName: string;
    clientRif?: string;
    clientPhone?: string;
    invoices: Invoice[];
    transactions: Transaction[];
    surchargePercent: number;
}

// Colores corporativos Beirut
const COLORS = {
    darkNavy: [13, 31, 61] as [number, number, number],       // #0D1F3D
    blue: [0, 112, 186] as [number, number, number],          // #0070BA
    lightBlue: [0, 152, 218] as [number, number, number],     // #0098DA
    white: [255, 255, 255] as [number, number, number],
    lightGray: [245, 247, 250] as [number, number, number],
    midGray: [200, 210, 220] as [number, number, number],
    darkGray: [60, 75, 95] as [number, number, number],
    green: [16, 185, 129] as [number, number, number],
    amber: [245, 158, 11] as [number, number, number],
    textDark: [20, 30, 50] as [number, number, number],
};

function formatCurrency(val: number) {
    return `$${val.toFixed(2)}`;
}

function formatDate(dateStr?: string) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getTxLabel(type: Transaction['type']) {
    switch (type) {
        case 'payment': return 'Pago Recibido';
        case 'refund': return 'Devolución';
        case 'fee': return 'Recargo / Mora';
        case 'extension': return 'Ampliación';
        default: return 'Transacción';
    }
}

export async function generateStatementPDF(opts: StatementOptions): Promise<void> {
    const { clientName, clientRif, clientPhone, invoices, transactions, surchargePercent } = opts;
    const factor = 1 + surchargePercent / 100;

    const pendingInvoices = invoices
        .filter(inv => inv.balance > 0)
        .sort((a, b) => new Date(a.dueDate ?? '').getTime() - new Date(b.dueDate ?? '').getTime());

    const totalDebt = pendingInvoices.reduce((s, i) => s + i.balance, 0);
    const totalConRecargo = totalDebt * factor;
    const totalPaid = transactions
        .filter(t => t.type === 'payment')
        .reduce((s, t) => s + t.amountUsd, 0);

    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();   // 210
    const ph = doc.internal.pageSize.getHeight();  // 297
    let y = 0;

    // ─── HEADER BACKGROUND ─────────────────────────────────────────────────────
    doc.setFillColor(...COLORS.darkNavy);
    doc.rect(0, 0, pw, 48, 'F');

    // Diagonal accent stripe
    doc.setFillColor(...COLORS.blue);
    doc.triangle(pw - 60, 0, pw, 0, pw, 48, 'F');
    doc.setFillColor(...COLORS.lightBlue);
    doc.triangle(pw - 30, 0, pw, 0, pw, 24, 'F');

    // ─── LOGO ──────────────────────────────────────────────────────────────────
    try {
        // Try to load the logo as base64
        const response = await fetch('/beirut_logo.png');
        if (response.ok) {
            const blob = await response.blob();
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });
            doc.addImage(base64, 'PNG', 8, 6, 55, 22);
        }
    } catch {
        // Fallback: text logo
        doc.setTextColor(...COLORS.white);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('BEIRUT', 10, 22);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('DISTRIBUIDORA', 10, 28);
    }

    // ─── HEADER TEXT (right side) ──────────────────────────────────────────────
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('ESTADO DE CUENTA', pw - 12, 18, { align: 'right' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(170, 200, 230);
    const today = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.text(`Emitido: ${today}`, pw - 12, 26, { align: 'right' });
    doc.text(`Generado por Beirut CRM`, pw - 12, 32, { align: 'right' });

    y = 56;

    // ─── CLIENT INFO CARD ──────────────────────────────────────────────────────
    doc.setFillColor(...COLORS.lightGray);
    doc.roundedRect(10, y, pw - 20, 26, 3, 3, 'F');
    doc.setDrawColor(...COLORS.blue);
    doc.setLineWidth(0.6);
    doc.line(10, y, 10, y + 26); // left accent line
    doc.setLineWidth(0.1);

    doc.setTextColor(...COLORS.darkGray);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE', 15, y + 7);

    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(clientName, 15, y + 15);

    if (clientRif || clientPhone) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.darkGray);
        const info = [clientRif, clientPhone].filter(Boolean).join('   ·   ');
        doc.text(info, 15, y + 22);
    }

    // Status badge (right side of card)
    if (totalDebt > 0) {
        doc.setFillColor(...COLORS.amber);
        doc.roundedRect(pw - 50, y + 6, 38, 12, 2, 2, 'F');
        doc.setTextColor(...COLORS.white);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('SALDO PENDIENTE', pw - 31, y + 14, { align: 'center' });
    }

    y += 34;

    // ─── SUMMARY BOXES ─────────────────────────────────────────────────────────
    const boxW = (pw - 26) / 3;

    const summaryBoxes = [
        {
            label: 'MONTO',
            value: formatCurrency(totalConRecargo),
            sub: `(Con recargo ${surchargePercent}%)`,
            bg: COLORS.darkNavy as [number, number, number],
            fg: COLORS.white as [number, number, number],
            fgSub: [120, 160, 200] as [number, number, number],
        },
        {
            label: 'MONTO CON DESCUENTO',
            value: formatCurrency(totalDebt),
            sub: '(Sin recargo)',
            bg: COLORS.blue as [number, number, number],
            fg: COLORS.white as [number, number, number],
            fgSub: [180, 220, 255] as [number, number, number],
        },
        {
            label: 'TOTAL ABONADO',
            value: formatCurrency(totalPaid),
            sub: `${transactions.filter(t => t.type === 'payment').length} pago(s)`,
            bg: COLORS.green as [number, number, number],
            fg: COLORS.white as [number, number, number],
            fgSub: [180, 240, 220] as [number, number, number],
        },
    ];

    summaryBoxes.forEach((box, i) => {
        const bx = 10 + i * (boxW + 3);
        doc.setFillColor(...box.bg);
        doc.roundedRect(bx, y, boxW, 22, 3, 3, 'F');

        doc.setTextColor(...box.fg);
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.text(box.label, bx + boxW / 2, y + 6, { align: 'center' });

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text(box.value, bx + boxW / 2, y + 14, { align: 'center' });

        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...box.fgSub);
        doc.text(box.sub, bx + boxW / 2, y + 20, { align: 'center' });
    });

    y += 30;

    // ─── FACTURAS ACTIVAS ──────────────────────────────────────────────────────
    if (pendingInvoices.length > 0) {
        // Section title
        doc.setFillColor(...COLORS.darkNavy);
        doc.rect(10, y, pw - 20, 8, 'F');
        doc.setTextColor(...COLORS.white);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('FACTURAS ACTIVAS', 14, y + 5.5);
        y += 10;

        // Table header
        const cols = { id: 14, date: 60, due: 90, total: 125, balance: 155, recargo: 185 };

        doc.setFillColor(...COLORS.lightGray);
        doc.rect(10, y, pw - 20, 7, 'F');
        doc.setTextColor(...COLORS.darkGray);
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.text('# FACTURA', cols.id, y + 4.8);
        doc.text('EMISIÓN', cols.date, y + 4.8);
        doc.text('VENCE', cols.due, y + 4.8);
        doc.text('ORIGINAL', cols.total, y + 4.8, { align: 'right' });
        doc.text('SALDO', cols.balance, y + 4.8, { align: 'right' });
        doc.text('CON REC.', cols.recargo, y + 4.8, { align: 'right' });
        y += 9;

        let rowAlt = false;
        for (const inv of pendingInvoices) {
            const rowH = 7 + (inv.products && inv.products.length > 0 ? inv.products.length * 5 : 0);

            // Page overflow check
            if (y + rowH > ph - 40) {
                doc.addPage();
                y = 15;
            }

            if (rowAlt) {
                doc.setFillColor(248, 250, 252);
                doc.rect(10, y - 1, pw - 20, rowH, 'F');
            }
            rowAlt = !rowAlt;

            const isOverdue = inv.dueDate ? new Date(inv.dueDate) < new Date() : false;
            const montoConRecargo = inv.balance * factor;

            doc.setTextColor(...COLORS.textDark);
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'bold');

            // Short invoice ID
            const shortId = inv.id.length > 12 ? inv.id.slice(-12) : inv.id;
            doc.text(shortId, cols.id, y + 4.5);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.text(formatDate(inv.issueDate), cols.date, y + 4.5);

            // Due date with color
            if (isOverdue) doc.setTextColor(220, 38, 38);
            else doc.setTextColor(...COLORS.textDark);
            doc.text(formatDate(inv.dueDate), cols.due, y + 4.5);

            doc.setTextColor(...COLORS.darkGray);
            doc.text(formatCurrency(inv.totalAmount), cols.total, y + 4.5, { align: 'right' });

            doc.setTextColor(...COLORS.textDark);
            doc.setFont('helvetica', 'bold');
            doc.text(formatCurrency(inv.balance), cols.balance, y + 4.5, { align: 'right' });

            doc.setTextColor(...COLORS.amber);
            doc.text(formatCurrency(montoConRecargo), cols.recargo, y + 4.5, { align: 'right' });

            y += 7;

            // Products sub-rows
            if (inv.products && inv.products.length > 0) {
                for (const p of inv.products) {
                    if (y > ph - 30) { doc.addPage(); y = 15; }
                    const price = (p.unit_price !== undefined ? p.unit_price : (p.unitPrice ?? 0)) * factor;
                    doc.setTextColor(100, 120, 150);
                    doc.setFontSize(6.5);
                    doc.setFont('helvetica', 'normal');
                    doc.text(`  ▸  ${p.quantity}x  ${p.description}`, cols.id + 3, y + 3.5);
                    doc.text(formatCurrency(price), cols.recargo, y + 3.5, { align: 'right' });
                    y += 5;
                }
            }

            // Bottom separator line
            doc.setDrawColor(...COLORS.midGray);
            doc.setLineWidth(0.1);
            doc.line(10, y, pw - 10, y);
        }

        // Total row
        y += 2;
        doc.setFillColor(...COLORS.darkNavy);
        doc.rect(10, y, pw - 20, 9, 'F');
        doc.setTextColor(...COLORS.white);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('TOTAL', cols.id, y + 6);
        doc.text(formatCurrency(totalDebt), cols.balance, y + 6, { align: 'right' });

        doc.setTextColor(...COLORS.amber);
        doc.text(formatCurrency(totalConRecargo), cols.recargo, y + 6, { align: 'right' });
        y += 14;
    } else {
        doc.setFillColor(...COLORS.lightGray);
        doc.roundedRect(10, y, pw - 20, 12, 2, 2, 'F');
        doc.setTextColor(...COLORS.darkGray);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('✓  No hay saldos pendientes.', pw / 2, y + 8, { align: 'center' });
        y += 18;
    }

    // ─── HISTORIAL DE PAGOS ────────────────────────────────────────────────────
    if (transactions.length > 0) {
        if (y > ph - 60) { doc.addPage(); y = 15; }

        doc.setFillColor(...COLORS.blue);
        doc.rect(10, y, pw - 20, 8, 'F');
        doc.setTextColor(...COLORS.white);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('HISTORIAL DE PAGOS', 14, y + 5.5);
        y += 10;

        for (const tx of transactions.slice(0, 20)) {
            if (y > ph - 30) { doc.addPage(); y = 15; }
            const dateStr = new Date(tx.createdAt).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' });
            const isCredit = tx.type === 'payment' || tx.type === 'refund';
            const sign = isCredit ? '−' : '+';

            doc.setFillColor(isCredit ? 240 : 255, isCredit ? 253 : 245, isCredit ? 244 : 235);
            doc.rect(10, y - 1, pw - 20, 7, 'F');

            doc.setTextColor(...COLORS.darkGray);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.text(dateStr, 14, y + 4);
            doc.text(getTxLabel(tx.type), 40, y + 4);
            if (tx.invoiceId) {
                doc.setTextColor(120, 140, 170);
                doc.setFontSize(6);
                doc.text(`Fac: ${tx.invoiceId.slice(-10)}`, 100, y + 4);
            }

            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(isCredit ? 16 : 220, isCredit ? 185 : 38, isCredit ? 129 : 38);
            doc.text(`${sign}${formatCurrency(tx.amountUsd)}`, pw - 12, y + 4, { align: 'right' });

            doc.setDrawColor(...COLORS.midGray);
            doc.setLineWidth(0.1);
            doc.line(10, y + 6, pw - 10, y + 6);
            y += 7;
        }
        y += 5;
    }

    // ─── FOOTER ────────────────────────────────────────────────────────────────
    const footerY = ph - 18;

    doc.setFillColor(...COLORS.darkNavy);
    doc.rect(0, footerY, pw, 18, 'F');

    doc.setFillColor(...COLORS.blue);
    doc.triangle(0, footerY, 40, footerY, 0, ph, 'F');

    doc.setTextColor(140, 170, 210);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Distribuidora Beirut  ·  Beirut CRM', pw / 2, footerY + 7, { align: 'center' });
    doc.text(`Generado el ${today}  ·  Documento informativo`, pw / 2, footerY + 13, { align: 'center' });

    // Page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setTextColor(100, 130, 170);
        doc.setFontSize(6.5);
        doc.text(`Página ${i} de ${pageCount}`, pw - 12, footerY + 7, { align: 'right' });
    }

    // ─── SAVE ──────────────────────────────────────────────────────────────────
    const safeName = clientName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    const dateTag = new Date().toISOString().slice(0, 10);
    doc.save(`Estado-Cuenta-${safeName}-${dateTag}.pdf`);
}
