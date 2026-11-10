// 一键定价：需要销售部负责人；按建议价填充全部已进入市场（含配置版本容量溢价）
import { suggestedPrice, unitCost, marketShare } from './sim.js';
import { headOf } from './org.js';
import { RAMS, STORAGES } from '../data/parts.js';
import { MARKET_MAP } from '../data/world.js';
import { marketPotential } from './market.js';
import { storeSalesMul } from './stores.js';
import { clamp } from './util.js';

export function canAutoPrice(state) {
  return !!headOf(state, 'sales');
}

export function variantCost(state, m, v) {
  const base = unitCost(state, m);
  const r0 = RAMS.find((x) => x.id === m.design.parts.ram);
  const s0 = STORAGES.find((x) => x.id === m.design.parts.storage);
  const r1 = RAMS.find((x) => x.id === v.ram);
  const s1 = STORAGES.find((x) => x.id === v.stg);
  return Math.max(1, Math.round(base + ((r1?.price || 0) - (r0?.price || 0)) + ((s1?.price || 0) - (s0?.price || 0))));
}

export function variantPriceMul(m, v) {
  const r0 = RAMS.find((x) => x.id === m.design.parts.ram);
  const s0 = STORAGES.find((x) => x.id === m.design.parts.storage);
  const r1 = RAMS.find((x) => x.id === v.ram);
  const s1 = STORAGES.find((x) => x.id === v.stg);
  const cap = (r, s) => (r?.gb || 0.25) * 0.6 + (s?.gb || 16) * 0.12;
  return Math.max(0.75, Math.min(2.2, (cap(r1, s1) + 12) / (cap(r0, s0) + 12)));
}

export function autoPriceModel(state, m, strategy = 'standard') {
  if (!canAutoPrice(state)) return { ok: false, reason: 'no-head' };
  if (!m) return { ok: false, reason: 'no-model' };
  if (!Array.isArray(m.markets) || !m.markets.length) return { ok: false, reason: 'no-market' };
  const mulStrategy = { standard: 1, penetration: 0.92, premium: 1.08 }[strategy] ?? 1;
  for (const market of m.markets) {
    const base = Math.round(suggestedPrice(state, m, market) * mulStrategy / 10) * 10;
    m.price[market] = base;
    for (const v of (m.design?.variants || [])) {
      const mul = variantPriceMul(m, v);
      v.price = v.price || {};
      v.price[market] = Math.round(base * mul / 10) * 10;
    }
  }
  return { ok: true, count: m.markets.length, strategy };
}

// 单点预测：临时写入候选价，跑一次分层份额，再还原（只读模拟，不改经营状态）
function forecastAt(state, model, marketId, price) {
  const mk = MARKET_MAP[marketId];
  if (!mk) return null;
  if (!model.price) model.price = {};
  const prev = model.price[marketId];
  const price0 = Math.max(1, Math.round(price));
  model.price[marketId] = price0;
  let ratio = 0;
  try {
    const info = marketShare(state, marketId);
    ratio = info.own.find((o) => o.model?.id === model.id)?.ratio || 0;
  } finally {
    if (prev === undefined) delete model.price[marketId];
    else model.price[marketId] = prev;
  }
  const potential = marketPotential(state, mk);
  const heatMul = 0.3 + clamp((model.heat ?? 100) / 100, 0, 1) * 0.7;
  const units = Math.round(potential * ratio * storeSalesMul(state, marketId) * heatMul);
  const cost = unitCost(state, model);
  const p = price0;
  return {
    price: p, units, ratio,
    cost,
    margin: p > 0 ? (p - cost) / p : 0,
    revenue: units * p,
    profit: units * (p - cost),
  };
}

// 价格—销量曲线：以当前价为中心 ±span 采样，返回各价位预测与最优毛利点
export function priceCurve(state, model, marketId = 'cn', steps = 5, span = 0.3) {
  const mk = MARKET_MAP[marketId];
  if (!mk || !model) return [];
  const base = model.price?.[marketId] || suggestedPrice(state, model, marketId);
  const rows = [];
  for (let i = 0; i < steps; i++) {
    const k = 1 - span + (2 * span) * (steps === 1 ? 0.5 : i / (steps - 1));
    const row = forecastAt(state, model, marketId, Math.max(10, Math.round(base * k / 10) * 10));
    if (row) rows.push(row);
  }
  const best = rows.reduce((a, b) => (b.profit > (a?.profit ?? -Infinity) ? b : a), null);
  return rows.map((r) => ({ ...r, best: best && r.price === best.price }));
}

export function priceForecast(state, model, marketId = 'cn', price) {
  if (!model) return null;
  const base = price ?? model.price?.[marketId] ?? suggestedPrice(state, model, marketId);
  return forecastAt(state, model, marketId, base);
}