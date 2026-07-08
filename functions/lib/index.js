"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recoverStuckTransactions = exports.resetTestnetDailyGold = exports.processPendingTransactions = exports.buyAirtime = exports.requestWithdraw = exports.confirmDepositWebhook = exports.initiateDeposit = exports.sendMoney = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const simsec_1 = require("./simsec");
admin.initializeApp();
const db = admin.firestore();
/**
 * Helper to get Testnet total balance
 */
function getTestnetBalance(testnetData) {
    if (!testnetData)
        return 0;
    return (testnetData.dailyAllocation || 0) + (testnetData.earnedBalance || 0);
}
/**
 * Cloud Function: sendMoney
 * Authenticated users can send money to other users.
 */
exports.sendMoney = (0, simsec_1.withSimSec)({ actionName: 'sendMoney', requireAuth: true }, async (data, context) => {
    const senderId = context.auth.uid;
    const { receiverId, amount, mode, idempotencyKey } = data;
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
        const senderData = senderDoc.data();
        const receiverData = receiverDoc.data();
        let senderBalanceBefore = 0;
        let receiverBalanceBefore = 0;
        if (mode === 'testnet') {
            senderBalanceBefore = getTestnetBalance(senderData.testnet);
            receiverBalanceBefore = getTestnetBalance(receiverData.testnet);
        }
        else {
            senderBalanceBefore = senderData.liveBalance || 0;
            receiverBalanceBefore = receiverData.liveBalance || 0;
        }
        if (senderBalanceBefore < amount) {
            throw new functions.https.HttpsError('failed-precondition', 'Insufficient balance.', { code: 'insufficient_balance' });
        }
        const senderBalanceAfter = senderBalanceBefore - amount;
        const receiverBalanceAfter = receiverBalanceBefore + amount;
        let deductedDaily = 0;
        let deductedEarned = 0;
        if (mode === 'testnet') {
            const testnet = senderData.testnet || { dailyAllocation: 0, earnedBalance: 0 };
            let daily = testnet.dailyAllocation || 0;
            let earned = testnet.earnedBalance || 0;
            let remainingToDeduct = amount;
            if (daily >= remainingToDeduct) {
                daily -= remainingToDeduct;
                deductedDaily = remainingToDeduct;
            }
            else {
                deductedDaily = daily;
                remainingToDeduct -= daily;
                daily = 0;
                earned -= remainingToDeduct;
                deductedEarned = remainingToDeduct;
            }
            transaction.update(senderRef, {
                'testnet.dailyAllocation': daily,
                'testnet.earnedBalance': earned,
                dartBalance: admin.firestore.FieldValue.increment(1)
            });
            transaction.update(receiverRef, {
                'testnet.earnedBalance': admin.firestore.FieldValue.increment(amount)
            });
        }
        else {
            transaction.update(senderRef, {
                liveBalance: senderBalanceAfter,
                dartBalance: admin.firestore.FieldValue.increment(1)
            });
            transaction.update(receiverRef, {
                liveBalance: receiverBalanceAfter
            });
        }
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
            deductedDaily,
            deductedEarned,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true, message: 'Transfer successful' };
    });
});
/**
 * Cloud Function: initiateDeposit
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
            senderId: 'external_provider',
            receiverId: userId,
            amount,
            type: 'deposit',
            mode: 'live',
            status: 'initiated',
            idempotencyKey,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        const paymentReference = `DEP_${idempotencyKey}_${Date.now()}`;
        return { success: true, paymentReference, transactionId: idempotencyKey };
    });
});
/**
 * Cloud Function: confirmDepositWebhook
 */
exports.confirmDepositWebhook = functions.https.onRequest(async (req, res) => {
    try {
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
                return;
            if (txData.amount !== paidAmount) {
                throw new Error(`Amount mismatch. Expected ${txData.amount}, got ${paidAmount}`);
            }
            const receiverRef = db.collection('users').doc(txData.receiverId);
            const receiverDoc = await transaction.get(receiverRef);
            const balanceBefore = ((_a = receiverDoc.data()) === null || _a === void 0 ? void 0 : _a.liveBalance) || 0;
            const balanceAfter = balanceBefore + paidAmount;
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
        transaction.update(userRef, { liveBalance: balanceAfter });
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
        return { success: true, message: 'Withdrawal requested successfully.', transactionId: idempotencyKey };
    });
});
/**
 * Cloud Function: buyAirtime
 */
exports.buyAirtime = (0, simsec_1.withSimSec)({ actionName: 'buyAirtime', requireAuth: true }, async (data, context) => {
    const userId = context.auth.uid;
    const { phoneNumber, amount, network, mode, idempotencyKey } = data;
    if (!phoneNumber || typeof amount !== 'number' || amount <= 0 || !network || !['testnet', 'live'].includes(mode) || !idempotencyKey) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid airtime purchase parameters.');
    }
    const transactionRef = db.collection('transactions').doc(idempotencyKey);
    const userRef = db.collection('users').doc(userId);
    await db.runTransaction(async (transaction) => {
        const txDoc = await transaction.get(transactionRef);
        if (txDoc.exists) {
            throw new functions.https.HttpsError('already-exists', 'Duplicate airtime request.');
        }
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User account not found.');
        }
        const userData = userDoc.data();
        let balanceBefore = 0;
        if (mode === 'testnet') {
            balanceBefore = getTestnetBalance(userData.testnet);
        }
        else {
            balanceBefore = userData.liveBalance || 0;
        }
        if (balanceBefore < amount) {
            throw new functions.https.HttpsError('failed-precondition', 'Insufficient balance.', { code: 'insufficient_balance' });
        }
        const balanceAfter = balanceBefore - amount;
        let deductedDaily = 0;
        let deductedEarned = 0;
        if (mode === 'testnet') {
            const testnet = userData.testnet || { dailyAllocation: 0, earnedBalance: 0 };
            let daily = testnet.dailyAllocation || 0;
            let earned = testnet.earnedBalance || 0;
            let remainingToDeduct = amount;
            if (daily >= remainingToDeduct) {
                daily -= remainingToDeduct;
                deductedDaily = remainingToDeduct;
            }
            else {
                deductedDaily = daily;
                remainingToDeduct -= daily;
                daily = 0;
                earned -= remainingToDeduct;
                deductedEarned = remainingToDeduct;
            }
            transaction.update(userRef, {
                'testnet.dailyAllocation': daily,
                'testnet.earnedBalance': earned,
                dartBalance: admin.firestore.FieldValue.increment(1)
            });
        }
        else {
            transaction.update(userRef, {
                liveBalance: balanceAfter,
                dartBalance: admin.firestore.FieldValue.increment(1)
            });
        }
        transaction.set(transactionRef, {
            senderId: userId,
            receiverId: 'external_provider',
            amount,
            type: 'airtime',
            mode,
            status: 'pending',
            phoneNumber,
            network,
            idempotencyKey,
            balanceBefore,
            balanceAfter,
            deductedDaily,
            deductedEarned,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });
    return { success: true, message: 'Airtime purchase queued successfully.', transactionId: idempotencyKey };
});
/**
 * Cloud Function: processPendingTransactions (Background Processor)
 */
exports.processPendingTransactions = functions.firestore
    .document('transactions/{transactionId}')
    .onCreate(async (snap, context) => {
    const tx = snap.data();
    if (tx.status !== 'pending' || !['airtime', 'withdraw'].includes(tx.type))
        return;
    const txRef = snap.ref;
    await txRef.update({ status: 'processing' });
    try {
        let isSuccessful = true;
        if (Math.random() < 0.1)
            isSuccessful = false;
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
        await db.runTransaction(async (transaction) => {
            var _a;
            const currentTx = await transaction.get(txRef);
            if (((_a = currentTx.data()) === null || _a === void 0 ? void 0 : _a.status) === 'refunded')
                return;
            const userRef = db.collection('users').doc(tx.senderId);
            const userDoc = await transaction.get(userRef);
            const userData = userDoc.data();
            let balanceBefore = 0;
            let balanceAfter = 0;
            if (tx.mode === 'testnet') {
                balanceBefore = getTestnetBalance(userData.testnet);
                balanceAfter = balanceBefore + tx.amount;
                transaction.update(userRef, {
                    'testnet.dailyAllocation': admin.firestore.FieldValue.increment(tx.deductedDaily || 0),
                    'testnet.earnedBalance': admin.firestore.FieldValue.increment(tx.deductedEarned || 0)
                });
            }
            else {
                balanceBefore = userData.liveBalance || 0;
                balanceAfter = balanceBefore + tx.amount;
                transaction.update(userRef, { liveBalance: balanceAfter });
            }
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
/**
 * Scheduled Job: Reset Testnet Daily Gold (Runs every 24 hours)
 */
exports.resetTestnetDailyGold = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    const usersSnapshot = await db.collection('users').get();
    const batches = [];
    let currentBatch = db.batch();
    let count = 0;
    usersSnapshot.forEach(doc => {
        currentBatch.update(doc.ref, {
            'testnet.dailyAllocation': 10000,
            'testnet.lastResetAt': admin.firestore.FieldValue.serverTimestamp()
        });
        count++;
        if (count === 500) {
            batches.push(currentBatch.commit());
            currentBatch = db.batch();
            count = 0;
        }
    });
    if (count > 0) {
        batches.push(currentBatch.commit());
    }
    await Promise.all(batches);
    console.log('Daily Testnet Gold Reset Completed');
});
/**
 * Scheduled Job: Recover Stuck Transactions (Runs every hour)
 */
exports.recoverStuckTransactions = functions.pubsub.schedule('every 1 hours').onRun(async (context) => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const stuckTxSnapshot = await db.collection('transactions')
        .where('status', 'in', ['pending', 'processing'])
        .where('createdAt', '<', oneHourAgo)
        .get();
    for (const doc of stuckTxSnapshot.docs) {
        const tx = doc.data();
        // Trigger refund logic manually
        await db.runTransaction(async (transaction) => {
            var _a, _b;
            const currentTx = await transaction.get(doc.ref);
            if (((_a = currentTx.data()) === null || _a === void 0 ? void 0 : _a.status) === 'refunded' || ((_b = currentTx.data()) === null || _b === void 0 ? void 0 : _b.status) === 'completed')
                return;
            const userRef = db.collection('users').doc(tx.senderId);
            const userDoc = await transaction.get(userRef);
            const userData = userDoc.data();
            let balanceBefore = 0;
            let balanceAfter = 0;
            if (tx.mode === 'testnet') {
                balanceBefore = getTestnetBalance(userData.testnet);
                balanceAfter = balanceBefore + tx.amount;
                transaction.update(userRef, {
                    'testnet.dailyAllocation': admin.firestore.FieldValue.increment(tx.deductedDaily || 0),
                    'testnet.earnedBalance': admin.firestore.FieldValue.increment(tx.deductedEarned || 0)
                });
            }
            else {
                balanceBefore = userData.liveBalance || 0;
                balanceAfter = balanceBefore + tx.amount;
                transaction.update(userRef, { liveBalance: balanceAfter });
            }
            transaction.update(doc.ref, {
                status: 'refunded',
                error: 'Stuck transaction auto-recovered and refunded.',
                refundBalanceBefore: balanceBefore,
                refundBalanceAfter: balanceAfter,
                refundedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        console.log(`Recovered and refunded stuck transaction: ${doc.id}`);
    }
});
//# sourceMappingURL=index.js.map