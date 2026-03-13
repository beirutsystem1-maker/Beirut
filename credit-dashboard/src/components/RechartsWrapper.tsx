// RechartsWrapper.tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';

function formatCurrency(v: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-card border border-border px-4 py-3 rounded-xl shadow-xl shrink-0">
                <p className="font-bold text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
                <p className="text-foreground font-mono font-black tracking-tight text-lg">
                    {formatCurrency(payload[0].value)}
                </p>
            </div>
        );
    }
    return null;
};

export default function RechartsWrapper({ data }: { data: any[] }) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border/40" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} className="text-muted-foreground font-semibold" dy={10} />
                <YAxis tickFormatter={(val) => `$${val}`} tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} className="text-muted-foreground font-semibold" dx={-10} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={60}>
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
