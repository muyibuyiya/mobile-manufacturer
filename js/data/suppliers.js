// 元器件供应商：同一品类下 2–3 家，价格 / 交期 / 可靠性各不相同
//
// 设计意图：没有"最优解"。便宜的慢且容易断供，快而稳的贵。
// reliability 越低，越可能在供应紧张时被列入断供名单。

export const SUPPLIERS = [
  // ---- 芯片 ----
  { id: 'sc_hj', cat: 'chip', name: '华晶半导体', priceMul: 1.0, leadDelta: 0, reliability: 0.93, desc: '一线大厂，产能稳、报价硬。' },
  { id: 'sc_ly', cat: 'chip', name: '凌云微电子', priceMul: 0.91, leadDelta: 1, reliability: 0.78, desc: '二线代工，便宜一个月，但产能常常吃紧。' },
  { id: 'sc_df', cat: 'chip', name: '东峰集成', priceMul: 1.07, leadDelta: -1, reliability: 0.9, desc: '加价插单，交期比同行快一个月。' },

  // ---- 显示面板 ----
  { id: 'sc_xh', cat: 'display', name: '星海显示', priceMul: 1.0, leadDelta: 0, reliability: 0.95, desc: '自产面板，良率行业最高。' },
  { id: 'sc_hc', cat: 'display', name: '华彩光电', priceMul: 0.89, leadDelta: 1, reliability: 0.74, desc: '低价抢单，面板等级参差。' },
  { id: 'sc_jc', cat: 'display', name: '晶彩科技', priceMul: 1.06, leadDelta: -1, reliability: 0.88, desc: '高端 OLED，交期短但价格高。' },

  // ---- 存储颗粒 ----
  { id: 'sc_cx', cat: 'memory', name: '长芯存储', priceMul: 1.0, leadDelta: 0, reliability: 0.92, desc: '颗粒自产，价格随行就市。' },
  { id: 'sc_hl', cat: 'memory', name: '海力微', priceMul: 0.93, leadDelta: 1, reliability: 0.8, desc: '现货贸易商，价格波动大。' },

  // ---- 摄像头模组 ----
  { id: 'sc_gs', cat: 'camera', name: '光烁影像', priceMul: 1.0, leadDelta: 0, reliability: 0.94, desc: '模组龙头，镜头与传感器一站式。' },
  { id: 'sc_my', cat: 'camera', name: '明远光学', priceMul: 0.9, leadDelta: 1, reliability: 0.76, desc: '副厂模组，便宜但一致性一般。' },
  { id: 'sc_qs', cat: 'camera', name: '青石光电', priceMul: 1.08, leadDelta: -1, reliability: 0.87, desc: '大底传感器优先供货。' },

  // ---- 电池 ----
  { id: 'sc_nk', cat: 'battery', name: '南科新能源', priceMul: 1.0, leadDelta: 0, reliability: 0.96, desc: '电芯自产，安全记录最好。' },
  { id: 'sc_xd', cat: 'battery', name: '迅达电芯', priceMul: 0.92, leadDelta: 1, reliability: 0.82, desc: '便宜快充，循环寿命稍逊。' },

  // ---- 结构件 ----
  { id: 'sc_jy', cat: 'shell', name: '精艺结构', priceMul: 1.0, leadDelta: 0, reliability: 0.95, desc: 'CNC 与压铸一体，公差稳定。' },
  { id: 'sc_hm', cat: 'shell', name: '宏模五金', priceMul: 0.88, leadDelta: 1, reliability: 0.8, desc: '低价模具，量产初期需要修模。' },
];

export const SUPPLIER_MAP = Object.fromEntries(SUPPLIERS.map((s) => [s.id, s]));

export function suppliersFor(catId) {
  return SUPPLIERS.filter((s) => s.cat === catId);
}

export function defaultSupplier(catId) {
  const list = suppliersFor(catId);
  if (!list.length) return null;
  // 默认选可靠性最高的那家（不做"最便宜"的引导）
  return [...list].sort((a, b) => b.reliability - a.reliability)[0];
}

// 断供事件池：任何品类都可能被点名
export function pickDisruptableSupplier(state) {
  const used = new Set();
  for (const o of state.supply?.orders || []) if (o.supplierId) used.add(o.supplierId);
  const pool = SUPPLIERS.filter((s) => !(state.supply?.disruptions || []).some((d) => d.supplierId === s.id));
  if (!pool.length) return null;
  // 优先挑玩家正在用的供应商，让事件真的有痛感
  const inUse = pool.filter((s) => used.has(s.id));
  const list = inUse.length ? inUse : pool;
  return list[Math.floor(Math.random() * list.length)];
}
