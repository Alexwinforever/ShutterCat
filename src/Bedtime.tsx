import { useRef, useState } from 'react';
import { BEDTIME_DURATION_MS, type Task } from '../shared/domain';
import { isAndroid, type NativeReply } from './api';
import { t, getLocale } from './i18n';
import Cat from './Cat';

const dateInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const clockInput = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const display = (at: number) => new Date(at).toLocaleString(getLocale(), { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

export function BedtimeForm({ task, selected, busy, native, onShield, onSubmit }: {
  task?: Task; selected: string; busy: boolean; native: NativeReply; onShield: () => void;
  onSubmit: (data: { kind: 'bedtime'; title: string; scheduledAt: string; key: string }) => Promise<void>;
}) {
  const key = useRef(crypto.randomUUID());
  const initial = new Date(task?.scheduledAt ?? `${selected}T23:00:00`);
  if (!task && initial.getTime() < Date.now() + 60000) initial.setDate(initial.getDate() + 1);
  const [date, setDate] = useState(dateInput(initial));
  const [time, setTime] = useState(clockInput(initial));
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const start = new Date(`${date}T${time}`).getTime();
  const ready = !isAndroid() || Boolean(native.bedtimeSupported && native.authorized && native.guardEnabled && native.serviceRunning && native.selectedCount > 0);
  return <form className="bedtime-form" onSubmit={async event => {
    event.preventDefault();
    if (!Number.isFinite(start) || start < Date.now() + 5000) { setError(t('请选择稍晚一点的开始时间')); return; }
    if (!confirmed || !ready) return;
    setError('');
    await onSubmit({ kind: 'bedtime', title: '按时睡觉', key: key.current, scheduledAt: new Date(start).toISOString() });
  }}>
    <div className="bedtime-heading"><span aria-hidden="true">☾</span><h3>{t('按时睡觉')}</h3><p>{t('无需照片，到点开启六小时睡眠守护')}</p></div>
    <div className="form-row"><div><label className="field-label" htmlFor="bedtime-date">{t('开始日期')}</label><input id="bedtime-date" type="date" min={dateInput(new Date())} required value={date} onChange={e => setDate(e.target.value)}/></div><div><label className="field-label" htmlFor="bedtime-time">{t('开始时间')}</label><input id="bedtime-time" type="time" required value={time} onChange={e => setTime(e.target.value)}/></div></div>
    {Number.isFinite(start) && <p className="notice">{t('自动结束时间')}：{display(start + BEDTIME_DURATION_MS)}</p>}
    <p>{t('开始后，已选娱乐 App 会显示猫猫覆盖。不能提交照片、接受惩罚或在 App 内提前关闭；六小时后自动结束。')}</p>
    <p className="form-hint">{t('电话、桌面和系统设置不受影响。请提前选全需要守护的娱乐 App。系统关闭权限、强行停止或省电限制仍可能中断守护。')}</p>
    {!task && <p className="form-hint">{t('创建使用一次提醒额度，订阅期间不限次；睡眠任务不奖励或扣除喵币。')}</p>}
    {!isAndroid() && <p className="notice">{t('网页可安排睡眠时间；实际覆盖需在支持睡眠模式的安卓客户端登录、开启守护并同步任务。')}</p>}
    {isAndroid() && !ready && <><p className="notice">{t(native.bedtimeSupported ? '请先开启守护并选择娱乐 App' : '请先安装支持睡眠模式的新版安卓客户端')}</p><button type="button" className="secondary full" onClick={onShield}>{t('专注守护设置')}</button></>}
    <label className="checkbox-row"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required/><span>{t('我确认开始时间，理解开始后六小时内不能在 App 中解除')}</span></label>
    {error && <p role="alert" className="validation">{error}</p>}
    <button className="primary full bedtime-submit" disabled={busy || !confirmed || !ready}>{t(task ? '保存睡眠时间' : '安排睡眠')}</button>
  </form>;
}

export function BedtimeDetail({ task, now, onEdit }: { task: Task; now: number; onEdit: () => void }) {
  const start = Date.parse(task.scheduledAt), end = start + BEDTIME_DURATION_MS;
  const active = now >= start && now < end;
  const minutes = Math.max(0, Math.ceil((end - now) / 60000));
  return <section className="bedtime-detail"><Cat id="moon" sleeping/><h3>{t('按时睡觉')}</h3>
    <p role="status">{t(now >= end ? '睡眠时段已结束' : active ? '睡眠守护中' : '等待开始')}</p>
    <div className="detail-rows"><div><span>{t('开始时间')}</span><strong>{display(start)}</strong></div><div><span>{t('自动结束时间')}</span><strong>{display(end)}</strong></div></div>
    {active && <p className="notice">{t('剩余约 {0} 小时 {1} 分钟', [Math.floor(minutes / 60), minutes % 60])}</p>}
    <p>{t('无需照片，到点开启六小时睡眠守护')}</p>
    <p className="form-hint">{t('只记录睡眠约定时段，不检测实际睡眠。其他到期任务仍需分别处理。')}</p>
    {now < start && <button className="secondary full" onClick={onEdit}>{t('修改开始时间')}</button>}
  </section>;
}
