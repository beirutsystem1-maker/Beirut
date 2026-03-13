const fs = require('fs');
const path = require('path');
const { init, run, persist, query } = require('./db.js');

async function migrate() {
    try {
        console.log("Iniciando migración...");
        await init();
        
        // Comprobar si la columna ya existe
        const tableInfo = query("PRAGMA table_info(invoices)");
        const hasDeleted = tableInfo.some(col => col.name === 'deleted');
        
        if (!hasDeleted) {
            console.log("Añadiendo columna 'deleted' a la tabla 'invoices'...");
            run("ALTER TABLE invoices ADD COLUMN deleted INTEGER DEFAULT 0");
            persist();
            console.log("Migración completada con éxito.");
        } else {
            console.log("La columna 'deleted' ya existe.");
        }
    } catch (e) {
        console.error("Error en migración:", e);
    }
}

migrate();
