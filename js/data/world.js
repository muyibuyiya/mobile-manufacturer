// 世界数据：开局年代、总部地区、全球市场、竞争对手、随机事件、人名库
import { clamp, rand, randInt, pick, chance } from '../core/util.js';
export const ERAS = [
  { year: 1980, name: '1980s 模拟通信时代', desc: '砖头机、模拟网络、万元级售价。市场极小，但几乎没有对手。', cash: 3000000, rnd: 0.6, lag: 0 },
  { year: 1990, name: '1990s 移动电话普及', desc: '数字网络与短信，手机从奢侈品走向商务必需品。', cash: 6000000, rnd: 0.75, lag: 0 },
  { year: 2000, name: '2000s 功能机黄金期', desc: '彩屏、和弦、拍照，渠道与外观决定销量。', cash: 12000000, rnd: 0.9, lag: 3 },
  { year: 2010, name: '2010s 智能手机爆发', desc: '触屏与生态重构行业，诺基亚式巨头随时可能崩塌。', cash: 30000000, rnd: 1.0, lag: 3 },
  { year: 2020, name: '2020s 存量竞争', desc: '高端化、影像军备、折叠形态，换机周期拉长。', cash: 60000000, rnd: 1.1, lag: 3 },
  { year: 2035, name: '2035 未来科技', desc: '柔性形态、端侧智能、卫星直连，规则由你重写。', cash: 120000000, rnd: 1.25, lag: 4 },
];

export const COUNTRIES = [
  { id: 'cn', name: '中国', labor: 1.0, tax: 0.25, tech: 1.0, marketBonus: 0.1, desc: '供应链最完整，工程师红利，本土市场巨大。' },
  { id: 'us', name: '美国', labor: 2.6, tax: 0.21, tech: 1.15, marketBonus: 0.05, desc: '高端市场与资本中心，人力成本高。' },
  { id: 'jp', name: '日本', labor: 2.0, tax: 0.3, tech: 1.1, marketBonus: 0.04, desc: '精密制造与元器件优势，市场封闭。' },
  { id: 'kr', name: '韩国', labor: 1.7, tax: 0.22, tech: 1.08, marketBonus: 0.03, desc: '面板与存储产业聚集。' },
  { id: 'de', name: '德国', labor: 2.3, tax: 0.3, tech: 1.12, marketBonus: 0.04, desc: '工业设计与品质口碑。' },
  { id: 'in', name: '印度', labor: 0.55, tax: 0.25, tech: 0.85, marketBonus: 0.12, desc: '低成本制造与高速增长的市场。' },
];

// prefs 权重之和为 1；price 表示价格敏感度（越大越看重便宜）
export const MARKETS = [
  { id: 'cn', name: '中国市场', pop: 1400, base: 22e6, wealth: 0.62, tariff: 0, openYear: 1980, entryCost: 800000, prefs: { perf: 0.2, cam: 0.2, bat: 0.16, design: 0.16, brand: 0.13, price: 0.15 } },
  { id: 'in', name: '印度市场', pop: 1400, base: 14e6, wealth: 0.32, tariff: 0.18, openYear: 1995, entryCost: 600000, prefs: { perf: 0.14, cam: 0.16, bat: 0.22, design: 0.1, brand: 0.1, price: 0.28 } },
  { id: 'na', name: '北美市场', pop: 380, base: 11e6, wealth: 0.95, tariff: 0.06, openYear: 1984, entryCost: 520000, prefs: { perf: 0.2, cam: 0.17, bat: 0.12, design: 0.16, brand: 0.25, price: 0.1 } },
  { id: 'eu', name: '西欧市场', pop: 420, base: 9e6, wealth: 0.85, tariff: 0.08, openYear: 1986, entryCost: 470000, prefs: { perf: 0.17, cam: 0.2, bat: 0.14, design: 0.2, brand: 0.19, price: 0.1 } },
  { id: 'sea', name: '东南亚市场', pop: 680, base: 6e6, wealth: 0.38, tariff: 0.12, openYear: 1988, entryCost: 400000, prefs: { perf: 0.15, cam: 0.18, bat: 0.24, design: 0.12, brand: 0.11, price: 0.2 } },
  { id: 'jp', name: '日本市场', pop: 125, base: 3e6, wealth: 0.9, tariff: 0.05, openYear: 1982, entryCost: 320000, prefs: { perf: 0.18, cam: 0.22, bat: 0.12, design: 0.22, brand: 0.2, price: 0.06 } },
  { id: 'kr', name: '韩国市场', pop: 52, base: 2e6, wealth: 0.82, tariff: 0.06, openYear: 1989, entryCost: 300000, prefs: { perf: 0.2, cam: 0.18, bat: 0.14, design: 0.18, brand: 0.22, price: 0.08 } },
  { id: 'sa', name: '南美市场', pop: 430, base: 5e6, wealth: 0.4, tariff: 0.2, openYear: 1993, entryCost: 370000, prefs: { perf: 0.14, cam: 0.16, bat: 0.22, design: 0.14, brand: 0.14, price: 0.2 } },
  { id: 'ee', name: '东欧市场', pop: 290, base: 3e6, wealth: 0.45, tariff: 0.12, openYear: 1991, entryCost: 320000, prefs: { perf: 0.16, cam: 0.16, bat: 0.2, design: 0.14, brand: 0.16, price: 0.18 } },
  { id: 'me', name: '中东市场', pop: 450, base: 3e6, wealth: 0.6, tariff: 0.1, openYear: 1994, entryCost: 320000, prefs: { perf: 0.18, cam: 0.18, bat: 0.16, design: 0.2, brand: 0.18, price: 0.1 } },
  { id: 'af', name: '非洲市场', pop: 1300, base: 4e6, wealth: 0.22, tariff: 0.2, openYear: 2000, entryCost: 350000, prefs: { perf: 0.12, cam: 0.12, bat: 0.3, design: 0.1, brand: 0.1, price: 0.26 } },
  { id: 'oc', name: '大洋洲市场', pop: 42, base: 1e6, wealth: 0.88, tariff: 0.06, openYear: 1990, entryCost: 270000, prefs: { perf: 0.19, cam: 0.18, bat: 0.12, design: 0.2, brand: 0.21, price: 0.1 } },
];

export const MARKET_MAP = Object.fromEntries(MARKETS.map((m) => [m.id, m]));

// ---------- 消费者分群 ----------
// 7 类人群：偏好权重各自独立，与市场偏好混合后决定该人群的选择
export const SEGMENTS = [
  {
    id: 'budget', name: '低预算用户', icon: '¥', color: '#8b98a8',
    budget: 0.58, priceSens: 1.55,
    prefs: { perf: 0.13, cam: 0.09, bat: 0.24, design: 0.09, brand: 0.05, price: 0.40 },
    desc: '预算优先，够用就好；对价格极度敏感。',
  },
  {
    id: 'mass', name: '普通消费者', icon: '◍', color: '#4aa3ff',
    budget: 0.9, priceSens: 1.0,
    prefs: { perf: 0.20, cam: 0.18, bat: 0.20, design: 0.14, brand: 0.10, price: 0.18 },
    desc: '主流换机人群，各项均衡，看性价比。',
  },
  {
    id: 'biz', name: '商务用户', icon: '▤', color: '#7f8fa6',
    budget: 1.25, priceSens: 0.75,
    prefs: { perf: 0.15, cam: 0.08, bat: 0.27, design: 0.13, brand: 0.22, price: 0.15 },
    desc: '看重续航、通信与安全，对品牌颇为在意。',
  },
  {
    id: 'game', name: '游戏用户', icon: '⚡', color: '#f5a542',
    budget: 0.85, priceSens: 1.1,
    prefs: { perf: 0.35, cam: 0.05, bat: 0.23, design: 0.09, brand: 0.08, price: 0.20 },
    desc: '性能与续航至上，散热和屏幕也在意。',
  },
  {
    id: 'photo', name: '摄影用户', icon: '◎', color: '#1f9d8a',
    budget: 1.15, priceSens: 0.85,
    prefs: { perf: 0.10, cam: 0.42, bat: 0.09, design: 0.17, brand: 0.11, price: 0.11 },
    desc: '影像决定一切，愿意为镜头多付钱。',
  },
  {
    id: 'tech', name: '科技爱好者', icon: '⌬', color: '#c47cf0',
    budget: 1.1, priceSens: 0.9,
    prefs: { perf: 0.29, cam: 0.15, bat: 0.14, design: 0.19, brand: 0.11, price: 0.12 },
    desc: '追新、看参数，对新形态和新工艺敏感。',
  },
  {
    id: 'premium', name: '高端用户', icon: '✦', color: '#f5c542',
    budget: 1.6, priceSens: 0.55,
    prefs: { perf: 0.17, cam: 0.18, bat: 0.12, design: 0.23, brand: 0.25, price: 0.05 },
    desc: '品牌与设计优先，价格几乎不构成障碍。',
  },
];
export const SEGMENT_MAP = Object.fromEntries(SEGMENTS.map((s) => [s.id, s]));

// 各市场的人群结构（未归一化，使用时统一归一）
const MIX = {
  cn: { budget: 22, mass: 34, biz: 12, game: 10, photo: 8, tech: 8, premium: 6 },
  in: { budget: 45, mass: 32, biz: 5, game: 8, photo: 4, tech: 4, premium: 2 },
  na: { budget: 8, mass: 24, biz: 16, game: 12, photo: 10, tech: 16, premium: 14 },
  eu: { budget: 10, mass: 28, biz: 14, game: 10, photo: 12, tech: 14, premium: 12 },
  sea: { budget: 38, mass: 34, biz: 8, game: 8, photo: 5, tech: 4, premium: 3 },
  jp: { budget: 8, mass: 26, biz: 14, game: 8, photo: 16, tech: 14, premium: 14 },
  kr: { budget: 8, mass: 24, biz: 14, game: 10, photo: 10, tech: 18, premium: 16 },
  sa: { budget: 34, mass: 36, biz: 10, game: 7, photo: 5, tech: 5, premium: 3 },
  ee: { budget: 28, mass: 36, biz: 10, game: 8, photo: 7, tech: 7, premium: 4 },
  me: { budget: 20, mass: 30, biz: 18, game: 8, photo: 8, tech: 8, premium: 8 },
  af: { budget: 52, mass: 30, biz: 6, game: 5, photo: 2, tech: 3, premium: 2 },
  oc: { budget: 9, mass: 26, biz: 14, game: 10, photo: 11, tech: 14, premium: 16 },
};

// 返回 [{ id, name, share }]，share 已归一化
export function marketMix(marketId) {
  const raw = MIX[marketId] || MIX.cn;
  const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  return SEGMENTS
    .filter((s) => raw[s.id])
    .map((s) => ({ id: s.id, name: s.name, share: raw[s.id] / total }));
}

// ---------- 产品线 ----------
// priceTier：相对主流锚点的定价定位；appeal：对各人群的吸引力系数
export const LINEUPS = [
  {
    id: 'flagship', name: '旗舰', icon: '✦', priceTier: 1.55, brandGain: 1.8,
    appeal: { premium: 1.20, photo: 1.12, tech: 1.10, biz: 1.02, mass: 0.96, game: 1.0, budget: 0.78 },
    desc: '堆料与品牌标杆，毛利高但人群窄。',
  },
  {
    id: 'main', name: '中端', icon: '◍', priceTier: 1.0, brandGain: 1.0,
    appeal: { premium: 1.02, photo: 1.0, tech: 1.0, biz: 1.0, mass: 1.02, game: 1.0, budget: 1.0 },
    desc: '主力走量机型，覆盖面最广。',
  },
  {
    id: 'youth', name: '低端', icon: '✿', priceTier: 0.62, brandGain: 0.6,
    appeal: { premium: 0.82, photo: 0.92, tech: 0.9, biz: 0.9, mass: 1.06, game: 0.98, budget: 1.18 },
    desc: '低价走量，拉新与渠道渗透用。',
  },
  {
    id: 'biz', name: '商务', icon: '▤', priceTier: 1.15, brandGain: 1.1,
    appeal: { premium: 1.06, photo: 0.92, tech: 0.96, biz: 1.24, game: 0.86, mass: 0.98, budget: 0.88 },
    desc: '续航、安全与通信优先，商务人群忠诚。',
  },
  {
    id: 'game', name: '电竞', icon: '⚡', priceTier: 1.08, brandGain: 0.9,
    appeal: { premium: 0.94, photo: 0.85, tech: 1.06, biz: 0.88, mass: 0.96, game: 1.26, budget: 0.9 },
    desc: '性能与散热特化，游戏人群溢价明显。',
  },
];
export const LINEUP_MAP = Object.fromEntries(LINEUPS.map((l) => [l.id, l]));


// 年度市场规模系数
export function eraFactor(year) {
  const pts = [
    [1980, 0.012], [1985, 0.03], [1990, 0.07], [1995, 0.14], [2000, 0.26],
    [2005, 0.42], [2010, 0.62], [2015, 0.82], [2020, 1.0], [2025, 1.06],
    [2030, 1.1], [2040, 1.15], [2050, 1.2],
  ];
  if (year <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (year >= pts[i][0] && year <= pts[i + 1][0]) {
      const t = (year - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
    }
  }
  return 1.2;
}

// 竞争对手：现实品牌（中英文名）+ 系列化产品线（系列 → 代际 → 版本）
// series[].tier: flagship 旗舰 / mid 中端 / entry 入门
export const COMPETITORS = [
  { id: 'nokia', nameZh: '诺基亚', nameEn: 'Nokia', country: '欧洲', style: 'rugged', brand: 90, tech: 1.0, priceTier: 0.9, color: '#2557a7', desc: '功能机时代的耐用与渠道之王。', foundedYear: 1982, declineYear: 2012, exitYear: null, cashMul: 2.0, series: [{ name: 'Xpress', tier: 'mid' }, { name: 'Lumia', tier: 'flagship' }, { name: 'Classic', tier: 'entry' }] },
  { id: 'samsung', nameZh: '三星', nameEn: 'Samsung', country: '韩国', style: 'supply', brand: 86, tech: 1.1, priceTier: 1.0, color: '#1428a0', desc: '面板、存储、芯片全部自产，成本控制恐怖。', foundedYear: 1988, declineYear: null, exitYear: null, cashMul: 4.0, series: [{ name: 'Galaxy S', tier: 'flagship', versions: ['', 'Plus', 'Ultra'] }, { name: 'Galaxy A', tier: 'mid' }, { name: 'Galaxy M', tier: 'entry' }] },
  { id: 'apple', nameZh: '苹果', nameEn: 'Apple', country: '美国', style: 'ecosystem', brand: 93, tech: 1.12, priceTier: 1.55, color: '#6e6e73', desc: '封闭生态与品牌溢价，单款爆品策略。', foundedYear: 2007, declineYear: null, exitYear: null, cashMul: 5.0, series: [{ name: 'iPhone', tier: 'flagship', versions: ['', 'Pro', 'Pro Max'] }] },
  { id: 'blackberry', nameZh: '黑莓', nameEn: 'BlackBerry', country: '加拿大', style: 'business', brand: 64, tech: 0.86, priceTier: 1.1, color: '#2a2f45', desc: '全键盘与安全邮件，商务人群忠诚度极高。', foundedYear: 1999, declineYear: 2015, exitYear: null, cashMul: 0.5, series: [{ name: 'Bold', tier: 'flagship' }, { name: 'Curve', tier: 'entry' }] },
  { id: 'huawei', nameZh: '华为', nameEn: 'Huawei', country: '中国', style: 'tech', brand: 80, tech: 1.08, priceTier: 1.0, color: '#c0392b', desc: '通信设备起家，研发投入巨大。', foundedYear: 2003, declineYear: null, exitYear: null, cashMul: 3.0, series: [{ name: 'Mate', tier: 'flagship', versions: ['', 'Pro', 'RS'] }, { name: 'P', tier: 'flagship' }, { name: 'nova', tier: 'mid' }] },
  { id: 'xiaomi', nameZh: '小米', nameEn: 'Xiaomi', country: '中国', style: 'value', brand: 66, tech: 0.98, priceTier: 0.62, color: '#e07b1a', desc: '互联网直销与极致性价比，粉丝运营见长。', foundedYear: 2010, declineYear: null, exitYear: null, cashMul: 1.8, series: [{ name: 'Mi', tier: 'flagship' }, { name: 'Redmi Note', tier: 'mid' }, { name: 'Redmi', tier: 'entry' }] },
  { id: 'oppo', nameZh: 'OPPO', nameEn: 'OPPO', country: '中国', style: 'camera', brand: 72, tech: 1.0, priceTier: 1.02, color: '#1f9d8a', desc: '影像与线下渠道双轮驱动。', foundedYear: 2004, declineYear: null, exitYear: null, cashMul: 1.5, series: [{ name: 'Find', tier: 'flagship', versions: ['', 'Pro'] }, { name: 'Reno', tier: 'mid' }, { name: 'A', tier: 'entry' }] },
  { id: 'vivo', nameZh: 'vivo', nameEn: 'vivo', country: '中国', style: 'design', brand: 70, tech: 0.99, priceTier: 1.0, color: '#5b6ee1', desc: '轻薄设计与音乐体验，年轻人市场强势。', foundedYear: 2009, declineYear: null, exitYear: null, cashMul: 1.4, series: [{ name: 'X', tier: 'flagship', versions: ['', 'Pro'] }, { name: 'S', tier: 'mid' }, { name: 'Y', tier: 'entry' }] },
  { id: 'sony', nameZh: '索尼', nameEn: 'Sony', country: '日本', style: 'quality', brand: 62, tech: 1.03, priceTier: 1.2, color: '#4f5b6b', desc: '影音与工艺口碑，销量不大但毛利很高。', foundedYear: 2001, declineYear: null, exitYear: null, cashMul: 1.2, series: [{ name: 'Xperia', tier: 'flagship' }] },
  { id: 'motorola', nameZh: '摩托罗拉', nameEn: 'Motorola', country: '美国', style: 'rugged', brand: 58, tech: 0.94, priceTier: 0.85, color: '#3d6fd8', desc: '老牌通信巨头，刀锋系列曾风靡全球。', foundedYear: 1973, declineYear: 2007, exitYear: null, cashMul: 1.0, series: [{ name: 'Moto G', tier: 'mid' }, { name: 'Moto X', tier: 'flagship' }, { name: 'RAZR', tier: 'flagship' }] },
  { id: 'htc', nameZh: '宏达电', nameEn: 'HTC', country: '中国台湾', style: 'design', brand: 54, tech: 0.96, priceTier: 0.95, color: '#2dd6a3', desc: '安卓先驱，一度引领机皇设计。', foundedYear: 1997, declineYear: 2014, exitYear: null, cashMul: 0.4, series: [{ name: 'One', tier: 'flagship' }, { name: 'Desire', tier: 'mid' }] },
  { id: 'lg', nameZh: 'LG', nameEn: 'LG', country: '韩国', style: 'quality', brand: 56, tech: 0.97, priceTier: 0.9, color: '#a50034', desc: '显示技术深厚，影音娱乐见长。', foundedYear: 1995, declineYear: 2019, exitYear: 2021, cashMul: 0.9, series: [{ name: 'G', tier: 'flagship' }, { name: 'V', tier: 'flagship' }, { name: 'K', tier: 'entry' }] },
  { id: 'oneplus', nameZh: '一加', nameEn: 'OnePlus', country: '中国', style: 'tech', brand: 60, tech: 1.02, priceTier: 0.95, color: '#eb0029', desc: '旗舰配置性价比化，极客口碑出众。', foundedYear: 2013, declineYear: null, exitYear: null, cashMul: 0.8, series: [{ name: 'OnePlus', tier: 'flagship', versions: ['', 'Pro'] }] },
  { id: 'transsion', nameZh: '传音', nameEn: 'Transsion', country: '中国', style: 'value', brand: 48, tech: 0.9, priceTier: 0.55, color: '#00b1a9', desc: '非洲之王，多卡多待与本地化摄影优化。', foundedYear: 2006, declineYear: null, exitYear: null, cashMul: 0.6, series: [{ name: 'TECNO Camon', tier: 'mid' }, { name: 'itel', tier: 'entry' }] },
  { id: 'meizu', nameZh: '魅族', nameEn: 'Meizu', country: '中国', style: 'design', brand: 46, tech: 0.95, priceTier: 0.88, color: '#2c6fd8', desc: '小而美，手感与系统口碑极佳。', foundedYear: 2003, declineYear: null, exitYear: null, cashMul: 0.25, series: [{ name: 'MX', tier: 'flagship' }, { name: 'Note', tier: 'mid' }] },
  { id: 'zte', nameZh: '中兴', nameEn: 'ZTE', country: '中国', style: 'supply', brand: 44, tech: 0.92, priceTier: 0.7, color: '#7a52c7', desc: '运营商渠道深耕，性价比机型走量。', foundedYear: 1998, declineYear: null, exitYear: null, cashMul: 1.0, series: [{ name: 'Axon', tier: 'flagship', versions: ['', 'Pro'] }, { name: 'Blade', tier: 'entry' }] },
];

// 竞品招牌能力（v1.6.0）：每家一个差异化标签，在份额模型里生效
export const RIVAL_SIGNATURES = {
  durable: { id: 'durable', name: '耐用续航', icon: '🔋', desc: '电池与结构可靠性著称：续航 +12，曝光 +2%', bonus: { battery: 12 }, priceCut: 0, reach: 1.02 },
  display: { id: 'display', name: '面板自产', icon: '▭', desc: '自有面板厂：设计 +8、影像 +4，曝光 +4%', bonus: { design: 8, camera: 4 }, priceCut: 0, reach: 1.04 },
  ecosystem: { id: 'ecosystem', name: '生态闭环', icon: '⌘', desc: '软硬一体：性能 +6、设计 +8，曝光 +8%', bonus: { perf: 6, design: 8 }, priceCut: 0, reach: 1.08 },
  business: { id: 'business', name: '商务安全', icon: '🔐', desc: '安全与全键盘：设计 +6、续航 +6，曝光 +2%', bonus: { design: 6, battery: 6 }, priceCut: 0, reach: 1.02 },
  camera: { id: 'camera', name: '影像旗舰', icon: '📷', desc: '影像调校领先：影像 +12，曝光 +5%', bonus: { camera: 12 }, priceCut: 0, reach: 1.05 },
  value: { id: 'value', name: '极致性价比', icon: '¥', desc: '渠道与定价凶狠：等效降价 12%，曝光 -4%', bonus: {}, priceCut: 0.12, reach: 0.96 },
  design: { id: 'design', name: '轻薄设计', icon: '✦', desc: '工业设计见长：设计 +12，曝光 +3%', bonus: { design: 12 }, priceCut: 0, reach: 1.03 },
  perf: { id: 'perf', name: '性能极客', icon: '⚡', desc: '旗舰配置拉满：性能 +12，曝光 +4%', bonus: { perf: 12 }, priceCut: 0, reach: 1.04 },
};

export const RIVAL_SIGNATURE_MAP = {
  nokia: 'durable', samsung: 'display', apple: 'ecosystem', blackberry: 'business',
  huawei: 'camera', xiaomi: 'value', oppo: 'camera', vivo: 'design',
  sony: 'camera', motorola: 'durable', htc: 'design', lg: 'display',
  oneplus: 'perf', transsion: 'value', meizu: 'design', zte: 'value',
};

export function signatureOf(comp) {
  return RIVAL_SIGNATURES[RIVAL_SIGNATURE_MAP[comp?.id]] || null;
}

const TIER_PRICE = { flagship: 1.18, mid: 0.85, entry: 0.55 };
const TIER_SCORE = { flagship: 6, mid: -2, entry: -10 };

// 玩家机型命名建议（与竞品同规范：系列 → 代际 → 版本）
// 解析已有名字 `系列 代 [版本]`，延续最大代数；无系列时用公司英文名首词开新系列
export function suggestModelName(state, existingNames = []) {
  const genMap = {};
  for (const n of existingNames) {
    const m = String(n).trim().match(/^(.+?)\s*(\d+)\s*(?:Pro Max|Pro|Plus|Ultra|RS|SE|Lite|Max)?$/);
    if (m && m[1]) {
      const s = m[1].trim();
      if (!genMap[s] || Number(m[2]) > genMap[s]) genMap[s] = Number(m[2]);
    }
  }
  const seriesNames = Object.keys(genMap).filter((s) => !/^(新机型|Untitled|新机)/.test(s));
  if (seriesNames.length) {
    const s = seriesNames[Math.floor(Math.random() * seriesNames.length)];
    const next = genMap[s] + 1;
    const ver = chance(0.4) ? pick(['Pro', 'Plus', 'SE', 'Pro Max']) : '';
    return `${s} ${next}${ver ? ' ' + ver : ''}`;
  }
  const base = (state.company.nameEn || state.company.name || 'Nova').split(/[\s ]+/)[0];
  const ver = chance(0.35) ? pick(['Pro', 'Plus']) : '';
  return `${base} 1${ver ? ' ' + ver : ''}`;
}

// 竞品机型生成：系列化命名——系列 → 代数递增 → 同代多版本（35% 概率续发新版本）
export function makeCompetitorPhone(c, year) {
  const t = c.techLevel;
  const base = expectedPrice(year);
  const series = pick(c.series || [{ name: c.nameEn || (c.name || 'X').slice(0, 2), tier: 'mid' }]);
  const versions = series.versions || [''];
  c.seriesGen = c.seriesGen || {};
  let gen, verIdx;
  if (c.lastSeries && c.lastSeries.name === series.name && chance(0.35) && c.lastSeries.verIdx < versions.length - 1) {
    // 同一代继续出新版本（如 Mate 60 → Mate 60 Pro）
    gen = c.lastSeries.gen;
    verIdx = c.lastSeries.verIdx + 1;
  } else {
    gen = (c.seriesGen[series.name] || randInt(1, 6)) + 1;
    c.seriesGen[series.name] = gen;
    verIdx = chance(0.25) ? randInt(1, versions.length - 1) : 0;
  }
  c.lastSeries = { name: series.name, gen, verIdx };
  const tierMul = TIER_PRICE[series.tier] || 1;
  const tierBias = TIER_SCORE[series.tier] || 0;
  const priceTier = c.priceTier * tierMul * (0.92 + t * 0.18);
  const bias = c.style;
  const bump = (v, w) => clamp(v + w + rand(-6, 6), 5, 99);
  const scores = {
    perf: bump(32 + t * 52, (bias === 'tech' || bias === 'ecosystem' ? 7 : 0) + tierBias),
    camera: bump(28 + t * 55, (bias === 'camera' ? 9 : 0) + tierBias),
    battery: bump(40 + t * 38, (bias === 'value' || bias === 'rugged' ? 7 : 0) + tierBias),
    design: bump(36 + t * 46, (bias === 'design' || bias === 'ecosystem' ? 8 : 0) + tierBias),
  };
  const versionMul = rand(0.94, 1.08);
  // 真实定价：按成本与定位毛利倒推（性价比薄利、生态旗舰厚利），再按市场财富/关税折算当地成交价
  const costCny = base * (0.40 + t * 0.14) * tierMul;
  const margin = STYLE_MARGIN[bias] ?? 0.22;
  const cnPrice = Math.max(10, Math.round(costCny / (1 - margin) * versionMul / 10) * 10);
  const priceByMarket = {};
  const cnWealth = MARKET_MAP.cn?.wealth || 0.5;
  for (const mk of MARKETS) {
    const factor = (0.55 + mk.wealth * 0.9) / (0.55 + cnWealth * 0.9);
    priceByMarket[mk.id] = Math.max(10, Math.round(cnPrice * factor / 10) * 10);
  }
  return {
    id: 'cp_' + Math.random().toString(36).slice(2, 8),
    name: `${series.name} ${gen}${versions[verIdx] ? ' ' + versions[verIdx] : ''}`,
    series: series.name,
    gen,
    version: versions[verIdx] || '标准版',
    scores,
    price: cnPrice,
    cost: Math.round(costCny),
    margin,
    priceByMarket,
    age: 0,
    markets: (() => {
      const list = MARKETS.filter(() => chance(0.62)).map((m) => m.id);
      return list.length ? list : ['cn'];
    })(),
  };
}

// 竞品调价（清仓/价格战/折叠溢价）：同步按比例更新各市场成交价
export function scaleCompetitorPrice(phone, mul) {
  const old = phone.price || 0;
  const next = Math.max(10, Math.round(old * mul / 10) * 10);
  phone.price = next;
  if (phone.priceByMarket && old > 0) {
    for (const k of Object.keys(phone.priceByMarket)) {
      phone.priceByMarket[k] = Math.max(10, Math.round(phone.priceByMarket[k] * next / old / 10) * 10);
    }
  }
  return next;
}

// 某市场的竞品成交价（旧档无 priceByMarket 时按财富系数回退）
export function phonePriceInMarket(phone, marketId) {
  const direct = phone?.priceByMarket?.[marketId];
  if (direct > 0) return direct;
  const mk = MARKET_MAP[marketId];
  const cn = MARKET_MAP.cn;
  const p = phone?.price || 0;
  if (!mk || !cn) return p;
  return Math.round(p * ((0.55 + mk.wealth * 0.9) / (0.55 + cn.wealth * 0.9)));
}

// 竞品目标毛利率（按人设定价：性价比薄利、生态旗舰厚利）
const STYLE_MARGIN = {
  value: 0.12, rugged: 0.18, supply: 0.20, hardware: 0.22,
  business: 0.25, camera: 0.28, design: 0.30, tech: 0.30, ecosystem: 0.35,
};

export const STYLE_LABEL = {
  rugged: '耐用路线', supply: '供应链垂直整合', ecosystem: '生态与品牌', business: '商务安全',
  tech: '技术驱动', value: '性价比', camera: '影像旗舰', design: '设计与年轻化', quality: '品质与影音',
};

// 随机事件（概率以月为单位）
export const EVENTS = [
  { id: 'supply', title: '供应链紧张', text: '上游零件产能吃紧，本月采购与生产成本上升。', weight: 8, costMul: 1.18, months: 2, kind: 'bad' },
  { id: 'boom', title: '换机潮来袭', text: '经济回暖，消费者换机意愿显著提升。', weight: 7, demandMul: 1.2, months: 3, kind: 'good' },
  { id: 'recession', title: '全球经济衰退', text: '购买力下降，高端机型首当其冲。', weight: 5, demandMul: 0.78, months: 6, kind: 'bad' },
  { id: 'tariff', title: '贸易摩擦升级', text: '多国上调进口关税，海外市场利润被压缩。', weight: 5, tariffAdd: 0.08, months: 6, kind: 'bad' },
  { id: 'subsidy', title: '产业补贴政策', text: '政府对研发投入给予补贴，研发成本下降。', weight: 6, rndMul: 0.85, months: 6, kind: 'good' },
  { id: 'breakthrough', title: '实验室意外突破', text: '一次失败的实验带来了意外收获，研发进度大幅提升。', weight: 4, rndBoost: 0.15, months: 1, kind: 'good' },
  { id: 'leak', title: '新品信息泄露', text: '未发布机型被提前曝光，发布会效果打折。', weight: 5, hypeMul: 0.8, months: 1, kind: 'bad' },
  { id: 'viral', title: '社交媒体爆红', text: '一条实拍视频让品牌热度暴涨。', weight: 5, brandBoost: 3, months: 1, kind: 'good' },
  { id: 'recall', title: '批次质量事故', text: '某批次产品出现集中故障，被迫召回。', weight: 4, recall: true, months: 1, kind: 'bad' },
  { id: 'poach', title: '对手挖角', text: '竞争对手用高薪挖走了几名骨干。', weight: 5, poach: true, months: 1, kind: 'bad' },
  { id: 'award', title: '设计大奖', text: '产品获得国际设计奖项，品牌形象提升。', weight: 4, brandBoost: 4, months: 1, kind: 'good' },
  { id: 'chip', title: '芯片产能缓解', text: '代工厂扩产，芯片交付周期缩短。', weight: 4, costMul: 0.94, months: 3, kind: 'good' },

  // ---- 第二批：参考现实的行业事件（minYear/maxYear 控制年代）----
  { id: 'patent', title: '专利战打响', text: '行业专利诉讼频发，法务与授权费开支增加，研发节奏被打乱。', weight: 5, minYear: 2005, rndMul: 1.18, months: 4, kind: 'bad' },
  { id: 'shortage', title: '全球缺芯', text: '先进制程产能被大厂包圆，芯片类元器件价格暴涨。', weight: 4, minYear: 2020, maxYear: 2026, costMul: 1.3, months: 4, kind: 'bad' },
  { id: 'mem-up', title: '存储涨价周期', text: '存储颗粒进入涨价周期，内存闪存采购成本上浮。', weight: 5, costMul: 1.12, months: 5, kind: 'bad' },
  { id: 'mem-down', title: '存储大降价', text: '存储工厂满产叠库存高企，颗粒价格跳水电价。', weight: 4, costMul: 0.9, months: 4, kind: 'good' },
  { id: 'livestream', title: '直播带货风口', text: '直播间一场卖掉万台，带货成了新渠道，品牌热度大涨。', weight: 5, minYear: 2016, brandBoost: 3, awarenessBoost: 6, months: 1, kind: 'good' },
  { id: 'ecomm', title: '电商价格战', text: '电商平台补贴大战，全网降价换销量，消费者换机意愿提升。', weight: 5, minYear: 2010, demandMul: 1.1, priceWar: true, months: 2, kind: 'good' },
  { id: 'fx', title: '汇率剧烈波动', text: '主要货币汇率剧烈波动，海外定价与利润承压。', weight: 4, demandMul: 0.92, months: 3, kind: 'bad' },
  { id: 'talent', title: '人才回流潮', text: '海外大厂裁员，一批资深工程师回流求职，研发进度加快。', weight: 4, minYear: 2014, rndBoost: 0.12, months: 1, kind: 'good' },
  { id: 'carrier', title: '运营商集中采购', text: '运营商大规模集采补贴，入门与中端机型需求激增。', weight: 4, maxYear: 2016, demandMul: 1.18, months: 3, kind: 'good' },
  { id: 'trend-5g', title: '5G 换机潮', text: '运营商 5G 网络铺开，消费者排队换 5G 手机。', weight: 6, minYear: 2019, maxYear: 2027, demandMul: 1.22, months: 4, kind: 'good' },
  { id: 'trend-ai', title: 'AI 手机元年', text: '端侧大模型成了新卖点，用户换机理由从配置变成了「智能」。', weight: 6, minYear: 2023, demandMul: 1.14, rndBoost: 0.1, months: 3, kind: 'good' },
  { id: 'trend-fold', title: '折叠屏风潮', text: '铰链与屏幕技术成熟，折叠形态从小众尝鲜变成高端标配。', weight: 4, minYear: 2019, brandBoost: 2, months: 2, kind: 'good' },
  { id: 'green', title: '环保新规落地', text: '新规要求包装去塑料、可回收材料比例达标，成本上升。', weight: 4, minYear: 2015, costMul: 1.08, months: 6, kind: 'bad' },
  { id: 'npe', title: '专利流氓诉讼', text: '一家从不生产的专利持有公司起诉整机侵权，赔款解约费不菲。', weight: 4, minYear: 2008, lawsuit: true, months: 1, kind: 'bad' },
  { id: 'badreview', title: '大 V 翻车测评', text: '千万粉丝博主实测后公开批评，评论区一边倒。', weight: 3, brandBoost: -4, months: 1, kind: 'bad' },
  { id: 'copycat', title: '山寨机泛滥', text: '外形仿冒的山寨机涌入下沉市场，劣币驱逐良币。', weight: 3, awarenessCut: 5, months: 3, kind: 'bad' },
  { id: 'expo', title: '行业博览会', text: '全球通信展搭建了最好的舞台，参展厂商各显神通。', weight: 4, brandBoost: 2, awarenessBoost: 5, months: 1, kind: 'good' },
  { id: 'secondhand', title: '二手市场冲击', text: '循环经济平台鼓吹「年轻人的第一台二手机」，新机需求被分流。', weight: 3, minYear: 2012, demandMul: 0.9, months: 4, kind: 'bad' },
  { id: 'power', title: '限电限产', text: '工业区错峰用电，代工厂产能受限，交付普遍延期。', weight: 3, minYear: 2000, costMul: 1.15, months: 2, kind: 'bad' },
  { id: 'boom-app', title: '杀手级应用出现', text: '一款全民应用突然爆红，手机性能成了刚需话题。', weight: 4, minYear: 2008, demandMul: 1.1, months: 2, kind: 'good' },
];

// 各年代主流机型价格锚点（人民币）
export function expectedPrice(year) {
  const pts = [[1980, 21000], [1990, 11000], [2000, 3200], [2005, 2400], [2010, 2300], [2015, 2400], [2020, 2900], [2030, 3400], [2040, 3800]];
  if (year <= 1980) return 21000;
  for (let i = 0; i < pts.length - 1; i++) {
    if (year >= pts[i][0] && year <= pts[i + 1][0]) {
      const t = (year - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
    }
  }
  return 3800;
}

export const SURNAMES = ['陈', '林', '王', '李', '张', '刘', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '高', '罗', '郑', '梁'];
export const GIVEN = ['嘉禾', '思远', '子墨', '雨桐', '志强', '雅婷', '天成', '若曦', '文博', '一鸣', '梓涵', '俊杰', '晓峰', '欣然', '书航', '沐宸', '锦程', '亦凡'];
export const FOREIGN = [
  ['Alex', 'Chen'], ['Mia', 'Wang'], ['Daniel', 'Park'], ['Sofia', 'Rossi'], ['Kenji', 'Sato'],
  ['Emma', 'Novak'], ['Lucas', 'Silva'], ['Hana', 'Kim'], ['Noah', 'Fischer'], ['Aisha', 'Rahman'],
  ['Ethan', 'Brown'], ['Yuki', 'Tanaka'], ['Omar', 'Haddad'], ['Elena', 'Petrova'], ['Raj', 'Patel'],
];

export const FIELDS = ['通信工程', '微电子', '工业设计', '软件工程', '材料科学', '市场营销', '财务管理', '供应链管理', '质量管理'];
export const EDUS = ['专科', '本科', '硕士', '博士'];
