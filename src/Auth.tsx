import { useEffect, useState, type FormEvent } from 'react';
import App from './App';
import { clearLocalPhotos, nativeMessage } from './api';
import { isMainlandRegistrationEmail, MAINLAND_EMAIL_REGISTRATION_MESSAGE } from '../shared/email-policy';
import './auth.css';

export interface AccountUser { id: string; email: string; emailVerified: boolean }
type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';
async function authRequest(path: string, data?: Record<string, unknown>) {
  const response = await fetch('/api/auth/' + path, {
    method: data ? 'POST' : 'GET', credentials: 'same-origin',
    headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json() as { user?: AccountUser; message?: string; error?: string };
  if (!response.ok) throw new Error(result.error || '暂时无法连接账号服务，请稍后重试');
  return result;
}
function clearNativeAccount() {
  nativeMessage('disableGuard');
  nativeMessage('sync', { tasks: [] });
}
function readIncomingLink() {
  const params = new URLSearchParams(location.hash.slice(1));
  const action = params.get('auth');
  const result = { mode: action === 'verify' || action === 'reset' ? action as Mode : 'login' as Mode, token: params.get('token') ?? '' };
  return result;
}
export default function AuthRoot() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [link, setLink] = useState(readIncomingLink);
  const [handledLink, setHandledLink] = useState(false);
  useEffect(() => {
    const handleHash = () => {
      const next = readIncomingLink();
      if (next.mode !== 'login' || next.token) {
        setLink(next); setHandledLink(false);
        history.replaceState(null, '', location.pathname + location.search);
      }
    };
    window.addEventListener('hashchange', handleHash);
    if (new URLSearchParams(location.hash.slice(1)).has('auth'))
      history.replaceState(null, '', location.pathname + location.search);
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (!active) return;
        if (response.status === 401) { clearNativeAccount(); return; }
        const result = await response.json() as { user?: AccountUser; error?: string };
        if (!response.ok) throw new Error(result.error || '账号服务暂时不可用');
        if (active) setUser(result.user ?? null);
      } catch (e) { if (active) setError((e as Error).message); }
      finally { if (active) setChecking(false); }
    })();
    const expired = () => { clearNativeAccount(); setUser(null); setError('登录已过期，请重新登录'); };
    window.addEventListener('meowAuthExpired', expired);
    return () => { active = false; window.removeEventListener('meowAuthExpired', expired); window.removeEventListener('hashchange', handleHash); };
  }, []);
  const logout = async () => {
    await authRequest('logout', {});
    clearNativeAccount(); setUser(null); setError('');
  };
  const deleteAccount = async (password: string) => {
    await authRequest('delete-account', { password, confirmation: 'DELETE' });
    await clearLocalPhotos().catch(() => undefined);
    nativeMessage('deleteAccount');
    setUser(null); setError('账号和云端数据已永久删除。'); setHandledLink(true);
  };
  // Email links always show their explicit action, even if another account is signed in.
  if (checking) return <main className="auth-shell"><p role="status">正在连接ShutterCat…</p></main>;
  if (user && (link.mode === 'login' || handledLink)) return <App key={user.id} user={user} onLogout={logout} onDeleteAccount={deleteAccount}/>;
  return <AuthForm key={`${link.mode}:${link.token}`} initialMode={handledLink ? 'login' : link.mode} initialToken={handledLink ? '' : link.token} initialError={error}
    onLogin={account => { setUser(account); setError(''); setHandledLink(true); }}
    onLinkDone={() => { setHandledLink(true); setUser(null); }}/>;
}
function AuthForm({ initialMode, initialToken, initialError, onLogin, onLinkDone }: {
  initialMode: Mode; initialToken: string; initialError: string; onLogin: (user: AccountUser) => void; onLinkDone: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [token, setToken] = useState(initialToken);
  const [migrateCurrent, setMigrateCurrent] = useState(true);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialError);
  useEffect(() => { if (initialError) setMessage(initialError); }, [initialError]);
  const title = { login: '欢迎回到ShutterCat', register: '创建ShutterCat账号', verify: '验证你的邮箱', forgot: '找回密码', reset: '设置新密码' }[mode];
  const action = { login: '登录', register: '注册并发送验证邮件', verify: '验证邮箱', forgot: '发送重置邮件', reset: '重置密码' }[mode];
  const switchMode = (next: Mode) => { setMode(next); setMessage(''); setPassword(''); setConfirm(''); setToken(''); };
  const resend = async () => {
    if (busy) return;
    setBusy(true); setMessage('');
    try { setMessage((await authRequest('resend-verification', { email })).message ?? '邮件已发送'); }
    catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (mode === 'register' && isMainlandRegistrationEmail(email)) { setMessage(MAINLAND_EMAIL_REGISTRATION_MESSAGE); return; }
    if ((mode === 'register' || mode === 'reset') && password !== confirm) { setMessage('两次输入的密码不一致'); return; }
    setBusy(true); setMessage('');
    try {
      const endpoint = { login: 'login', register: 'register', verify: 'verify-email', forgot: 'forgot-password', reset: 'reset-password' }[mode];
      const result = await authRequest(endpoint, { email, password, token, migrateCurrent, recoveryCode });
      if (mode === 'login' && result.user) { onLogin(result.user); return; }
      setMessage(result.message ?? '操作成功');
      if (mode === 'register') setMode('verify');
      else if (mode === 'forgot') { setMode('reset'); setPassword(''); setConfirm(''); }
      else if (mode === 'verify' || mode === 'reset') {
        setMode('login'); setToken(''); setPassword(''); setConfirm(''); onLinkDone();
      }
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  };
  return <main className="auth-shell"><section className="auth-card" aria-labelledby="auth-title">
    <div className="auth-brand"><img src="/favicon.png" alt=""/>ShutterCat <small>SHUTTERCAT</small></div>
    <h1 id="auth-title">{title}</h1><p className="auth-intro">给开始一点陪伴，让每一步都有记录。</p>
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <label htmlFor="auth-email">邮箱</label><input id="auth-email" type="email" autoComplete="username" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)}/>
        {mode !== 'forgot' && <><label htmlFor="auth-password">{mode === 'reset' ? '新密码' : '密码'}</label>
          <input id="auth-password" type="password" autoComplete={mode === 'register' || mode === 'reset' ? 'new-password' : 'current-password'} minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)}/>
          <p className="auth-hint">12–128 位，建议使用较长且独立的密码。</p></>}
        {(mode === 'register' || mode === 'reset') && <><label htmlFor="auth-confirm">确认密码</label><input id="auth-confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirm} onChange={e => setConfirm(e.target.value)}/></>}
        {(mode === 'verify' || mode === 'reset') && <><label htmlFor="auth-token">邮件中的验证凭证</label><input id="auth-token" autoComplete="off" spellCheck={false} required maxLength={100} value={token} onChange={e => setToken(e.target.value)}/>
          <p className="auth-hint">请填写对应邮箱。可从邮件复制凭证回到 App；凭证 30 分钟内有效。</p></>}
        {mode === 'register' && <details className="auth-legacy"><summary>已有旧版匿名账号？</summary>
          <label className="auth-checkbox"><input type="checkbox" checked={migrateCurrent} onChange={e => setMigrateCurrent(e.target.checked)}/>绑定本设备的旧账号数据（如果存在）</label>
          <label htmlFor="auth-legacy-code">旧账号恢复码（可选）</label><input id="auth-legacy-code" type="password" autoComplete="off" value={recoveryCode} onChange={e => setRecoveryCode(e.target.value)}/>
          <p className="auth-hint">换机可填写旧恢复码。验证邮箱后绑定原任务、喵币和订阅；本地照片仍保留在原设备。</p>
        </details>}
        {mode === 'register' && <p className="auth-hint">注册后需先验证邮箱，才能登录使用。中国大陆邮箱（包括 .cn、QQ、163、126、139 等）不能用于注册。</p>}
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="primary full" type="submit" disabled={busy}>{busy ? '正在处理…' : action}</button>
      </fieldset>
    </form>
    <nav className="auth-links" aria-label="账号操作">
      {mode !== 'login' && <button disabled={busy} onClick={() => switchMode('login')}>返回登录</button>}
      {mode === 'login' && <><button disabled={busy} onClick={() => switchMode('register')}>注册账号</button><button disabled={busy} onClick={() => switchMode('forgot')}>忘记密码</button><button disabled={busy} onClick={() => switchMode('verify')}>验证邮箱</button></>}
      {mode === 'verify' && <><button disabled={busy || !email} onClick={() => void resend()}>重新发送验证邮件</button><button disabled={busy} onClick={() => switchMode('register')}>注册账号</button></>}
      {mode === 'reset' && <button disabled={busy} onClick={() => switchMode('forgot')}>重新获取重置邮件</button>}
    </nav>
  </section></main>;
}
