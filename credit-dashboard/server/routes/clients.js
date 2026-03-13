/**
 * routes/clients.js — Client CRUD endpoints (local-first)
 */
const express = require('express');
const router = express.Router();
const {
    getAllClients, getClientById, insertClient, upsertClient, generateId
} = require('../db');

// GET /api/clients — list all
router.get('/', (req, res) => {
    try {
        const clients = getAllClients();
        res.json({ data: clients, count: clients.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/clients/stats — overview stats
router.get('/stats', (req, res) => {
    try {
        const { get, query } = require('../db');
        const total = get('SELECT COUNT(*) as n FROM clients WHERE is_active = 1 AND deleted = 0')?.n || 0;
        const overdue = get("SELECT COUNT(DISTINCT client_id) as n FROM invoices WHERE status = 'en mora' AND deleted = 0")?.n || 0;
        const pending = get("SELECT COUNT(DISTINCT client_id) as n FROM invoices WHERE status = 'pendiente' AND deleted = 0")?.n || 0;
        res.json({
            total,
            overdue,
            pending,
            paid: total - overdue - pending
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/clients/:id — single client with invoices
router.get('/:id', (req, res) => {
    try {
        const client = getClientById(req.params.id);
        if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.json(client);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/clients/:id/transactions — single client's payment history
router.get('/:id/transactions', (req, res) => {
    try {
        const { query } = require('../db');
        const rows = query(`
            SELECT p.id, p.invoice_id, p.amount as amount_usd, p.method as payment_method, p.payment_date as created_at,
                   i.valery_note_id
            FROM payments p
            JOIN invoices i ON i.id = p.invoice_id
            WHERE p.client_id = ?
            ORDER BY p.payment_date DESC
        `, [req.params.id]);

        const mapped = rows.map(r => ({
            id: r.id,
            invoiceId: r.valery_note_id || r.invoice_id,
            type: 'payment',
            amountUsd: Number(r.amount_usd),
            paymentMethod: r.payment_method,
            metadata: {},
            status: 'procesado',
            createdAt: r.created_at
        }));
        res.json(mapped);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/clients — create new client
router.post('/', (req, res) => {
    try {
        const { name, rif, phone, email, notes } = req.body;
        if (!name) return res.status(400).json({ error: 'El nombre es requerido' });
        const client = insertClient({ name, rif, phone, email, notes });
        res.status(201).json(client);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/clients/:id — update client
router.put('/:id', (req, res) => {
    try {
        const existing = getClientById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });

        const updated = {
            ...existing,
            ...req.body,
            id: req.params.id,
            updated_at: new Date().toISOString(),
            synced: 0
        };
        upsertClient(updated, false);
        res.json(getClientById(req.params.id));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/clients/:id — soft delete
router.delete('/:id', (req, res) => {
    try {
        const existing = getClientById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });
        upsertClient({ ...existing, deleted: 1, updated_at: new Date().toISOString(), synced: 0 }, false);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
