import { useWallet } from "../lib/WalletContext";
import { ArrowUpRight, ArrowDownLeft, QrCode, Clock, Bell, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { cn } from "../lib/utils";

export default function Home() {
  const { balance, address, transactions, loading, isOnline } = useWallet();

  if (loading) {
    return <div className="p-6 text-zinc-400 flex justify-center items-center h-full">Loading wallet...</div>;
  }

  return (
    <div className="flex flex-col flex-1 p-6 space-y-6">
      <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] uppercase font-bold tracking-widest px-3 py-1.5 rounded-full flex items-center justify-center space-x-2">
        <AlertTriangle size={12} />
        <span>Testnet — No Real Money</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center font-bold text-lg">
            S
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-medium text-zinc-400">Main Account</h1>
              {!isOnline && <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">Offline</span>}
            </div>
            <p className="text-xs text-zinc-500 truncate w-32">{address}</p>
          </div>
        </div>
        <button className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-400 relative">
          <Bell size={20} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full" />
        </button>
      </div>

      <div className="flex flex-col items-center justify-center py-6">
        <h2 className="text-zinc-400 text-sm mb-2">Total Balance</h2>
        <div className="flex items-baseline space-x-2">
          <span className="text-5xl font-semibold tracking-tighter">
            {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xl text-zinc-500 font-medium">GOLD</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Link to="/send" className="flex flex-col items-center justify-center space-y-2 group">
          <div className="w-14 h-14 bg-zinc-900 rounded-2xl flex items-center justify-center text-indigo-400 group-hover:bg-zinc-800 transition-colors">
            <ArrowUpRight size={24} />
          </div>
          <span className="text-xs font-medium text-zinc-400">Send</span>
        </Link>
        <Link to="/receive" className="flex flex-col items-center justify-center space-y-2 group">
          <div className="w-14 h-14 bg-zinc-900 rounded-2xl flex items-center justify-center text-indigo-400 group-hover:bg-zinc-800 transition-colors">
            <ArrowDownLeft size={24} />
          </div>
          <span className="text-xs font-medium text-zinc-400">Receive</span>
        </Link>
        <Link to="/scan" className="flex flex-col items-center justify-center space-y-2 group">
          <div className="w-14 h-14 bg-zinc-900 rounded-2xl flex items-center justify-center text-indigo-400 group-hover:bg-zinc-800 transition-colors">
            <QrCode size={24} />
          </div>
          <span className="text-xs font-medium text-zinc-400">Scan</span>
        </Link>
      </div>

      <div className="flex-1 pt-6 border-t border-zinc-900">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-zinc-100">Recent Transactions</h3>
          <Link to="/history" className="text-xs text-indigo-400 font-medium">View All</Link>
        </div>
        
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
            <Clock size={32} className="mb-3 opacity-20" />
            <p className="text-sm">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {transactions.slice(0, 3).map((tx) => {
              const isSend = tx.from === address;
              return (
                <div key={tx.id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      isSend ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"
                    )}>
                      {isSend ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-100 capitalize">{isSend ? 'Sent' : 'Received'}</p>
                      <p className="text-xs text-zinc-500 truncate w-24">
                        {isSend ? tx.to : tx.from}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-zinc-100">
                      {isSend ? '-' : '+'}{tx.amount.toLocaleString()} GOLD
                    </p>
                    <p className="text-xs text-zinc-500">
                      {tx.status === 'pending' ? 'Pending (Offline)' : format(tx.createdAt, 'MMM d, HH:mm')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
