// 五轨 Perk（v1.10.0）：行动成长、二选一、永久生效
// 不依赖创始人背景，直接做成长期经营目标。
export const PERK_TRACKS = [
  { id: 'management', name: '管理', icon: '☺', color: '#9b8cff', desc: '招聘、培训、团队稳定' },
  { id: 'economy', name: '经济与基础设施', icon: '¥', color: '#e0c14a', desc: '融资、门店、办公、税务' },
  { id: 'tech', name: '生产与技术', icon: '⚙', color: '#4aa3ff', desc: '研发、设计、品质、影像' },
  { id: 'market', name: '市场与受众', icon: '📣', color: '#f56b8f', desc: '营销、需求、门店转化、热度' },
  { id: 'influence', name: '影响力与支配', icon: '⚔', color: '#f5a542', desc: '授权、收购、品牌、子公司' },
];

export const PERKS = [
  // 管理
  { id: 'm1', track: 'management', name: '扁平组织', desc: '团队士气 +3，沟通成本更低', effects: { morale: +3 } },
  { id: 'm2', track: 'management', name: '导师制度', desc: '培训效果 +15%，新人成长更快', effects: { training: 1.15 } },
  { id: 'm3', track: 'management', name: '精准招聘', desc: '招聘质量 +10%，减少看走眼', effects: { hireQuality: 1.1 } },
  { id: 'm4', track: 'management', name: '长期激励', desc: '薪资期望压力 -3%，骨干更稳定', effects: { salaryPressure: 0.97 } },
  { id: 'm5', track: 'management', name: '反挖角协议', desc: '被猎头挖角概率 -15%', effects: { poachResist: 1.15 } },
  { id: 'm6', track: 'management', name: '明星团队', desc: '员工产出 +5%，品牌加成更明显', effects: { staffOutput: 1.05, brandGain: 1.03 } },
  // 经济
  { id: 'e1', track: 'economy', name: '银行关系', desc: '贷款利率 -8%', effects: { loanRate: 0.92 } },
  { id: 'e2', track: 'economy', name: '选址眼光', desc: '门店开店/升级成本 -10%', effects: { storeCost: 0.9 } },
  { id: 'e3', track: 'economy', name: '精益办公', desc: '办公与租金 -5%', effects: { officeCost: 0.95 } },
  { id: 'e4', track: 'economy', name: '税务筹划', desc: '所得税率 -5%', effects: { tax: 0.95 } },
  { id: 'e5', track: 'economy', name: '主题运营', desc: 'OS 主题收入 +15%', effects: { themeRevenue: 1.15 } },
  { id: 'e6', track: 'economy', name: '资本结构', desc: '融资/贷款额度 +15%', effects: { creditLimit: 1.15 } },
  // 技术
  { id: 't1', track: 'tech', name: '快速迭代', desc: '研发速度 +10%', effects: { rndSpeed: 1.1 } },
  { id: 't2', track: 'tech', name: '设计驱动', desc: '外观设计评分 +2', effects: { designScore: 2 } },
  { id: 't3', track: 'tech', name: '质量前置', desc: '故障率 -10%', effects: { defect: 0.9 } },
  { id: 't4', track: 'tech', name: '续航优先', desc: '续航评分 +2', effects: { battery: 2 } },
  { id: 't5', track: 'tech', name: '性能调校', desc: '性能评分 +2', effects: { perf: 2 } },
  { id: 't6', track: 'tech', name: '影像算法', desc: '影像评分 +2', effects: { camera: 2 } },
  // 市场
  { id: 'k1', track: 'market', name: '增长投放', desc: '营销效果 +15%', effects: { marketing: 1.15 } },
  { id: 'k2', track: 'market', name: '需求创造', desc: '全市场需求 +5%', effects: { demandMul: 1.05 } },
  { id: 'k3', track: 'market', name: '门店体验', desc: '门店销量系数 +5%', effects: { storeConv: 1.05 } },
  { id: 'k4', track: 'market', name: '口碑管理', desc: '产品热度衰减 -10%', effects: { heatDecay: 0.9 } },
  { id: 'k5', track: 'market', name: '价格锚点', desc: '价格敏感度 -5%', effects: { priceSensitivity: 0.95 } },
  { id: 'k6', track: 'market', name: '发布节奏', desc: '发布会需求系数 +10%', effects: { launchHype: 1.1 } },
  // 影响力
  { id: 'i1', track: 'influence', name: '生态授权', desc: 'OS 授权收入 +10%', effects: { licenseRate: 1.1 } },
  { id: 'i2', track: 'influence', name: '并购老手', desc: '收购报价 -5%', effects: { acquirePrice: 0.95 } },
  { id: 'i3', track: 'influence', name: '品牌势能', desc: '品牌获取 +10%', effects: { brandGain: 1.1 } },
  { id: 'i4', track: 'influence', name: '集团协同', desc: '子公司上缴 +10%', effects: { subIncome: 1.1 } },
  { id: 'i5', track: 'influence', name: '商业情报', desc: '竞品情报更准确', effects: { intel: 1.1 } },
  { id: 'i6', track: 'influence', name: '猎头网络', desc: '挖角成功率 +10%', effects: { poach: 1.1 } },
];

export const PERK_MAP = Object.fromEntries(PERKS.map((p) => [p.id, p]));