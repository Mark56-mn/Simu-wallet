import { useWallet } from "../lib/WalletContext";
import { ArrowUpRight, ArrowDownLeft, QrCode, Clock, Bell, AlertTriangle, Coins } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import { ActivityChart } from "../components/ActivityChart";

export default function Home() {
  const { balance, balances, mode, setMode, address, transactions, loading, isOnline } = useWallet();

  if (loading) {
    return <div className="p-6 text-zinc-400 flex justify-center items-center h-full">Loading wallet...</div>;
  }

  return (
    <div className="flex flex-col flex-1 p-6 space-y-6 overflow-y-auto">
      {mode === "testnet" ? (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] uppercase font-bold tracking-widest px-3 py-1.5 rounded-full flex items-center justify-between space-x-2 cursor-pointer shrink-0" onClick={() => setMode("live")}>
          <div className="flex items-center space-x-2">
            <AlertTriangle size={12} />
            <span>Testnet — No Real Money</span>
          </div>
          <span className="opacity-60 hover:opacity-100 transition-opacity">Switch to Live &rarr;</span>
        </div>
      ) : (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] uppercase font-bold tracking-widest px-3 py-1.5 rounded-full flex items-center justify-between space-x-2 cursor-pointer shrink-0" onClick={() => setMode("testnet")}>
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Live Mode</span>
          </div>
          <span className="opacity-60 hover:opacity-100 transition-opacity">&larr; Switch to Test</span>
        </div>
      )}

      <div className="flex items-center justify-between shrink-0">
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
        <div className="flex items-center space-x-2 bg-indigo-500/10 px-3 py-1.5 rounded-full">
          <Coins size={14} className="text-indigo-400" />
          <span className="text-xs font-semibold text-indigo-400">{balances.dart} DART</span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-6">
        <h2 className="text-zinc-400 text-sm mb-2">{mode === "testnet" ? "Test Balance" : "Live Balance"}</h2>
        <div className="flex items-baseline space-x-2">
          <span className="text-5xl font-semibold tracking-tighter">
            {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xl text-zinc-500 font-medium">
            {mode === "testnet" ? "GOLD" : "NGN"}
          </span>
        </div>
        
        {mode === "testnet" && (
          <div className="flex items-center space-x-4 mt-4 text-xs font-medium border border-zinc-800/50 bg-zinc-900/30 rounded-xl p-3 w-full max-w-sm">
            <div className="flex flex-col items-center flex-1 border-r border-zinc-800/50">
              <span className="text-zinc-500 mb-1 flex items-center gap-1">Daily (Resets 24h)</span>
              <span className="text-amber-400">{balances.testnetBreakdown?.daily?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}</span>
            </div>
            <div className="flex flex-col items-center flex-1">
              <span className="text-zinc-500 mb-1 flex items-center gap-1">Permanent Earned</span>
              <span className="text-emerald-400">{balances.testnetBreakdown?.earned?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}</span>
            </div>
          </div>
        )}
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

      <div className="flex-1 pt-6 border-t border-zinc-900 shrink-0">
        <ActivityChart transactions={transactions} address={address} />
        
        <div className="flex items-center justify-between mb-4 mt-6">
          <h3 className="text-sm font-medium text-zinc-100">Recent Transactions</h3>
          <Link to="/history" className="text-xs text-indigo-400 font-medium">View All</Link>
        </div>
        
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
            <Clock size={32} className="mb-3 opacity-20" />
            <p className="text-sm">No transactions yet in {mode} mode</p>
          </div>
        ) : (
          <div className="space-y-4">
            {transactions.slice(0, 3).map((tx) => {
              const isSend = tx.senderId === address;
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
                        {isSend ? tx.receiverId : tx.senderId}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-zinc-100">
                      {isSend ? '-' : '+'}{tx.amount.toLocaleString()} {mode === "testnet" ? "GOLD" : "NGN"}
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