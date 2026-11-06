// 室内家具与隔断：办公室房间级编辑的物品定义
//
// 设计意图：所有物品都买得起、看得见、有真实的小效果。
// - desk 增加工位（officeCapacity）
// - plant / sofa / coffee / printer 提升员工满意度（fMorale）
// - rack 提升研发效率（fRnd）
// - wall / door 是放在格子边缘的隔断，纯装饰 + 剖面演示

export const FURNITURE = [
  { id: 'desk', name: '工位桌', icon: '▦', cost: 8000, desc: '新增 1 个工位。' },
  { id: 'plant', name: '绿植', icon: '❀', cost: 2000, desc: '满意度 +0.4。' },
  { id: 'sofa', name: '沙发', icon: '▭', cost: 12000, desc: '满意度 +1.2。' },
  { id: 'coffee', name: '咖啡机', icon: '☕', cost: 9000, desc: '满意度 +0.8。' },
  { id: 'printer', name: '打印机', icon: '▤', cost: 15000, desc: '满意度 +0.2。' },
  { id: 'rack', name: '服务器机架', icon: '▥', cost: 40000, desc: '研发效率 +3%。' },
];

export const FURNITURE_MAP = Object.fromEntries(FURNITURE.map((f) => [f.id, f]));

// 隔断（放在格子边缘）
export const PARTITIONS = [
  { id: 'wall', name: '隔墙', icon: '▯', cost: 3000, desc: '划分办公区域。' },
  { id: 'door', name: '门', icon: '⊓', cost: 5000, desc: '隔墙上的通道。' },
];

export const PARTITIONS_MAP = Object.fromEntries(PARTITIONS.map((p) => [p.id, p]));

// 各类汇总加成（供 sim / state 使用）
export function layoutCapacityBonus(state) {
  return (state.officeLayout?.items || []).filter((i) => i.type === 'desk').length;
}

export function layoutMoraleBonus(state) {
  const morale = { plant: 0.4, sofa: 1.2, coffee: 0.8, printer: 0.2 };
  let sum = 0;
  for (const i of state.officeLayout?.items || []) sum += morale[i.type] || 0;
  return Math.min(sum, 6);
}

export function layoutRndBonus(state) {
  const racks = (state.officeLayout?.items || []).filter((i) => i.type === 'rack').length;
  return Math.min(racks * 0.03, 0.12);
}
