import { DomainError, SUBSCRIPTION_PLANS } from '../shared/domain';
export interface PlayEnv { PLAY_PACKAGE_NAME?: string; PLAY_SERVICE_ACCOUNT?: string }
export interface PlayPurchase {
  subscriptionState?: string;
  acknowledgementState?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: { productId: string; expiryTime?: string; offerDetails?: { basePlanId?: string } }[];
}
export const playConfigured = (env: PlayEnv) => Boolean(env.PLAY_PACKAGE_NAME && env.PLAY_SERVICE_ACCOUNT);
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
export async function hash(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
}
async function accessToken(env: PlayEnv) {
  if (!playConfigured(env)) throw new DomainError('Google Play 支付尚未配置', 503);
  const account = JSON.parse(env.PLAY_SERVICE_ACCOUNT!) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const enc = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = enc({ alg: 'RS256', typ: 'JWT' }) + '.' + enc({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const pem = account.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + encode(new Uint8Array(signature)) }), signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new DomainError('暂时无法验证 Google Play 订阅，请稍后重试', 503);
  const result = await response.json() as { access_token: string };
  return result.access_token;
}
export function entitlement(purchase: PlayPurchase, accountId: string, now = Date.now()) {
  if (purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId !== accountId) throw new DomainError('这笔订阅属于另一个ShutterCat账号，请先使用恢复码恢复原账号', 409);
  const allowed = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'];
  if (!allowed.includes(purchase.subscriptionState ?? '')) return undefined;
  const item = purchase.lineItems?.filter(i => SUBSCRIPTION_PLANS.some(p => p.id === i.productId) && i.offerDetails?.basePlanId === 'standard' && Date.parse(i.expiryTime ?? '') > now).sort((a, b) => Date.parse(b.expiryTime!) - Date.parse(a.expiryTime!))[0];
  return item ? { productId: item.productId, expiresAt: item.expiryTime! } : undefined;
}
export async function verifyPlay(env: PlayEnv, purchaseToken: string, accountId: string) {
  const auth = await accessToken(env);
  const base = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + encodeURIComponent(env.PLAY_PACKAGE_NAME!);
  const response = await fetch(base + '/purchases/subscriptionsv2/tokens/' + encodeURIComponent(purchaseToken), { headers: { Authorization: 'Bearer ' + auth }, signal: AbortSignal.timeout(12000) });
  if (response.status === 404 || response.status === 410) return undefined;
  if (!response.ok) throw new DomainError('无法验证 Google Play 订单，请稍后恢复购买', 503);
  const purchase = await response.json() as PlayPurchase;
  const result = entitlement(purchase, accountId);
  if (result && purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
    const ack = await fetch(base + '/purchases/subscriptions/' + encodeURIComponent(result.productId) + '/tokens/' + encodeURIComponent(purchaseToken) + ':acknowledge', { method: 'POST', headers: { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(12000) });
    if (!ack.ok) throw new DomainError('订单确认尚未完成，请稍后恢复购买', 503);
  }
  return result ? { ...result, tokenHash: await hash(purchaseToken) } : undefined;
}
