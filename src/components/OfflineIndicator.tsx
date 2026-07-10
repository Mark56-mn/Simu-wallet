import { useWallet } from "../lib/WalletContext";
import { WifiOff, RefreshCcw, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";

export function OfflineIndicator() {
  const { isOnline, isSyncing, pendingQueue } = useWallet();
  const [showSuccess, setShowSuccess] = useState(false);
  const [prevPendingCount, setPrevPendingCount] = useState(0);

  const pendingCount = pendingQueue.length;

  useEffect(() => {
    // Show success animation briefly after sync completes
    if (prevPendingCount > 0 && pendingCount === 0 && isOnline && !isSyncing) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
    setPrevPendingCount(pendingCount);
  }, [pendingCount, isOnline, isSyncing, prevPendingCount]);

  return (
    <AnimatePresence>
      {(!isOnline || pendingCount > 0 || showSuccess) && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-50 flex justify-center p-4 pointer-events-none"
        >
          <div className="bg-zinc-900 border border-zinc-800 shadow-xl rounded-full px-4 py-2 flex items-center gap-3 backdrop-blur-md">
            {!isOnline && (
              <>
                <WifiOff className="text-amber-500 w-4 h-4" />
                <span className="text-amber-500 text-sm font-medium">Offline</span>
              </>
            )}
            
            {isOnline && isSyncing && pendingCount > 0 && (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <RefreshCcw className="text-indigo-400 w-4 h-4" />
                </motion.div>
                <span className="text-indigo-400 text-sm font-medium">
                  Syncing {pendingCount} transaction{pendingCount !== 1 ? 's' : ''}...
                </span>
              </>
            )}

            {isOnline && !isSyncing && pendingCount > 0 && (
              <>
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-amber-500 text-sm font-medium">
                  {pendingCount} pending
                </span>
              </>
            )}

            {showSuccess && (
              <>
                <CheckCircle2 className="text-emerald-500 w-4 h-4" />
                <span className="text-emerald-500 text-sm font-medium">Synced</span>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
