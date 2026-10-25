export const REWARD = 50;
export const PENALTY = 100;
export const DRAW_COST = 100;
export const STARTER_COINS = 200;
export const STARTER_REMINDER_CREDITS = 3;
export const CHECK_IN_DAYS = 7;
export const SUBSCRIPTION_PLANS = [
  { id: 'shuttercat_monthly', name: '月付', price: '$5', durationMonths: 1 },
  { id: 'shuttercat_quarterly', name: '季付', price: '$15', durationMonths: 3 },
  { id: 'shuttercat_yearly', name: '年付', price: '$30', durationMonths: 12 },
] as const;

export const BEDTIME_DURATION_MS = 6 * 60 * 60 * 1000;
export const BEDTIME_TEMPLATE: Template = { id: 'default-bedtime', kind: 'bedtime', title: '按时睡觉', category: 'life', proof: '', proofMode: 'default' };
export type TaskStatus = 'scheduled' | 'waiting_proof' | 'started' | 'escaped' | 'sleeping' | 'slept';
export type Category = 'work' | 'study' | 'move' | 'life';
export interface Task {
  kind?: 'photo' | 'bedtime';
  id: string; title: string; category: Category; scheduledAt: string;
  proof: string; proofMode: 'default' | 'custom'; status: TaskStatus;
  reward: number; penalty: number; createdAt: string; completedAt?: string;
  creationKey?: string; proofStorage?: 'local' | 'cloud'; proofKey?: string; proofHash?: string;
}
export interface Template { id: string; title: string; category: Category; proof: string; proofMode: 'default' | 'custom'; kind?: 'photo' | 'bedtime' }
export interface LedgerEntry { id: string; amount: number; title: string; createdAt: string; taskId?: string; catId?: string }
export interface UserState {
  version: 1; tasks: Task[]; templates: Template[]; coins: number;
  ledger: LedgerEntry[]; ownedCats: string[]; activeCat: string;
  drawKeys: Record<string, string>;
  reminderCredits: number;
  checkIn: { lastDate?: string; streak: number; rewardedWeeks: number };
  subscription?: { productId: string; expiresAt: string; tokenHash: string };
}
export const CATS = [
  { id: 'cloud', name: '云朵', note: '慢一点，也在向前', color: '#c6b9f5', light: '#eeebfa', accent: '#80709e', accessory: 'none' },
  { id: 'peach', name: '桃桃', note: '给每个开始一点甜', color: '#edb4aa', light: '#faeae6', accent: '#b77a78', accessory: 'flower' },
  { id: 'matcha', name: '抹茶', note: '陪你慢慢长大', color: '#b3cbb5', light: '#eaf1e9', accent: '#71987d', accessory: 'leaf' },
  { id: 'butter', name: '布丁', note: '今天也暖乎乎的', color: '#edcf92', light: '#faf2dd', accent: '#c29f64', accessory: 'star' },
  { id: 'moon', name: '晚安', note: '月亮会记得你的努力', color: '#a9b9d8', light: '#e9edf7', accent: '#7486a9', accessory: 'moon' },
] as const;
export const CATEGORY_LABEL: Record<Category, string> = { work: '工作', study: '学习', move: '运动', life: '生活' };
export function categoryFor(title: string): Category {
  if (/论文|論文|读|讀|书|書|学|學|复习|複習|英语|英語|课程|課程|読む|読書|勉強|レポート|논문|읽|공부|책|\b(study|read|book|essay|learn|course|leer|libro|estudiar|ensayo)\b/i.test(title)) return 'study';
  if (/运动|運動|跑|健身|瑜伽|散步|散歩|ヨガ|ランニング|운동|달리기|요가|산책|\b(exercise|run|running|gym|yoga|walk|ejercicio|correr|gimnasio|caminar)\b/i.test(title)) return 'move';
  if (/整理|收拾|打扫|打掃|起床|洗|做饭|做飯|片づけ|掃除|料理|정리|청소|요리|\b(tidy|clean|cook|desk|ordenar|limpiar|cocinar|escritorio)\b/i.test(title)) return 'life';
  return 'work';
}
export function defaultProof(title: string): string {
  if (/论文|論文|报告|報告|写|寫|文档|文檔|書く|レポート|논문|보고서|쓰기|\b(essay|report|write|writing|document|ensayo|informe|escribir|documento)\b/i.test(title)) return '拍一张已打开文档，并写下第一句话的照片。';
  if (/跑|健身|运动|運動|瑜伽|ヨガ|ランニング|운동|달리기|요가|\b(exercise|run|running|gym|yoga|ejercicio|correr|gimnasio)\b/i.test(title)) return '拍一张穿好运动鞋，已经来到运动地点的照片。';
  if (/读|讀|书|書|复习|複習|学|學|英语|英語|読む|読書|勉強|읽|책|공부|\b(read|book|study|learn|leer|libro|estudiar)\b/i.test(title)) return '拍一张已经翻开书本，开始阅读或记笔记的照片。';
  if (/整理|收拾|打扫|打掃|片づけ|掃除|정리|청소|\b(tidy|clean|desk|ordenar|limpiar|escritorio)\b/i.test(title)) return '拍一张已经开始整理的桌面或房间局部照片。';
  if (/代码|代碼|編程|编程|开发|開發|コード|プログラミング|코드|코딩|개발|\b(code|coding|programming|develop|código|programar)\b/i.test(title)) return '拍一张已打开编辑器，并写下第一行代码的照片。';
  return `拍一张能看出你已经开始「${title.trim() || '这件事'}」的照片。`;
}
export function normalizeCatCollection(state: UserState): UserState {
  const validIds = new Set<string>(CATS.map(cat => cat.id));
  const owned = [...new Set(state.ownedCats.filter(id => validIds.has(id)))].slice(0, CATS.length);
  state.ownedCats = owned.length ? owned : ['cloud'];
  state.activeCat = validIds.has(state.activeCat) && state.ownedCats.includes(state.activeCat) ? state.activeCat : state.ownedCats[0];
  for (const key of Object.keys(state.drawKeys)) {
    if (!validIds.has(state.drawKeys[key])) state.drawKeys[key] = state.activeCat;
  }
  return state;
}

export function initialState(now = new Date().toISOString()): UserState {
  return {
    version: 1, tasks: [], coins: STARTER_COINS, reminderCredits: STARTER_REMINDER_CREDITS,
    checkIn: { streak: 0, rewardedWeeks: 0 }, ownedCats: ['cloud'], activeCat: 'cloud', drawKeys: {},
    ledger: [{ id: 'welcome', amount: STARTER_COINS, title: '见面礼，送给愿意开始的你', createdAt: now }],
    templates: ['写论文', '读 10 页书', '出门运动', '整理书桌'].map((title, i) => ({ id: `default-${i}`, title, category: categoryFor(title), proof: defaultProof(title), proofMode: 'default' })),
  };
}
export class DomainError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function normalizeReminderEntitlement(state: UserState): UserState {
  if (!Number.isFinite(state.reminderCredits)) state.reminderCredits = STARTER_REMINDER_CREDITS;
  state.reminderCredits = Math.max(0, Math.floor(state.reminderCredits));
  state.checkIn ??= { streak: 0, rewardedWeeks: 0 };
  state.checkIn.streak = Math.max(0, Math.floor(state.checkIn.streak || 0));
  state.checkIn.rewardedWeeks = Math.max(0, Math.floor(state.checkIn.rewardedWeeks || 0));
  return state;
}
export function subscriptionActive(state: UserState, now = Date.now()): boolean {
  return Boolean(state.subscription && Date.parse(state.subscription.expiresAt) > now);
}
export function consumeReminderCredit(state: UserState): void {
  normalizeReminderEntitlement(state);
  if (subscriptionActive(state)) return;
  if (state.reminderCredits <= 0) throw new DomainError('免费提醒次数已用完，请购买订阅或连续签到获得次数', 402);
  state.reminderCredits -= 1;
}
export function checkIn(state: UserState, date: string): boolean {
  normalizeReminderEntitlement(state);
  if (state.checkIn.lastDate && state.checkIn.lastDate >= date) return false;
  const previous = state.checkIn.lastDate ? Date.parse(`${state.checkIn.lastDate}T00:00:00Z`) : NaN;
  const current = Date.parse(`${date}T00:00:00Z`);
  state.checkIn.streak = Number.isFinite(previous) && current - previous === 86400000 ? state.checkIn.streak + 1 : 1;
  state.checkIn.lastDate = date;
  if (state.checkIn.streak >= CHECK_IN_DAYS) {
    state.checkIn.streak = 0;
    state.checkIn.rewardedWeeks += 1;
    state.reminderCredits += 1;
    return true;
  }
  return false;
}
export function markDue(state: UserState, now = Date.now()) {
  for (const task of state.tasks) {
    if (task.kind === 'bedtime') {
      if (task.status !== 'scheduled' && task.status !== 'sleeping') continue;
      const start = Date.parse(task.scheduledAt);
      if (now >= start + BEDTIME_DURATION_MS) {
        task.status = 'slept'; task.completedAt = new Date(start + BEDTIME_DURATION_MS).toISOString();
      } else if (now >= start) task.status = 'sleeping';
    } else if (task.status === 'scheduled' && Date.parse(task.scheduledAt) <= now) task.status = 'waiting_proof';
  }
}
export function rescheduleBedtime(state: UserState, id: string, at: number, now = Date.now()) {
  markDue(state, now);
  const task = state.tasks.find(t => t.id === id);
  if (!task) throw new DomainError('没有找到这件事', 404);
  if (task.kind !== 'bedtime' || task.status !== 'scheduled') throw new DomainError('只有尚未开始的睡眠任务可以修改时间', 409);
  if (!Number.isFinite(at) || at < now + 5000 || at > now + 366 * 86400000) throw new DomainError('请选择未来一年内的开始时间');
  if (state.tasks.some(t => t.id !== id && t.kind === 'bedtime' && (t.status === 'scheduled' || t.status === 'sleeping')
    && at < Date.parse(t.scheduledAt) + BEDTIME_DURATION_MS && at + BEDTIME_DURATION_MS > Date.parse(t.scheduledAt)))
    throw new DomainError('睡眠任务的六小时时段不能重叠', 409);
  task.scheduledAt = new Date(at).toISOString();
  return task;
}
export function resolveTask(state: UserState, id: string, outcome: 'started' | 'escaped', now = new Date().toISOString()) {
  markDue(state, Date.parse(now));
  const task = state.tasks.find(t => t.id === id);
  if (!task) throw new DomainError('没有找到这件事', 404);
  if (task.kind === 'bedtime') throw new DomainError('睡眠任务无需照片，六小时后自动结束，不能提前解除', 409);
  if (task.status === outcome) return task;
  if (task.status !== 'waiting_proof') throw new DomainError(task.status === 'scheduled' ? '还没到开始时间' : '这件事已经处理过了', 409);
  task.status = outcome; task.completedAt = now;
  const amount = outcome === 'started' ? task.reward : -task.penalty;
  state.coins += amount;
  state.ledger.unshift({ id: `task-${id}`, amount, title: `${outcome === 'started' ? '开始了' : '这次先放下'} · ${task.title}`, taskId: id, createdAt: now });
  return task;
}
export function drawCat(state: UserState, key: string, random = Math.random()): string {
  normalizeCatCollection(state);
  if (Object.hasOwn(state.drawKeys, key)) return state.drawKeys[key];
  const available = CATS.filter(cat => !state.ownedCats.includes(cat.id));
  if (!available.length) throw new DomainError('已经集齐全部猫猫了');
  if (state.coins < DRAW_COST) throw new DomainError(`还需要 ${DRAW_COST - state.coins} 喵币，开始一件事就能获得奖励`);
  const cat = available[Math.min(available.length - 1, Math.floor(random * available.length))];
  state.coins -= DRAW_COST; state.ownedCats.push(cat.id);
  Object.defineProperty(state.drawKeys, key, { value: cat.id, enumerable: true, configurable: true, writable: true });
  state.ledger.unshift({ id: `draw-${key}`, amount: -DRAW_COST, title: `遇见新朋友 · ${cat.name}`, catId: cat.id, createdAt: new Date().toISOString() });
  return cat.id;
}
