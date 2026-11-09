// 全球门店网络（v1.9.0）
// 门店是长期资产：开店一次性投入，每月水电/工资/维护，提升本地曝光与转化。
// 只按市场聚合，避免玩家陷入单店逐人管理。
import { clamp } from './util.js';
import { MARKET_MAP } from '../data/world.js';
import { addLog } from './state.js';

export const MAX_STORES_PER_MARKET = 3;
export const MAX_STORE_LEVEL = 3;

export const STORE_LEVELS = [
  { level: 1, name: '标准店', openMul: 1.0, upkeepMul: 1.0, trafficMul: 1.0, convMul: 1.0, aware: 2 },
  { level: 2, name: '旗舰店', openMul: 0.8, upkeepMul: 1.7, trafficMul: 1.55, convMul: 1.12, aware: 4 },
  { level: 3, name: '地标店', openMul: 1.45, upkeepMul: 2.8, trafficMul: 2.2, convMul: 1.28, aware: 6 },
];

export function ensureStores(state) {
  if (!state.stores || typeof state.stores !== 'object' || Array.isArray(state.stores)) state.stores = {};
  for (const id of Object.keys(state.stores)) {
    if (!MARKET_MAP[id] || !Array.isArray(state.stores[id])) delete state.stores[id];
  }
  return state.stores;
}

export function storeList(state, marketId) {
  ensureStores(state);
  return Array.isArray(state.stores[marketId]) ? state.stores[marketId] : [];
}

export function storeOpenCost(state, marketId) {
  const mk = MARKET_MAP[marketId];
  if (!mk) return 0;
  return Math.round(mk.base * 0.1 + 1.5e6);
}

export function storeUpgradeCost(state, store) {
  const mk = MARKET_MAP[store.marketId];
  if (!mk) return 0;
  const next = STORE_LEVELS.find((x) => x.level === (store.level || 1) + 1);
  if (!next) return 0;
  return Math.round(storeOpenCost(state, store.marketId) * next.openMul);
}

export function storeStats(state, marketId) {
  const list = storeList(state, marketId);
  let upkeep = 0, salesMul = 1, traffic = 0;
  for (const s of list) {
    const lv = STORE_LEVELS.find((x) => x.level === (s.level || 1)) || STORE_LEVELS[0];
    upkeep += Math.round((MARKET_MAP[marketId]?.base || 0) * 0.006 * lv.upkeepMul);
    traffic += lv.trafficMul;
    salesMul += 0.05 + 0.035 * lv.convMul * (s.level || 1);
  }
  return {
    count: list.length,
    levelSum: list.reduce((a, s) => a + (s.level || 1), 0),
    upkeep,
    traffic: +traffic.toFixed(1),
    salesMul: +clamp(salesMul, 1, 1.55).toFixed(3),
  };
}

export function storeSalesMul(state, marketId) {
  return storeStats(state, marketId).salesMul;
}

export function openStore(state, marketId) {
  ensureStores(state);
  const mk = MARKET_MAP[marketId];
  if (!mk) return { ok: false, msg: '未知市场' };
  const list = storeList(state, marketId);
  if (list.length >= MAX_STORES_PER_MARKET) return { ok: false, msg: `${mk.name}门店已达上限（${MAX_STORES_PER_MARKET} 家）` };
  const cost = storeOpenCost(state, marketId);
  if (state.company.cash < cost) return { ok: false, msg: '现金不足，无法开店' };
  state.company.cash -= cost;
  const store = {
    id: `st_${marketId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 4)}`,
    marketId,
    level: 1,
    opened: { ...state.date },
    invested: cost,
  };
  list.push(store);
  state.stores[marketId] = list;
  const market = state.markets.find((m) => m.id === marketId);
  if (market) market.awareness = clamp((market.awareness || 0) + 2, 0, 100);
  addLog(state, 'market', `在${mk.name}开设${STORE_LEVELS[0].name}，投入 ${(cost / 1e4).toFixed(0)} 万元。`);
  return { ok: true, store, cost };
}

export function upgradeStore(state, marketId, storeId) {
  ensureStores(state);
  const list = storeList(state, marketId);
  const store = list.find((s) => s.id === storeId);
  if (!store) return { ok: false, msg: '找不到该门店' };
  if ((store.level || 1) >= MAX_STORE_LEVEL) return { ok: false, msg: '门店已是最高等级' };
  const cost = storeUpgradeCost(state, store);
  if (state.company.cash < cost) return { ok: false, msg: '现金不足，无法升级' };
  state.company.cash -= cost;
  store.level = (store.level || 1) + 1;
  store.invested = (store.invested || 0) + cost;
  const market = state.markets.find((m) => m.id === marketId);
  if (market) market.awareness = clamp((market.awareness || 0) + 1.5, 0, 100);
  const lv = STORE_LEVELS.find((x) => x.level === store.level);
  addLog(state, 'market', `${MARKET_MAP[marketId]?.name || marketId}门店升级为${lv?.name || '新等级'}，投入 ${(cost / 1e4).toFixed(0)} 万元。`);
  return { ok: true, store, cost };
}

export function closeStore(state, marketId, storeId) {
  ensureStores(state);
  const list = storeList(state, marketId);
  const idx = list.findIndex((s) => s.id === storeId);
  if (idx < 0) return { ok: false, msg: '找不到该门店' };
  const store = list[idx];
  const refund = Math.round((store.invested || 0) * 0.3);
  state.company.cash += refund;
  list.splice(idx, 1);
  if (!list.length) delete state.stores[marketId];
  addLog(state, 'market', `关闭${MARKET_MAP[marketId]?.name || marketId}一家门店，回收 ${(refund / 1e4).toFixed(0)} 万元。`);
  return { ok: true, refund };
}

export function stepStores(state, report) {
  ensureStores(state);
  let upkeep = 0;
  for (const [marketId, list] of Object.entries(state.stores)) {
    const mk = MARKET_MAP[marketId];
    if (!mk || !Array.isArray(list)) continue;
    for (const s of list) {
      const lv = STORE_LEVELS.find((x) => x.level === (s.level || 1)) || STORE_LEVELS[0];
      upkeep += Math.round(mk.base * 0.006 * lv.upkeepMul);
    }
    const market = state.markets.find((m) => m.id === marketId);
    if (market && list.length) market.awareness = clamp((market.awareness || 0) + list.length * 0.18, 0, 100);
  }
  report.stores = upkeep;
  return upkeep;
}

export function storeSummary(state) {
  ensureStores(state);
  return state.markets.map((m) => {
    const st = storeStats(state, m.id);
    return {
      market: m,
      ...st,
      openCost: storeOpenCost(state, m.id),
      canOpen: st.count < MAX_STORES_PER_MARKET && state.company.cash >= storeOpenCost(state, m.id),
      list: storeList(state, m.id).map((s) => ({
        ...s,
        levelName: (STORE_LEVELS.find((x) => x.level === (s.level || 1)) || STORE_LEVELS[0]).name,
        upgradeCost: (s.level || 1) < MAX_STORE_LEVEL ? storeUpgradeCost(state, s) : 0,
      })),
    };
  });
}