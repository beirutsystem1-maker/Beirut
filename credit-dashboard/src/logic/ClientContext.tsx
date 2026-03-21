import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useClients as useClientsQuery, useAddClient, useUpdateClient, useAppendExcelInvoice, useRegisterPayment, type Client, type Invoice } from './useClients';

export type { Client, Invoice };

interface ClientContextType {
    clients: Client[];
    isLoading: boolean;
    addClient: (client: Omit<Client, 'id' | 'invoices'>) => Promise<void>;
    updateClient: (payload: { id: string } & Partial<Omit<Client, 'id' | 'invoices'>>) => Promise<void>;
    appendExcelInvoice: (payload: {
        clientId: string;
        docNumber: string;
        issueDate: string;
        dueDate: string;
        totalAmount: number;
        iva?: number;
        products?: any[];
    }) => Promise<void>;
    registerPaymentOnInvoice: (clientId: string, invoiceId: string, amount: number, method?: string, exchangeRate?: number, surchargePercent?: number) => Promise<void>;
    refetchClients: () => void;
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export function ClientProvider({ children }: { children: ReactNode }) {
    const { data, isLoading, refetch } = useClientsQuery(0, 50);

    const clients = data?.data || [];

    const addClientMutation = useAddClient();
    const updateClientMutation = useUpdateClient();
    const appendInvoiceMutation = useAppendExcelInvoice();
    const registerPaymentMutation = useRegisterPayment();

    const addClient = async (newClientData: Omit<Client, 'id' | 'invoices'>) => {
        await addClientMutation.mutateAsync(newClientData);
    };

    const updateClient = async (payload: { id: string } & Partial<Omit<Client, 'id' | 'invoices'>>) => {
        await updateClientMutation.mutateAsync(payload);
    };

    const appendExcelInvoice = async (payload: {
        clientId: string;
        docNumber: string;
        issueDate: string;
        dueDate: string;
        totalAmount: number;
        iva?: number;
        products?: any[];
    }) => {
        await appendInvoiceMutation.mutateAsync(payload);
    };

    const registerPaymentOnInvoice = async (clientId: string, invoiceId: string, amount: number, method?: string, exchangeRate?: number, surchargePercent?: number) => {
        await registerPaymentMutation.mutateAsync({
            clientId,
            invoiceId,
            amount,
            method,
            exchangeRate,
            surchargePercent
        });
    };

    const refetchClients = () => {
        refetch();
    };

    const value: ClientContextType = {
        clients,
        isLoading,
        addClient,
        updateClient,
        appendExcelInvoice,
        registerPaymentOnInvoice,
        refetchClients
    };

    return (
        <ClientContext.Provider value={value}>
            {children}
        </ClientContext.Provider>
    );
}

export function useClients() {
    const context = useContext(ClientContext);
    if (context === undefined) {
        throw new Error('useClients must be used within a ClientProvider');
    }
    return context;
}

export function calculateClientDebt(client: Client): number {
    // Always use the pure paralela (base) balance — no BCV surcharge applied.
    return (client.invoices || []).reduce((sum: number, inv: Invoice) => sum + inv.balance, 0);
}


export function calculateClientStatus(client: Client): 'pagado' | 'pendiente' | 'en mora' {
    const invoices = client.invoices || [];
    if (invoices.length === 0) return 'pagado';
    if (invoices.some((inv: Invoice) => inv.status === 'en mora')) return 'en mora';
    if (invoices.some((inv: Invoice) => inv.status === 'pendiente')) return 'pendiente';
    return 'pagado';
}
