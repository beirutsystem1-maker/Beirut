/**
 * routes/invoices.js — Invoice + payment CRUD endpoints (local-first)
 */
const express = require('express');
const router = express.Router();
const {
    getInvoicesForClient, insertInvoice, upsertInvoice,
    updateInvoiceBalance, insertPayment, get, query, run, persist, generateId
} = require('../db');


// GET /api/invoices?client_id=xxx — list invoices for a client
router.get('/', (req, res) => {
    try {
        const { client_id } = req.query;
        if (!client_id) return res.status(400).json({ error: 'client_id requerido' });
        const invoices = getInvoicesForClient(client_id);
        res.json(invoices);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/invoices — create new invoice with products
router.post('/', (req, res) => {
    try {
        const { client_id, valery_note_id, issue_date, due_date, total_amount, iva, balance, status, products } = req.body;
        if (!client_id) return res.status(400).json({ error: 'client_id requerido' });

        const id = insertInvoice(
            { client_id, valery_note_id, issue_date, due_date, total_amount, iva, balance, status },
            products || []
        );
        const invoices = getInvoicesForClient(client_id);
        res.status(201).json(invoices.find(i => i.id === id));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/invoices/:id — update invoice (balance, status, etc.)
router.put('/:id', (req, res) => {
    try {
        const param = req.params.id;
        const existing = get('SELECT * FROM invoices WHERE (id = ? OR valery_note_id = ?) AND (deleted = 0 OR deleted IS NULL)', [param, param]);
        if (!existing) return res.status(404).json({ error: 'Factura no encontrada' });

        const updated = { ...existing, ...req.body, id: existing.id, updated_at: new Date().toISOString(), synced: 0 };
        upsertInvoice(updated, false);
        res.json(get('SELECT * FROM invoices WHERE id = ?', [existing.id]));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/invoices/:id/payments — register a payment on an invoice
router.post('/:id/payments', (req, res) => {
    try {
        const param = req.params.id;
        const invoice = get('SELECT * FROM invoices WHERE (id = ? OR valery_note_id = ?) AND (deleted = 0 OR deleted IS NULL)', [param, param]);
        if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

        const { amount, method, exchange_rate, surcharge_pct, payment_date } = req.body;
        if (!amount || amount <= 0) return res.status(400).json({ error: 'Monto inválido' });

        // Calculate new balance
        const newBalance = Math.max(0, Math.round((invoice.balance - amount) * 100) / 100);
        const newStatus = newBalance <= 0 ? 'pagado' : (
            new Date(invoice.due_date) < new Date() ? 'en mora' : 'pendiente'
        );

        // Insert payment and update invoice balance
        insertPayment({
            invoice_id: invoice.id,
            client_id: invoice.client_id,
            amount,
            method,
            exchange_rate,
            surcharge_pct,
            payment_date
        });
        updateInvoiceBalance(invoice.id, newBalance, newStatus);

        res.json({
            success: true,
            newBalance,
            newStatus,
            invoice: get('SELECT * FROM invoices WHERE id = ?', [invoice.id])
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/invoices/:id/payments — list payments for an invoice
router.get('/:id/payments', (req, res) => {
    try {
        const param = req.params.id;
        // Resolve the real internal id in case valery_note_id was passed
        const invoice = get('SELECT id FROM invoices WHERE (id = ? OR valery_note_id = ?) AND (deleted = 0 OR deleted IS NULL)', [param, param]);
        if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
        const payments = query('SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC', [invoice.id]);
        res.json(payments);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/invoices/:id/products — replace all products of an invoice and recalc total_amount
router.put('/:id/products', (req, res) => {
    try {
        const param = req.params.id;
        const existing = get('SELECT * FROM invoices WHERE (id = ? OR valery_note_id = ?) AND (deleted = 0 OR deleted IS NULL)', [param, param]);
        if (!existing) return res.status(404).json({ error: 'Factura no encontrada' });
        const invoiceId = existing.id; // always use the real internal UUID

        const { products } = req.body;
        if (!Array.isArray(products)) return res.status(400).json({ error: 'products debe ser un array' });

        // Delete existing products
        run('DELETE FROM invoice_products WHERE invoice_id = ?', [invoiceId]);

        // Insert updated products
        let newTotal = 0;
        for (const p of products) {
            const qty = parseFloat(p.quantity) || 0;
            const price = parseFloat(p.unit_price !== undefined ? p.unit_price : p.unitPrice) || 0;
            newTotal += qty * price;
            run(
                `INSERT INTO invoice_products (id, invoice_id, description, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`,
                [generateId(), invoiceId, p.description || '', qty, price]
            );
        }

        // Recalculate total_amount; keep balance proportional if it was partial
        const oldTotal = existing.total_amount || 0;
        const oldBalance = existing.balance || 0;
        
        // Recalculate IVA if original invoice had IVA or if requested
        let newIva = 0;
        // Logic: If existing invoice had IVA, we keep applying IVA to new subtotal
        if (existing.iva > 0 || (req.body.apply_iva !== false && existing.iva === 0 && (newTotal * 0.16) > 0)) {
            newIva = Math.round(newTotal * 0.16 * 100) / 100;
        }
        
        const currentTotalWithIva = newTotal + newIva;
        let newBalance = currentTotalWithIva; // default: full amount owed
        
        if (oldTotal > 0 && oldBalance < oldTotal) {
            // Some payments were made: keep the paid amount, adjust balance
            const amountPaid = oldTotal - oldBalance;
            newBalance = Math.max(0, currentTotalWithIva - amountPaid);
        }

        const now = new Date().toISOString();
        const newStatus = newBalance <= 0 ? 'pagado'
            : (new Date(existing.due_date) < new Date() ? 'en mora' : 'pendiente');
        run(
            'UPDATE invoices SET total_amount = ?, iva = ?, balance = ?, status = ?, updated_at = ?, synced = 0 WHERE id = ?',
            [currentTotalWithIva, newIva, newBalance, newStatus, now, invoiceId]
        );
        persist();

        // Return updated invoice with products
        const updatedInvoice = get('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
        const updatedProducts = query('SELECT * FROM invoice_products WHERE invoice_id = ?', [invoiceId]);
        res.json({ ...updatedInvoice, products: updatedProducts });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/invoices/:id — soft-delete invoice + hard-delete products + preserve payments
router.delete('/:id', (req, res) => {
    try {
        const param = req.params.id;
        // Accept both internal UUID and valery_note_id AND implicitly filter deleted ones
        const existing = get('SELECT * FROM invoices WHERE (id = ? OR valery_note_id = ?) AND (deleted = 0 OR deleted IS NULL)', [param, param]);
        if (!existing) return res.status(404).json({ error: 'Factura no encontrada' });

        const invoiceId = existing.id; // always use the real internal UUID
        const now = new Date().toISOString();

        // Soft-delete the invoice
        run('UPDATE invoices SET deleted = 1, updated_at = ?, synced = 0 WHERE id = ?', [now, invoiceId]);
        // Hard-delete products
        run('DELETE FROM invoice_products WHERE invoice_id = ?', [invoiceId]);

        // Persist to disk
        persist();

        res.json({ success: true, invoiceId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
