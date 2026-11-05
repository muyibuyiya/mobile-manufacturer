// 海外分公司/工厂：应对关税（出口管制、市场壁垒）的长期投资
// - 在某市场建分公司后：该市场关税减免 90%（本地化生产），需求 +3%（本地品牌好感）
// - 建厂费用一次性，每月维护费进入财务
import { MARKETS } from '../data/world.js';
import { policyAdd } from './policy.js';

const MARKET_MAP = Object.fromEntries(MARKETS.map((m) => [m.id, m]));

export function ensureOverseas(s) {
  if (!s || typeof s !== 'object') return [];
  if (!Array.isArray(s.overseas)) s.overseas = [];
  return s.overseas;
}

// 建厂投资：市场规模 × 2（印度 2.8 亿、东南亚 1.2 亿、日本 6000 万…）
export function overseasInvest(marketId) {
  const m = MARKET_MAP[marketId];
  return Math.round((m?.base || 4e6) * 2);
}

export function overseasUpkeepSingle(marketId) {
  return Math.round(overseasInvest(marketId) * 0.012);
}

export function overseasOf(state, marketId) {
  return (state.overseas || []).find((o) => o.marketId === marketId);
}

// 全部海外分公司月维护费
export function overseasUpkeep(state) {
  return (state.overseas || []).reduce((s, o) => s + overseasUpkeepSingle(o.marketId), 0);
}

// 市场实际关税（建分公司后本地化生产，减免 90%）
export function effectiveTariff(state, market) {
  const base = clamp01((market.tariff || 0) + policyAdd(state, 'tariffAdd'));
  if (overseasOf(state, market.id)) return base * 0.1;
  return base;
}

// 本地化需求加成
export function overseasDemandBonus(state, marketId) {
  return overseasOf(state, marketId) ? 1.03 : 1;
}

export function buildOverseas(state, marketId) {
  if (overseasOf(state, marketId)) return { ok: false, msg: '该市场已有分公司' };
  const invest = overseasInvest(marketId);
  if (state.company.cash < invest) return { ok: false, msg: '现金不足（需 ' + invest + '）' };
  state.company.cash -= invest;
  const m = MARKET_MAP[marketId];
  state.overseas.push({ marketId, year: state.date.year, invest, name: m?.name || marketId });
  return { ok: true, msg: `${m?.name || marketId}分公司成立（本地化生产，关税减免 90%）` };
}

export function sellOverseas(state, marketId) {
  const idx = (state.overseas || []).findIndex((o) => o.marketId === marketId);
  if (idx < 0) return { ok: false, msg: '该市场没有分公司' };
  const refund = Math.round(state.overseas[idx].invest * 0.4);
  state.company.cash += refund;
  state.overseas.splice(idx, 1);
  return { ok: true, msg: '分公司出售，回收 ' + refund };
}

function clamp01(v) { return Math.max(0, Math.min(0.45, v)); }
