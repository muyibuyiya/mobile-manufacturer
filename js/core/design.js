// 手机设计：参数化几何 + 配置 + 合理性校验 + 评分/成本推导
import { PHONE_TEMPLATES, PHONE_TPL_MAP, templateForYear } from '../data/templates.js';
import { clamp, round } from './util.js';
import { CPUS, RAMS, STORAGES, SCREENS, CAMERAS, BATTERIES, SYSTEMS, EXTRAS, MATERIALS, FINISHES, CHARGERS } from '../data/parts.js';
import { IMAGE_SENSORS, LENS_TYPES, PANEL_VENDORS, RES_TIERS, formatFactor, lensRadiusMm, lensThicknessMm, sensorById, lensTypeById } from '../data/hardware.js';
import { TECHS } from '../data/tech.js';
import { expectedPrice } from '../data/world.js';

export const SCREEN_ASPECTS = {
  '1:1': 1,
  '5:4': 5 / 4,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '5:3': 5 / 3,
  '16:9': 16 / 9,
  '19.5:9': 19.5 / 9,
  '21:9': 21 / 9,
  '自由': 0, // 0 表示用 design.screen.aspectV
};

// 标准充电口开口尺寸（mm）：Type-C 开口 8.34×2.56，Micro-B 开口 6.85×1.8
// （custom 用 body.ports.chargeShape 的用户自定义尺寸）
export const PORT_OPENINGS = {
  typec: { w: 8.34, h: 2.56 },
  micro: { w: 6.85, h: 1.8 },
};

// 扬声器开孔样式：dot5/dot6 圆孔行，slot2/slot3 槽形孔行；span 为整行横向占宽（mm）
export function speakerRowSpec(style) {
  if (style === 'slot2') return { kind: 'slot', n: 2, w: 4.6, h: 1.2, gap: 1.6, span: 4.6 * 2 + 1.6 };
  if (style === 'slot3') return { kind: 'slot', n: 3, w: 4.6, h: 1.2, gap: 1.6, span: 4.6 * 3 + 1.6 * 2 };
  if (style === 'dot6') return { kind: 'dot', n: 6, d: 1.3, gap: 2.2, span: 1.3 + 2.2 * 5 };
  return { kind: 'dot', n: 5, d: 1.3, gap: 2.2, span: 1.3 + 2.2 * 4 }; // dot5（默认）
}

// 背面装饰（Logo + 文字）位置与尺寸（mm，原点=机身中心，+y 朝顶部）。
// text=null/'' 表示跟随公司英文名；logoOnBack / brandText 仍是显隐开关。幂等。
export function ensureBranding(design) {
  if (!design || !design.body) return design;
  if (!design.branding || typeof design.branding !== 'object') design.branding = {};
  const br = design.branding;
  const L = design.body.length, W = design.body.width;
  if (br.logoX === undefined) br.logoX = 0;
  if (br.logoY === undefined) br.logoY = Math.round(-L * 0.14 * 10) / 10;
  if (br.logoSize === undefined) br.logoSize = +clamp(W * 0.13, 4, 16).toFixed(1);
  if (br.textX === undefined) br.textX = 0;
  if (br.textY === undefined) br.textY = Math.round(-L * 0.26 * 10) / 10;
  if (br.textSize === undefined) br.textSize = +clamp(W * 0.05, 1.6, 6).toFixed(1);
  if (br.text === undefined) br.text = null;
  // Logo 颜色（null=原图/公司默认色）与表面效果（img=原图质感 / metal / glass / plastic）
  if (br.logoColor === undefined) br.logoColor = null;
  if (br.logoFinish === undefined) br.logoFinish = 'img';
  return design;
}

export function defaultDesign(year = 2020, unlocked = []) {
  const pickTech = (list) => {
    const ok = list.filter((p) => unlocked.includes(p.tech) && p.year <= year);
    if (!ok.length) return list[0].id;
    return [...ok].sort((a, b) => a.year - b.year)[ok.length - 1].id;
  };
  const modern = year >= 2017;
  const body = year >= 2017
    ? { length: 159, width: 74, thickness: 8.2, corner: 9 }
    : year >= 2013
      ? { length: 142, width: 70, thickness: 9.5, corner: 7 }
      : year >= 2010
        ? { length: 124, width: 63, thickness: 11.2, corner: 6 }
        : year >= 2005
          ? { length: 110, width: 50, thickness: 14, corner: 5 }
          : year >= 1995
            ? { length: 105, width: 45, thickness: 20, corner: 4 }
            : { length: 130, width: 50, thickness: 22, corner: 3 };
  const inch = year >= 2017 ? 6.5 : year >= 2013 ? 5.0 : year >= 2010 ? 4.0 : year >= 2005 ? 2.4 : year >= 1995 ? 1.8 : 1.4;
  const bezel = year >= 2017 ? 1.8 : year >= 2013 ? 3.0 : year >= 2010 ? 3.4 : year >= 2005 ? 4.2 : 4;
  const bestCharge = (list) => {
    const ok = list.filter((x) => unlocked.includes(x.tech) && x.year <= year && x.watt > 0);
    return ok.length ? [...ok].sort((a, b) => a.watt - b.watt)[ok.length - 1].id : list[0].id;
  };
  const bestProto = (list) => {
    const ok = list.filter((x) => unlocked.includes(x.tech) && x.year <= year && x.bonus > 0);
    return ok.length ? [...ok].sort((a, b) => a.bonus - b.bonus)[ok.length - 1].id : list[0].id;
  };
  const out = {
    template: templateForYear(year),
    keypad: { kind: year >= 2007 ? 'none' : 't9', style: 'grid', scale: 1 },
    homeStyle: year >= 2007 && year < 2017 ? 'circle' : '',
    body: {
      ...body,
      frame: modern ? 'alu' : 'plastic',
      back: modern ? 'glass' : 'plastic',
      finish: modern ? 'matte' : 'gloss',
      color: '#2b3440',
      // 三区配色方案：中框 / 后盖 / 正面盖板（盖板默认黑，非黑成本上浮）
      colors: { frame: '#2b3440', back: '#2b3440', cover: '#05070a' },
      schemeName: '',
      // 侧键样式：classic 双键 / strip 细长条 / split 分离音量键 / opposite 电源键异侧
      buttons: year >= 1998 ? 'classic' : 'none',
      // 侧键纵向偏移（mm，0 = 各样式默认位置）
      btnVolY: 0, btnPowY: 0,
      // 顶底开孔配置：双扬声器 / 顶部麦克风 / 充电口类型 / 扬声器开孔样式 / 各开孔横向位置（mm）
      ports: { dualSpeaker: modern, topMic: !modern, charge: modern ? 'typec' : (year >= 2005 ? 'micro' : 'custom'), chargeShape: { style: 'round', w: 6, h: 3 }, speakerStyle: 'dot5' },
      fold: 'none',
      // 折叠外屏（cover screen）：inch=0 为无（开关在 UI 的 body.coverOn，切换时记忆 last）；
      // ratio 高/宽比（0=按折叠结构默认）、x/y 半区内偏移 mm——外屏不默认占满、可精准调节；
      // notch 外屏开孔（none/punch/udc，可选前置摄像头或屏下摄像头）+ holeX 挖孔位置（%外屏宽）
      coverScreen: { inch: 0, last: 2.6, ratio: 0, x: 0, y: 0, notch: 'none', holeX: 0 },
    },
    screen: {
      inch,
      aspect: year >= 2019 ? '19.5:9' : (year >= 2010 ? '16:9' : '4:3'),
      bezel,
      corner: 0, // 屏幕圆角 mm（0=默认贴合机身圆角，同心缩进 bezel）
      panel: pickTech(SCREENS),
      notch: modern ? 'punch' : 'none',
      // 面板供应商与分辨率档位：按年代选当时最合适的档
      panelVendor: year >= 2012 ? 'pv_sdc' : '',
      panelGen: '',
      res: year >= 2016 ? 'res2k' : year >= 2013 ? 'res1080' : year >= 2012 ? 'res720' : '',
    },
    camera: {
      part: pickTech(CAMERAS),
      count: modern ? 3 : 1,
      layout: 'vertical',
      bump: modern ? 1.6 : 0,
      pos: 'top-left',
      offX: 0, offY: 0, modScale: 1,
      step: true, // 摄像头凸台（台阶）：关闭后镜头直接嵌在背盖上
      // deco 装饰台形状：circle 圆形 / square 正方形 / rounded 圆角矩形 / pill 胶囊
      deco: { shape: 'rounded', w: modern ? 26 : 16, h: modern ? 26 : 16, radius: 8, material: 'metal', color: '' },
      // 闪光灯位置（相对 deco 中心，mm）与半径
      flash: { x: 0, y: 0, r: 1.5, offDeco: true },
      // 逐镜设计：type 决定焦段类型；sensor 为真实传感器 id（sn_own=自研）；
      // ap 光圈 f 值、focal 等效焦距、ois 光学防抖；x/y 镜头在 deco 内位置（mm，相对 deco 中心）
      lenses: [],
    },
    parts: {
      cpu: pickTech(CPUS),
      ram: pickTech(RAMS),
      storage: pickTech(STORAGES),
      battery: pickTech(BATTERIES),
      os: pickTech(SYSTEMS),
      extras: [],
      charge: { wired: bestCharge(CHARGERS.wired), wireless: 'wl0', proto: bestProto(CHARGERS.proto) },
    },
    // 外观装饰
    logoOnBack: true,
    brandText: true,
    speakerGrill: modern ? false : true,
    keyboard: year < 2008,
    antenna: year < 1995,
  };
  const d = out;
  d._year = year;
  d._unlocked = unlocked;
  ensureLenses(d); // 新机型立即生成默认逐镜配置
  ensureBranding(d); // 背面装饰默认位置（Logo 下方留出品牌文字位）
  return d;
}

// ---------- 摄像头逐镜系统 ----------
// 按年代/解锁科技选默认传感器（主摄选当时最高档）
function defaultSensorFor(year, unlocked, role) {
  const ok = IMAGE_SENSORS.filter((s) => s.roles.includes(role) && s.year <= year && unlocked.includes(s.tech));
  if (!ok.length) return role === '主摄' ? IMAGE_SENSORS[0].id : null;
  return [...ok].sort((a, b) => (b.score - a.score) || (b.year - a.year))[0].id;
}

// n 颗镜头在 deco (w×h) 内的默认排布
export function layoutPos(i, n, layout, w, h) {
  switch (layout) {
    case 'square': return [w * (i % 2 === 0 ? -0.24 : 0.24), h * (i < 2 ? 0.24 : -0.24)];
    case 'ring': {
      const ang = (i / Math.max(1, n)) * Math.PI * 2 + Math.PI / 2;
      return [Math.cos(ang) * w * 0.26, Math.sin(ang) * h * 0.22];
    }
    case 'island': return i === 0 ? [-w * 0.2, h * 0.18] : [w * 0.22, h * (0.26 - i * 0.24)];
    case 'diamond': return [[0, h * 0.24], [-w * 0.24, 0], [w * 0.24, 0], [0, -h * 0.24]][i] || [0, 0];
    case 'dual': return n === 1 ? [0, 0] : [w * (i === 0 ? -0.26 : 0.26), 0];
    default: { // vertical 竖排
      return [0, h / 2 - (i + 0.5) * (h / Math.max(1, n))];
    }
  }
}

// 新建一颗镜头（role 为 LENS_TYPES id）
export function makeLens(role, year, unlocked, x = 0, y = 0, oisByDefault = false) {
  const lt = lensTypeById(role);
  const roleName = lt.name;
  let sensor = defaultSensorFor(year, unlocked, roleName);
  const sn = sensorById(sensor);
  return {
    type: role,
    sensor: sensor || 'sn_vga',
    ap: lt.defAp,
    focal: lt.defFocal,
    ois: oisByDefault && !!(sn && sn.ois),
    x, y,
    size: 1, // 镜头外观大小倍率（0.75~1.5），只影响渲染直径与外观，不影响成像公式
  };
}

// 旧档迁移：为缺 lenses 的 design.camera 按当时的 count/layout 生成默认镜头（幂等）
export function ensureLenses(design) {
  const c = design?.camera;
  if (!c) return design;
  if (!c.deco) c.deco = { shape: 'rounded', w: 26, h: 26, radius: 8, material: 'metal', color: '' };
  // deco 材质（metal/glass/plastic）与颜色（'' = 跟随后盖）：旧档幂等补齐
  if (!['metal', 'glass', 'plastic'].includes(c.deco.material)) c.deco.material = 'metal';
  if (c.deco.color === undefined) c.deco.color = '';
  if (!c.flash) c.flash = { x: 0, y: 0, r: 1.5, offDeco: true };
  // 闪光灯样式（round/rounded/slot/ring）与宽/长（矩形/槽形用），旧档幂等补齐
  if (!c.flash.style) c.flash.style = 'round';
  if (c.flash.w === undefined) c.flash.w = 4;
  if (c.flash.l === undefined) c.flash.l = 6;
  // 潜望凸台厚度（外部凸出 mm，不影响内部空间）与方向（v 竖 / h 横）：旧档幂等补齐
  if (!Number.isFinite(Number(c.periT))) c.periT = 0.6;
  if (c.periDir !== 'h' && c.periDir !== 'v') c.periDir = 'v';
  if (Array.isArray(c.lenses) && c.lenses.length) {
    c.count = c.lenses.length;
    // 旧档镜头补 size 字段（幂等）
    for (const l of c.lenses) { if (l.size === undefined) l.size = 1; if (l.thick === undefined) l.thick = 1; }
    return design;
  }
  const year = design._year || 2020;
  const unlocked = design._unlocked || TECHS.filter((t) => t.year <= year).map((t) => t.id);
  const n = clamp(c.count || 1, 1, 4);
  const roles = ['main', 'ultrawide', 'tele', 'periscope'];
  c.lenses = [];
  for (let i = 0; i < n; i++) {
    c.lenses.push(makeLens(roles[i] || 'depth', year, unlocked, 0, 0, true));
  }
  c.count = n;
  arrangeLenses(c); // 半径感知布阵（含 deco 尺寸自适应）
  return design;
}

// 半径感知镜头布阵：按每颗镜头的传感器底大小计算间距，杜绝重叠（v0.9.0 根修）。
// layout 模式参考真机海报语法：vertical 竖排胶囊 / square 2×2 / dual 横排双摄 / horizontal 横排 / ring 环绕。
// deco 尺寸 = 阵列内容 + 均匀 padding（只放不下时扩大，不缩小用户尺寸）。
export function arrangeLenses(camera) {
  const c = camera;
  if (!c || !Array.isArray(c.lenses) || !c.lenses.length) return c;
  const GAP = 2.2, PAD = 2.5, PAD_PERI = 3.4;
  const radii = c.lenses.map((l) => {
    let r = lensRadiusMm((sensorById(l.sensor) || {}).format) * (l.size || 1);
    if (l.type === 'periscope') r *= 1.15; // 潜望方形基座
    return r;
  });
  const maxR = Math.max(...radii);
  const n = c.lenses.length;
  const lay = c.layout || 'vertical';
  const place = (positions) => {
    c.lenses.forEach((l, i) => { l.x = Math.round(positions[i][0] * 10) / 10; l.y = Math.round(positions[i][1] * 10) / 10; });
  };
  if (n === 1) {
    place([[0, 0]]);
  } else if (lay === 'square' && n >= 2) {
    // 2×2：主摄占左上大格，其余按序
    const cell = 2 * maxR + GAP;
    const pos = [[-cell / 2, cell / 2], [cell / 2, cell / 2], [-cell / 2, -cell / 2], [cell / 2, -cell / 2]];
    place(pos.slice(0, n).map((p, i) => (n === 3 && i === 2 ? [0, -cell / 2] : p)));
  } else if (lay === 'dual' && n === 2) {
    place([[-(maxR + GAP / 2), 0], [maxR + GAP / 2, 0]]);
  } else if (lay === 'horizontal' || (lay === 'dual' && n > 2)) {
    // 横排：小镜在主摄右侧
    let cursor = 0;
    const pos = [];
    for (let i = 0; i < n; i++) {
      pos.push(i === 0 ? [0, 0] : [cursor + radii[0] + GAP / 2 + radii[i], 0]);
      cursor = pos[i][0] + radii[i];
    }
    place(pos);
  } else if (lay === 'ring' && n >= 3) {
    const ringR = Math.max(maxR * 1.5, maxR + GAP);
    const pos = [];
    for (let i = 0; i < n; i++) {
      const ang = Math.PI / 2 + (i / n) * Math.PI * 2;
      pos.push([Math.cos(ang) * ringR, Math.sin(ang) * ringR * 0.92]);
    }
    place(pos);
  } else {
    // vertical（默认）：居中竖排，间距 = 相邻半径和 + 间隙
    const pitch = 2 * maxR + GAP;
    const pos = [];
    for (let i = 0; i < n; i++) pos.push([0, ((n - 1) / 2 - i) * pitch]);
    place(pos);
  }
  // deco 尺寸 = 阵列包围盒 + padding（只扩大）
  let needW = c.deco.w || 8, needH = c.deco.h || 8;
  for (const l of c.lenses) {
    const i2 = c.lenses.indexOf(l);
    const r = radii[i2];
    const margin = l.type === 'periscope' ? PAD_PERI : PAD;
    needW = Math.max(needW, Math.ceil(Math.abs(l.x) * 2 + r * 2 + margin));
    needH = Math.max(needH, Math.ceil(Math.abs(l.y) * 2 + r * 2 + margin));
  }
  if (c.deco.shape === 'circle') { const m = Math.max(needW, needH); needW = needH = m; }
  c.deco.w = clamp(needW, 8, Math.max(12, 60));
  c.deco.h = clamp(needH, 8, Math.max(14, 80));
  return c;
}

// 每颗镜头的成像分（0~110）
export function lensScore(l, design) {
  const lt = lensTypeById(l.type);
  let sn = sensorById(l.sensor);
  if (l.sensor === 'sn_own' && design) sn = design.parts.ownCmr; // 自研快照
  if (!sn) return 0;
  let s = (sn.score || 0) * (0.35 + lt.weight * 0.65);
  // 光圈：比该类型默认更亮加分（每 0.1 档 ≈1.6 分）
  s += clamp((lt.defAp - l.ap) * 16, -10, 9);
  // 焦距偏离典型区间轻微扣分
  if (l.focal < lt.focal[0]) s -= (lt.focal[0] - l.focal) * 0.6;
  if (l.focal > lt.focal[1]) s -= (l.focal - lt.focal[1]) * 0.6;
  if (l.ois) s += 4;
  return s;
}

// 全套镜头的影像评分（0~100）：主摄为主 + 副摄平均贡献 + 组合加成
export function cameraScoreOf(design) {
  ensureLenses(design);
  const lenses = design.camera.lenses;
  if (!lenses.length) return 0;
  const main = lenses.find((l) => l.type === 'main') || lenses[0];
  const mainS = lensScore(main, design) * 0.8;
  const subs = lenses.filter((l) => l !== main);
  const subAvg = subs.length ? subs.reduce((a, l) => a + lensScore(l, design), 0) / subs.length : 0;
  const types = new Set(lenses.map((l) => l.type));
  let combo = 0;
  if (lenses.length >= 2) combo += 2;
  if (lenses.length >= 3) combo += 3;
  if (lenses.length >= 4) combo += 3;
  if (types.has('ultrawide')) combo += 2;
  if (types.has('tele') || types.has('periscope')) combo += 3;
  return clamp(mainS + subAvg * 0.38 + combo, 0, 100);
}

export function screenSize(design) {
  const { inch, aspect } = design.screen;
  const a0 = SCREEN_ASPECTS[aspect] ?? 16 / 9;
  // 自由比例：折叠屏内屏为横宽形态，允许 a<1（高/宽 < 1 即宽屏）
  const a = a0 === 0 ? clamp(design.screen.aspectV || 2, 0.5, 2.6) : a0;
  const diag = inch * 25.4;
  const h = diag / Math.sqrt(1 + 1 / (a * a));
  const w = h / a;
  return { w: +w.toFixed(1), h: +h.toFixed(1), diag: +diag.toFixed(1), a };
}

// 按机身尺寸与边框反推最大可容纳的屏幕 inch（调机身时自动贴合用）。
// 折叠机型：body.width/length 是折叠态（单半）尺寸，屏幕按展开态有效足迹贴合
// （横向折叠宽×2 / 竖向翻折长×2）
export function maxScreenInch(design) {
  const b = design.body;
  const bz = design.screen.bezel;
  const effW = b.fold === 'fold' ? b.width * 2 : b.width;
  const effH = b.fold === 'flip' ? b.length * 2 : b.length;
  const availW = effW - bz * 2 - 1.2;
  const availH = effH - bz * 2 - 1.2;
  // SCREEN_ASPECTS 语义为 高/宽（与 screenSize 一致）：h = w * a ≤ availH → w ≤ availH / a
  const a = SCREEN_ASPECTS[design.screen.aspect] === 0
    ? clamp(design.screen.aspectV || 2, 0.5, 2.6)
    : (SCREEN_ASPECTS[design.screen.aspect] || 16 / 9);
  const w = Math.min(availW, availH / a);
  const h = w * a;
  const diag = Math.sqrt(w * w + h * h);
  const cap = PHONE_TPL_MAP[design.template]?.screen.maxInch ?? 8.2;
  return Math.round(clamp(diag / 25.4, 1, cap) * 10) / 10;
}

export function bodyVolume(design) {
  const b = design.body;
  return (b.length * b.width * b.thickness) / 1000; // cm3
}

// 判断颜色是否足够深（近似亮度 < 0.28 即视为深色/黑色系）
export function isDarkHex(hex) {
  const n = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{3,6}$/i.test(n)) return true;
  const full = n.length === 3 ? n.split('').map((c) => c + c).join('') : n;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return (r * 0.299 + g * 0.587 + b * 0.114) < 0.28;
}

export function batteryVolume(bat) {
  return bat.weight / 2.05; // 近似锂电/镍氢密度
}

export function shellWeight(design) {
  const b = design.body;
  const areaMm2 = 2 * (b.length * b.width) + 2 * (b.length + b.width) * b.thickness;
  const areaCm2 = areaMm2 / 100;
  const frame = MATERIALS.find((m) => m.id === b.frame) || MATERIALS[0];
  const back = MATERIALS.find((m) => m.id === b.back) || MATERIALS[0];
  return (areaCm2 * 0.085 * frame.weight) + (b.length * b.width / 100 * 0.06 * back.weight);
}

export function bomCost(design, year) {
  return Math.round(rawBom(design) * eraCostScale(year));
}

// 各年代主流机的 BOM 占零售价的比例，用来把成本锚定到该年代的物价水平
const BOM_RATIO = 0.52;
const _costScaleCache = new Map();
export function eraCostScale(year) {
  const y = Math.round(year);
  const hit = _costScaleCache.get(y);
  if (hit) return hit;
  const unlocked = TECHS.filter((t) => t.year <= y).map((t) => t.id);
  const raw = rawBom(defaultDesign(y, unlocked));
  const target = expectedPrice(y) * BOM_RATIO;
  const scale = clamp(target / Math.max(raw, 1), 0.05, 400);
  if (_costScaleCache.size > 400) _costScaleCache.clear();
  _costScaleCache.set(y, scale);
  return scale;
}

// 器件原价直接加总：只反映"选了多好的料"，不含年代物价
function resolveCpu(design) {
  if (design.parts.ownCpu) return design.parts.ownCpu;
  return CPUS.find((x) => x.id === design.parts.cpu) || CPUS[0];
}
function resolveCam(design) {
  if (design.parts.ownCmr) return design.parts.ownCmr;
  return CAMERAS.find((x) => x.id === design.camera.part) || CAMERAS[0];
}
function resolvePanel(design) {
  const base = SCREENS.find((x) => x.id === design.screen.panel) || SCREENS[0];
  // 面板供应商：品质/成本系数（未选时默认 1.0）；分辨率档位影响清晰度与成本
  const pv = PANEL_VENDORS.find((v) => v.id === design.screen.panelVendor) || null;
  const res = RES_TIERS.find((r) => r.id === design.screen.res) || null;
  // 发光材料世代（M14/Q10/C9 等真机命名）：品质与成本小幅上浮
  const gen = pv && pv.gens ? pv.gens.find((g) => g.id === design.screen.panelGen) || null : null;
  const vendorMul = (pv ? pv.cost : 1.0) * (gen ? gen.c : 1.0);
  const resMul = res ? res.costMul : 1.0;
  const genQ = gen ? gen.q : 1.0;
  let out = { ...base, quality: base.quality * (pv ? pv.quality : 1.0) * genQ };
  if (design.parts.ownPanel) {
    // 自研面板：品质由部门等级决定，成本按自产 0.72 折算
    out.quality = design.parts.ownPanel.quality * (pv ? pv.quality : 1.0) * genQ;
  }
  out.priceFor = (inch) => Math.round(base.priceFor(inch) * vendorMul * resMul);
  out.resLevel = res ? res.level : 0.85;
  out.vendorName = pv ? pv.name : '公版';
  return out;
}

// 逐镜成本：Σ（传感器价 × 类型系数 + OIS）+ deco 形状模具 + 闪光灯模组
export function lensesCost(design) {
  ensureLenses(design);
  const c = design.camera;
  if (!c.lenses.length) return 0;
  let sum = 0;
  for (const l of c.lenses) {
    const lt = lensTypeById(l.type);
    let sn = sensorById(l.sensor);
    if (l.sensor === 'sn_own') sn = design.parts.ownCmr;
    if (!sn) continue;
    const volFactor = 0.6 + formatFactor(sn.format) * 0.8; // 大底更贵
    const sz = l.size || 1; // 镜头外观倍率：更大的镜头组光学成本更高
    sum += (sn.price || 100) * volFactor * lt.priceMul * (0.75 + sz * 0.25) + (l.ois ? 18 : 0);
  }
  // deco 模具：形状复杂度 + 尺寸
  const deco = c.deco || { w: 20, h: 20 };
  const area = (deco.w || 20) * (deco.h || 20);
  // 闪光灯模组：样式与大小计价（环形灯圈最贵；矩形/槽形按面积加价）
  const flStyle = c.flash?.style || 'round';
  const flCost = flStyle === 'ring' ? 3 : flStyle === 'rounded' ? 1.5 : flStyle === 'slot' ? 1 : 0;
  const flArea = (flStyle === 'rounded' || flStyle === 'slot') ? Math.max(0, ((c.flash?.w || 4) * (c.flash?.l || 6) - 24) * 0.15) : 0;
  sum += 4 + area * 0.12 + (c.deco?.shape === 'circle' ? 2 : 0) + c.flash.r * 2.5 + flCost + flArea;
  return Math.round(sum);
}

function rawBom(design) {
  ensureLenses(design);
  const c = resolveCpu(design);
  const r = RAMS.find((x) => x.id === design.parts.ram) || RAMS[0];
  const s = STORAGES.find((x) => x.id === design.parts.storage) || STORAGES[0];
  const b = BATTERIES.find((x) => x.id === design.parts.battery) || BATTERIES[0];
  const os = SYSTEMS.find((x) => x.id === design.parts.os) || SYSTEMS[0];
  const panel = resolvePanel(design);
  const frame = MATERIALS.find((m) => m.id === design.body.frame) || MATERIALS[0];
  const back = MATERIALS.find((m) => m.id === design.body.back) || MATERIALS[0];
  const charge = design.parts.charge || {};
  const cw = CHARGERS.wired.find((x) => x.id === charge.wired) || CHARGERS.wired[0];
  const wl = CHARGERS.wireless.find((x) => x.id === charge.wireless) || CHARGERS.wireless[0];
  const pr = CHARGERS.proto.find((x) => x.id === charge.proto) || CHARGERS.proto[0];

  // 摄像头逐镜计价：传感器价 × 镜头类型系数 + OIS + deco 模具 + 闪光灯
  const camCost = lensesCost(design);
  const coverScreenInch = design.body.coverScreen?.inch || 0;
  const coverPanelCost = coverScreenInch > 0 ? panel.priceFor(Math.min(coverScreenInch, 7)) * 0.7 : 0;
  const parts = c.price + r.price + s.price + b.price + camCost
    + panel.priceFor(design.screen.inch) * (1 + ((design.screen.hz || 60) - 60) * 0.004) + coverPanelCost + frame.price + back.price * 1.4 + os.fee
    + cw.price + wl.price + pr.bonus * 4;
  const extras = design.parts.extras.reduce((sum, id) => {
    const x = EXTRAS.find((e) => e.id === id);
    return sum + (x ? x.price : 0);
  }, 0);
  let mechanical = 12 + design.body.corner * 0.8 + (design.body.fold !== 'none' ? 260 : 0)
    + (design.screen.bezel < 1.2 ? 26 : 0)
  mechanical += (design.camera.step ? 14 : 0) + 8; // 凸台模具 + 闪光灯
  mechanical += design.screen.notch === 'popup' ? 32 : 0; // 升降前摄机构
  if (design.backWindow?.on) mechanical += Math.round(260 + (design.backWindow.inch || 1) * 180); // 背部智窗
  // 配色工艺成本：盖板非黑色需加镀膜工序；后盖与中框异色需双色注塑/阳极氧化
  const colors = design.body.colors || { frame: design.body.color, back: design.body.color, cover: '#05070a' };
  const coverDark = isDarkHex(colors.cover);
  const frameBackDiff = colors.frame.toLowerCase() !== colors.back.toLowerCase();
  mechanical += coverDark ? 0 : 22;
  mechanical += frameBackDiff ? 9 : 0;
  // 双扬声器 + 顶部麦克风开孔模具；自定义充电口按形状复杂度与尺寸计价
  const ports = design.body.ports || {};
  const cs = ports.chargeShape || { style: 'round', w: 6, h: 3 };
  const customPortCost = ports.charge === 'custom'
    ? 4 + (cs.style === 'round' ? 2 : cs.style === 'capsule' ? 3.5 : cs.style === 'square' ? 3 : 4.5)
      + Math.max(0, (cs.w - 6) * 0.4)
    : 0;
  // 4 扬声器：底部/顶部各两只（折叠屏每半一只），多出一对腔体与开孔模具
  mechanical += (ports.dualSpeaker ? 7 : 0) + (ports.topMic && !ports.dualSpeaker ? 2 : 0)
    + (ports.quadSpeaker ? 14 : 0) + customPortCost;
  // 槽形扬声器孔需要精修模具，略贵于圆孔；底部麦克风升级扬声器同款样式时同理
  const spStyle = ports.speakerStyle || 'dot5';
  mechanical += (spStyle === 'slot2' || spStyle === 'slot3') ? 2 : 0;
  if (ports.micStyle && ports.micStyle !== 'hole') {
    mechanical += 3 + ((ports.micStyle === 'slot2' || ports.micStyle === 'slot3') ? 2 : 0);
  }
  // 折叠盖板：UTG 玻璃贵、CPI 便宜
  const foldGlassCost = design.body.fold && design.body.fold !== 'none'
    ? (design.parts.foldGlass === 'utg' ? 110 : design.parts.foldGlass === 'cpi' ? 35 : 0) : 0;
  return Math.round(parts + extras + mechanical + foldGlassCost);
}

export function derive(design, year, opts = {}) {
  ensureLenses(design);
  design._year = year;
  const b = design.body;
  const c = resolveCpu(design);
  const r = RAMS.find((x) => x.id === design.parts.ram) || RAMS[0];
  const s = STORAGES.find((x) => x.id === design.parts.storage) || STORAGES[0];
  const bat = BATTERIES.find((x) => x.id === design.parts.battery) || BATTERIES[0];
  const os = SYSTEMS.find((x) => x.id === design.parts.os) || SYSTEMS[0];
  const panel = resolvePanel(design);
  const frame = MATERIALS.find((m) => m.id === b.frame) || MATERIALS[0];
  const back = MATERIALS.find((m) => m.id === b.back) || MATERIALS[0];
  const scr = screenSize(design);
  const charge = design.parts.charge || {};
  const cw = CHARGERS.wired.find((x) => x.id === charge.wired) || CHARGERS.wired[0];
  const wl = CHARGERS.wireless.find((x) => x.id === charge.wireless) || CHARGERS.wireless[0];
  const pr = CHARGERS.proto.find((x) => x.id === charge.proto) || CHARGERS.proto[0];

  const perf = clamp(c.perf * 0.62 + ramScore(r.gb) * 0.2 + storageScore(s.gb) * 0.18, 0, 100);
  // 影像评分：逐镜（传感器档位 × 镜头类型权重 + 光圈/焦段/OIS）+ 组合加成
  const camera = cameraScoreOf(design);
  const hz = design.screen.hz || 60;
  const drainMa = 210 + c.power * 105 + panel.quality * 1.5 + (design.screen.inch > 6 ? 60 : 0)
    + (hz - 60) * 0.35
    - (design.parts.extras.includes('x_udc') ? 4 : 0);
  const endurance = bat.mah / drainMa;
  // 充电能力折算到续航评分（快充缩短补能焦虑）+ 充电时间
  const chargeBonus = clamp(cw.watt / 22, 0, 6) + (pr.bonus || 0) * 0.4 + clamp(wl.watt / 30, 0, 2.5);
  const battery = clamp(endurance * 12 + chargeBonus, 0, 100);
  const chargeMin = Math.round(bat.mah * 3.85 / Math.max(5, cw.watt) / 900 * 60); // 有线充满分钟数

  // 工业设计评分：比例、厚度、屏占比、材质、时代合理性
  // 折叠机按展开态有效比例：fold 展开接近方形（理想 ≈1.06），flip 用两倍长度（理想 ≈2.05）
  const effLen = b.fold === 'flip' ? b.length * 2 : b.length;
  const effWid = b.fold === 'fold' ? b.width * 2 : b.width;
  const ratio = effLen / effWid;
  const ratioIdeal = b.fold === 'fold' ? 1.06 : 2.05;
  const ratioScore = clamp(100 - Math.abs(ratio - ratioIdeal) * 90, 0, 100);
  const thinScore = clamp(100 - Math.max(0, b.thickness - 6.5) * 7.5, 0, 100);
  const screenRatio = clamp(((scr.w * scr.h) / (b.length * b.width)) * 100, 0, 100);
  const bezelScore = clamp(100 - design.screen.bezel * 16, 0, 100);
  const materialScore = (frame.quality + back.quality) / 2;
  const finishBonus = (FINISHES.find((f) => f.id === b.finish) || FINISHES[0]).quality;
  // 显示清晰度：分辨率档位（level 0.72~1.05），时代差距会折损
  const resFit = clamp(panel.resLevel * 100 - Math.max(0, year - (RES_TIERS.find((r) => r.id === design.screen.res)?.year || year)) * 1.2, 30, 105);
  // 评分按形态世代分支：按键机不奖励大屏/高刷/超薄，奖励材质/清晰度/键盘工艺
  const TPLD = PHONE_TPL_MAP[design.template] || PHONE_TPL_MAP.full_screen;
  const keypadForm = TPLD.keypad[0] !== 'none';
  let craft;
  if (keypadForm) {
    const kpBonus = design.keypad?.kind === 'qwerty' ? 6 : 4;
    craft = clamp(
      ratioScore * 0.1 + thinScore * 0.1 + screenRatio * 0.05 + bezelScore * 0.05 +
      materialScore * 0.22 + finishBonus * 1.2 + resFit * 0.3 + kpBonus, 0, 100);
  } else {
    craft = clamp(
      ratioScore * 0.18 + thinScore * 0.16 + screenRatio * 0.22 + bezelScore * 0.14 +
      materialScore * 0.12 + finishBonus + resFit * 0.16 + Math.min(5, (hz - 60) * 0.05), 0, 100);
  }
  const eraFit = techEraFit(design, year, opts);

  // 折叠盖板技术路线：UTG 折痕更浅（+3 分），CPI 经济之选（+1 分），未指定不加分
  const foldGlassBonus = design.body.fold && design.body.fold !== 'none'
    ? (design.parts.foldGlass === 'utg' ? 3 : design.parts.foldGlass === 'cpi' ? 1 : 0) : 0;
  const designScore = clamp(craft * 0.78 + eraFit * 0.22 + foldGlassBonus, 0, 100);

  // 逐镜重量：传感器格式越大越重；厚度取最厚镜头（潜望更高）
  let camWeight = 0, camThick = 0;
  for (const l of design.camera.lenses) {
    let sn = sensorById(l.sensor);
    if (l.sensor === 'sn_own') sn = design.parts.ownCmr;
    if (!sn) continue;
    const f = formatFactor(sn.format);
    camWeight += 3 + f * 7;
    camThick = Math.max(camThick, lensThicknessMm(sn.format, l.type) * (l.thick ?? 1));
  }
  if (!design.camera.lenses.length) { camWeight = 0; camThick = 0; }
  const weight = Math.round(
    shellWeight(design) + bat.weight + camWeight
    + panel.weight + c.weight + r.weight + s.weight + 16
    + design.parts.extras.length * 4
  );
  const cost = bomCost(design, year);

  const volume = bodyVolume(design);
  // 折叠机为双层结构（两半各一层堆叠），内部可用空间 ×2
  const internal = volume * 0.56 * (b.fold !== 'none' ? 2 : 1);
  const camVol = (camThick * 1.2 * Math.max(1, design.camera.lenses.length)) / 10; // cm3
  const used = batteryVolume(bat) + camVol
    + 9.5 + (design.parts.extras.length * 0.9) + (design.body.fold !== 'none' ? 9 : 0);
  const spaceUse = clamp((used / internal) * 100, 0, 160);

  // 厚度需求：直板=最厚镜头+基板装进机身；折叠机相机模组在闭合叠层外侧（外凸不占对半厚度），
  // 按「闭合总厚 2T-0.6 ≥ 11mm」的可用性下限校验（此前拿单半厚对比 11mm 下限会误报冲突）
  const camNeed = design.camera.lenses.length ? (design.camera.step ? camThick + 1.2 : camThick * 0.62) : 0;
  const tRef = b.fold !== 'none' ? b.thickness * 2 - 0.6 : b.thickness;
  const thicknessNeed = Math.max(camNeed, b.fold !== 'none' ? 11 : 0);
  const moduleOver = clamp(thicknessNeed - tRef, 0, 20);

  return {
    scr, perf, camera, battery, designScore, craft, eraFit, weight, cost,
    endurance: round(endurance, 1), volume: round(volume, 1), internal: round(internal, 1),
    used: round(used, 1), spaceUse: round(spaceUse, 1), moduleOver: round(moduleOver, 1),
    screenRatio: round(screenRatio, 1), drainMa: Math.round(drainMa),
    chargeMin, watt: cw.watt, wirelessWatt: wl.watt, proto: pr.name,
    thermal: thermalScore(design, c, year),
  };
}

// 镜头规格（评估页展示）：直接读逐镜配置
export function lensSpecs(design) {
  ensureLenses(design);
  const out = [];
  for (const l of design.camera.lenses) {
    const lt = lensTypeById(l.type);
    let sn = sensorById(l.sensor);
    if (l.sensor === 'sn_own') sn = design.parts.ownCmr;
    if (!sn) continue;
    out.push({
      role: lt.name,
      sensor: `${sn.name} · ${sn.format} · ${(sn.pixel || 1).toFixed(2)}μm`,
      aperture: `ƒ/${Number(l.ap).toFixed(1)}`,
      focal: `${Number(l.focal).toFixed(0)}mm`,
      ois: !!l.ois,
      mp: sn.mp,
    });
  }
  return out;
}

function ramScore(gb) { return clamp(42 + 15 * Math.log2(Math.max(gb, 0.001)), 0, 100); }
function storageScore(gb) {
  if (gb <= 0) return 0;
  return clamp(26 + 12.5 * Math.log2(Math.max(gb, 0.01)), 0, 100);
}

function thermalScore(design, cpu, year) {
  const hasVC = design.parts.extras.includes('x_vc');
  const area = (design.body.length * design.body.width) / 100; // cm2
  const base = 78 - cpu.power * 6 + (hasVC ? 14 : 0) + area * 0.05;
  return Math.round(clamp(base, 5, 100));
}

// 时代合理性：设计与当前年代技术的匹配程度
// opts.ignoreEra = 沙盒全解锁：不按年代扣分（技术已全掌握，超前设计不视为不合理）
function techEraFit(design, year, opts = {}) {
  if (opts.ignoreEra) return 100;
  const b = design.body;
  const expected = {
    thickness: year < 1995 ? 26 : year < 2005 ? 18 : year < 2010 ? 13 : year < 2014 ? 10.5 : year < 2018 ? 8.5 : 8,
    inch: year < 1995 ? 1.3 : year < 2005 ? 2.4 : year < 2010 ? 3.2 : year < 2014 ? 4.5 : year < 2018 ? 5.4 : 6.5,
    bezel: year < 2005 ? 6 : year < 2010 ? 4.5 : year < 2014 ? 3.6 : year < 2018 ? 2.8 : 1.7,
  };
  let s = 100;
  s -= Math.abs(b.thickness - expected.thickness) * 1.6;
  s -= Math.abs(design.screen.inch - expected.inch) * 9;
  s -= Math.abs(design.screen.bezel - expected.bezel) * 3.2;
  if (year < 2008 && !design.keyboard) s -= 18; // 没有实体键盘的早期直板机很奇怪
  if (year < 2015 && design.screen.notch !== 'none') s -= 25;
  if (year >= 2022 && design.screen.notch === 'popup') s -= 10; // 升降结构在防水时代已淘汰
  if (year < 2020 && design.body.fold !== 'none') s -= 40;
  if (year >= 2016 && design.screen.inch < 4.5) s -= 15;
  if (year >= 2022 && design.parts.extras.includes('x_udc') && design.screen.notch === 'punch') s += 5; // 屏下摄像头的全面屏红利
  if (year >= 2022 && design.parts.extras.includes('x_udc') && design.body.coverScreen?.notch === 'udc') s += 2; // 外屏屏下摄像头：闭合态正面无开孔
  return clamp(s, 0, 100);
}

// 合理性检查：返回问题列表（error 会阻止量产）
// ---------- 年代基准 ----------
// 用「该年代全部可得科技」造一台主流机当锚点：它就是那个年代的 50 分。
// 没有这条基准，1980 年的手机（性能 2 分）会被固定基准判成垃圾，品牌一路归零。
const _baseCache = new Map();
export function eraBaseline(year) {
  const y = Math.round(year);
  const hit = _baseCache.get(y);
  if (hit) return hit;
  const unlocked = TECHS.filter((t) => t.year <= y).map((t) => t.id);
  const d = derive(defaultDesign(y, unlocked), y);
  const v = { perf: d.perf, camera: d.camera, battery: d.battery, designScore: d.designScore, cost: d.cost };
  if (_baseCache.size > 400) _baseCache.clear();
  _baseCache.set(y, v);
  return v;
}

// 与同代主流机的倍率：1.0 = 持平，1.5 = 明显更强
export function eraRel(value, base) {
  // 基准几乎为 0 的维度（1980 年的摄像头）：有就是优势，没有就算持平
  if (base <= 0.6) return value <= 0.6 ? 1 : 1 + clamp(value / 20, 0, 1.5);
  return clamp(value / base, 0.35, 2.6);
}

// ---------- 年代可用性硬校验（v1.5.0）----------
// UI 层一直采用「禁用保留」，但核心层从未拦截未来零件：旧档、导入档、沙盒或直接改档
// 都能把尚未发布/未解锁的零件塞进设计并正常量产。这里把门槛下沉到 validate 的唯一出口。
// opts.ignoreEra（沙盒全解锁）与 opts.unlocked（当前已解锁科技）由调用方传入。
export function eraAvailability(design, year, unlocked) {
  const issues = [];
  if (!design || !design.parts) return issues;
  const y = Math.round(Number(year) || 0);
  const unl = Array.isArray(unlocked) ? new Set(unlocked) : null;
  const flag = (item, label) => {
    if (!item) return;
    const nm = item.name || item.id || '未知部件';
    if (Number.isFinite(Number(item.year)) && Number(item.year) > y) {
      issues.push({ level: 'error', text: `${label}「${nm}」要到 ${item.year} 年才可用（当前 ${y} 年）。` });
      return;
    }
    if (unl && item.tech && !unl.has(item.tech)) {
      issues.push({ level: 'error', text: `${label}「${nm}」依赖的技术尚未解锁。` });
    }
  };
  const find = (list, id) => (list || []).find((x) => x.id === id) || null;
  const p = design.parts;
  if (!p.ownCpu) flag(find(CPUS, p.cpu), '处理器');
  flag(find(RAMS, p.ram), '内存');
  flag(find(STORAGES, p.storage), '存储');
  flag(find(BATTERIES, p.battery), '电池');
  if (!p.ownOs) flag(find(SYSTEMS, p.os), '系统');
  flag(find(SCREENS, design.screen?.panel), '屏幕面板');
  const pv = find(PANEL_VENDORS, design.screen?.panelVendor);
  if (pv) {
    flag(pv, '面板供应商');
    const gen = (pv.gens || []).find((g) => g.id === design.screen?.panelGen);
    if (gen) flag(gen, `${pv.name} 发光材料`);
  }
  flag(find(RES_TIERS, design.screen?.res), '分辨率');
  const charge = p.charge || {};
  flag(find(CHARGERS.wired, charge.wired), '有线充电');
  flag(find(CHARGERS.wireless, charge.wireless), '无线充电');
  flag(find(CHARGERS.proto, charge.proto), '充电协议');
  for (const eid of p.extras || []) flag(find(EXTRAS, eid), '附加功能');
  ensureLenses(design);
  if (!p.ownCmr) {
    for (let i = 0; i < design.camera.lenses.length; i++) {
      const l = design.camera.lenses[i];
      if (l.sensor !== 'sn_own') flag(find(IMAGE_SENSORS, l.sensor), `镜头 ${i + 1} 传感器`);
      flag(find(LENS_TYPES, l.type), `镜头 ${i + 1}`);
    }
  }
  return issues;
}

export function validate(design, year, opts = {}) {
  const issues = [];
  const b = design.body;
  // 折叠形态：屏幕装配在内屏（展开态）。
  // 约定：body.width / body.length 是折叠态（单半）尺寸——横向折叠展开宽 = width×2，
  // 竖向翻折展开长 = length×2
  const effW = b.fold === 'fold' ? b.width * 2 : b.width;
  const effH = b.fold === 'flip' ? b.length * 2 : b.length;
  const scr = screenSize(design);
  const d = derive(design, year, opts);

  // 年代硬锁：零件/传感器/面板/充电/附加功能必须在该年已发布且科技已解锁
  if (!opts.ignoreEra) issues.push(...eraAvailability(design, year, opts.unlocked));

  if (scr.w + design.screen.bezel * 2 > effW + 0.6) {
    issues.push({ level: 'error', text: `屏幕宽度 ${scr.w}mm 超出机身 ${effW}mm，无法装配。` });
  }
  if (scr.h + design.screen.bezel * 2 > effH + 0.6) {
    issues.push({ level: 'error', text: `屏幕高度 ${scr.h}mm 超出机身 ${effH}mm，无法装配。` });
  }
  if (b.thickness < 5) issues.push({ level: 'error', text: '机身厚度低于 5mm，结构强度不足。' });
  if (b.length < 60 || b.width < 35) issues.push({ level: 'error', text: '机身尺寸过小，无法容纳电池与主板。' });
  if (d.spaceUse > 100) issues.push({ level: 'error', text: `内部空间占用 ${d.spaceUse}%，电池与模组装不进去。` });
  if (d.spaceUse > 92) issues.push({ level: 'warn', text: `内部空间占用 ${d.spaceUse}%，散热与装配风险偏高。` });
  if (d.moduleOver > 0) issues.push({ level: 'warn', text: `摄像头模组比机身厚 ${d.moduleOver}mm，会明显凸起。` });
  // 摄像头位置不能超出机身；镜头不能超出 deco
  const camR = cameraModuleRect(design);
  if (camR) {
    if (camR.x0 < -b.width / 2 || camR.x1 > b.width / 2 || camR.y0 < -b.length / 2 || camR.y1 > b.length / 2) {
      issues.push({ level: 'error', text: '摄像头模组超出机身范围，请调整位置或尺寸。' });
    }
    // 镜头允许装到 deco 之外的后盖（真机常见：独立镜圈/镜头岛外挂）；
    // 只校验不越出机身，且开凸台时镜头不能被 deco 板遮住中心区域（给出提示而非拦截）
    const lenses = design.camera.lenses || [];
    for (let i = 0; i < lenses.length; i++) {
      const l = lenses[i];
      const r = lensRadiusMm((sensorById(l.sensor) || {}).format) * (l.size || 1) * (l.type === 'periscope' ? 1.25 : 1);
      const lxAbs = Math.abs(camR.cx + l.x) + r, lyAbs = Math.abs(camR.cy + l.y) + r;
      if (lxAbs > b.width / 2 - 0.6 || lyAbs > b.length / 2 - 0.6) {
        issues.push({ level: 'error', text: `镜头 ${i + 1} 超出机身范围，请向内调整。` });
        break;
      }
    }
    // 闪光灯在机身内（按样式外沿计算：矩形/槽形用 宽/长 的一半，环形/圆形用半径）
    const fl = design.camera.flash || { x: 0, y: 0 };
    const flStyle = fl.style || 'round';
    const flR = fl.r || 1.5;
    const flHalfW = (flStyle === 'rounded' || flStyle === 'slot') ? (fl.w || 4) / 2 : flR;
    const flHalfH = (flStyle === 'rounded' || flStyle === 'slot') ? (fl.l || 6) / 2 : flR;
    const fx = camR.cx + fl.x, fy = camR.cy + fl.y;
    if (Math.abs(fx) + flHalfW > b.width / 2 - 0.8 || Math.abs(fy) + flHalfH > b.length / 2 - 0.8) {
      issues.push({ level: 'error', text: '闪光灯超出机身范围，请调整位置或大小。' });
    }
  }
  if (b.fold !== 'none' && year < 2020 && !opts.ignoreEra) issues.push({ level: 'error', text: '折叠结构尚未成熟，当前年代无法量产。' });
  // 侧键纵向偏移不能滑出机身
  for (const [kn, v] of [['音量键', b.btnVolY || 0], ['电源键', b.btnPowY || 0]]) {
    if (Math.abs(v) > b.length / 2 - 4) issues.push({ level: 'error', text: `${kn}位置超出机身范围，请调整。` });
  }
  // 顶底开孔横向位置：充电口 / 扬声器行 / 麦克风不能超出机身宽度
  const ports = b.ports || {};
  const po = PORT_OPENINGS[ports.charge] || null;
  const portW = ports.charge === 'custom' ? (ports.chargeShape?.w || 6) : po ? po.w : 0;
  const spSpan = speakerRowSpec(ports.speakerStyle).span;
  const chkX = (label, x, span) => {
    if (Math.abs(x || 0) + span / 2 > b.width / 2 - 0.8) issues.push({ level: 'error', text: `${label}超出机身宽度，请调整位置。` });
  };
  if (portW) chkX('充电口位置', ports.chargePos, portW);
  chkX('扬声器位置', ports.speakerX ?? b.width * 0.28, spSpan);
  chkX('麦克风位置', ports.micX ?? -b.width * 0.2, ports.micStyle && ports.micStyle !== 'hole' ? speakerRowSpec(ports.micStyle).span : 1.4);
  if (ports.dualSpeaker) chkX('顶部扬声器位置', ports.topSpeakerX ?? b.width * 0.28, spSpan);
  if (ports.topMic) chkX('顶部麦克风位置', ports.topMicX ?? -b.width * 0.2, 1.4);
  // 背面装饰位置不能超出机身
  const br = design.branding;
  if (br) {
    if (Math.abs(br.logoX || 0) > b.width / 2 - 2 || Math.abs(br.logoY || 0) > b.length / 2 - 2) {
      issues.push({ level: 'error', text: '背面 Logo 位置超出机身范围。' });
    }
    if (Math.abs(br.textX || 0) > b.width / 2 - 2 || Math.abs(br.textY || 0) > b.length / 2 - 2) {
      issues.push({ level: 'error', text: '背面文字位置超出机身范围。' });
    }
  }
  // 折叠外屏：可选配置——竖向翻折无外屏仅提示（闭合状态功能受限），不再强制报错；
  // 幅面按「宽 = inch×11.8mm、高 = 宽×ratio（0=按结构默认）」实算，须装进闭合半区（单半 W×L 减边距）
  if (b.fold !== 'none') {
    const cs = b.coverScreen || {};
    const cv = cs.inch || 0;
    if (cs.notch === 'udc' && !design.parts.extras.includes('x_udc')) {
      issues.push({ level: 'error', text: '外屏屏下摄像头需要先解锁屏下摄像头技术。' });
    }
    if (b.fold === 'flip' && cv <= 0) issues.push({ level: 'warn', text: '竖向翻折机型未设计外屏，闭合状态下无法查看时间与通知。' });
    if (cv > 0) {
      const cw = cv * 11.8, ch = cw * (cs.ratio || (b.fold === 'flip' ? 1.05 : 1.42));
      if (cw > b.width - 6 || ch > b.length - 6) {
        issues.push({ level: 'warn', text: `外屏 ${cv}″ 超出闭合半区幅面，闭合后可能放不下。` });
      } else if (Math.abs(cs.x || 0) + cw / 2 > b.width / 2 - 1.5 || Math.abs(cs.y || 0) + ch / 2 > b.length / 2 - 1.5) {
        issues.push({ level: 'warn', text: '外屏位置偏移过大，超出闭合半区范围。' });
      }
    }
  }
  if (design.screen.inch > 9) issues.push({ level: 'warn', text: '屏幕尺寸超过 9 英寸，便携性极差。' });
  if (design.camera.count > 1 && year < 2016) issues.push({ level: 'warn', text: '多摄系统在当前年代成本过高、收益有限。' });
  if (d.thermal < 35) issues.push({ level: 'warn', text: `散热评分 ${d.thermal}，高负载下会明显降频。` });
  // 背部智窗：机身内 + 与摄像头模组避让
  if (design.backWindow?.on) {
    const bw = design.backWindow;
    const ww = (bw.inch || 1.8) * 11, wh = (bw.inch || 1.8) * 8;
    if (Math.abs(bw.cx || 0) + ww / 2 > b.width / 2 - 1 || Math.abs(bw.cy || 0) + wh / 2 > b.length / 2 - 1) {
      issues.push({ level: 'error', text: '背部智窗超出机身范围。' });
    }
    if (camR && Math.abs(bw.cx - camR.cx) < (ww + camR.w) / 2 && Math.abs(bw.cy - camR.cy) < (wh + camR.h) / 2) {
      issues.push({ level: 'error', text: '背部智窗与摄像头模组重叠，请移开智窗或模组。' });
    }
  }
  return { issues, derived: d, ok: !issues.some((i) => i.level === 'error') };
}

// 摄像头 deco 在背面坐标系的矩形（mm，原点=机身中心），供校验与 3D/2D 共用
// 尺寸优先用 deco.w/h（用户自定义），无 deco（旧档）按颗数与 modScale 推算
export function cameraModuleRect(design) {
  ensureLenses(design);
  const hasLenses = design.camera.lenses.length > 0;
  if (!hasLenses && !design.parts.ownCmr) {
    // 无镜头：老档位兼容（part 有 mp 时仍画单摄模组）
  }
  const cam = hasLenses ? null : (design.parts.ownCmr || CAMERAS.find((x) => x.id === design.camera.part));
  if (!hasLenses && (!cam || cam.mp <= 0)) return null;
  const b = design.body;
  const c = design.camera;
  const ms = c.modScale || 1;
  const n = Math.min(4, c.count || 1);
  let mw, mh;
  if (c.deco && c.deco.w) {
    mw = c.deco.w; mh = c.deco.h || c.deco.w;
  } else {
    mw = clamp((n <= 1 ? b.width * 0.27 : b.width * 0.44) * ms, 6, b.width - 6);
    mh = clamp((n <= 1 ? mw : Math.min(b.length * 0.26, 30)) * ms, 6, b.length * 0.7);
  }
  mw = clamp(mw, 6, b.width - 6);
  mh = clamp(mh, 6, b.length * 0.7);
  const offX = c.offX || 0, offY = c.offY || 0;
  const PX = { 'top-left': -1, 'top-center': 0, 'top-right': 1 }[c.pos || 'top-left'] ?? -1;
  const baseX = PX * (b.width / 2 - mw / 2 - 3);
  const baseY = b.length / 2 - mh / 2 - 3;
  const rawX = baseX + offX, rawY = baseY + offY;
  const cx = clamp(rawX, -b.width / 2 + mw / 2, b.width / 2 - mw / 2);
  const cy = clamp(rawY, -b.length / 2 + mh / 2, b.length / 2 - mh / 2);
  return {
    w: mw, h: mh, n, cx, cy,
    // raw 矩形用于越界校验，clamped 用于渲染
    x0: rawX - mw / 2, x1: rawX + mw / 2, y0: rawY - mh / 2, y1: rawY + mh / 2,
    shape: c.deco?.shape || 'rounded',
    radius: c.deco?.radius ?? 8,
  };
}

export function newModel(year, unlocked, name = '新机型') {
  return {
    id: 'p_' + Math.random().toString(36).slice(2, 9),
    name,
    design: defaultDesign(year, unlocked),
    status: 'draft',
    launched: null,
    released: false,
    heat: 0,
    lineup: 'main',
    price: {},
    inventory: 0,
    sold: 0,
    revenue: 0,
    quality: 70,
    rating: 0,
    hype: 0,
    markets: ['cn'],
    cost: 0,
    reviews: [],
    history: [],
  };
}

// ---------- 手机模板（形态世代） ----------
// 老档迁移：无 template 字段按年代/屏幕尺寸推断；键盘与 Home 键按模板归位
export function ensureTemplate(d, year = 2020) {
  if (!PHONE_TPL_MAP[d.template]) d.template = templateForYear(year);
  const T = PHONE_TPL_MAP[d.template];
  d.keypad = d.keypad || { kind: T.keypad.includes('none') ? 'none' : T.keypad[0], style: 'grid', scale: 1 };
  if (!T.keypad.includes(d.keypad.kind)) d.keypad.kind = T.keypad.includes('none') ? 'none' : T.keypad[0];
  if (!['grid', 'full'].includes(d.keypad.style)) d.keypad.style = 'grid';
  d.keypad.scale = clamp(Number(d.keypad.scale) || 1, 0.8, 1.3);
  if (T.home) { if (!T.home.includes(d.homeStyle)) d.homeStyle = T.home[0]; }
  else d.homeStyle = '';
  if (!T.notch.includes(d.screen.notch)) d.screen.notch = T.notch[0] || 'none';
  if (!T.screen.aspects.includes(d.screen.aspect)) d.screen.aspect = T.screen.aspects.includes(d.screen.aspect) ? d.screen.aspect : T.screen.aspects[0];
  // 中框轮廓：flat 直角 / arc 圆弧 / chamfer 45°切角 / bevel 2.5D 缓弧
  if (!['flat', 'arc', 'chamfer', 'bevel'].includes(d.body.frameType)) d.body.frameType = 'flat';
  // 中框轮廓：flat 直角 / arc 圆弧 / chamfer 45°切角 / bevel 2.5D 缓弧
  if (!['flat', 'arc', 'chamfer', 'bevel'].includes(d.body.frameType)) d.body.frameType = 'flat';
  // 背部智窗：字段幂等补齐（否则 setPath 写入会崩）
  d.backWindow = d.backWindow || {};
  if (typeof d.backWindow.on !== 'boolean') d.backWindow.on = false;
  if (!Number.isFinite(d.backWindow.inch)) d.backWindow.inch = 1.8;
  if (!Number.isFinite(d.backWindow.cx)) d.backWindow.cx = 0;
  if (!Number.isFinite(d.backWindow.cy)) d.backWindow.cy = -18;
  // 配置版本：独立定价（v.price 按市场存绝对值）；老档 priceMul 迁移为等效价格
  if (Array.isArray(d.variants)) {
    for (const v of d.variants) {
      if (v && !v.price) v.price = {};
      if (v && !v.uid) v.uid = 'v' + Math.random().toString(36).slice(2, 8);
    }
  }
  // 听筒：宽度/粗细/纵向偏移/形状（slot 胶囊 / rounded 圆角矩形）
  d.earpiece = d.earpiece || {};
  if (!Number.isFinite(d.earpiece.w)) d.earpiece.w = 8;
  if (!Number.isFinite(d.earpiece.h)) d.earpiece.h = 1.1;
  if (!Number.isFinite(d.earpiece.y)) d.earpiece.y = 0;
  if (!['slot', 'rounded'].includes(d.earpiece.shape)) d.earpiece.shape = 'rounded';
  return d;
}
