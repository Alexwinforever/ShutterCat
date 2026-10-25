import { BEDTIME_DURATION_MS, rescheduleBedtime, checkIn, consumeReminderCredit, normalizeReminderEntitlement, SUBSCRIPTION_PLANS } from '../shared/domain';
import { hash, playConfigured, verifyPlay, type PlayEnv } from './play';
import { currentUser, type AuthEnv } from './auth';
import { authRoutes } from './auth-routes';
import { DurableObject } from 'cloudflare:workers';
import { CATS, DomainError, PENALTY, REWARD, categoryFor, defaultProof, drawCat, initialState, markDue, normalizeCatCollection, resolveTask, type Task, type UserState } from '../shared/domain';

interface Env extends PlayEnv, AuthEnv { MEOW_USERS: DurableObjectNamespace<MeowUser>; ASSETS: Fetcher }
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
function textField(value: unknown, max = 300): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new DomainError('请检查填写的内容和长度');
  return value.trim();
}
async function body(request: Request) {
  const raw = await request.text();
  if (raw.length > 12000) throw new DomainError('请求过大', 413);
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { throw new DomainError('请求格式不正确'); }
}

export class MeowUser extends DurableObject<Env> {
  async refreshSubscription(state: UserState, accountId: string) {
    const tokens = await this.ctx.storage.get<string[]>('playTokens') ?? [];
    if (tokens.length && !playConfigured(this.env)) throw new DomainError('Google Play 支付尚未配置', 503);
    const verified = [];
    for (const token of tokens) { const result = await verifyPlay(this.env, token, accountId); if (result) verified.push(result); }
    state.subscription = verified.sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt))[0];
  }
  async fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        const internalPath = new URL(request.url).pathname;
        if (internalPath === '/internal/exists') return json({ exists: Boolean(await this.ctx.storage.get('state')) });
        if (internalPath === '/internal/delete-account' && request.method === 'DELETE') {
          await this.ctx.storage.deleteAll();
          return json({ ok: true });
        }
        const state = normalizeReminderEntitlement(normalizeCatCollection(await this.ctx.storage.get<UserState>('state') ?? initialState()));
        const accountId = request.headers.get('X-Meow-Account')!;
        const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
        const url = new URL(request.url);
        const path = url.pathname.replace('/api', '');
        markDue(state);
        let extra: Record<string, unknown> = {};
        if (request.method === 'GET' && path.startsWith('/proofs/')) {
          throw new DomainError('照片仅保存在提交时的设备', 404);
        }
        if (request.method === 'GET' && path === '/state') {
          // Materialize overdue tasks whenever the client reconnects; no automatic punishment.
        } else if (request.method === 'GET' && path === '/billing') {
          await this.refreshSubscription(state, accountId);
          extra = { accountId, today, paymentReady: playConfigured(this.env), plans: SUBSCRIPTION_PLANS };
        } else if (request.method === 'POST' && path === '/check-in') {
          extra = { rewarded: checkIn(state, today), today };
        } else if (request.method === 'POST' && path === '/billing/verify') {
          const input = await body(request);
          const token = textField(input.purchaseToken, 4096);
          const result = await verifyPlay(this.env, token, accountId);
          if (!result) throw new DomainError('该订阅尚未生效或已经到期', 409);
          const tokens = await this.ctx.storage.get<string[]>('playTokens') ?? [];
          if (!tokens.includes(token)) {
            if (tokens.length >= 20) throw new DomainError('订阅记录已达上限，请联系支持', 409);
            tokens.push(token);
          }
          await this.ctx.storage.put('playTokens', tokens);
          state.subscription = result;
          extra = { today };
        } else if (request.method === 'POST' && path === '/tasks') {
          const input = await body(request);
          const creationKey = input.key === undefined ? undefined : textField(input.key, 80);
          if (creationKey) {
            const existing = state.tasks.find(task => task.creationKey === creationKey);
            if (existing) return json({ state, task: existing });
          }
          if (input.kind !== undefined && input.kind !== 'photo' && input.kind !== 'bedtime') throw new DomainError('任务类型无效');
          const bedtime = input.kind === 'bedtime';
          const title = bedtime ? '按时睡觉' : textField(input.title, 80);
          const at = Date.parse(textField(input.scheduledAt, 40));
          if (!Number.isFinite(at) || at < Date.now() + 5000 || at > Date.now() + 366 * 86400000) throw new DomainError('请选择未来一年内的开始时间');
          if (state.tasks.length >= 2000) throw new DomainError('任务数量已达到 MVP 上限');
          if (bedtime && state.tasks.some(t => t.kind === 'bedtime' && (t.status === 'scheduled' || t.status === 'sleeping')
            && at < Date.parse(t.scheduledAt) + BEDTIME_DURATION_MS && at + BEDTIME_DURATION_MS > Date.parse(t.scheduledAt)))
            throw new DomainError('睡眠任务的六小时时段不能重叠', 409);
          const mode = !bedtime && input.proofMode === 'custom' ? 'custom' : 'default';
          const task: Task = {
            id: crypto.randomUUID(), creationKey, kind: bedtime ? 'bedtime' : 'photo', title, scheduledAt: new Date(at).toISOString(), proofMode: mode,
            proof: bedtime ? '' : mode === 'custom' ? textField(input.proof) : defaultProof(title),
            category: bedtime ? 'life' : categoryFor(title), status: 'scheduled', reward: bedtime ? 0 : REWARD, penalty: bedtime ? 0 : PENALTY, createdAt: new Date().toISOString(),
          };
          await this.refreshSubscription(state, accountId);
          consumeReminderCredit(state);
          state.tasks.push(task);
          if (!bedtime && input.saveTemplate === true && !state.templates.some(t => t.title === title && t.proof === task.proof)) {
            if (state.templates.length >= 100) throw new DomainError('常用任务最多保存 100 项');
            state.templates.push({ id: crypto.randomUUID(), title, category: task.category, proof: task.proof, proofMode: mode });
          }
          extra = { task };
        } else if (request.method === 'PATCH' && /^\/tasks\/[^/]+\/schedule$/.test(path)) {
          const input = await body(request);
          extra = { task: rescheduleBedtime(state, path.split('/')[2], Date.parse(textField(input.scheduledAt, 40))) };
        } else if (request.method === 'DELETE' && path.startsWith('/templates/')) {
          state.templates = state.templates.filter(t => t.id !== path.split('/')[2]);
        } else if (request.method === 'POST' && /^\/tasks\/[^/]+\/escape$/.test(path)) {
          const input = await body(request);
          if (input.confirm !== true) throw new DomainError('请先确认接受惩罚');
          resolveTask(state, path.split('/')[2], 'escaped');
        } else if (request.method === 'POST' && /^\/tasks\/[^/]+\/proof$/.test(path)) {
          const id = path.split('/')[2];
          const task = state.tasks.find(t => t.id === id);
          if (!task) throw new DomainError('任务不存在', 404);
          if (task.kind === 'bedtime') throw new DomainError('睡眠任务无需照片，六小时后自动结束，不能提前解除', 409);
          if (task.status === 'started') return json({ state });
          if (task.status !== 'waiting_proof') throw new DomainError('当前任务不能提交照片', 409);
          const form = await request.formData();
          if (form.get('confirmed') !== 'true') throw new DomainError('请确认照片展示了你的开始行动');
          const storage = form.get('storage');
          const hash = form.get('hash');
          if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new DomainError('照片摘要不正确');
          if (storage !== 'local' || form.has('photo')) throw new DomainError('照片仅支持本地保存，请更新 App');
          resolveTask(state, id, 'started');
          Object.assign(task, { proofStorage: 'local', proofHash: hash });
        } else if (request.method === 'DELETE' && path.startsWith('/proofs/')) {
          const task = state.tasks.find(t => t.id === path.split('/')[2]);
          if (!task) throw new DomainError('任务不存在', 404);
          delete task.proofKey; delete task.proofHash; delete task.proofStorage;
        } else if (request.method === 'POST' && path === '/draw') {
          const input = await body(request);
          const key = textField(input.key, 80);
          if (!/^[\w-]+$/.test(key)) throw new DomainError('抽取请求编号无效');
          const random = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
          extra = { catId: drawCat(state, key, random) };
        } else if (request.method === 'POST' && path === '/active-cat') {
          const input = await body(request);
          const id = textField(input.id, 30);
          if (!CATS.some(cat => cat.id === id) || !state.ownedCats.includes(id)) throw new DomainError('还没有获得这只猫猫');
          state.activeCat = id;
        } else throw new DomainError('没有这个接口', 404);
        await this.ctx.storage.put('state', state);
        return json({ state, ...extra });
      } catch (error) {
        if (error instanceof DomainError) return json({ error: error.message }, error.status);
        console.error('Request failed');
        return json({ error: '保存失败，请稍后重试。未确认成功前请保留当前照片。' }, 500);
      }
    });
  }
}


async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  const origin = request.headers.get('Origin');
  if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site')
    return json({ error: '请求来源不受支持' }, 403);
  if (Number(request.headers.get('Content-Length') ?? 0) > 6 * 1024 * 1024)
    return json({ error: '请求过大' }, 413);
  const authResponse = await authRoutes(request, env, async key => {
    const target = env.MEOW_USERS.get(env.MEOW_USERS.idFromName(key));
    const result = await (await target.fetch('https://internal/internal/exists')).json() as { exists: boolean };
    return result.exists;
  }, async key => {
    const target = env.MEOW_USERS.get(env.MEOW_USERS.idFromName(key));
    const response = await target.fetch('https://internal/internal/delete-account', { method: 'DELETE' });
    if (!response.ok) throw new DomainError('云端数据删除未完成，请稍后重试', 503);
  });
  if (authResponse) return authResponse;
  // The former recovery-code endpoints must never bypass email authentication.
  if (url.pathname.startsWith('/api/account/'))
    return json({ error: '请使用邮箱登录；旧恢复码仅用于注册时迁移数据' }, 410);
  if (!env.AUTH_DB) return json({ error: '账号服务尚未配置，请联系管理员' }, 503);
  const user = await currentUser(env.AUTH_DB, request);
  if (!user) return json({ error: '请先登录' }, 401);
  const stub = env.MEOW_USERS.get(env.MEOW_USERS.idFromName(user.accountKey));
  let payload: Uint8Array<ArrayBuffer> | undefined;
  if (request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 6 * 1024 * 1024) { await reader.cancel(); return json({ error: '请求过大' }, 413); }
      chunks.push(part.value);
    }
    payload = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { payload.set(chunk, offset); offset += chunk.byteLength; }
  }
  const headers = new Headers(request.headers);
  // Keep the original account key on migration so Play purchase ownership is preserved.
  headers.set('X-Meow-Account', await hash(user.accountKey));
  return stub.fetch(new Request(request.url, { method: request.method, headers, body: payload }));
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let response: Response;
    try { response = await route(request, env); }
    catch (error) {
      response = error instanceof DomainError
        ? json({ error: error.message }, error.status)
        : json({ error: '服务暂时不可用，请稍后重试' }, 503);
    }
    const result = new Response(response.body, response);
    result.headers.set('X-Content-Type-Options', 'nosniff');
    result.headers.set('Referrer-Policy', 'no-referrer');
    result.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (new URL(request.url).pathname.startsWith('/api/')) result.headers.set('Cache-Control', 'no-store');
    return result;
  },
} satisfies ExportedHandler<Env>;
