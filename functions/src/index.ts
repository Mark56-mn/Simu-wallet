import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

/**
 * Cloud Function: sendMoney
 * Authenticated users can send money to other users.
 */
export const sendMoney = functions.https.onCall(async (data, context) => {
  // 1. Authenticate user
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in to send money.');
  }

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
    const senderBalance = senderData?.[balanceField] || 0;

    // 4. Check for sufficient balance
    if (senderBalance < amount) {
      throw new functions.https.HttpsError('failed-precondition', 'Insufficient balance.', { code: 'insufficient_balance' });
    }

    // 5. Update balances and create transaction record atomically
    transaction.update(senderRef, {
      [balanceField]: admin.firestore.FieldValue.increment(-amount),
      dartBalance: admin.firestore.FieldValue.increment(1) // Reward DART token
    });

    transaction.update(receiverRef, {
      [balanceField]: admin.firestore.FieldValue.increment(amount)
    });

    transaction.set(transactionRef, {
      senderId,
      receiverId,
      amount,
      type: 'send',
      mode,
      status: 'completed',
      idempotencyKey,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, message: 'Transfer successful' };
  });
});

/**
 * Cloud Function: initiateDeposit
 * User requests to add real money to their live balance.
 */
export const initiateDeposit = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in to deposit.');
  }

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
      status: 'pending',
      idempotencyKey,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // In a real app, you would generate a payment link or reference here
    const paymentReference = `DEP_${idempotencyKey}_${Date.now()}`;

    return { success: true, paymentReference, transactionId: idempotencyKey };
  });
});

/**
 * Cloud Function: confirmDeposit
 * Called by payment provider webhook or internal system to confirm deposit.
 * Normally this would be an HTTP webhook rather than onCall, but using onCall for simplicity here.
 */
export const confirmDeposit = functions.https.onCall(async (data, context) => {
  // Security note: In reality, verify the caller is your payment provider webhook
  // or restrict this to admin users.

  const { transactionId } = data;
  if (!transactionId) {
    throw new functions.https.HttpsError('invalid-argument', 'Transaction ID is required.');
  }

  const transactionRef = db.collection('transactions').doc(transactionId);

  return db.runTransaction(async (transaction) => {
    const txDoc = await transaction.get(transactionRef);
    if (!txDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Transaction not found.');
    }

    const txData = txDoc.data();
    if (txData?.status === 'completed') {
      throw new functions.https.HttpsError('already-exists', 'Deposit already confirmed.');
    }

    if (txData?.type !== 'deposit' || txData?.status !== 'pending') {
      throw new functions.https.HttpsError('failed-precondition', 'Invalid transaction state.');
    }

    const receiverRef = db.collection('users').doc(txData.receiverId);
    
    // Update balance and transaction status
    transaction.update(receiverRef, {
      liveBalance: admin.firestore.FieldValue.increment(txData.amount)
    });

    transaction.update(transactionRef, {
      status: 'completed',
      confirmedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, message: 'Deposit confirmed and credited.' };
  });
});

/**
 * Cloud Function: requestWithdraw
 * User requests to withdraw their live balance to real money.
 */
export const requestWithdraw = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in to withdraw.');
  }

  const userId = context.auth.uid;
  const { amount, idempotencyKey } = data;

  if (typeof amount !== 'number' || amount <= 0 || !idempotencyKey) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid withdrawal parameters.');
  }

  const transactionRef = db.collection('transactions').doc(idempotencyKey);
  const userRef = db.collection('users').doc(userId);

  return db.runTransaction(async (transaction) => {
    const txDoc = await transaction.get(transactionRef);
    if (txDoc.exists) {
      throw new functions.https.HttpsError('already-exists', 'Duplicate withdrawal request.');
    }

    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User account not found.');
    }

    const currentLiveBalance = userDoc.data()?.liveBalance || 0;
    if (currentLiveBalance < amount) {
      throw new functions.https.HttpsError('failed-precondition', 'Insufficient live balance.', { code: 'insufficient_balance' });
    }

    // Deduct balance immediately
    transaction.update(userRef, {
      liveBalance: admin.firestore.FieldValue.increment(-amount)
    });

    // Create pending withdrawal transaction
    transaction.set(transactionRef, {
      senderId: userId,
      receiverId: 'external_provider',
      amount,
      type: 'withdraw',
      mode: 'live',
      status: 'pending',
      idempotencyKey,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // In a real application, you would trigger the payout API (e.g., Flutterwave) here 
    // or queue a background job to process the payout.

    return { success: true, message: 'Withdrawal requested successfully.', transactionId: idempotencyKey };
  });
});

/**
 * Cloud Function: buyAirtime
 * User purchases airtime/data using their wallet balance.
 */
export const buyAirtime = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in to buy airtime.');
  }

  const userId = context.auth.uid;
  const { phoneNumber, amount, network, mode, idempotencyKey } = data;

  if (!phoneNumber || typeof amount !== 'number' || amount <= 0 || !network || !['testnet', 'live'].includes(mode) || !idempotencyKey) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid airtime purchase parameters.');
  }

  const transactionRef = db.collection('transactions').doc(idempotencyKey);
  const userRef = db.collection('users').doc(userId);

  // 1. Deduct balance and create pending transaction
  await db.runTransaction(async (transaction) => {
    const txDoc = await transaction.get(transactionRef);
    if (txDoc.exists) {
      throw new functions.https.HttpsError('already-exists', 'Duplicate airtime request.');
    }

    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User account not found.');
    }

    const balanceField = mode === 'testnet' ? 'testnetBalance' : 'liveBalance';
    const currentBalance = userDoc.data()?.[balanceField] || 0;
    
    if (currentBalance < amount) {
      throw new functions.https.HttpsError('failed-precondition', 'Insufficient balance.', { code: 'insufficient_balance' });
    }

    // Deduct balance
    transaction.update(userRef, {
      [balanceField]: admin.firestore.FieldValue.increment(-amount),
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
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  // 2. Simulate external API call to airtime provider
  // In a real app, you would call the external API here (e.g., Reloadly, Flutterwave)
  const isSuccessful = true; // Simulate success

  // 3. Update transaction status based on API result
  if (isSuccessful) {
    await transactionRef.update({
      status: 'completed',
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true, message: 'Airtime purchased successfully.', transactionId: idempotencyKey };
  } else {
    // If failed, we should refund the user in a real scenario
    await transactionRef.update({
      status: 'failed',
      failedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: false, message: 'Airtime purchase failed. Refund pending.', transactionId: idempotencyKey };
  }
});
