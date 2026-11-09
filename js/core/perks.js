// Perk 运行逻辑（v1.10.0）：行动涨经验，升级二选一，选择永久生效
import { clamp } from './util.js';
import { addLog } from './state.js';
import { PERKS, PERK_MAP, PERK_TRACKS } from '../data/perks.js';

const ADD_KEYS = new Set(['morale', 'designScore', 'battery', 'perf', 'camera']);
const TRACK_IDS = PERK_TRACKS.map((t) => t.id);

export function ensurePerks(state) {
  if (!state.perks || typeof state.perks !== 'object') state.perks = {};
  const p = state.perks;
  if (!p.xp || typeof p.xp !== 'object') p.xp = {};
  if (!p.level || typeof p.level !== 'object') p.level = {};
  if (!p.pending || typeof p.pending !== 'object') p.pending = {};
  if (!Array.isArray(p.chosen)) p.chosen = [];
  for (const id of TRACK_IDS) {
    if (!Number.isFinite(Number(p.xp[id]))) p.xp[id] = 0;
    if (!Number.isFinite(Number(p.level[id]))) p.level[id] = 0;
    if (typeof p.pending[id] !== 'boolean') p.pending[id] = false;
  }
  p.chosen = p.chosen.filter((id) => PERK_MAP[id]);
  return p;
}

export function perkNeed(level) {
  return 90 + level * 55;
}

export function perkLevel(state, track) {
  return ensurePerks(state).level[track] || 0;
}

export function addPerkXp(state, track, amount) {
  if (!TRACK_IDS.includes(track)) return;
  const p = ensurePerks(state);
  if (p.pending[track]) return; // 等玩家先做选择，避免连续弹窗
  p.xp[track] = Math.max(0, (p.xp[track] || 0) + Number(amount || 0));
  const need = perkNeed(p.level[track] || 0);
  if (p.xp[track] >= need) {
    p.level[track] = (p.level[track] || 0) + 1;
    p.xp[track] = Math.max(0, p.xp[track] - need);
    p.pending[track] = true;
  }
}

export function trackPerks(track) {
  return PERKS.filter((p) => p.track === track);
}

export function perkChoices(state, track) {
  const p = ensurePerks(state);
  return trackPerks(track).filter((x) => !p.chosen.includes(x.id)).slice(0, 2);
}

export function choosePerk(state, track, perkId) {
  const p = ensurePerks(state);
  const perk = PERK_MAP[perkId];
  if (!perk || perk.track !== track) return { ok: false, msg: '无效 Perk' };
  if (!p.pending[track]) return { ok: false, msg: '当前没有待选择的 Perk' };
  if (p.chosen.includes(perkId)) return { ok: false, msg: '已经拥有该 Perk' };
  p.chosen.push(perkId);
  p.pending[track] = false;
  addLog(state, 'good', `获得 Perk「${perk.name}」：${perk.desc}`);
  return { ok: true, perk };
}

export function perkMul(state, key) {
  const p = ensurePerks(state);
  let v = 1;
  for (const id of p.chosen) {
    const e = PERK_MAP[id]?.effects?.[key];
    if (typeof e === 'number' && !ADD_KEYS.has(key)) v *= e;
  }
  return v;
}

export function perkAdd(state, key) {
  const p = ensurePerks(state);
  let v = 0;
  for (const id of p.chosen) {
    const e = PERK_MAP[id]?.effects?.[key];
    if (typeof e === 'number' && ADD_KEYS.has(key)) v += e;
  }
  return v;
}

export function stepPerkXp(state, report = {}) {
  const stores = Object.values(state.stores || {}).reduce((a, list) => a + (Array.isArray(list) ? list.length : 0), 0);
  const rnd = Number(report.rnd) || 0;
  const marketing = Number(report.marketing) || 0;
  const revenue = Number(report.revenue) || 0;
  const units = Number(report.units) || 0;
  const subIncome = Number(report.subIncome) || 0;
  const licensees = (state.osPop?.licensees || []).length;
  addPerkXp(state, 'management', (state.employees || []).length / 8 + (report.training || 0) / 2e6);
  addPerkXp(state, 'economy', stores * 3 + revenue / 2e8 + (state.company.debt > 0 ? 0.5 : 0));
  addPerkXp(state, 'tech', rnd / 1.5e6 + (state.osTech?.proj ? 2 : 0));
  addPerkXp(state, 'market', marketing / 2e5 + units / 2e4);
  addPerkXp(state, 'influence', licensees * 3 + subIncome / 1e6 + Math.max(0, (state.company.brand - 50) / 10));
}

export function perkSummary(state) {
  const p = ensurePerks(state);
  return PERK_TRACKS.map((t) => {
    const level = p.level[t.id] || 0;
    return {
      ...t,
      level,
      xp: p.xp[t.id] || 0,
      need: perkNeed(level),
      pending: !!p.pending[t.id],
      chosen: p.chosen.filter((id) => PERK_MAP[id]?.track === t.id),
      options: perkChoices(state, t.id),
    };
  });
}