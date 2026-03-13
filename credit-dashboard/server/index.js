/**
 * index.js — Beirut Local Server (Express + SQLite/sql.js + Supabase sync)
 * Run: node index.js
 */

const fs = require('fs');
const path = require('path');

const logDir = process.env.APPDATA ? path.join(process.env.APPDATA, 'BeirutGestor') : __dirname;
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
const logPath = path.join(logDir, 'server-error.log');

process.on('uncaughtException', (err) => {
    fs.appendFileSync(logPath, `[UNCAUGHT] ${new Date().toISOString()} - ${err.message}\n${err.stack}\n`);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    fs.appendFileSync(logPath, `[UNHANDLED] ${new Date().toISOString()} - ${reason}\n`);
});

const isPackaged = __dirname.includes('resources') || process.execPath.includes('BeirutGestor');
let envPath;
if (isPackaged) {
    if (process.resourcesPath) {
        envPath = path.join(process.resourcesPath, 'server', '.env');
    } else {
        envPath = path.join(__dirname, '.env');
    }
} else {
    envPath = path.resolve(__dirname, '.env');
}

if (!fs.existsSync(envPath)) {
    console.error(`[CRITICO] Archivo .env no encontrado en la ruta: ${envPath}`);
    // Intentar fallback a la raíz de __dirname por si acaso
    envPath = path.join(__dirname, '.env');
}

require('dotenv').config({ path: envPath });

const express = require('express');
const cors = require('cors');
const { init: initDb } = require('./db');
const { startSync, getState } = require('./sync');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:4173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
        'https://dashboard-creditos-beirut.vercel.app',
        /\.vercel\.app$/
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ── Request logger ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
    next();
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/clients', require('./routes/clients'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/pdf', require('./routes/pdf'));

// GET /api/status — sync state for the frontend badge
app.get('/api/status', (_req, res) => {
    const state = getState();
    res.json({
        online: state.online,
        syncing: state.syncing,
        lastSync: state.lastSync,
        pendingCount: state.pendingCount,
        error: state.error
    });
});

// GET /api/health — simple health check
app.get('/api/health', (_req, res) => {
    const { get, query } = require('./db');
    const invoiceCount = get('SELECT COUNT(*) as n FROM invoices')?.n;
    const deletedCount = get('SELECT COUNT(*) as n FROM invoices WHERE deleted = 1')?.n;
    res.json({ 
        ok: true, 
        timestamp: new Date().toISOString(), 
        envPath_resolved: envPath, 
        hasGemini: !!process.env.GEMINI_API_KEY,
        db_path: process.env.DATA_DIR || process.env.APPDATA || __dirname,
        invoice_count: invoiceCount,
        deleted_count: deletedCount
    });
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
    console.log('⏳ Inicializando base de datos local...');
    await initDb();

    app.listen(PORT, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════╗');
        console.log('║     🏙  BEIRUT — Servidor Local           ║');
        console.log(`║     Puerto: ${PORT}                          ║`);
        console.log('╚══════════════════════════════════════════╝');
        console.log('');
        startSync(30000);
    });
}

bootstrap().catch(e => {
    console.error('❌ Error al iniciar el servidor:', e.message);
    process.exit(1);
});
