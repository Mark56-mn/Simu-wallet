import { db } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp, collection, query, where, getDocs, increment } from "firebase/firestore";

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
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      await setDoc(userRef, {
        email: email || `user_${userId.substring(0, 5)}@example.com`,
        testnet: {
          dailyAllocation: 10000,
          earnedBalance: 0,
          lastResetAt: serverTimestamp()
        },
        liveBalance: 0,
        dartBalance: 0,
        createdAt: serverTimestamp()
      });
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
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      dartBalance: increment(amount)
    });
  }

  /**
   * Sends money between two users using atomic transactions.
   */
  static async sendMoney(
    senderId: string, 
    receiverId: string, 
    amount: number, 
    mode: "testnet" | "live"
  ): Promise<TransactionRecord> {
    if (senderId === receiverId) {
      throw new Error("Cannot send to yourself");
    }

    if (amount <= 0) {
        throw new Error("Amount must be greater than zero");
    }

    return await runTransaction(db, async (transaction) => {
      const senderRef = doc(db, "users", senderId);
      const receiverRef = doc(db, "users", receiverId);
      
      const senderDoc = await transaction.get(senderRef);
      if (!senderDoc.exists()) {
        throw new Error("Sender not found");
      }

      const receiverDoc = await transaction.get(receiverRef);
      if (!receiverDoc.exists()) {
         throw new Error("Receiver does not exist");
      }
      
      const senderData = senderDoc.data();
      let senderBalance = 0;
      
      if (mode === "testnet") {
        const testnet = senderData.testnet || { dailyAllocation: 0, earnedBalance: 0 };
        senderBalance = (testnet.dailyAllocation || 0) + (testnet.earnedBalance || 0);
      } else {
        senderBalance = senderData.liveBalance || 0;
      }
      
      if (senderBalance < amount) {
        throw new Error("Insufficient balance");
      }
      
      let deductedDaily = 0;
      let deductedEarned = 0;
      
      if (mode === "testnet") {
        const testnet = senderData.testnet || { dailyAllocation: 0, earnedBalance: 0 };
        let daily = testnet.dailyAllocation || 0;
        let earned = testnet.earnedBalance || 0;
        let remaining = amount;
        
        if (daily >= remaining) {
          daily -= remaining;
          deductedDaily = remaining;
        } else {
          deductedDaily = daily;
          remaining -= daily;
          daily = 0;
          earned -= remaining;
          deductedEarned = remaining;
        }
        
        transaction.update(senderRef, {
          "testnet.dailyAllocation": daily,
          "testnet.earnedBalance": earned,
          dartBalance: increment(1)
        });
        
        transaction.update(receiverRef, {
          "testnet.earnedBalance": increment(amount)
        });
      } else {
        transaction.update(senderRef, {
          liveBalance: increment(-amount),
          dartBalance: increment(1)
        });
        
        transaction.update(receiverRef, {
          liveBalance: increment(amount)
        });
      }
      
      // Record transaction
      const txRef = doc(collection(db, "transactions"));
      const newTx: TransactionRecord = {
        id: txRef.id,
        senderId,
        receiverId,
        amount,
        type: "send",
        mode,
        status: "completed",
        deductedDaily,
        deductedEarned,
        createdAt: Date.now()
      };
      
      transaction.set(txRef, {
        senderId,
        receiverId,
        amount,
        type: "send",
        mode,
        status: "completed",
        deductedDaily,
        deductedEarned,
        createdAt: serverTimestamp()
      });
      
      return newTx;
    });
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
