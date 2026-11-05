// 自研部门体系：光学影像部 / 半导体研发中心 / 系统开发部 / 面板研发部
// 每个部门：成立投资 → 等级 1..5（升级走研发时间线，立项时可命名并设计规格）
// → 完工产出带名字的自研规格快照 div.latest（写入 design 快照使用）→ 可选对外供货获得收入
import { clamp, round } from './util.js';
import { eraFactor } from '../data/world.js';
import { CPUS, CAMERAS, SCREENS } from '../data/parts.js';
import { CPU_CORES, GPU_ARCHS, OS_BASES, PANEL_VENDORS, RES_TIERS, LENS_TYPES, formatFactor, lensThicknessMm } from '../data/hardware.js';
import { staffPower as staffPowerRef, addLog } from './state.js';

export const DIVISION_DEFS = {
  optics: {
    id: 'optics', name: '光学影像部', en: 'Optics Lab', icon: '◉',
    color: '#c9a6ff',
    desc: '自研图像传感器与镜头模组。等级越高，自研影像模组评分越高、成本越低；可对外供货 Other 厂商。',
    buildCost: 80000000, upgradeBase: 90000000, upkeep: 1800000,
    supplyRate: 2600000, unlockText: 'Lv.1 解锁「自研影像模组」可选部件',
  },
  chip: {
    id: 'chip', name: '半导体研发中心', en: 'Silicon Center', icon: '▣',
    color: '#7de3b0',
    desc: '自行设计并流片 SoC。等级决定自研 SoC 性能与代际；可对外供货处理器。',
    buildCost: 160000000, upgradeBase: 150000000, upkeep: 3600000,
    supplyRate: 4200000, unlockText: 'Lv.1 解锁「自研 SoC」可选部件',
  },
  osd: {
    id: 'osd', name: '系统开发部', en: 'OS Division', icon: '⌘',
    color: '#8fd0ff',
    desc: '研发自有操作系统。没有自研系统前只能用开源或三方授权系统；Lv.1 起可用自研智能手机系统，Lv.3 全场景 OS，Lv.5 端侧 AI 系统。',
    buildCost: 60000000, upgradeBase: 70000000, upkeep: 1500000,
    supplyRate: 1800000, unlockText: 'Lv.1 解锁自研智能手机系统',
  },
  panel: {
    id: 'panel', name: '面板研发部', en: 'Display Lab', icon: '▭',
    color: '#ffd479',
    desc: '自研屏幕面板。等级越高面板品质与发光效率越好（屏幕评分与续航加成）；可对外供应面板。',
    buildCost: 120000000, upgradeBase: 110000000, upkeep: 2600000,
    supplyRate: 3300000, unlockText: 'Lv.1 解锁「自研面板」可选部件',
  },
};
export const DIVISION_IDS = Object.keys(DIVISION_DEFS);

export function ensureDivisions(state) {
  if (!state.divisions) state.divisions = {};
  for (const id of DIVISION_IDS) {
    if (!state.divisions[id]) {
      state.divisions[id] = { level: 0, progress: 0, supplyOn: false, builtAt: null };
    }
    if (!state.divisions[id].proj) state.divisions[id].proj = null; // 升级研发时间线
    if (!state.divisions[id].latest) state.divisions[id].latest = null; // 最近一次完工的自研规格（带名字）
  }
  // 自研 OS 流行度体系
  if (!state.osPop) {
    state.osPop = { pop: 0, level: 0, version: 0, versionName: '1.0', licensed: false, licIncome: 0, totalInstall: 0 };
  }
  return state.divisions;
}

// ---------- 研发时间线：升级不再是即时完成，而是立项（命名+规格设计） → 每月进度 → 完工 ----------
// spec 为各部门的规格设计（见 computeCustomSpec），完工后写入 div.latest
export function startUpgrade(state, id, spec = null) {
  const def = DIVISION_DEFS[id];
  const div = ensureDivisions(state)[id];
  if (div.level <= 0) return { ok: false, msg: '请先成立该部门' };
  if (div.level >= 5) return { ok: false, msg: '已达最高等级' };
  if (div.proj) return { ok: false, msg: '该项目研发中，等待完工' };
  const cost = upgradeCost(id, div.level);
  if (state.company.cash < cost) return { ok: false, msg: '资金不足' };
  state.company.cash -= cost;
  // 立项：目标等级、总工作量（越大越久）、已投入进度 0、规格设计快照
  div.proj = { target: div.level + 1, cost, work: 100 * div.level, progress: 0, startedAt: { ...state.date }, spec: spec || null };
  const specName = spec && spec.name ? `「${spec.name}」` : '';
  addLog(state, 'rnd', `${def.name} 立项${specName} Lv.${div.level + 1} 研发（预算 ${Math.round(cost / 1e4)} 万）`);
  return { ok: true, msg: `${def.name}${specName} Lv.${div.level + 1} 研发已立项` };
}

export function upgradeDivision(state, id) {
  // 兼容旧入口：立即升级（事件/测试用）
  const div = ensureDivisions(state)[id];
  if (div.level <= 0) return { ok: false, msg: '请先成立该部门' };
  if (div.level >= 5) return { ok: false, msg: '已达最高等级' };
  if (div.proj) return { ok: false, msg: '研发进行中' };
  const cost = upgradeCost(id, div.level);
  if (state.company.cash < cost) return { ok: false, msg: '资金不足' };
  state.company.cash -= cost;
  div.level += 1;
  return { ok: true, msg: `${DIVISION_DEFS[id].name} 升级到 Lv.${div.level}` };
}

// OS 版本发布：大版本迭代提升流行度上限
export function osReleaseCost(state) {
  const v = state.osPop?.version || 0;
  return Math.round((60 + v * 55) * 1e6);
}

export function releaseOsVersion(state) {
  ensureDivisions(state);
  const osd = state.divisions.osd;
  if (!osd || osd.level < 1) return { ok: false, msg: '需要先成立系统开发部' };
  if (osd.proj) return { ok: false, msg: '部门升级研发中，无法发版' };
  const cost = osReleaseCost(state);
  if (state.company.cash < cost) return { ok: false, msg: '资金不足' };
  state.company.cash -= cost;
  const os = state.osPop;
  os.version += 1;
  os.versionName = `${os.version}.0`;
  os.level = clamp(os.level + 3 + os.version, 0, 100);
  addLog(state, 'tech', `发布自研 OS ${os.versionName}，系统流行度 +${3 + os.version}`);
  return { ok: true, msg: `自研 OS ${os.versionName} 已发布` };
}

export function toggleOsLicense(state) {
  ensureDivisions(state);
  const os = state.osPop;
  if (!state.divisions.osd || state.divisions.osd.level < 2) return { ok: false, msg: '系统开发部 Lv.2 才能对外授权' };
  if (!os.licensed && os.pop < 12) return { ok: false, msg: '流行度 ≥ 12 才有厂商愿意授权' };
  os.licensed = !os.licensed;
  return { ok: true, msg: os.licensed ? '已开放 OS 授权，将按流行度收取月费' : '已停止对外授权' };
}

export function upgradeCost(id, level) {
  const def = DIVISION_DEFS[id];
  return Math.round(def.upgradeBase * Math.pow(level, 1.5));
}

export function buildDivision(state, id) {
  const def = DIVISION_DEFS[id];
  const div = ensureDivisions(state)[id];
  if (div.level > 0) return { ok: false, msg: '该部门已成立' };
  if (state.company.cash < def.buildCost) return { ok: false, msg: '资金不足' };
  state.company.cash -= def.buildCost;
  div.level = 1;
  div.builtAt = { ...state.date };
  return { ok: true, msg: `${def.name} 已成立（Lv.1）` };
}

// ---------- 自研项目规格设计 ----------
// UI 表单 → 归一化 spec：校验年代/架构门槛，按现实参数计算性能/成本。
// 完工后写入 div.latest，ownXxxSpec 优先返回该快照。
export function computeCustomSpec(state, id, form) {
  if (!form) return null;
  const year = state.date.year;
  const lv = state.divisions?.[id]?.level || 1;
  const errors = [];
  const spec = { name: (form.name || '').trim() || '' };

  if (id === 'chip') {
    const archOf = (aid) => CPU_CORES.find((a) => a.id === aid) || null;
    const prime = archOf(form.primeArch), big = archOf(form.bigArch), little = archOf(form.littleArch);
    for (const [k, a] of [['超大核', prime], ['大核', big], ['小核', little]]) {
      if (!a) errors.push(`请选择${k}架构`);
      else if (a.year > year) errors.push(`${a.name} 尚未发布（${a.year} 年）`);
    }
    const gpu = GPU_ARCHS.find((g) => g.id === form.gpuArch);
    if (!gpu) errors.push('请选择 GPU 架构');
    else if (gpu.year > year) errors.push(`${gpu.name} 尚未发布（${gpu.year} 年）`);
    const nP = clamp(form.primeN | 0, 0, 2), nB = clamp(form.bigN | 0, 1, 6), nL = clamp(form.littleN | 0, 1, 6);
    const total = nP + nB + nL;
    if (total < 2 || total > 12) errors.push('核心总数需在 2~12 之间');
    const ghzP = prime ? clamp(Number(form.primeGhz) || 3.0, prime.ghz[0], prime.ghz[1]) : 3;
    const ghzB = big ? clamp(Number(form.bigGhz) || 2.5, big.ghz[0], big.ghz[1]) : 2.5;
    const ghzL = little ? clamp(Number(form.littleGhz) || 1.8, little.ghz[0], little.ghz[1]) : 1.8;
    if (errors.length) return { ok: false, errors };
    // 性能：Σ(核心 ipc × 频率 × 数量) → 校准到 0~100；GPU 按 架构性能 × 核数占比折算并入
    const cpuScore = (prime ? prime.ipc * ghzP * nP * 1.35 : 0)
      + (big ? big.ipc * ghzB * nB : 0)
      + (little ? little.ipc * ghzL * nL * 0.85 : 0);
    const gpuRatio = clamp((form.gpuCores | 0) / Math.max(1, gpu.maxCore), 0.1, 1);
    const gpuScore = gpu.perf * gpuRatio * 24;
    const perf = clamp(10 + (cpuScore + gpuScore) * 1.7 + lv * 1.2, 8, 104);
    spec.ok = true;
    spec.perf = Math.round(perf);
    spec.power = round(1.7 + total * 0.16 + (ghzP - 2.5) * 0.5 + gpuScore * 0.008, 2);
    spec.price = Math.round((420 + total * 85 + nP * 150 + (form.gpuCores | 0) * 24) * 0.82);
    spec.cores = `${nP ? `${nP}×${prime.name}@${ghzP}GHz + ` : ''}${nB}×${big.name}@${ghzB}GHz + ${nL}×${little.name}@${ghzL}GHz`;
    spec.gpu = `${gpu.name} MC${form.gpuCores | 0}`;
    spec.desc = `${spec.cores} · ${spec.gpu}`;
    spec.gen = lv;
    return spec;
  }

  if (id === 'optics') {
    // 传感器：底大小（光学格式）+ 像素；镜头：类型/焦段/光圈
    const mp = clamp(Number(form.mp) || 50, 0.1, 400);
    const lt = LENS_TYPES.find((t) => t.id === form.lensType) || LENS_TYPES[0];
    const focal = clamp(Number(form.focal) || lt.defFocal, lt.focal[0], lt.focal[1]);
    const ap = clamp(Number(form.ap) || lt.defAp, 0.95, 4);
    const fmtF = formatFactor(form.sensorFormat);
    spec.ok = true;
    spec.score = Math.round(clamp(18 + fmtF * 58 + Math.min(mp, 200) / 200 * 24 + (ap < 1.7 ? 4 : 0) + lv * 2, 10, 100));
    spec.mp = round(mp, 1);
    spec.format = form.sensorFormat;
    // 像素尺寸：1″ 型 ≈ 13.2×8.8mm 感光面（116mm²），面积均分给总像素后开方（μm）
    spec.pixel = round(Math.max(0.5, Math.sqrt((fmtF * 116) / (mp * 1e6)) * 1000), 2); // μm
    spec.thickness = round(lensThicknessMm(form.sensorFormat, lt.id) * (1 - lv * 0.03), 1);
    spec.price = Math.round((120 + fmtF * 520 + mp * 1.35) * (1.06 - lv * 0.05));
    spec.weight = round(3 + fmtF * 7, 1);
    spec.name = spec.name || `自研传感器 ${lv}.0`;
    spec.aperture = `ƒ/${ap.toFixed(1)}`;
    spec.focal = `${Math.round(focal)}mm`;
    spec.ois = !!form.ois;
    spec.desc = `${form.sensorFormat} · ${spec.mp}MP · ${spec.pixel}μm · ${spec.aperture} · ${spec.focal}${spec.ois ? ' · OIS' : ''}`;
    return spec;
  }

  if (id === 'osd') {
    const base = OS_BASES.find((b) => b.id === form.base);
    if (!base) return { ok: false, errors: ['请选择底层架构'] };
    if (base.year > year) return { ok: false, errors: [`${base.name} 底层在 ${base.year} 年后才可行`] };
    spec.ok = true;
    spec.base = base.id;
    spec.baseName = base.name;
    spec.scoreMul = base.scoreMul;
    spec.appsMul = base.appsMul;
    spec.costMul = base.costMul;
    spec.desc = `${base.base} · ${base.desc}`;
    return spec;
  }

  if (id === 'panel') {
    const res = RES_TIERS.find((r) => r.id === form.res);
    if (!res) return { ok: false, errors: ['请选择分辨率档位'] };
    if (res.year > year) return { ok: false, errors: [`${res.name} 面板 ${res.year} 年后才量产`] };
    const kindBonus = form.kind === 'oled' ? 10 : form.kind === 'miniled' ? 7 : 0;
    spec.ok = true;
    spec.kind = form.kind || 'lcd';
    spec.quality = Math.round(clamp(52 + res.level * 26 + kindBonus + lv * 3.5, 10, 100));
    spec.price = 0;
    spec.desc = `${form.kind === 'oled' ? 'OLED' : form.kind === 'miniled' ? 'Mini-LED' : 'LCD'} · ${res.name} · ${res.w}×${res.h}`;
    return spec;
  }
  return null;
}

// ---------- 自研部件的动态规格（写入 design.parts.ownCpu / ownCmr / ownOs / ownPanel 快照） ----------
export function bestUnlockedScore(list, unlocked, year, key) {
  let best = 0;
  for (const p of list) {
    if (p.own) continue;
    if (!unlocked.includes(p.tech) || p.year > year) continue;
    if ((p[key] || 0) > best) best = p[key];
  }
  return best;
}

export function ownCpuSpec(state) {
  const lv = state.divisions?.chip?.level || 0;
  if (lv < 1) return null;
  // 有完工的规格设计快照则优先使用（含玩家命名的自研 SoC）
  const latest = state.divisions?.chip?.latest;
  if (latest && latest.ok) {
    return {
      perf: latest.perf, power: latest.power, price: latest.price,
      name: latest.name, gen: latest.gen || lv, desc: latest.desc,
    };
  }
  const unlocked = state.tech.unlocked;
  const year = state.date.year;
  const base = bestUnlockedScore(CPUS, unlocked, year, 'perf');
  const gen = lv; // 每一级算一次大版本迭代
  return {
    perf: clamp(base + 2 + lv * 2.5, 10, 100),
    power: clamp(3.0 + lv * 0.25, 3, 5),
    price: Math.round(Math.max(600, base * 12) * 0.82),
    name: `自研 SoC ${gen}.0`,
    gen,
  };
}

export function ownCmrSpec(state) {
  const lv = state.divisions?.optics?.level || 0;
  if (lv < 1) return null;
  const latest = state.divisions?.optics?.latest;
  if (latest && latest.ok) {
    return {
      score: latest.score, mp: latest.mp, thickness: latest.thickness, price: latest.price,
      weight: latest.weight || 4, name: latest.name,
      sensor: latest.format, aperture: latest.aperture, focal: latest.focal, ois: latest.ois,
      desc: latest.desc,
    };
  }
  const unlocked = state.tech.unlocked;
  const year = state.date.year;
  const base = bestUnlockedScore(CAMERAS, unlocked, year, 'score');
  const baseCam = CAMERAS.filter((c) => !c.own && c.score === base)[0] || CAMERAS[CAMERAS.length - 2];
  return {
    score: clamp(base + 3 + lv * 2.2, 10, 100),
    mp: Math.round(Math.max(12, baseCam.mp * (1 + lv * 0.12))),
    thickness: baseCam.thickness * (1 - lv * 0.03),
    price: Math.round(baseCam.price * (1.06 - lv * 0.05)),
    weight: baseCam.weight,
    name: `自研影像模组 ${lv}.0`,
    sensor: lv >= 4 ? '1/1.1″ 大底' : lv >= 2 ? '1/1.4″' : '1/1.8″',
    aperture: lv >= 4 ? 'ƒ/1.3' : lv >= 2 ? 'ƒ/1.5' : 'ƒ/1.8',
    focal: '24mm',
    ois: lv >= 2,
  };
}

export function ownOsSpec(state) {
  const lv = state.divisions?.osd?.level || 0;
  if (lv < 1) return null;
  const latest = state.divisions?.osd?.latest;
  if (latest && latest.ok) {
    return { level: lv, scoreBonus: lv * 2 * latest.scoreMul, appsBonus: lv * 3 * latest.appsMul, baseName: latest.baseName, desc: latest.desc };
  }
  return { level: lv, scoreBonus: lv * 2, appsBonus: lv * 3 };
}

export function ownPanelSpec(state) {
  const lv = state.divisions?.panel?.level || 0;
  if (lv < 1) return null;
  const latest = state.divisions?.panel?.latest;
  if (latest && latest.ok) {
    return { quality: latest.quality, price: 0, name: latest.name, level: lv, desc: latest.desc };
  }
  const unlocked = state.tech.unlocked;
  const year = state.date.year;
  const base = bestUnlockedScore(SCREENS, unlocked, year, 'quality');
  return {
    quality: clamp(base + 2 + lv * 1.6, 10, 100),
    price: 0, // 自研面板按自产成本计：在 rawBom 中按最优面板的 0.72 折算
    name: `自研面板 ${lv}.0`,
    level: lv,
  };
}

// 月度推进：升级研发进度 + 维护费 + 对外供货收入 + OS 流行度演化
export function stepDivisions(state, report) {
  const divs = ensureDivisions(state);
  let upkeep = 0, supply = 0;
  const era = eraFactor(state.date.year);
  // 研发速度： rnd 部门人力 × 品牌系数，跨部门共享
  const rndPower = Math.max(0.4, staffPowerRef(state, 'rnd'));
  for (const id of DIVISION_IDS) {
    const div = divs[id];
    if (div.level <= 0) continue;
    upkeep += DIVISION_DEFS[id].upkeep * div.level;
    // 升级研发推进
    if (div.proj) {
      const rate = clamp(rndPower * 6.5, 3, 30);
      div.proj.progress = clamp(div.proj.progress + rate, 0, div.proj.work);
      if (div.proj.progress >= div.proj.work) {
        const t = div.proj.target;
        div.level = t;
        // 规格设计快照落库：完工产出带名字的自研部件
        if (div.proj.spec && div.proj.spec.ok) {
          div.latest = { ...div.proj.spec, level: t };
          addLog(state, 'rnd', `${DIVISION_DEFS[id].name} 完成「${div.latest.name}」研发（Lv.${t}）：${div.latest.desc || '规格按部门能力输出'}`);
          if (report) report.notes.push(`自研部件「${div.latest.name}」研发完成`);
        } else {
          addLog(state, 'rnd', `${DIVISION_DEFS[id].name} 升级研发完成，达到 Lv.${t}`);
          if (report) report.notes.push(`${DIVISION_DEFS[id].name} 升级完成 Lv.${t}`);
        }
        div.proj = null;
      }
    }
    if (div.supplyOn) {
      // 供货收入随等级与年代增长，微受品牌影响
      const rate = DIVISION_DEFS[id].supplyRate * div.level * era
        * (1 + clamp(state.company.brand / 200, 0, 0.8));
      supply += rate;
    }
  }
  // OS 流行度：装机量（搭载自研 OS 的机型累计销量）驱动增长 + 自然遗忘
  const os = state.osPop;
  if (state.divisions.osd && state.divisions.osd.level > 0) {
    const osdLv = state.divisions.osd.level;
    // 本月搭载自研系统的销量（粗略按在售机×自有OS占比），加平台授权装机
    let install = 0;
    for (const p of state.models) {
      if (p.status !== 'production') continue;
      const usingOwn = p.design?.parts?.ownOs || (p.design?.parts?.system || '').startsWith('sys_own');
      if (usingOwn) install += p.lastSold || 0;
    }
    os.totalInstall += install;
    const growth = install / 40000 + (osdLv - 1) * 0.05 + (os.licensed ? 0.25 : 0);
    const decay = os.pop * 0.012;
    os.pop = clamp(os.pop + growth - decay, 0, 100);
    // 流行度封顶受 OS 版本与部门等级影响
    const cap = 12 + os.version * 14 + osdLv * 6;
    if (os.pop > cap) os.pop = clamp(os.pop - (os.pop - cap) * 0.3, 0, 100);
    // 授权收入：流行度越高，越多家厂商付费
    if (os.licensed && os.pop > 8) {
      const lic = Math.round(os.pop * 1e6 * (0.55 + osdLv * 0.14) * era);
      supply += lic;
      os.licIncome = lic;
    } else {
      os.licIncome = 0;
    }
  }
  return { upkeep: Math.round(upkeep), supply: Math.round(supply) };
}
