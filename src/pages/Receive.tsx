import { useWallet } from "../lib/WalletContext";
import QRCode from "react-qr-code";
import { Copy, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

export default function Receive() {
  const { address, mode } = useWallet();
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col flex-1 p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold">Receive Token</h1>
        <Link to="/" className="text-zinc-500 hover:text-zinc-300">Close</Link>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center -mt-12">
        <p className="text-zinc-400 text-sm mb-8 text-center max-w-[240px]">
          Scan this QR code or copy the ID below to receive {mode === "test" ? "GOLD" : "NGN"} tokens.
        </p>

        <div className="bg-white p-4 rounded-3xl shadow-xl shadow-indigo-500/10 mb-8">
          <QRCode
            value={address}
            size={220}
            bgColor="#ffffff"
            fgColor="#000000"
            level="Q"
          />
        </div>

        <div className="w-full bg-zinc-900 rounded-2xl p-4 flex items-center justify-between">
          <div className="overflow-hidden mr-4">
            <p className="text-xs text-zinc-500 mb-1">Your User ID</p>
            <p className="text-sm font-mono text-zinc-300 truncate">{address}</p>
          </div>
          <button
            onClick={copyToClipboard}
            className="w-10 h-10 shrink-0 bg-indigo-500/10 text-indigo-400 rounded-xl flex items-center justify-center transition-colors hover:bg-indigo-500/20 active:scale-95"
          >
            {copied ? <CheckCircle2 size={20} className="text-green-400" /> : <Copy size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
}
