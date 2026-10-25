import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

export async function createRuntime({ port, testControls = false } = {}) {
  const mail = []; const mailRequests = []; let failMail = false;
  const built = await build({
    stdin: {
      contents: testControls
        ? "import worker from './worker/index'; export { MeowUser } from './worker/index'; export default { fetch(r,e,c) { return new URL(r.url).pathname.startsWith('/__test__/') ? e.TEST_CONTROL.fetch(r) : worker.fetch(r,e,c); } };"
        : "export { default, MeowUser } from './worker/index';",
      resolveDir: process.cwd(), sourcefile: 'test-worker.ts', loader: 'ts',
    },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['cloudflare:workers'],
  });
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: built.outputFiles[0].text,
    compatibilityDate: '2026-09-01', host: '127.0.0.1', port: port ?? 0,
    bindings: { BREVO_API_KEY: 'test-only-no-real-mail', AUTH_FROM_EMAIL: 'ShutterCat <test@example.com>', PUBLIC_APP_URL: 'http://127.0.0.1:' + (port ?? 8787) },
    d1Databases: ['AUTH_DB'],
    durableObjects: { MEOW_USERS: { className: 'MeowUser', useSQLite: true } },
    outboundService: async request => {
      if (request.url !== 'https://api.brevo.com/v3/smtp/email') throw new Error('Unexpected outbound request: ' + request.url);
      if (failMail) return new Response('unavailable', { status: 503 });
      if (request.headers.get('api-key') !== 'test-only-no-real-mail') throw new Error('Missing Brevo API key');
      const body = await request.json();
      if (body.sender?.email !== 'test@example.com' || body.sender?.name !== 'ShutterCat') throw new Error('Invalid Brevo sender');
      mailRequests.push({ apiKey: request.headers.get('api-key'), accept: request.headers.get('Accept'), body });
      mail.push({ to: body.to.map(item => item.email), text: body.textContent });
      return Response.json({ messageId: 'test-message' }, { status: 201 });
    },
    serviceBindings: {
      ASSETS: async request => {
        const pathname = decodeURIComponent(new URL(request.url).pathname);
        const root = path.resolve('dist');
        let file = path.resolve(root, '.' + pathname);
        if (!file.startsWith(root + path.sep) && file !== root) return new Response('Not found', { status: 404 });
        if (pathname === '/' || !path.extname(pathname)) file = path.join(root, 'index.html');
        try {
          const bytes = await readFile(file);
          const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
          return new Response(bytes, { headers: { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' } });
        } catch { return new Response('Not found', { status: 404 }); }
      },
      ...(testControls ? { TEST_CONTROL: async request => {
        const route = new URL(request.url).pathname;
        if (route === '/__test__/seed' && request.method === 'POST') {
          const input = await request.json();
          const id = await seedUser(input.email, input.password);
          return Response.json({ id });
        }
        if (route === '/__test__/mail') {
          const email = new URL(request.url).searchParams.get('email');
          const message = mail.filter(item => item.to.includes(email)).at(-1);
          return Response.json({ text: message?.text ?? '' });
        }
        return new Response('Not found', { status: 404 });
      } } : {}),
    },
  }));
  const db = await runtime.getD1Database('AUTH_DB');
  const migration = await readFile('migrations/0001_auth.sql', 'utf8');
  await db.batch(migration.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  async function seedUser(email, password, accountKey) {
    const salt = randomBytes(16);
    const hash = pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('base64url');
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO auth_users (id, email, password_hash, password_salt, email_verified, account_key, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)')
      .bind(id, email, hash, salt.toString('base64url'), accountKey ?? id, Date.now(), Date.now()).run();
    return id;
  }
  return { runtime, db, mail, mailRequests, seedUser, failMail: value => { failMail = value; } };
}
