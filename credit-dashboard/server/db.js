/**
 * db.js — SQLite local database using sql.js (pure JS, no native deps)
 * Persists data to disk as a binary .db file.
 *
 * Usage: await require('./db').init()  — must call init() before any operations
 */

const path = require('path');
const fs = require('fs');

// ── Storage path ─────────────────────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR
    ? process.env.DATA_DIR
    : (process.env.APPDATA ? path.join(process.env.APPDATA, 'Beirut') : path.join(__dirname, 'data'));
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'beirut.db');
console.log(`📁 Base de datos local: ${DB_PATH}`);

let SQL = null;
let db = null;

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  if (db) return db; // already initialized

  const initSqlJs = require('sql.js');
  
  // En producción (Electron) sql.js necesita saber dónde está su .wasm
  const wasmUrl = require.resolve('sql.js/dist/sql-wasm.wasm');
  
  try {
      SQL = await initSqlJs({
          locateFile: () => wasmUrl
      });
  } catch (err) {
      console.error("[DB] Error fatal cargando sql.js wasm:", err);
      throw err;
  }

  // Load existing DB from disk or create new
  if (fs.existsSync(DB_PATH)) {
    const filebuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(filebuffer);
    console.log('✅ Base de datos local cargada desde disco');
  } else {
    db = new SQL.Database();
    console.log('🆕 Nueva base de datos local creada');
  }

  // Schema
  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rif TEXT,
      phone TEXT,
      email TEXT,
      is_active INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0,
      deleted INTEGER DEFAULT 0,
      show_base_debt INTEGER DEFAULT 1,
      show_surcharge_debt INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      valery_note_id TEXT,
      issue_date TEXT,
      due_date TEXT,
      total_amount REAL DEFAULT 0,
      iva REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      status TEXT DEFAULT 'pendiente',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0,
      deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS invoice_products (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      description TEXT,
      quantity REAL DEFAULT 1,
      unit_price REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0,
      deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT DEFAULT 'efectivo',
      exchange_rate REAL DEFAULT 1,
      surcharge_pct REAL DEFAULT 0,
      payment_date TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Insert default sync meta
  db.run(`INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('last_pull_clients', '1970-01-01T00:00:00Z')`);
  db.run(`INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('last_pull_invoices', '1970-01-01T00:00:00Z')`);
  db.run(`INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('last_pull_payments', '1970-01-01T00:00:00Z')`);

  // Asegurarse de que columnas agregadas posteriormente existan en BDs viejas
  try { db.run('ALTER TABLE invoices ADD COLUMN iva REAL DEFAULT 0'); } catch (e) { /* Ya existe, ignorar */ }
  try { db.run('ALTER TABLE clients ADD COLUMN show_base_debt INTEGER DEFAULT 1'); } catch (e) { /* Ya existe, ignorar */ }
  try { db.run('ALTER TABLE clients ADD COLUMN show_surcharge_debt INTEGER DEFAULT 1'); } catch (e) { /* Ya existe, ignorar */ }
  try { db.run('ALTER TABLE invoice_products ADD COLUMN deleted INTEGER DEFAULT 0'); } catch (e) { /* Ya existe, ignorar */ }
  
  // Limpiar posibles flags residuales para que la UI se refresque (en modo dev útil)
  db.run('UPDATE invoices SET deleted = 1 WHERE deleted IS NULL');

  persist();
  return db;
}

// ── Persist to disk ──────────────────────────────────────────────────────────
function persist() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) {
    console.error('[DB] Error saving to disk:', e.message);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function generateId() {
  return require('crypto').randomUUID();
}

function getNow() {
  return new Date().toISOString();
}

/** Execute a SELECT and return all rows as plain objects */
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/** Execute INSERT/UPDATE/DELETE */
function run(sql, params = []) {
  db.run(sql, params);
}

/** Execute and return first row */
function get(sql, params = []) {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// ── Meta ─────────────────────────────────────────────────────────────────────
function getMeta(key) {
  const row = get('SELECT value FROM sync_meta WHERE key = ?', [key]);
  return row ? row.value : null;
}
function setMeta(key, value) {
  run('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', [key, value]);
  persist();
}

// ── OCR Quota ────────────────────────────────────────────────────────────────
function getOcrQuota() {
  const today = new Date().toISOString().split('T')[0];
  const lastDate = getMeta('ocr_last_date') || '';
  let count = parseInt(getMeta('ocr_usage_count') || '0', 10);
  
  if (lastDate !== today) {
      count = 0;
      setMeta('ocr_last_date', today);
      setMeta('ocr_usage_count', '0');
  }
  return { used: count, limit: 1500, remaining: 1500 - count };
}

function incrementOcrQuota() {
  const q = getOcrQuota();
  setMeta('ocr_usage_count', String(q.used + 1));
  return getOcrQuota();
}

// ── Clients ──────────────────────────────────────────────────────────────────
function getAllClients() {
  const clients = query('SELECT * FROM clients WHERE deleted = 0 ORDER BY name');
  return clients.map(c => {
    const invoices = query('SELECT * FROM invoices WHERE client_id = ? AND deleted = 0 ORDER BY issue_date DESC', [c.id]);
    const invoicesWithProducts = invoices.map(inv => ({
      ...inv,
      products: query('SELECT * FROM invoice_products WHERE invoice_id = ? AND (deleted = 0 OR deleted IS NULL)', [inv.id])
    }));
    return { ...c, is_active: !!c.is_active, invoices: invoicesWithProducts };
  });
}

function getClientById(id) {
  const c = get('SELECT * FROM clients WHERE id = ? AND deleted = 0', [id]);
  if (!c) return null;
  const invoices = query('SELECT * FROM invoices WHERE client_id = ? AND deleted = 0 ORDER BY issue_date DESC', [id]);
  const invoicesWithProducts = invoices.map(inv => {
    const products = query('SELECT * FROM invoice_products WHERE invoice_id = ? AND (deleted = 0 OR deleted IS NULL)', [inv.id]);
    return { ...inv, products };
  });
  return { ...c, is_active: !!c.is_active, invoices: invoicesWithProducts };
}

function insertClient(data) {
  const id = generateId();
  const now = getNow();
  run(
    `INSERT INTO clients (id, name, rif, phone, email, is_active, notes, created_at, updated_at, synced, show_base_debt, show_surcharge_debt)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 0, ?, ?)`,
    [id, data.name, data.rif || null, data.phone || null, data.email || null, data.notes || null, now, now, data.show_base_debt ?? 1, data.show_surcharge_debt ?? 1]
  );
  persist();
  return getClientById(id);
}

function upsertClient(client, fromSupabase = false) {
  const now = getNow();
  run(
    `INSERT OR REPLACE INTO clients (id, name, rif, phone, email, is_active, notes, created_at, updated_at, synced, deleted, show_base_debt, show_surcharge_debt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      client.id, client.name, client.rif || null, client.phone || null,
      client.email || null, client.is_active ? 1 : 0, client.notes || null,
      client.created_at || now, client.updated_at || now,
      fromSupabase ? 1 : 0, client.deleted ? 1 : 0,
      client.show_base_debt ?? 1, client.show_surcharge_debt ?? 1
    ]
  );
  persist();
}

function updateClient(id, data) {
  const now = getNow();
  const existing = getClientById(id);
  if (!existing) return null;
  const updated = { ...existing, ...data, id, updated_at: now };
  upsertClient({ ...updated, synced: 0 }, false);
  return getClientById(id);
}

// ── Invoices ─────────────────────────────────────────────────────────────────
function getInvoicesForClient(clientId) {
  const invoices = query(
    'SELECT i.*, c.name as client_name FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.client_id = ? AND i.deleted = 0 ORDER BY i.issue_date DESC',
    [clientId]
  );
  return invoices.map(inv => ({
    ...inv,
    products: query('SELECT * FROM invoice_products WHERE invoice_id = ? AND (deleted = 0 OR deleted IS NULL)', [inv.id])
  }));
}

function getInvoicesByDateRange(desde, hasta) {
  const rows = query(
    `SELECT i.*, c.name as client_name
     FROM invoices i
     LEFT JOIN clients c ON c.id = i.client_id
     WHERE i.deleted = 0
       AND i.issue_date >= ?
       AND i.issue_date <= ?
     ORDER BY i.issue_date DESC`,
    [desde, hasta]
  );
  return rows.map(row => ({
    ...row,
    products: query('SELECT * FROM invoice_products WHERE invoice_id = ? AND (deleted = 0 OR deleted IS NULL)', [row.id])
  }));
}

function insertInvoiceProduct(data) {
  run(
    `INSERT INTO invoice_products (id, invoice_id, description, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`,
    [generateId(), data.invoice_id, data.description, data.quantity || 1, data.unit_price || 0]
  );
}

function insertInvoice(data, products = []) {
  const id = generateId();
  const now = getNow();
  // Safe insert that works whether 'iva' exists in the table or not
  try {
    run(
      `INSERT INTO invoices (id, client_id, valery_note_id, issue_date, due_date, total_amount, iva, balance, status, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id, data.client_id, data.valery_note_id || null, data.issue_date || null,
        data.due_date || null, data.total_amount || 0, data.iva || 0,
        data.balance ?? data.total_amount ?? 0, data.status || 'pendiente', now, now
      ]
    );
  } catch (err) {
    if (err.message.includes('has no column named iva')) {
      // Fallback if schema hasn't migrated yet
      run(
        `INSERT INTO invoices (id, client_id, valery_note_id, issue_date, due_date, total_amount, balance, status, created_at, updated_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          id, data.client_id, data.valery_note_id || null, data.issue_date || null,
          data.due_date || null, data.total_amount || 0, data.balance ?? data.total_amount ?? 0,
          data.status || 'pendiente', now, now
        ]
      );
    } else {
      throw err;
    }
  }

  products.forEach(p => insertInvoiceProduct({ ...p, invoice_id: id }));
  persist();
  return id;
}

function upsertInvoice(invoice, fromSupabase = false) {
  const now = getNow();
  try {
    run(
      `INSERT OR REPLACE INTO invoices (id, client_id, valery_note_id, issue_date, due_date, total_amount, iva, balance, status, created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoice.id, invoice.client_id, invoice.valery_note_id || null,
        invoice.issue_date || null, invoice.due_date || null,
        invoice.total_amount || 0, invoice.iva || 0, invoice.balance || 0,
        invoice.status || 'pendiente', invoice.created_at || now,
        invoice.updated_at || now, fromSupabase ? 1 : 0, invoice.deleted ? 1 : 0
      ]
    );
  } catch(err) {
     if (err.message.includes('has no column named iva')) {
        run(
          `INSERT OR REPLACE INTO invoices (id, client_id, valery_note_id, issue_date, due_date, total_amount, balance, status, created_at, updated_at, synced, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoice.id, invoice.client_id, invoice.valery_note_id || null,
            invoice.issue_date || null, invoice.due_date || null,
            invoice.total_amount || 0, invoice.balance || 0,
            invoice.status || 'pendiente', invoice.created_at || now,
            invoice.updated_at || now, fromSupabase ? 1 : 0, invoice.deleted ? 1 : 0
          ]
        );
     } else {
        throw err;
     }
  }
  persist();
}

function updateInvoiceBalance(invoiceId, newBalance, newStatus) {
  const now = getNow();
  run('UPDATE invoices SET balance = ?, status = ?, updated_at = ?, synced = 0 WHERE id = ?',
    [newBalance, newStatus, now, invoiceId]);
  persist();
}

// ── Payments ─────────────────────────────────────────────────────────────────
function insertPayment(data) {
  const id = generateId();
  const now = getNow();
  run(
    `INSERT INTO payments (id, invoice_id, client_id, amount, method, exchange_rate, surcharge_pct, payment_date, created_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, data.invoice_id, data.client_id, data.amount,
      data.method || 'efectivo', data.exchange_rate || 1,
      data.surcharge_pct || 0, data.payment_date || now, now]
  );
  persist();
  return id;
}

function upsertPayment(payment, fromSupabase = false) {
  const now = getNow();
  run(
    `INSERT OR REPLACE INTO payments
       (id, invoice_id, client_id, amount, method, exchange_rate, surcharge_pct, payment_date, created_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payment.id, payment.invoice_id, payment.client_id, payment.amount,
      payment.method || 'efectivo', payment.exchange_rate || 1,
      payment.surcharge_pct || 0, payment.payment_date || now,
      payment.created_at || now, fromSupabase ? 1 : 0
    ]
  );
  persist();
}

// ── Sync helpers ─────────────────────────────────────────────────────────────
function getUnsyncedClients() { return query('SELECT * FROM clients WHERE synced = 0'); }
function getUnsyncedInvoices() { return query('SELECT * FROM invoices WHERE synced = 0'); }
function getUnsyncedPayments() { return query('SELECT * FROM payments WHERE synced = 0'); }
function getUnsyncedInvoiceProducts(invoiceId) {
  return query('SELECT * FROM invoice_products WHERE invoice_id = ? AND synced = 0', [invoiceId]);
}
function markSynced(table, id) {
  run(`UPDATE ${table} SET synced = 1 WHERE id = ?`, [id]);
  persist();
}
function getPendingCount() {
  const c = get('SELECT COUNT(*) as n FROM clients WHERE synced = 0')?.n || 0;
  const i = get('SELECT COUNT(*) as n FROM invoices WHERE synced = 0')?.n || 0;
  const p = get('SELECT COUNT(*) as n FROM payments WHERE synced = 0')?.n || 0;
  return Number(c) + Number(i) + Number(p);
}
function getPaymentsByInvoice(invoiceId) {
  return query('SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC', [invoiceId]);
}
function getInvoiceById(id) {
  return get('SELECT * FROM invoices WHERE id = ?', [id]);
}

module.exports = {
  init, persist, query, run, get, generateId, getNow,
  getMeta, setMeta, getOcrQuota, incrementOcrQuota,
  getAllClients, getClientById, insertClient, upsertClient, updateClient,
  getInvoicesForClient, getInvoicesByDateRange, insertInvoice, upsertInvoice, updateInvoiceBalance, getInvoiceById,
  insertPayment, upsertPayment, getPaymentsByInvoice,
  getUnsyncedClients, getUnsyncedInvoices, getUnsyncedPayments,
  getUnsyncedInvoiceProducts, markSynced, getPendingCount
};
