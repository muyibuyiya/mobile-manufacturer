// 通用工具函数
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const round = (v, d = 0) => {
  const p = Math.pow(10, d);
  return Math.round(v * p) / p;
};
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const chance = (p) => Math.random() < p;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const uid = (prefix = 'id') =>
  prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function gauss(mean = 50, sd = 15) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return clamp(mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd, 1, 100);
}

export function fmtMoney(v) {
  const n = Math.round(v);
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e8) return sign + '¥' + (a / 1e8).toFixed(2) + '亿';
  if (a >= 1e4) return sign + '¥' + (a / 1e4).toFixed(a >= 1e6 ? 0 : 1) + '万';
  return sign + '¥' + a.toLocaleString('zh-CN');
}

export function fmtNum(v, d = 0) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return n.toFixed(d).replace(/\.0+$/, '');
}

export function fmtUnit(v) {
  const n = Math.round(v);
  if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿台';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万台';
  return n + '台';
}

export const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
export const fmtDate = (d) => `${d.year}年${MONTHS[d.month]}`;

export function monthIndex(d) { return d.year * 12 + d.month; }
export function addMonth(d) {
  const m = d.month + 1;
  return { year: d.year + Math.floor(m / 12), month: m % 12 };
}
export function monthsBetween(a, b) {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

export function sum(arr, f = (x) => x) {
  let s = 0;
  for (const x of arr) s += f(x);
  return s;
}
export function groupBy(arr, key) {
  const m = new Map();
  for (const x of arr) {
    const k = typeof key === 'function' ? key(x) : x[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}
export function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
