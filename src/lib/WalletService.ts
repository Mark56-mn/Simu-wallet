import { db, auth } from "./firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

export interface TransactionRecord {
  id: string;
  senderId: string;
  receiverId: string;
  amount: number;
  type: "send" | "receive" | "airtime" | "deposit" | "withdraw";
  mode: "testnet" | "live";
  status: "pending" | "completed" | "failed";
  deductedDaily?: number;
  deductedEarned?: number;
  createdAt: number;
}

export class WalletService {
  /**
   * Initializes a user with default balances if they don't exist.
   */
  static async initializeUser(userId: string, email: string = "") {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const token = await currentUser.getIdToken();
    
    try {
      await fetch("/api/wallet/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ email })
      });
    } catch (e) {
      console.error("Failed to initialize user via secure sandbox", e);
    }
  }

  /**
   * Gets the balance for a specific user and mode.
   */
  static async getBalance(userId: string, mode: "testnet" | "live"): Promise<number> {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      if (mode === "testnet") {
        const testnet = data.testnet || { dailyAllocation: 0, earnedBalance: 0 };
        return (testnet.dailyAllocation || 0) + (testnet.earnedBalance || 0);
      } else {
        return data.liveBalance || 0;
      }
    }
    return 0;
  }

  /**
   * Gets all balances for a user.
   */
  static async getAllBalances(userId: string): Promise<{ testnet: number, testnetBreakdown: { daily: number, earned: number }, live: number, dart: number }> {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      let testnetBalance = 0;
      let testnetDaily = 0;
      let testnetEarned = 0;
      if (data.testnet) {
        testnetDaily = data.testnet.dailyAllocation || 0;
        testnetEarned = data.testnet.earnedBalance || 0;
        testnetBalance = testnetDaily + testnetEarned;
      } else {
        // Fallback for old schema
        testnetBalance = data.testnetBalance || 0;
        testnetDaily = testnetBalance;
      }
      return {
        testnet: testnetBalance,
        testnetBreakdown: {
          daily: testnetDaily,
          earned: testnetEarned
        },
        live: data.liveBalance || 0,
        dart: data.dartBalance || 0
      };
    }
    return { testnet: 0, testnetBreakdown: { daily: 0, earned: 0 }, live: 0, dart: 0 };
  }

  /**
   * Rewards Dart tokens to a user.
   */
  static async rewardDart(userId: string, amount: number): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const token = await currentUser.getIdToken();
    
    try {
      await fetch("/api/wallet/reward", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ amount })
      });
    } catch (e) {
      console.error("Failed to reward dart via secure sandbox", e);
    }
  }

  /**
   * Sends money between two users using a secure backend API.
   */
  static async sendMoney(
    senderId: string, 
    receiverId: string, 
    amount: number, 
    mode: "testnet" | "live"
  ): Promise<TransactionRecord> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("You must be logged in to send money");
    }

    const token = await currentUser.getIdToken();
    
    const response = await fetch("/api/wallet/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        receiverId,
        amount,
        mode
      })
    });

    if (!response.ok) {
      let errorMsg = "Transaction failed";
      try {
        const errData = await response.json();
        if (errData.error) {
          errorMsg = errData.error;
        }
      } catch (e) {
        // Ignore
      }
      throw new Error(errorMsg);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Gets transactions for a specific user and mode.
   */
  static async getTransactions(userId: string, mode: "testnet" | "live"): Promise<TransactionRecord[]> {
    const sentQuery = query(
        collection(db, "transactions"), 
        where("senderId", "==", userId),
        where("mode", "==", mode)
    );
    const recvQuery = query(
        collection(db, "transactions"), 
        where("receiverId", "==", userId),
        where("mode", "==", mode)
    );
    
    const [sentSnap, recvSnap] = await Promise.all([getDocs(sentQuery), getDocs(recvQuery)]);
    
    const sentTxs = sentSnap.docs.map(d => ({ 
         id: d.id, 
         ...d.data(), 
         createdAt: d.data().createdAt?.toMillis() || Date.now() 
     } as TransactionRecord));
    const recvTxs = recvSnap.docs.map(d => ({ 
         id: d.id, 
         ...d.data(), 
         createdAt: d.data().createdAt?.toMillis() || Date.now() 
     } as TransactionRecord));
    
    return [...sentTxs, ...recvTxs].sort((a, b) => b.createdAt - a.createdAt);
  }
}
