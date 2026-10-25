import { DomainError } from '../shared/domain';
import { isMainlandRegistrationEmail, MAINLAND_EMAIL_REGISTRATION_MESSAGE } from '../shared/email-policy';
import { cookieValue, currentUser, digest, hashPassword, mailSettings, normalizeEmail, randomToken, rateLimit, readAuthBody, sendTokenEmail, sessionCookie, validatePassword, verifyPassword, type AuthEnv, type AuthUser } from './auth';
const json = (value: unknown, status = 200) => Response.json(value, { status });
const publicUser = (user: AuthUser) => ({ id: user.id, email: user.email, emailVerified: Boolean(user.emailVerified) });
type UserRow = AuthUser & { passwordHash: string; passwordSalt: string; pendingLegacyKey: string | null };
const userSql = 'SELECT id, email, email_verified AS emailVerified, account_key AS accountKey, password_hash AS passwordHash, password_salt AS passwordSalt, pending_legacy_key AS pendingLegacyKey FROM auth_users WHERE email = ?';
const genericMail = '如果该邮箱符合条件，邮件已发送，请检查收件箱和垃圾邮件。';

async function issueToken(db: D1Database, env: AuthEnv, user: UserRow, kind: 'verify' | 'reset') {
  const token = randomToken(); const tokenHash = await digest(token);
  // Keep older unexpired tokens valid if a resend fails; successful consumption clears them.
  await db.prepare('INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, user.id, kind, Date.now() + 30 * 60000).run();
  try { await sendTokenEmail(env, user.email, kind, token); }
  catch (error) {
    await db.prepare('DELETE FROM auth_tokens WHERE token_hash = ?').bind(tokenHash).run();
    throw error;
  }
}
export async function authRoutes(request: Request, env: AuthEnv, legacyExists: (key: string) => Promise<boolean>, deleteAccountData: (key: string) => Promise<void>): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/auth/')) return null;
  if (!env.AUTH_DB) return json({ error: '账号服务尚未配置，请联系管理员' }, 503);
  const db = env.AUTH_DB; const secure = url.protocol === 'https:';
  const path = url.pathname.slice('/api/auth/'.length);
  if (request.method === 'GET' && path === 'me') {
    const user = await currentUser(db, request);
    return user ? json({ user: publicUser(user) }) : json({ error: '未登录' }, 401);
  }
  if (request.method !== 'POST') return json({ error: '请在 App 中提交验证信息' }, 405);
  const known = ['register', 'login', 'logout', 'delete-account', 'resend-verification', 'verify-email', 'forgot-password', 'reset-password'];
  if (!known.includes(path)) return json({ error: '没有这个认证接口' }, 404);
  // CF supplies this header in production; clients cannot override it at the edge.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  await rateLimit(db, 'auth-ip', ip, 100, 60000);
  if (path === 'logout') {
    const token = cookieValue(request, 'meow_auth');
    if (token) await db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await digest(token)).run();
    const response = json({ ok: true });
    response.headers.append('Set-Cookie', sessionCookie('', secure, 0));
    return response;
  }
  const input = await readAuthBody(request);
  if (path === 'delete-account') {
    if (input.confirmation !== 'DELETE') throw new DomainError('请确认永久删除账号和全部数据');
    const account = await currentUser(db, request);
    if (!account) throw new DomainError('请先登录', 401);
    await rateLimit(db, 'delete-account-user', account.id, 5, 15 * 60000);
    const password = validatePassword(input.password);
    const credentials = await db.prepare('SELECT password_hash AS passwordHash, password_salt AS passwordSalt FROM auth_users WHERE id = ?')
      .bind(account.id).first<{ passwordHash: string; passwordSalt: string }>();
    if (!credentials || !await verifyPassword(password, credentials.passwordSalt, credentials.passwordHash))
      throw new DomainError('密码不正确，账号没有删除', 400);
    await deleteAccountData(account.accountKey);
    const limitScopes = ['mail-email', 'login-email', 'verify-email-email', 'reset-password-email'];
    const statements = await Promise.all(limitScopes.map(async scope =>
      db.prepare('DELETE FROM auth_limits WHERE key = ?').bind(await digest(scope + ':' + account.email))));
    statements.push(db.prepare('DELETE FROM auth_limits WHERE key = ?').bind(await digest('delete-account-user:' + account.id)));
    statements.push(db.prepare('DELETE FROM auth_users WHERE id = ?').bind(account.id));
    await db.batch(statements);
    // D1 may include cascaded sessions/tokens in the reported change count, so
    // verify the intended outcome instead of requiring exactly one changed row.
    if (await db.prepare('SELECT id FROM auth_users WHERE id = ?').bind(account.id).first())
      throw new DomainError('账号删除未完成，请联系客服', 503);
    const response = json({ message: '账号和云端数据已永久删除。Google Play 订阅需在 Play 商店中单独取消。' });
    response.headers.append('Set-Cookie', sessionCookie('', secure, 0));
    response.headers.append('Set-Cookie', 'meow_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + (secure ? '; Secure' : ''));
    return response;
  }
  const email = normalizeEmail(input.email);
  if (path === 'register' && isMainlandRegistrationEmail(email))
    throw new DomainError(MAINLAND_EMAIL_REGISTRATION_MESSAGE);
  if (['register', 'resend-verification', 'forgot-password'].includes(path)) {
    mailSettings(env);
    await rateLimit(db, 'mail-ip', ip, 20, 3600000);
    await rateLimit(db, 'mail-email', email, 3, 15 * 60000);
  } else await rateLimit(db, path + '-email', email, 10, 15 * 60000);
  let user = await db.prepare(userSql).bind(email).first<UserRow>();
  if (path === 'register') {
    const password = validatePassword(input.password);
    if (user) return json({ message: '如果邮箱尚未注册，验证邮件已发送。已有账号请登录，或点击重新发送验证邮件。' }, 202);
    let legacyKey: string | null = null;
    const recoveryCode = typeof input.recoveryCode === 'string' ? input.recoveryCode.trim() : '';
    if (recoveryCode) {
      if (!/^meow-[a-f0-9]{64}$/.test(recoveryCode)) throw new DomainError('旧账号恢复码格式不正确');
      legacyKey = recoveryCode.slice(5);
    } else if (input.migrateCurrent === true) {
      const cookie = cookieValue(request, 'meow_session');
      if (cookie && /^[a-f0-9]{64}$/.test(cookie)) legacyKey = cookie;
    }
    if (legacyKey) {
      if (!await legacyExists(legacyKey)) throw new DomainError('没有找到旧账号，请检查恢复码');
      if (await db.prepare('SELECT id FROM auth_users WHERE account_key = ?').bind(legacyKey).first())
        throw new DomainError('旧账号已绑定邮箱，请使用原邮箱登录', 409);
    }
    const id = crypto.randomUUID(); const now = Date.now(); const passwordData = await hashPassword(password);
    await db.prepare(`INSERT INTO auth_users (id, email, password_hash, password_salt, account_key, pending_legacy_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING`)
      .bind(id, email, passwordData.hash, passwordData.salt, id, legacyKey, now, now).run();
    user = await db.prepare(userSql).bind(email).first<UserRow>();
    if (user?.id === id) await issueToken(db, env, user, 'verify');
    return json({ message: '请查收验证邮件，验证邮箱后即可登录。' }, 202);
  }
  if (path === 'resend-verification' || path === 'forgot-password') {
    if (user && (path === 'forgot-password' || !user.emailVerified))
      await issueToken(db, env, user, path === 'forgot-password' ? 'reset' : 'verify');
    return json({ message: genericMail });
  }
  if (path === 'login') {
    const password = validatePassword(input.password);
    // Run an equally expensive derivation even when the email is unknown.
    const valid = await verifyPassword(password, user?.passwordSalt ?? 'AAAAAAAAAAAAAAAAAAAAAA', user?.passwordHash ?? 'x'.repeat(43));
    if (!user || !valid) throw new DomainError('邮箱或密码不正确', 401);
    if (!user.emailVerified) throw new DomainError('请先验证邮箱；未收到邮件可点击重新发送', 403);
    const token = randomToken();
    // Guard against concurrent password reset between password verification and session insert.
    const inserted = await db.prepare(`INSERT INTO auth_sessions (token_hash, user_id, expires_at)
      SELECT ?, id, ? FROM auth_users WHERE id = ? AND password_hash = ? AND email_verified = 1`)
      .bind(await digest(token), Date.now() + 30 * 86400000, user.id, user.passwordHash).run();
    if (inserted.meta.changes !== 1) throw new DomainError('密码已变更，请重新登录', 401);
    const response = json({ user: publicUser(user) });
    response.headers.append('Set-Cookie', sessionCookie(token, secure));
    response.headers.append('Set-Cookie', 'meow_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + (secure ? '; Secure' : ''));
    return response;
  }
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new DomainError('验证凭证格式不正确');
  const tokenHash = await digest(token); const now = Date.now();
  if (!user) throw new DomainError('凭证无效或已过期');
  if (path === 'verify-email') {
    // Require the chosen password too, preventing account pre-registration attacks.
    const password = validatePassword(input.password);
    if (!await verifyPassword(password, user.passwordSalt, user.passwordHash))
      throw new DomainError('邮箱、密码或验证凭证不正确', 400);
    if (user.pendingLegacyKey && await db.prepare('SELECT id FROM auth_users WHERE account_key = ? AND id != ?').bind(user.pendingLegacyKey, user.id).first())
      throw new DomainError('旧账号已绑定其他邮箱，请联系支持处理', 409);
    const results = await db.batch([
      db.prepare(`UPDATE auth_users SET email_verified = 1, account_key = COALESCE(pending_legacy_key, account_key), pending_legacy_key = NULL, updated_at = ?
        WHERE id = ? AND email_verified = 0 AND EXISTS
        (SELECT 1 FROM auth_tokens WHERE token_hash = ? AND user_id = auth_users.id AND kind = 'verify' AND expires_at > ?)`)
        .bind(now, user.id, tokenHash, now),
      db.prepare(`DELETE FROM auth_tokens WHERE user_id = ? AND kind = 'verify'
        AND EXISTS (SELECT 1 FROM auth_users WHERE id = ? AND email_verified = 1)`).bind(user.id, user.id),
    ]);
    if (results[0].meta.changes !== 1) throw new DomainError('验证凭证无效、已使用或已过期');
    return json({ message: '邮箱验证成功，请使用邮箱和密码登录。' });
  }
  const password = validatePassword(input.password);
  const passwordData = await hashPassword(password);
  // D1 batch is transactional. All mutations are conditional on the same live token.
  const results = await db.batch([
    db.prepare(`DELETE FROM auth_sessions WHERE user_id = ? AND EXISTS
      (SELECT 1 FROM auth_tokens WHERE token_hash = ? AND user_id = ? AND kind = 'reset' AND expires_at > ?)`)
      .bind(user.id, tokenHash, user.id, now),
    db.prepare(`UPDATE auth_users SET password_hash = ?, password_salt = ?, updated_at = ?, email_verified = 1, pending_legacy_key = NULL WHERE id = ?
      AND EXISTS (SELECT 1 FROM auth_tokens WHERE token_hash = ? AND user_id = auth_users.id AND kind = 'reset' AND expires_at > ?)`)
      .bind(passwordData.hash, passwordData.salt, now, user.id, tokenHash, now),
    db.prepare(`DELETE FROM auth_tokens WHERE user_id = ? AND EXISTS
      (SELECT 1 FROM auth_tokens WHERE token_hash = ? AND user_id = ? AND kind = 'reset' AND expires_at > ?)`)
      .bind(user.id, tokenHash, user.id, now),
  ]);
  if (results[1].meta.changes !== 1) throw new DomainError('重置凭证无效、已使用或已过期');
  const response = json({ message: '密码已重置，所有设备的旧会话已退出，请重新登录。' });
  response.headers.append('Set-Cookie', sessionCookie('', secure, 0));
  return response;
}
