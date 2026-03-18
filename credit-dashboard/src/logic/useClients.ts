import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import { isOverdue } from '../utils/dates';

// --- Supabase Config ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Always use Supabase directly when credentials are available (local or production)
const USE_SUPABASE_DIRECT = !!supabase;


export const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// --- Helper for Direct Supabase Queries ---
async function fetchFromSupabase() {
    if (!supabase) return [];
    
    // Fetch clients with invoices and products in a single call
    const { data, error } = await supabase
        .from('clients')
        .select(`
            *,
            invoices (
                *,
                invoice_products (*)
            )
        `)
        .order('name');

    if (error) throw error;

    return (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        rif: row.rif || '',
        phone: row.phone || '',
        email: row.email || '',
        address: row.address || '',
        showBaseDebt: row.show_base_debt === undefined ? true : Boolean(row.show_base_debt),
        showSurchargeDebt: row.show_surcharge_debt === undefined ? true : Boolean(row.show_surcharge_debt),
        invoices: (row.invoices || []).map((inv: any) => ({
            id: inv.id, // Supabase UUID
            valeryNoteId: inv.valery_note_id || '', // Business ID (e.g., "0000020046")
            issueDate: inv.issue_date || '',
            dueDate: inv.due_date || '',
            totalAmount: Number(inv.total_amount) || 0,
            balance: Number(inv.balance) || 0,
            iva: Number(inv.iva) || 0,
            status: inv.status,
            products: (inv.invoice_products || []).map((p: any) => ({
                description: p.description,
                quantity: Number(p.quantity),
                unitPrice: Number(p.unit_price)
            }))
        }))
    }));
}

export interface Product {
    description: string;
    quantity: number;
    unitPrice: number;
}

export interface Invoice {
    id: string; // UUID de Supabase
    valeryNoteId: string; // Número de nota de Valery (ej. "0000020046")
    issueDate: string;
    dueDate: string;
    totalAmount: number;
    balance: number;
    original?: number;
    iva?: number;
    status: 'pagado' | 'pendiente' | 'en mora';
    products: Product[];
}

export interface Client {
    id: string;
    name: string;
    rif: string;
    phone: string;
    email: string;
    address?: string;
    showBaseDebt?: boolean;
    showSurchargeDebt?: boolean;
    invoices?: Invoice[];
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
}

const DEFAULT_PAGE_SIZE = 50;

/** Fetch all clients and do pagination locally since local sqlite is very fast */
export function useClients(page = 0, pageSize = DEFAULT_PAGE_SIZE) {
    return useQuery({
        queryKey: ['clients', page, pageSize],
        queryFn: async (): Promise<PaginatedResponse<Client>> => {
            let clients: Client[] = [];
            
            if (USE_SUPABASE_DIRECT) {
                console.log('[SYNC] Mode: Online (Supabase Direct)');
                clients = await fetchFromSupabase();
            } else {
                console.log('[SYNC] Mode: Local (Server Bridge)');
                const res = await fetch(`${SERVER_URL}/clients`);
                if (!res.ok) throw new Error('Error fetching clients');
                const { data } = await res.json();

                clients = (data || []).map((row: any) => ({
                    id: row.id,
                    name: row.name,
                    rif: row.rif || '',
                    phone: row.phone || '',
                    email: row.email || '',
                    address: row.notes || '',
                    showBaseDebt: row.show_base_debt === undefined ? true : Boolean(row.show_base_debt),
                    showSurchargeDebt: row.show_surcharge_debt === undefined ? true : Boolean(row.show_surcharge_debt),
                    invoices: (row.invoices || []).map((inv: any) => ({
                        id: inv.id,
                        valeryNoteId: inv.valery_note_id || '',
                        issueDate: inv.issue_date || '',
                        dueDate: inv.due_date || '',
                        totalAmount: Number(inv.total_amount) || 0,
                        balance: Number(inv.balance) || 0,
                        status: inv.status,
                        products: (inv.products || []).map((p: any) => ({
                            description: p.description,
                            quantity: Number(p.quantity),
                            unitPrice: Number(p.unit_price)
                        }))
                    }))
                }));
            }

            const from = page * pageSize;
            const to = from + pageSize;
            const sliced = clients.slice(from, to);

            return {
                data: sliced,
                total: clients.length,
                page,
                pageSize,
                hasMore: to < clients.length,
            };
        },
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,
    });
}

export function useClientSearch(searchTerm: string, enabled = true) {
    return useQuery({
        queryKey: ['clients', 'search', searchTerm],
        queryFn: async () => {
            if (searchTerm.length < 2) return [];

            const lower = searchTerm.toLowerCase();

            if (USE_SUPABASE_DIRECT && supabase) {
                const { data, error } = await supabase
                    .from('clients')
                    .select('id, name, rif')
                    .or(`name.ilike.%${searchTerm}%,rif.ilike.%${searchTerm}%`)
                    .limit(5);
                if (error) throw error;
                return (data || []).map((c: any) => ({ id: c.id, name: c.name, rif: c.rif }));
            }

            const res = await fetch(`${SERVER_URL}/clients`);
            if (!res.ok) throw new Error('Search failed');
            const { data } = await res.json();

            return data
                .filter((c: any) => (c.name || '').toLowerCase().includes(lower) || (c.rif || '').toLowerCase().includes(lower))
                .slice(0, 5)
                .map((c: any) => ({ id: c.id, name: c.name, rif: c.rif }));
        },
        enabled: enabled && searchTerm.length >= 2,
        staleTime: 1000 * 30,
    });
}

export function useClientInvoices(clientId: string | null) {
    return useQuery({
        queryKey: ['invoices', clientId],
        queryFn: async (): Promise<Invoice[]> => {
            if (!clientId) return [];
            const res = await fetch(`${SERVER_URL}/invoices?client_id=${clientId}`);
            if (!res.ok) throw new Error('Error fetching invoices');
            const data = await res.json();

            return data.map((inv: any) => ({
                id: inv.id,
                valeryNoteId: inv.valery_note_id || '',
                issueDate: inv.issue_date,
                dueDate: inv.due_date,
                totalAmount: Number(inv.total_amount),
                balance: Number(inv.balance),
                status: inv.status as 'pagado' | 'pendiente' | 'en mora',
                products: (inv.products || []).map((p: any) => ({
                    id: p.id,
                    description: p.description,
                    quantity: p.quantity,
                    unitPrice: Number(p.unit_price) // match API column name unit_price -> unitPrice
                }))
            }));
        },
        enabled: !!clientId,
        staleTime: 1000 * 60 * 2,
    });
}

export function useClientFullData(clientId: string | null) {
    return useQuery({
        queryKey: ['client', 'full', clientId],
        queryFn: async (): Promise<Client | null> => {
            if (!clientId) return null;

            const res = await fetch(`${SERVER_URL}/clients/${clientId}`);
            if (!res.ok) throw new Error('Error fetching client details');
            const row = await res.json();

            return {
                id: row.id,
                name: row.name,
                rif: row.rif || '',
                phone: row.phone || '',
                email: row.email || '',
                address: row.notes || '',
                showBaseDebt: row.show_base_debt === undefined ? true : Boolean(row.show_base_debt),
                showSurchargeDebt: row.show_surcharge_debt === undefined ? true : Boolean(row.show_surcharge_debt),
                invoices: (row.invoices || []).map((inv: any) => ({
                    id: inv.id,
                    valeryNoteId: inv.valery_note_id || '',
                    issueDate: inv.issue_date,
                    dueDate: inv.due_date,
                    totalAmount: Number(inv.total_amount),
                    balance: Number(inv.balance),
                    status: inv.status as 'pagado' | 'pendiente' | 'en mora',
                    products: (inv.products || []).map((p: any) => ({
                        id: p.id,
                        description: p.description,
                        quantity: p.quantity,
                        unitPrice: Number(p.unit_price)
                    }))
                }))
            };
        },
        enabled: !!clientId,
        staleTime: 1000 * 60 * 2,
    });
}

export function useAddClient() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (newClient: Omit<Client, 'id' | 'invoices'>) => {
            if (USE_SUPABASE_DIRECT && supabase) {
                const { data, error } = await supabase
                    .from('clients')
                    .insert({
                        name: newClient.name,
                        rif: newClient.rif,
                        phone: newClient.phone,
                        email: newClient.email,
                        address: newClient.address,
                    })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            } else {
                const res = await fetch(`${SERVER_URL}/clients`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: newClient.name,
                        rif: newClient.rif,
                        phone: newClient.phone,
                        email: newClient.email,
                        notes: newClient.address,
                    })
                });
                if (!res.ok) throw new Error('Error saving client');
                return await res.json();
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
        },
    });
}

export function useUpdateClient() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (payload: { id: string } & Partial<Omit<Client, 'id' | 'invoices'>>) => {
            if (payload.email) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(payload.email.trim())) {
                    throw new Error('Correo electrónico inválido');
                }
            }
            if (USE_SUPABASE_DIRECT && supabase) {
                console.log('Sending payload to Supabase:', payload);
                const { data, error } = await supabase
                    .from('clients')
                    .update({
                        name: payload.name,
                        rif: payload.rif,
                        phone: payload.phone,
                        email: payload.email,
                        address: payload.address
                    })
                    .eq('id', payload.id)
                    .select(); // Changed from single() to avoid throwing on 0 rows
                
                console.log('Supabase update response:', { data, error });
                if (error) throw new Error(`Supabase Error: ${error.message}`);
                if (!data || data.length === 0) throw new Error(`Client ID ${payload.id} not found in DB`);
                
                return data[0];
            } else {
                const res = await fetch(`${SERVER_URL}/clients/${payload.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: payload.name,
                        rif: payload.rif,
                        phone: payload.phone,
                        email: payload.email,
                        notes: payload.address,
                        show_base_debt: payload.showBaseDebt !== undefined ? (payload.showBaseDebt ? 1 : 0) : undefined,
                        show_surcharge_debt: payload.showSurchargeDebt !== undefined ? (payload.showSurchargeDebt ? 1 : 0) : undefined,
                    })
                });
                if (!res.ok) {
                    const errBody = await res.json().catch(() => ({}));
                    throw new Error(errBody.error || 'Error updating client');
                }
                return await res.json();
            }
        },
        onError: (err) => {
            console.error('Mutation useUpdateClient failed:', err);
            // Optionally, we could show an alert or toast here
        },
        onSuccess: (_data, variables) => {
            console.log('Update successful, invalidating queries...');
            // Optimistic manual update of the cache to instantly show the changes
            queryClient.setQueryData(['clients', 0, 50], (oldData: any) => {
                if (!oldData || !oldData.data) return oldData;
                return {
                    ...oldData,
                    data: oldData.data.map((c: Client) => 
                        c.id === variables.id 
                        ? { ...c, ...variables }
                        : c
                    )
                };
            });
            
            queryClient.setQueryData(['client', 'full', variables.id], (oldData: any) => {
                if (!oldData) return oldData;
                return { ...oldData, ...variables };
            });
            
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            queryClient.invalidateQueries({ queryKey: ['client', 'full', variables.id] });
        },
    });
}

export function useAppendExcelInvoice() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (payload: {
            clientId: string;
            docNumber: string;
            issueDate: string;
            dueDate: string;
            totalAmount: number;
            iva?: number;
            products?: { description?: string; quantity?: number; unit_price?: number; nombre?: string; precio?: number; unitPrice?: number; cantidad?: number }[];
        }) => {
            const { clientId, docNumber, issueDate, dueDate, totalAmount, iva = 0, products } = payload;
            const status = isOverdue(dueDate) ? 'en mora' : 'pendiente';

            const formattedProducts = (products && products.length > 0)
                ? products.map(p => ({
                    description: p.nombre || p.description || 'Producto sin nombre',
                    quantity: p.cantidad || p.quantity || 1,
                    unit_price: p.precio || p.unitPrice || 0
                }))
                : [{ description: 'Deuda Asignada', quantity: 1, unit_price: totalAmount - iva }];

            const fallbackTotal = totalAmount || 0;
            const computedSubtotal = formattedProducts.reduce((sum, p) => sum + (p.quantity * p.unit_price), 0);
            
            // If we have products with prices, use their sum (which already includes IVA). 
            // If it's a degenerate case (0 sum), fallback to totalAmount
            const finalTotal = computedSubtotal > 0 ? computedSubtotal : fallbackTotal;
            const finalBalance = finalTotal;

            if (USE_SUPABASE_DIRECT && supabase) {
                // 1. Create Invoice
                const { data: invData, error: invError } = await supabase
                    .from('invoices')
                    .insert({
                        client_id: clientId,
                        valery_note_id: docNumber,
                        issue_date: issueDate,
                        due_date: dueDate,
                        total_amount: Math.round(finalTotal * 100) / 100,
                        balance: Math.round(finalBalance * 100) / 100,
                        status
                    })
                    .select()
                    .single();
                if (invError) throw invError;

                // 2. Create Products
                const productPayloads = formattedProducts.map(p => ({
                    invoice_id: invData.id,
                    description: p.description,
                    quantity: p.quantity,
                    unit_price: p.unit_price
                }));
                const { error: prodError } = await supabase.from('invoice_products').insert(productPayloads);
                if (prodError) throw prodError;

                return invData;
            } else {
                const res = await fetch(`${SERVER_URL}/invoices`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        client_id: clientId,
                        valery_note_id: docNumber,
                        issue_date: issueDate,
                        due_date: dueDate,
                        total_amount: Math.round(finalTotal * 100) / 100,
                        balance: Math.round(finalBalance * 100) / 100,
                        status,
                        products: formattedProducts
                    })
                });
                if (!res.ok) throw new Error('Error assigning invoice');
                return await res.json();
            }
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            queryClient.invalidateQueries({ queryKey: ['invoices', variables.clientId] });
            queryClient.invalidateQueries({ queryKey: ['client', 'full', variables.clientId] });
        },
    });
}

export function useRegisterPayment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (payload: {
            clientId: string;
            invoiceId: string;
            amount: number;
            method?: string;
            exchangeRate?: number;
            surchargePercent?: number;
        }) => {
            const paymentMethod = payload.method || 'App Dashboard';
            const exchangeRate = payload.exchangeRate ?? 1;
            const surchargePercent = payload.surchargePercent ?? 0;

            if (USE_SUPABASE_DIRECT && supabase) {
                // Resolution step: find the real UUID using valery_note_id if it's not already a UUID
                let resolvedInvoiceId = payload.invoiceId;
                
                // If it looks like a Valery Note ID (contains no hyphens and has leading zeros), resolve it
                if (!resolvedInvoiceId.includes('-')) {
                    const { data: realInvoice } = await supabase
                        .from('invoices')
                        .select('id')
                        .eq('valery_note_id', payload.invoiceId)
                        .single();
                    
                    if (realInvoice) {
                        resolvedInvoiceId = realInvoice.id;
                    }
                }

                const { data: inv, error: fetchError } = await supabase
                    .from('invoices')
                    .select('id, balance, total_amount, due_date')
                    .eq('id', resolvedInvoiceId)
                    .single();
                
                if (fetchError) throw fetchError;
                if (!inv) throw new Error(`Factura ${resolvedInvoiceId} no encontrada`);

                const newBalance = Math.max(0, inv.balance - payload.amount);
                const newStatus = newBalance <= 0 ? 'pagado' : (isOverdue(inv.due_date) ? 'en mora' : 'pendiente');

                const { error: payError } = await supabase
                    .from('payments')
                    .insert({
                        id: crypto.randomUUID(),
                        invoice_id: resolvedInvoiceId,
                        client_id: payload.clientId,
                        amount: payload.amount,
                        method: paymentMethod,
                        exchange_rate: exchangeRate,
                        surcharge_pct: surchargePercent,
                        payment_date: new Date().toISOString()
                    });
                if (payError) throw payError;

                const { error: updError } = await supabase
                    .from('invoices')
                    .update({ balance: newBalance, status: newStatus, updated_at: new Date().toISOString() })
                    .eq('id', resolvedInvoiceId);
                
                if (updError) throw updError;
                return;
            } else {
                // If using the local Bridge server, presumably the server handles valery_note_id mapping
                const res = await fetch(`${SERVER_URL}/invoices/${payload.invoiceId}/payments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        amount: payload.amount,
                        method: paymentMethod,
                        exchange_rate: exchangeRate,
                        surcharge_pct: surchargePercent
                    })
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || 'Error registering payment');
                }
                return await res.json();
            }
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            queryClient.invalidateQueries({ queryKey: ['invoices', variables.clientId] });
            queryClient.invalidateQueries({ queryKey: ['client', 'full', variables.clientId] });
            queryClient.invalidateQueries({ queryKey: ['transactions', variables.clientId] });
        },
    });
}

export function useClientsStats() {
    return useQuery({
        queryKey: ['clients', 'stats'],
        queryFn: async () => {
            if (USE_SUPABASE_DIRECT && supabase) {
                const { data, error } = await supabase
                    .from('clients')
                    .select('id, invoices(id, status, balance, total_amount)');
                if (error) throw error;

                let totalDebt = 0, totalPaid = 0, inMora = 0, pending = 0;
                (data || []).forEach((c: any) => {
                    (c.invoices || []).forEach((inv: any) => {
                        if (inv.status === 'pagado') totalPaid += Number(inv.total_amount);
                        else { totalDebt += Number(inv.balance); }
                        if (inv.status === 'en mora') inMora++;
                        if (inv.status === 'pendiente') pending++;
                    });
                });
                return { totalDebt, totalPaid, inMora, pending, clientCount: (data || []).length };
            }

            const res = await fetch(`${SERVER_URL}/clients/stats`);
            if (!res.ok) throw new Error('Error fetching stats');
            return await res.json();
        },
        staleTime: 1000 * 60 * 5,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction types & hook
// ─────────────────────────────────────────────────────────────────────────────
export interface Transaction {
    id: string;
    invoiceId: string;
    type: 'payment' | 'fee' | 'refund' | 'extension';
    amountUsd: number;
    paymentMethod: string;
    metadata: Record<string, any>;
    status: 'procesado' | 'pendiente' | 'rechazado';
    createdAt: string;
}

export function useClientTransactions(clientId: string | null) {
    return useQuery({
        queryKey: ['transactions', clientId],
        queryFn: async (): Promise<Transaction[]> => {
            if (!clientId) return [];

            if (USE_SUPABASE_DIRECT && supabase) {
                const { data, error } = await supabase
                    .from('payments')
                    .select('id, invoice_id, amount, method, exchange_rate, surcharge_pct, payment_date')
                    .eq('client_id', clientId)
                    .order('payment_date', { ascending: false });
                if (error) throw error;

                return (data || []).map((p: any) => ({
                    id: p.id,
                    invoiceId: p.invoice_id,
                    type: 'payment' as const,
                    amountUsd: Number(p.amount),
                    paymentMethod: p.method || 'App',
                    metadata: { exchange_rate: p.exchange_rate, surcharge_pct: p.surcharge_pct },
                    status: 'procesado' as const,
                    createdAt: p.payment_date,
                }));
            }

            const res = await fetch(`${SERVER_URL}/clients/${clientId}/transactions`);
            if (!res.ok) throw new Error('Error fetching transactions');
            return await res.json();
        },
        enabled: !!clientId,
        staleTime: 1000 * 60 * 2,
    });
}

// ─── useUpdateInvoiceDueDate ─────────────────────────────────────
export function useUpdateInvoiceDueDate() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ clientId: _clientId, invoiceId, dueDate }: { clientId?: string; invoiceId: string; dueDate: string }) => {
            if (USE_SUPABASE_DIRECT && supabase) {
                let resolvedInvoiceId = invoiceId;
                if (!resolvedInvoiceId.includes('-')) {
                    const { data: realInvoice, error: findErr } = await supabase.from('invoices').select('id').eq('valery_note_id', invoiceId).single();
                    if (realInvoice) {
                        resolvedInvoiceId = realInvoice.id;
                    } else {
                        throw new Error(`Resolución UUID fallida para nota ${invoiceId}: ${findErr?.message || 'No encontrada'}`);
                    }
                }
                const { error } = await supabase
                    .from('invoices')
                    .update({ due_date: dueDate, updated_at: new Date().toISOString() })
                    .eq('id', resolvedInvoiceId);
                if (error) throw error;
                return { success: true };
            }

            const res = await fetch(`${SERVER_URL}/invoices/${invoiceId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ due_date: dueDate })
            });
            if (!res.ok) throw new Error('Error al actualizar fecha de vencimiento');
            return res.json();
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            if (variables.clientId) {
                queryClient.invalidateQueries({ queryKey: ['invoices', variables.clientId] });
                queryClient.invalidateQueries({ queryKey: ['client', 'full', variables.clientId] });
            }
        }
    });
}

// ─── useUpdateInvoiceProducts ────────────────────────────────────
export function useUpdateInvoiceProducts() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            invoiceId,
            products,
            apply_iva,
        }: {
            invoiceId: string;
            clientId?: string;
            products: { id?: string; description: string; quantity: number; unit_price: number }[];
            apply_iva?: boolean;
        }) => {
            if (USE_SUPABASE_DIRECT && supabase) {
                let resolvedInvoiceId = invoiceId;
                if (!resolvedInvoiceId.includes('-')) {
                    const { data: realInvoice, error: findErr } = await supabase.from('invoices').select('id').eq('valery_note_id', invoiceId).single();
                    if (realInvoice) {
                        resolvedInvoiceId = realInvoice.id;
                    } else {
                        throw new Error(`Resolución UUID fallida para nota ${invoiceId}: ${findErr?.message || 'No encontrada'}`);
                    }
                }

                const { data: invRow } = await supabase
                    .from('invoices')
                    .select('id, total_amount, balance, due_date')
                    .eq('id', resolvedInvoiceId)
                    .single();

                if (!invRow) throw new Error('Factura no encontrada');

                const resolvedId = invRow.id;
                const previousTotal = Number(invRow.total_amount) || 0;
                const previousBalance = Number(invRow.balance) || 0;

                // Recalculate totals (IVA is already embedded in prices now)
                const total = products.reduce((s, p) => s + p.quantity * p.unit_price, 0);

                // Calculate new balance: apply the same delta to balance as to total_amount
                const delta = total - previousTotal;
                const newBalance = Math.max(0, previousBalance + delta);
                const newStatus = newBalance <= 0 ? 'pagado' : (isOverdue(invRow.due_date) ? 'en mora' : 'pendiente');

                // Delete existing products and re-insert
                const { error: delErr } = await supabase.from('invoice_products').delete().eq('invoice_id', resolvedId);
                if (delErr) throw delErr;

                if (products.length > 0) {
                    const { error: insErr } = await supabase.from('invoice_products').insert(
                        products.map(p => ({ invoice_id: resolvedId, description: p.description, quantity: p.quantity, unit_price: p.unit_price }))
                    );
                    if (insErr) throw insErr;
                }

                // Update invoice totals AND balance
                const { data: updData, error: updErr } = await supabase.from('invoices').update({
                    total_amount: total,
                    balance: newBalance,
                    status: newStatus,
                    updated_at: new Date().toISOString()
                }).eq('id', resolvedId).select('total_amount, balance').single();
                if (updErr) throw updErr;

                return { success: true, total_amount: updData?.total_amount, balance: updData?.balance };
            }

            const res = await fetch(`${SERVER_URL}/invoices/${invoiceId}/products`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products, apply_iva }),
            });
            if (!res.ok) throw new Error('Error al actualizar productos de la factura');
            return res.json();
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            if (variables.clientId) {
                queryClient.invalidateQueries({ queryKey: ['invoices', variables.clientId] });
                queryClient.invalidateQueries({ queryKey: ['client', 'full', variables.clientId] });
            }
        },
    });
}

// ─── useDeleteInvoice ─────────────────────────────────────────────
export function useDeleteInvoice() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ invoiceId }: { invoiceId: string; clientId: string }) => {
            if (USE_SUPABASE_DIRECT && supabase) {
                let resolvedInvoiceId = invoiceId;
                if (!resolvedInvoiceId.includes('-')) {
                    const { data: realInvoice, error: findErr } = await supabase.from('invoices').select('id').eq('valery_note_id', invoiceId).single();
                    if (realInvoice) {
                        resolvedInvoiceId = realInvoice.id;
                    } else {
                        throw new Error(`Resolución UUID fallida para nota ${invoiceId}: ${findErr?.message || 'No encontrada'}`);
                    }
                }

                // 1. Eliminar pagos relacionados (FK: payments.invoice_id)
                const { error: payErr } = await supabase
                    .from('payments')
                    .delete()
                    .eq('invoice_id', resolvedInvoiceId);
                if (payErr) {
                    console.warn('[DeleteInvoice] Error al eliminar pagos:', payErr.message);
                    // No lanzar — si no hay pagos o la tabla es diferente, continúa
                }

                // 2. Eliminar productos de la factura (FK: invoice_products.invoice_id)
                const { error: prodErr } = await supabase
                    .from('invoice_products')
                    .delete()
                    .eq('invoice_id', resolvedInvoiceId);
                if (prodErr) throw new Error(`Error al eliminar productos: ${prodErr.message}`);

                // 3. Eliminar la factura
                const { error } = await supabase
                    .from('invoices')
                    .delete()
                    .eq('id', resolvedInvoiceId);
                if (error) throw new Error(`Error al eliminar factura: ${error.message}`);
                return { success: true };
            }

            const res = await fetch(`${SERVER_URL}/invoices/${invoiceId}`, {
                method: 'DELETE',
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Error al eliminar la factura');
            }
            return res.json();
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            queryClient.invalidateQueries({ queryKey: ['invoices', variables.clientId] });
            queryClient.invalidateQueries({ queryKey: ['client', 'full', variables.clientId] });
            queryClient.invalidateQueries({ queryKey: ['transactions', variables.clientId] });
        },
    });
}

