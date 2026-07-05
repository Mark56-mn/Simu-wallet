import { db } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp, collection, query, where, getDocs, orderBy } from "firebase/firestore";

export interface TransactionRecord {
  id: string;
  from: string;
  to: string;
  amount: number;
  tokenId: string;
  status: "pending" | "synced" | "failed";
  createdAt: number;
}

export const dartMock = {
  registerToken: async (userId: string, tokenId: string = "GOLD_001") => {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      await setDoc(userRef, {
        balances: {
          [tokenId]: 1000 // Testnet initial balance
        },
        createdAt: serverTimestamp()
      });
    } else {
      const data = userDoc.data();
      if (!data.balances || data.balances[tokenId] === undefined) {
        await updateDoc(userRef, {
          [`balances.${tokenId}`]: 1000
        });
      }
    }
  },

  getBalance: async (userId: string, tokenId: string = "GOLD_001"): Promise<number> => {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      return userDoc.data().balances?.[tokenId] || 0;
    }
    return 0;
  },

  sendTransaction: async (tx: Omit<TransactionRecord, 'status' | 'createdAt' | 'id'>): Promise<TransactionRecord> => {
    return await runTransaction(db, async (transaction) => {
      const fromRef = doc(db, "users", tx.from);
      const toRef = doc(db, "users", tx.to);
      
      const fromDoc = await transaction.get(fromRef);
      if (!fromDoc.exists()) {
        throw new Error("Sender not found");
      }
      
      const fromBalance = fromDoc.data().balances?.[tx.tokenId] || 0;
      if (fromBalance < tx.amount) {
        throw new Error("Insufficient balance");
      }
      
      transaction.update(fromRef, {
        [`balances.${tx.tokenId}`]: fromBalance - tx.amount
      });
      
      const toDoc = await transaction.get(toRef);
      if (!toDoc.exists()) {
        transaction.set(toRef, {
          balances: {
            [tx.tokenId]: tx.amount
          },
          createdAt: serverTimestamp()
        });
      } else {
        const toBalance = toDoc.data().balances?.[tx.tokenId] || 0;
        transaction.update(toRef, {
          [`balances.${tx.tokenId}`]: toBalance + tx.amount
        });
      }
      
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
    const sentQuery = query(collection(db, "transactions"), where("from", "==", userId));
    const recvQuery = query(collection(db, "transactions"), where("to", "==", userId));
    
    const [sentSnap, recvSnap] = await Promise.all([getDocs(sentQuery), getDocs(recvQuery)]);
    
    const sentTxs = sentSnap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis() || Date.now() } as TransactionRecord));
    const recvTxs = recvSnap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis() || Date.now() } as TransactionRecord));
    
    return [...sentTxs, ...recvTxs].sort((a, b) => b.createdAt - a.createdAt);
  }
};
