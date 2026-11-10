// 股权投资：战略持股竞品 / 供应商（第一轮：买入、卖出、折扣、分红、收购折价）
// 设计边界：不做日内波动；股价按估值每季度重算；持股上限与 12 个月锁定期防止短线套利
import { clamp, fmtMoney } from './util.js';
import { SUPPLIER_MAP } from '../data/suppliers.js';

export const STAKE_MAX = { rival: 30, supplier: 49 };
export const STAKE_LOCK_MONTHS = 12;

export function ensureEquity(state) {
  if (!state.equity || typeof state.equity !== 'object') {
    state.equity = { holdings: [], issued: { pct: 0, log: [] }, offers: [] };
  }
  const e = state.equity;
  if (!Array.isArray(e.holdings)) e.holdings = [];
  if (!e.issued || typeof e.issued !== 'object') e.issued = { pct: 0, log: [] };
  if (!Array.isArray(e.issued.log)) e.issued.log = [];
  if (!Number.isFinite(Number(e.issued.pct))) e.issued.pct = 0;
  e.holdings = e.holdings.filter((h) => h && h.targetId && (h.kind === 'rival' || h.kind === 'supplier'));
  for (const h of e.holdings) {
    h.pct = clamp(Number(h.pct) || 0, 0, STAKE_MAX[h.kind]);
    h.cost = Math.max(0, Number(h.cost) || 0);
    if (!h.since) h.since = { year: state.date?.year || 1980, month: state.date?.month || 0 };
  }
  return e;
}

export function stakeOf(state, targetId) {
  return ensureEquity(state).holdings.find((h) => h.targetId === targetId) || null;
}

export function stakePct(state, targetId) {
  const h = stakeOf(state, targetId);
  return h ? h.pct : 0;
}

export function monthsSince(since, date) {
  if (!since || !date) return 0;
  return (Number(date.year) - Number(since.year)) * 12 + (Number(date.month) - Number(since.month));
}

// ---------- 估值 ----------
const CAT_MUL = { chip: 1.8, display: 1.5, memory: 1.3, camera: 1.1, battery: 0.9, shell: 0.7 };

export function supplierValuation(sup) {
  if (!sup) return 0;
  const base = 2.2e8;
  const cat = CAT_MUL[sup.cat] || 1;
  return Math.round(base * cat * (1.25 - (sup.priceMul || 1) * 0.25) * (0.8 + (sup.reliability || 0.9) * 0.3));
}

export function rivalValuation(comp) {
  if (!comp) return 0;
  const brand = Math.max(10, Number(comp.brand) || 10);
  const lineup = (comp.lineup || []).length;
  return Math.round(9e7 + Math.pow(brand, 1.7) * 1.1e5 * (0.85 + lineup * 0.12));
}

export function targetValuation(state, targetId, kind) {
  if (kind === 'supplier') return supplierValuation(SUPPLIER_MAP[targetId]);
  const c = (state.competitors || []).find((x) => x.id === targetId);
  return rivalValuation(c);
}

// 持股 >10% 后越买越贵：每多 5% 加价 5%
export function stakePremium(pct) {
  if (pct <= 10) return 0;
  return Math.min(0.6, Math.floor((pct - 10) / 5) * 0.05);
}

// 供应商持股 → 采购折扣（5/15/30 三档，上限 8%）
export function stakeDiscount(pct) {
  if (pct >= 30) return 0.08;
  if (pct >= 15) return 0.05;
  if (pct >= 5) return 0.02;
  return 0;
}

export function stakeDiscountByCat(state) {
  const out = {};
  for (const h of ensureEquity(state).holdings) {
    if (h.kind !== 'supplier') continue;
    const sup = SUPPLIER_MAP[h.targetId];
    if (!sup) continue;
    out[sup.cat] = Math.max(out[sup.cat] || 0, stakeDiscount(h.pct));
  }
  return out;
}

// 收购折价：持股越多，收购越便宜
export function acquisitionStakeDiscount(state, compId) {
  const pct = stakePct(state, compId);
  if (pct >= 30) return 0.85;
  if (pct >= 20) return 0.9;
  if (pct >= 15) return 0.95;
  return 1;
}

// ---------- 买入 / 卖出 ----------
function targetName(state, targetId, kind) {
  if (kind === 'supplier') return (SUPPLIER_MAP[targetId] || {}).name || targetId;
  const c = (state.competitors || []).find((x) => x.id === targetId);
  return c ? c.name : targetId;
}

export function stakeQuote(state, targetId, kind, toPct) {
  ensureEquity(state);
  const cap = STAKE_MAX[kind] || 30;
  const cur = stakePct(state, targetId);
  const target = clamp(Math.round(Number(toPct) || 0), 0, cap);
  const val = targetValuation(state, targetId, kind);
  const add = Math.max(0, target - cur);
  const price = Math.round(val * add / 100 * (1 + stakePremium(cur)));
  return { cur, target, add, price, valuation: val, cap };
}

export function buyStake(state, targetId, kind, toPct) {
  ensureEquity(state);
  const q = stakeQuote(state, targetId, kind, toPct);
  if (q.target <= q.cur) return { ok: false, msg: '持股比例没有增加' };
  if (state.company.cash < q.price) return { ok: false, msg: `资金不足（需 ${fmtMoney(q.price)}）` };
  state.company.cash -= q.price;
  const h = stakeOf(state, targetId);
  if (h) { h.pct = q.target; h.cost += q.price; }
  else state.equity.holdings.push({ targetId, kind, pct: q.target, cost: q.price, since: { ...state.date } });
  const disc = kind === 'supplier' ? `；采购折扣 -${Math.round(stakeDiscount(q.target) * 100)}%` : '';
  return { ok: true, msg: `已持有「${targetName(state, targetId, kind)}」${q.target}%（${fmtMoney(q.price)}）${disc}`, pct: q.target };
}

export function sellStake(state, targetId, toPct) {
  const h = stakeOf(state, targetId);
  if (!h) return { ok: false, msg: '没有可卖出的持股' };
  const held = monthsSince(h.since, state.date);
  if (held < STAKE_LOCK_MONTHS) return { ok: false, msg: `持股未满 ${STAKE_LOCK_MONTHS} 个月（已 ${held} 个月），不能卖出` };
  const maxSell = Math.max(1, Math.floor(h.pct / 2));
  const target = clamp(Math.round(Number(toPct) || 0), h.pct - maxSell, h.pct);
  const val = targetValuation(state, targetId, h.kind);
  const out = h.pct - target;
  const price = Math.round(val * out / 100 * 0.95); // 卖出 5% 折价
  state.company.cash += price;
  h.pct = target;
  h.cost = Math.max(0, Math.round(h.cost * (target / Math.max(1, h.pct + out))));
  if (h.pct <= 0) state.equity.holdings = state.equity.holdings.filter((x) => x !== h);
  return { ok: true, msg: `卖出 ${out}%，回收 ${fmtMoney(price)}` };
}

// ---------- 季度分红 ----------
export function stakeDividends(state) {
  ensureEquity(state);
  let total = 0;
  for (const h of state.equity.holdings) {
    if (h.kind === 'rival') {
      const c = (state.competitors || []).find((x) => x.id === h.targetId);
      if (!c) continue;
      const profit = Math.max(0, Number(c.revenueEst) || 0) * 0.08; // 粗估净利率 8%
      total += profit * (h.pct / 100) * 0.6;                        // 40% 留作再投资
    } else {
      const sup = SUPPLIER_MAP[h.targetId];
      if (!sup) continue;
      total += supplierValuation(sup) * 0.012 * (h.pct / 100);
    }
  }
  return Math.round(total);
}

export function holdingsSummary(state) {
  ensureEquity(state);
  return state.equity.holdings.map((h) => ({
    ...h,
    name: targetName(state, h.targetId, h.kind),
    value: Math.round(targetValuation(state, h.targetId, h.kind) * h.pct / 100),
    discount: h.kind === 'supplier' ? stakeDiscount(h.pct) : 0,
    held: monthsSince(h.since, state.date),
  }));
}

// ---------- 增发（对外卖股票）----------
export const ISSUE_MAX_TOTAL = 40;
export const ISSUE_MAX_ONCE = 10;

// 自行估值，避免与 capital.js 形成循环依赖
export function companyValuation(state) {
  const cash = Math.max(0, Number(state.company?.cash) || 0);
  const debt = Math.max(0, Number(state.company?.debt) || 0);
  const brand = Math.max(1, Number(state.company?.brand) || 1);
  const rev = (state.history || []).slice(-12).reduce((a, h) => a + (Number(h.revenue) || 0), 0);
  const profit = (state.history || []).slice(-12).reduce((a, h) => a + (Number(h.net) || 0), 0);
  return Math.round(Math.max(cash - debt + Math.pow(brand, 1.55) * 1.1e6 + rev * 1.6 + (profit > 0 ? profit * 6 : profit * 2), 1e7));
}

export function issueQuote(state, pct) {
  ensureEquity(state);
  const left = Math.max(0, ISSUE_MAX_TOTAL - state.equity.issued.pct);
  const amount = Math.min(clamp(Math.round(Number(pct) || 0), 1, ISSUE_MAX_ONCE), left);
  const val = companyValuation(state);
  const brand = Math.max(1, Number(state.company?.brand) || 1);
  const discount = clamp(0.95 - brand / 500, 0.85, 0.95); // 品牌越强折价越小
  const price = Math.round(val * amount / 100 * discount);
  return { amount, left, price, valuation: val, discount };
}

export function issueShares(state, pct) {
  const q = issueQuote(state, pct);
  if (q.amount <= 0) return { ok: false, msg: `累计对外出让已达 ${ISSUE_MAX_TOTAL}% 上限` };
  state.company.cash += q.price;
  state.equity.issued.pct += q.amount;
  state.equity.issued.log.push({ pct: q.amount, price: q.price, date: { ...state.date } });
  // 稀释原股东
  const holders = state.capital?.holders;
  if (Array.isArray(holders) && holders.length) {
    const keep = 1 - q.amount / 100;
    for (const h of holders) h.pct = +(h.pct * keep).toFixed(2);
    holders.push({ name: '二级市场投资者', pct: q.amount });
    holders.sort((a, b) => b.pct - a.pct);
  }
  return { ok: true, msg: `增发 ${q.amount}%，募资 ${fmtMoney(q.price)}（累计出让 ${state.equity.issued.pct}%）`, amount: q.amount };
}

// ---------- 协商入股（对方是否愿意卖）----------
export function negotiateStake(state, compId, pct) {
  const comp = (state.competitors || []).find((x) => x.id === compId);
  if (!comp) return { ok: false, msg: '找不到这家公司' };
  const q = stakeQuote(state, compId, 'rival', pct);
  if (q.target <= q.cur) return { ok: false, msg: '持股比例没有增加' };
  // 对方越缺钱、品牌越弱，越愿意让股；超过 15% 明显更难
  const gap = Math.max(0, 15 - q.target) / 15;
  const willing = clamp(0.35 + gap * 0.4 + (comp.brand < 60 ? 0.2 : 0), 0, 0.9);
  if (willing < 0.5) {
    return { ok: false, msg: `${comp.name} 拒绝了你的入股要约（对方估值坚挺）` };
  }
  const price = Math.round(q.price * 0.95); // 协商价 95 折
  if (state.company.cash < price) return { ok: false, msg: `资金不足（需 ${fmtMoney(price)}）` };
  state.company.cash -= price;
  const h = stakeOf(state, compId);
  if (h) { h.pct = q.target; h.cost += price; }
  else state.equity.holdings.push({ targetId: compId, kind: 'rival', pct: q.target, cost: price, since: { ...state.date } });
  return { ok: true, msg: `与 ${comp.name} 达成协议：持股 ${q.target}%（${fmtMoney(price)}，协商 95 折）`, pct: q.target };
}

// ---------- 政府投资事件 ----------
export function maybeGovernmentInvestment(state) {
  ensureEquity(state);
  const e = state.equity;
  if (e.govt) return null;
  const age = Number(state.date?.year || 0) - Number(state.company?.founded || 0);
  const cash = Number(state.company?.cash) || 0;
  if (age > 5 || cash > 5e7) return null;
  if (e.issued.pct + 5 > ISSUE_MAX_TOTAL) return null;
  const pct = 5 + Math.floor(Math.random() * 8);
  const val = companyValuation(state);
  const amount = Math.round(val * pct / 100 * 1.1);
  state.company.cash += amount;
  e.issued.pct += pct;
  e.govt = { pct, amount, year: state.date.year, month: state.date.month, promise: { localFactory: true } };
  e.issued.log.push({ pct, price: amount, date: { ...state.date }, note: '政府产业基金' });
  return { pct, amount, name: '政府产业基金' };
}