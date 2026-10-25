import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRuntime } from './runtime.mjs';

test('bedtime API fixes duration and rewards, supports pre-start edits and forbids early release', async () => {
  const server = await createRuntime();
  try {
    const email = crypto.randomUUID() + '@example.com', password = 'Bedtime test password 2026';
    await server.seedUser(email, password);
    let cookie;
    const request = (path, data, method = data ? 'POST' : 'GET') => server.runtime.dispatchFetch('http://127.0.0.1:8787/api/' + path, {
      method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined,
    });
    const login = await request('auth/login', { email, password }); assert.equal(login.status, 200);
    cookie = login.headers.getSetCookie().find(c => c.startsWith('meow_auth=')).split(';')[0];
    const input = { kind: 'bedtime', title: 'custom', scheduledAt: new Date(Date.now() + 60000).toISOString(), reward: 500, duration: 1, key: crypto.randomUUID(), saveTemplate: true };
    const created = await request('tasks', input); assert.equal(created.status, 200);
    const { task, state } = await created.json();
    assert.equal(task.kind, 'bedtime'); assert.equal(task.reward, 0); assert.equal(task.penalty, 0); assert.equal(task.title, '按时睡觉');
    assert.equal(task.proof, ''); assert.equal(state.reminderCredits, 2); assert.equal(state.templates.length, 4);
    assert.equal((await (await request('tasks', input)).json()).state.reminderCredits, 2);
    assert.equal((await request('tasks', { ...input, key: crypto.randomUUID() })).status, 409);
    const edit = await request(`tasks/${task.id}/schedule`, { scheduledAt: new Date(Date.now() + 6500).toISOString() }, 'PATCH');
    assert.equal(edit.status, 200); assert.equal((await edit.json()).state.reminderCredits, 2);
    assert.equal((await request(`tasks/${task.id}/escape`, { confirm: true })).status, 409);
    const form = new FormData(); form.set('storage', 'local'); form.set('confirmed', 'true'); form.set('hash', 'a'.repeat(64));
    const proof = await server.runtime.dispatchFetch(`http://127.0.0.1:8787/api/tasks/${task.id}/proof`, { method: 'POST', headers: { Cookie: cookie }, body: form });
    assert.equal(proof.status, 409);
    await new Promise(resolve => setTimeout(resolve, 6600));
    const active = await (await request('state')).json(); assert.equal(active.state.tasks[0].status, 'sleeping');
    const tooLate = await request(`tasks/${task.id}/schedule`, { scheduledAt: new Date(Date.now() + 60000).toISOString() }, 'PATCH');
    assert.equal(tooLate.status, 409);
    assert.equal((await request(`tasks/${task.id}/escape`, { confirm: true })).status, 409);
  } finally { await server.runtime.dispose(); }
});
