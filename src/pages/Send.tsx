import { useState, useEffect } from "react";
import { useWallet } from "../lib/WalletContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function Send() {
  const { balance, sendToken } = useWallet();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [recipient, setRecipient] = useState(searchParams.get("to") || "");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSend = async () => {
    setError("");
    const numAmount = parseFloat(amount);
    
    if (!recipient) {
      setError("Please enter a recipient address");
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Please enter a valid amount");
      return;
    }
    if (numAmount > balance) {
      setError("Insufficient balance");
      return;
    }

    setIsSending(true);
    try {
      await sendToken(numAmount, recipient);
      setSuccess(true);
      setTimeout(() => {
        navigate("/");
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Failed to send transaction");
    } finally {
      setIsSending(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col flex-1 p-6 items-center justify-center">
        <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-6">
          <ArrowRight size={32} />
        </div>
        <h2 className="text-2xl font-semibold mb-2">Sent Successfully!</h2>
        <p className="text-zinc-400">Your transaction has been processed.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 p-6">
      <div className="flex items-center mb-8">
        <button onClick={() => navigate(-1)} className="mr-4 text-zinc-400 hover:text-zinc-200">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-semibold">Send Token</h1>
      </div>

      <div className="space-y-6 flex-1">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2">Recipient ID</label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="User ID..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2">Amount</label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-4 pr-16 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors text-2xl font-semibold"
            />
            <button 
              onClick={() => setAmount(balance.toString())}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-indigo-400 px-2 py-1 bg-indigo-500/10 rounded-lg"
            >
              MAX
            </button>
          </div>
          <div className="flex justify-between mt-2 text-xs">
            <span className="text-zinc-500">Available Balance:</span>
            <span className="font-medium text-zinc-300">{balance.toLocaleString()} GOLD</span>
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}
      </div>

      <div className="pt-4 pb-safe">
        <button
          onClick={handleSend}
          disabled={isSending || !amount || !recipient}
          className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:hover:bg-indigo-500 text-white font-medium py-4 rounded-2xl flex items-center justify-center transition-colors"
        >
          {isSending ? "Sending..." : "Send Token"}
        </button>
      </div>
    </div>
  );
}
