/**
 * sync.js — Bidirectional sync between local SQLite and Supabase
 * Runs in background every 3 seconds.
 * Strategy: offline-first, last-write-wins by updated_at timestamp.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const {
    getMeta, setMeta,
    upsertClient, upsertInvoice, upsertPayment,
    getUnsyncedClients, getUnsyncedInvoices, getUnsyncedPayments,
    getUnsyncedInvoiceProducts, markSynced, markAllProductsSynced,
    getAllClients, getPendingCount, generateId
} = require('./db');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;
let syncState = {
    online: false,
    syncing: false,
    lastSync: null,
    pendingCount: 0,
    error: null
};

function getState() {
    syncState.pendingCount = getPendingCount();
    return { ...syncState };
}

async function checkInternet() {
    try {
        const { error } = await supabase.from('clients').select('id').limit(1);
        return !error;
    } catch {
        return false;
    }
}

// ── PUSH: Local → Supabase ───────────────────────────────────────────────────

async function pushClients() {
    const rows = getUnsyncedClients();
    for (const client of rows) {
        try {
            if (client.deleted) {
                await supabase.from('clients').delete().eq('id', client.id);
            } else {
                const payload = {
                    id: client.id,
                    name: client.name,
                    rif: client.rif,
                    phone: client.phone,
                    email: client.email,
                    is_active: !!client.is_active
                };
                const { error } = await supabase.from('clients').upsert(payload, { onConflict: 'id' });
                if (error) { console.error('[SYNC] Error pushing client:', error.message); continue; }
            }
            markSynced('clients', client.id);
        } catch (e) {
            console.error('[SYNC] Exception pushing client:', e.message);
        }
    }
}

async function pushInvoices() {
    const rows = getUnsyncedInvoices();
    for (const inv of rows) {
        try {
            if (inv.deleted) {
                await supabase.from('invoices').delete().eq('id', inv.id);
            } else {
                const payload = {
                    id: inv.id,
                    client_id: inv.client_id,
                    valery_note_id: inv.valery_note_id,
                    issue_date: inv.issue_date,
                    due_date: inv.due_date,
                    total_amount: inv.total_amount,
                    balance: inv.balance,
                    status: inv.status
                };
                const { error } = await supabase.from('invoices').upsert(payload, { onConflict: 'id' });
                if (error) { console.error('[SYNC] Error pushing invoice:', error.message); continue; }

                // Push its products too
                const products = getUnsyncedInvoiceProducts(inv.id);
                for (const p of products) {
                    if (p.deleted) {
                        const { error: pe } = await supabase.from('invoice_products').delete().eq('id', p.id);
                        if (!pe || pe.code === 'PGRST116') markSynced('invoice_products', p.id);
                    } else {
                        const { error: pe } = await supabase.from('invoice_products').upsert({
                            id: p.id,
                            invoice_id: p.invoice_id,
                            description: p.description,
                            quantity: p.quantity,
                            unit_price: p.unit_price
                        }, { onConflict: 'id' });
                        if (!pe) markSynced('invoice_products', p.id);
                    }
                }
            }
            markSynced('invoices', inv.id);
        } catch (e) {
            console.error('[SYNC] Exception pushing invoice:', e.message);
        }
    }
}

async function pushPayments() {
    const rows = getUnsyncedPayments();
    for (const pay of rows) {
        try {
            const payload = {
                id: pay.id,
                invoice_id: pay.invoice_id,
                client_id: pay.client_id,
                amount: pay.amount,
                method: pay.method,
                exchange_rate: pay.exchange_rate,
                surcharge_pct: pay.surcharge_pct,
                payment_date: pay.payment_date
            };
            const { error } = await supabase.from('payments').upsert(payload, { onConflict: 'id' });
            if (error) { console.error('[SYNC] Error pushing payment:', error.message); continue; }
            markSynced('payments', pay.id);
        } catch (e) {
            console.error('[SYNC] Exception pushing payment:', e.message);
        }
    }
}

// ── PULL: Supabase → Local ───────────────────────────────────────────────────

async function pullClients() {
    const since = getMeta('last_pull_clients') || '1970-01-01T00:00:00Z';
    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('id', { ascending: true });

    if (error) { console.error('[SYNC] Error pulling clients:', error.message); return; }
    if (!data || data.length === 0) return;

    for (const row of data) {
        upsertClient(row, true);
    }

    const latest = data[data.length - 1].updated_at;
    if (latest) setMeta('last_pull_clients', latest);
    console.log(`[SYNC] ← Pulled ${data.length} clients from Supabase`);
}

async function pullInvoices() {
    const since = getMeta('last_pull_invoices') || '1970-01-01T00:00:00Z';
    const { data, error } = await supabase
        .from('invoices')
        .select('*, invoice_products(*)')
        .order('id', { ascending: true });

    if (error) { console.error('[SYNC] Error pulling invoices:', error.message); return; }
    if (!data || data.length === 0) return;

    for (const row of data) {
        upsertInvoice(row, true);
        if (row.invoice_products) {
            const { run, get } = require('./db');
            for (const p of row.invoice_products) {
                // Avoid resurrecting local soft-deletions if they haven't been pushed yet
                const local = get('SELECT synced FROM invoice_products WHERE id = ?', [p.id]);
                if (local && local.synced === 0) continue;

                run(`
                  INSERT OR REPLACE INTO invoice_products (id, invoice_id, description, quantity, unit_price, synced, deleted)
                  VALUES (?, ?, ?, ?, ?, 1, 0)
                `, [p.id || generateId(), p.invoice_id, p.description, p.quantity, p.unit_price]);
            }
        }
    }

    const latest = data[data.length - 1].updated_at;
    if (latest) setMeta('last_pull_invoices', latest);
    console.log(`[SYNC] ← Pulled ${data.length} invoices from Supabase`);
}

async function pullPayments() {
    const since = getMeta('last_pull_payments') || '1970-01-01T00:00:00Z';
    const { data, error } = await supabase
        .from('payments')
        .select('*')
        .gt('payment_date', since)
        .order('payment_date', { ascending: true });

    if (error) { console.error('[SYNC] Error pulling payments:', error.message); return; }
    if (!data || data.length === 0) return;

    for (const row of data) {
        upsertPayment(row, true);
    }

    const latest = data[data.length - 1].payment_date;
    if (latest) setMeta('last_pull_payments', latest);
    console.log(`[SYNC] ← Pulled ${data.length} payments from Supabase`);
}

// ── Main Sync Loop ───────────────────────────────────────────────────────────

async function runSync() {
    if (!supabase || syncState.syncing) return;

    const online = await checkInternet();
    syncState.online = online;

    if (!online) {
        syncState.pendingCount = getPendingCount();
        return;
    }

    syncState.syncing = true;
    syncState.error = null;

    try {
        // Push local changes first
        await pushClients();
        await pushInvoices();
        await pushPayments();

        // Then pull remote changes
        await pullClients();
        await pullInvoices();
        await pullPayments();

        syncState.lastSync = new Date().toISOString();
        syncState.pendingCount = getPendingCount();
        if (syncState.pendingCount === 0) {
            console.log('[SYNC] ✅ Todo sincronizado con Supabase');
        }
    } catch (e) {
        syncState.error = e.message;
        console.error('[SYNC] Error durante sincronización:', e.message);
    } finally {
        syncState.syncing = false;
    }
}

function startSync(intervalMs = 3000) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.warn('[SYNC] ⚠️  Sin credenciales de Supabase — modo completamente local');
        syncState.online = false;
        return;
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('[SYNC] Motor de sincronización iniciado (cada 3s)');

    // Run immediately, then on interval
    runSync();
    setInterval(runSync, intervalMs);
}

module.exports = { startSync, getState, runSync };
