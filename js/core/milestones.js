// 发展阶段：七个里程碑，给经营一个明确的目标曲线
import { avgShare } from './sim.js';

export const MILESTONES = [
  {
    id: 'm1',
    name: '第一款手机上市',
    desc: '完成一次设计并量产上市，让公司真正有产品可卖。',
    check: (s) => s.models.some((m) => m.launched) || s.history.some((h) => h.units > 0),
    reward: { brand: 2 },
  },
  {
    id: 'm2',
    name: '累计销量 10 万台',
    desc: '把第一代产品卖成真正的现金流。',
    check: (s) => s.models.reduce((a, m) => a + (m.sold || 0), 0) >= 100000,
    reward: { brand: 2 },
  },
  {
    id: 'm3',
    name: '全球份额 1%',
    desc: '在竞争格局中站稳脚跟，进入主流视野。',
    check: (s) => avgShare(s) >= 0.01,
    reward: { brand: 3 },
  },
  {
    id: 'm4',
    name: '自建工厂',
    desc: '拥有自己的产线，摆脱代工的产能与成本束缚。',
    check: (s) => (s.campus?.plots || []).some((p) => p.building?.typeId === 'factory' && p.building.status === 'active'),
    reward: { brand: 2 },
  },
  {
    id: 'm5',
    name: '登陆 5 个市场',
    desc: '同时在全球五个市场销售手机。',
    check: (s) => {
      const set = new Set();
      for (const m of s.models) for (const mk of m.markets) set.add(mk);
      return set.size >= 5;
    },
    reward: { brand: 3 },
  },
  {
    id: 'm6',
    name: '年营收 10 亿',
    desc: '近 12 个月营收合计突破 10 亿元。',
    check: (s) => s.history.slice(-12).reduce((a, h) => a + h.revenue, 0) >= 1e9,
    reward: { brand: 4 },
  },
  {
    id: 'm7',
    name: '全球份额 5%',
    desc: '成为任何对手都无法忽视的一线厂商。',
    check: (s) => avgShare(s) >= 0.05,
    reward: { brand: 6 },
  },
];

export function initMilestones(state) {
  state.milestones = state.milestones || {};
  return state.milestones;
}

// 返回本次新达成的里程碑
export function checkMilestones(state, date) {
  initMilestones(state);
  const done = [];
  for (const m of MILESTONES) {
    if (state.milestones[m.id]) continue;
    if (m.check(state)) {
      state.milestones[m.id] = { year: date.year, month: date.month };
      if (m.reward?.brand) state.company.brand = Math.min(100, state.company.brand + m.reward.brand);
      done.push(m);
    }
  }
  return done;
}

export function milestoneProgress(state) {
  const done = MILESTONES.filter((m) => state.milestones?.[m.id]).length;
  const next = MILESTONES.find((m) => !state.milestones?.[m.id]) || null;
  return { done, total: MILESTONES.length, next };
}
