// 媒体渠道投放：把单一营销预算拆成按渠道的细分配
// 效果：品牌加成 + 市场认知(awareness)，渠道与产品定位匹配时有加成
import { clamp, sum, rand } from './util.js';
import { MEDIA_CHANNELS, MEDIA_MAP, DEMO_LINEUP } from '../data/media.js';
import { addLog } from './state.js';

export function ensureMarketing(state) {
  if (!state.marketing) state.marketing = {};
  const m = state.marketing;
  if (!m.channels) m.channels = {};
  for (const c of MEDIA_CHANNELS) {
    if (typeof m.channels[c.id] !== 'number') m.channels[c.id] = 0;
  }
  return m;
}

// 总投放 = 各渠道之和；sim 的 marketingBudget 改为派生值（保持旧逻辑兼容）
export function channelTotal(state) {
  const m = ensureMarketing(state);
  return sum(Object.values(m.channels), (v) => v || 0);
}

export function setChannel(state, id, amount) {
  const m = ensureMarketing(state);
  if (!MEDIA_MAP[id]) return { ok: false, msg: '未知渠道' };
  const year = state.date.year;
  if (year < MEDIA_MAP[id].from) return { ok: false, msg: `${MEDIA_MAP[id].name} ${MEDIA_MAP[id].from} 年才出现` };
  m.channels[id] = Math.max(0, Math.round(Number(amount) || 0));
  return { ok: true };
}

// 某渠道对本公司在售机型的匹配度 0.6~1.35：受众画像 vs 在售产品线
export function channelFit(state, ch) {
  const lineups = new Set(state.models.filter((p) => p.status === 'production' && p.released !== false).map((p) => p.lineup || 'main'));
  const demo = DEMO_LINEUP[ch.demo] || [];
  const hit = demo.filter((l) => lineups.has(l)).length;
  if (hit === 0) return 0.72;              // 完全错位
  if (lineups.size > 3 && demo.length > 1) return 1.18; // 全产品线投综合渠道
  return 1.0 + hit * 0.12;
}

// 月度推进：返回品牌加成与认知加成，费用由 sim 统一扣（marketing 派生）
export function stepMarketing(state, report) {
  const m = ensureMarketing(state);
  const total = channelTotal(state);
  let brandGain = 0, awareGain = 0;
  for (const ch of MEDIA_CHANNELS) {
    const budget = m.channels[ch.id] || 0;
    if (budget <= 0 || state.date.year < ch.from) continue;
    const fit = channelFit(state, ch);
    const effect = (budget / 1e5) * ch.reach * fit * 0.16;
    brandGain += effect * 0.55;
    awareGain += effect;
  }
  report.marketing = Math.round(total);
  return { brandGain: clamp(brandGain, 0, 6), awareGain: clamp(awareGain, 0, 8) };
}

// 各渠道投入摘要（财务页显示）
export function channelSummary(state) {
  const m = ensureMarketing(state);
  return MEDIA_CHANNELS.map((ch) => ({
    ...ch,
    budget: m.channels[ch.id] || 0,
    locked: state.date.year < ch.from,
    fit: +channelFit(state, ch).toFixed(2),
  }));
}

// ---------- 销售渠道关系：运营商 / 电商 / 线下零售 ----------
// 关系 0~100：影响全局销量系数（0.85~1.15），过低有下架风险，过高给推广位；每月自然滑落
export const SALES_CHANNELS = [
  { id: 'operator', name: '运营商渠道', desc: '合约机补贴与门店铺货，走量依赖关系' },
  { id: 'online', name: '电商渠道', desc: '官方旗舰店与平台大促资源位' },
  { id: 'retail', name: '线下零售', desc: '连锁卖场与体验店陈列位' },
];

export function ensureSalesChannels(state) {
  if (!state.salesChannels) state.salesChannels = {};
  for (const c of SALES_CHANNELS) {
    if (!state.salesChannels[c.id]) state.salesChannels[c.id] = { rel: 50 };
  }
  return state.salesChannels;
}

export function channelInvest(state, id) {
  const sc = ensureSalesChannels(state);
  if (!sc[id]) return { ok: false, msg: '未知渠道' };
  const cur = sc[id].rel;
  const cost = Math.round(600000 * (1 + cur / 40)); // 关系越好，维护越贵
  if (state.company.cash < cost) return { ok: false, msg: '资金不足' };
  state.company.cash -= cost;
  sc[id].rel = clamp(cur + rand(7, 12), 0, 100);
  addLog(state, 'market', `向${SALES_CHANNELS.find((c) => c.id === id).name}投入关系维护费用。`);
  return { ok: true, msg: '渠道关系提升' };
}

export function channelSalesMul(state) {
  const sc = ensureSalesChannels(state);
  const avg = sum(SALES_CHANNELS.map((c) => sc[c.id].rel), (v) => v) / SALES_CHANNELS.length;
  return 0.85 + (avg / 100) * 0.3; // 0.85 ~ 1.15
}

export function stepChannels(state, report) {
  const sc = ensureSalesChannels(state);
  for (const c of SALES_CHANNELS) {
    const rel = sc[c.id].rel;
    sc[c.id].rel = clamp(rel + (45 - rel) * 0.02 - 0.4, 0, 100);
    if (rel < 22 && chance01()) {
      report.notes.push(`${c.name}关系恶化，渠道可能减少你的曝光。`);
      addLog(state, 'market', `${c.name}关系恶化（${Math.round(rel)}）。`);
    }
    if (rel > 78 && chance01()) {
      report.notes.push(`${c.name}为你安排了推广位，品牌曝光提升。`);
      state.company.brand = clamp(state.company.brand + 0.4, 0, 100);
    }
  }
}
function chance01() { return Math.random() < 0.22; }
