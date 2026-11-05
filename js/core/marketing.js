// 媒体渠道投放：把单一营销预算拆成按渠道的细分配
// 效果：品牌加成 + 市场认知(awareness)，渠道与产品定位匹配时有加成
import { clamp, sum } from './util.js';
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
  const lineups = new Set(state.models.filter((p) => p.status === 'production').map((p) => p.lineup || 'main'));
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
