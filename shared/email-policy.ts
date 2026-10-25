export const MAINLAND_EMAIL_REGISTRATION_MESSAGE = '暂不支持中国大陆邮箱注册，请使用其他邮箱。';

// Public providers whose addresses do not use a .cn suffix. Subdomains such as
// vip.qq.com and vip.163.com are covered by the suffix-aware comparison below.
const MAINLAND_EMAIL_PROVIDER_DOMAINS = new Set([
  'qq.com',
  'foxmail.com',
  '163.com',
  '126.com',
  'yeah.net',
  '188.com',
  'sina.com',
  'sohu.com',
  'aliyun.com',
  '139.com',
  '21cn.com',
  'tom.com',
  '163.net',
  '263.net',
  'x263.net',
  '2980.com',
  'eyou.com',
  'etang.com',
  'china.com',
  'chinaren.com',
  'citiz.net',
  'fm365.com',
]);

export function isMainlandRegistrationEmail(value: string) {
  const at = value.lastIndexOf('@');
  if (at < 0) return false;
  const domain = value.slice(at + 1).trim().toLowerCase().replace(/\.$/, '');
  if (!domain) return false;
  if (domain === 'cn' || domain.endsWith('.cn')) return true;
  for (const provider of MAINLAND_EMAIL_PROVIDER_DOMAINS) {
    if (domain === provider || domain.endsWith('.' + provider)) return true;
  }
  return false;
}
