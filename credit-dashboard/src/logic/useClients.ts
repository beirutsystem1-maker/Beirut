import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const SERVER_URL = 'http://localhost:3001/api';

export interface Product {
    description: string;
    quantity: number;
    unitPrice: number;
}

export interface Invoice {
    id: string; // valery_note_id
    issueDate: string;
    dueDate: string;
    totalAmount: number;
    balance: number;
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
            const res = await fetch(`${SERVER_URL}/clients`);
            if (!res.ok) throw new Error('Error fetching clients');
            const { data } = await res.json();

            const clients: Client[] = (data || []).map((row: any) => ({
                id: row.id,
                name: row.name,
                rif: row.rif || '',
                phone: row.phone || '',
                email: row.email || '',
                address: row.notes || '',
                showBaseDebt: row.show_base_debt === undefined ? true : Boolean(row.show_base_debt),
                showSurchargeDebt: row.show_surcharge_debt === undefined ? true : Boolean(row.show_surcharge_debt),
                invoices: (row.invoices || []).map((inv: any) => ({
                    id: inv.valery_note_id || inv.id,
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

            const res = await fetch(`${SERVER_URL}/clients`);
            if (!res.ok) throw new Error('Search failed');
            const { data } = await res.json();

            const lower = searchTerm.toLowerCase();
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
                id: inv.valery_note_id || inv.id,
                issueDate: inv.issue_date,
                dueDate: inv.due_date,
                totalAmount: Number(inv.total_amount),
                balance: Number(inv.balance),
                status: inv.status as 'pagado' | 'pendiente' | 'en mora',
                products: (inv.products || []).map((p: any) => ({
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
                    id: inv.valery_note_id || inv.id,
                    issueDate: inv.issue_date,
                    dueDate: inv.due_date,
                    totalAmount: Number(inv.total_amount),
                    balance: Number(inv.balance),
                    status: inv.status as 'pagado' | 'pendiente' | 'en mora',
                    products: (inv.products || []).map((p: any) => ({
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
            const res = await fetch(`${SERVER_URL}/clients`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newClient.name,
                    rif: newClient.rif,
                    phone: newClient.phone,
                    email: newClient.email,
                    notes: newClient.address, // Mapping address to notes logic
                })
            });
            if (!res.ok) throw new Error('Error saving client');
            return await res.json();
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
            if (!res.ok) throw new Error('Error updating client');
            return await res.json();
        },
        onSuccess: (_, variables) => {
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
            const status = new Date(dueDate) < new Date() ? 'en mora' : 'pendiente';

            const formattedProducts = (products && products.length > 0)
                ? products.map(p => ({
                    description: p.nombre || p.description || 'Producto sin nombre',
                    quantity: p.cantidad || p.quantity || 1,
                    unit_price: p.precio || p.unitPrice || 0
                }))
                : [{ description: 'Deuda Asignada', quantity: 1, unit_price: totalAmount - iva }];

            const res = await fetch(`${SERVER_URL}/invoices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: clientId,
                    valery_note_id: docNumber,
                    issue_date: issueDate,
                    due_date: dueDate,
                    total_amount: totalAmount,
                    iva: iva,
                    balance: totalAmount,
                    status,
                    products: formattedProducts
                })
            });
            if (!res.ok) throw new Error('Error assigning invoice');
            return await res.json();
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
        }) => {
            const res = await fetch(`${SERVER_URL}/invoices/${payload.invoiceId}/payments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: payload.amount,
                    method: 'App Dashboard',
                    exchange_rate: 1,
                    surcharge_pct: 0
                })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Error registering payment');
            }
            return await res.json();
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
            const res = await fetch(`${SERVER_URL}/invoices/${invoiceId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ due_date: dueDate })
            });
            if (!res.ok) throw new Error('Error al actualizar fecha de vencimiento');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
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
            products: { description: string; quantity: number; unit_price: number }[];
            apply_iva?: boolean;
        }) => {
            const res = await fetch(`${SERVER_URL}/invoices/${invoiceId}/products`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products, apply_iva }),
            });
            if (!res.ok) throw new Error('Error al actualizar productos de la factura');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
        },
    });
}

// ─── useDeleteInvoice ─────────────────────────────────────────────
export function useDeleteInvoice() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ invoiceId }: { invoiceId: string; clientId: string }) => {
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

