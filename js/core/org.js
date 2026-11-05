// 组织架构：部门专注度、主管任命、高管席位
// 设计原则：部门不该只有"人数"一个变量。专注度决定资源往质量还是成本倾斜，
// 主管决定这支队伍能不能把资源用出来。
import { clamp, pick, rand } from './util.js';
import { DEPT_DEFS, ROLE_BY_DEPT } from './state.js';
import { layoutMoraleBonus, layoutRndBonus } from '../data/furniture.js';

export const EXEC_SEATS = [
  { id: 'ceo', name: 'CEO', desc: '统筹全局，影响所有部门的执行效率' },
  { id: 'cto', name: 'CTO', desc: '技术路线把关，加快研发' },
  { id: 'coo', name: 'COO', desc: '运营效率，压低装配与交付成本' },
  { id: 'cfo', name: 'CFO', desc: '资金调度，降低融资成本' },
  { id: 'cmo', name: 'CMO', desc: '品牌与市场投入的转化效率' },
];

export const FOCUS_HINT = {
  rnd: ['理论优先', '工程优先'],
  design: ['成本外观', '极致设计'],
  prod: ['压低成本', '品质优先'],
  qa: ['抽检为主', '全检为主'],
  supply: ['低价采购', '稳定交付'],
  mkt: ['效果投放', '品牌建设'],
  sales: ['广铺渠道', '深耕地推'],
  fin: ['激进周转', '稳健风控'],
  hr: ['控制人力', '留住人才'],
};

export function ensureOrg(state) {
  if (!state.org) state.org = { heads: {}, execs: {}, history: [] };
  if (!state.org.heads) state.org.heads = {};
  if (!state.org.execs) state.org.execs = {};
  if (!Array.isArray(state.org.history)) state.org.history = [];
  if (!state.company) return state.org;
  const ids = new Set((state.employees || []).map((e) => e.id));
  // 员工离职后主管席位要跟着空出来
  for (const [dept, empId] of Object.entries(state.org.heads)) {
    if (!ids.has(empId)) delete state.org.heads[dept];
  }
  for (const [seat, empId] of Object.entries(state.org.execs)) {
    if (!ids.has(empId)) delete state.org.execs[seat];
  }
  if (state.company.ceo && ids.has(state.company.ceo)) state.org.execs.ceo = state.company.ceo;
  return state.org;
}

export function focusOf(state, deptId) {
  const d = (state.departments || []).find((x) => x.id === deptId);
  return clamp((d?.focus ?? 50) / 100, 0, 1);
}

export function headOf(state, deptId) {
  ensureOrg(state);
  const id = state.org.heads[deptId];
  return id ? (state.employees || []).find((e) => e.id === id) || null : null;
}

export function execOf(state, seat) {
  ensureOrg(state);
  const id = state.org.execs[seat];
  return id ? (state.employees || []).find((e) => e.id === id) || null : null;
}

// 主管加成：能力与沟通各占一半，55 分是及格线
export function leaderBonus(emp) {
  if (!emp) return 0;
  const lv = (emp.skill * 0.6 + (emp.comm || 55) * 0.4 - 55) / 240;
  return clamp(lv, -0.09, 0.2);
}

export function headBonus(state, deptId) {
  return leaderBonus(headOf(state, deptId));
}

// 高管加成：只对对应职能生效
function execBonus(state, seat) {
  return leaderBonus(execOf(state, seat)) * 0.6;
}

export function deptStrength(state, deptId) {
  return (1 + headBonus(state, deptId)) * (1 + execBonus(state, deptId === 'rnd' ? 'cto' : deptId === 'mkt' ? 'cmo' : deptId === 'sales' ? 'cmo' : deptId === 'fin' ? 'cfo' : 'coo'));
}

// ---------- 各职能的专注度效果 ----------
export function fRnd(state) {
  const rackBonus = layoutRndBonus(state);
  return (1 + (focusOf(state, 'rnd') - 0.5) * 0.3 + rackBonus) * deptStrength(state, 'rnd');
}

export function fDesign(state) {
  return (1 + (focusOf(state, 'design') - 0.5) * 0.26) * deptStrength(state, 'design');
}

// 生产：专注度越高，品质分越高，但装配成本也越高
export function fProdQuality(state) {
  return (focusOf(state, 'prod') - 0.5) * 14 * deptStrength(state, 'prod');
}

export function fProdCost(state) {
  return (1 + (focusOf(state, 'prod') - 0.5) * 0.16) / deptStrength(state, 'prod');
}

// 质量部：专注度越高，故障率越低（返回故障率乘数）
export function fQa(state) {
  return (1 - (focusOf(state, 'qa') - 0.5) * 0.5) / deptStrength(state, 'qa');
}

export function fSupply(state) {
  return (1 + (focusOf(state, 'supply') - 0.5) * 0.14) / Math.max(0.5, deptStrength(state, 'supply'));
}

export function fBrand(state) {
  return (1 + (focusOf(state, 'mkt') - 0.5) * 0.3) * deptStrength(state, 'mkt');
}

export function fReach(state) {
  return (1 + (focusOf(state, 'sales') - 0.5) * 0.25) * deptStrength(state, 'sales');
}

export function fInterest(state) {
  return (1 - (focusOf(state, 'fin') - 0.5) * 0.35) / deptStrength(state, 'fin');
}

export function fMorale(state) {
  const furniture = layoutMoraleBonus(state);
  return (focusOf(state, 'hr') - 0.5) * 10 * deptStrength(state, 'hr') + furniture;
}

// 部门等级：决定能挂多少人（GDD 的初创→大型阶段）
export const COMPANY_STAGES = [
  { id: 'startup', name: '初创公司', min: 0, max: 15, desc: '没有严格部门划分，创始人直接管所有事。' },
  { id: 'small', name: '小型企业', min: 16, max: 80, desc: '基本部门成型，可以任命部门主管。' },
  { id: 'mid', name: '中型企业', min: 81, max: 500, desc: '职能细化，管理层级开始拉开。' },
  { id: 'large', name: '大型企业', min: 501, max: Infinity, desc: '完整治理结构，靠制度而不是靠人。' },
];

export function stageOf(state) {
  const n = (state.employees || []).length;
  return COMPANY_STAGES.find((s) => n >= s.min && n <= s.max) || COMPANY_STAGES[0];
}

// 任命与卸任
export function appointHead(state, deptId, empId) {
  ensureOrg(state);
  const e = (state.employees || []).find((x) => x.id === empId);
  if (!e) return { ok: false, msg: '找不到这名员工' };
  if (e.deptId !== deptId) return { ok: false, msg: '只能任命本部门的人当主管' };
  const prev = state.org.heads[deptId];
  if (prev === empId) return { ok: false, msg: '已经是本部门主管' };
  state.org.heads[deptId] = empId;
  state.org.history.unshift({ date: { ...state.date }, text: `${e.name} 出任${DEPT_DEFS.find((d) => d.id === deptId)?.name || deptId}主管` });
  if (state.org.history.length > 60) state.org.history.length = 60;
  return { ok: true, emp: e };
}

export function clearHead(state, deptId) {
  ensureOrg(state);
  const id = state.org.heads[deptId];
  if (!id) return { ok: false, msg: '该部门没有主管' };
  const e = (state.employees || []).find((x) => x.id === id);
  delete state.org.heads[deptId];
  if (e) state.org.history.unshift({ date: { ...state.date }, text: `${e.name} 卸任${DEPT_DEFS.find((d) => d.id === deptId)?.name || deptId}主管` });
  return { ok: true };
}

export function appointExec(state, seat, empId) {
  ensureOrg(state);
  const e = (state.employees || []).find((x) => x.id === empId);
  if (!e) return { ok: false, msg: '找不到这名员工' };
  state.org.execs[seat] = empId;
  if (seat === 'ceo') state.company.ceo = empId;
  state.org.history.unshift({ date: { ...state.date }, text: `${e.name} 出任 ${seat.toUpperCase()}` });
  if (state.org.history.length > 60) state.org.history.length = 60;
  return { ok: true, emp: e };
}

export function clearExec(state, seat) {
  ensureOrg(state);
  if (seat === 'ceo') return { ok: false, msg: 'CEO 席位不能空缺' };
  delete state.org.execs[seat];
  return { ok: true };
}

// 候选人排序：本部门 + 能力高 + 满意度高优先
export function candidatesFor(state, deptId) {
  return (state.employees || [])
    .filter((e) => e.deptId === deptId)
    .slice()
    .sort((a, b) => (b.skill * 0.7 + b.comm * 0.3) - (a.skill * 0.7 + a.comm * 0.3));
}

export function execCandidates(state) {
  return (state.employees || []).slice().sort((a, b) => (b.skill * 0.6 + b.comm * 0.4) - (a.skill * 0.6 + a.comm * 0.4));
}

// 组织架构树（UI 用）
export function orgTree(state) {
  ensureOrg(state);
  const ceo = execOf(state, 'ceo');
  return {
    execs: EXEC_SEATS.map((s) => ({ ...s, emp: execOf(state, s.id) })),
    ceo,
    depts: DEPT_DEFS.map((d) => {
      const emps = (state.employees || []).filter((e) => e.deptId === d.id);
      return {
        ...d,
        head: headOf(state, d.id),
        count: emps.length,
        avgSkill: emps.length ? emps.reduce((s, e) => s + e.skill, 0) / emps.length : 0,
      };
    }),
  };
}
