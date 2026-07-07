import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { db } from "./firebase";
import { collection, query, onSnapshot, where } from "firebase/firestore";
import { dartMock, TransactionRecord } from "./dartMock";

interface WalletContextType {
  user: { uid: string } | null;
  balance: number; // Current mode's balance
  balances: { test: number; live: number; dart: number };
  mode: "test" | "live";
  setMode: (mode: "test" | "live") => void;
  address: string;
  transactions: TransactionRecord[];
  loading: boolean;
  isOnline: boolean;
  logout: () => Promise<void>;
  sendToken: (amount: number, address: string) => Promise<void>;
}

const WalletContext = createContext<WalletContextType | null>(null);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within a WalletProvider");
  return context;
};

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ uid: string } | null>(null);
  const [balances, setBalances] = useState({ test: 0, live: 0, dart: 0 });
  const [mode, setMode] = useState<"test" | "live">("test");
  const [address, setAddress] = useState("");
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Offline queue state
  const [pendingQueue, setPendingQueue] = useState<TransactionRecord[]>([]);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Load pending queue from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("simu_wallet_queue");
    if (saved) {
      try {
        setPendingQueue(JSON.parse(saved));
      } catch (e: any) {
        console.error("Failed to parse queue", e instanceof Error ? e.message : String(e));
      }
    }
  }, []);

  // Sync queue when online
  useEffect(() => {
    if (isOnline && pendingQueue.length > 0 && user) {
      const syncQueue = async () => {
        const remaining = [...pendingQueue];
        for (let i = remaining.length - 1; i >= 0; i--) {
          const tx = remaining[i];
          try {
            await dartMock.sendTransaction({
              senderId: tx.senderId,
              receiverId: tx.receiverId,
              amount: tx.amount,
              type: tx.type,
              mode: tx.mode
            });
            remaining.splice(i, 1);
          } catch (e: any) {
            console.error("Failed to sync tx", tx.id, e instanceof Error ? e.message : String(e));
          }
        }
        setPendingQueue(remaining);
        localStorage.setItem("simu_wallet_queue", JSON.stringify(remaining));
      };
      syncQueue();
    }
  }, [isOnline, pendingQueue, user]);

  useEffect(() => {
    // Generate or get existing random local user id
    let localUid = localStorage.getItem("simu_wallet_local_uid");
    if (!localUid) {
      localUid = "user_" + Math.random().toString(36).substring(2, 10);
      localStorage.setItem("simu_wallet_local_uid", localUid);
    }
    
    const u = { uid: localUid };
    setUser(u);
    setAddress(u.uid);

    let unsubWallet = () => {};
    let unsubSent = () => {};
    let unsubRecv = () => {};

    const initData = async () => {
      try {
        // Ensure user is registered
        await dartMock.registerToken(u.uid);

        // Listen for balance updates
        const walletRef = collection(db, "wallets");
        const q = query(walletRef, where("__name__", "==", u.uid));
        unsubWallet = onSnapshot(q, (snapshot) => {
          if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            setBalances({
              test: data.balance_test || 0,
              live: data.balance_live || 0,
              dart: data.balance_dart || 0
            });
          }
        }, (error) => {
          console.error("Wallet snapshot error:", error instanceof Error ? error.message : String(error));
        });

        // Listen for transactions (sent and received)
        const sentQuery = query(collection(db, "transactions"), where("senderId", "==", u.uid));
        const recvQuery = query(collection(db, "transactions"), where("receiverId", "==", u.uid));
        
        let sentTxs: TransactionRecord[] = [];
        let recvTxs: TransactionRecord[] = [];
        
        const updateTxs = () => {
          const combined = [...sentTxs, ...recvTxs]
            .sort((a, b) => b.createdAt - a.createdAt);
          setTransactions(combined);
          setLoading(false);
        };

        unsubSent = onSnapshot(sentQuery, (snap) => {
          sentTxs = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis() || Date.now() } as TransactionRecord));
          updateTxs();
        }, (error) => {
          console.error("Sent txs snapshot error:", error instanceof Error ? error.message : String(error));
        });
        
        unsubRecv = onSnapshot(recvQuery, (snap) => {
          recvTxs = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis() || Date.now() } as TransactionRecord));
          updateTxs();
        }, (error) => {
          console.error("Recv txs snapshot error:", error instanceof Error ? error.message : String(error));
        });
      } catch (err: any) {
        console.error("Failed to init data:", err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    };

    initData();

    return () => {
      unsubWallet();
      unsubSent();
      unsubRecv();
    };
  }, []);

  const sendToken = async (amount: number, recipientAddress: string) => {
    if (!user) throw new Error("Not authenticated");
    
    // Calculate effective balance considering pending txs for current mode
    const modePendingTxs = pendingQueue.filter(tx => tx.mode === mode);
    const pendingAmount = modePendingTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const currentBalance = balances[mode];

    if (currentBalance - pendingAmount < amount) {
      throw new Error("Insufficient balance");
    }

    if (isOnline) {
      await dartMock.sendTransaction({
        senderId: user.uid,
        receiverId: recipientAddress,
        amount,
        type: "send",
        mode: mode
      });
    } else {
      // Add to offline queue
      const newTx: TransactionRecord = {
        id: "local_" + Date.now().toString(),
        senderId: user.uid,
        receiverId: recipientAddress,
        amount,
        type: "send",
        mode: mode,
        status: "pending",
        createdAt: Date.now()
      };
      const newQueue = [...pendingQueue, newTx];
      setPendingQueue(newQueue);
      localStorage.setItem("simu_wallet_queue", JSON.stringify(newQueue));
      
      // Optimistically update transactions UI
      setTransactions(prev => [newTx, ...prev]);
      
      // Note: We don't optimistically update balance here as the snapshot listener 
      // is only for synced state. For a complete optimistic UI, we could override 
      // the displayed balance in the provider or components.
    }
  };

  const logout = async () => {
    // Generate a new id to simulate logout/login
    const newUid = "user_" + Math.random().toString(36).substring(2, 10);
    localStorage.setItem("simu_wallet_local_uid", newUid);
    window.location.reload();
  };

  // Combine synced txs with pending txs for display
  const displayTransactions = [...pendingQueue, ...transactions.filter(t => !pendingQueue.find(p => p.id === t.id))]
    .filter(t => t.mode === mode)
    .sort((a, b) => b.createdAt - a.createdAt);
  
  // Optimistic balance calculation
  const modePendingTxs = pendingQueue.filter(tx => tx.mode === mode);
  const pendingAmount = modePendingTxs.reduce((sum, tx) => sum + tx.amount, 0);
  const displayBalance = balances[mode] - pendingAmount;

  return (
    <WalletContext.Provider value={{ 
      user, 
      balance: displayBalance, 
      balances,
      mode,
      setMode,
      address, 
      transactions: displayTransactions, 
      loading, 
      isOnline,
      logout,
      sendToken 
    }}>
      {children}
    </WalletContext.Provider>
  );
}
