// 一键定价：需要销售部负责人；按建议价填充全部已进入市场（含配置版本容量溢价）
import { suggestedPrice, unitCost } from './sim.js';
import { headOf } from './org.js';
import { RAMS, STORAGES } from '../data/parts.js';

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