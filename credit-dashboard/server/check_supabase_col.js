const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function addDeletedColumn() {
    // Intentaremos usar la función RPC u otro método para ejecutar DDL si es posible,
    // o al menos hacer una prueba.
    
    // Lamentablemente, por API estándar Supabase no permite ejecutar 
    // declaraciones 'ALTER TABLE' directamente desde el cliente TS/JS a menos que haya una function RPC.
    
    // Comprobaremos si funciona haciendo un select
    const { data, error } = await supabase.from('invoices').select('deleted').limit(1);
    
    if (error && error.message.includes('column invoices.deleted does not exist')) {
        console.log('Confirma: La columna "deleted" NO EXISTE en Supabase.');
        console.log('Para crearla remotamente sin interfaz gráfica desde el cliente, necesitaríamos una migración externa.');
    } else if (data) {
        console.log('La columna "deleted" ya existe en Supabase.');
    } else {
        console.log('Otro error:', error);
    }
}

addDeletedColumn();
