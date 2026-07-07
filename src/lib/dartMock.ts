import { db } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp, collection, query, where, getDocs, orderBy, increment } from "firebase/firestore";

export interface TransactionRecord {
  id: string;
  senderId: string;
  receiverId: string;
  amount: number;
  type: "test" | "live";
  status: "pending" | "synced" | "failed";
  createdAt: number;
}

export const dartMock = {
  registerToken: async (userId: string) => {
    // 1. Create User Document
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      await setDoc(userRef, {
        name: "Test User",
        email: `test_${userId.substring(0, 5)}@example.com`,
        mode: "test",
        createdAt: serverTimestamp()
      });
    }

    // 2. Create Wallet Document
    const walletRef = doc(db, "wallets", userId);
    const walletDoc = await getDoc(walletRef);
    if (!walletDoc.exists()) {
      await setDoc(walletRef, {
        balance_test: 1000,
        balance_live: 0,
        balance_dart: 0,
        createdAt: serverTimestamp()
      });
    }
  },

  getBalance: async (userId: string): Promise<{ test: number, live: number, dart: number }> => {
    const walletRef = doc(db, "wallets", userId);
    const walletDoc = await getDoc(walletRef);
    if (walletDoc.exists()) {
      const data = walletDoc.data();
      return {
        test: data.balance_test || 0,
        live: data.balance_live || 0,
        dart: data.balance_dart || 0
      };
    }
    return { test: 0, live: 0, dart: 0 };
  },

  sendTransaction: async (tx: Omit<TransactionRecord, 'status' | 'createdAt' | 'id'>): Promise<TransactionRecord> => {
    if (tx.senderId === tx.receiverId) {
      throw new Error("Cannot send to yourself");
    }

    return await runTransaction(db, async (transaction) => {
      const senderWalletRef = doc(db, "wallets", tx.senderId);
      const receiverWalletRef = doc(db, "wallets", tx.receiverId);
      const receiverUserRef = doc(db, "users", tx.receiverId);
      
      const senderDoc = await transaction.get(senderWalletRef);
      if (!senderDoc.exists()) {
        throw new Error("Sender wallet not found");
      }

      // Check receiver exists
      const receiverUserDoc = await transaction.get(receiverUserRef);
      if (!receiverUserDoc.exists()) {
         throw new Error("Receiver does not exist");
      }
      
      const balanceField = tx.type === "test" ? "balance_test" : "balance_live";
      const senderBalance = senderDoc.data()[balanceField] || 0;
      
      if (senderBalance < tx.amount) {
        throw new Error("Insufficient balance");
      }
      
      // Deduct from sender and add DART reward
      transaction.update(senderWalletRef, {
        [balanceField]: increment(-tx.amount),
        balance_dart: increment(1) // +1 DART reward per transaction
      });
      
      // Add to receiver (create wallet if it somehow doesn't exist)
      const receiverWalletDoc = await transaction.get(receiverWalletRef);
      if (!receiverWalletDoc.exists()) {
        transaction.set(receiverWalletRef, {
          balance_test: tx.type === "test" ? tx.amount : 1000,
          balance_live: tx.type === "live" ? tx.amount : 0,
          balance_dart: 0,
          createdAt: serverTimestamp()
        });
      } else {
        transaction.update(receiverWalletRef, {
          [balanceField]: increment(tx.amount)
        });
      }
      
      // Record transaction
      const txRef = doc(collection(db, "transactions"));
      const newTx: TransactionRecord = {
        ...tx,
        id: txRef.id,
        status: "synced",
        createdAt: Date.now()
      };
      
      transaction.set(txRef, {
        ...tx,
        status: "synced",
        createdAt: serverTimestamp()
      });
      
      return newTx;
    });
  },

  getTransactions: async (userId: string): Promise<TransactionRecord[]> => {
    const sentQuery = query(collection(db, "transactions"), where("senderId", "==", userId));
    const recvQuery = query(collection(db, "transactions"), where("receiverId", "==", userId));
    
    const [sentSnap, recvSnap] = await Promise.all([getDocs(sentQuery), getDocs(recvQuery)]);
    
    const sentTxs = sentSnap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis() || Date.now() } as TransactionRecord));
    const recvTxs = recvSnap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis() || Date.now() } as TransactionRecord));
    
    return [...sentTxs, ...recvTxs].sort((a, b) => b.createdAt - a.createdAt);
  }
};
