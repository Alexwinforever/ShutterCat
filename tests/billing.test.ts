import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, checkIn, consumeReminderCredit, normalizeReminderEntitlement, subscriptionActive, type UserState } from '../shared/domain';
import { entitlement, verifyPlay } from '../worker/play';

test('three welcome reminders, no negative balance, migration only once', () => {
  const state = initialState();
  for (let i = 0; i < 3; i++) consumeReminderCredit(state);
  assert.throws(() => consumeReminderCredit(state), /免费提醒次数/);
  normalizeReminderEntitlement(state);
  assert.equal(state.reminderCredits, 0);
  const legacy = { ...initialState() } as Partial<UserState>;
  delete legacy.reminderCredits; delete legacy.checkIn;
  normalizeReminderEntitlement(legacy as UserState);
  assert.equal(legacy.reminderCredits, 3);
});
test('consecutive weeks award once per seven days, retries and old days cannot award', () => {
  const state = initialState();
  for (let day = 1; day <= 14; day++) {
    const date = '2026-10-' + String(day).padStart(2, '0');
    assert.equal(checkIn(state, date), day % 7 === 0);
    assert.equal(checkIn(state, date), false);
  }
  assert.equal(state.reminderCredits, 5);
  assert.equal(checkIn(state, '2026-10-01'), false);
  assert.equal(state.reminderCredits, 5);
  assert.equal(state.checkIn.rewardedWeeks, 2);
  checkIn(state, '2026-10-16');
  assert.equal(state.checkIn.streak, 1);
});
test('active subscriptions preserve free credits and expired ones do not grant new reminders', () => {
  const state = initialState();
  state.subscription = { productId: 'shuttercat_yearly', expiresAt: new Date(Date.now() + 60000).toISOString(), tokenHash: 'test' };
  for (let i = 0; i < 20; i++) consumeReminderCredit(state);
  assert.equal(state.reminderCredits, 3);
  state.subscription.expiresAt = new Date(Date.now() - 1).toISOString();
  assert.equal(subscriptionActive(state), false);
  consumeReminderCredit(state); assert.equal(state.reminderCredits, 2);
});
test('Play ownership, allowed product, lifecycle and expiry are enforced', () => {
  const now = Date.parse('2026-10-06T00:00:00Z');
  const purchase = {
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    externalAccountIdentifiers: { obfuscatedExternalAccountId: 'owner' },
    lineItems: [{ productId: 'shuttercat_monthly', expiryTime: '2026-11-06T00:00:00Z', offerDetails: { basePlanId: 'standard' } }],
  };
  assert.equal(entitlement(purchase, 'owner', now)?.productId, 'shuttercat_monthly');
  assert.throws(() => entitlement(purchase, 'attacker', now), /另一个/);
  for (const subscriptionState of ['SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED', 'SUBSCRIPTION_STATE_EXPIRED']) assert.equal(entitlement({ ...purchase, subscriptionState }, 'owner', now), undefined);
  for (const subscriptionState of ['SUBSCRIPTION_STATE_CANCELED', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD']) assert.ok(entitlement({ ...purchase, subscriptionState }, 'owner', now));
  assert.equal(entitlement({ ...purchase, lineItems: [{ productId: 'fake', expiryTime: '2027-01-01' }] }, 'owner', now), undefined);
  assert.equal(entitlement(purchase, 'owner', Date.parse('2027-01-01')), undefined);
});
test('missing Play credentials never grant a purchase', async () => {
  await assert.rejects(verifyPlay({}, 'untrusted-client-token', 'owner'), /尚未配置/);
});
