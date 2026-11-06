// 零件目录（BOM）。每个零件都有价格、性能、功耗、体积/重量与科技门槛。
// 2015 年起加入现实厂商 SoC：同代多供应商、按版本迭代（Gen 递增）。
import { CPU_DB } from './cpu-db.js';

export const CPUS = [
  ...CPU_DB.map((c) => ({
    ...c,
    name: c.vendor === '公版' ? c.name : `${c.name} · ${c.vendor}`,
  })),
];

export const RAMS = [
  { id: 'r0', name: '64 KB SRAM', vendor: '尔必达', tech: 'cpu16', year: 1988, gb: 0.00006, price: 30, weight: 1, power: 0.05 },
  { id: 'r1', name: '2 MB SDRAM', vendor: '三星', tech: 'arm', year: 1998, gb: 0.002, price: 60, weight: 1, power: 0.08 },
  { id: 'r2', name: '32 MB SDRAM', vendor: '三星', tech: 'color_lcd', year: 2002, gb: 0.032, price: 90, weight: 2, power: 0.12 },
  { id: 'r3', name: '256 MB LPDDR', vendor: 'SK 海力士', tech: 'os_smart', year: 2008, gb: 0.25, price: 120, weight: 2, power: 0.15 },
  { id: 'r4', name: '1 GB LPDDR3', vendor: 'SK 海力士', tech: 'ram_lpddr', year: 2012, gb: 1, price: 150, weight: 2, power: 0.18 },
  { id: 'r4b', name: '2 GB LPDDR3', vendor: '美光', tech: 'ram_lpddr', year: 2014, gb: 2, price: 175, weight: 2, power: 0.19 },
  { id: 'r5', name: '4 GB LPDDR4X · 4266MT/s', vendor: '三星', tech: 'ram_lpddr', year: 2017, gb: 4, price: 210, weight: 2, power: 0.2 },
  { id: 'r5b', name: '6 GB LPDDR4X · 4266MT/s', vendor: 'SK 海力士', tech: 'ram_lpddr', year: 2018, gb: 6, price: 245, weight: 2, power: 0.21 },
  { id: 'r5c', name: '8 GB LPDDR4X · 4266MT/s', vendor: '美光', tech: 'ram_lpddr', year: 2019, gb: 8, price: 265, weight: 3, power: 0.21 },
  { id: 'r6', name: '8 GB LPDDR5 · 5500MT/s', vendor: '三星', tech: 'ram_lpddr', year: 2020, gb: 8, price: 280, weight: 3, power: 0.22 },
  { id: 'r6b', name: '12 GB LPDDR5 · 6400MT/s', vendor: 'SK 海力士', tech: 'ram_lpddr', year: 2021, gb: 12, price: 330, weight: 3, power: 0.23 },
  { id: 'r7', name: '12 GB LPDDR5X · 7500MT/s', vendor: '三星', tech: 'ram_lpddr', year: 2022, gb: 12, price: 360, weight: 3, power: 0.24 },
  { id: 'r7b', name: '16 GB LPDDR5X · 8533MT/s', vendor: '美光', tech: 'ram_lpddr', year: 2023, gb: 16, price: 440, weight: 3, power: 0.26 },
  { id: 'r8', name: '16 GB LPDDR5X · 8533MT/s', vendor: '三星', tech: 'ram_lpddr', year: 2024, gb: 16, price: 430, weight: 3, power: 0.26 },
  { id: 'r8b', name: '24 GB LPDDR5T · 9600MT/s', vendor: 'SK 海力士', tech: 'ram_lpddr', year: 2025, gb: 24, price: 600, weight: 3, power: 0.27 },
  { id: 'r9', name: '24 GB LPDDR6 · 10666MT/s', vendor: '三星', tech: 'ram_lpddr', year: 2027, gb: 24, price: 620, weight: 3, power: 0.28 },
];

export const STORAGES = [
  { id: 's0', name: '无存储（仅固件）', vendor: '—', tech: 'cpu8', year: 1980, gb: 0, price: 0, weight: 0, power: 0 },
  { id: 's1', name: '8 MB NAND', vendor: '东芝', tech: 'storage_flash', year: 2005, gb: 0.008, price: 40, weight: 2, power: 0.03 },
  { id: 's2', name: '512 MB NAND', vendor: '三星', tech: 'storage_flash', year: 2008, gb: 0.5, price: 70, weight: 2, power: 0.04 },
  { id: 's3', name: '16 GB eMMC 4.5', vendor: '三星', tech: 'storage_flash', year: 2012, gb: 16, price: 110, weight: 2, power: 0.05 },
  { id: 's3b', name: '32 GB eMMC 5.1 · 250MB/s', vendor: '铠侠', tech: 'storage_flash', year: 2015, gb: 32, price: 130, weight: 2, power: 0.05 },
  { id: 's4', name: '64 GB UFS 2.1 · 750MB/s', vendor: 'SK 海力士', tech: 'storage_flash', year: 2016, gb: 64, price: 160, weight: 2, power: 0.06 },
  { id: 's4b', name: '128 GB UFS 2.2 · 900MB/s', vendor: '美光', tech: 'storage_flash', year: 2020, gb: 128, price: 195, weight: 2, power: 0.06 },
  { id: 's5', name: '256 GB UFS 3.1 · 2100MB/s', vendor: '三星', tech: 'storage_flash', year: 2019, gb: 256, price: 240, weight: 2, power: 0.07 },
  { id: 's5b', name: '512 GB UFS 3.1 · 2100MB/s', vendor: '铠侠', tech: 'storage_flash', year: 2021, gb: 512, price: 320, weight: 2, power: 0.07 },
  { id: 's6', name: '512 GB UFS 4.0 · 4200MB/s', vendor: '三星', tech: 'storage_flash', year: 2022, gb: 512, price: 380, weight: 2, power: 0.08 },
  { id: 's6b', name: '1 TB UFS 4.0 · 4200MB/s', vendor: 'SK 海力士', tech: 'storage_flash', year: 2023, gb: 1024, price: 560, weight: 2, power: 0.08 },
  { id: 's7', name: '1 TB UFS 4.1 · 4400MB/s', vendor: '美光', tech: 'storage_flash', year: 2024, gb: 1024, price: 620, weight: 2, power: 0.09 },
  { id: 's8', name: '2 TB UFS 5.0 · 5000MB/s', vendor: '三星', tech: 'storage_flash', year: 2027, gb: 2048, price: 980, weight: 2, power: 0.1 },
];

// 屏幕：面板技术 + 尺寸，价格随尺寸与技术水平上升
const SCREEN_TECHS = [
  { tech: 'mono_lcd', year: 1980, label: '单色 LCD', res: [96, 65], ppiBase: 60, price: 60, weight: 22, quality: 12 },
  { tech: 'color_lcd', year: 1998, label: '彩色 LCD', res: [176, 220], ppiBase: 110, price: 110, weight: 26, quality: 30 },
  { tech: 'tft', year: 2002, label: 'TFT', res: [240, 320], ppiBase: 140, price: 150, weight: 28, quality: 40 },
  { tech: 'ips', year: 2008, label: 'IPS', res: [480, 800], ppiBase: 200, price: 200, weight: 30, quality: 55 },
  { tech: 'oled', year: 2012, label: 'OLED', res: [720, 1280], ppiBase: 260, price: 300, weight: 28, quality: 68 },
  { tech: 'amoled', year: 2015, label: 'AMOLED', res: [1080, 2340], ppiBase: 320, price: 380, weight: 30, quality: 78 },
  { tech: 'high_refresh', year: 2019, label: '120Hz AMOLED', res: [1080, 2400], ppiBase: 340, price: 460, weight: 32, quality: 85 },
  { tech: 'ltpo', year: 2020, label: 'LTPO 自适应', res: [1440, 3200], ppiBase: 380, price: 560, weight: 32, quality: 92 },
  { tech: 'flexible', year: 2019, label: '柔性 OLED', res: [1080, 2400], ppiBase: 330, price: 620, weight: 26, quality: 88 },
  { tech: 'foldable', year: 2020, label: '折叠柔性屏', res: [1812, 2176], ppiBase: 300, price: 980, weight: 42, quality: 90 },
  { id: 'rollable_panel', tech: 'rollable', year: 2026, label: '卷轴柔性屏', res: [1440, 3200], ppiBase: 400, price: 1400, weight: 46, quality: 95 },
  { id: 'holo_panel', tech: 'hologram', year: 2040, label: '全息面板', res: [2160, 3840], ppiBase: 460, price: 2400, weight: 40, quality: 100 },
].map((s, i) => ({ id: 'scr_' + i, ...s }));

export const SCREENS = SCREEN_TECHS.map((s) => ({
  ...s,
  // 价格按面积缩放（基准 6.1 英寸）
  priceFor: (inch) => Math.round(s.price * Math.pow(inch / 6.1, 1.35)),
}));

// 摄像头模组：mp/score 决定成像档位；sensor/aperture/focal 是镜头规格（展示与微调评分）
export const CAMERAS = [
  { id: 'cam0', name: '无摄像头', tech: 'vga_cam', year: 1980, mp: 0, score: 0, thickness: 0, price: 0, weight: 0 },
  { id: 'cam1', name: 'VGA 摄像头', tech: 'vga_cam', year: 2000, mp: 0.1, score: 8, thickness: 4.5, price: 45, weight: 3, sensor: '1/4″', aperture: 'ƒ/2.8', focal: '35mm', ois: false },
  { id: 'cam2', name: '130 万像素', tech: 'cmos', year: 2003, mp: 1.3, score: 18, thickness: 5, price: 90, weight: 4, sensor: '1/3″', aperture: 'ƒ/2.8', focal: '34mm', ois: false },
  { id: 'cam3', name: '500 万像素', tech: 'mp_cam', year: 2008, mp: 5, score: 34, thickness: 5.5, price: 150, weight: 5, sensor: '1/3.2″', aperture: 'ƒ/2.6', focal: '32mm', ois: false },
  { id: 'cam4', name: '1300 万像素', tech: 'mp_cam', year: 2013, mp: 13, score: 52, thickness: 6, price: 220, weight: 6, sensor: '1/3″', aperture: 'ƒ/2.2', focal: '28mm', ois: false },
  { id: 'cam5', name: '双摄 1200 万', tech: 'dual_cam', year: 2016, mp: 12, score: 66, thickness: 7.5, price: 320, weight: 9, sensor: '1/2.6″', aperture: 'ƒ/1.8', focal: '27mm', ois: false },
  { id: 'cam6', name: 'OIS 三摄', tech: 'ois', year: 2017, mp: 16, score: 74, thickness: 8.5, price: 420, weight: 12, sensor: '1/2.55″', aperture: 'ƒ/1.7', focal: '26mm', ois: true },
  { id: 'cam7', name: '潜望四摄', tech: 'periscope', year: 2019, mp: 48, score: 84, thickness: 11, price: 620, weight: 16, sensor: '1/2″', aperture: 'ƒ/1.6', focal: '24mm', ois: true },
  { id: 'cam8', name: '计算摄影多摄', tech: 'comp_photo', year: 2021, mp: 50, score: 90, thickness: 11.5, price: 720, weight: 17, sensor: '1/1.56″', aperture: 'ƒ/1.5', focal: '23mm', ois: true },
  { id: 'cam9', name: 'AI 一英寸主摄', tech: 'ai_imaging', year: 2024, mp: 100, score: 96, thickness: 13, price: 900, weight: 20, sensor: '1″', aperture: 'ƒ/1.4', focal: '23mm', ois: true },
  { id: 'cam10', name: '光场相机模组', tech: 'lightfield', year: 2035, mp: 200, score: 100, thickness: 9, price: 1400, weight: 18, sensor: '1″', aperture: 'ƒ/1.2', focal: '22mm', ois: true },
  // 自研影像模组（需成立光学影像部，评分由部门等级动态写入）
  { id: 'cam_own', name: '自研影像模组', tech: 'cmos', year: 2003, mp: 12, score: 30, thickness: 6, price: 180, weight: 6, own: true, sensor: '—', aperture: '—', focal: '—', ois: false },
];

export const BATTERIES = [
  { id: 'b0', name: '镍镉 800mAh', vendor: '比亚迪', tech: 'nicd', year: 1980, mah: 800, price: 70, weight: 95, density: 90 },
  { id: 'b1', name: '镍氢 1200mAh', vendor: '三洋', tech: 'nimh', year: 1992, mah: 1200, price: 90, weight: 80, density: 130 },
  { id: 'b2', name: '锂电 1100mAh', vendor: 'ATL 新能源', tech: 'liion', year: 1998, mah: 1100, price: 80, weight: 40, density: 230 },
  { id: 'b3', name: '锂电 2000mAh', vendor: 'ATL 新能源', tech: 'liion', year: 2008, mah: 2000, price: 90, weight: 45, density: 260 },
  { id: 'b3b', name: '锂电 2500mAh', vendor: 'LG 新能源', tech: 'liion', year: 2011, mah: 2500, price: 95, weight: 46, density: 285 },
  { id: 'b4', name: '锂电 3000mAh', vendor: 'LG 新能源', tech: 'liion', year: 2014, mah: 3000, price: 100, weight: 48, density: 320 },
  { id: 'b4b', name: '锂电 3500mAh', vendor: '欣旺达', tech: 'liion', year: 2015, mah: 3500, price: 105, weight: 49, density: 350 },
  { id: 'b5', name: '高密度 4000mAh', vendor: '珠海冠宇', tech: 'highdensity', year: 2016, mah: 4000, price: 110, weight: 50, density: 400 },
  { id: 'b5b', name: '高密度 4500mAh', vendor: 'ATL 新能源', tech: 'highdensity', year: 2018, mah: 4500, price: 115, weight: 52, density: 430 },
  { id: 'b6', name: '高密度 5000mAh', vendor: '欣旺达', tech: 'highdensity', year: 2019, mah: 5000, price: 120, weight: 55, density: 460 },
  { id: 'b6b', name: '双电芯 5000mAh', vendor: '珠海冠宇', tech: 'fastcharge2', year: 2021, mah: 5000, price: 135, weight: 55, density: 480, note: '双电芯串联，快充友好' },
  { id: 'b7', name: '高密度 6000mAh', vendor: '三星 SDI', tech: 'highdensity', year: 2022, mah: 6000, price: 140, weight: 62, density: 520 },
  { id: 'b7b', name: '硅碳负极 6100mAh', vendor: '欣旺达', tech: 'highdensity2', year: 2023, mah: 6100, price: 170, weight: 60, density: 560, note: '硅碳负极 · 能量密度 720Wh/L 级' },
  { id: 'b7c', name: '硅碳负极 6500mAh', vendor: '珠海冠宇', tech: 'highdensity2', year: 2024, mah: 6500, price: 185, weight: 62, density: 590 },
  { id: 'b8', name: '固态 7000mAh', vendor: '三星 SDI', tech: 'solidstate', year: 2027, mah: 7000, price: 260, weight: 58, density: 620 },
  { id: 'b9', name: '固态 9000mAh', vendor: 'QuantumScape', tech: 'solidstate', year: 2031, mah: 9000, price: 340, weight: 62, density: 720 },
  { id: 'b10', name: '新型能源 12000mAh', vendor: '公版', tech: 'future_energy', year: 2042, mah: 12000, price: 520, weight: 60, density: 900 },
];

// 系统：kind 决定获取方式 — third 三方授权（付费）/ open 开源（低成本）/ own 自研（需系统开发部等级）
export const SYSTEMS = [
  { id: 'os0', name: '嵌入式固件', kind: 'basic', tech: 'os_basic', year: 1980, fee: 8, score: 5, apps: 0 },
  { id: 'os1', name: '自有功能机系统', kind: 'basic', tech: 'os_basic', year: 1995, fee: 20, score: 14, apps: 10 },
  { id: 'os2', name: '三方授权系统', kind: 'third', tech: 'os_smart', year: 2007, fee: 60, score: 46, apps: 70 },
  { id: 'os_open', name: '开源系统（AOSP 类）', kind: 'open', tech: 'os_smart', year: 2008, fee: 10, score: 40, apps: 60 },
  { id: 'os3', name: '自研智能手机系统', kind: 'own', ownLv: 1, tech: 'os_smart', year: 2010, fee: 25, score: 56, apps: 65 },
  { id: 'os4', name: '全场景自研 OS', kind: 'own', ownLv: 3, tech: 'os_smart', year: 2016, fee: 30, score: 74, apps: 85 },
  { id: 'os5', name: '端侧 AI 系统', kind: 'own', ownLv: 5, tech: 'ai_assistant', year: 2023, fee: 40, score: 92, apps: 95 },
];

export const EXTRAS = [
  { id: 'x_fp', name: '指纹识别', tech: 'fingerprint', price: 45, weight: 2, thick: 0.2 },
  { id: 'x_face', name: '3D 人脸识别', tech: 'faceid', price: 110, weight: 4, thick: 0.6 },
  { id: 'x_wp', name: '防水防尘', tech: 'waterproof', price: 60, weight: 3, thick: 0.3 },
  { id: 'x_wl', name: '无线充电', tech: 'wireless_charge', price: 55, weight: 6, thick: 0.8 },
  { id: 'x_fc', name: '快充模块', tech: 'fastcharge', price: 40, weight: 4, thick: 0.3 },
  { id: 'x_udc', name: '屏下摄像头', tech: 'udc', year: 2021, price: 90, weight: 1, thick: 0.2 },
  { id: 'x_vc', name: '均热板散热', tech: 'cooling_vc', price: 50, weight: 8, thick: 0.5 },
  { id: 'x_sat', name: '卫星通信', tech: 'satellite', price: 130, weight: 5, thick: 0.4 },
  { id: 'x_sec', name: '安全芯片', tech: 'security_chip', price: 35, weight: 1, thick: 0.1 },
];

// 充电：有线功率档 / 无线功率档 / 协议
export const CHARGERS = {
  wired: [
    { id: 'w5', name: '5W 标准充电', tech: 'liion', year: 1980, watt: 5, price: 5 },
    { id: 'w18', name: '18W 快充', tech: 'fastcharge', year: 2016, watt: 18, price: 18 },
    { id: 'w33', name: '33W 快充', tech: 'fastcharge', year: 2018, watt: 33, price: 28 },
    { id: 'w66', name: '66W 超级快充', tech: 'fastcharge2', year: 2020, watt: 66, price: 42 },
    { id: 'w120', name: '120W 超级快充', tech: 'fastcharge2', year: 2021, watt: 120, price: 65 },
    { id: 'w240', name: '240W 满级秒充', tech: 'fastcharge3', year: 2023, watt: 240, price: 98 },
  ],
  wireless: [
    { id: 'wl0', name: '不支持无线充电', tech: 'liion', year: 1980, watt: 0, price: 0 },
    { id: 'wl15', name: '15W 无线充电', tech: 'wireless_charge', year: 2015, watt: 15, price: 40 },
    { id: 'wl50', name: '50W 无线快充', tech: 'wireless_charge', year: 2020, watt: 50, price: 72 },
    { id: 'wl80', name: '80W 无线快充', tech: 'wireless_charge2', year: 2023, watt: 80, price: 112 },
  ],
  proto: [
    { id: 'p_std', name: '标准协议', tech: 'liion', year: 1980, bonus: 0 },
    { id: 'p_pd', name: 'USB-PD 通用协议', tech: 'fastcharge', year: 2016, bonus: 2 },
    { id: 'p_qc', name: 'QC 私有快充协议', tech: 'fastcharge', year: 2016, bonus: 3 },
    { id: 'p_ufcs', name: 'UFCS 融合快充', tech: 'fastcharge2', year: 2022, bonus: 4 },
    { id: 'p_super', name: '自研超级快充协议', tech: 'fastcharge2', year: 2019, bonus: 6 },
  ],
};

// 机身预设配色
export const BODY_COLORS = [
  { id: 'space', name: '深空灰', hex: '#2b3440' },
  { id: 'midnight', name: '午夜蓝', hex: '#1c2f52' },
  { id: 'silver', name: '星银', hex: '#c9ced6' },
  { id: 'graphite', name: '石墨黑', hex: '#17191d' },
  { id: 'snow', name: '皓月白', hex: '#e8eae6' },
  { id: 'gold', name: '金色', hex: '#d4b47e' },
  { id: 'jade', name: '青玉绿', hex: '#3f8f7a' },
  { id: 'ocean', name: '远峰蓝', hex: '#3a6ea8' },
  { id: 'sunset', name: '落霞橙', hex: '#d96a3b' },
  { id: 'rose', name: '蔷薇粉', hex: '#d98a9c' },
  { id: 'violet', name: '星紫', hex: '#7a5fd0' },
  { id: 'carbon', name: '碳纤维纹', hex: '#2e3238' },
];

export const MATERIALS = [
  { id: 'plastic', name: '聚碳酸酯', price: 18, weight: 0.9, quality: 40 },
  { id: 'alu', name: '铝合金', price: 55, weight: 1.8, quality: 68 },
  { id: 'steel', name: '不锈钢', price: 75, weight: 3.2, quality: 72 },
  { id: 'glass', name: '玻璃', price: 62, weight: 2.1, quality: 78 },
  { id: 'ceramic', name: '陶瓷', price: 120, weight: 2.6, quality: 90 },
  { id: 'titanium', name: '钛合金', price: 180, weight: 2.4, quality: 94 },
  { id: 'leather', name: '素皮', price: 45, weight: 1.1, quality: 70 },
];

export const FINISHES = [
  { id: 'matte', name: '磨砂', quality: 4 },
  { id: 'gloss', name: '亮面', quality: 3 },
  { id: 'satin', name: '缎面', quality: 5 },
];

export function unlockedParts(list, unlocked, year) {
  return list.filter((p) => unlocked.includes(p.tech) && year >= p.year);
}

export function partById(list, id) {
  return list.find((p) => p.id === id) || list[0];
}
