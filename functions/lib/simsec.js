"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withSimSec = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();
/**
 * SimSec 8-Layer Security Middleware
 */
const withSimSec = (options, handler) => {
    return functions.https.onCall(async (data, context) => {
        var _a, _b;
        // 1. Authentication
        if (options.requireAuth && !context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'SimSec Layer 1: Authentication required.');
        }
        const userId = ((_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid) || 'anonymous';
        // 2. Authorization
        if (options.requiredRole && context.auth) {
            const userDoc = await db.collection('users').doc(userId).get();
            const userRole = ((_b = userDoc.data()) === null || _b === void 0 ? void 0 : _b.role) || 'user';
            if (userRole !== options.requiredRole) {
                throw new functions.https.HttpsError('permission-denied', 'SimSec Layer 2: Authorization failed.');
            }
        }
        // 5. Fraud Detection & Rate Limiting
        // A simple check: ensure the user hasn't made too many requests in the last minute.
        if (context.auth) {
            const rateLimitRef = db.collection('simsec_ratelimits').doc(userId);
            await db.runTransaction(async (t) => {
                const doc = await t.get(rateLimitRef);
                const now = Date.now();
                if (doc.exists) {
                    const { count, lastRequest } = doc.data();
                    if (now - lastRequest < 60000) {
                        if (count > 20) { // Limit to 20 requests per minute
                            throw new functions.https.HttpsError('resource-exhausted', 'SimSec Layer 5: Rate limit exceeded.');
                        }
                        t.update(rateLimitRef, { count: count + 1, lastRequest: now });
                    }
                    else {
                        t.update(rateLimitRef, { count: 1, lastRequest: now });
                    }
                }
                else {
                    t.set(rateLimitRef, { count: 1, lastRequest: now });
                }
            });
        }
        // 6. Audit Logging (Start)
        const auditLogRef = db.collection('audit_logs').doc();
        const startTime = Date.now();
        // We mask sensitive data before logging (Layer 4 prep)
        const safeData = Object.assign({}, data);
        if (safeData.amount)
            safeData.amount = '***'; // Example masking
        await auditLogRef.set({
            action: options.actionName,
            userId,
            ip: context.rawRequest.ip,
            data: safeData,
            status: 'started',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        try {
            // 3. Transaction Validation & 7. API Security Layer & 8. Fail-safe (Delegated to handler)
            const result = await handler(data, context);
            // 6. Audit Logging (Success)
            await auditLogRef.update({
                status: 'success',
                durationMs: Date.now() - startTime
            });
            return result;
        }
        catch (error) {
            // 6. Audit Logging (Failure)
            await auditLogRef.update({
                status: 'failed',
                error: error.message,
                durationMs: Date.now() - startTime
            });
            // Re-throw the error safely
            if (error instanceof functions.https.HttpsError) {
                throw error;
            }
            throw new functions.https.HttpsError('internal', 'SimSec Layer 8: Internal failure handled safely.');
        }
    });
};
exports.withSimSec = withSimSec;
//# sourceMappingURL=simsec.js.map