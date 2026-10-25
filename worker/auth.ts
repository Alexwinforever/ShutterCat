import { DomainError } from '../shared/domain';

export interface AuthEnv {
  AUTH_DB?: D1Database;
  BREVO_API_KEY?: string;
  AUTH_FROM_EMAIL?: string;
  PUBLIC_APP_URL?: string;
}
export interface AuthUser { id: string; email: string; emailVerified: number; accountKey: string }
const encoder = new TextEncoder();
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unbase64 = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
export const randomToken = () => base64(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value: string) { return base64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
export function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') throw new DomainError('请输入邮箱地址');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email))
    throw new DomainError('邮箱地址格式不正确');
  return email;
}
export function validatePassword(value: unknown) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128)
    throw new DomainError('密码长度需为 12 到 128 位');
  return value;
}
// Workers Web Crypto supports at most 100,000 PBKDF2 iterations.
// Login, verification and mail endpoints also have persistent per-IP/email limits.
async function derivePassword(password: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return base64(new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256)));
}
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: base64(salt), hash: await derivePassword(password, salt) };
}
export async function verifyPassword(password: string, salt: string, expected: string) {
  const actual = await derivePassword(password, unbase64(salt));
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ (expected.charCodeAt(i) || 0);
  return difference === 0;
}
export function cookieValue(request: Request, name: string) {
  return request.headers.get('Cookie')?.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'))?.[1];
}
export function sessionCookie(token: string, secure: boolean, maxAge = 30 * 86400) {
  return 'meow_auth=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + maxAge + (secure ? '; Secure' : '');
}
export async function currentUser(db: D1Database | undefined, request: Request): Promise<AuthUser | null> {
  if (!db) return null;
  const token = cookieValue(request, 'meow_auth');
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return db.prepare(`SELECT u.id, u.email, u.email_verified AS emailVerified, u.account_key AS accountKey
    FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.email_verified = 1`)
    .bind(await digest(token), Date.now()).first<AuthUser>();
}
export async function readAuthBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json'))
    throw new DomainError('请使用 JSON 请求', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError('请求不能为空');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new DomainError('请求过大', 413); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const result = JSON.parse(new TextDecoder().decode(bytes));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch { throw new DomainError('请求格式不正确'); }
}
export async function rateLimit(db: D1Database, scope: string, identity: string, limit: number, windowMs: number) {
  const now = Date.now();
  const key = await digest(scope + ':' + identity);
  const result = await db.prepare(`INSERT INTO auth_limits (key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
    count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END,
    expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
    RETURNING count`).bind(key, now + windowMs, now, now).first<{ count: number }>();
  if (!result || result.count > limit) throw new DomainError('操作过于频繁，请稍后再试', 429);
}
function brevoSender(value: string) {
  const input = value.trim();
  if (/[\r\n]/.test(input)) throw new DomainError('发信邮箱配置无效', 503);
  const formatted = /^(.*?)\s*<([^<>]+)>$/.exec(input);
  const email = normalizeEmail(formatted ? formatted[2] : input);
  const name = formatted?.[1].trim().replace(/^"(.*)"$/, '$1').trim();
  if (name && name.length > 70) throw new DomainError('发信邮箱配置无效', 503);
  return name ? { name, email } : { email };
}
export function mailSettings(env: AuthEnv) {
  if (!env.BREVO_API_KEY || !env.AUTH_FROM_EMAIL || !env.PUBLIC_APP_URL)
    throw new DomainError('邮件服务尚未配置，请联系管理员', 503);
  const origin = new URL(env.PUBLIC_APP_URL);
  if (origin.protocol !== 'https:' && !(['127.0.0.1', 'localhost'].includes(origin.hostname) && origin.protocol === 'http:'))
    throw new DomainError('服务地址配置无效', 503);
  return { origin: origin.origin, sender: brevoSender(env.AUTH_FROM_EMAIL) };
}
export async function sendTokenEmail(env: AuthEnv, to: string, kind: 'verify' | 'reset', token: string) {
  const { origin, sender } = mailSettings(env);
  const title = kind === 'verify' ? '验证ShutterCat邮箱' : '重置ShutterCat密码';
  // Fragment avoids sending the token to access logs. GET never verifies or signs in.
  const link = origin + '/#auth=' + kind + '&token=' + encodeURIComponent(token);
  const text = title + '\n\n打开链接：' + link + '\n\n也可回到ShutterCat App，粘贴以下凭证：\n' + token
    + '\n\n凭证 30 分钟内有效。请勿转发。若非本人操作，请忽略本邮件。';
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY!, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender, to: [{ email: to }], subject: title, textContent: text }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new DomainError('邮件发送失败，请稍后点击重新发送', 503);
}
