import { useEffect, useState } from 'react';
import { SUBSCRIPTION_PLANS, subscriptionActive, type UserState } from '../shared/domain';
import { api, isAndroid, nativeMessage, type ApiResult } from './api';
import { t } from './i18n';
import './membership.css';

type BillingEvent = { kind: string; items?: unknown[]; message?: string };
declare global { interface Window { meowBillingReply?: (event: BillingEvent) => void } }
export default function Membership({ state, accept }: { state: UserState; accept: (result: ApiResult) => unknown }) {
  const [accountId, setAccountId] = useState('');
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const active = subscriptionActive(state);
  useEffect(() => { if (!busy) return; const timer = setTimeout(() => { setBusy(false); setMessage(t('处理超时，请点击恢复购买重试')); }, 45000); return () => clearTimeout(timer); }, [busy]);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const response = await api('/billing');
        if (!mounted) return;
        accept(response); setAccountId(response.accountId ?? ''); setReady(Boolean(response.paymentReady)); setToday(response.today ?? '');
      } catch (e) { if (mounted) setMessage((e as Error).message); }
    };
    window.meowBillingReply = event => {
      if (event.kind === 'catalog') {
        const items = (event.items ?? []) as { id: string; price: string }[];
        setPrices(Object.fromEntries(items.map(item => [item.id, item.price]))); if (!items.length) setMessage(t('暂无可购买的 Google Play 套餐，请稍后重试')); return;
      }
      if (!mounted) return;
      if (event.kind === 'purchases') {
        setBusy(true);
        void (async () => {
          try {
            for (const token of event.items ?? []) { const response = await api('/billing/verify', 'POST', { purchaseToken: token }); if (mounted) accept(response); }
            if (mounted) setMessage(t('订阅已验证，提醒次数不限'));
          } catch (e) { if (mounted) setMessage((e as Error).message); }
          finally { if (mounted) setBusy(false); }
        })();
      } else {
        setBusy(false);
        setMessage(event.kind === 'pending' ? t('付款处理中，完成付款后可恢复购买') : event.kind === 'cancelled' ? t('已取消购买，未开通订阅') : event.kind === 'empty' ? t('未找到有效购买记录') : event.message ?? '');
      }
    };
    void load();
    if (isAndroid()) nativeMessage('billingCatalog');
    const resume = () => { void load(); if (isAndroid()) nativeMessage('billingRestore'); };
    window.addEventListener('meowNativeResume', resume);
    return () => { mounted = false; delete window.meowBillingReply; window.removeEventListener('meowNativeResume', resume); };
  }, []);
  const action = async (fn: () => Promise<void>) => {
    setBusy(true); setMessage('');
    try { await fn(); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="membership">
    <div className="membership-summary"><h3>{active ? t('订阅有效 · 不限提醒次数') : t('免费提醒剩余 {0} 次', [state.reminderCredits ?? 3])}</h3>
      {active && <p>{t('有效期至 {0}', [new Date(state.subscription!.expiresAt).toLocaleDateString()])}</p>}
      <p>{t('新账号赠送 3 次；创建一个任务使用 1 次，同一任务重复提醒不再扣次。')}</p>
    </div>
    <section><h3>{t('连续签到领提醒次数')}</h3><p>{t('每连续签到 7 天赠送 1 次，可重复获得。中断后重新累计，按北京时间每日计算。')}</p>
      <div className="checkin-days" aria-label={t('签到进度')}>{Array.from({ length: 7 }, (_, i) => <span key={i} className={i < (state.checkIn?.streak ?? 0) ? 'checked' : ''}>{i + 1}</span>)}</div>
      <button className="secondary full" disabled={busy || !today || state.checkIn?.lastDate === today} onClick={() => void action(async () => { const response = await api('/check-in', 'POST'); accept(response); setToday(response.today ?? today); setMessage(t(response.rewarded ? '已获得 1 次免费提醒' : '签到成功')); })}>{t(state.checkIn?.lastDate === today ? '今日已签到' : '今日签到')}</button>
    </section>
    <section><h3>{t('订阅 · 有效期内不限次数')}</h3><p>{t('订阅绑定当前邮箱账号，换设备后请先登录同一邮箱，再恢复购买。')}</p>
      <div className="membership-plans">{SUBSCRIPTION_PLANS.map(plan => <div className="membership-plan" key={plan.id}><strong>{t(plan.name)}</strong><b>{prices[plan.id] ?? plan.price}</b><small>{t('每 {0} 个月', [plan.durationMonths])}</small><button className="primary" disabled={busy || active || !isAndroid() || !ready || !prices[plan.id] || !accountId} onClick={() => { setBusy(true); setMessage(''); nativeMessage('billingPurchase', { productId: plan.id, accountId }); }}>{t('订阅')}</button></div>)}</div>
      <p>{t('自动续费，可在 Google Play 随时取消。取消后可使用至本期结束。价格与币种以 Google Play 结算页为准。')}</p>
      {!isAndroid() && <p className="notice">{t('请通过 Google Play 安装的安卓版购买订阅。')}</p>}
      {isAndroid() && !ready && <p className="notice">{t('Google Play 支付暂未开放。')}</p>}
      {isAndroid() && <div className="membership-actions"><button className="secondary" disabled={busy || !ready} onClick={() => { setBusy(true); nativeMessage('billingRestore'); }}>{t('恢复购买')}</button><button className="secondary" disabled={busy} onClick={() => nativeMessage('billingCatalog')}>{t('刷新价格')}</button><button className="secondary" onClick={() => nativeMessage('billingManage')}>{t('管理订阅')}</button></div>}
    </section>
    {message && <p role="status" className="notice">{message}</p>}
    {busy && <p role="status">{t('正在处理，请稍候…')}</p>}
  </div>;
}
