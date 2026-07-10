import { createContext, useContext, useEffect, useState } from "react";
import { db, auth } from "./firebase";
import { collection, query, onSnapshot, where } from "firebase/firestore";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { WalletService, TransactionRecord } from "./WalletService";

interface WalletContextType {
  user: { uid: string } | null;
  balance: number; // Current mode's balance
  balances: { testnet: number; testnetBreakdown: { daily: number; earned: number }; live: number; dart: number };
  mode: "testnet" | "live";
  setMode: (mode: "testnet" | "live") => void;
  address: string;
  transactions: TransactionRecord[];
  loading: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  pendingQueue: TransactionRecord[];
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
  const [balances, setBalances] = useState({ testnet: 0, testnetBreakdown: { daily: 0, earned: 0 }, live: 0, dart: 0 });
  const [mode, setMode] = useState<"testnet" | "live">("testnet");
  const [address, setAddress] = useState("");
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Offline queue state
  const [pendingQueue, setPendingQueue] = useState<TransactionRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

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
    if (isOnline && pendingQueue.length > 0 && user && !isSyncing) {
      const syncQueue = async () => {
        setIsSyncing(true);
        const remaining = [...pendingQueue];
        for (let i = remaining.length - 1; i >= 0; i--) {
          const tx = remaining[i];
          try {
            await WalletService.sendMoney(
              tx.senderId,
              tx.receiverId,
              tx.amount,
              tx.mode
            );
            remaining.splice(i, 1);
            // Optional: update UI on each successful sync
            setPendingQueue([...remaining]);
            localStorage.setItem("simu_wallet_queue", JSON.stringify(remaining));
          } catch (e: any) {
            console.error("Failed to sync tx", tx.id, e instanceof Error ? e.message : String(e));
          }
        }
        setPendingQueue(remaining);
        localStorage.setItem("simu_wallet_queue", JSON.stringify(remaining));
        setIsSyncing(false);
      };
      syncQueue();
    }
  }, [isOnline, pendingQueue.length, user]);

  useEffect(() => {
    let unsubWallet = () => {};
    let unsubSent = () => {};
    let unsubRecv = () => {};

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const u = { uid: firebaseUser.uid };
        setUser(u);
        setAddress(u.uid);

        try {
          await WalletService.initializeUser(u.uid);

          const userRef = collection(db, "users");
          const q = query(userRef, where("__name__", "==", u.uid));
        unsubWallet = onSnapshot(q, (snapshot) => {
          if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            let testnetBalance = 0;
            let testnetDaily = 0;
            let testnetEarned = 0;
            if (data.testnet) {
              testnetDaily = data.testnet.dailyAllocation || 0;
              testnetEarned = data.testnet.earnedBalance || 0;
              testnetBalance = testnetDaily + testnetEarned;
            } else {
              testnetBalance = data.testnetBalance || 0;
              testnetDaily = testnetBalance;
            }
            setBalances({
              testnet: testnetBalance,
              testnetBreakdown: { daily: testnetDaily, earned: testnetEarned },
              live: data.liveBalance || 0,
              dart: data.dartBalance || 0
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
      } else {
        // Sign in anonymously if not logged in
        signInAnonymously(auth).catch(err => {
          console.error("Failed to sign in anonymously:", err);
          setLoading(false);
        });
      }
    });

    return () => {
      unsubWallet();
      unsubSent();
      unsubRecv();
      unsubAuth();
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
      await WalletService.sendMoney(
        user.uid,
        recipientAddress,
        amount,
        mode
      );
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
    try {
      const { signOut } = await import("firebase/auth");
      await signOut(auth);
      window.location.reload();
    } catch (e) {
      console.error(e);
    }
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
      isSyncing,
      pendingQueue,
      logout,
      sendToken 
    }}>
      {children}
    </WalletContext.Provider>
  );
}
