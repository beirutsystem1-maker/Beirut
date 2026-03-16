/**
 * migrate_to_supabase.js
 * Lee la base de datos local SQLite y sube TODO a Supabase.
 * Uso: node migrate_to_supabase.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en .env');
    process.exit(1);
}

const DB_PATH = path.join(process.env.APPDATA || __dirname, 'Beirut', 'beirut.db');
if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ No se encontró la base de datos en: ${DB_PATH}`);
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    console.log(`\n🔄 Leyendo base de datos local: ${DB_PATH}`);
    const SQL = await initSqlJs();
    const fileBuffer = fs.readFileSync(DB_PATH);
    const db = new SQL.Database(fileBuffer);

    // ── Leer datos locales ────────────────────────────────────────────────────
    const clients = db.exec(`SELECT id, name, rif, phone, email, notes, show_base_debt, show_surcharge_debt, deleted FROM clients`);
    const invoices = db.exec(`SELECT id, client_id, valery_note_id, issue_date, due_date, total_amount, iva, balance, status, deleted FROM invoices`);
    const products = db.exec(`SELECT id, invoice_id, description, quantity, unit_price, deleted FROM invoice_products`);
    const payments = db.exec(`SELECT id, invoice_id, client_id, amount, method, exchange_rate, surcharge_pct, payment_date FROM payments`);

    function toObjects(result) {
        if (!result || result.length === 0) return [];
        const cols = result[0].columns;
        return result[0].values.map(row => {
            const obj = {};
            cols.forEach((col, i) => { obj[col] = row[i]; });
            return obj;
        });
    }

    const clientRows    = toObjects(clients);
    const invoiceRows   = toObjects(invoices);
    const productRows   = toObjects(products);
    const paymentRows   = toObjects(payments);

    console.log(`📋 Clientes:         ${clientRows.length}`);
    console.log(`📋 Facturas:         ${invoiceRows.length}`);
    console.log(`📋 Productos:        ${productRows.length}`);
    console.log(`📋 Pagos:            ${paymentRows.length}`);
    console.log('');

    // ── Helper: upsert en lotes ───────────────────────────────────────────────
    async function upsertBatch(table, rows, conflict = 'id') {
        if (rows.length === 0) { console.log(`⏭  ${table}: sin datos`); return; }
        const chunkSize = 100;
        let ok = 0, fail = 0;
        for (let i = 0; i < rows.length; i += chunkSize) {
            const chunk = rows.slice(i, i + chunkSize);
            const { error } = await supabase.from(table).upsert(chunk, { onConflict: conflict });
            if (error) {
                console.error(`  ❌ Error en ${table} (lote ${i}-${i+chunkSize}):`, error.message);
                fail += chunk.length;
            } else {
                ok += chunk.length;
            }
        }
        console.log(`  ✅ ${table}: ${ok} subidos, ${fail} fallidos`);
    }

    // ── Subir clientes ────────────────────────────────────────────────────────
    console.log('⬆️  Subiendo clientes...');
    const activeClients = clientRows.filter(c => !c.deleted).map(c => ({
        id: c.id,
        name: c.name,
        rif: c.rif || null,
        phone: c.phone || null,
        email: c.email || null,
        address: c.notes || null, // SQLite 'notes' maps to Supabase 'address'
    }));
    await upsertBatch('clients', activeClients);

    // ── Subir facturas ────────────────────────────────────────────────────────
    console.log('⬆️  Subiendo facturas...');
    const activeInvoices = invoiceRows.filter(i => !i.deleted).map(i => ({
        id: i.id,
        client_id: i.client_id,
        valery_note_id: i.valery_note_id || null,
        issue_date: i.issue_date || null,
        due_date: i.due_date || null,
        total_amount: Number(i.total_amount) || 0,
        balance: Number(i.balance) || 0,
        status: i.status || 'pendiente',
    }));
    await upsertBatch('invoices', activeInvoices);

    // ── Subir productos ───────────────────────────────────────────────────────
    console.log('⬆️  Subiendo productos de facturas...');
    const activeProducts = productRows.filter(p => !p.deleted).map(p => ({
        id: p.id,
        invoice_id: p.invoice_id,
        description: p.description || '',
        quantity: Number(p.quantity) || 1,
        unit_price: Number(p.unit_price) || 0,
    }));
    await upsertBatch('invoice_products', activeProducts);

    // ── Subir pagos ───────────────────────────────────────────────────────────
    console.log('⬆️  Subiendo pagos...');
    const activePayments = paymentRows.map(p => ({
        id: p.id,
        invoice_id: p.invoice_id,
        client_id: p.client_id,
        amount: Number(p.amount) || 0,
        method: p.method || 'App',
        exchange_rate: Number(p.exchange_rate) || 1,
        surcharge_pct: Number(p.surcharge_pct) || 0,
        payment_date: p.payment_date || new Date().toISOString(),
    }));
    await upsertBatch('payments', activePayments);

    console.log('\n🎉 Migración completada. Refresca la app en Vercel.');
    db.close();
}

main().catch(e => {
    console.error('Error fatal:', e.message);
    process.exit(1);
});
