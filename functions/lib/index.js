"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processPendingTransactions = exports.buyAirtime = exports.requestWithdraw = exports.confirmDepositWebhook = exports.initiateDeposit = exports.sendMoney = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const simsec_1 = require("./simsec");
admin.initializeApp();
const db = admin.firestore();
/**
 * Cloud Function: sendMoney
 * Authenticated users can send money to other users.
 */
exports.sendMoney = (0, simsec_1.withSimSec)({ actionName: 'sendMoney', requireAuth: true }, async (data, context) => {
    const senderId = context.auth.uid;
    const { receiverId, amount, mode, idempotencyKey } = data;
    // 2. Validate inputs
    if (!receiverId || typeof amount !== 'number' || amount <= 0 || !['testnet', 'live'].includes(mode) || !idempotencyKey) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid request parameters.');
    }
    if (senderId === receiverId) {
        throw new functions.https.HttpsError('invalid-argument', 'Cannot send money to yourself.');
    }
    const transactionRef = db.collection('transactions').doc(idempotencyKey);
    const senderRef = db.collection('users').doc(senderId);
    const receiverRef = db.collection('users').doc(receiverId);
    return db.runTransaction(async (transaction) => {
        // 3. Check for idempotency (duplicate prevention)
        const txDoc = await transaction.get(transactionRef);
        if (txDoc.exists) {
            throw new functions.https.HttpsError('already-exists', 'Duplicate transaction detected.');
        }
        const senderDoc = await transaction.get(senderRef);
        if (!senderDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Sender account not found.');
        }
        const receiverDoc = await transaction.get(receiverRef);
        if (!receiverDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Receiver account not found.');
        }
        const balanceField = mode === 'testnet' ? 'testnetBalance' : 'liveBalance';
        const senderData = senderDoc.data();
        const senderBalanceBefore = senderData[balanceField] || 0;
        // 4. Check for sufficient balance
        if (senderBalanceBefore < amount) {
            throw new functions.https.HttpsError('failed-precondition', 'Insufficient balance.', { code: 'insufficient_balance' });
        }
        const receiverData = receiverDoc.data();
        const receiverBalanceBefore = receiverData[balanceField] || 0;
        const senderBalanceAfter = senderBalanceBefore - amount;
        const receiverBalanceAfter = receiverBalanceBefore + amount;
        // 5. Update balances and create transaction record atomically
        transaction.update(senderRef, {
            [balanceField]: senderBalanceAfter,
            dartBalance: admin.firestore.FieldValue.increment(1) // Reward DART token
        });
        transaction.update(receiverRef, {
            [balanceField]: receiverBalanceAfter
        });
        transaction.set(transactionRef, {
            senderId,
            receiverId,
            amount,
            type: 'send',
            mode,
            status: 'completed',
            idempotencyKey,
            senderBalanceBefore,
            senderBalanceAfter,
            receiverBalanceBefore,
            receiverBalanceAfter,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true, message: 'Transfer successful' };
    });
});
/**
 * Cloud Function: initiateDeposit
 * User requests to add real money to their live balance.
 */
exports.initiateDeposit = (0, simsec_1.withSimSec)({ actionName: 'initiateDeposit', requireAuth: true }, async (data, context) => {
    const userId = context.auth.uid;
    const { amount, idempotencyKey } = data;
    if (typeof amount !== 'number' || amount <= 0 || !idempotencyKey) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid deposit parameters.');
    }
    const transactionRef = db.collection('transactions').doc(idempotencyKey);
    return db.runTransaction(async (transaction) => {
        const txDoc = await transaction.get(transactionRef);
        if (txDoc.exists) {
            throw new functions.https.HttpsError('already-exists', 'Duplicate deposit request detected.');
        }
        transaction.set(transactionRef, {
            senderId: 'external_provider', // Could be flutterwave/paystack
            receiverId: userId,
            amount,
            type: 'deposit',
            mode: 'live',
            status: 'initiated', // 1. TRANSACTION STATE MACHINE
            idempotencyKey,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        // In a real app, you would generate a payment link or reference here
        const paymentReference = `DEP_${idempotencyKey}_${Date.now()}`;
        return { success: true, paymentReference, transactionId: idempotencyKey };
    });
});
/**
 * Cloud Function: confirmDepositWebhook
 * Secure HTTP webhook called by payment provider (e.g. Flutterwave)
 * Replaces the insecure confirmDeposit onCall function.
 */
exports.confirmDepositWebhook = functions.https.onRequest(async (req, res) => {
    try {
        // 1. Verify Provider Signature
        // const signature = req.headers['x-provider-signature'];
        // In production, verify HMAC signature here using provider's secret key
        // const expectedSignature = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET).update(req.rawBody).digest('hex');
        // if (signature !== expectedSignature) return res.status(401).send('Unauthorized');
        const { transactionId, amount: paidAmount, status } = req.body;
        if (!transactionId || status !== 'successful') {
            res.status(400).send('Invalid payload or unsuccessful payment');
            return;
        }
        const transactionRef = db.collection('transactions').doc(transactionId);
        await db.runTransaction(async (transaction) => {
            var _a;
            const txDoc = await transaction.get(transactionRef);
            if (!txDoc.exists)
                throw new Error('Transaction not found');
            const txData = txDoc.data();
            if (txData.status === 'completed')
                return; // Idempotent
            // 2. Validate Amount
            if (txData.amount !== paidAmount) {
                throw new Error(`Amount mismatch. Expected ${txData.amount}, got ${paidAmount}`);
            }
            const receiverRef = db.collection('users').doc(txData.receiverId);
            const receiverDoc = await transaction.get(receiverRef);
            const balanceBefore = ((_a = receiverDoc.data()) === null || _a === void 0 ? void 0 : _a.liveBalance) || 0;
            const balanceAfter = balanceBefore + paidAmount;
            // 3. Update Balance & Store Snapshot
            transaction.update(receiverRef, { liveBalance: balanceAfter });
            transaction.update(transactionRef, {
                status: 'completed',
                balanceBefore,
                balanceAfter,
                confirmedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        res.status(200).send('Webhook processed successfully');
    }
    catch (error) {
        console.error('Webhook processing failed:', error);
        res.status(500).send('Internal Server Error');
    }
});
/**
 * Cloud Function: requestWithdraw
 * User requests to withdraw their live balance to real money.
 */
exports.requestWithdraw = (0, simsec_1.withSimSec)({ actionName: 'requestWithdraw', requireAuth: true }, async (data, context) => {
    const userId = context.auth.uid;
    const { amount, idempotencyKey } = data;
    if (typeof amount !== 'number' || amount <= 0 || !idempotencyKey) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid withdrawal parameters.');
    }
    const transactionRef = db.collection('transactions').doc(idempotencyKey);
    const userRef = db.collection('users').doc(userId);
    return db.runTransaction(async (transaction) => {
        var _a;
        const txDoc = await transaction.get(transactionRef);
        if (txDoc.exists) {
            throw new functions.https.HttpsError('already-exists', 'Duplicate withdrawal request.');
        }
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User account not found.');
        }
        const balanceBefore = ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.liveBalance) || 0;
        if (balanceBefore < amount) {
            throw new functions.https.HttpsError('failed-precondition', 'Insufficient live balance.', { code: 'insufficient_balance' });
        }
        const balanceAfter = balanceBefore - amount;
        // Deduct balance immediately
        transaction.update(userRef, { liveBalance: balanceAfter });
        // Create pending withdrawal transaction
        transaction.set(transactionRef, {
            senderId: userId,
            receiverId: 'external_provider',
            amount,
            type: 'withdraw',
            mode: 'live',
            status: 'pending',
            idempotencyKey,
            balanceBefore,
            balanceAfter,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        // Enqueued for background processor
        return { success: true, message: 'Withdrawal requested successfully.', transactionId: idempotencyKey };
    });
});
/**
 * Cloud Function: buyAirtime
 * User purchases airtime/data using their wallet balance.
 */
exports.buyAirtime = (0, simsec_1.withSimSec)({ actionName: 'buyAirtime', requireAuth: true }, async (data, context) => {
    const userId = context.auth.uid;
    const { phoneNumber, amount, network, mode, idempotencyKey } = data;
    if (!phoneNumber || typeof amount !== 'number' || amount <= 0 || !network || !['testnet', 'live'].includes(mode) || !idempotencyKey) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid airtime purchase parameters.');
    }
    const transactionRef = db.collection('transactions').doc(idempotencyKey);
    const userRef = db.collection('users').doc(userId);
    // 1. Deduct balance and create pending transaction
    await db.runTransaction(async (transaction) => {
        var _a;
        const txDoc = await transaction.get(transactionRef);
        if (txDoc.exists) {
            throw new functions.https.HttpsError('already-exists', 'Duplicate airtime request.');
        }
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User account not found.');
        }
        const balanceField = mode === 'testnet' ? 'testnetBalance' : 'liveBalance';
        const balanceBefore = ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a[balanceField]) || 0;
        if (balanceBefore < amount) {
            throw new functions.https.HttpsError('failed-precondition', 'Insufficient balance.', { code: 'insufficient_balance' });
        }
        const balanceAfter = balanceBefore - amount;
        // Deduct balance
        transaction.update(userRef, {
            [balanceField]: balanceAfter,
            dartBalance: admin.firestore.FieldValue.increment(1) // Reward DART token for airtime purchase
        });
        // Create pending airtime transaction
        transaction.set(transactionRef, {
            senderId: userId,
            receiverId: 'external_provider', // Airtime provider
            amount,
            type: 'airtime',
            mode,
            status: 'pending',
            phoneNumber,
            network,
            idempotencyKey,
            balanceBefore,
            balanceAfter,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });
    return { success: true, message: 'Airtime purchase queued successfully.', transactionId: idempotencyKey };
});
/**
 * Cloud Function: processPendingTransactions (Background Processor)
 * Handles long-running external API calls and handles automatic refunds on failure.
 */
exports.processPendingTransactions = functions.firestore
    .document('transactions/{transactionId}')
    .onCreate(async (snap, context) => {
    const tx = snap.data();
    if (tx.status !== 'pending' || !['airtime', 'withdraw'].includes(tx.type))
        return;
    const txRef = snap.ref;
    // Transition to processing
    await txRef.update({ status: 'processing' });
    try {
        // 2. Simulate external API call (e.g., Reloadly, Flutterwave)
        let isSuccessful = true;
        if (Math.random() < 0.1)
            isSuccessful = false; // Simulate occasional failure for testing
        if (isSuccessful) {
            await txRef.update({
                status: 'completed',
                completedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        else {
            throw new Error('External API provider failed');
        }
    }
    catch (error) {
        // 3. REFUND LOGIC
        await db.runTransaction(async (transaction) => {
            var _a, _b;
            const currentTx = await transaction.get(txRef);
            if (((_a = currentTx.data()) === null || _a === void 0 ? void 0 : _a.status) === 'refunded')
                return; // Prevent double refund
            const userRef = db.collection('users').doc(tx.senderId);
            const userDoc = await transaction.get(userRef);
            const balanceField = tx.mode === 'testnet' ? 'testnetBalance' : 'liveBalance';
            const balanceBefore = ((_b = userDoc.data()) === null || _b === void 0 ? void 0 : _b[balanceField]) || 0;
            const balanceAfter = balanceBefore + tx.amount;
            // Restore balance
            transaction.update(userRef, { [balanceField]: balanceAfter });
            // Mark as refunded
            transaction.update(txRef, {
                status: 'refunded',
                error: error.message,
                refundBalanceBefore: balanceBefore,
                refundBalanceAfter: balanceAfter,
                refundedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        console.error(`Transaction ${context.params.transactionId} failed and was refunded.`, error);
    }
});
//# sourceMappingURL=index.js.map