// 财务三表：资产负债表 / 现金流量表（基于现有状态推导，不新增存档字段）
import { BUILDING_MAP } from './campus.js';

const PATENT_VALUE = 200000; // 每项专利的无形资产估值

export function financeSnapshot(state) {
  const cash = Math.max(0, Number(state.company?.cash) || 0);
  const inventory = (state.models || []).reduce(
    (s, m) => s + Math.max(0, Number(m.inventory) || 0) * Math.max(1, Number(m.lastUnitCost) || 0),
    0,
  );
  let land = 0, buildings = 0;
  for (const p of state.campus?.plots || []) {
    if (!p.owned) continue;
    land += Number(p.price) || 0;
    if (p.building) {
      const def = BUILDING_MAP[p.building.typeId];
      const lv = Number(p.building.level) || 1;
      buildings += (def ? def.baseCost : 0) * lv;
    }
  }
  const patents = (state.tech?.patents || []).filter((p) => p.kind === 'patent').length * PATENT_VALUE;
  const loans = (state.loans || []).reduce((a, l) => a + Math.max(0, Number(l.balance) || 0), 0);
  const payable = (state.subsidiaries || []).reduce((a, s) => {
    const pay = s.payment;
    if (!pay || !(pay.monthsLeft > 0)) return a;
    return a + Math.max(0, Number(pay.total - pay.paid) || 0);
  }, 0);
  const currentAssets = cash + inventory;
  const nonCurrent = land + buildings + patents;
  const totalAssets = currentAssets + nonCurrent;
  const debt = loans + payable;
  return {
    cash, inventory, land, buildings, patents,
    currentAssets, nonCurrent, totalAssets,
    loans, payable, debt,
    equity: totalAssets - debt,
  };
}

export function cashFlowSnapshot(state) {
  const h = state.history || [];
  const last = h.slice(-12);
  const netSum = last.reduce((a, x) => a + (Number(x.net) || 0), 0);
  const snap = financeSnapshot(state);
  // 折旧：固定资产按 60 个月直线摊（只影响经营现金流的“非付现”加回）
  const depreciation = Math.round((snap.buildings + snap.land) / 60);
  const op = netSum + depreciation;
  const startRow = h.length > last.length ? h[h.length - last.length - 1] : null;
  const startCash = startRow ? Number(startRow.cash) || 0 : (Number(state.company?.cash) || 0);
  const endCash = Number(state.company?.cash) || 0;
  const delta = endCash - startCash;
  return {
    months: last.length,
    netSum, depreciation, op,
    startCash, endCash, delta,
    // 投资与筹资：现金差额中无法归因到经营的部分
    other: delta - op,
    revenue: last.reduce((a, x) => a + (Number(x.revenue) || 0), 0),
  };
}

export function assetRows(state) {
  const f = financeSnapshot(state);
  return {
    current: [
      ['货币资金', f.cash],
      ['存货（成品）', f.inventory],
    ],
    fixed: [
      ['土地使用权', f.land],
      ['房屋与楼宇', f.buildings],
    ],
    intangible: [
      ['专利', f.patents],
    ],
    liability: [
      ['银行贷款', f.loans],
      ['收购分期应付', f.payable],
    ],
    f,
  };
}