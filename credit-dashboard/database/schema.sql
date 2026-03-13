-- Supabase PostgreSQL Schema for "Beirut" SaaS Credit Dashboard
-- Architecture: Multi-Invoice Master Profile

-- 1. Clients Table: The base entity representing the debtor.
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rif TEXT UNIQUE NOT NULL, -- Strict Identifier: V-1234, J-1234
    name TEXT NOT NULL,       -- Parsed as "Nombre Apellido" or "Empresa C.A."
    address TEXT,             -- Billing physical address
    phone TEXT,               -- Formatted E.164 or custom
    email TEXT,
    is_active BOOLEAN DEFAULT true, -- Soft-delete
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Invoices (Notas de Entrega): Credits linked to a client brought from Valery ERP.
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    valery_note_id TEXT UNIQUE NOT NULL, -- The original Valery Document ID (e.g. NE-4001)
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    total_amount NUMERIC(15, 2) NOT NULL CHECK (total_amount >= 0),
    balance NUMERIC(15, 2) NOT NULL CHECK (balance >= 0 AND balance <= total_amount),
    status TEXT NOT NULL CHECK (status IN ('pendiente', 'en mora', 'pagado')) DEFAULT 'pendiente',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to auto-update 'updated_at' on Invoices
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_invoices_modtime
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 3. Invoice Products (Desglose): The exact items billed inside that invoice.
CREATE TABLE invoice_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(15, 2) NOT NULL CHECK (unit_price >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Transactions (Historia Inmutable): Append-only ledger of all money movements.
-- This ensures we NEVER lose track of history. If a payment is wrong, we issue a 'refund' row, we DONT delete the payment.
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('payment', 'refund', 'adjustment')),
    amount_usd NUMERIC(15, 2) NOT NULL, -- Money moved
    payment_method TEXT DEFAULT NULL,   -- e.g. 'usd', 'zelle', 'bs_parallel'
    exchange_rate NUMERIC(15, 2) DEFAULT NULL, -- Fixed rate at moment of transaction
    metadata JSONB, -- Logs user acting, IP, exact payload, notes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. System Config/Settings
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert Default Config
INSERT INTO config (key, value, description) VALUES
('bs_parallel_surcharge_pct', '30', 'Surcharge percentage for BS Parallel'),
('bs_bdv_discount_pct', '30', 'Discount percentage for BS BDV'),
('exchange_rate', '42.50', 'Current Base Exchange Rate')
ON CONFLICT (key) DO NOTHING;

-- Indexing for high performance global searches
CREATE INDEX idx_clients_rif ON clients (rif);
CREATE INDEX idx_clients_name ON clients (name);
CREATE INDEX idx_invoices_valery_id ON invoices (valery_note_id);
CREATE INDEX idx_transactions_invoice ON transactions (invoice_id);
