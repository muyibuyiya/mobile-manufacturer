// 新手引导（助理提示链）：按经营阶段逐条提示，条件达成自动进入下一条
// 可跳过；设置页可重新开启
import { addLog } from './state.js';

export const GUIDE_STEPS = [
  {
    id: 'hire',
    title: '组建团队',
    text: '先到「组织与员工」招聘第一批员工。研发、设计、生产三个部门各 1~2 人是起步配置。',
    target: { tab: 'company' },
    done: (s) => s.employees.length >= 3,
  },
  {
    id: 'design',
    title: '设计第一款手机',
    text: '到「设计与产品」创建机型方案，用设计器调整参数，屏幕尺寸和部件决定了成本与评分。',
    target: { tab: 'product', act: 'design' },
    done: (s) => s.models.some((m) => m.status !== 'draft' || m.design),
  },
  {
    id: 'order',
    title: '备料下单',
    text: '生产前需要元器件：在「生产供应链」下采购订单，缺料时只能高价走现货。',
    target: { tab: 'supply', act: 'order' },
    done: (s) => (s.supply?.orders || []).length > 0,
  },
  {
    id: 'launch',
    title: '量产上市',
    text: '回到产品页，把设计好的机型「量产上市」。注意定价：定价高于市场期望会压低评分与销量。',
    target: { tab: 'product', act: 'launch' },
    done: (s) => s.models.some((m) => m.status === 'production'),
  },
  {
    id: 'marketing',
    title: '投放广告',
    text: '到「财务中心」给媒体渠道分配预算，让消费者认识你的品牌。渠道与产品定位匹配时效果更好。',
    target: { tab: 'finance', act: 'marketing' },
    done: (s) => Object.values(s.marketing?.channels || {}).some((v) => v > 0) || s.company.marketingBudget > 0,
  },
  {
    id: 'research',
    title: '启动研发',
    text: '在「科技研发」立项一项技术。技术解锁新部件——第一年性价比最高的是基础工艺类。',
    target: { tab: 'tech', act: 'research' },
    done: (s) => (s.tech.unlocked.length > 1) || !!s.tech.researching,
  },
  {
    id: 'month1',
    title: '推进第一个月',
    text: '按空格键或点「下一月」推进回合，月底看财报：毛利为正说明定价和成本健康。',
    target: { tab: 'overview' },
    done: (s) => s.date.year > s.founded?.year || (s.history || []).length > 0,
  },
  {
    id: 'expand',
    title: '扩大经营',
    text: '盈利后可以考虑：海外建厂降关税、成立自研部门、举办发布会。祝生意兴隆！',
    target: { tab: 'overview' },
    done: () => true,
  },
];

export function ensureGuide(state) {
  if (!state.guide) state.guide = { step: 0, skipped: false };
  return state.guide;
}

// 每次推进回合 / 打开页面时检查：条件满足就前进
export function advanceGuide(state) {
  const g = ensureGuide(state);
  if (g.skipped) return null;
  let moved = false;
  while (g.step < GUIDE_STEPS.length && GUIDE_STEPS[g.step].done(state)) {
    g.step += 1;
    moved = true;
  }
  if (moved && g.step < GUIDE_STEPS.length) {
    addLog(state, 'guide', `助理：${GUIDE_STEPS[g.step].title} —— ${GUIDE_STEPS[g.step].text}`);
  }
  if (g.step >= GUIDE_STEPS.length) return null;
  return GUIDE_STEPS[g.step];
}

export function skipGuide(state) {
  const g = ensureGuide(state);
  g.skipped = true;
  addLog(state, 'guide', '已关闭新手引导，可在设置中重新开启。');
}

export function restartGuide(state) {
  state.guide = { step: 0, skipped: false };
}

// ---------- 中后期系统提示 ----------
// 新手链只覆盖开局；这些是"很多玩家不知道游戏有这个系统"的补救提示。
// 每条只出现一次，玩家点「知道了」后写进 state.hints.seen。
export const HINTS = [
  {
    id: 'marketing-up',
    title: '品牌打不响？',
    text: '在「财务中心」给媒体渠道分配预算。渠道和产品定位匹配时（如游戏自媒体配性能旗舰）效果更好。',
    when: (s) => s.company.brand < 32 && (s.history || []).length > 6,
  },
  {
    id: 'warranty',
    title: '保修也是卖点',
    text: '「财务中心 → 售后服务」可选四档保修政策。越慷慨评分越高、退货越少，但要权衡售后成本。',
    when: (s) => s.models.some((m) => m.status === 'production') && (s.history || []).length > 8,
  },
  {
    id: 'acquisition',
    title: '收购与子品牌',
    text: '现金充裕后（1.5 亿以上）可以在「资本运作」与竞争对手谈判收购——他们有品牌、有渠道；也可以直接成立子品牌打入细分市场。',
    when: (s) => (s.company.cash || 0) >= 1.5e8 && (s.history || []).length > 10,
  },
  {
    id: 'osd-build',
    title: '自研系统护城河',
    text: '对手越来越强，靠攒零件拉不开差距。成立「系统开发部」自研 OS，评分和生态都是长期红利。',
    when: (s) => (s.date.year || 0) >= (s.company.founded || 0) + 3 && (s.divisions?.osd?.level || 0) === 0,
  },
  {
    id: 'os-license',
    title: 'OS 授权变现',
    text: '自研 OS 装机量已初具规模！到「组织与员工」开放系统授权，其他厂商每卖一台你都能抽成。',
    when: (s) => (s.osPop?.totalInstall || 0) > 5e6 && !s.osPop?.licensed,
  },
  {
    id: 'overseas',
    title: '海外建厂',
    text: '海外销量占比起来后，关税会是利润杀手。在目标市场建厂可减免 90% 关税，还能提振当地需求。',
    when: (s) => (s.markets || []).filter((m) => m.launched).length >= 4 && (s.company.cash || 0) >= 6e7,
  },
  {
    id: 'supply-chain',
    title: '供应链防火墙',
    text: '断供会直接打乱生产节奏。给关键元器件多养一家备选供应商，健康度过低时留意「生产供应链」页的预警。',
    when: (s) => (s.history || []).length > 4 && (s.supply?.disruptions || []).some((d) => d.months > 0),
  },
];

export function ensureHints(state) {
  if (!state.hints) state.hints = { seen: {} };
  return state.hints;
}

// 返回当前应该展示的第一条提示（没有则 null）
export function advanceHints(state) {
  const h = ensureHints(state);
  for (const hint of HINTS) {
    if (h.seen[hint.id]) continue;
    try {
      if (hint.when(state)) return hint;
    } catch (e) { /* 条件字段缺失时跳过 */ }
  }
  return null;
}

export function markHint(state, id) {
  ensureHints(state).seen[id] = true;
}

export function resetHints(state) {
  state.hints = { seen: {} };
}
