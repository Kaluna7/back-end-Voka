const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getEnv } = require('../config/env');
const { User } = require('../models/User');
const { VOICE_PLANS } = require('../config/voicePlans');

/**
 * Google Play Billing (subscriptions) — server side.
 *  - verify a purchase token the app got from Play Billing, then activate the plan;
 *  - keep it in sync via Real-time Developer Notifications (Pub/Sub push);
 *  - cancel auto-renew from the app.
 * Auth: a service account with "View financial data / Manage orders and subscriptions"
 * in Play Console, JSON key at GOOGLE_PLAY_SERVICE_ACCOUNT_PATH.
 */

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

const packageName = () => getEnv('GOOGLE_PLAY_PACKAGE_NAME', 'com.moocha');

/** Play Console subscription product IDs → our plans. */
const productToPlan = () => ({
  [getEnv('GOOGLE_PLAY_PRODUCT_BASIC', 'moocha_basic_monthly')]: 'starter',
  [getEnv('GOOGLE_PLAY_PRODUCT_PRO', 'moocha_pro_monthly')]: 'pro',
  [getEnv('GOOGLE_PLAY_PRODUCT_PREMIUM', 'moocha_premium_monthly')]: 'premium',
});

const planToProduct = planId =>
  Object.entries(productToPlan()).find(([, plan]) => plan === planId)?.[0] || null;

const billingError = (status, message, code) => {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
};

// ---- OAuth (service account JWT → access token) --------------------------------------
let cachedToken = null;

const loadServiceAccount = () => {
  const keyPath = getEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_PATH');
  if (!keyPath) {
    throw billingError(500, 'Google Play billing is not configured.', 'BILLING_NOT_CONFIGURED');
  }
  const resolved = path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
};

const base64Url = input =>
  Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

const getAccessToken = async () => {
  if (cachedToken && cachedToken.expiresAt - 60000 > Date.now()) {
    return cachedToken.token;
  }
  const account = loadServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(account.private_key)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  if (!res.ok) {
    throw billingError(502, 'Could not authenticate with Google Play.', 'BILLING_AUTH_FAILED');
  }
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return cachedToken.token;
};

const playRequest = async (url, { method = 'GET', body } = {}) => {
  const token = await getAccessToken();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn('[google-play] request failed', { url, status: res.status, body: text.slice(0, 300) });
    throw billingError(res.status === 404 || res.status === 410 ? 400 : 502, 'Google Play rejected the purchase.', 'BILLING_INVALID_PURCHASE');
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
};

const getSubscription = purchaseToken =>
  playRequest(`${API}/${packageName()}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);

const acknowledgeSubscription = (productId, purchaseToken) =>
  playRequest(
    `${API}/${packageName()}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    { method: 'POST', body: {} },
  );

const cancelGoogleSubscription = (productId, purchaseToken) =>
  playRequest(
    `${API}/${packageName()}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:cancel`,
    { method: 'POST' },
  );

// ---- Applying Google's state to our user ---------------------------------------------
const ACTIVE_STATES = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD']);

/**
 * Mirrors a Play subscription onto the user:
 *  - active / grace → plan on; a new expiry (renewal or first purchase) refills voice tokens;
 *  - canceled but not yet expired → still on, marked "ends at period end";
 *  - expired / on hold / paused / revoked → back to free.
 */
const applySubscriptionToUser = async (userId, purchaseToken, subscription) => {
  const lineItem = Array.isArray(subscription?.lineItems) ? subscription.lineItems[0] : null;
  const productId = lineItem?.productId || '';
  const planId = productToPlan()[productId];
  if (!planId) {
    throw billingError(400, 'Unknown subscription product.', 'BILLING_UNKNOWN_PRODUCT');
  }
  const plan = VOICE_PLANS[planId];
  const expiry = lineItem?.expiryTime ? new Date(lineItem.expiryTime) : null;
  const state = String(subscription?.subscriptionState || '');
  const stillValid = expiry && expiry.getTime() > Date.now();
  const active = ACTIVE_STATES.has(state) || (state === 'SUBSCRIPTION_STATE_CANCELED' && stillValid);

  const user = await User.findById(userId)
    .select('dashboard.voicePeriodEndsAt dashboard.googlePlayPurchaseToken dashboard.selectedPlan')
    .lean();
  if (!user) {
    throw billingError(404, 'User tidak ditemukan.', 'USER_NOT_FOUND');
  }

  const set = {
    'dashboard.billingProvider': 'google_play',
    'dashboard.googlePlayPurchaseToken': purchaseToken,
    'dashboard.googlePlayProductId': productId,
    'dashboard.googlePlayOrderId': subscription?.latestOrderId || '',
  };
  if (active) {
    const previousEnd = user.dashboard?.voicePeriodEndsAt ? new Date(user.dashboard.voicePeriodEndsAt).getTime() : 0;
    const isNewPeriod =
      !previousEnd ||
      (expiry && expiry.getTime() > previousEnd) ||
      user.dashboard?.googlePlayPurchaseToken !== purchaseToken ||
      user.dashboard?.selectedPlan !== planId;
    set['dashboard.isPremium'] = true;
    set['dashboard.selectedPlan'] = planId;
    set['dashboard.voicePeriodEndsAt'] = expiry;
    set['dashboard.subscriptionCancelAtPeriodEnd'] = state === 'SUBSCRIPTION_STATE_CANCELED';
    if (isNewPeriod) {
      set['dashboard.voiceTokens'] = plan.voiceTokens;
    }
  } else {
    set['dashboard.isPremium'] = false;
    set['dashboard.voiceTokens'] = 0;
    set['dashboard.voicePeriodEndsAt'] = null;
    set['dashboard.subscriptionCancelAtPeriodEnd'] = false;
  }
  await User.updateOne({ _id: userId }, { $set: set });

  // Play refunds unacknowledged purchases after 3 days.
  if (active && subscription?.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
    await acknowledgeSubscription(productId, purchaseToken).catch(error =>
      console.warn('[google-play] acknowledge failed', error?.message),
    );
  }
  return { planId, active, state, expiry };
};

/** App → server after a successful Play purchase. */
const verifyAndApplyPurchase = async (userId, purchaseToken) => {
  if (!purchaseToken) {
    throw billingError(400, 'purchaseToken is required.', 'BILLING_MISSING_TOKEN');
  }
  // A token already bound to another account must not unlock a second one.
  const owner = await User.findOne({ 'dashboard.googlePlayPurchaseToken': purchaseToken }).select('_id').lean();
  if (owner && String(owner._id) !== String(userId)) {
    throw billingError(409, 'This purchase belongs to another account.', 'BILLING_TOKEN_IN_USE');
  }
  const subscription = await getSubscription(purchaseToken);
  // Upgrades/downgrades create a new token that links to the old one.
  if (subscription?.linkedPurchaseToken) {
    await User.updateMany(
      { 'dashboard.googlePlayPurchaseToken': subscription.linkedPurchaseToken, _id: { $ne: userId } },
      { $set: { 'dashboard.isPremium': false, 'dashboard.voiceTokens': 0 } },
    );
  }
  return applySubscriptionToUser(userId, purchaseToken, subscription);
};

/** Pub/Sub push → re-read the subscription and update whoever owns the token. */
const handleRealtimeNotification = async payload => {
  const raw = payload?.message?.data;
  if (!raw) {
    return { ignored: true };
  }
  const notification = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  if (notification?.testNotification) {
    console.log('[google-play] RTDN test notification received');
    return { test: true };
  }
  const purchaseToken = notification?.subscriptionNotification?.purchaseToken;
  if (!purchaseToken) {
    return { ignored: true };
  }
  const user = await User.findOne({ 'dashboard.googlePlayPurchaseToken': purchaseToken }).select('_id').lean();
  if (!user) {
    // Purchase not linked yet (app hasn't called verify) — it will be applied then.
    return { unknownToken: true };
  }
  const subscription = await getSubscription(purchaseToken);
  const result = await applySubscriptionToUser(user._id, purchaseToken, subscription);
  console.log('[google-play] RTDN applied', {
    userId: String(user._id),
    type: notification.subscriptionNotification.notificationType,
    state: result.state,
  });
  return result;
};

/** Re-check with Google (used when a Play-billed period has passed without an RTDN). */
const refreshGoogleSubscription = async userId => {
  const user = await User.findById(userId).select('dashboard.googlePlayPurchaseToken').lean();
  const token = user?.dashboard?.googlePlayPurchaseToken;
  if (!token) {
    return null;
  }
  const subscription = await getSubscription(token);
  return applySubscriptionToUser(userId, token, subscription);
};

/** "Cancel for next month" for Play-billed users: stop auto-renew at Google. */
const cancelUserGoogleSubscription = async userId => {
  const user = await User.findById(userId)
    .select('dashboard.googlePlayPurchaseToken dashboard.googlePlayProductId')
    .lean();
  const token = user?.dashboard?.googlePlayPurchaseToken;
  const productId = user?.dashboard?.googlePlayProductId;
  if (!token || !productId) {
    return false;
  }
  await cancelGoogleSubscription(productId, token);
  return true;
};

const allowUnverifiedPurchases = () =>
  String(getEnv('BILLING_ALLOW_UNVERIFIED', '')).toLowerCase() === 'true';

module.exports = {
  verifyAndApplyPurchase,
  handleRealtimeNotification,
  refreshGoogleSubscription,
  cancelUserGoogleSubscription,
  planToProduct,
  allowUnverifiedPurchases,
};
