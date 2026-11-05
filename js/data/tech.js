// 科技树：每个节点都带历史年份门槛、研发成本与前置依赖
export const TECH_CATS = [
  { id: 'comm', name: '通信技术', color: '#4aa3ff' },
  { id: 'cpu', name: '处理器', color: '#ff8f4a' },
  { id: 'screen', name: '屏幕技术', color: '#7c6cff' },
  { id: 'camera', name: '影像技术', color: '#37c9a5' },
  { id: 'battery', name: '电池能源', color: '#f5c542' },
  { id: 'other', name: '系统与其他', color: '#c47cf0' },
];

export const TECHS = [
  // 通信
  { id: '1g', name: '1G 模拟通信', cat: 'comm', year: 1980, cost: 12000, prereq: [], desc: '模拟蜂窝网络，只能通话，体积巨大。' },
  { id: '2g', name: '2G 数字通信', cat: 'comm', year: 1991, cost: 34000, prereq: ['1g'], desc: '数字语音与短信，功耗与体积大幅下降。' },
  { id: '2_5g', name: '2.5G / GPRS', cat: 'comm', year: 1997, cost: 52000, prereq: ['2g'], desc: '低速数据业务，手机第一次能上网。' },
  { id: '3g', name: '3G 移动宽带', cat: 'comm', year: 2001, cost: 90000, prereq: ['2_5g'], desc: '移动互联网起点，视频通话成为可能。' },
  { id: '4g', name: '4G LTE', cat: 'comm', year: 2010, cost: 160000, prereq: ['3g'], desc: '高速移动宽带，催生移动应用生态。' },
  { id: '5g', name: '5G NR', cat: 'comm', year: 2019, cost: 320000, prereq: ['4g'], desc: '低时延高带宽，需要更多天线与散热。' },
  { id: '5ga', name: '5G-Advanced', cat: 'comm', year: 2024, cost: 460000, prereq: ['5g'], desc: '通感一体、上行增强。' },
  { id: '6g', name: '6G 太赫兹', cat: 'comm', year: 2030, cost: 900000, prereq: ['5ga'], desc: '太赫兹频段与空天地一体组网。' },
  { id: 'quantum_comm', name: '量子通信模组', cat: 'comm', year: 2038, cost: 1800000, prereq: ['6g'], desc: '物理层加密，政企市场的新壁垒。' },

  // 处理器
  { id: 'cpu8', name: '8 位处理器', cat: 'cpu', year: 1980, cost: 9000, prereq: [], desc: '单片机级别算力，只够驱动通话与简单界面。' },
  { id: 'cpu16', name: '16 位处理器', cat: 'cpu', year: 1988, cost: 26000, prereq: ['cpu8'], desc: '支持更复杂的通信协议与字符界面。' },
  { id: 'arm', name: 'ARM 低功耗架构', cat: 'cpu', year: 1995, cost: 78000, prereq: ['cpu16'], desc: '移动设备真正开始拥有通用算力。' },
  { id: 'dualcore', name: '双核移动处理器', cat: 'cpu', year: 2008, cost: 130000, prereq: ['arm'], desc: '多任务成为卖点。' },
  { id: 'quadcore', name: '四核移动处理器', cat: 'cpu', year: 2012, cost: 190000, prereq: ['dualcore'], desc: '性能军备竞赛开始。' },
  { id: 'soc', name: '高集成 SoC', cat: 'cpu', year: 2015, cost: 260000, prereq: ['quadcore'], desc: 'CPU/GPU/基带/ISP 单芯片，成本与体积同时下降。' },
  { id: 'nm7', name: '7nm 先进制程', cat: 'cpu', year: 2018, cost: 420000, prereq: ['soc'], desc: '能效比大幅提升，但流片成本极高。' },
  { id: 'nm3', name: '3nm 制程', cat: 'cpu', year: 2022, cost: 760000, prereq: ['nm7'], desc: '同面积性能翻倍，散热压力上升。' },
  { id: 'aicpu', name: 'AI 异构算力', cat: 'cpu', year: 2024, cost: 880000, prereq: ['nm3'], desc: '端侧大模型，影像与助手能力跃升。' },
  { id: 'quantum_cpu', name: '量子协处理器', cat: 'cpu', year: 2040, cost: 2600000, prereq: ['aicpu'], desc: '特定任务指数级加速。' },

  // 屏幕
  { id: 'mono_lcd', name: '单色 LCD', cat: 'screen', year: 1980, cost: 8000, prereq: [], desc: '黑绿点阵，只能显示字符与图标。' },
  { id: 'color_lcd', name: '彩色 LCD', cat: 'screen', year: 1998, cost: 36000, prereq: ['mono_lcd'], desc: '彩色屏幕让手机第一次有"界面设计"。' },
  { id: 'tft', name: 'TFT 面板', cat: 'screen', year: 2002, cost: 62000, prereq: ['color_lcd'], desc: '响应更快，可视角度更好。' },
  { id: 'ips', name: 'IPS 硬屏', cat: 'screen', year: 2008, cost: 110000, prereq: ['tft'], desc: '广视角与准确色彩。' },
  { id: 'oled', name: 'OLED', cat: 'screen', year: 2012, cost: 190000, prereq: ['ips'], desc: '自发光、高对比度、可做曲面。' },
  { id: 'amoled', name: 'AMOLED 全面屏', cat: 'screen', year: 2015, cost: 260000, prereq: ['oled'], desc: '支持屏下器件与窄边框设计。' },
  { id: 'high_refresh', name: '高刷新率', cat: 'screen', year: 2019, cost: 300000, prereq: ['amoled'], desc: '90/120Hz，交互流畅度成为卖点。' },
  { id: 'ltpo', name: 'LTPO 自适应刷新', cat: 'screen', year: 2020, cost: 380000, prereq: ['high_refresh'], desc: '1-120Hz 自适应，兼顾流畅与功耗。' },
  { id: 'flexible', name: '柔性屏', cat: 'screen', year: 2019, cost: 460000, prereq: ['amoled'], desc: '可弯折基板，折叠形态的前提。' },
  { id: 'foldable', name: '折叠屏结构', cat: 'screen', year: 2020, cost: 720000, prereq: ['flexible'], desc: '铰链、折痕控制与超薄堆叠。' },
  { id: 'rollable', name: '卷轴屏', cat: 'screen', year: 2026, cost: 1100000, prereq: ['foldable'], desc: '电动伸缩，形态自由度更高。' },
  { id: 'hologram', name: '全息显示', cat: 'screen', year: 2040, cost: 2800000, prereq: ['rollable'], desc: '裸眼三维成像。' },

  // 影像
  { id: 'vga_cam', name: 'VGA 摄像头', cat: 'camera', year: 2000, cost: 18000, prereq: ['color_lcd'], desc: '11 万像素，只能拍个大概。' },
  { id: 'cmos', name: 'CMOS 传感器', cat: 'camera', year: 2003, cost: 32000, prereq: ['vga_cam'], desc: '成本与功耗下降，拍照开始普及。' },
  { id: 'mp_cam', name: '高像素传感器', cat: 'camera', year: 2008, cost: 86000, prereq: ['cmos'], desc: '500 万像素以上，主打拍照手机。' },
  { id: 'ois', name: '光学防抖', cat: 'camera', year: 2014, cost: 150000, prereq: ['mp_cam'], desc: '暗光成片率显著提升。' },
  { id: 'dual_cam', name: '多摄系统', cat: 'camera', year: 2016, cost: 210000, prereq: ['mp_cam'], desc: '广角+长焦+景深，模组占用更大空间。' },
  { id: 'comp_photo', name: '计算摄影', cat: 'camera', year: 2018, cost: 300000, prereq: ['dual_cam', 'soc'], desc: '多帧合成、夜景与 HDR 算法。' },
  { id: 'periscope', name: '潜望式长焦', cat: 'camera', year: 2019, cost: 360000, prereq: ['ois', 'dual_cam'], desc: '折叠光路实现高倍变焦，厚度代价明显。' },
  { id: 'ai_imaging', name: 'AI 影像引擎', cat: 'camera', year: 2023, cost: 520000, prereq: ['comp_photo', 'aicpu'], desc: '语义分割与生成式增强。' },
  { id: 'lightfield', name: '光场相机', cat: 'camera', year: 2035, cost: 1400000, prereq: ['ai_imaging'], desc: '先拍照后对焦。' },

  // 电池
  { id: 'nicd', name: '镍镉电池', cat: 'battery', year: 1980, cost: 6000, prereq: [], desc: '记忆效应明显，能量密度低。' },
  { id: 'nimh', name: '镍氢电池', cat: 'battery', year: 1992, cost: 16000, prereq: ['nicd'], desc: '更环保，容量提升有限。' },
  { id: 'liion', name: '锂离子电池', cat: 'battery', year: 1996, cost: 42000, prereq: ['nimh'], desc: '能量密度跃升，手机得以轻薄化。' },
  { id: 'wireless_charge', name: '无线充电', cat: 'battery', year: 2012, cost: 120000, prereq: ['liion'], desc: '机身需加入线圈，增加厚度。' },
  { id: 'fastcharge', name: '快充技术', cat: 'battery', year: 2014, cost: 140000, prereq: ['liion'], desc: '充电功率成为新战场。' },
  { id: 'highdensity', name: '高密度电芯', cat: 'battery', year: 2019, cost: 220000, prereq: ['fastcharge'], desc: '同体积更大容量，安全要求更高。' },
  { id: 'highdensity2', name: '硅碳负极电芯', cat: 'battery', year: 2023, cost: 320000, prereq: ['highdensity'], desc: '硅碳复合负极，能量密度再提升 15% 以上。' },
  { id: 'solidstate', name: '固态电池', cat: 'battery', year: 2027, cost: 620000, prereq: ['highdensity'], desc: '更高能量密度与安全性。' },
  { id: 'future_energy', name: '新型能源', cat: 'battery', year: 2042, cost: 1900000, prereq: ['solidstate'], desc: '一周续航成为常态。' },

  // 系统与其他
  { id: 'os_basic', name: '嵌入式系统', cat: 'other', year: 1980, cost: 7000, prereq: [], desc: '固定功能机系统，无法安装应用。' },
  { id: 'os_smart', name: '智能手机 OS', cat: 'other', year: 2007, cost: 120000, prereq: ['arm', 'color_lcd'], desc: '开放应用生态，软件成为核心竞争力。' },
  { id: 'ui_touch', name: '多点触控交互', cat: 'other', year: 2007, cost: 90000, prereq: ['color_lcd'], desc: '取消实体键盘的设计前提。' },
  { id: 'storage_flash', name: '闪存存储', cat: 'other', year: 2005, cost: 48000, prereq: ['cpu16'], desc: '替代存储卡，机身可做一体化。' },
  { id: 'ram_lpddr', name: '低功耗内存', cat: 'other', year: 2010, cost: 70000, prereq: ['storage_flash'], desc: '多任务与高带宽。' },
  { id: 'cooling_vc', name: '均热板散热', cat: 'other', year: 2016, cost: 130000, prereq: ['soc'], desc: '压制旗舰芯片的持续功耗。' },
  { id: 'waterproof', name: '防水防尘结构', cat: 'other', year: 2013, cost: 100000, prereq: ['liion'], desc: '密封设计增加成本与厚度。' },
  { id: 'fingerprint', name: '指纹识别', cat: 'other', year: 2014, cost: 110000, prereq: ['os_smart'], desc: '生物识别进入日常。' },
  { id: 'faceid', name: '3D 人脸识别', cat: 'other', year: 2017, cost: 180000, prereq: ['fingerprint', 'ai_imaging'], desc: '需要额外的结构光模组空间。' },
  { id: 'security_chip', name: '独立安全芯片', cat: 'other', year: 2018, cost: 150000, prereq: ['fingerprint'], desc: '政企与支付市场的入场券。' },
  { id: 'satellite', name: '卫星通信', cat: 'other', year: 2022, cost: 420000, prereq: ['5g'], desc: '无地面网络也能求救。' },
  { id: 'ai_assistant', name: '端侧 AI 助手', cat: 'other', year: 2023, cost: 500000, prereq: ['aicpu', 'os_smart'], desc: '系统级智能体，重塑交互。' },
];

export const TECH_MAP = Object.fromEntries(TECHS.map((t) => [t.id, t]));

export function techAvailable(t, year, unlocked) {
  if (unlocked.includes(t.id)) return true;
  if (year < t.year) return false;
  return t.prereq.every((p) => unlocked.includes(p));
}

export function techState(t, year, unlocked, researching) {
  if (unlocked.includes(t.id)) return 'done';
  if (researching && researching.techId === t.id) return 'doing';
  if (year < t.year) return 'future';
  if (!t.prereq.every((p) => unlocked.includes(p))) return 'locked';
  return 'ready';
}
