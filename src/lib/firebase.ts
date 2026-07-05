import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, getDocs, where, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  projectId: "high-ego-fgtt6",
  appId: "1:200593292218:web:dc0bb26d2b44a61cd37b83",
  apiKey: "AIzaSyCh6ucxJ0nPkH-QfDGwWRBk711MBIapbl8",
  authDomain: "high-ego-fgtt6.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-buildthis-bc043890-da18-4197-acd4-64d9ede5ce6b",
  storageBucket: "high-ego-fgtt6.firebasestorage.app",
  messagingSenderId: "200593292218",
  measurementId: ""
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const initializeWallet = async () => {
  // Mock initialization
};
