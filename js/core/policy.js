// 政策推进与查询：state.policies 存放进行中的政策实例
import { POLICY_MAP, eligiblePolicies } from '../data/policies.js';
import { clamp, randInt, chance } from './util.js';

export function ensurePolicies(state) {
  if (!Array.isArray(state.policies)) state.policies = [];
  return state.policies;
}

export function activePolicies(state) {
  return ensurePolicies(state)
    .filter((p) => p.monthsLeft > 0)
    .map((p) => ({ ...p, policy: POLICY_MAP[p.policyId] }))
    .filter((p) => p.policy);
}

// 乘法效果汇总（与事件 activeMul 相乘叠加）
export function policyMul(state, key) {
  let mul = 1;
  for (const p of activePolicies(state)) {
    const v = p.policy.effects[key];
    if (typeof v === 'number' && key !== 'taxAdd' && key !== 'tariffAdd' && key !== 'morale') mul *= v;
  }
  return mul;
}

// 加法效果汇总（税率、关税、满意度）
export function policyAdd(state, key) {
  let add = 0;
  for (const p of activePolicies(state)) {
    const v = p.policy.effects[key];
    if (typeof v === 'number' && (key === 'taxAdd' || key === 'tariffAdd' || key === 'morale')) add += v;
  }
  return add;
}

export function policyActive(state, policyId) {
  return ensurePolicies(state).some((p) => p.policyId === policyId && p.monthsLeft > 0);
}

// 手动/事件触发的政策
export function triggerPolicy(state, policyId, months = null) {
  const def = POLICY_MAP[policyId];
  if (!def) return null;
  const list = ensurePolicies(state);
  const exist = list.find((p) => p.policyId === policyId && p.monthsLeft > 0);
  if (exist) {
    if (months) exist.monthsLeft = Math.max(exist.monthsLeft, months);
    return exist;
  }
  const dur = months || randInt(def.months[0], def.months[1]);
  const inst = { policyId, monthsLeft: dur, started: { ...state.date } };
  list.push(inst);
  return inst;
}

export function endPolicy(state, policyId) {
  const list = ensurePolicies(state);
  const inst = list.find((p) => p.policyId === policyId && p.monthsLeft > 0);
  if (inst) inst.monthsLeft = 0;
  return !!inst;
}

// 月度推进：倒计时 + 按年代与权重随机触发新政策
export function stepPolicies(state, report) {
  const list = ensurePolicies(state);
  for (const p of list) p.monthsLeft -= 1;
  const expired = list.filter((p) => p.monthsLeft === 0).map((p) => POLICY_MAP[p.policyId]?.name).filter(Boolean);
  state.policies = list.filter((p) => p.monthsLeft > 0);
  for (const name of expired) report.notes.push(`${name}已到期结束。`);

  const year = state.date.year;
  const pool = eligiblePolicies(year).filter((p) => !policyActive(state, p.id));
  if (pool.length && chance(0.09)) {
    const weights = pool.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * weights;
    let picked = pool[0];
    for (const p of pool) { r -= p.weight; if (r <= 0) { picked = p; break; } }
    triggerPolicy(state, picked.id);
    report.notes.push(`新政策生效：${picked.name} —— ${picked.desc}`);
  }
  return activePolicies(state);
}

export function policySummary(state) {
  return activePolicies(state);
}
