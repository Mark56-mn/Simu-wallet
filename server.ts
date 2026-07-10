import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";

const app = express();
app.use(express.json());

const PORT = 3000;

// Lazy initialization of Firebase Admin
let firebaseAdminApp: admin.app.App | null = null;
function getFirebaseAdmin() {
  if (!firebaseAdminApp) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY environment variable is required for secure transactions.");
    }
    
    let credentials;
    try {
      credentials = JSON.parse(serviceAccountKey);
    } catch (e) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY must be a valid JSON string.");
    }

    firebaseAdminApp = admin.initializeApp({
      credential: admin.credential.cert(credentials)
    });
  }
  return firebaseAdminApp;
}

// Security Middleware to verify Firebase Auth Token
const verifyToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized. Missing Bearer token." });
    return;
  }
  const idToken = authHeader.split("Bearer ")[1];
  try {
    const adminApp = getFirebaseAdmin();
    const decodedToken = await adminApp.auth().verifyIdToken(idToken);
    (req as any).user = decodedToken;
    next();
  } catch (error: any) {
    console.error("Token verification failed:", error);
    res.status(401).json({ error: error.message || "Unauthorized" });
  }
};

// --- SANDBOX MIDDLEWARE ---
const rateLimitMap = new Map<string, { count: number, resetTime: number }>();

const sandboxSecurity = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const uid = (req as any).user?.uid;
  if (!uid) {
    res.status(401).json({ error: "Sandbox rejected: Unauthorized access" });
    return;
  }

  // 1. Rate Limiting (Max 30 requests per minute per UID)
  const now = Date.now();
  const userLimit = rateLimitMap.get(uid);
  if (userLimit && now < userLimit.resetTime) {
    if (userLimit.count >= 30) {
      res.status(429).json({ error: "Sandbox rejected: Too many requests. Please try again later." });
      return;
    }
    userLimit.count++;
  } else {
    rateLimitMap.set(uid, { count: 1, resetTime: now + 60000 });
  }

  // 2. Payload Validation & Sanitization
  if (req.body) {
    const strBody = JSON.stringify(req.body);
    if (strBody.includes('__proto__') || strBody.includes('constructor')) {
       res.status(400).json({ error: "Sandbox rejected: Malformed or malicious payload" });
       return;
    }

    // Amount Validation (if present)
    if (req.body.amount !== undefined) {
       const amount = req.body.amount;
       if (typeof amount !== 'number' || amount <= 0 || !Number.isFinite(amount) || amount > 1000000000) {
           res.status(400).json({ error: "Sandbox rejected: Invalid transaction amount" });
           return;
       }
    }
    
    // Mode Validation (if present)
    if (req.body.mode !== undefined && !['testnet', 'live'].includes(req.body.mode)) {
       res.status(400).json({ error: "Sandbox rejected: Invalid network mode" });
       return;
    }
  }

  next();
};

// Apply security layers to all wallet API routes
app.use("/api/wallet", verifyToken, sandboxSecurity);

// API Routes
app.post("/api/wallet/init", async (req, res) => {
  try {
    const adminApp = getFirebaseAdmin();
    const db = adminApp.firestore();
    const uid = (req as any).user.uid;
    const email = req.body.email || "";

    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      await userRef.set({
        email: email || `user_${uid.substring(0, 5)}@example.com`,
        testnet: {
          dailyAllocation: 10000,
          earnedBalance: 0,
          lastResetAt: admin.firestore.FieldValue.serverTimestamp()
        },
        liveBalance: 0,
        dartBalance: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      const data = userDoc.data()!;
      if (!data.testnet) {
        await userRef.update({
          testnet: {
            dailyAllocation: 10000,
            earnedBalance: data.testnetBalance || 0,
            lastResetAt: admin.firestore.FieldValue.serverTimestamp()
          }
        });
      } else {
        const lastReset = data.testnet.lastResetAt ? data.testnet.lastResetAt.toDate() : new Date(0);
        const now = new Date();
        const msDiff = now.getTime() - lastReset.getTime();
        const daysDiff = msDiff / (1000 * 3600 * 24);
        if (daysDiff >= 1) {
          await userRef.update({
            "testnet.dailyAllocation": 10000,
            "testnet.lastResetAt": admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/wallet/reward", async (req, res) => {
  try {
    const adminApp = getFirebaseAdmin();
    const db = adminApp.firestore();
    const uid = (req as any).user.uid;
    const { amount } = req.body;

    if (!amount || amount <= 0 || amount > 100) {
        res.status(400).json({ error: "Sandbox rejected: Invalid reward amount" });
        return;
    }

    const userRef = db.collection("users").doc(uid);
    await userRef.update({
      dartBalance: admin.firestore.FieldValue.increment(amount)
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/wallet/send", async (req, res) => {
  try {
    const adminApp = getFirebaseAdmin();
    const db = adminApp.firestore();
    const senderId = (req as any).user.uid;
    const { receiverId, amount, mode } = req.body;

    if (!receiverId || !amount || amount <= 0 || !mode) {
       res.status(400).json({ error: "Invalid transaction parameters" });
       return;
    }

    if (senderId === receiverId) {
       res.status(400).json({ error: "Cannot send to yourself" });
       return;
    }

    const newTx = await db.runTransaction(async (transaction) => {
      const senderRef = db.collection("users").doc(senderId);
      const receiverRef = db.collection("users").doc(receiverId);

      const senderDoc = await transaction.get(senderRef);
      if (!senderDoc.exists) {
        throw new Error("Sender not found");
      }

      const receiverDoc = await transaction.get(receiverRef);
      if (!receiverDoc.exists) {
        throw new Error("Receiver does not exist");
      }

      const senderData = senderDoc.data()!;
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
          dartBalance: admin.firestore.FieldValue.increment(1)
        });

        transaction.update(receiverRef, {
          "testnet.earnedBalance": admin.firestore.FieldValue.increment(amount)
        });
      } else {
        transaction.update(senderRef, {
          liveBalance: admin.firestore.FieldValue.increment(-amount),
          dartBalance: admin.firestore.FieldValue.increment(1)
        });

        transaction.update(receiverRef, {
          liveBalance: admin.firestore.FieldValue.increment(amount)
        });
      }

      const txRef = db.collection("transactions").doc();
      const txData = {
        id: txRef.id,
        senderId,
        receiverId,
        amount,
        type: "send",
        mode,
        status: "completed",
        deductedDaily,
        deductedEarned,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      transaction.set(txRef, txData);
      return txData;
    });

    res.json(newTx);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
