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
}

interface TicketOptions {
    clientName: string;
    clientRif?: string;
    clientPhone?: string;
    invoices: Invoice[];
    transactions: Transaction[];
    surchargePercent: number;
}

function formatCur(v: number) {
    return `$${v.toFixed(2)}`;
}

function formatDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getTxLabel(type: Transaction['type']) {
    switch (type) {
        case 'payment':   return 'Pago Recibido';
        case 'refund':    return 'Devolución';
        case 'fee':       return 'Recargo / Mora';
        case 'extension': return 'Ampliación';
        default:          return 'Transacción';
    }
}

export function generateTicket(opts: TicketOptions) {
    const { clientName, clientRif, clientPhone, invoices, transactions, surchargePercent } = opts;
    const factor = 1 + surchargePercent / 100;

    const pendingInvoices = invoices
        .filter(inv => inv.balance > 0)
        .sort((a, b) => new Date(a.dueDate ?? '').getTime() - new Date(b.dueDate ?? '').getTime());

    const totalDebt       = pendingInvoices.reduce((s, i) => s + i.balance, 0);
    const totalConRecargo = totalDebt * factor;
    const totalPaid       = transactions
        .filter(t => t.type === 'payment')
        .reduce((s, t) => s + t.amountUsd, 0);

    const today = new Date().toLocaleDateString('es-VE', {
        day: '2-digit', month: 'long', year: 'numeric',
    });
    const hour = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

    // Build the inner HTML rows for invoices
    const invoiceRows = pendingInvoices.map(inv => {
        const isOverdue = inv.dueDate ? new Date(inv.dueDate) < new Date() : false;
        const conRec    = inv.balance * factor;
        const shortId   = inv.id.length > 14 ? inv.id.slice(-14) : inv.id;

        const prodRows = (inv.products ?? []).map(p => {
            const price = (p.unit_price ?? p.unitPrice ?? 0) * factor;
            return `
            <tr class="prod-row">
                <td colspan="2" class="prod-desc">↳ ${p.quantity}x ${p.description}</td>
                <td class="mono right">${formatCur(price)}</td>
            </tr>`;
        }).join('');

        return `
        <tr class="${isOverdue ? 'overdue' : ''}">
            <td class="mono">${shortId}</td>
            <td class="right small">${formatDate(inv.dueDate)}</td>
            <td class="mono right bold">${formatCur(conRec)}</td>
        </tr>
        ${prodRows}`;
    }).join('');

    const txRows = transactions.slice(0, 15).map(tx => {
        const isCredit = tx.type === 'payment' || tx.type === 'refund';
        const sign     = isCredit ? '−' : '+';
        const dateStr  = new Date(tx.createdAt).toLocaleDateString('es-VE', {
            day: '2-digit', month: '2-digit', year: '2-digit',
        });
        return `
        <tr class="${isCredit ? 'credit' : 'debit'}">
            <td class="small">${dateStr}</td>
            <td>${getTxLabel(tx.type)}</td>
            <td class="mono right bold">${sign}${formatCur(tx.amountUsd)}</td>
        </tr>`;
    }).join('');

    const noDebtMsg = pendingInvoices.length === 0
        ? `<p class="al-dia">✓ Cuenta al día — sin saldos pendientes</p>`
        : '';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Ticket — ${clientName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&family=Inter:wght@400;600;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: #e8e8e8;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 30px 10px;
    font-family: 'Inter', sans-serif;
  }

  .ticket {
    background: #fff;
    width: 380px;
    padding: 0;
    border-radius: 4px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.18);
    overflow: hidden;
    position: relative;
  }

  /* torn edge top */
  .ticket::before {
    content: '';
    display: block;
    height: 14px;
    background: radial-gradient(circle at 8px 0, #e8e8e8 8px, #fff 8px) repeat-x;
    background-size: 16px 14px;
    margin-bottom: 0;
  }

  /* torn edge bottom */
  .ticket::after {
    content: '';
    display: block;
    height: 14px;
    background: radial-gradient(circle at 8px 14px, #e8e8e8 8px, #fff 8px) repeat-x;
    background-size: 16px 14px;
    margin-top: 0;
  }

  /* ── HEADER ─────────────────────────────────────── */
  .header {
    background: linear-gradient(135deg, #0D1F3D 0%, #0070BA 100%);
    padding: 20px 22px 18px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .header::after {
    content: '';
    position: absolute;
    right: -30px; top: -30px;
    width: 120px; height: 120px;
    background: rgba(255,255,255,0.06);
    border-radius: 50%;
  }

  .logo-img {
    height: 36px;
    object-fit: contain;
    margin-bottom: 8px;
    filter: brightness(0) invert(1);
  }

  .header-title {
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 3px;
    text-transform: uppercase;
    opacity: 0.85;
    margin-top: 4px;
  }

  /* ── BODY PADDING ───────────────────────────────── */
  .body  { padding: 16px 22px; }

  /* ── DATE / META ────────────────────────────────── */
  .meta {
    text-align: center;
    font-size: 10px;
    color: #888;
    margin-bottom: 14px;
    letter-spacing: 0.5px;
  }

  /* ── CLIENT BOX ─────────────────────────────────── */
  .client-box {
    background: #f4f7fb;
    border-left: 3px solid #0070BA;
    border-radius: 0 6px 6px 0;
    padding: 10px 12px;
    margin-bottom: 16px;
  }
  .client-label { font-size: 9px; font-weight: 700; color: #0070BA; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 3px; }
  .client-name  { font-size: 15px; font-weight: 700; color: #0D1F3D; }
  .client-sub   { font-size: 10px; color: #666; margin-top: 2px; }

  /* ── DASHED DIVIDER ─────────────────────────────── */
  .dash { border: none; border-top: 1.5px dashed #d0d0d0; margin: 14px 0; }

  /* ── SECTION TITLE ──────────────────────────────── */
  .section-title {
    font-size: 9px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #999; margin-bottom: 8px;
  }

  /* ── TABLES ─────────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th {
    font-size: 8.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1px; color: #aaa; padding: 0 0 5px 0; text-align: left;
  }
  th.right, td.right { text-align: right; }
  td { font-size: 11px; color: #333; padding: 4px 0; vertical-align: top; }

  .mono  { font-family: 'IBM Plex Mono', monospace; }
  .bold  { font-weight: 700; }
  .small { font-size: 10px; color: #666; }

  .overdue td { color: #dc2626; }

  .prod-row td   { font-size: 10px; color: #666; padding: 2px 0 2px 10px; }
  .prod-desc     { font-style: italic; }

  .credit td { color: #059669; }
  .debit  td { color: #dc2626; }

  .al-dia {
    font-size: 11px; font-weight: 600; color: #059669;
    text-align: center; padding: 8px 0;
  }

  /* ── TOTAL BOXES ────────────────────────────────── */
  .totals { display: flex; gap: 8px; margin: 6px 0; }
  .total-box {
    flex: 1; border-radius: 8px; padding: 10px 10px 8px;
    text-align: center;
  }
  .total-box.main  { background: #0D1F3D; }
  .total-box.disc  { background: #0070BA; }
  .total-box.paid  { background: #059669; }
  .total-box .t-label {
    font-size: 8px; font-weight: 700; letter-spacing: 1.5px;
    text-transform: uppercase; color: rgba(255,255,255,0.65); margin-bottom: 4px;
  }
  .total-box .t-value {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 15px; font-weight: 700; color: #fff;
  }

  /* ── FOOTER ─────────────────────────────────────── */
  .footer {
    background: #0D1F3D;
    padding: 12px 22px;
    text-align: center;
    color: rgba(255,255,255,0.45);
    font-size: 9px;
    letter-spacing: 1px;
    margin-top: 16px;
  }

  /* ── PRINT BUTTON (hidden on print) ─────────────── */
  .print-btn {
    display: block;
    width: calc(100% - 44px);
    margin: 0 22px 18px;
    padding: 11px;
    background: linear-gradient(135deg, #0D1F3D, #0070BA);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 1px;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  .print-btn:hover { opacity: 0.85; }

  @media print {
    body { background: white; padding: 0; }
    .ticket { box-shadow: none; width: 100%; }
    .ticket::before, .ticket::after { display: none; }
    .print-btn { display: none !important; }
    .footer { margin-top: 8px; }
  }
</style>
</head>
<body>
<div class="ticket">
  <div class="header">
    <img src="/beirut_logo.png" alt="Beirut" class="logo-img"
         onerror="this.style.display='none'; document.getElementById('logo-text').style.display='block'">
    <div id="logo-text" style="display:none; color:#fff; font-size:22px; font-weight:900; letter-spacing:3px;">BEIRUT</div>
    <div class="header-title">Estado de Cuenta</div>
  </div>

  <div class="body">
    <p class="meta">${today} &nbsp;·&nbsp; ${hour} &nbsp;·&nbsp; Beirut CRM</p>

    <!-- CLIENT -->
    <div class="client-box">
      <div class="client-label">Cliente</div>
      <div class="client-name">${clientName}</div>
      ${clientRif    ? `<div class="client-sub">${clientRif}</div>` : ''}
      ${clientPhone  ? `<div class="client-sub">${clientPhone}</div>` : ''}
    </div>

    <!-- TOTALS -->
    <div class="totals">
      <div class="total-box main">
        <div class="t-label">Monto</div>
        <div class="t-value">${formatCur(totalConRecargo)}</div>
      </div>
      <div class="total-box disc">
        <div class="t-label">Con Descuento</div>
        <div class="t-value">${formatCur(totalDebt)}</div>
      </div>
      <div class="total-box paid">
        <div class="t-label">Abonado</div>
        <div class="t-value">${formatCur(totalPaid)}</div>
      </div>
    </div>

    <hr class="dash">

    <!-- INVOICES -->
    <div class="section-title">Facturas Activas</div>
    ${noDebtMsg}
    ${pendingInvoices.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Factura</th>
          <th class="right">Vence</th>
          <th class="right">Monto</th>
        </tr>
      </thead>
      <tbody>
        ${invoiceRows}
      </tbody>
    </table>` : ''}

    <hr class="dash">

    <!-- PAYMENT HISTORY -->
    <div class="section-title">Historial de Pagos</div>
    ${transactions.length === 0
        ? `<p style="font-size:11px;color:#999;text-align:center;padding:6px 0;">Sin historial registrado.</p>`
        : `<table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Tipo</th>
          <th class="right">Monto</th>
        </tr>
      </thead>
      <tbody>
        ${txRows}
      </tbody>
    </table>`}
  </div>

  <button class="print-btn" onclick="window.print()">🖨️ &nbsp; IMPRIMIR TICKET</button>

  <div class="footer">
    DISTRIBUIDORA BEIRUT &nbsp;·&nbsp; BEIRUT CRM<br>
    Documento generado el ${today}
  </div>
</div>
</body>
</html>`;

    // Open in a new window
    const win = window.open('', '_blank', 'width=460,height=800,scrollbars=yes,resizable=yes');
    if (win) {
        win.document.write(html);
        win.document.close();
    }
}
