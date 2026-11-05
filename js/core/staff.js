// 员工成长：职级体系与培训项目
import { clamp } from './util.js';
import { addLog } from './state.js';

// 职级由能力决定，决定岗位称呼与薪资期望
export const RANKS = [
  { lv: 1, name: '初级', min: 0, pay: 1.0, color: '#8b98a8' },
  { lv: 2, name: '中级', min: 56, pay: 1.12, color: '#4aa3ff' },
  { lv: 3, name: '高级', min: 68, pay: 1.26, color: '#37c9a5' },
  { lv: 4, name: '资深', min: 80, pay: 1.45, color: '#c47cf0' },
  { lv: 5, name: '专家', min: 90, pay: 1.72, color: '#f5c542' },
];

export function rankOf(skill) {
  let r = RANKS[0];
  for (const x of RANKS) if (skill >= x.min) r = x;
  return r;
}

export const TRAININGS = [
  {
    id: 'skill', name: '技能培训', icon: '⌬', months: 3, costPerMonth: 5200,
    desc: '内部导师带教与专项课程，直接提升专业能力。',
    effect: { skill: 6.5, satisfaction: 3 },
  },
  {
    id: 'mgmt', name: '管理训练营', icon: '☰', months: 3, costPerMonth: 7600,
    desc: '面向骨干的执行力与协作训练，提升效率与沟通。',
    effect: { eff: 5.5, comm: 6, loyalty: 3 },
  },
  {
    id: 'creative', name: '海外研修', icon: '✈', months: 4, costPerMonth: 13000,
    desc: '赴海外设计中心交流，创造力大幅提升。',
    effect: { creativity: 8.5, satisfaction: 5, loyalty: 4 },
  },
  {
    id: 'quality', name: '质量体系认证', icon: '✓', months: 2, costPerMonth: 6100,
    desc: '六西格玛与可靠性工程训练，改善品质意识。',
    effect: { skill: 2.5, quality: 7, satisfaction: 2 },
  },
];

export const TRAINING_MAP = Object.fromEntries(TRAININGS.map((t) => [t.id, t]));

export function trainingCost(state, program) {
  const yearFactor = 0.6 + (state.date.year - 1990) / 60;
  return Math.round(program.costPerMonth * clamp(yearFactor, 0.4, 2.4) / 100) * 100;
}

export function startTraining(state, empId, programId) {
  const e = state.employees.find((x) => x.id === empId);
  const p = TRAINING_MAP[programId];
  if (!e) return { ok: false, msg: '员工不存在' };
  if (!p) return { ok: false, msg: '未知培训项目' };
  if (e.training) return { ok: false, msg: `${e.name} 已在培训中` };
  const monthly = trainingCost(state, p);
  if (state.company.cash < monthly) return { ok: false, msg: '资金不足，无法支付培训费用' };
  e.training = { id: programId, monthsLeft: p.months, monthsTotal: p.months, monthly };
  return { ok: true, monthly };
}

export function cancelTraining(state, empId) {
  const e = state.employees.find((x) => x.id === empId);
  if (!e || !e.training) return { ok: false, msg: '该员工没有进行中的培训' };
  const paid = e.training.monthly * (e.training.monthsTotal - e.training.monthsLeft);
  e.training = null;
  return { ok: true, paid };
}

// 每月推进：扣费、倒计时、结业加成
export function stepTraining(state, report) {
  let spend = 0;
  for (const e of state.employees) {
    if (!e.training) continue;
    const p = TRAINING_MAP[e.training.id];
    if (!p) { e.training = null; continue; }
    const monthly = e.training.monthly || trainingCost(state, p);
    if (state.company.cash < monthly) {
      report.notes.push(`资金不足，${e.name} 的培训暂停。`);
      continue;
    }
    state.company.cash -= monthly;
    spend += monthly;
    e.training.monthsLeft -= 1;
    if (e.training.monthsLeft > 0) continue;

    // 结业
    const eff = p.effect || {};
    if (eff.skill) e.skill = +clamp(e.skill + eff.skill, 1, 99).toFixed(2);
    if (eff.eff) e.eff = Math.round(clamp(e.eff + eff.eff, 1, 100));
    if (eff.comm) e.comm = Math.round(clamp(e.comm + eff.comm, 1, 100));
    if (eff.creativity) e.creativity = Math.round(clamp(e.creativity + eff.creativity, 1, 100));
    if (eff.loyalty) e.loyalty = Math.round(clamp(e.loyalty + eff.loyalty, 1, 100));
    if (eff.satisfaction) e.satisfaction = clamp(e.satisfaction + eff.satisfaction, 0, 100);
    e.quality = Math.round(clamp((e.quality || 55) + (eff.quality || 0), 1, 100));
    e.trained = (e.trained || 0) + 1;
    e.training = null;
    const rank = rankOf(e.skill);
    e.expectSalary = Math.round(Math.max(e.salary, e.salary * rank.pay) / 100) * 100;
    addLog(state, 'hr', `${e.name} 完成「${p.name}」，能力提升至 ${Math.round(e.skill)}（${rank.name}）。`);
    report.notes.push(`${e.name} 完成${p.name}培训。`);
  }
  report.training = Math.round(spend);
}

export function trainingSummary(state) {
  const inTraining = state.employees.filter((e) => e.training);
  const monthly = inTraining.reduce((s, e) => s + (e.training.monthly || 0), 0);
  return { count: inTraining.length, monthly };
}

export function rankDistribution(state) {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const e of state.employees) out[rankOf(e.skill).lv] += 1;
  return out;
}
