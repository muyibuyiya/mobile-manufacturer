// 真实规格硬件数据库：CMOS 传感器（索尼/三星/豪威命名）、镜头类型、
// CPU 核心架构、GPU 架构、面板供应商、分辨率档位、OS 底层架构。
// 数据来源：2024-2026 公开资料整理，规格以官方公布为准。
// 摄像头传感器：roles 决定可用于哪类镜头；format 决定镜头物理尺寸与厚度；
// score 为 0-100 成像基准分；tech 用于解锁门槛（复用 parts 摄像头科技线）。
export const IMAGE_SENSORS = [
  { id: 'sn_vga', name: 'VGA CIS', vendor: '公版', year: 2000, mp: 0.1, format: '1/4″', pixel: 1.75, roles: ['主摄', '前置', '景深'], tech: 'vga_cam', score: 10, price: 30 },
  { id: 'sn_1p3', name: '130万 CIS', vendor: '公版', year: 2003, mp: 1.3, format: '1/3″', pixel: 1.6, roles: ['主摄', '前置'], tech: 'cmos', score: 24, price: 60 },
  { id: 'sn_5mp', name: '5MP CIS', vendor: '公版', year: 2008, mp: 5, format: '1/3.2″', pixel: 1.4, roles: ['主摄', '前置'], tech: 'mp_cam', score: 38, price: 90 },
  { id: 'sn_13mp', name: '13MP CIS', vendor: '公版', year: 2013, mp: 13, format: '1/3″', pixel: 1.12, roles: ['主摄', '超广角', '微距', '景深'], tech: 'mp_cam', score: 48, price: 130 },
  // 索尼 IMX 系列
  { id: 'sn_imx586', name: 'IMX586', vendor: '索尼', year: 2018, mp: 48, format: '1/2″', pixel: 0.8, roles: ['主摄', '长焦'], tech: 'dual_cam', score: 63, price: 200, ois: true },
  { id: 'sn_imx582', name: 'IMX582', vendor: '索尼', year: 2019, mp: 48, format: '1/2″', pixel: 0.8, roles: ['主摄'], tech: 'dual_cam', score: 60, price: 170 },
  { id: 'sn_imx686', name: 'IMX686', vendor: '索尼', year: 2019, mp: 64, format: '1/1.7″', pixel: 0.8, roles: ['主摄'], tech: 'dual_cam', score: 70, price: 230 },
  { id: 'sn_imx581', name: 'IMX581', vendor: '索尼', year: 2019, mp: 48, format: '1/2″', pixel: 0.8, roles: ['超广角'], tech: 'dual_cam', score: 62, price: 170 },
  { id: 'sn_imx766', name: 'IMX766', vendor: '索尼', year: 2020, mp: 50, format: '1/1.56″', pixel: 1.0, roles: ['主摄', '超广角'], tech: 'ois', score: 76, price: 300, ois: true },
  { id: 'sn_imx707', name: 'IMX707', vendor: '索尼', year: 2022, mp: 50, format: '1/1.28″', pixel: 1.22, roles: ['主摄'], tech: 'comp_photo', score: 84, price: 430, ois: true },
  { id: 'sn_imx890', name: 'IMX890', vendor: '索尼', year: 2022, mp: 50, format: '1/1.56″', pixel: 1.0, roles: ['主摄', '潜望'], tech: 'comp_photo', score: 78, price: 330, ois: true },
  { id: 'sn_imx858', name: 'IMX858', vendor: '索尼', year: 2023, mp: 50, format: '1/2.51″', pixel: 0.7, roles: ['超广角', '长焦', '潜望'], tech: 'comp_photo', score: 72, price: 260, ois: true },
  { id: 'sn_imx989', name: 'IMX989', vendor: '索尼', year: 2022, mp: 50, format: '1″', pixel: 1.6, roles: ['主摄'], tech: 'comp_photo', score: 94, price: 820, ois: true },
  { id: 'sn_lyt900', name: 'LYT-900', vendor: '索尼', year: 2024, mp: 50, format: '1″', pixel: 1.61, roles: ['主摄'], tech: 'ai_imaging', score: 96, price: 880, ois: true },
  // 三星 ISOCELL 系列
  { id: 'sn_hmx', name: 'ISOCELL HMX', vendor: '三星', year: 2019, mp: 108, format: '1/1.33″', pixel: 0.8, roles: ['主摄'], tech: 'dual_cam', score: 74, price: 340 },
  { id: 'sn_gm2', name: 'ISOCELL GM2', vendor: '三星', year: 2020, mp: 64, format: '1/2″', pixel: 0.8, roles: ['主摄'], tech: 'dual_cam', score: 66, price: 190 },
  { id: 'sn_gn1', name: 'ISOCELL GN1', vendor: '三星', year: 2020, mp: 50, format: '1/1.31″', pixel: 1.2, roles: ['主摄'], tech: 'ois', score: 77, price: 320 },
  { id: 'sn_gn2', name: 'ISOCELL GN2', vendor: '三星', year: 2021, mp: 50, format: '1/1.12″', pixel: 1.4, roles: ['主摄'], tech: 'comp_photo', score: 85, price: 480, ois: true },
  { id: 'sn_gn5', name: 'ISOCELL GN5', vendor: '三星', year: 2022, mp: 50, format: '1/1.57″', pixel: 1.0, roles: ['主摄'], tech: 'comp_photo', score: 74, price: 280 },
  { id: 'sn_hm2', name: 'ISOCELL HM2', vendor: '三星', year: 2021, mp: 108, format: '1/1.52″', pixel: 0.7, roles: ['主摄'], tech: 'dual_cam', score: 70, price: 210 },
  { id: 'sn_hp1', name: 'ISOCELL HP1', vendor: '三星', year: 2021, mp: 200, format: '1/1.22″', pixel: 0.64, roles: ['主摄'], tech: 'comp_photo', score: 88, price: 520, ois: true },
  { id: 'sn_hp3', name: 'ISOCELL HP3', vendor: '三星', year: 2022, mp: 200, format: '1/1.4″', pixel: 0.56, roles: ['主摄'], tech: 'comp_photo', score: 82, price: 420 },
  { id: 'sn_hp2', name: 'ISOCELL HP2', vendor: '三星', year: 2023, mp: 200, format: '1/1.3″', pixel: 0.6, roles: ['主摄'], tech: 'comp_photo', score: 90, price: 560, ois: true },
  { id: 'sn_jn1', name: 'ISOCELL JN1', vendor: '三星', year: 2021, mp: 50, format: '1/2.76″', pixel: 0.64, roles: ['超广角', '长焦', '前置', '景深'], tech: 'dual_cam', score: 55, price: 110 },
  { id: 'sn_hp9', name: 'ISOCELL HP9', vendor: '三星', year: 2024, mp: 200, format: '1/1.4″', pixel: 0.56, roles: ['潜望'], tech: 'ai_imaging', score: 93, price: 700, ois: true },
  // 豪威 OV 系列
  { id: 'sn_ov13b', name: 'OV13B', vendor: '豪威', year: 2020, mp: 13, format: '1/3.06″', pixel: 1.12, roles: ['超广角', '前置', '微距'], tech: 'mp_cam', score: 46, price: 90 },
  { id: 'sn_ov08d', name: 'OV08D10', vendor: '豪威', year: 2019, mp: 8, format: '1/4″', pixel: 1.4, roles: ['超广角', '前置', '景深', '微距'], tech: 'mp_cam', score: 26, price: 45 },
  { id: 'sn_ov64b', name: 'OV64B', vendor: '豪威', year: 2020, mp: 64, format: '1/2″', pixel: 0.702, roles: ['长焦', '潜望', '主摄'], tech: 'dual_cam', score: 68, price: 180, ois: true },
  { id: 'sn_ov48c', name: 'OV48C', vendor: '豪威', year: 2020, mp: 48, format: '1/1.32″', pixel: 1.2, roles: ['主摄'], tech: 'ois', score: 80, price: 360, ois: true },
  { id: 'sn_ov50a', name: 'OV50A', vendor: '豪威', year: 2021, mp: 50, format: '1/1.5″', pixel: 1.0, roles: ['主摄'], tech: 'ois', score: 75, price: 290 },
  { id: 'sn_ov50h', name: 'OV50H', vendor: '豪威', year: 2023, mp: 50, format: '1/1.3″', pixel: 1.2, roles: ['主摄'], tech: 'comp_photo', score: 89, price: 520, ois: true },
  { id: 'sn_ov08a10', name: 'OV08A10', vendor: '豪威', year: 2020, mp: 8, format: '1/4.4″', pixel: 1.25, roles: ['潜望'], tech: 'periscope', score: 45, price: 120, ois: true },
  // 2024-2026：索尼 LYTIA 新一代（光喻旗舰/中端）
  { id: 'sn_lyt808', name: 'LYT-808', vendor: '索尼', year: 2023, mp: 50, format: '1/1.4″', pixel: 1.12, roles: ['主摄'], tech: 'comp_photo', score: 80, price: 380, ois: true },
  { id: 'sn_lyt600', name: 'LYT-600', vendor: '索尼', year: 2023, mp: 50, format: '1/1.95″', pixel: 0.8, roles: ['主摄', '超广角'], tech: 'ois', score: 62, price: 150 },
  { id: 'sn_lyt500', name: 'LYT-500', vendor: '索尼', year: 2022, mp: 50, format: '1/2.93″', pixel: 0.6, roles: ['前置', '超广角'], tech: 'dual_cam', score: 50, price: 90 },
  { id: 'sn_lyt818', name: 'LYT-818', vendor: '索尼', year: 2024, mp: 50, format: '1/1.28″', pixel: 1.22, roles: ['主摄', '潜望'], tech: 'ai_imaging', score: 88, price: 560, ois: true },
  { id: 'sn_lyt828', name: 'LYT-828', vendor: '索尼', year: 2025, mp: 50, format: '1/1.28″', pixel: 1.22, roles: ['主摄', '超广角'], tech: 'ai_imaging', score: 95, price: 850, ois: true },
  { id: 'sn_lyt901', name: 'LYT-901', vendor: '索尼', year: 2025, mp: 200, format: '1/1.12″', pixel: 0.7, roles: ['主摄'], tech: 'ai_imaging', score: 98, price: 1000, ois: true },
  // 2024-2026：三星 ISOCELL
  { id: 'sn_jn5', name: 'ISOCELL JN5', vendor: '三星', year: 2024, mp: 50, format: '1/2.76″', pixel: 0.64, roles: ['超广角', '长焦', '前置'], tech: 'comp_photo', score: 58, price: 110 },
  { id: 'sn_hp5', name: 'ISOCELL HP5', vendor: '三星', year: 2025, mp: 200, format: '1/1.56″', pixel: 0.5, roles: ['主摄', '潜望', '长焦'], tech: 'ai_imaging', score: 87, price: 480, ois: true },
  // 2024-2026：豪威（国产 1 英寸 LOFIC 旗舰）
  { id: 'sn_ov50x', name: 'OV50X', vendor: '豪威', year: 2025, mp: 50, format: '1″', pixel: 1.6, roles: ['主摄'], tech: 'ai_imaging', score: 97, price: 900, ois: true },
  { id: 'sn_ov50n', name: 'OV50N', vendor: '豪威', year: 2024, mp: 50, format: '1/1.56″', pixel: 1.0, roles: ['主摄', '超广角'], tech: 'comp_photo', score: 76, price: 300, ois: true },
  // 未来
  { id: 'sn_lightfield', name: '光场传感阵列', vendor: '公版', year: 2035, mp: 400, format: '1″', pixel: 0.5, roles: ['主摄', '潜望'], tech: 'lightfield', score: 100, price: 1200, ois: true },
];

// 镜头类型：focal 典型区间（mm 等效焦距）、defFocal/defAp 默认值、weight 在评分中的权重、
// thickBoost 附加厚度（mm，潜望光路横向折叠——厚度只比普通镜头略厚，焦距藏在平面尺寸里）、priceMul 成本系数
export const LENS_TYPES = [
  { id: 'main', name: '主摄', focal: [20, 35], defFocal: 23, defAp: 1.7, weight: 1.0, thickBoost: 0, priceMul: 1.0 },
  { id: 'ultrawide', name: '超广角', focal: [10, 18], defFocal: 13, defAp: 2.2, weight: 0.55, thickBoost: 0, priceMul: 0.8 },
  { id: 'tele', name: '长焦', focal: [45, 79], defFocal: 66, defAp: 2.4, weight: 0.6, thickBoost: 0.3, priceMul: 1.1 },
  { id: 'periscope', name: '潜望长焦', focal: [80, 135], defFocal: 90, defAp: 3.0, weight: 0.65, thickBoost: 0.5, priceMul: 1.4 },
  { id: 'depth', name: '景深', focal: [20, 30], defFocal: 24, defAp: 2.8, weight: 0.12, thickBoost: 0, priceMul: 0.4 },
  { id: 'macro', name: '微距', focal: [20, 40], defFocal: 26, defAp: 2.6, weight: 0.18, thickBoost: 0, priceMul: 0.45 },
];

// deco 形状预设（尺寸与圆角均可再自定义）
export const DECO_SHAPES = [
  { id: 'circle', name: '圆形', fixed: 'circle' },      // w=h，radius=w/2
  { id: 'square', name: '正方形', fixed: null },
  { id: 'rounded', name: '圆角矩形', fixed: null },      // w≠h 皆可，圆角可调
  { id: 'pill', name: '胶囊形', fixed: 'pill' },         // radius=h/2
];

// ---------- 自研 SoC 设计数据（现实参照） ----------
// CPU 核心架构：kind 决定定位（prime 超大核/big 大核/little 小核），year 门槛，ipc 相对性能系数
export const CPU_CORES = [
  { id: 'a55', name: 'Cortex-A55', kind: 'little', year: 2017, ipc: 1.0, ghz: [1.6, 2.2] },
  { id: 'a77', name: 'Cortex-A77', kind: 'big', year: 2019, ipc: 1.7, ghz: [2.2, 2.9] },
  { id: 'a78', name: 'Cortex-A78', kind: 'big', year: 2020, ipc: 1.8, ghz: [2.0, 3.0] },
  { id: 'x1', name: 'Cortex-X1', kind: 'prime', year: 2020, ipc: 2.1, ghz: [2.8, 3.0] },
  { id: 'x2', name: 'Cortex-X2', kind: 'prime', year: 2021, ipc: 2.25, ghz: [3.0, 3.2] },
  { id: 'a710', name: 'Cortex-A710', kind: 'big', year: 2021, ipc: 1.85, ghz: [1.8, 2.5] },
  { id: 'x3', name: 'Cortex-X3', kind: 'prime', year: 2022, ipc: 2.4, ghz: [3.0, 3.36] },
  { id: 'a715', name: 'Cortex-A715', kind: 'big', year: 2022, ipc: 1.9, ghz: [2.0, 3.0] },
  { id: 'a510', name: 'Cortex-A510', kind: 'little', year: 2021, ipc: 1.15, ghz: [1.5, 2.0] },
  { id: 'x4', name: 'Cortex-X4', kind: 'prime', year: 2023, ipc: 2.6, ghz: [3.0, 3.4] },
  { id: 'a720', name: 'Cortex-A720', kind: 'big', year: 2023, ipc: 1.95, ghz: [2.0, 3.2] },
  { id: 'a520', name: 'Cortex-A520', kind: 'little', year: 2023, ipc: 1.2, ghz: [1.5, 2.3] },
  { id: 'x925', name: 'Cortex-X925', kind: 'prime', year: 2024, ipc: 2.9, ghz: [3.4, 3.7] },
  { id: 'a725', name: 'Cortex-A725', kind: 'big', year: 2024, ipc: 2.0, ghz: [2.4, 3.0] },
  { id: 'oryon', name: '自研 Oryon 类', kind: 'prime', year: 2024, ipc: 3.0, ghz: [3.5, 4.3] },
  { id: 'taishan', name: '自研泰山类', kind: 'big', year: 2023, ipc: 1.9, ghz: [2.0, 2.7] },
  // 2025-2026：ARM Lumex C1 集群（天玑9500 首发全系）+ 第三代自研大核
  { id: 'c1_ultra', name: 'Lumex C1-Ultra', kind: 'prime', year: 2025, ipc: 3.4, ghz: [3.8, 4.3] },
  { id: 'c1_prem', name: 'Lumex C1-Premium', kind: 'big', year: 2025, ipc: 2.05, ghz: [2.8, 3.5] },
  { id: 'c1_pro', name: 'Lumex C1-Pro', kind: 'big', year: 2025, ipc: 2.15, ghz: [2.5, 3.0] },
  { id: 'c1_nano', name: 'Lumex C1-Nano', kind: 'little', year: 2025, ipc: 1.3, ghz: [1.6, 2.2] },
  { id: 'oryon3', name: '自研 Oryon 三代', kind: 'prime', year: 2025, ipc: 3.3, ghz: [3.8, 4.6] },
];

// GPU 架构：perf 单核性能系数，slices 建议核数
export const GPU_ARCHS = [
  { id: 'mali_g78', name: 'Mali-G78', vendor: 'ARM 公版', year: 2020, perf: 1.6, maxCore: 24 },
  { id: 'mali_g610', name: 'Mali-G610', vendor: 'ARM 公版', year: 2022, perf: 1.8, maxCore: 10 },
  { id: 'mali_g715', name: 'Mali-G715', vendor: 'ARM 公版', year: 2022, perf: 2.0, maxCore: 16 },
  { id: 'mali_g720', name: 'Mali-G720', vendor: 'ARM 公版', year: 2023, perf: 2.3, maxCore: 20 },
  { id: 'imm_g720', name: 'Immortalis-G720（光追）', vendor: 'ARM 公版', year: 2023, perf: 2.45, maxCore: 16 },
  { id: 'imm_g925', name: 'Immortalis-G925（光追）', vendor: 'ARM 公版', year: 2024, perf: 2.9, maxCore: 16 },
  { id: 'xclipse', name: 'Xclipse 类（RDNA 授权）', vendor: 'AMD 授权', year: 2022, perf: 2.1, maxCore: 12 },
  { id: 'adreno_like', name: '自研 Adreno 类', vendor: '自研', year: 2021, perf: 2.2, maxCore: 12 },
  { id: 'maleoon', name: '自研马良类', vendor: '自研', year: 2023, perf: 1.9, maxCore: 10 },
  { id: 'apple_like', name: '自研整合 GPU（苹果类）', vendor: '自研', year: 2022, perf: 2.6, maxCore: 8 },
  { id: 'mali_g1u', name: 'Mali-G1 Ultra（光追）', vendor: 'ARM 公版', year: 2025, perf: 3.2, maxCore: 12 },
  { id: 'adreno8', name: '自研 Adreno 8 系列', vendor: '自研', year: 2025, perf: 3.3, maxCore: 12 },
  { id: 'xclipse950', name: 'Xclipse 950 类（RDNA 授权）', vendor: 'AMD 授权', year: 2025, perf: 2.6, maxCore: 8 },
];

// ---------- 自研 OS 底层架构 ----------
export const OS_BASES = [
  { id: 'osp_aosp', name: 'AOSP 深度定制', base: 'Linux 宏内核 + AOSP 框架', year: 2008, scoreMul: 1.0, appsMul: 1.0, costMul: 1.0, desc: 'APK 直接兼容，生态零成本，深度自研空间小' },
  { id: 'osp_dual', name: '自研底座 + 兼容层', base: '自研调度 + AOSP 兼容运行时', year: 2016, scoreMul: 1.12, appsMul: 0.92, costMul: 1.5, desc: '自研跨端底座，兼容 APK，成本与周期居中' },
  { id: 'osp_micro', name: '自研微内核（纯血）', base: '微内核 + 自研运行时', year: 2024, scoreMul: 1.3, appsMul: 0.55, costMul: 2.2, desc: '完全脱钩 AOSP，性能上限最高，需重建生态' },
  { id: 'osp_linux', name: 'Linux 基座自研 UI', base: 'Linux 内核 + 自研 UI 框架', year: 2010, scoreMul: 0.9, appsMul: 0.3, costMul: 0.9, desc: '生态极小，适合极客或专用设备' },
];

// ---------- 屏幕面板供应商 ----------
// gens：发光材料世代（真机命名，如三星 M12/M13/M14/E7、京东方 Q9/Q10、华星 C8/C9），
// q = 品质乘数，c = 成本乘数（越新越贵）
export const PANEL_VENDORS = [
  { id: 'pv_sdc', name: '三星显示 SDC', tech: 'oled', year: 2012, quality: 1.06, cost: 1.18, desc: '钻石排列 · 发光材料领先（E 系）',
    gens: [
      { id: 'M11', name: 'M11 发光材料', year: 2021, q: 1.01, c: 1.02 },
      { id: 'M12', name: 'M12 发光材料', year: 2022, q: 1.02, c: 1.03 },
      { id: 'M13', name: 'M13 发光材料', year: 2023, q: 1.04, c: 1.05 },
      { id: 'E7', name: 'E7 发光材料', year: 2024, q: 1.05, c: 1.06 },
      { id: 'M14', name: 'M14 发光材料', year: 2024, q: 1.07, c: 1.09 },
    ] },
  { id: 'pv_lgd', name: 'LG Display', tech: 'oled', year: 2013, quality: 1.03, cost: 1.10, desc: 'LTPO 强项 · 护眼向' },
  { id: 'pv_boe', name: '京东方 BOE', tech: 'oled', year: 2017, quality: 1.0, cost: 0.92, desc: '国产 OLED 第一梯队 · Q 系发光材料',
    gens: [
      { id: 'Q9', name: 'Q9 发光材料', year: 2022, q: 1.01, c: 1.02 },
      { id: 'Q9p', name: 'Q9+ 发光材料', year: 2023, q: 1.03, c: 1.04 },
      { id: 'Q10', name: 'Q10 发光材料', year: 2024, q: 1.05, c: 1.06 },
    ] },
  { id: 'pv_csot', name: '华星光电 CSOT', tech: 'oled', year: 2018, quality: 0.99, cost: 0.88, desc: '小米深度绑定 · C 系发光体系',
    gens: [
      { id: 'C8', name: 'C8 发光材料', year: 2023, q: 1.02, c: 1.03 },
      { id: 'C9', name: 'C9 发光材料', year: 2024, q: 1.04, c: 1.05 },
    ] },
  { id: 'pv_tianma', name: '天马', tech: 'oled', year: 2019, quality: 0.96, cost: 0.85, desc: '高频 PWM 护眼 · LTPS 老牌' },
  { id: 'pv_visionox', name: '维信诺', tech: 'oled', year: 2018, quality: 0.95, cost: 0.86, desc: '华为系二供 · ViP 微透镜' },
  { id: 'pv_jdi', name: 'JDI', tech: 'tft', year: 2002, quality: 1.0, cost: 1.0, desc: 'LTPS LCD 发明者' },
  { id: 'pv_sharp', name: '夏普 Sharp', tech: 'tft', year: 2002, quality: 0.97, cost: 0.9, desc: 'IGZO Oxide LCD' },
];

// 分辨率档位：level 决定相对清晰分，costMul 成本系数
export const RES_TIERS = [
  { id: 'res720', name: 'HD+ 720p', w: 1560, h: 720, year: 2012, level: 0.72, costMul: 0.72 },
  { id: 'res1080', name: 'FHD+ 1080p', w: 2400, h: 1080, year: 2013, level: 0.92, costMul: 0.9 },
  { id: 'res15k', name: '1.5K', w: 2712, h: 1220, year: 2022, level: 0.97, costMul: 1.0 },
  { id: 'res2k', name: '2K QHD+', w: 3200, h: 1440, year: 2016, level: 1.0, costMul: 1.15 },
  { id: 'res4k', name: '4K', w: 3840, h: 1644, year: 2019, level: 1.05, costMul: 1.45 },
];

// 光学格式字符串 → 面积因子（用于镜头物理尺寸/厚度/评分）
export function formatFactor(format) {
  const s = String(format || '1/2.4″');
  if (s.includes('1″') || s === '1英寸') return 1.0;
  const m = s.match(/1\/([\d.]+)/);
  if (m) return clampNum(1 / parseFloat(m[1]), 0.15, 1);
  return 0.42;
}
function clampNum(v, a, b) { return Math.max(a, Math.min(b, v)); }

// 镜头物理半径（mm）与模组厚度（mm）由传感器格式决定
export function lensRadiusMm(format) {
  return Math.max(2.6, Math.min(8.2, 2.4 + formatFactor(format) * 5.6));
}
export function lensThicknessMm(format, type) {
  const lt = LENS_TYPES.find((t) => t.id === type);
  return 4.2 + formatFactor(format) * 6.2 + (lt ? lt.thickBoost : 0);
}

export function sensorById(id) {
  if (id === 'sn_own') return null; // 自研传感器由快照提供
  return IMAGE_SENSORS.find((s) => s.id === id) || null;
}
export function lensTypeById(id) {
  return LENS_TYPES.find((t) => t.id === id) || LENS_TYPES[0];
}
