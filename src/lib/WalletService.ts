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
        testnetBalance: 1000,
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
      return mode === "testnet" ? (data.testnetBalance || 0) : (data.liveBalance || 0);
    }
    return 0;
  }

  /**
   * Gets all balances for a user.
   */
  static async getAllBalances(userId: string): Promise<{ testnet: number, live: number, dart: number }> {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      return {
        testnet: data.testnetBalance || 0,
        live: data.liveBalance || 0,
        dart: data.dartBalance || 0
      };
    }
    return { testnet: 0, live: 0, dart: 0 };
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
      
      const balanceField = mode === "testnet" ? "testnetBalance" : "liveBalance";
      const senderBalance = senderDoc.data()[balanceField] || 0;
      
      if (senderBalance < amount) {
        throw new Error("Insufficient balance");
      }
      
      // Deduct from sender and add DART reward (1 DART per transaction)
      transaction.update(senderRef, {
        [balanceField]: increment(-amount),
        dartBalance: increment(1)
      });
      
      // Add to receiver
      transaction.update(receiverRef, {
        [balanceField]: increment(amount)
      });
      
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
        createdAt: Date.now()
      };
      
      transaction.set(txRef, {
        senderId,
        receiverId,
        amount,
        type: "send",
        mode,
        status: "completed",
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
