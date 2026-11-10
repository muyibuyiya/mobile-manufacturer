// 市场分层：把每个市场拆成 7 类消费者人群，各自用混合偏好决定选择
import { clamp } from './util.js';
import { MARKET_MAP, SEGMENT_MAP, SEGMENTS, LINEUP_MAP, marketMix, eraFactor, expectedPrice, signatureOf, phonePriceInMarket } from '../data/world.js';
import { derive } from './design.js';
import { staffPower } from './state.js';
import { fReach, fDesign } from './org.js';
import { policyAdd } from './policy.js';
import { effectiveTariff, overseasDemandBonus } from './overseas.js';

const PREF_KEYS = ['perf', 'cam', 'bat', 'design', 'brand', 'price'];

// 人群偏好与市场偏好混合：市场决定"这个地方的人整体在意什么"，
// 人群决定"这一类人额外偏爱什么"。人群权重更高，否则分群没有存在感。
export function blendPrefs(marketPrefs, segPrefs, w = 0.6) {
  const raw = {};
  let tot = 0;
  for (const k of PREF_KEYS) {
    raw[k] = (marketPrefs[k] || 0) * (1 - w) + (segPrefs[k] || 0) * w;
    tot += raw[k];
  }
  if (tot <= 0) return marketPrefs;
  for (const k of PREF_KEYS) raw[k] /= tot;
  return raw;
}

export function lineupOf(model) {
  return LINEUP_MAP[model?.lineup] || LINEUP_MAP.main;
}

// 产品线对某类人群的吸引力
export function appealOf(model, segId) {
  const l = lineupOf(model);
  return l.appeal[segId] ?? 1;
}

export function salesScores(model, year, state) {
  const d = derive(model.design, year);
  // 工业设计部既影响"设计分"，也影响整机的打磨程度
  const designMul = state ? fDesign(state) : 1;
  return { perf: d.perf, camera: d.camera, battery: d.battery, design: d.designScore * designMul };
}

// 单个人群里的效用函数：预算锚点与价格敏感度都按人群调整
export function utilityFor(scores, price, brand, prefs, year, wealth, seg) {
  const exp = expectedPrice(year) * (0.55 + wealth * 0.9) * (seg ? seg.budget : 1);
  let u = 0;
  u += prefs.perf * Math.log(Math.max(scores.perf, 3));
  u += prefs.cam * Math.log(Math.max(scores.camera, 3));
  u += prefs.bat * Math.log(Math.max(scores.battery, 3));
  u += prefs.design * Math.log(Math.max(scores.design, 3));
  u += prefs.brand * Math.log(Math.max(brand, 4)) * 1.15;
  const elasticity = (0.75 + prefs.price * 3.6) * (seg ? seg.priceSens : 1);
  u -= elasticity * Math.log(Math.max(price, 1) / exp);
  return u;
}

// 品牌与销售能力带来的"被看见"概率，两边都各自吃自己的品牌
export function ownReach(state) {
  return clamp((0.25 + (state.company.brand / 100) * 0.5 + staffPower(state, 'sales') * 0.02) * fReach(state), 0.1, 1.3);
}

export function rivalReach(brand) {
  return 0.55 + brand / 160;
}

// 竞品结盟：联盟成员共享渠道与曝光，份额计算给 6% 加成
export function rivalAllianceBonus(state, compId) {
  const list = state.rivalAlliances || [];
  const hit = list.some((a) => a && a.months > 0 && (a.a === compId || a.b === compId));
  return hit ? 1.06 : 1;
}

export function marketPotential(state, market, demandMul = 1) {
  // 关税抬高终端价压制需求：市场自带关税 + 出口管制类政策的加成；海外分公司本地化生产可减免
  const effTariff = effectiveTariff(state, market);
  return market.base * eraFactor(state.date.year) * (0.55 + market.wealth * 0.85) * demandMul * overseasDemandBonus(state, market.id) * (1 - effTariff);
}

function priceOf(state, model, marketId, suggestedPrice) {
  return model.price?.[marketId] || suggestedPrice(state, model, marketId);
}

// 单个市场的分层份额：先算每个人群内部的份额，再按人群规模加权
export function marketShare(state, marketId, opts = {}) {
  const m = MARKET_MAP[marketId];
  const year = state.date.year;
  const suggest = opts.suggestedPrice;
  const softBias = opts.softBias || 0; // 该机型的口碑/退货带来的额外系数
  const own = state.models.filter((p) => p.status === 'production' && p.released !== false && p.markets.includes(marketId));
  const rivals = [];
  for (const c of state.competitors) {
    for (const phone of c.lineup) {
      if (!phone.markets || !phone.markets.includes(marketId)) continue;
      rivals.push({ competitor: c, phone });
    }
  }
  const mix = marketMix(marketId);
  const ownAgg = new Map();
  for (const p of own) {
    ownAgg.set(p.id, { model: p, val: 0, ratio: 0, u: 0, price: 0, scores: salesScores(p, year, state) });
  }
  const rivalAgg = rivals.map((r) => {
    // 招牌能力：评分维度加成 + 等效价格折扣 + 曝光系数（v1.6.0）
    const sig = signatureOf(r.competitor);
    let scores = r.phone.scores;
    if (sig && sig.bonus) {
      scores = { ...scores };
      for (const k of Object.keys(sig.bonus)) scores[k] = (scores[k] || 0) + sig.bonus[k];
    }
    return {
      ...r, sig, scores,
      effPrice: phonePriceInMarket(r.phone, marketId) * (1 - (sig?.priceCut || 0)),
      val: 0, ratio: 0,
    };
  });
  const segmentRows = [];
  let weightedOwn = 0;
  let sumCompShare = 0;
  let denom = 0; // Σ 人群占比 × 该人群内的总效用，用来把竞品的加权值还原成份额

  for (const item of mix) {
    const seg = SEGMENT_MAP[item.id];
    if (!seg) continue;
    const prefs = blendPrefs(m.prefs, seg.prefs);
    let sumOwn = 0, sumComp = 0;
    const ownVals = [];
    for (const p of own) {
      const price = priceOf(state, p, marketId, suggest);
      const scores = ownAgg.get(p.id).scores;
      const u = utilityFor(scores, price, state.company.brand, prefs, year, m.wealth, seg);
      const val = Math.exp(u) * ownReach(state) * appealOf(p, seg.id) * (p.status === 'production' ? (1 + softBias) : 1);
      ownVals.push({ id: p.id, val, u, price });
      sumOwn += val;
    }
    for (const r of rivalAgg) {
      const u = utilityFor(r.scores, r.effPrice, r.competitor.brand, prefs, year, m.wealth, seg);
      // 竞品也按自己的定位吃本命人群，但只给一点偏好，避免它们完全统治某个细分
      const val = Math.exp(u) * rivalReach(r.competitor.brand) * (r.sig?.reach || 1) * rivalAllianceBonus(state, r.competitor.id);
      r.val += val * item.share;
      r.u = (r.u || 0) + u * item.share;
      sumComp += val;
    }
    const total = sumOwn + sumComp || 1;
    denom += total * item.share;
    const segOwnShare = sumOwn / total;
    weightedOwn += segOwnShare * item.share;
    sumCompShare += (sumComp / total) * item.share;
    for (const o of ownVals) {
      const agg = ownAgg.get(o.id);
      agg.val += o.val * item.share;
      agg.ratio += (o.val / total) * item.share;
      agg.u += o.u * item.share;
      agg.price = o.price;
    }
    segmentRows.push({ id: seg.id, name: seg.name, icon: seg.icon, color: seg.color, share: item.share, ownShare: segOwnShare });
  }

  for (const r of rivalAgg) {
    r.ratio = denom > 0 ? r.val / denom : 0;
  }
  return {
    total: denom,
    ownShare: weightedOwn,
    compShare: sumCompShare,
    own: [...ownAgg.values()],
    comp: rivalAgg,
    segments: segmentRows,
    mix,
  };
}

export { SEGMENTS, SEGMENT_MAP };
