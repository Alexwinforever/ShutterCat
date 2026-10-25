import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { createRuntime } from './runtime.mjs';
let server;
const password = 'Correct horse battery 2026';
before(async () => { server = await createRuntime(); });
after(async () => { await server?.runtime.dispose(); });
beforeEach(async () => { await server.db.prepare('DELETE FROM auth_limits').run(); server.failMail(false); });
const unique = () => crypto.randomUUID() + '@example.com';
async function request(path, data, cookie, headers = {}) {
  return server.runtime.dispatchFetch('http://127.0.0.1:8787/api/' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
const cookieOf = response => response.headers.getSetCookie().find(c => c.startsWith('meow_auth='))?.split(';')[0];
const mailToken = email => server.mail.filter(m => m.to.includes(email)).at(-1)?.text.match(/token=([A-Za-z0-9_-]+)/)[1];
async function register(email, extra = {}) {
  const response = await request('auth/register', { email, password, ...extra });
  assert.equal(response.status, 202, await response.text());
  return mailToken(email);
}
async function verify(email, token) {
  const response = await request('auth/verify-email', { email, password, token });
  assert.equal(response.status, 200, await response.text());
}
async function login(email, secret = password) {
  const response = await request('auth/login', { email, password: secret });
  assert.equal(response.status, 200, await response.text());
  assert.match(response.headers.get('Set-Cookie'), /HttpOnly/);
  return cookieOf(response);
}
test('all private business data requires a verified account and legacy restore cannot bypass it', async () => {
  for (const path of ['state', 'billing', 'proofs/unknown']) assert.equal((await request(path)).status, 401);
  assert.equal((await request('tasks', { title: 'test' })).status, 401);
  assert.equal((await request('account/restore', { recoveryCode: 'meow-' + 'a'.repeat(64) })).status, 410);
  assert.equal((await request('state', undefined, 'meow_session=' + 'a'.repeat(64))).status, 401);
});
test('registration, verification, repeated verification, multi-device identity and logout', async () => {
  const email = unique(); const token = await register(email);
  assert.ok(token);
  const delivery = server.mailRequests.at(-1);
  assert.equal(delivery.apiKey, 'test-only-no-real-mail');
  assert.equal(delivery.accept, 'application/json');
  assert.deepEqual(delivery.body.sender, { name: 'ShutterCat', email: 'test@example.com' });
  assert.deepEqual(delivery.body.to, [{ email }]);
  assert.equal(delivery.body.subject, '验证ShutterCat邮箱');
  assert.match(delivery.body.textContent, /凭证 30 分钟内有效/);
  const row = await server.db.prepare('SELECT * FROM auth_users WHERE email = ?').bind(email).first();
  assert.notEqual(row.password_hash, password);
  assert.equal(row.email_verified, 0);
  assert.equal((await request('auth/login', { email, password })).status, 403);
  assert.equal((await request('auth/verify-email', { email, token, password: 'incorrect password' })).status, 400);
  const pair = await Promise.all([request('auth/verify-email', { email, token, password }), request('auth/verify-email', { email, token, password })]);
  assert.deepEqual(pair.map(r => r.status).sort(), [200, 400]);
  const first = await login(email); const second = await login(email);
  assert.notEqual(first, second);
  await request('check-in', {}, first);
  const a = await (await request('state', undefined, first)).json();
  const b = await (await request('state', undefined, second)).json();
  assert.equal(a.state.checkIn.lastDate, b.state.checkIn.lastDate);
  assert.equal((await request('auth/logout', {}, first)).status, 200);
  assert.equal((await request('state', undefined, first)).status, 401);
  assert.equal((await request('state', undefined, second)).status, 200);
});
test('registration rejects mainland email providers without locking out existing accounts', async () => {
  const mailsBefore = server.mail.length;
  const blocked = [
    'new@qq.com', 'new@vip.qq.com', 'new@foxmail.com', 'new@163.com', 'new@vip.163.com', 'new@126.com',
    'new@yeah.net', 'new@sina.com', 'new@sohu.com', 'new@aliyun.com', 'new@139.com', 'new@21cn.com',
    'new@tom.com', 'new@263.net', 'new@company.cn', 'new@mail.company.cn',
  ];
  for (const email of blocked) {
    const response = await request('auth/register', { email, password });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /中国大陆邮箱/);
    assert.equal(await server.db.prepare('SELECT id FROM auth_users WHERE email = ?').bind(email).first(), null);
  }
  assert.equal(server.mail.length, mailsBefore);
  const existing = 'existing@qq.com';
  await server.seedUser(existing, password);
  assert.ok(await login(existing));
});
test('account deletion requires the password and removes authentication and durable account data', async () => {
  const email = unique(); await verify(email, await register(email));
  const cookie = await login(email);
  const scheduledAt = new Date(Date.now() + 60000).toISOString();
  assert.equal((await request('tasks', { title: 'delete me', scheduledAt }, cookie)).status, 200);
  const row = await server.db.prepare('SELECT id, account_key FROM auth_users WHERE email = ?').bind(email).first();
  const ns = await server.runtime.getDurableObjectNamespace('MEOW_USERS');
  const stub = ns.get(ns.idFromName(row.account_key));
  assert.equal((await (await stub.fetch('https://internal/internal/exists')).json()).exists, true);
  assert.equal((await request('auth/delete-account', { password, confirmation: 'KEEP' }, cookie)).status, 400);
  assert.equal((await request('auth/delete-account', { password: 'incorrect password', confirmation: 'DELETE' }, cookie)).status, 400);
  assert.equal((await request('state', undefined, cookie)).status, 200);
  const deleted = await request('auth/delete-account', { password, confirmation: 'DELETE' }, cookie);
  assert.equal(deleted.status, 200, await deleted.text());
  assert.match(deleted.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal(await server.db.prepare('SELECT id FROM auth_users WHERE email = ?').bind(email).first(), null);
  assert.equal((await (await stub.fetch('https://internal/internal/exists')).json()).exists, false);
  assert.equal((await request('state', undefined, cookie)).status, 401);
  assert.equal((await request('auth/login', { email, password })).status, 401);
});
test('password reset is single-use under concurrency and revokes all existing sessions', async () => {
  const email = unique(); await verify(email, await register(email));
  const first = await login(email); const second = await login(email);
  assert.equal((await request('auth/forgot-password', { email })).status, 200);
  const token = mailToken(email);
  const passwords = ['new password number 1', 'new password number 2'];
  const results = await Promise.all(passwords.map(password => request('auth/reset-password', { email, token, password })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
  assert.equal((await request('state', undefined, first)).status, 401);
  assert.equal((await request('state', undefined, second)).status, 401);
  assert.equal((await request('auth/login', { email, password })).status, 401);
  await login(email, passwords[results.findIndex(r => r.status === 200)]);
});
test('expired verification and reset tokens cannot be consumed', async () => {
  const email = unique(); const token = await register(email);
  await server.db.prepare("UPDATE auth_tokens SET expires_at = 0 WHERE user_id = (SELECT id FROM auth_users WHERE email = ?)").bind(email).run();
  assert.equal((await request('auth/verify-email', { email, token, password })).status, 400);
  await request('auth/forgot-password', { email });
  const resetToken = mailToken(email);
  await server.db.prepare("UPDATE auth_tokens SET expires_at = 0 WHERE user_id = (SELECT id FROM auth_users WHERE email = ?)").bind(email).run();
  assert.equal((await request('auth/reset-password', { email, token: resetToken, password })).status, 400);
});
test('email delivery failure is recoverable through resend without exposing tokens', async () => {
  const email = unique(); server.failMail(true);
  const failed = await request('auth/register', { email, password });
  assert.equal(failed.status, 503);
  assert.equal(server.mail.some(m => m.to.includes(email)), false);
  server.failMail(false);
  assert.equal((await request('auth/resend-verification', { email })).status, 200);
  await verify(email, mailToken(email));
  await login(email);
});
test('email owner can recover a pre-registered unverified account', async () => {
  const email = unique(); await register(email);
  await request('auth/forgot-password', { email });
  const token = mailToken(email);
  const replacement = 'owner-chosen-new-password';
  assert.equal((await request('auth/reset-password', { email, token, password: replacement })).status, 200);
  await login(email, replacement);
  assert.equal((await request('auth/login', { email, password })).status, 401);
});
test('legacy data is bound only after verification and cannot be claimed twice', async () => {
  const legacy = 'b'.repeat(64);
  const ns = await server.runtime.getDurableObjectNamespace('MEOW_USERS');
  const stub = ns.get(ns.idFromName(legacy));
  await stub.fetch('https://internal/api/check-in', { method: 'POST' });
  const email = unique(); const token = await register(email, { recoveryCode: 'meow-' + legacy });
  let row = await server.db.prepare('SELECT account_key FROM auth_users WHERE email = ?').bind(email).first();
  assert.notEqual(row.account_key, legacy);
  await verify(email, token);
  row = await server.db.prepare('SELECT account_key FROM auth_users WHERE email = ?').bind(email).first();
  assert.equal(row.account_key, legacy);
  const cookie = await login(email);
  assert.equal((await (await request('state', undefined, cookie)).json()).state.checkIn.streak, 1);
  assert.equal((await request('auth/register', { email: unique(), password, recoveryCode: 'meow-' + legacy })).status, 409);
});
test('origin checks, body bounds, password validation and rate limits are enforced', async () => {
  assert.equal((await request('auth/login', { email: unique(), password }, undefined, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('auth/register', { email: unique(), password: 'short' })).status, 400);
  assert.equal((await request('auth/login', { email: unique(), password, oversized: 'x'.repeat(9000) })).status, 413);
  const email = unique();
  for (let i = 0; i < 10; i++) assert.equal((await request('auth/login', { email, password })).status, 401);
  assert.equal((await request('auth/login', { email, password })).status, 429);
});
