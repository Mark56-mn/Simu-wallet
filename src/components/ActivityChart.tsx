import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { TransactionRecord } from "../lib/WalletService";

interface ActivityChartProps {
  transactions: TransactionRecord[];
  address: string;
}

export function ActivityChart({ transactions, address }: ActivityChartProps) {
  const data = useMemo(() => {
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = subDays(new Date(), 6 - i);
      return {
        date: startOfDay(d).getTime(),
        label: format(d, "MMM dd"),
        expenditure: 0,
        earned: 0,
      };
    });

    // Only look at testnet transactions for Gold
    const testnetTxs = transactions.filter(tx => tx.mode === "testnet" && tx.status === "completed");

    testnetTxs.forEach((tx) => {
      const txDay = last7Days.find(
        (day) => tx.createdAt >= day.date && tx.createdAt <= endOfDay(new Date(day.date)).getTime()
      );

      if (txDay) {
        if (tx.senderId === address) {
          txDay.expenditure += tx.amount;
        }
        if (tx.receiverId === address) {
          txDay.earned += tx.amount;
        }
      }
    });

    return last7Days;
  }, [transactions, address]);

  return (
    <div className="w-full h-64 mt-6">
      <h3 className="text-sm font-medium text-zinc-100 mb-4">Last 7 Days (Testnet)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis 
            dataKey="label" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#71717a', fontSize: 10 }}
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#71717a', fontSize: 10 }} 
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
            itemStyle={{ color: '#e4e4e7' }}
          />
          <Legend wrapperStyle={{ fontSize: '12px', marginTop: '10px' }} />
          <Line 
            type="monotone" 
            name="Expenditure"
            dataKey="expenditure" 
            stroke="#f87171" 
            strokeWidth={2} 
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line 
            type="monotone" 
            name="Earned"
            dataKey="earned" 
            stroke="#4ade80" 
            strokeWidth={2} 
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
