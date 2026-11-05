// 售后保修政策：保修期长短权衡成本与口碑
// 更长保修 → 月售后成本上升，但退货率降低（用户更愿维修而非退货）、评分微加成
import { clamp } from './util.js';

export const WARRANTY_POLICIES = [
  { id: 'w90', name: '90 天保修', years: 0.25, costMul: 0.55, returnsCut: 0.0, ratingAdd: 0, desc: '成本最低，但用户口碑无加成。' },
  { id: 'w1y', name: '1 年保修', years: 1, costMul: 1.0, returnsCut: 0.15, ratingAdd: 0.6, desc: '行业标准，退货略降。' },
  { id: 'w18', name: '18 个月保修', years: 1.5, costMul: 1.35, returnsCut: 0.28, ratingAdd: 1.2, desc: '超出行业半步，口碑小增。' },
  { id: 'w2y', name: '2 年保修', years: 2, costMul: 1.8, returnsCut: 0.42, ratingAdd: 2.2, desc: '主打售后信心，成本高但差评率显著下降。' },
];
export const WARRANTY_MAP = Object.fromEntries(WARRANTY_POLICIES.map((p) => [p.id, p]));

export function ensureWarranty(state) {
  if (!state.company.warrantyPolicy) state.company.warrantyPolicy = 'w1y';
  return state.company.warrantyPolicy;
}

export function setWarrantyPolicy(state, id) {
  if (!WARRANTY_MAP[id]) return { ok: false, msg: '未知保修方案' };
  ensureWarranty(state);
  state.company.warrantyPolicy = id;
  return { ok: true, msg: `保修政策切换为「${WARRANTY_MAP[id].name}」` };
}

export function warrantyOf(state) {
  return WARRANTY_MAP[ensureWarranty(state)] || WARRANTY_MAP.w1y;
}

// 返修/退货月成本（sim 月度调用）
export function warrantyCost(state, report) {
  const pol = warrantyOf(state);
  const revenue = report.revenue || 0;
  const units = report.units || 0;
  const defectMul = 1 + (report.returns || 0) / 100 * 7;
  return (revenue * 0.008 + units * 6 * defectMul) * pol.costMul;
}

// 退货率削减系数（reviews.js 调用）
export function returnsCutOf(state) {
  return warrantyOf(state).returnsCut;
}

// 用户评分加成
export function warrantyRatingAdd(state) {
  return warrantyOf(state).ratingAdd;
}
