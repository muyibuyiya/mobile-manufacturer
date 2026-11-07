// 资本运作：估值、融资轮次、IPO 上市、收购竞品
import { clamp, rand, uid, chance, fmtMoney } from './util.js';
import { addLog, generateEmployee } from './state.js';
import { TECHS } from '../data/tech.js';

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

export function openNegotiation(state, compId, opts = {}) {
  ensureCapital(state);
  const comp = state.competitors.find((x) => x.id === compId);
  if (!comp) return { ok: false, msg: '找不到这家公司' };
  if (comp.sub) return { ok: false, msg: '这已经是你的子公司' };
  const def = compDefense(comp);
  // 反收购防御：品牌越强、产品线越健康，对方开价越高、越难谈
  const base = Math.round(askPrice(comp) * (1 + def * 0.18));
  const n = {
    compId, rounds: 0,
    ask: Math.round(base * 1.18),          // 首轮要价上浮
    floor: Math.round(base * 0.82),        // 底线（低于它免谈）
    will: willingness(comp, state),
    mood: 50,                              // 谈判情绪，低配出价会激怒对方
    status: 'open',
    defense: def,
    hostile: !!opts.hostile,
    payMode: 'cash',
    charmUsed: 0,
  };
  if (n.hostile) {
    if (state.company.brand < 55) return { ok: false, msg: '品牌力达到 55 才能发起敌意收购' };
    const price = Math.round(base * 1.35);
    if (state.company.cash < price) return { ok: false, msg: `敌意收购需要现金 ${(price / 1e8).toFixed(2)} 亿` };
    n.ask = price;
    n.floor = price;
    n.mood = 28;
    state.company.brand = clamp(state.company.brand - 0.8, 0, 100);
    state.negotiation = n;
    addLog(state, 'warn', `对 ${comp.name} 发起敌意收购（溢价 35%），行业舆论哗然，品牌 -0.8。`);
    return { ok: true, n };
  }
  state.negotiation = n;
  addLog(state, 'finance', `向 ${comp.name} 发起收购谈判，对方开价 ${(n.ask / 1e8).toFixed(2)} 亿（防御等级 ${Math.round(def * 100)}%）。`);
  return { ok: true, n };
}

// 支付方式：现金一次付清 / 分期 12 期 / 换股
export const PAY_MODES = [
  { id: 'cash', name: '现金一次付清', premium: 1, desc: '当场付清，无额外成本。' },
  { id: 'installment', name: '分期付款 12 期', premium: 1.08, desc: '首付 35%，余款 12 个月付清（含 8% 资金成本）。' },
  { id: 'equity', name: '换股收购', premium: 1.12, desc: '以母公司股份支付，稀释现有股东（含 12% 溢价）。' },
];
const PAY_MODE_MAP = Object.fromEntries(PAY_MODES.map((p) => [p.id, p]));

export function dealPrice(n, mode) {
  const pm = PAY_MODE_MAP[mode] || PAY_MODES[0];
  return Math.round((n?.ask || 0) * pm.premium);
}

// 目标公司的反收购防御强度（0~0.9）：品牌、产品线、现金储备共同决定
export function compDefense(comp) {
  if (!comp) return 0;
  return clamp(
    (comp.brand || 0) / 160 + (comp.lineup?.length || 0) * 0.06 + ((comp.cash || 0) > 5e9 ? 0.15 : 0),
    0, 0.9,
  );
}

function fundCheck(state, total, mode) {
  if (mode === 'equity') {
    if (founderPct(state) <= 25) return { ok: false, msg: '创始团队持股已低于 25%，无法再用股份支付' };
    return { ok: true };
  }
  if (mode === 'installment') {
    const first = Math.round(total * 0.35);
    if (state.company.cash < first) return { ok: false, msg: `首付不足（需 ${(first / 1e8).toFixed(2)} 亿）` };
    return { ok: true };
  }
  if (state.company.cash < total) return { ok: false, msg: `现金不足（需 ${(total / 1e8).toFixed(2)} 亿）` };
  return { ok: true };
}

export function setPayMode(state, mode) {
  const n = state.negotiation;
  if (!n || n.status !== 'open') return { ok: false, msg: '没有进行中的谈判' };
  if (!PAY_MODE_MAP[mode]) return { ok: false, msg: '未知的支付方式' };
  if (n.hostile && mode !== 'cash') return { ok: false, msg: '敌意收购只接受现金一次付清' };
  n.payMode = mode;
  return { ok: true, msg: `支付方式已改为「${PAY_MODE_MAP[mode].name}」` };
}

// 公关游说：花钱降低对方防御与要价（最多 3 次）
export function charmTarget(state) {
  const n = state.negotiation;
  if (!n || n.status !== 'open') return { ok: false, msg: '没有进行中的谈判' };
  if ((n.charmUsed || 0) >= 3) return { ok: false, msg: '对方董事会已经不愿再私下接触' };
  const cost = Math.round((n.ask || 0) * 0.02);
  if (state.company.cash < cost) return { ok: false, msg: `游说资金不足（需 ${(cost / 1e8).toFixed(2)} 亿）` };
  state.company.cash -= cost;
  n.charmUsed = (n.charmUsed || 0) + 1;
  n.defense = clamp((n.defense || 0) - 0.12, 0, 0.9);
  n.mood = clamp((n.mood || 50) + 6, 0, 100);
  n.ask = Math.round((n.ask || 0) * 0.98);
  addLog(state, 'finance', `向收购目标董事会展开公关游说，花费 ${(cost / 1e8).toFixed(2)} 亿，防御下降。`);
  return { ok: true, msg: `游说见效：防御 -12%，要价小幅下调（花费 ${(cost / 1e8).toFixed(2)} 亿）` };
}

// 出价回应：'accept' 接受对方条件 / 数字 = 我方出价（总价，未含支付方式溢价）
export function negotiateOffer(state, offer, terms = {}) {
  const n = state.negotiation;
  if (!n || n.status !== 'open') return { ok: false, msg: '没有进行中的谈判' };
  const comp = state.competitors.find((x) => x.id === n.compId);
  if (!comp) { state.negotiation = null; return { ok: false, msg: '对方公司已不存在' }; }
  if (terms.mode && PAY_MODE_MAP[terms.mode]) n.payMode = terms.mode;
  const mode = n.payMode || 'cash';
  n.rounds += 1;
  if (offer === 'accept') {
    const cost = dealPrice(n, mode);
    const fund = fundCheck(state, cost, mode);
    if (!fund.ok) return fund;
    return finalizeSubsidiary(state, comp, cost, '对方接受了你的最终报价', { mode, hostile: n.hostile });
  }
  offer = Math.round(Number(offer) || 0);
  if (offer <= 0) return { ok: false, msg: '出价必须大于 0' };
  const cost = Math.round(offer * (PAY_MODE_MAP[mode] || PAY_MODES[0]).premium);
  const fund = fundCheck(state, cost, mode);
  if (!fund.ok) return fund;
  const ratio = offer / Math.max(n.ask, 1);
  // 距底线越近越容易接受；低球出价伤情绪，情绪太差对方直接离席
  if (ratio >= 1) {
    return finalizeSubsidiary(state, comp, cost, '对方欣然接受了你的报价', { mode, hostile: n.hostile });
  }
  // 敌意收购：不接受讨价还价，防御越高越可能直接拒绝
  if (n.hostile) {
    if (Math.random() < clamp(0.45 + (n.defense || 0) * 0.4 - ratio * 0.25, 0.15, 0.9)) {
      n.status = 'walked';
      state.company.brand = clamp(state.company.brand - 1.2, 0, 100);
      state.company.reputation = clamp(state.company.reputation - 2, 0, 100);
      addLog(state, 'bad', `${comp.name} 董事会强硬拒绝敌意收购，公关形象受损（品牌 -1.2，口碑 -2）。`);
      state.negotiation = null;
      return { ok: true, status: 'walked', msg: '敌意收购被董事会强硬拒绝，谈判破裂' };
    }
    // 敌意收购不接受还价：只能按当前要价成交
    return { ok: true, status: 'reject', ask: n.ask, msg: '董事会拒绝降价，只能按当前要价成交' };
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
  if (!Array.isArray(state.subsidiaries)) state.subsidiaries = [];
  for (const sub of state.subsidiaries) {
    if (!sub || typeof sub !== 'object') continue;
    if (!Array.isArray(sub.lineup)) sub.lineup = [];
    if (!Number.isFinite(Number(sub.brand))) sub.brand = 18;
    if (!Number.isFinite(Number(sub.lastProfit))) sub.lastProfit = 0;
    if (typeof sub.payMode !== 'string') sub.payMode = 'cash';
    if (!Number.isFinite(Number(sub.techShare))) sub.techShare = 0;
    if (sub.payment && (!Number.isFinite(Number(sub.payment.monthsLeft)) || Number(sub.payment.monthsLeft) <= 0)) sub.payment = null;
  }
  return state.subsidiaries;
}

// 收购完成 → 对方变子公司（保留品牌与产品线，独立经营，利润上缴母公司）
// terms.mode：cash 现金一次付清 / installment 分期（首付 35%）/ equity 换股（稀释母公司股东）
function finalizeSubsidiary(state, comp, cost, note, terms = {}) {
  const c = ensureCapital(state);
  const mode = terms.mode || 'cash';
  const hostile = !!terms.hostile;
  let firstPaid = cost;
  if (mode === 'installment') {
    firstPaid = Math.round(cost * 0.35);
    state.company.cash -= firstPaid;
  } else if (mode === 'equity') {
    const pre = valuationOf(state);
    const pct = clamp((cost / (pre + cost)) * 100, 0, 45);
    for (const h of c.holders) h.pct -= h.pct * (pct / 100);
    c.holders.push({ name: `${comp.name} 原股东`, pct: +pct.toFixed(2) });
    c.holders.sort((a, b) => b.pct - a.pct);
    firstPaid = 0;
    addLog(state, 'finance', `以换股方式支付收购对价，原股东获得 ${pct.toFixed(1)}% 母公司股份。`);
  } else {
    state.company.cash -= cost;
  }
  const idx = state.competitors.findIndex((x) => x.id === comp.id);
  if (idx >= 0) state.competitors.splice(idx, 1);
  comp.sub = true;
  comp.acquiredAt = { ...state.date };
  comp.profitShare = 0.6;
  ensureSubsidiaries(state).push({
    id: comp.id, name: comp.name, nameEn: comp.nameEn || '', color: comp.color,
    brand: comp.brand, source: 'acquired', cost, acquiredAt: { ...state.date },
    lineup: comp.lineup || [], techLevel: comp.techLevel || 0.8, style: comp.style || 'hardware',
    lastProfit: 0, payMode: mode, techShare: 0,
    payment: mode === 'installment'
      ? { total: cost, paid: firstPaid, monthsLeft: 12, perMonth: Math.round(cost * 0.65 * 1.06 / 12) }
      : null,
  });
  const brandGain = clamp(comp.brand * (hostile ? 0.1 : 0.14), 0, 10);
  state.company.brand = clamp(state.company.brand + brandGain, 0, 100);
  if (hostile) {
    state.company.reputation = clamp(state.company.reputation - 2, 0, 100);
    state.news = state.news || [];
    state.news.unshift({
      time: `${state.date.year}/${state.date.month + 1}`, type: 'attack',
      title: `${comp.name} 被敌意收购`,
      text: `${state.company.name} 以溢价 35% 强行完成收购，行业震动（口碑 -2）。`, read: false,
    });
    if (state.news.length > 100) state.news.length = 100;
  }
  c.acquisitions.push({
    id: comp.id, name: comp.name, cost, date: { ...state.date }, brandGain: +brandGain.toFixed(1),
    mode, hostile,
  });
  state.negotiation = null;
  const payText = mode === 'installment' ? `（分期：首付 ${(firstPaid / 1e8).toFixed(2)} 亿，余款 12 期）`
    : mode === 'equity' ? '（换股支付）' : '';
  addLog(state, 'finance', `${note}：${comp.name} 并入旗下成为子公司，对价 ${(cost / 1e8).toFixed(2)} 亿${payText}，品牌 +${brandGain.toFixed(1)}。`);
  return { ok: true, status: 'done', cost, mode, msg: `${comp.name} 已成为子公司` };
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

// 集团技术共享：母公司四部门的等级越高，子品牌产品的成本/溢价能力越强
export function subsidiaryTechShare(state, sub) {
  const d = state.divisions || {};
  let lv = 0;
  for (const id of ['chip', 'optics', 'osd', 'panel']) lv += d[id]?.level || 0;
  let share = clamp(lv * 0.02, 0, 0.18);
  if (sub?.source === 'acquired') share *= 0.8;
  return +share.toFixed(3);
}

// 子品牌手动发布新品：花费低于母公司，享受技术共享加成
export function subRelease(state, subId) {
  const sub = ensureSubsidiaries(state).find((s) => s.id === subId);
  if (!sub) return { ok: false, msg: '找不到该子公司' };
  const share = subsidiaryTechShare(state, sub);
  const cost = Math.round(6e5 * (1 + share * 2.5));
  if (state.company.cash < cost) return { ok: false, msg: `资金不足（需 ${(cost / 1e4).toFixed(0)} 万）` };
  state.company.cash -= cost;
  sub.lineup = sub.lineup || [];
  const series = ['X', 'S', 'Air', 'Note'][Math.floor(Math.random() * 4)];
  const price = Math.round((1200 + sub.brand * 42) * (0.9 + Math.random() * 0.3) * (1 + share));
  sub.lineup.push({
    name: `${sub.name} ${series}${sub.lineup.length + 1}`,
    price, age: 0,
    tier: sub.pos || 'online',
    techShare: share,
  });
  if (sub.lineup.length > 3) sub.lineup.shift();
  sub.brand = clamp(sub.brand + 0.6, 5, 92);
  state.company.brand = clamp(state.company.brand + 0.2, 0, 100);
  addLog(state, 'finance', `子品牌 ${sub.name} 发布新品，定价 ${fmtMoney(price)}（技术共享 +${Math.round(share * 100)}%），投入 ${(cost / 1e4).toFixed(0)} 万。`);
  state.news = state.news || [];
  state.news.unshift({
    time: `${state.date.year}/${state.date.month + 1}`, type: 'group',
    title: `${sub.name} 发布新品`,
    text: `定价 ${fmtMoney(price)} · 集团技术共享 +${Math.round(share * 100)}%。`, read: false,
  });
  if (state.news.length > 100) state.news.length = 100;
  return { ok: true, msg: `${sub.name} 新品已发布，定价 ${fmtMoney(price)}` };
}

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
  const year = state.date.year;
  for (const sub of subs) {
    sub.brand = clamp(sub.brand + (Math.random() - 0.42) * 0.5, 5, 92);
    // 集团技术共享（四部门等级总和）→ 直接提升上缴利润
    sub.techShare = subsidiaryTechShare(state, sub);
    // 分期收购：每月向原股东付款；现金见底会伤品牌与信用
    if (sub.payment && sub.payment.monthsLeft > 0) {
      const due = Math.min(sub.payment.perMonth, Math.max(0, sub.payment.total - sub.payment.paid));
      if (due > 0) {
        state.company.cash -= due;
        sub.payment.paid += due;
        sub.payment.monthsLeft -= 1;
        report.subPayments = (report.subPayments || 0) + due;
        if (state.company.cash < 0) {
          sub.brand = clamp(sub.brand - 1.2, 5, 92);
          report.notes.push(`${sub.name} 的分期收购款未能按时支付，品牌与信用受损。`);
        }
      }
      if (sub.payment.monthsLeft <= 0 || sub.payment.paid >= sub.payment.total - 1) sub.payment = null;
    }
    const base = (sub.source === 'acquired' ? 1.4e6 : 6e5)
      * (1 + sub.brand / 60) * (1 + (sub.lineup?.length || 0) * 0.35)
      * (0.7 + eraFactorSafe(state))
      * (1 + (sub.techShare || 0));
    const share = sub.source === 'acquired' ? 0.6 : 0.3;
    const profit = Math.round(base * share);
    sub.lastProfit = profit;
    income += profit;
    // ---- 集团矩阵：自主发品（集团声量）----
    sub.lastRelease = (sub.lastRelease || 0) + 1;
    if (sub.lastRelease >= 9 && chance(0.35)) {
      sub.lastRelease = 0;
      sub.lineup = sub.lineup || [];
      const series = ['X', 'S', 'Air', 'Note'][Math.floor(Math.random() * 4)];
      sub.lineup.push({ name: `${sub.name} ${series}${sub.lineup.length + 1}`, price: Math.round((1200 + sub.brand * 42) * (0.9 + Math.random() * 0.3)), age: 0 });
      if (sub.lineup.length > 3) sub.lineup.shift();
      state.company.brand = clamp(state.company.brand + 0.5, 0, 100);
      const title = `子公司 ${sub.name} 发布新品`;
      report.notes.push(`${title}，集团声量上升（品牌 +0.5）。`);
      addLog(state, 'finance', `${title}。`);
      state.news = state.news || [];
      state.news.unshift({ time: `${year}/${state.date.month + 1}`, type: 'group', title, text: `${sub.name} 新品上市，集团品牌 +0.5。`, read: false });
      if (state.news.length > 100) state.news.length = 100;
    }
    // ---- 技术转让要约：价约为市面引进价一半（1.3×研发成本 vs 2.4×）----
    if (chance(0.045) && !state.subTechOffer) {
      const cands = TECHS.filter((t) => t.year <= year && !state.tech.unlocked.includes(t.id) && t.prereq.every((p2) => state.tech.unlocked.includes(p2)));
      if (cands.length) {
        const t = cands[Math.floor(Math.random() * cands.length)];
        state.subTechOffer = { subId: sub.id, subName: sub.name, techId: t.id, techName: t.name, price: Math.round(t.cost * 1.3), months: 3 };
        addLog(state, 'tech', `${sub.name} 提出转让技术「${t.name}」的要约。`);
      }
    }
    // ---- 员工互派：子公司输送 1 名成熟工程师（免入职费）----
    if (chance(0.04) && !state.subEmployeeOffer) {
      state.subEmployeeOffer = { subId: sub.id, subName: sub.name, emp: generateEmployee(year, { skillMean: 66 + sub.brand * 0.12 }), months: 3 };
    }
    if (state.subTechOffer && --state.subTechOffer.months <= 0) state.subTechOffer = null;
    if (state.subEmployeeOffer && --state.subEmployeeOffer.months <= 0) state.subEmployeeOffer = null;
  }
  return income;
}

// 要约响应
export function acceptSubTech(state) {
  const o = state.subTechOffer;
  if (!o) return { ok: false, msg: '没有待处理的转让要约' };
  if (!ensureSubsidiaries(state).some((s2) => s2.id === o.subId)) { state.subTechOffer = null; return { ok: false, msg: '子公司不存在' }; }
  if (state.tech.unlocked.includes(o.techId)) { state.subTechOffer = null; return { ok: false, msg: '已掌握该技术' }; }
  if (state.company.cash < o.price) return { ok: false, msg: '资金不足' };
  state.company.cash -= o.price;
  state.tech.unlocked.push(o.techId);
  addLog(state, 'tech', `${o.subName} 转让技术「${o.techName}」，支出 ${fmtMoney(o.price)}。`);
  state.subTechOffer = null;
  return { ok: true, msg: `已受让技术「${o.techName}」` };
}
export function declineSubTech(state) { state.subTechOffer = null; return { ok: true, msg: '已婉拒转让要约' }; }
export function acceptSubEmployee(state) {
  const o = state.subEmployeeOffer;
  if (!o || !o.emp) return { ok: false, msg: '没有待处理的推荐' };
  const emp = o.emp;
  emp.salary = Math.round(emp.salary * 1.05 / 100) * 100;
  state.employees.push(emp);
  addLog(state, 'hr', `${o.subName} 推荐的 ${emp.name}（${emp.role}，能力 ${emp.skill}）入职，免入职费。`);
  state.subEmployeeOffer = null;
  return { ok: true, msg: `${emp.name} 已入职` };
}
export function declineSubEmployee(state) { state.subEmployeeOffer = null; return { ok: true, msg: '已婉拒推荐' }; }

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
