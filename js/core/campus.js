// 公司园区：地块、楼宇、施工进度与经营加成
import { clamp } from './util.js';
import { addLog } from './state.js';

// 楼宇类型：每级效果见 effects，capacity/officeCap 为累加值，其余为比例
export const BUILDINGS = [
  {
    id: 'hq', name: '总部大楼', icon: '⌂', maxLevel: 5, baseCost: 4e6, months: 2,
    desc: '行政、财务与高管所在，扩充工位并提升雇主品牌。',
    effects: { officeCap: 30, brand: 0.35, hire: 1.5 },
  },
  {
    id: 'rnd', name: '研发中心', icon: '⌬', maxLevel: 5, baseCost: 3.2e7, months: 3,
    desc: '实验室与原型车间，显著加快技术研发。',
    effects: { rndSpeed: 0.12, officeCap: 20 },
  },
  {
    id: 'factory', name: '生产基地', icon: '⚒', maxLevel: 5, baseCost: 1.4e8, months: 4,
    desc: '自有产线与装配车间，投产后可切换为自建生产。',
    effects: { capacity: 120000, officeCap: 8 },
  },
  {
    id: 'design', name: '设计中心', icon: '✎', maxLevel: 4, baseCost: 3.6e7, months: 3,
    desc: 'CMF 工作室与油泥模型间，抬高工业设计水准。',
    effects: { designScore: 2.6, brand: 0.5, officeCap: 14 },
  },
  {
    id: 'logistics', name: '物流中心', icon: '⇄', maxLevel: 4, baseCost: 5e7, months: 3,
    desc: '区域仓与干线运输，压缩渠道与履约成本。',
    effects: { channelCut: 0.022, officeCap: 10 },
  },
  {
    id: 'lab', name: '品质实验室', icon: '✓', maxLevel: 4, baseCost: 2.6e7, months: 2,
    desc: '可靠性、跌落与老化测试，降低售后与召回损失。',
    effects: { warrantyCut: 0.09, quality: 1.6, officeCap: 8 },
  },
];

export const BUILDING_MAP = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

const PLOT_DEFS = [
  { id: 'plot0', name: 'A 地块 · 总部', price: 0, area: 40 },
  { id: 'plot1', name: 'B 地块', price: 6e6, area: 32 },
  { id: 'plot2', name: 'C 地块', price: 1.4e7, area: 32 },
  { id: 'plot3', name: 'D 地块', price: 2.6e7, area: 40 },
  { id: 'plot4', name: 'E 地块', price: 4.2e7, area: 40 },
  { id: 'plot5', name: 'F 地块', price: 6.5e7, area: 48 },
];

export function newCampus(year) {
  return {
    plots: PLOT_DEFS.map((p, i) => ({
      ...p,
      owned: i === 0,
      building: i === 0 ? { typeId: 'hq', level: 1, targetLevel: 1, monthsLeft: 0, monthsTotal: 0, status: 'active' } : null,
    })),
  };
}

// 旧存档迁移：把散落的 factories 折算成生产基地
export function ensureCampus(state) {
  if (!state.campus || !Array.isArray(state.campus.plots)) state.campus = newCampus(state.date?.year || 2010);
  const legacyFactories = state.factories || [];
  if (legacyFactories.length) {
    const empties = state.campus.plots.filter((p) => p.owned && !p.building);
    for (const f of legacyFactories) {
      let plot = empties.shift();
      if (!plot) {
        const free = state.campus.plots.find((p) => !p.owned);
        if (!free) break;
        free.owned = true;
        plot = free;
      }
      plot.building = {
        typeId: 'factory',
        level: Math.max(1, Math.round((f.capacity || 180000) / 120000)),
        targetLevel: Math.max(1, Math.round((f.capacity || 180000) / 120000)),
        monthsLeft: 0, monthsTotal: 0, status: 'active',
      };
    }
    state.factories = [];
  }
  for (const p of state.campus.plots) {
    if (p.building) {
      p.building.monthsLeft = Number(p.building.monthsLeft) || 0;
      p.building.level = Math.max(1, Number(p.building.level) || 1);
      p.building.targetLevel = Math.max(p.building.level, Number(p.building.targetLevel) || p.building.level);
      p.building.status = p.building.status || 'active';
    }
  }
  return state.campus;
}

export function activeBuildings(state, typeId) {
  const out = [];
  for (const p of state.campus.plots) {
    const b = p.building;
    if (!b || b.status !== 'active') continue;
    if (typeId && b.typeId !== typeId) continue;
    out.push({ plot: p, building: b, def: BUILDING_MAP[b.typeId] });
  }
  return out;
}

export function buildingCount(state, typeId) {
  return activeBuildings(state, typeId).length;
}

// 汇总某项加成：累加型（capacity/officeCap/hire）与比例型分开处理
export function campusBonus(state, key) {
  let sum = 0;
  for (const { building, def } of activeBuildings(state)) {
    const v = def?.effects?.[key];
    if (!v) continue;
    sum += v * building.level;
  }
  return sum;
}

export function officeCapacity(state) {
  const base = state.offices?.[0]?.capacity || 40;
  // 自由摆放的工位桌也算工位
  const desks = (state.officeLayout?.items || []).filter((i) => i.type === 'desk').length;
  return base + Math.round(campusBonus(state, 'officeCap')) + desks;
}

export function buildingCost(typeId, level = 0) {
  const def = BUILDING_MAP[typeId];
  if (!def) return Infinity;
  return Math.round(def.baseCost * (1 + level * 0.85) / 1e4) * 1e4;
}

export function canBuild(state, plotId, typeId) {
  const plot = state.campus.plots.find((p) => p.id === plotId);
  if (!plot) return { ok: false, msg: '地块不存在' };
  if (!plot.owned) return { ok: false, msg: '尚未购买该地块' };
  if (plot.building) return { ok: false, msg: '该地块已有建筑' };
  const def = BUILDING_MAP[typeId];
  if (!def) return { ok: false, msg: '未知楼宇类型' };
  const cost = buildingCost(typeId, 0);
  if (state.company.cash < cost) return { ok: false, msg: `资金不足，需要 ${Math.round(cost / 1e4)} 万` };
  return { ok: true, cost };
}

export function startBuild(state, plotId, typeId) {
  const chk = canBuild(state, plotId, typeId);
  if (!chk.ok) return chk;
  const plot = state.campus.plots.find((p) => p.id === plotId);
  const def = BUILDING_MAP[typeId];
  state.company.cash -= chk.cost;
  plot.building = {
    typeId, level: 0, targetLevel: 1,
    monthsLeft: def.months, monthsTotal: def.months, status: 'building',
  };
  addLog(state, 'build', `在${plot.name}动工建设${def.name}，工期 ${def.months} 个月，投资 ${Math.round(chk.cost / 1e4)} 万元。`);
  return { ok: true, cost: chk.cost };
}

export function canUpgrade(state, plotId) {
  const plot = state.campus.plots.find((p) => p.id === plotId);
  if (!plot || !plot.building) return { ok: false, msg: '没有可升级的建筑' };
  const b = plot.building;
  const def = BUILDING_MAP[b.typeId];
  if (b.status !== 'active') return { ok: false, msg: '施工尚未完成' };
  if (b.level >= def.maxLevel) return { ok: false, msg: '已达最高等级' };
  const cost = buildingCost(b.typeId, b.level);
  if (state.company.cash < cost) return { ok: false, msg: '资金不足' };
  return { ok: true, cost, def };
}

export function upgradeBuilding(state, plotId) {
  const chk = canUpgrade(state, plotId);
  if (!chk.ok) return chk;
  const plot = state.campus.plots.find((p) => p.id === plotId);
  const b = plot.building;
  state.company.cash -= chk.cost;
  b.status = 'building';
  b.targetLevel = b.level + 1;
  b.monthsTotal = Math.max(1, Math.round(chk.def.months * 0.7));
  b.monthsLeft = b.monthsTotal;
  addLog(state, 'build', `${chk.def.name}启动升级至 Lv.${b.targetLevel}，投资 ${Math.round(chk.cost / 1e4)} 万元。`);
  return { ok: true, cost: chk.cost };
}

export function buyPlot(state, plotId) {
  const plot = state.campus.plots.find((p) => p.id === plotId);
  if (!plot) return { ok: false, msg: '地块不存在' };
  if (plot.owned) return { ok: false, msg: '已经拥有该地块' };
  if (state.company.cash < plot.price) return { ok: false, msg: '资金不足' };
  state.company.cash -= plot.price;
  plot.owned = true;
  addLog(state, 'build', `购入${plot.name}，面积 ${plot.area} 亩。`);
  return { ok: true };
}

export function stepConstruction(state, report) {
  if (state.sandboxInstant?.build) {
    for (const plot of state.campus.plots) if (plot.building?.status === 'building') plot.building.monthsLeft = 0.01;
  }
  for (const plot of state.campus.plots) {
    const b = plot.building;
    if (!b || b.status !== 'building') continue;
    b.monthsLeft -= 1;
    if (b.monthsLeft > 0) continue;
    b.monthsLeft = 0;
    b.status = 'active';
    b.level = b.targetLevel;
    const def = BUILDING_MAP[b.typeId];
    addLog(state, 'good', `${def.name}${b.level > 1 ? ` 升级至 Lv.${b.level}` : ' 落成'}，开始产生效益。`);
    report.notes = report.notes || [];
    report.notes.push(`${plot.name}：${def.name}${b.level > 1 ? ` Lv.${b.level}` : ''}竣工。`);
  }
}

export function constructionProgress(state) {
  const list = [];
  for (const p of state.campus.plots) {
    if (p.building && p.building.status === 'building') {
      list.push({ plot: p, building: p.building, def: BUILDING_MAP[p.building.typeId] });
    }
  }
  return list;
}

export function plotUtilization(state) {
  const owned = state.campus.plots.filter((p) => p.owned);
  const used = owned.filter((p) => p.building).length;
  return { owned: owned.length, used, total: state.campus.plots.length, ratio: clamp(used / Math.max(1, owned.length), 0, 1) };
}
