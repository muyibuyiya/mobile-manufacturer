// 游戏状态：初始化、员工生成、部门结构、竞争对手、存读档
import { clamp, rand, randInt, pick, uid, gauss, chance } from './util.js';
import { MARKETS, COMPETITORS, COUNTRIES, ERAS, SURNAMES, GIVEN, FOREIGN, FIELDS, EDUS, makeCompetitorPhone, RIVAL_SIGNATURE_MAP } from '../data/world.js';
import { TECHS } from '../data/tech.js';
import { newModel, ensureBranding, ensureTemplate } from './design.js';
import { RAMS, STORAGES } from '../data/parts.js';
import { newCampus, ensureCampus, officeCapacity } from './campus.js';
import { ensureSupply, START_STOCK } from './supply.js';
import { rankOf } from './staff.js';
import { DEPT_DEFS, ROLE_BY_DEPT } from '../data/depts.js';
import { ensureOrg } from './org.js';
import { ensureCapital } from './capital.js';
import { ensurePolicies } from './policy.js';
import { ensureDivisions } from './divisions.js';
import { ensureOverseas } from './overseas.js';
import { ensureProduction } from './production.js';
import { ensureMarketing } from './marketing.js';
import { ensureWarranty } from './aftermarket.js';
import { ensureGuide } from './guide.js';
import { ensureSubsidiaries } from './capital.js';
import { migrateV1, normalizeLayout } from './floorplan.js';
import { compactAll } from './history.js';

export { DEPT_DEFS, ROLE_BY_DEPT };

export const GAME_VERSION = '1.15.0'; // 全局唯一版本号（启动页/关于/存档兼容判断）

// 室内布局（v2）：房间可拖放/调尺寸 + 家具/隔墙单数据源。
// 旧档（v1：仅 items/edges，房间位置硬编码）经 migrateV1 迁移：rooms 取默认双排布局，items/edges 原样保留
export function ensureLayout(s) {
  if (!s || typeof s !== 'object') return { v: 2, rooms: {}, items: [], edges: [] };
  if (!s.officeLayout || typeof s.officeLayout !== 'object' || s.officeLayout.v !== 2) {
    s.officeLayout = migrateV1(s.officeLayout);
  } else {
    s.officeLayout = normalizeLayout(s.officeLayout); // 每次读档全量校验（坏数据剔除）
  }
  return s.officeLayout;
}

export const DIFFICULTY = {
  easy: { id: 'easy', name: '轻松', cost: 0.88, salary: 0.9, market: 1.12, rnd: 1.15, cash: 1.4 },
  normal: { id: 'normal', name: '标准', cost: 1, salary: 1, market: 1, rnd: 1, cash: 1 },
  hard: { id: 'hard', name: '硬核', cost: 1.18, salary: 1.15, market: 0.9, rnd: 0.85, cash: 0.7 },
};

// 企业基因：开局专属加成（一次性，作用于初始状态）
export const GENES = {
  tech: { id: 'tech', name: '技术驱动', desc: '初始团队技能更高，研发起步快' },
  mkt: { id: 'mkt', name: '营销导向', desc: '初始品牌知名度 +8' },
  supply: { id: 'supply', name: '供应链大师', desc: '初始元器件库存翻倍' },
  balanced: { id: 'balanced', name: '稳健均衡', desc: '初始资金 +10%' },
};

export const TRAITS = [
  { id: 'diligent', name: '勤奋', eff: 8, stress: 4, cost: 0 },
  { id: 'innovative', name: '创新', creativity: 12, eff: -2 },
  { id: 'rigorous', name: '严谨', quality: 10 },
  { id: 'impatient', name: '急躁', eff: 5, quality: -6 },
  { id: 'social', name: '善沟通', comm: 12 },
  { id: 'lone', name: '独立工作', eff: 4, comm: -8 },
  { id: 'team', name: '团队协作', comm: 8, loyalty: 3 },
  { id: 'greedy', name: '追求高薪', salary: 1.15, loyalty: -4 },
  { id: 'ambitious', name: '注重发展', grow: 1.2, loyalty: 2 },
  { id: 'loyal', name: '忠诚', loyalty: 12 },
];

const SALARY_BASE = { 1980: 1100, 1990: 2600, 2000: 5200, 2010: 8200, 2020: 13000, 2030: 16000, 2040: 20000 };

function salaryBase(year) {
  const keys = Object.keys(SALARY_BASE).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (year >= keys[i] && year <= keys[i + 1]) {
      const t = (year - keys[i]) / (keys[i + 1] - keys[i]);
      return SALARY_BASE[keys[i]] + (SALARY_BASE[keys[i + 1]] - SALARY_BASE[keys[i]]) * t;
    }
  }
  return year < 1980 ? SALARY_BASE[1980] : SALARY_BASE[2040];
}

let empSeq = 0;
export function generateEmployee(year, opts = {}) {
  const skill = clamp(gauss(opts.skillMean ?? 48, opts.skillSd ?? 14), 8, 97);
  const foreign = chance(0.28);
  const name = foreign ? pick(FOREIGN).join(' ') : pick(SURNAMES) + pick(GIVEN);
  const age = randInt(22, 58);
  const exp = clamp(age - 22 + randInt(-2, 2), 0, 35);
  const edu = pick(EDUS.slice(0, clamp(Math.floor(skill / 26) + 1, 1, 4)));
  const traits = [];
  const pool = [...TRAITS];
  for (let i = 0; i < randInt(1, 2); i++) {
    traits.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  const tBonus = (k) => traits.reduce((s, t) => s + (t[k] || 0), 0);
  const skillFinal = clamp(skill + tBonus('quality') * 0.3, 5, 99);
  const base = salaryBase(year) * (0.55 + skillFinal / 100 * 1.05) * (1 + exp * 0.012);
  const salary = Math.round(base * (tBonus('salary') || 1) * rand(0.92, 1.08) / 100) * 100;
  return {
    id: 'e' + (++empSeq) + '_' + Math.random().toString(36).slice(2, 6),
    name,
    gender: chance(0.45) ? '女' : '男',
    nationality: foreign ? pick(['美国', '日本', '韩国', '德国', '印度', '英国']) : '中国',
    age,
    edu,
    exp,
    field: opts.field || pick(FIELDS),
    skill: Math.round(skillFinal),
    eff: Math.round(clamp(gauss(58, 12) + tBonus('eff'), 10, 100)),
    attitude: Math.round(clamp(gauss(60, 13) + tBonus('eff') * 0.4, 10, 100)),
    creativity: Math.round(clamp(gauss(50, 16) + tBonus('creativity'), 5, 100)),
    comm: Math.round(clamp(gauss(55, 14) + tBonus('comm'), 5, 100)),
    loyalty: Math.round(clamp(gauss(58, 14) + tBonus('loyalty'), 5, 100)),
    stress: randInt(15, 40),
    satisfaction: randInt(55, 78),
    potential: Math.round(clamp(100 - age + skill * 0.4 + rand(-10, 10), 10, 100)),
    salary,
    expectSalary: Math.round(salary * rand(0.95, 1.15) / 100) * 100,
    role: opts.role || '工程师',
    deptId: opts.deptId || null,
    traits: traits.map((t) => t.id),
    grew: 0,
    training: null,
    trained: 0,
    quality: Math.round(clamp(gauss(56, 12), 10, 100)),
  };
}

export function traitNames(emp) {
  return emp.traits.map((id) => (TRAITS.find((t) => t.id === id) || {}).name).filter(Boolean);
}

export function staffPower(state, deptId) {
  const emps = state.employees.filter((e) => e.deptId === deptId);
  if (!emps.length) return 0;
  const raw = emps.reduce((s, e) => {
    const morale = clamp(e.satisfaction / 75, 0.45, 1.25);
    const stress = clamp(1 - e.stress / 180, 0.55, 1);
    const rankMul = 1 + (rankOf(e.skill).lv - 1) * 0.03;
    return s + (e.skill * 0.6 + e.eff * 0.4) * morale * stress * rankMul * (e.star ? 1.12 : 1);
  }, 0);
  return raw / 60; // 60 分水平 ≈ 1 个标准人力
}

export { officeCapacity };

export function deptById(state, id) { return state.departments.find((d) => d.id === id); }
export function headcount(state) { return state.employees.length; }

export function deptCost(state, id) {
  return state.employees.filter((e) => e.deptId === id).reduce((s, e) => s + e.salary, 0);
}

export function createGame(opts) {
  const { mode = 'career', year = 2020, companyName = '新星科技', companyEnName = '', countryId = 'cn',
    difficulty = 'normal', cash: startCash = 0, techAll = false, logoColor = '#4aa3ff',
    logoData = '', gene = 'balanced' } = opts;
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  const era = ERAS.find((e) => e.year === year) || ERAS[ERAS.length - 1];
  const country = COUNTRIES.find((c) => c.id === countryId) || COUNTRIES[0];
  let cash = (startCash || era.cash) * diff.cash;
  if (gene === 'balanced') cash = Math.round(cash * 1.1);

  const state = {
    version: 5,
    mode,
    colorSchemes: [],
    date: { year, month: 0 },
    speed: 0,
    company: {
      name: companyName,
      nameEn: companyEnName || '',
      logoColor,
      logoData,
      gene,
      country: country.id,
      founded: year,
      cash,
      debt: 0,
      brand: (mode === 'sandbox' ? 40 : 8) + (gene === 'mkt' ? 8 : 0),
      reputation: 45,
      marketingBudget: mode === 'sandbox' ? 200000 : 60000,
      qualityFocus: 60,
      difficulty,
      valuation: cash,
    },
    departments: DEPT_DEFS.map((d) => ({ ...d, budget: 0, focus: 50 })),
    employees: [],
    models: [],
    tech: { all: !!techAll, unlocked: techAll ? TECHS.map((t) => t.id) : [], researching: null, completed: [] },
    production: { mode: 'foundry', foundryId: 'f1', batch: 20000, quality: 65, process: 0, automation: 0, autoInvested: 0 },
    factories: [],
    campus: newCampus(year),
    supply: ensureSupply({ stock: Object.fromEntries(['chip', 'display', 'memory', 'camera', 'battery', 'shell'].map((k) => [k, gene === 'supply' ? START_STOCK * 2 : START_STOCK])) }),
    org: { heads: {}, execs: {}, history: [] },
    capital: { holders: [{ name: '创始团队', pct: 100 }], rounds: [], ipo: null, stock: { price: 0, history: [] }, acquisitions: [] },
    feedback: null,
    offices: [{ id: 'o1', name: '总部', level: 1, capacity: 40, rent: 0 }],
    competitors: [],
    markets: MARKETS.map((m) => ({ ...m, awareness: 0, launched: false })),
    events: [],
    policies: [],
    divisions: {},
    overseas: [],
    officeLayout: { items: [], edges: [] },
    log: [],
    history: [],
    lastReport: null,
    settings: { autoSave: true, tickMs: 1500 },
    recruitment: { campusEventMonths: 0, headhunterCount: 0 },
    flags: { tutorialDone: false },
    hints: { seen: {} },
  };

  // 初始团队（技术驱动基因：团队技能更高）
  const startCount = mode === 'sandbox' ? 12 : 6;
  const skillMean = gene === 'tech' ? 58 : 52;
  for (let i = 0; i < startCount; i++) {
    const dept = i < 2 ? 'rnd' : i < 3 ? 'design' : i < 4 ? 'mkt' : i < 5 ? 'sales' : 'prod';
    const emp = generateEmployee(year, {
      skillMean, deptId: dept,
      role: ROLE_BY_DEPT[dept][i % 2 ? 1 : 0],
    });
    state.employees.push(emp);
  }
  // 任命一个初始管理者
  const ceo = generateEmployee(year, { skillMean: 66, deptId: 'exec', role: 'CEO' });
  ceo.salary = Math.round(ceo.salary * 1.6);
  state.employees.push(ceo);
  state.company.ceo = ceo.id;

  state.competitors = makeCompetitors(year);
  // 开局年份即行业基线：该年及以前的技术视为公有知识，玩家只需研发更新的技术
  // 起步公司用的是"三四年前"的成熟技术，留出可追赶的研发队列；
  // 1980 年开局仍保留完整的基础五件套，避免无技术可用。
  const lag = era.lag != null ? era.lag : 3;
  const baseYear = Math.max(1980, year - lag);
  state.tech.unlocked = TECHS.filter((t) => t.year <= baseYear || t.year === 1980).map((t) => t.id);
  if (techAll) state.tech.unlocked = TECHS.map((t) => t.id);
  state.tech.unlocked = [...new Set(state.tech.unlocked)];

  // 沙盒模式给一台现成机型
  if (mode === 'sandbox') {
    const m = newModel(year, state.tech.unlocked, 'Sandbox One');
    m.status = 'production';
    m.heat = 55; // 未发布的基础热度，发布会后才有爆发
    m.quality = 80;
    m.markets = ['cn', 'na', 'eu'];
    state.models.push(m);
  }

  addLog(state, 'system', `《手机开发商》开局：${companyName} 成立于 ${year} 年，总部位于${country.name}。`);
  return sanitizeState(state);
}

export function makeCompetitors(year) {
  const active = COMPETITORS.filter((c) => (c.foundedYear || 1980) <= year);
  return active.map((c) => {
    const scale = 1 + (year - 2000) / 90;
    const cashMul = c.cashMul || 1;
    const isDeclining = c.declineYear && year >= c.declineYear;
    const comp = {
      ...c,
      name: c.nameZh || c.name,
      nameEn: c.nameEn || '',
      brand: Math.round(clamp(c.brand * (0.72 + (year - 1980) / 240), 20, 98)),
      techLevel: clamp(0.62 + (year - 1980) / 90 * 0.4, 0.5, 1.25) * c.tech,
      cash: 2e8 * scale * cashMul,
      lineup: [],
      lastRelease: 0,
      share: 0,
      isDeclining: !!isDeclining,
      declineYear: c.declineYear || null,
      exitYear: c.exitYear || null,
      signature: RIVAL_SIGNATURE_MAP[c.id] || null,
    };
    // 开局即有两款在售机型，市场不是真空
    for (let i = 0; i < 2; i++) {
      const p = makeCompetitorPhone(comp, year);
      p.age = i === 0 ? 4 : 0;
      comp.lineup.push(p);
    }
    // 产能与库存（v1.5.0）：竞品不再无限供货，需求超过库存会出现缺货
    comp.capacity = Math.round(180000 * (0.7 + comp.brand / 80) * (0.6 + comp.techLevel));
    comp.inventory = Math.round(comp.capacity * 0.6);
    return comp;
  });
}

export function addLog(state, type, text) {
  state.log.unshift({ t: `${state.date.year}/${state.date.month + 1}`, type, text });
  if (state.log.length > 400) state.log.length = 400;
}

const SAVE_VER = 5;
const SAVE_KEY = `mobile_manufacturer_save_v${SAVE_VER}`;
// 旧版本的存档 key 仍然可读，升级后不会丢档（写入一律走新 key）
const LEGACY_KEYS = ['mobile_manufacturer_save_v4', 'mobile_manufacturer_save_v3'];

function readRaw(slot) {
  const cur = localStorage.getItem(`${SAVE_KEY}_${slot}`);
  if (cur) return cur;
  for (const k of LEGACY_KEYS) {
    const old = localStorage.getItem(`${k}_${slot}`);
    if (old) return old;
  }
  return null;
}

export function saveGame(state, slot = 1) {
  const data = JSON.stringify(state);
  localStorage.setItem(SAVE_KEY + '_' + slot, data);
  localStorage.setItem(SAVE_KEY + '_last', String(slot));
  return data.length;
}

// 自动存档：独立槽位，不占用 1~3 手动槽，也不改写 last 指针
export function autoSave(state) {
  try { localStorage.setItem(SAVE_KEY + '_auto', JSON.stringify(state)); } catch (e) { /* 存满则静默跳过 */ }
}

// 月度推进高频调用：2 秒合并一次写盘，避免 8× 速度下每回合全量序列化
let _autoTimer = null;
let _autoPending = null;
export function queueAutoSave(state) {
  _autoPending = state;
  if (_autoTimer) return;
  _autoTimer = setTimeout(() => {
    _autoTimer = null;
    const s = _autoPending;
    _autoPending = null;
    if (s) autoSave(s);
  }, 2000);
  // Node 测试环境下不要让定时器拖住进程退出
  if (_autoTimer && typeof _autoTimer.unref === 'function') _autoTimer.unref();
}
export function flushAutoSave() {
  if (_autoTimer) { clearTimeout(_autoTimer); _autoTimer = null; }
  const s = _autoPending;
  _autoPending = null;
  if (s) { autoSave(s); return true; }
  return false;
}
export function peekAutoSave() {
  const raw = readRaw('auto');
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return { name: s.company?.name || '', date: s.date, cash: s.company?.cash || 0, models: (s.models || []).length };
  } catch (e) { return null; }
}
export function loadGame(slot = 1) {
  const raw = readRaw(slot);
  if (!raw) return null;
  try { return sanitizeState(JSON.parse(raw)); } catch (e) { return null; }
}

// 旧存档可能含有 NaN/undefined 数值，读档时统一修正，避免污染整局结算
export function sanitizeState(s) {
  if (!s || !s.company) return s;
  const fix = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  s.company.cash = fix(s.company.cash);
  s.company.debt = fix(s.company.debt);
  s.company.brand = fix(s.company.brand);
  s.company.reputation = fix(s.company.reputation);
  for (const m of s.models || []) {
    for (const k of ['inventory', 'sold', 'revenue', 'productionTarget', 'cost', 'quality', 'rating']) {
      if (!Number.isFinite(Number(m[k]))) m[k] = k === 'quality' || k === 'rating' ? 60 : 0;
    }
    m.price = m.price || {};
    for (const k of Object.keys(m.price)) m.price[k] = fix(m.price[k]) || 1;
    m.history = m.history || [];
    if (!m.lineup) m.lineup = 'main';
    ensureTemplate(m.design, s.date.year);
    if (m.heat === undefined) m.heat = m.status === 'production' ? (m.released === false ? 55 : 100) : 0;
    // 发布状态迁移：新版只有"发布会发布过"的机型才算已发布；老档以 launched 日期判断
    if (typeof m.released !== 'boolean') m.released = !!m.launched;
    if (!m.series) m.series = String(m.name || '').trim().split(/\s+/)[0] || null;
    if (!Array.isArray(m.awards)) m.awards = [];
    if (!m.review) m.review = null;
  }
  // 部门迁移：v1.2 新增软件部等，老存档自动补齐
  if (!Array.isArray(s.departments)) s.departments = DEPT_DEFS.map((d) => ({ ...d, budget: 0, focus: 50 }));
  else for (const def of DEPT_DEFS) {
    if (!s.departments.some((d) => d.id === def.id)) s.departments.push({ ...def, budget: 0, focus: 50 });
  }
  // 沙盒瞬间完成开关
  if (s.sandboxInstant) {
    s.sandboxInstant.research = !!s.sandboxInstant.research;
    s.sandboxInstant.build = !!s.sandboxInstant.build;
  }
  // 通知与新闻：结构校验 + 截断
  if (!Array.isArray(s.news)) s.news = [];
  else s.news = s.news.filter((n) => n && n.title).slice(0, 100);
  ensureCampus(s);
  ensureSupply(s);
  ensureOrg(s);
  ensureCapital(s);
  ensureProduction(s);
  ensurePolicies(s);
  ensureDivisions(s);
  ensureOverseas(s);
  ensureLayout(s);
  ensureMarketing(s);
  ensureWarranty(s);
  ensureGuide(s);
  ensureSubsidiaries(s);
  // 中后期系统提示（一次性）
  if (!s.hints || typeof s.hints.seen !== 'object') s.hints = { seen: s.hints?.seen && typeof s.hints.seen === 'object' ? s.hints.seen : {} };
  // 沙盒全解锁标记：旧档没有 tech.all 字段，按「沙盒 + 技术全掌握」推断补齐
  if (!s.tech) s.tech = { all: false, unlocked: [], researching: null, completed: [] };
  if (typeof s.tech.all !== 'boolean') {
    s.tech.all = s.mode === 'sandbox' && Array.isArray(s.tech.unlocked)
      && (TECHS.length === 0 || s.tech.unlocked.length >= TECHS.length);
  }
  // 全解锁存档补齐：tech.all=true 时 unlocked 只是建档当时的全量科技，
  // 之后版本新增的科技（新快充档/新材料等）不在其中会显示「未解锁」——每次加载都补齐到当前全量
  if (s.tech.all && Array.isArray(s.tech.unlocked)) {
    s.tech.unlocked = [...new Set([...s.tech.unlocked, ...TECHS.map((t) => t.id)])];
  }
  // 配色方案库
  if (!Array.isArray(s.colorSchemes)) s.colorSchemes = [];
  // 旧档机型设计补齐第七轮外观字段（三区配色 / 侧键样式 / 顶底开孔）
  for (const m of s.models || []) {
    const b = m.design?.body;
    if (!b) continue;
    if (!b.colors) b.colors = { frame: b.color || '#2b3440', back: b.color || '#2b3440', cover: '#05070a' };
    if (!b.schemeName && b.schemeName !== '') b.schemeName = '';
    if (!b.buttons) b.buttons = 'classic';
    if (!b.ports) b.ports = { dualSpeaker: !!b.color && (s.date?.year || 2020) >= 2015, topMic: false, charge: 'typec' };
    // 背面装饰（Logo/文字位置尺寸）+ 侧键偏移：缺省值由 ensureBranding 幂等补齐
    ensureBranding(m.design);
    // 配置版本：剔除非法条目（坏 ram/stg id / 坏倍率）
    if (Array.isArray(m.design.variants)) {
      const ramIds = new Set(RAMS.map((x) => x.id));
      const stgIds = new Set(STORAGES.map((x) => x.id));
      m.design.variants = m.design.variants.filter((v) => v && ramIds.has(v.ram) && stgIds.has(v.stg));
      for (const v of m.design.variants) v.priceMul = Math.max(0.5, Math.min(2.5, Number(v.priceMul) || 1));
    }
  }
  if (!Array.isArray(s.employees)) s.employees = [];
  for (const e of s.employees) {
    if (!e || typeof e !== 'object') continue;
    for (const k of ['skill', 'salary', 'expectSalary', 'satisfaction', 'loyalty', 'stress', 'eff', 'comm', 'age', 'exp', 'potential', 'creativity', 'attitude']) {
      if (!Number.isFinite(Number(e[k]))) {
        e[k] = k === 'skill' ? 50 : k === 'salary' ? 8000 : k === 'expectSalary' ? 8000
          : k === 'satisfaction' ? 60 : k === 'loyalty' ? 50 : k === 'stress' ? 30
            : k === 'eff' ? 60 : k === 'comm' ? 55 : k === 'age' ? 30
              : k === 'exp' ? 5 : k === 'potential' ? 50 : k === 'creativity' ? 50 : 60;
      }
    }
    if (!Number.isFinite(Number(e.quality))) e.quality = 55;
    if (!Number.isFinite(Number(e.trained))) e.trained = 0;
    if (!Number.isFinite(Number(e.grew))) e.grew = 0;
    if (!Number.isFinite(Number(e.leaveRisk))) e.leaveRisk = 0;
    if (typeof e.star !== 'boolean') e.star = !!e.star;
    if (!Array.isArray(e.traits)) e.traits = [];
    if (e.deptId === undefined) e.deptId = null;
    if (typeof e.training === 'undefined') e.training = null;
  }
  // 竞品产能/库存与联盟（v1.5.0）
  for (const c of s.competitors || []) {
    if (!Array.isArray(c.lineup)) c.lineup = [];
    if (!c.signature) c.signature = RIVAL_SIGNATURE_MAP[c.id] || null;
    if (!Number.isFinite(Number(c.capacity))) {
      c.capacity = Math.round(180000 * (0.7 + (Number(c.brand) || 30) / 80) * (0.6 + (Number(c.techLevel) || 1)));
    }
    if (!Number.isFinite(Number(c.inventory))) c.inventory = Math.round(c.capacity * 0.6);
  }
  if (!Array.isArray(s.rivalAlliances)) s.rivalAlliances = [];
  else s.rivalAlliances = s.rivalAlliances.filter((a) => a && a.a && a.b && Number(a.months) > 0);
  // 谈判状态：旧档可能残留缺字段的 negotiation，读档时统一补齐/清理
  if (s.negotiation) {
    if (s.negotiation.status !== 'open') s.negotiation = null;
    else {
      s.negotiation.payMode = ['cash', 'installment', 'equity'].includes(s.negotiation.payMode) ? s.negotiation.payMode : 'cash';
      s.negotiation.charmUsed = Number(s.negotiation.charmUsed) || 0;
      s.negotiation.defense = Number.isFinite(Number(s.negotiation.defense)) ? Number(s.negotiation.defense) : 0.3;
    }
  }
  // 历史降采样：近 12 月明细 + 更早季度归档（旧档 480 行在这里一次性压缩）
  compactAll(s);
  s.version = 5;
  return s;
}
export function saveSlots() {
  const out = [];
  for (let i = 1; i <= 3; i++) {
    const raw = readRaw(i);
    if (!raw) { out.push({ slot: i, empty: true }); continue; }
    try {
      const s = JSON.parse(raw);
      out.push({ slot: i, empty: false, name: s.company.name, date: s.date, cash: s.company.cash, models: s.models.length });
    } catch (e) { out.push({ slot: i, empty: true }); }
  }
  return out;
}
export function deleteSave(slot) {
  localStorage.removeItem(`${SAVE_KEY}_${slot}`);
  // 一并清掉旧 key，否则删档后 readRaw 又会回退读到旧数据
  for (const k of LEGACY_KEYS) localStorage.removeItem(`${k}_${slot}`);
}

// ---------- 存档文件导入 / 导出（跨设备迁移，APK 与浏览器通用）----------
export function exportSave(state) {
  return JSON.stringify({ mm: 'mobile-manufacturer', version: 5, exportedAt: new Date().toISOString(), state }, null, 0);
}

export function importSave(jsonText) {
  const raw = JSON.parse(jsonText);
  const s = raw && raw.state ? raw.state : raw;
  if (!s || !s.company || !s.date) throw new Error('不是本游戏的存档文件');
  return sanitizeState(s);
}
