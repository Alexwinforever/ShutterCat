import { useSyncExternalStore } from 'react';
import messages from '../shared/locales.json';
import { CATS, defaultProof, type Task, type Template, type LedgerEntry } from '../shared/domain';

export const languages = [
  { id: 'zh-CN', name: '简体中文' }, { id: 'zh-TW', name: '繁體中文' },
  { id: 'en', name: 'English' }, { id: 'ja', name: '日本語' },
  { id: 'ko', name: '한국어' }, { id: 'es', name: 'Español' },
] as const;
export type Locale = typeof languages[number]['id'];
export type LanguageChoice = Locale | 'system';
export const languageKey = 'shuttercat.locale';
const catalog: Record<string, string[]> = messages;
const columns = ['zh-TW', 'en', 'ja', 'ko', 'es'];
const listeners = new Set<() => void>();
export function isLanguage(value: unknown): value is LanguageChoice {
  return value === 'system' || languages.some(language => language.id === value);
}
export function resolveLocale(tag: string): Locale {
  const value = tag.toLowerCase().replace(/_/g, '-');
  if (value.startsWith('zh')) return /hant|tw|hk|mo/.test(value) ? 'zh-TW' : 'zh-CN';
  return languages.find(language => value === language.id || value.startsWith(language.id + '-'))?.id ?? 'en';
}
function readChoice(): LanguageChoice {
  try { const value = localStorage.getItem(languageKey); if (isLanguage(value)) return value; } catch { /* Private browsing can disable storage. */ }
  return 'system';
}
let choice = readChoice();
export const getLanguageChoice = () => choice;
export const getLocale = (): Locale => choice === 'system' ? resolveLocale(navigator.languages?.[0] || navigator.language || 'en') : choice;
export function t(source: string, values: (string | number)[] = [], locale = getLocale()): string {
  const text = locale === 'zh-CN' ? source : catalog[source]?.[columns.indexOf(locale)] ?? source;
  return text.replace(/\{(\d+)\}/g, (match, index) => values[Number(index)] === undefined ? match : String(values[Number(index)]));
}
function publish() {
  document.documentElement.lang = getLocale();
  document.title = 'ShutterCat';
  listeners.forEach(listener => listener());
}
export function setLanguage(value: LanguageChoice) {
  if (!isLanguage(value)) return;
  choice = value;
  try { localStorage.setItem(languageKey, value); } catch { /* Still apply to this session. */ }
  publish();
}
export function useLanguage() {
  const snapshot = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => choice + ':' + getLocale());
  return { choice: snapshot.split(':')[0] as LanguageChoice, locale: getLocale() };
}
window.addEventListener('languagechange', () => { if (choice === 'system') publish(); });
window.addEventListener('storage', event => {
  if (event.key === languageKey || event.key === null) { choice = readChoice(); publish(); }
});
publish();
export function translatedProof(task: Pick<Task, 'title' | 'proof' | 'proofMode'>): string {
  return task.proofMode === 'custom' ? task.proof : suggestedProof(task.title);
}
export function suggestedProof(title: string): string {
  const source = defaultProof(title);
  if (catalog[source]) return t(source);
  return t('拍一张能看出你已经开始「{0}」的照片。', [title.trim() || t('这件事')]);
}
export function translatedTemplate(template: Template): Template {
  // Only the four built-in templates have these IDs. Never translate user-authored titles or custom proof text.
  return /^default-[0-3]$/.test(template.id) ? { ...template, title: t(template.title) } : template;
}
export function ledgerTitle(entry: LedgerEntry, tasks: Task[]): string {
  if (entry.id === 'welcome') return t('见面礼，送给愿意开始的你');
  if (entry.catId) {
    const cat = CATS.find(item => item.id === entry.catId);
    return cat ? t('遇见新朋友 · {0}', [t(cat.name)]) : entry.title;
  }
  if (entry.taskId) {
    const task = tasks.find(task => task.id === entry.taskId);
    if (task) return t(entry.amount > 0 ? '开始了' : '这次先放下') + ' · ' + task.title;
  }
  return entry.title;
}
export function errorText(message: string): string {
  const coins = /^还需要 (\d+) 喵币，开始一件事就能获得奖励$/.exec(message);
  if (coins) return t('还需要 {0} 喵币，开始一件事就能获得奖励', [coins[1]]);
  if (message === 'Failed to fetch' || message === 'Load failed' || message === 'NetworkError when attempting to fetch resource.') return t('无法连接服务，请检查网络后重试');
  return t(message);
}
