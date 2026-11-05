// 资本运作：估值、融资轮次、IPO 上市、收购竞品
import { clamp, rand, uid } from './util.js';
import { addLog } from './state.js';

const SHARES = 1e8; // 上市后总股本

export function ensureCapital(state) {
  if (!state.capital) state.capital = {};
  const c = state.capital;
  if (!Array.isArray(c.holders) || !c.holders.length) c.holders = [{ name: '创始团队', pct: 100 }];
  if (!Array.isArray(c.rounds)) c.rounds = [];
  if (!Array.isArray(c.acquisitions)) c.acquisitions = [];
  if (typeof c.ipo === 'undefined') c.ipo = null;
  if (!c.stock) c.stock = { price: 0, history: [] };
  if (!Array.isArray(c.stock.history)) c.stock.history = [];
  return c;
}

export function annualRevenue(state) {
  const h = (state.history || []).slice(-12);
  return h.reduce((s, x) => s + (x.revenue || 0), 0);
}

export function annualProfit(state) {
  const h = (state.history || []).slice(-12);
  return h.reduce((s, x) => s + (x.net || 0), 0);
}

// 估值 = 净资产 + 品牌溢价 + 年化营收倍数（有利润时再加成）
export function valuationOf(state) {
  const assets = Math.max(0, state.company.cash - state.company.debt);
  const brandV = Math.pow(Math.max(state.company.brand, 1), 1.55) * 1.1e6;
  const rev = annualRevenue(state);
  const profit = annualProfit(state);
  const profitV = profit > 0 ? profit * 6 : profit * 2;
  return Math.round(Math.max(assets + brandV + rev * 1.6 + profitV, 1e7));
}

export function founderPct(state) {
  const c = ensureCapital(state);
  return c.holders.find((h) => h.name === '创始团队')?.pct ?? 100;
}

// 这一轮最多能融多少：估值的两成，且不超过估值的 35% 累计稀释
export function raiseLimit(state) {
  return Math.round(valuationOf(state) * 0.2);
}

export function raiseRound(state, amount) {
  const c = ensureCapital(state);
  amount = Math.round(Number(amount) || 0);
  if (amount <= 0) return { ok: false, msg: '融资额必须大于 0' };
  const cap = raiseLimit(state);
  if (amount > cap) return { ok: false, msg: `本轮最多可融 ${(cap / 1e4).toFixed(0)} 万元` };
  if (founderPct(state) <= 35) return { ok: false, msg: '创始团队持股已低于 35%，投资人不再接受稀释' };
  const pre = valuationOf(state);
  const pct = (amount / (pre + amount)) * 100;
  const names = ['远见资本', '磐石创投', '东篱产业基金', '星野资本', '长青私募', '云帆战投'];
  const name = names[c.rounds.length % names.length];
  for (const h of c.holders) h.pct -= h.pct * (pct / 100);
  c.holders.push({ name, pct });
  c.holders.sort((a, b) => b.pct - a.pct);
  const round = { id: 'r_' + uid(), name, amount, pct: +pct.toFixed(2), pre, date: { ...state.date } };
  c.rounds.push(round);
  state.company.cash += amount;
  addLog(state, 'finance', `完成 ${name} 领投的一轮融资：${(amount / 1e4).toFixed(0)} 万元，出让 ${pct.toFixed(1)}% 股份。`);
  return { ok: true, round };
}

export function ipoRequirements(state) {
  const val = valuationOf(state);
  const rev = annualRevenue(state);
  return [
    { key: '估值', ok: val >= 3e9, now: (val / 1e8).toFixed(1) + ' 亿', need: '≥ 30 亿' },
    { key: '年化营收', ok: rev >= 8e8, now: (rev / 1e8).toFixed(2) + ' 亿', need: '≥ 8 亿' },
    { key: '品牌力', ok: state.company.brand >= 45, now: state.company.brand.toFixed(0), need: '≥ 45' },
    { key: '持续盈利', ok: annualProfit(state) > 0, now: annualProfit(state) > 0 ? '是' : '否', need: '近 12 个月为正' },
  ];
}

export function canIPO(state) {
  return ipoRequirements(state).every((r) => r.ok);
}

export function listIPO(state) {
  const c = ensureCapital(state);
  if (c.ipo?.listed) return { ok: false, msg: '公司已经上市' };
  if (!canIPO(state)) return { ok: false, msg: '尚未满足上市条件' };
  const pre = valuationOf(state);
  const issuePct = 20;
  const raised = Math.round(pre * 0.2);
  for (const h of c.holders) h.pct -= h.pct * 0.2;
  c.holders.push({ name: '公众股东', pct: issuePct });
  const price = +((pre * 1.15) / SHARES).toFixed(2);
  c.ipo = { listed: true, date: { ...state.date }, price, shares: SHARES, raised, issuePct };
  c.stock.price = price;
  c.stock.history.push({ date: { ...state.date }, price });
  state.company.cash += raised;
  addLog(state, 'finance', `公司在交易所挂牌上市，发行价 ¥${price.toFixed(2)}，募资 ${(raised / 1e8).toFixed(2)} 亿元。`);
  return { ok: true, price, raised };
}

export function marketCap(state) {
  const c = ensureCapital(state);
  if (!c.ipo?.listed) return valuationOf(state);
  return Math.round(c.stock.price * SHARES);
}

// 每月股价波动：跟净利润、品牌、市场大势走
export function stepCapital(state, report) {
  const c = ensureCapital(state);
  if (!c.ipo?.listed) return;
  const net = report.net || 0;
  const drift = clamp(net / 6e7, -0.12, 0.12) + (state.company.brand - 50) / 900 + rand(-0.035, 0.035);
  c.stock.price = +Math.max(0.2, c.stock.price * (1 + drift)).toFixed(2);
  c.stock.history.push({ date: { ...state.date }, price: c.stock.price });
  if (c.stock.history.length > 240) c.stock.history.shift();
  report.stockPrice = c.stock.price;
  report.marketCap = marketCap(state);
}

// ---------- 收购谈判：多轮出价，对方按估值与意愿回应 ----------
// 意愿：品牌弱/现金紧的厂商更容易低头；在售机型多的不愿卖
function willingness(comp, state) {
  let w = 0.55;
  w += (55 - clamp(comp.brand, 10, 99)) / 130;          // 品牌越弱越想卖
  w += comp.lineup?.length === 0 ? 0.18 : 0;            // 无在售机型急于套现
  w -= comp.lineup?.length > 2 ? 0.22 : 0;              // 产品线健康不愿卖
  w -= (state.competitors.filter((c) => c.sub).length) * 0.04; // 已经卖过一次更谨慎
  return clamp(w, 0.12, 0.95);
}

// 谈判对象估值（比一键收购更便宜，但要谈）
function askPrice(comp) {
  return Math.round((0.9e8 + Math.pow(Math.max(comp.brand, 10), 1.7) * 1.1e5)
    * (0.85 + (comp.lineup?.length || 0) * 0.12));
}

export function openNegotiation(state, compId) {
  ensureCapital(state);
  const comp = state.competitors.find((x) => x.id === compId);
  if (!comp) return { ok: false, msg: '找不到这家公司' };
  if (comp.sub) return { ok: false, msg: '这已经是你的子公司' };
  const ask = askPrice(comp);
  // 谈判轮次状态存内存态（UI 弹窗内推进），首轮对方开价
  const n = {
    compId, rounds: 0,
    ask: Math.round(ask * 1.18),          // 首轮要价上浮
    floor: Math.round(ask * 0.82),        // 底线（低于它免谈）
    will: willingness(comp, state),
    mood: 50,                              // 谈判情绪，低配出价会激怒对方
    status: 'open',
  };
  state.negotiation = n;
  addLog(state, 'finance', `向 ${comp.name} 发起收购谈判，对方开价 ${(n.ask / 1e8).toFixed(2)} 亿。`);
  return { ok: true, n };
}

// 出价回应：'accept' 接受对方条件 / 数字 = 我方出价
export function negotiateOffer(state, offer) {
  const n = state.negotiation;
  if (!n || n.status !== 'open') return { ok: false, msg: '没有进行中的谈判' };
  const comp = state.competitors.find((x) => x.id === n.compId);
  if (!comp) { state.negotiation = null; return { ok: false, msg: '对方公司已不存在' }; }
  n.rounds += 1;
  if (offer === 'accept') {
    if (state.company.cash < n.ask) return { ok: false, msg: `现金不足（需 ${(n.ask / 1e8).toFixed(2)} 亿）` };
    return finalizeSubsidiary(state, comp, n.ask, '对方接受了你的最终报价');
  }
  offer = Math.round(Number(offer) || 0);
  if (offer <= 0) return { ok: false, msg: '出价必须大于 0' };
  if (state.company.cash < offer) return { ok: false, msg: '现金不足，无法支撑这个报价' };
  const ratio = offer / Math.max(n.ask, 1);
  // 距底线越近越容易接受；低球出价伤情绪，情绪太差对方直接离席
  if (ratio >= 1) {
    return finalizeSubsidiary(state, comp, offer, '对方欣然接受了你的报价');
  }
  n.mood += ratio >= 0.92 ? 6 : ratio >= 0.8 ? 0 : ratio >= 0.65 ? -14 : -28;
  if (n.mood <= 10) {
    n.status = 'walked';
    addLog(state, 'warn', `${comp.name} 认为报价缺乏诚意，终止谈判并离开。`);
    state.negotiation = null;
    return { ok: true, status: 'walked', msg: '对方愤然离席，谈判破裂' };
  }
  // 让步逻辑：出价接近底线时，对方小幅还价
  if (ratio >= 0.8 || (n.rounds >= 2 && ratio >= 0.72)) {
    n.ask = Math.max(n.floor, Math.round(n.ask * (0.94 + Math.random() * 0.05)));
    return { ok: true, status: 'counter', ask: n.ask, msg: `对方还价 ${(n.ask / 1e8).toFixed(2)} 亿，仍有商量余地` };
  }
  return { ok: true, status: 'reject', ask: n.ask, msg: '对方摇头，价格差距太大' };
}

export function walkAway(state) {
  if (state.negotiation) {
    addLog(state, 'finance', '我方主动终止收购谈判。');
    state.negotiation = null;
  }
  return { ok: true };
}

// ---------- 子公司：收购来的品牌 / 自创子品牌 ----------
export function ensureSubsidiaries(state) {
  if (!state.subsidiaries) state.subsidiaries = [];
  return state.subsidiaries;
}

// 收购完成 → 对方变子公司（保留品牌与产品线，独立经营，利润六成分给母公司）
function finalizeSubsidiary(state, comp, cost, note) {
  const c = ensureCapital(state);
  state.company.cash -= cost;
  const idx = state.competitors.findIndex((x) => x.id === comp.id);
  if (idx >= 0) state.competitors.splice(idx, 1);
  comp.sub = true;
  comp.acquiredAt = { ...state.date };
  comp.profitShare = 0.6;
  ensureSubsidiaries(state).push({
    id: comp.id, name: comp.name, nameEn: comp.nameEn || '', color: comp.color,
    brand: comp.brand, source: 'acquired', cost, acquiredAt: { ...state.date },
    lineup: comp.lineup || [], techLevel: comp.techLevel || 0.8, style: comp.style || 'hardware',
    lastProfit: 0,
  });
  const brandGain = clamp(comp.brand * 0.14, 0, 10);
  state.company.brand = clamp(state.company.brand + brandGain, 0, 100);
  c.acquisitions.push({ id: comp.id, name: comp.name, cost, date: { ...state.date }, brandGain: +brandGain.toFixed(1) });
  state.negotiation = null;
  addLog(state, 'finance', `${note}：${comp.name} 并入旗下成为子公司，支出 ${(cost / 1e8).toFixed(2)} 亿，品牌 +${brandGain.toFixed(1)}。`);
  return { ok: true, status: 'done', cost, msg: `${comp.name} 已成为子公司` };
}

// 直接成立子品牌：命名 + 定位，独立产品线（轻量，成本低，不产生收购品牌加成）
export const SUB_POSITIONS = [
  { id: 'online', name: '线上性价比', cost: 5e7, desc: '主打电商渠道性价比，压低 BOM 敏感度' },
  { id: 'premium', name: '高端旗舰', cost: 1.2e8, desc: '独立高端品牌，评分要求高但溢价能力强' },
  { id: 'youth', name: '年轻潮流', cost: 6e7, desc: '面向年轻人群，外观评分权重更高' },
];

export function foundSubsidiary(state, name, nameEn, posId) {
  const pos = SUB_POSITIONS.find((p) => p.id === posId) || SUB_POSITIONS[0];
  if (!name || !name.trim()) return { ok: false, msg: '子品牌需要一个名字' };
  if (state.company.cash < pos.cost) return { ok: false, msg: `资金不足（需 ${(pos.cost / 1e4).toFixed(0)} 万）` };
  if (ensureSubsidiaries(state).length >= 4) return { ok: false, msg: '子品牌已达上限（4 个）' };
  state.company.cash -= pos.cost;
  const id = 'sub_' + uid();
  ensureSubsidiaries(state).push({
    id, name: name.trim(), nameEn: (nameEn || '').trim(), color: SUB_COLORS[state.subsidiaries.length % SUB_COLORS.length],
    brand: 18, source: 'founded', pos: pos.id, cost: pos.cost, foundedAt: { ...state.date },
    lineup: [], techLevel: 0.75, style: 'hardware', lastProfit: 0,
  });
  addLog(state, 'finance', `成立子品牌「${name.trim()}」（${pos.name}定位），投入 ${(pos.cost / 1e4).toFixed(0)} 万。`);
  return { ok: true, id, msg: `子品牌「${name.trim()}」已成立` };
}

const SUB_COLORS = ['#5ec2ff', '#ff9d5c', '#9d7dff', '#5cd69d'];

// 出售子公司：回收残值（估值×折价），品牌微降
export function sellSubsidiary(state, subId) {
  const subs = ensureSubsidiaries(state);
  const idx = subs.findIndex((s) => s.id === subId);
  if (idx < 0) return { ok: false, msg: '找不到该子公司' };
  const sub = subs[idx];
  const val = Math.round((0.5e8 + Math.pow(Math.max(sub.brand, 8), 1.6) * 1.0e5));
  state.company.cash += val;
  state.company.brand = clamp(state.company.brand - 1.5, 0, 100);
  subs.splice(idx, 1);
  addLog(state, 'finance', `出售子公司 ${sub.name}，回收 ${(val / 1e8).toFixed(2)} 亿。`);
  return { ok: true, val, msg: `${sub.name} 已出售，回收 ${(val / 1e8).toFixed(2)} 亿` };
}

// 子公司月度运营：利润六成上缴（收购的）/自创的按定位上缴三成
export function stepSubsidiaries(state, report) {
  const subs = ensureSubsidiaries(state);
  let income = 0;
  for (const sub of subs) {
    sub.brand = clamp(sub.brand + (Math.random() - 0.42) * 0.5, 5, 92);
    const base = (sub.source === 'acquired' ? 1.4e6 : 6e5)
      * (1 + sub.brand / 60) * (1 + (sub.lineup?.length || 0) * 0.35)
      * (0.7 + eraFactorSafe(state));
    const share = sub.source === 'acquired' ? 0.6 : 0.3;
    const profit = Math.round(base * share);
    sub.lastProfit = profit;
    income += profit;
  }
  return income;
}

function eraFactorSafe(state) {
  try {
    // 避免循环依赖，这里用年代粗估
    return clamp((state.date.year - 1980) / 120, 0, 2.2);
  } catch (e) { return 1; }
}

// 收购价：品牌越强越贵（一键收购入口，比谈判贵 25%）
export function acquisitionCost(comp) {
  return Math.round((0.9e8 + Math.pow(Math.max(comp.brand, 10), 1.7) * 1.1e5) * (0.85 + (comp.lineup?.length || 0) * 0.12) * 1.25);
}

export function acquire(state, compId) {
  const comp = state.competitors.find((x) => x.id === compId);
  if (!comp) return { ok: false, msg: '找不到这家公司' };
  if (comp.lineup?.length > 2) return { ok: false, msg: '对方在售机型过多，暂不接受收购' };
  const cost = acquisitionCost(comp);
  if (state.company.cash < cost) return { ok: false, msg: '现金不足，无法完成收购' };
  return finalizeSubsidiary(state, comp, cost, '一键收购达成');
}
