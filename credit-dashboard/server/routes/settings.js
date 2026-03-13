const express = require('express');
const router = express.Router();
const { run, query, generateId, getNow, persist } = require('../db');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// POST /api/settings/wipe — wipe the local database AND Supabase
router.post('/wipe', async (req, res) => {
    try {
        // 1. Wipe local DB (except sync_meta)
        run("DELETE FROM invoice_products WHERE id != '0000'");
        run("DELETE FROM payments WHERE id != '0000'");
        run("DELETE FROM invoices WHERE id != '0000'");
        run("DELETE FROM clients WHERE id != '0000'");

        // Reset sync queue counters
        run("UPDATE sync_meta SET value = '1970-01-01T00:00:00Z'");
        persist();

        // 2. Wipe remote Supabase DB
        if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
            // Delete payments and invoices first to avoid FK constraints, then clients
            const uuidNull = '00000000-0000-0000-0000-000000000000';
            
            const { error: err1 } = await supabase.from('invoice_products').delete().neq('id', uuidNull);
            if (err1) throw new Error('Supabase invoice_products error: ' + err1.message);

            const { error: err2 } = await supabase.from('payments').delete().neq('id', uuidNull);
            if (err2) throw new Error('Supabase payments error: ' + err2.message);

            const { error: err3 } = await supabase.from('invoices').delete().neq('id', uuidNull);
            if (err3) throw new Error('Supabase invoices error: ' + err3.message);

            const { error: err4 } = await supabase.from('clients').delete().neq('id', uuidNull);
            if (err4) throw new Error('Supabase clients error: ' + err4.message);
        }

        res.json({ success: true, message: 'Base de datos Local y Remota limpiada' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/settings/demo — inject demo data
router.post('/demo', (req, res) => {
    try {
        const demoClients = [
            { name: "La Gran Distribuidora C.A.", rif: "J-30123456-7" },
            { name: "Inversiones Mar Azul", rif: "J-40555666-8" },
            { name: "Bodegón Caracas Express", rif: "J-50111222-3" },
            { name: "Suministros del Norte", rif: "J-29888777-1" },
            { name: "Farmacia San José", rif: "J-31444555-9" }
        ];

        const jan2026 = "2026-01-15";
        const feb2026 = "2026-02-10";
        const now = getNow();

        // Use a transaction for bulk insert
        for (let i = 0; i < demoClients.length; i++) {
            const cid = generateId();
            run(
                `INSERT INTO clients (id, name, rif, phone, email, is_active, created_at, updated_at, synced) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 0)`,
                [cid, demoClients[i].name, demoClients[i].rif, '+584140000000', 'demo@empresa.com', now, now]
            );

            const amounts = [1500, 850, 450, 120, 340];
            const states = ['en mora', 'en mora', 'pendiente', 'pagado', 'pagado'];

            const invId = generateId();
            run(
                `INSERT INTO invoices (id, client_id, valery_note_id, issue_date, due_date, total_amount, balance, status, created_at, updated_at, synced)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                [invId, cid, `NE-DEMO-${i}`, jan2026, feb2026, amounts[i], states[i] === 'pagado' ? 0 : amounts[i], states[i], now, now]
            );

            run(
                `INSERT INTO invoice_products (id, invoice_id, description, quantity, unit_price, synced) VALUES (?, ?, ?, 1, ?, 0)`,
                [generateId(), invId, `Producto Demo ${i}`, amounts[i]]
            );
        }

        persist();
        res.json({ success: true, message: 'Datos Demo inyectados con éxito' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
