import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEDTIME_DURATION_MS, rescheduleBedtime, CATS, DRAW_COST, PENALTY, REWARD, categoryFor, defaultProof, drawCat, initialState, normalizeCatCollection, markDue, resolveTask, type Task } from '../shared/domain';

const scheduled = (id: string, at: string): Task => ({ id, title: '写论文', category: 'study', scheduledAt: at, status: 'scheduled', proof: defaultProof('写论文'), proofMode: 'default', reward: REWARD, penalty: PENALTY, createdAt: '2026-01-01T00:00:00Z' });

test('bedtime crosses midnight, ends at six hours after scheduled start, and never rewards retries', () => {
  const state = initialState(); const at = Date.parse('2026-10-20T23:00:00+08:00');
  const task: Task = { ...scheduled('sleep', new Date(at).toISOString()), kind: 'bedtime', reward: 0, penalty: 0 };
  state.tasks.push(task, scheduled('ordinary', new Date(at).toISOString()));
  markDue(state, at - 1); assert.equal(task.status, 'scheduled');
  markDue(state, at); assert.equal(task.status, 'sleeping');
  assert.throws(() => resolveTask(state, task.id, 'started', new Date(at + 1).toISOString()), /不能提前/);
  assert.throws(() => resolveTask(state, task.id, 'escaped', new Date(at + 1).toISOString()), /不能提前/);
  markDue(state, at + BEDTIME_DURATION_MS - 1); assert.equal(task.status, 'sleeping');
  markDue(state, at + BEDTIME_DURATION_MS); assert.equal(task.status, 'slept');
  assert.equal(task.completedAt, new Date(at + BEDTIME_DURATION_MS).toISOString());
  markDue(state, at + BEDTIME_DURATION_MS * 2);
  assert.equal(state.coins, 200); assert.equal(state.ledger.length, 1);
  assert.equal(state.tasks[1].status, 'waiting_proof');
});
test('bedtime rescheduling is allowed only before start, rejects overlaps and invalid dates', () => {
  const state = initialState(); const now = Date.parse('2026-10-20T10:00:00Z');
  state.tasks.push({ ...scheduled('sleep', new Date(now + 60000).toISOString()), kind: 'bedtime' });
  rescheduleBedtime(state, 'sleep', now + 120000, now);
  assert.equal(state.tasks[0].scheduledAt, new Date(now + 120000).toISOString());
  assert.throws(() => rescheduleBedtime(state, 'sleep', NaN, now));
  assert.throws(() => rescheduleBedtime(state, 'sleep', now, now));
  state.tasks.push({ ...scheduled('sleep2', new Date(now + 240000).toISOString()), kind: 'bedtime' });
  assert.throws(() => rescheduleBedtime(state, 'sleep', now + 180000, now), /重叠/);
  assert.throws(() => rescheduleBedtime(state, 'sleep', now + 360000, now + 120000), /尚未开始/);
  markDue(state, now + BEDTIME_DURATION_MS * 2);
  assert.equal(state.tasks[1].status, 'slept');
});

test('task only becomes pending at its scheduled time, with no automatic timeout punishment', () => {
  const state = initialState();
  state.tasks.push(scheduled('t1', '2026-01-02T09:00:00Z'));
  markDue(state, Date.parse('2026-01-02T08:59:59Z'));
  assert.equal(state.tasks[0].status, 'scheduled');
  markDue(state, Date.parse('2026-01-02T09:00:00Z'));
  assert.equal(state.tasks[0].status, 'waiting_proof');
  markDue(state, Date.parse('2026-02-01T09:00:00Z'));
  assert.equal(state.tasks[0].status, 'waiting_proof');
  assert.equal(state.coins, 200);
});

test('completion is idempotent and never rewards a future task', () => {
  const state = initialState(); state.tasks.push(scheduled('t1', '2026-01-02T09:00:00Z'));
  assert.throws(() => resolveTask(state, 't1', 'started', '2026-01-02T08:00:00Z'), /还没到/);
  resolveTask(state, 't1', 'started', '2026-01-02T09:01:00Z');
  resolveTask(state, 't1', 'started', '2026-01-02T09:02:00Z');
  assert.equal(state.coins, 200 + REWARD);
  assert.equal(state.ledger.filter(e => e.taskId === 't1').length, 1);
  assert.equal(state.tasks[0].completedAt, '2026-01-02T09:01:00Z');
  assert.throws(() => resolveTask(state, 't1', 'escaped', '2026-01-02T09:03:00Z'), /已经处理/);
});

test('escape is idempotent, permits a negative balance, and does not resolve other pending tasks', () => {
  const state = initialState(); state.coins = 0;
  state.tasks.push(scheduled('t1', '2026-01-01T09:00:00Z'), scheduled('t2', '2026-01-01T09:00:00Z'));
  resolveTask(state, 't1', 'escaped', '2026-01-02T09:00:00Z');
  resolveTask(state, 't1', 'escaped', '2026-01-02T09:00:00Z');
  assert.equal(state.coins, -PENALTY);
  assert.equal(state.tasks[1].status, 'waiting_proof');
  assert.throws(() => resolveTask(state, 't1', 'started', '2026-01-02T09:00:00Z'));
});

test('draw is idempotent, never repeats owned cats, and rejects insufficient funds', () => {
  const state = initialState();
  const cat = drawCat(state, 'draw-1', 0);
  assert.equal(state.coins, 200 - DRAW_COST);
  assert.equal(drawCat(state, 'draw-1', .99), cat);
  assert.equal(state.coins, 200 - DRAW_COST);
  const other = drawCat(state, 'draw-2', 0);
  assert.notEqual(other, cat);
  assert.equal(state.coins, 0);
  assert.throws(() => drawCat(state, 'draw-3', .5), /还需要/);
  assert.equal(state.ownedCats.length, 3);
});

test('full collection cannot spend coins, object prototype names are not cached draws', () => {
  const state = initialState();
  const cat = drawCat(state, 'toString', 0);
  assert.equal(typeof cat, 'string');
  state.ownedCats = CATS.map(c => c.id);
  const before = state.coins;
  assert.throws(() => drawCat(state, 'new-draw', .3), /集齐/);
  assert.equal(state.coins, before);
});

test('default proof follows the task content and supports an unknown activity', () => {
  assert.match(defaultProof('写论文'), /第一句话/);
  assert.match(defaultProof('健身'), /运动鞋/);
  assert.match(defaultProof('照顾植物'), /照顾植物/);
  assert.equal(categoryFor('读书'), 'study');
});

test('cat collection has five cats and migrates removed berry entries', () => {
  assert.equal(CATS.length, 5);
  const state = initialState();
  state.ownedCats = ['berry', 'cloud', 'cloud'];
  state.activeCat = 'berry';
  state.drawKeys = { old: 'berry' };
  normalizeCatCollection(state);
  assert.deepEqual(state.ownedCats, ['cloud']);
  assert.equal(state.activeCat, 'cloud');
  assert.deepEqual(state.drawKeys, { old: 'cloud' });
  assert.equal(drawCat(state, 'old', .99), 'cloud');
  assert.equal(state.coins, 200);
});
