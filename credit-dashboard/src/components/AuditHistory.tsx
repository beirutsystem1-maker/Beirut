import { ArrowDownRight, ArrowUpRight, Clock, ShieldCheck } from 'lucide-react';

const MOCK_TRANSACTIONS = [
    {
        id: 'tx-1',
        date: '2026-03-06 10:30 AM',
        type: 'payment',
        amount: 150.00,
        description: 'Abono en Efectivo USD',
        user: 'Admin'
    },
    {
        id: 'tx-2',
        date: '2026-03-05 14:15 PM',
        type: 'fee',
        amount: 45.00,
        description: 'Recargo por pago en BS Paralelo (+30%)',
        user: 'Sistema'
    },
    {
        id: 'tx-3',
        date: '2026-03-01 09:00 AM',
        type: 'refund',
        amount: 25.00,
        description: 'Devolución de mercancía defectuosa',
        user: 'Ventas'
    },
    {
        id: 'tx-4',
        date: '2026-02-28 16:45 PM',
        type: 'extension',
        amount: 500.00,
        description: 'Ampliación de crédito original',
        user: 'Admin'
    }
];

function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function AuditHistory() {
    const getIcon = (type: string) => {
        switch (type) {
            case 'payment': return <ArrowDownRight className="h-4 w-4 text-emerald-500" />;
            case 'refund': return <ArrowDownRight className="h-4 w-4 text-blue-500" />;
            case 'fee': return <ArrowUpRight className="h-4 w-4 text-destructive" />;
            case 'extension': return <ArrowUpRight className="h-4 w-4 text-orange-500" />;
            default: return <Clock className="h-4 w-4" />;
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'payment': return 'Pago Recibido';
            case 'refund': return 'Devolución';
            case 'fee': return 'Recargo / Mora';
            case 'extension': return 'Ampliación';
            default: return 'Transacción';
        }
    };

    return (
        <div className="w-full max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h2 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
                        <ShieldCheck className="h-6 w-6 text-primary" />
                        Historial de Auditoría
                    </h2>
                    <p className="text-sm text-muted-foreground">Registro inmutable de movimientos del crédito.</p>
                </div>
            </div>

            <div className="rounded-xl border shadow-sm bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                            <tr>
                                <th className="px-6 py-4 font-medium">Fecha / Hora</th>
                                <th className="px-6 py-4 font-medium">Tipo</th>
                                <th className="px-6 py-4 font-medium">Descripción</th>
                                <th className="px-6 py-4 font-medium">Usuario</th>
                                <th className="px-6 py-4 font-medium text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {MOCK_TRANSACTIONS.map((tx) => (
                                <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                                        {tx.date}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2 font-medium">
                                            <div className="p-1 rounded-full bg-background border shadow-sm">
                                                {getIcon(tx.type)}
                                            </div>
                                            {getTypeLabel(tx.type)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {tx.description}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                                        {tx.user}
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-right font-bold ${tx.type === 'payment' || tx.type === 'refund' ? 'text-emerald-500' : 'text-destructive'
                                        }`}>
                                        {tx.type === 'payment' || tx.type === 'refund' ? '-' : '+'}{formatCurrency(tx.amount)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
