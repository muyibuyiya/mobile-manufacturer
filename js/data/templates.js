// 手机模板（形态世代）：直板按键机 → 触摸屏+按键 → 触摸屏+功能键 → 全面屏
// 每个世代决定设计器中可用板块：屏幕比例/尺寸上限/开孔/键盘/Home 键/折叠/附加功能
// 依据真实产业史：
//   1980-2003 功能机（诺基亚 3210/3310：单色/彩屏 + T9 键盘，屏幕 1~2.5″，4:3 类比例）
//   2004-2006 过渡期（诺基亚 N 系滑盖、Windows Mobile 触屏 + 键盘并存）
//   2007-2016 全触屏（iPhone 2007：电容触屏 + Home 键；安卓触控键 → 屏上键）
//   2017+    全面屏（18:9~21:9、刘海/挖孔/屏下、手势导航）
export const PHONE_TEMPLATES = [
  {
    id: 'bar_keypad', name: '直板按键机', from: 1980,
    desc: '小屏幕 + 导航簇 + 数字键盘（功能机）；无触摸、无开孔、厚边框。屏幕上限与键盘类型随年代演进。',
    screen: { maxInch: 3.2, presetInch: 2.0, presetBezel: 4, inchByYear: [[1980, 1.8], [1997, 2.5], [2005, 3.2]], aspects: ['4:3', '1:1', '5:4', '5:3'], frac: 0.4, cornerMax: 0 },
    body: { length: 118, width: 48, thickness: 19, corner: 4 },
    keypad: ['t9', 'qwerty'], keypadFrom: { t9: 1980, qwerty: 2004 },
    home: null, notch: ['none'], fold: false,
    extras: ['x_wp', 'x_wifi', 'x_bt', 'x_gps', 'x_nfc', 'x_esim', 'x_wifi6', 'x_uwb', 'x_mm', 'x_satd'],
  },
  {
    id: 'touch_keypad', name: '触摸屏 + 按键', from: 2004,
    desc: '触摸屏与数字键盘并存的过渡形态；屏幕中等、仍带实体键盘。',
    screen: { maxInch: 4.5, presetInch: 3.2, presetBezel: 3.2, inchByYear: [[2004, 2.8], [2008, 3.5]], aspects: ['4:3', '5:3', '3:2', '16:9'], frac: 0.56, cornerMax: 2 },
    body: { length: 112, width: 50, thickness: 14, corner: 5 },
    keypad: ['t9', 'qwerty', 'none'], keypadFrom: { t9: 1980, qwerty: 2004, none: 1980 },
    home: null, notch: ['none', 'punch'], fold: false,
    extras: ['x_wp', 'x_wl', 'x_wifi', 'x_bt', 'x_gps', 'x_nfc', 'x_esim', 'x_wifi6', 'x_uwb', 'x_mm', 'x_satd'],
  },
  {
    id: 'touch_full', name: '触摸屏 + 功能键', from: 2007,
    desc: '全触屏 + Home 键 / 功能键，智能机黄金时代；正面仅听筒开孔。',
    screen: { maxInch: 7.0, presetInch: 4.0, presetBezel: 3, aspects: ['16:9', '3:2', '4:3'], frac: 0.84, cornerMax: 5 },
    body: { length: 124, width: 62, thickness: 10.5, corner: 6 },
    keypad: ['none'], home: ['circle', 'pill'], notch: ['none', 'punch'], fold: false,
    extras: ['x_fp', 'x_face', 'x_wp', 'x_wl', 'x_fc', 'x_vc', 'x_sec', 'x_wifi', 'x_bt', 'x_gps', 'x_nfc', 'x_esim', 'x_wifi6', 'x_uwb', 'x_mm', 'x_satd'],
  },
  {
    id: 'full_screen', name: '全面屏', from: 2017,
    desc: '18:9+ 高屏占比；刘海 / 挖孔 / 升降 / 屏下开孔；手势导航无 Home 键。',
    screen: { maxInch: 8.2, presetInch: 6.5, presetBezel: 1.8, aspects: ['19.5:9', '16:9', '21:9', '自由'], frac: 0.97, cornerMax: 14 },
    body: { length: 158, width: 73, thickness: 8.2, corner: 9 },
    keypad: ['none'], home: null, notch: ['none', 'punch', 'notch', 'waterdrop', 'popup'], fold: true,
    extras: ['x_fp', 'x_face', 'x_wp', 'x_wl', 'x_fc', 'x_udc', 'x_vc', 'x_sat', 'x_sec', 'x_wifi', 'x_bt', 'x_gps', 'x_nfc', 'x_esim', 'x_wifi6', 'x_uwb', 'x_mm', 'x_satd'],
  },
  {
    id: 'tablet', name: '平板', from: 2010,
    desc: '大屏触控平板：4:3 / 3:2 / 16:9 屏幕、无键盘、窄边框；摄像头与电池按平板尺寸适配。',
    screen: { maxInch: 15, presetInch: 11, presetBezel: 4, aspects: ['4:3', '3:2', '16:9'], frac: 0.9, cornerMax: 10 },
    body: { length: 250, width: 188, thickness: 7.6, corner: 8 },
    keypad: ['none'], home: null, notch: ['none', 'punch'], fold: false,
    extras: ['x_fp', 'x_face', 'x_wp', 'x_wl', 'x_fc', 'x_vc', 'x_sec', 'x_wifi', 'x_bt', 'x_gps', 'x_nfc', 'x_esim', 'x_wifi6', 'x_uwb', 'x_mm', 'x_satd'],
  },
  {
    id: 'watch_round', name: '智能手表（圆表）', from: 2015,
    desc: '只设计表体：圆形表盘、无键盘、无摄像头；屏幕 1:1，圆角自动贴合表体。',
    screen: { maxInch: 2.2, presetInch: 1.5, presetBezel: 1.4, aspects: ['1:1'], frac: 0.8, cornerMax: 24 },
    body: { length: 46, width: 46, thickness: 11, corner: 22.5 },
    keypad: ['none'], home: null, notch: ['none'], fold: false,
    extras: ['x_wp', 'x_face', 'x_sec'],
  },
  {
    id: 'watch_square', name: '智能手表（方表）', from: 2015,
    desc: '只设计表体：方形表盘、无键盘、无摄像头；可调表体圆角在方表与圆表之间过渡。',
    screen: { maxInch: 2.2, presetInch: 1.6, presetBezel: 1.4, aspects: ['1:1'], frac: 0.82, cornerMax: 8 },
    body: { length: 42, width: 42, thickness: 10.5, corner: 4 },
    keypad: ['none'], home: null, notch: ['none'], fold: false,
    extras: ['x_wp', 'x_face', 'x_sec'],
  },
];

export const PHONE_TPL_MAP = Object.fromEntries(PHONE_TEMPLATES.map((t) => [t.id, t]));

export const DEVICE_CATEGORIES = [
  { id: 'phone', name: '手机', desc: '从按键机到折叠全面屏，完整手机产品线。' },
  { id: 'tablet', name: '平板', desc: '只设计平板形态：4:3 / 3:2 / 16:9 大屏，无键盘与折叠。' },
  { id: 'watch', name: '智能手表', desc: '只设计表体：圆表或方表，不做表带与后置摄像头。' },
];

export function categoryOfTemplate(id) {
  const t = String(id || '');
  return t === 'tablet' ? 'tablet' : t.startsWith('watch') ? 'watch' : 'phone';
}

export function templatesForCategory(cat) {
  return PHONE_TEMPLATES.filter((t) => categoryOfTemplate(t.id) === cat);
}

export function defaultTemplateForCategory(cat, year, current) {
  if (cat === 'tablet') return 'tablet';
  if (cat === 'watch') return current === 'watch_square' ? 'watch_square' : 'watch_round';
  return templateForYear(year);
}

// 按年份取默认形态
export function templateForYear(year) {
  return year >= 2017 ? 'full_screen' : year >= 2007 ? 'touch_full' : year >= 2004 ? 'touch_keypad' : 'bar_keypad';
}

// 年代差异化：同世代内，屏幕上限与键盘类型随年份解锁
export function tplCaps(t, year) {
  let maxInch = null;
  for (const [y, cap] of (t.screen.inchByYear || [])) if (year >= y) maxInch = cap;
  if (maxInch === null) maxInch = t.screen.maxInch;
  const keypad = (t.keypad || []).filter((k) => year >= ((t.keypadFrom || {})[k] ?? t.from));
  return { ...t, screen: { ...t.screen, maxInch }, keypad: keypad.length ? keypad : t.keypad.slice(0, 1) };
}
