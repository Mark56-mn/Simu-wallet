import { useWallet } from "../lib/WalletContext";
import { ArrowUpRight, ArrowDownLeft, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "../lib/utils";

export default function History() {
  const { transactions, loading, address } = useWallet();

  if (loading) return <div className="p-6 text-zinc-400">Loading history...</div>;

  return (
    <div className="flex flex-col flex-1 p-6">
      <h1 className="text-xl font-semibold mb-8">Transaction History</h1>

      {transactions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-600">
          <Clock size={48} className="mb-4 opacity-20" />
          <p className="text-sm">No transactions found</p>
        </div>
      ) : (
        <div className="space-y-6">
          {transactions.map((tx) => {
            const isSend = tx.senderId === address;
            return (
              <div key={tx.id} className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center",
                    isSend ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"
                  )}>
                    {isSend ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                  </div>
                  <div>
                    <p className="text-base font-medium text-zinc-100 capitalize">{isSend ? 'Sent' : 'Received'}</p>
                    <p className="text-xs text-zinc-500 font-mono truncate w-32">
                      {isSend ? tx.receiverId : tx.senderId}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-base font-medium text-zinc-100">
                    {isSend ? '-' : '+'}{tx.amount.toLocaleString()} GOLD
                  </p>
                  <p className="text-xs text-zinc-500">
                    {tx.status === 'pending' ? 'Pending (Offline)' : format(tx.createdAt, 'MMM d, yyyy HH:mm')}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
