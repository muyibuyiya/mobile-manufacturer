// 供应链：元器件品类、供应商比价、交期、在途订单、库存覆盖、急采溢价与断供
import { clamp, uid } from './util.js';
import { stakeDiscountByCat } from './equity.js';
import { CAMERAS } from '../data/parts.js';
import { SUPPLIER_MAP, suppliersFor, defaultSupplier } from '../data/suppliers.js';

export const COMPONENTS = [
  { id: 'chip', name: '芯片', icon: '▣', lead: 3, desc: 'SoC、基带与电源管理' },
  { id: 'display', name: '显示面板', icon: '▤', lead: 2, desc: '面板与触控模组' },
  { id: 'memory', name: '存储颗粒', icon: '▥', lead: 2, desc: '内存与闪存' },
  { id: 'camera', name: '摄像头模组', icon: '◎', lead: 2, desc: '镜头、传感器与马达' },
  { id: 'battery', name: '电池', icon: '▮', lead: 1, desc: '电芯与保护板' },
  { id: 'shell', name: '结构件', icon: '▭', lead: 1, desc: '中框、后盖与装配件' },
];

export const COMPONENT_MAP = Object.fromEntries(COMPONENTS.map((c) => [c.id, c]));

// 缺料时走现货市场，单价上浮；提前到货的部分按标准成本
export const SPOT_PREMIUM = 0.16;
export const START_STOCK = 60000;

export function ensureSupply(state) {
  if (!state.supply) state.supply = {};
  const s = state.supply;
  if (!s.stock) s.stock = {};
  if (!Array.isArray(s.orders)) s.orders = [];
  if (!s.priceMul || typeof s.priceMul !== 'object') s.priceMul = {};
  if (!Array.isArray(s.disruptions)) s.disruptions = [];
  for (const c of COMPONENTS) {
    if (!Number.isFinite(Number(s.stock[c.id]))) s.stock[c.id] = START_STOCK;
    s.stock[c.id] = Math.max(0, Math.round(Number(s.stock[c.id])));
    if (!Number.isFinite(Number(s.priceMul[c.id]))) s.priceMul[c.id] = 1;
  }
  // 旧订单没有供应商字段：补成该品类的默认供应商
  for (const o of s.orders) {
    if (!o.supplierId) {
      const def = defaultSupplier(o.cat);
      o.supplierId = def ? def.id : null;
      if (o.priceMul == null) o.priceMul = def ? def.priceMul : 1;
    }
  }
  if (typeof s.auto !== 'boolean') s.auto = false;
  if (!s.monthConsumed) s.monthConsumed = {};
  if (!Number.isFinite(Number(s.lastShortage))) s.lastShortage = 0;
  return s;
}

// ---------- 供应商 ----------
export function supplierQuote(supplier, supplyPower = 0) {
  if (!supplier) return { priceMul: 1, lead: 2 };
  const base = (COMPONENT_MAP[supplier.cat]?.lead ?? 2) + supplier.leadDelta;
  const lead = Math.max(1, base - Math.floor(clamp(supplyPower, 0, 9) / 3));
  return { priceMul: supplier.priceMul, lead };
}

export function disruptionOf(state, supplierId) {
  ensureSupply(state);
  return state.supply.disruptions.find((d) => d.supplierId === supplierId) || null;
}

export function addDisruption(state, supplierId, months = 3, reason = '产能事故') {
  ensureSupply(state);
  const s = state.supply;
  const exist = s.disruptions.find((d) => d.supplierId === supplierId);
  if (exist) {
    exist.monthsLeft = Math.max(exist.monthsLeft, months);
    return exist;
  }
  const inst = { supplierId, monthsLeft: months, reason };
  s.disruptions.push(inst);
  // 在途订单顺延一个月
  for (const o of s.orders) {
    if (o.supplierId === supplierId) o.monthsLeft += 1;
  }
  return inst;
}

export function disruptionList(state) {
  ensureSupply(state);
  return state.supply.disruptions
    .filter((d) => d.monthsLeft > 0)
    .map((d) => ({ ...d, supplier: SUPPLIER_MAP[d.supplierId] }));
}

// 各家报价汇总，供界面比价
export function supplierBoard(state, catId, supplyPower = 0) {
  return suppliersFor(catId).map((sup) => {
    const q = supplierQuote(sup, supplyPower);
    const dis = disruptionOf(state, sup.id);
    return {
      ...sup,
      ...q,
      disrupted: !!dis,
      monthsLeft: dis ? dis.monthsLeft : 0,
    };
  });
}

// 当前库存的综合采购价系数：按实际消耗加权
export function supplyCostMul(state) {
  ensureSupply(state);
  const s = state.supply;
  const disc = stakeDiscountByCat(state);
  let num = 0, den = 0;
  for (const c of COMPONENTS) {
    const w = s.monthConsumed[c.id] || 0;
    const m = (s.priceMul[c.id] ?? 1) * (1 - (disc[c.id] || 0));
    if (w > 0) { num += m * w; den += w; }
  }
  if (den > 0) return clamp(num / den, 0.8, 1.3);
  // 还没消耗过：按品类简单平均
  const vals = COMPONENTS.map((c) => (s.priceMul[c.id] ?? 1) * (1 - (disc[c.id] || 0)));
  return clamp(vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length), 0.8, 1.3);
}

// 单台整机对各类元器件的需求
export function componentNeeds(model) {
  const d = model.design;
  const cam = CAMERAS.find((c) => c.id === d.camera.part) || CAMERAS[0];
  const camUnits = cam.mp > 0 ? Math.max(1, Math.min(4, d.camera.count)) : 0;
  return { chip: 1, display: 1, memory: 1, camera: camUnits, battery: 1, shell: 1 };
}

export function leadTime(state, catId, supplyPower = 0) {
  const c = COMPONENT_MAP[catId];
  if (!c) return 2;
  return Math.max(1, c.lead - Math.floor(clamp(supplyPower, 0, 9) / 3));
}

// 当前库存能支撑多少台（按最紧张的品类计）
export function stockCoverage(state, model) {
  ensureSupply(state);
  const need = componentNeeds(model);
  let cover = Infinity;
  let bottleneck = null;
  for (const [cat, qty] of Object.entries(need)) {
    if (qty <= 0) continue;
    const c = Math.floor((state.supply.stock[cat] || 0) / qty);
    if (c < cover) { cover = c; bottleneck = cat; }
  }
  return { units: Number.isFinite(cover) ? cover : 0, bottleneck, need };
}

export function inTransit(state, catId) {
  ensureSupply(state);
  return state.supply.orders.filter((o) => o.cat === catId).reduce((s, o) => s + o.qty, 0);
}

// 下单：指定供应商。交期 = 品类基准 + 供应商偏移 − 供应链人力；断供中的供应商顺延一个月
export function placeOrder(state, catId, qty, supplyPower = 0, supplierId = null) {
  ensureSupply(state);
  const c = COMPONENT_MAP[catId];
  if (!c) return { ok: false, msg: '未知元器件' };
  qty = Math.round(Number(qty) || 0);
  if (qty <= 0) return { ok: false, msg: '数量必须大于 0' };
  if (qty > 5e7) return { ok: false, msg: '单笔订单过大' };
  const sup = supplierId ? SUPPLIER_MAP[supplierId] : defaultSupplier(catId);
  const q = supplierQuote(sup, supplyPower);
  const dis = disruptionOf(state, sup ? sup.id : null);
  const lead = q.lead + (dis ? 1 : 0);
  state.supply.orders.push({
    id: 'o_' + uid(), cat: catId, qty, monthsLeft: lead,
    supplierId: sup ? sup.id : null,
    priceMul: q.priceMul,
    placed: { ...state.date },
  });
  // 记录该品类最近的采购价系数，bomUnit 用 supplyCostMul 加权
  state.supply.priceMul[catId] = q.priceMul;
  return { ok: true, lead, qty, supplier: sup ? sup.name : null, disrupted: !!dis };
}

export function stepSupply(state, report) {
  const s = ensureSupply(state);
  // 断供倒计时
  for (const d of s.disruptions) d.monthsLeft -= 1;
  s.disruptions = s.disruptions.filter((d) => d.monthsLeft > 0);
  // 到货结算
  for (const o of s.orders) {
    o.monthsLeft -= 1;
    if (o.monthsLeft <= 0) {
      s.stock[o.cat] = (s.stock[o.cat] || 0) + o.qty;
      const sup = o.supplierId ? SUPPLIER_MAP[o.supplierId] : null;
      report.notes.push(`${COMPONENT_MAP[o.cat].name} ${Math.round(o.qty / 1000)}k 件到货${sup ? `（${sup.name}）` : ''}。`);
    }
  }
  s.orders = s.orders.filter((o) => o.monthsLeft > 0);
  // 自动补货：把在途与库存补到两个月用量（沿用每家上次选定的供应商）
  if (s.auto) {
    for (const c of COMPONENTS) {
      const burn = (s.monthConsumed[c.id] || 0) || 1;
      const target = burn * 2;
      const have = (s.stock[c.id] || 0) + inTransit(state, c.id);
      if (have < target * 0.6) {
        const last = s.orders.filter((o) => o.cat === c.id).at(-1);
        placeOrder(state, c.id, Math.round(target - have), 0, last?.supplierId || null);
      }
    }
  }
  s.monthConsumed = {};
}

// 消耗元器件：先用库存，缺口走现货并返回溢价台数
export function consumeComponents(state, model, qty) {
  ensureSupply(state);
  const need = componentNeeds(model);
  const covered = Math.min(qty, stockCoverage(state, model).units);
  const spot = Math.max(0, qty - covered);
  for (const [cat, per] of Object.entries(need)) {
    if (per <= 0) continue;
    const used = per * covered;
    state.supply.stock[cat] = Math.max(0, (state.supply.stock[cat] || 0) - used);
    state.supply.monthConsumed[cat] = (state.supply.monthConsumed[cat] || 0) + used + per * spot;
  }
  state.supply.lastShortage = spot;
  return { covered, spot };
}

// 库存周转天数：以最近一个月的实际消耗为基准
export function turnoverDays(state, monthlyBurn) {
  ensureSupply(state);
  const stock = Object.values(state.supply.stock).reduce((a, b) => a + b, 0);
  const burn = monthlyBurn && monthlyBurn > 0
    ? monthlyBurn
    : Object.values(state.supply.monthConsumed || {}).reduce((a, b) => a + b, 0);
  if (!burn) return null;
  return Math.round((stock / burn) * 30);
}

export function supplyHealth(state, model) {
  const cover = stockCoverage(state, model);
  const target = model?.productionTarget || 0;
  // 没有排产时需求是 0，不能拿 1 台当分母，否则任何库存都算「充足」
  if (target <= 0) return { label: '尚未排产', tone: 'dim', ratio: 0, cover };
  const ratio = clamp(cover.units / target, 0, 1.4);
  if (ratio >= 1) return { label: '库存充足', tone: 'good', ratio, cover };
  if (ratio >= 0.5) return { label: '库存偏紧', tone: 'warn', ratio, cover };
  return { label: '面临缺料', tone: 'bad', ratio, cover };
}
