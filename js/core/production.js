// 生产线：装配工艺等级 + 自动化程度
//
// 两者的分工：
// - 工艺（process）决定"做得好不好"：良率、装配成本、上限产能。
// - 自动化（automation）决定"用多少人做"：产能放大、人工下降，但每月固定折旧与维护费上升。
//
// 只对自建产线（production.mode === 'own'）生效；委托代工时由代工厂自己的工艺决定。
import { clamp } from './util.js';

export const PROCESS_LEVELS = [
  { lv: 0, name: '手工作业', yield: 0.0, costCut: 0.0, capMul: 1.0, cost: 0 },
  { lv: 1, name: '流水线装配', yield: 0.02, costCut: 0.06, capMul: 1.06, cost: 1.2e6 },
  { lv: 2, name: '精益生产', yield: 0.035, costCut: 0.12, capMul: 1.14, cost: 4e6 },
  { lv: 3, name: '自动化产线', yield: 0.05, costCut: 0.18, capMul: 1.24, cost: 1.2e7 },
  { lv: 4, name: '智能制造', yield: 0.065, costCut: 0.24, capMul: 1.36, cost: 3.5e7 },
  { lv: 5, name: '关灯工厂', yield: 0.08, costCut: 0.30, capMul: 1.52, cost: 9e7 },
];

export const PROCESS_MAP = Object.fromEntries(PROCESS_LEVELS.map((p) => [p.lv, p]));
export const MAX_AUTOMATION = 90;      // 最高 90%：留 10% 人工处理异常
export const AUTO_STEP = 10;           // 每次投资提升 10 个百分点

// 工艺路线：成本 / 均衡 / 品质，三选一
export const ROUTES = [
  { id: 'cost', name: '成本优先', costMul: 0.92, quality: -6, desc: '压缩加工费与辅料，故障率与退货率会上升。' },
  { id: 'balanced', name: '均衡路线', costMul: 1, quality: 0, desc: '成本与品质折中，适合走量机型。' },
  { id: 'quality', name: '品质优先', costMul: 1.1, quality: 6, desc: '增加检测与工序，售后成本与退货率下降。' },
];

export const ROUTE_MAP = Object.fromEntries(ROUTES.map((r) => [r.id, r]));

export function ensureProduction(state) {
  const p = state.production;
  if (!p) return null;
  if (!Number.isFinite(Number(p.process))) p.process = 0;
  p.process = clamp(Math.round(p.process), 0, PROCESS_LEVELS.length - 1);
  if (!Number.isFinite(Number(p.automation))) p.automation = 0;
  p.automation = clamp(Math.round(p.automation), 0, MAX_AUTOMATION);
  if (!Number.isFinite(Number(p.autoInvested))) p.autoInvested = 0;
  // 工艺路线与自研设备（1.27）：路线决定成本/品质取舍，设备是长期降本投资
  if (!ROUTES.some((r) => r.id === p.route)) p.route = 'balanced';
  if (!Number.isFinite(Number(p.equipment))) p.equipment = 0;
  p.equipment = clamp(Math.round(p.equipment), 0, 3);
  return p;
}

export function routeOf(state) {
  return ROUTE_MAP[state.production?.route] || ROUTES[1];
}

export function equipmentLevel(state) {
  return clamp(Math.round(Number(state.production?.equipment) || 0), 0, 3);
}

export const EQUIPMENT_COSTS = [0, 8000000, 24000000, 60000000];

export function equipmentUpgradeCost(state) {
  const lv = equipmentLevel(state);
  return lv >= 3 ? 0 : EQUIPMENT_COSTS[lv + 1];
}

export function buyEquipment(state) {
  ensureProduction(state);
  const lv = equipmentLevel(state);
  if (lv >= 3) return { ok: false, msg: '自研设备已到最高等级' };
  const cost = EQUIPMENT_COSTS[lv + 1];
  if (state.company.cash < cost) return { ok: false, msg: '资金不足' };
  state.company.cash -= cost;
  state.production.equipment = lv + 1;
  return { ok: true, msg: `自研设备升级到 Lv.${lv + 1}（装配成本 -3%/级，产能 +2%/级）` };
}

export function setRoute(state, id) {
  if (!ROUTE_MAP[id]) return { ok: false, msg: '未知工艺路线' };
  ensureProduction(state);
  state.production.route = id;
  return { ok: true, msg: `工艺路线切换为「${ROUTE_MAP[id].name}」` };
}

export function isOwnLine(state) {
  return state.production?.mode === 'own' && ownCapacitySource(state);
}

// 避免直接依赖 sim.js（会成环）：自建模式且有产能就算自有产线
function ownCapacitySource(state) {
  const plots = state.campus?.plots || [];
  return plots.some((p) => p.building?.typeId === 'factory' && p.building.status === 'active');
}

export function processOf(state) {
  ensureProduction(state);
  return PROCESS_MAP[state.production.process] || PROCESS_LEVELS[0];
}

export function nextProcess(state) {
  ensureProduction(state);
  return PROCESS_MAP[state.production.process + 1] || null;
}

export function processUpgradeCost(state) {
  const nxt = nextProcess(state);
  return nxt ? nxt.cost : null;
}

export function upgradeProcess(state) {
  ensureProduction(state);
  const nxt = nextProcess(state);
  if (!nxt) return { ok: false, msg: '装配工艺已达最高等级' };
  if (state.company.cash < nxt.cost) {
    return { ok: false, msg: `资金不足，需要 ${Math.round(nxt.cost / 1e4)} 万元` };
  }
  state.company.cash -= nxt.cost;
  state.production.process = nxt.lv;
  return { ok: true, level: nxt, cost: nxt.cost };
}

// 自动化投资：越往后每 10% 越贵
export function automationCost(state) {
  ensureProduction(state);
  const cur = state.production.automation;
  if (cur >= MAX_AUTOMATION) return null;
  // 基础 120 万，每提升 10% 递增 35%
  const step = cur / AUTO_STEP;
  return Math.round(1.2e6 * Math.pow(1.35, step) / 1e4) * 1e4;
}

export function investAutomation(state) {
  ensureProduction(state);
  const cost = automationCost(state);
  if (cost === null) return { ok: false, msg: '自动化已达上限' };
  if (state.company.cash < cost) {
    return { ok: false, msg: `资金不足，需要 ${Math.round(cost / 1e4)} 万元` };
  }
  state.company.cash -= cost;
  state.production.automation = Math.min(MAX_AUTOMATION, state.production.automation + AUTO_STEP);
  state.production.autoInvested = (state.production.autoInvested || 0) + cost;
  return { ok: true, automation: state.production.automation, cost };
}

// 自动化折旧与维护：每月固定支出，只有自建产线才承担
export function automationUpkeep(state) {
  ensureProduction(state);
  if (!isOwnLine(state)) return 0;
  const a = state.production.automation / 100;
  if (a <= 0) return 0;
  // 每 10% 自动化每月约 2.4 万维护 + 折旧
  return Math.round(a * 240000);
}

// 工艺带来的质量加成（并入生产质量目标）
export function processQualityBonus(state) {
  ensureProduction(state);
  if (!isOwnLine(state)) return 0;
  return processOf(state).yield * 100;   // 0 ~ 8
}

// 工艺带来的装配成本系数
export function processCostMul(state) {
  ensureProduction(state);
  if (!isOwnLine(state)) return 1;
  return 1 - processOf(state).costCut;
}

// 工艺 + 自动化带来的产能系数
export function processCapMul(state) {
  ensureProduction(state);
  if (!isOwnLine(state)) return 1;
  const p = processOf(state);
  const a = state.production.automation / 100;
  return p.capMul * (1 + a * 0.5);
}

// 自动化替代的人工比例（0~0.36）：用于抵扣生产部工资
export function automationLaborCut(state) {
  ensureProduction(state);
  if (!isOwnLine(state)) return 0;
  return (state.production.automation / 100) * 0.4;
}
