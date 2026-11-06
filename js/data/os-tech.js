// 系统科技树：系统开发部专属技术路线（独立于通用科技树，服务自研 OS 的评分/流行度/授权）
// 每个节点：年份门槛 + 研发费用 + 研发周期（月）+ 前置依赖 + 生效加成
// effect 键位：
//   scoreBonus  自研系统评分加成（机型设计评分）
//   appsBonus   应用生态加成（机型评分中的生态项）
//   popCap      流行度上限 +
//   popGrowth   流行度增速 +%（按装机量转化）
//   licRate     授权收入 +%
export const OS_TECH_BRANCHES = [
  { id: 'ux', name: '流畅体验', color: '#8fd0ff' },
  { id: 'ai', name: '智能服务', color: '#c9a6ff' },
  { id: 'sec', name: '隐私安全', color: '#7de3b0' },
  { id: 'eco', name: '互联生态', color: '#ffd479' },
  { id: 'dist', name: '发行运营', color: '#ff8f4a' },
];

export const OS_TECHS = [
  // ---- 流畅体验 ----
  { id: 'ux_compositor', branch: 'ux', name: '图形合成器', year: 2008, cost: 30000000, months: 4, prereq: [], effect: { scoreBonus: 2 }, desc: '统一渲染合成架构，界面滑动不再掉帧。' },
  { id: 'ux_scheduler', branch: 'ux', name: '高帧率调度', year: 2019, cost: 80000000, months: 5, prereq: ['ux_compositor'], effect: { popGrowth: 10 }, desc: '120Hz 智能调度，跟手性成为用户口碑。' },
  { id: 'ux_gpu_render', branch: 'ux', name: 'GPU 渲染管线', year: 2022, cost: 150000000, months: 6, prereq: ['ux_scheduler'], effect: { scoreBonus: 4 }, desc: '重载界面与大型游戏稳定满帧。' },

  // ---- 智能服务 ----
  { id: 'ai_voice', branch: 'ai', name: '语音助手', year: 2011, cost: 45000000, months: 4, prereq: [], effect: { appsBonus: 3 }, desc: '系统级语音入口，生态黏性的起点。' },
  { id: 'ai_edge', branch: 'ai', name: '端侧 AI 框架', year: 2018, cost: 120000000, months: 6, prereq: ['ai_voice'], effect: { scoreBonus: 3 }, desc: '本地推理视觉/语音，隐私与时延双优。' },
  { id: 'ai_agent', branch: 'ai', name: '系统级智能体', year: 2024, cost: 260000000, months: 8, prereq: ['ai_edge'], effect: { appsBonus: 5, popCap: 10 }, desc: '跨应用任务执行，系统从工具变成助理。' },

  // ---- 隐私安全 ----
  { id: 'sec_perm', branch: 'sec', name: '权限管理中心', year: 2012, cost: 40000000, months: 4, prereq: [], effect: { scoreBonus: 2 }, desc: '细粒度权限授权，敏感行为可视可撤。' },
  { id: 'sec_sandbox', branch: 'sec', name: '隐私沙盒', year: 2019, cost: 95000000, months: 5, prereq: ['sec_perm'], effect: { licRate: 10 }, desc: '广告与追踪隔离，授权厂商更放心。' },
  { id: 'sec_tee', branch: 'sec', name: '安全芯片协同', year: 2021, cost: 170000000, months: 6, prereq: ['sec_sandbox'], effect: { scoreBonus: 4 }, desc: '密钥/支付/生物特征硬件级隔离。' },

  // ---- 互联生态 ----
  { id: 'eco_cloud', branch: 'eco', name: '云服务框架', year: 2013, cost: 55000000, months: 5, prereq: [], effect: { appsBonus: 2 }, desc: '云同步与查找设备，换机不留死角。' },
  { id: 'eco_cross', branch: 'eco', name: '跨设备互联', year: 2019, cost: 130000000, months: 6, prereq: ['eco_cloud'], effect: { popGrowth: 15 }, desc: '手机/平板/手表/耳机一碰互传。' },
  { id: 'eco_car', branch: 'eco', name: '车机互联协议', year: 2022, cost: 210000000, months: 7, prereq: ['eco_cross'], effect: { licRate: 20 }, desc: '手机-车机无缝流转，车企授权费可观。' },

  // ---- 发行运营 ----
  { id: 'dist_store', branch: 'dist', name: '应用商店', year: 2009, cost: 25000000, months: 3, prereq: [], effect: { licRate: 10 }, desc: '官方分发渠道，抽成与审核权在手。' },
  { id: 'dist_dev', branch: 'dist', name: '开发者分成计划', year: 2014, cost: 70000000, months: 5, prereq: ['dist_store'], effect: { appsBonus: 3 }, desc: '让利开发者，优质应用优先适配。' },
  { id: 'dist_global', branch: 'dist', name: '全场景发行', year: 2021, cost: 180000000, months: 7, prereq: ['dist_dev'], effect: { popCap: 15 }, desc: '一次开发多端部署，生态规模翻倍。' },
];

export const OS_TECH_MAP = Object.fromEntries(OS_TECHS.map((t) => [t.id, t]));

// 节点当前状态：done 已掌握 / doing 研发中 / future 年份未到 / locked 前置未满足 / ready 可立项
export function osTechState(t, year, unlocked, proj) {
  if (unlocked.includes(t.id)) return 'done';
  if (proj && proj.id === t.id) return 'doing';
  if (t.year > year) return 'future';
  if (t.prereq.some((p) => !unlocked.includes(p))) return 'locked';
  return 'ready';
}

// ---------- 系统路线（三选一，互斥不可更换）：OS 光谱分化 ----------
export const OS_ROUTES = [
  { id: 'light', name: '轻量内核', year: 2010, cost: 60000000, osdLv: 2, effect: { scoreBonus: 3, popGrowth: 12 }, desc: '小而美：极致流畅省电，系统科技研发速度 +15%。' },
  { id: 'full', name: '全场景 OS', year: 2015, cost: 140000000, osdLv: 3, effect: { popCap: 12, licRate: 15 }, desc: '手机/平板/穿戴统一生态：流行度上限 +12、授权收入 +15%。' },
  { id: 'ai', name: 'AI 原生系统', year: 2020, cost: 240000000, osdLv: 4, effect: { appsBonus: 6, scoreBonus: 4 }, desc: '系统级 AI 底座：应用生态 +6、评分 +4。' },
];
export const OS_ROUTE_MAP = Object.fromEntries(OS_ROUTES.map((r) => [r.id, r]));
