import { Shield, Bell, Key, CircleHelp, LogOut } from "lucide-react";
import { useWallet } from "../lib/WalletContext";

export default function Settings() {
  const { logout } = useWallet();

  const resetPin = () => {
    if (window.confirm("Are you sure you want to reset your PIN? This will lock your wallet until you set a new one.")) {
      localStorage.removeItem("simu_wallet_pin");
      window.location.reload();
    }
  };

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to disconnect your wallet?")) {
      await logout();
    }
  };

  return (
    <div className="flex flex-col flex-1 p-6">
      <h1 className="text-xl font-semibold mb-8">Settings</h1>

      <div className="space-y-6">
        <div>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3 px-1">Security</h2>
          <div className="bg-zinc-900 rounded-2xl overflow-hidden divide-y divide-zinc-800/50">
            <button onClick={resetPin} className="w-full flex items-center justify-between p-4 active:bg-zinc-800 transition-colors">
              <div className="flex items-center space-x-3 text-zinc-300">
                <Key size={20} className="text-zinc-500" />
                <span>Reset PIN Code</span>
              </div>
            </button>
            <button className="w-full flex items-center justify-between p-4 active:bg-zinc-800 transition-colors">
              <div className="flex items-center space-x-3 text-zinc-300">
                <Shield size={20} className="text-zinc-500" />
                <span>Recovery Phrase</span>
              </div>
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3 px-1">Preferences</h2>
          <div className="bg-zinc-900 rounded-2xl overflow-hidden divide-y divide-zinc-800/50">
            <button className="w-full flex items-center justify-between p-4 active:bg-zinc-800 transition-colors">
              <div className="flex items-center space-x-3 text-zinc-300">
                <Bell size={20} className="text-zinc-500" />
                <span>Push Notifications</span>
              </div>
              <div className="w-10 h-6 bg-indigo-500 rounded-full relative">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
              </div>
            </button>
            <button className="w-full flex items-center justify-between p-4 active:bg-zinc-800 transition-colors">
              <div className="flex items-center space-x-3 text-zinc-300">
                <CircleHelp size={20} className="text-zinc-500" />
                <span>Help & Support</span>
              </div>
            </button>
          </div>
        </div>
        
        <div className="pt-4">
          <button onClick={handleLogout} className="w-full flex items-center justify-center space-x-2 p-4 text-red-400 bg-red-500/10 rounded-2xl active:bg-red-500/20 transition-colors">
            <LogOut size={20} />
            <span className="font-medium">Disconnect Wallet</span>
          </button>
        </div>
      </div>
    </div>
  );
}
