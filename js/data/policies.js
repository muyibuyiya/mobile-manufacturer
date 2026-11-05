// 政策系统：GDD 第十五章的 12 类宏观政策
//
// 政策是持续数月的"环境状态"，与一次性随机事件不同：
// - 有 minYear/maxYear（出口管制、数据安全只在对应年代出现）
// - 效果通过 policyMul(state, key) 汇入结算
// - taxAdd / tariffAdd 是"加法"效果，由 sim 单独读取

export const POLICIES = [
  {
    id: 'industry_support', name: '产业扶持政策', icon: '🏛', kind: 'good', weight: 7,
    desc: '政府将本行业列为战略产业，研发投入享受政策倾斜。',
    effects: { rndMul: 0.88 }, months: [4, 8],
  },
  {
    id: 'subsidy', name: '购机补贴', icon: '🎟', kind: 'good', weight: 6,
    desc: '消费补贴刺激换机需求，各市场销量普遍上扬。',
    effects: { demandMul: 1.15 }, months: [3, 6],
  },
  {
    id: 'export_control', name: '出口管制', icon: '🚧', kind: 'bad', weight: 5, minYear: 2010,
    desc: '关键元器件与整机出口受限，海外市场关税性壁垒上升。',
    effects: { tariffAdd: 0.1 }, months: [4, 8],
  },
  {
    id: 'environmental', name: '环保法规', icon: '🌿', kind: 'bad', weight: 5, minYear: 2000,
    desc: '环保标准提高，包装与生产环节合规成本上升。',
    effects: { costMul: 1.06 }, months: [5, 10],
  },
  {
    id: 'labor_law', name: '劳动法收紧', icon: '⚖', kind: 'neutral', weight: 5, minYear: 1995,
    desc: '加班限制与社保要求落地，人力成本上升但员工满意度提高。',
    effects: { salaryMul: 1.12, morale: 2 }, months: [6, 12],
  },
  {
    id: 'tax_hike', name: '税率上调', icon: '📊', kind: 'bad', weight: 4,
    desc: '财政压力下企业所得税率临时上调。',
    effects: { taxAdd: 0.03 }, months: [6, 12],
  },
  {
    id: 'tax_cut', name: '减税降费', icon: '🧾', kind: 'good', weight: 4,
    desc: '普惠性减税，利润端直接受益。',
    effects: { taxAdd: -0.03 }, months: [6, 12],
  },
  {
    id: 'recession', name: '经济衰退周期', icon: '📉', kind: 'bad', weight: 4,
    desc: '宏观景气度下行，消费电子首当其冲。',
    effects: { demandMul: 0.8 }, months: [5, 9],
  },
  {
    id: 'inflation', name: '通货膨胀', icon: '🎈', kind: 'bad', weight: 5, minYear: 1985,
    desc: '物价普涨，物料与工资同步承压。',
    effects: { costMul: 1.08, salaryMul: 1.06 }, months: [4, 8],
  },
  {
    id: 'fx_weak', name: '本币贬值', icon: '💱', kind: 'good', weight: 4, minYear: 1990,
    desc: '汇率走低利好出口，海外需求上升。',
    effects: { demandMul: 1.08 }, months: [3, 6],
  },
  {
    id: 'fx_strong', name: '本币升值', icon: '💱', kind: 'bad', weight: 4, minYear: 1990,
    desc: '汇率走高削弱出口竞争力，海外需求回落。',
    effects: { demandMul: 0.93 }, months: [3, 6],
  },
  {
    id: 'data_rules', name: '数据安全合规', icon: '🔐', kind: 'neutral', weight: 5, minYear: 2016,
    desc: '数据合规要求落地，营销获客更难，运营成本小幅上升。',
    effects: { brandCut: 0.9, costMul: 1.03 }, months: [6, 12],
  },
];

export const POLICY_MAP = Object.fromEntries(POLICIES.map((p) => [p.id, p]));

// 按年代筛出当期可能出现的政策
export function eligiblePolicies(year) {
  return POLICIES.filter((p) => (p.minYear || 0) <= year);
}
