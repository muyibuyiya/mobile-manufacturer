// OS 主题商店（v1.9.0）
// 把屏幕设计页的方案变成可运营的 OS 主题：影响流行度、授权与主题商店收入。
import { clamp } from './util.js';
import { addLog } from './state.js';

export function ensureTheme(state) {
  if (!Array.isArray(state.uiDesigns)) state.uiDesigns = [];
  if (!state.osThemeUid && state.uiDesigns[0]) state.osThemeUid = state.uiDesigns[0].uid;
  if (state.osThemeUid && !state.uiDesigns.some((d) => d.uid === state.osThemeUid)) {
    state.osThemeUid = state.uiDesigns[0]?.uid || '';
  }
  return state.osThemeUid;
}

export function themeScore(design) {
  if (!design) return 0;
  const device = design.deviceType || 'phone';
  let s = 30;
  if (design.wallpaper) s += 22;
  else s += 6;
  if (design.lockWallpaper) s += 10;
  if (design.lockShowTime !== false) s += 3;
  if (design.lockShowDate !== false) s += 3;
  if (design.lockShowNotif !== false) s += 4;
  if (device === 'watch') {
    if (design.watchShowDate !== false) s += 5;
    if (design.watchShowComplications !== false) s += 6;
    if (design.watchBattery !== false) s += 3;
    if (design.watchSteps !== false) s += 3;
    if (design.watchLayout === 'list' || design.watchLayout === 'grid') s += 4;
  } else {
    if (design.navStyle === 'gesture') s += 4;
    else if (design.navStyle === 'buttons') s += 2;
    if ((design.dockCount || 0) >= (device === 'tablet' ? 5 : 4)) s += 6;
    if ((design.cols || 4) >= (device === 'tablet' ? 5 : 3)) s += 4;
    if ((design.rows || 4) >= (device === 'tablet' ? 4 : 4)) s += 4;
    if (design.tabletSplit && device === 'tablet') s += 6;
  }
  if (design.gestureH && design.gestureH > 3) s += 2;
  if (design.carrier) s += 2;
  return Math.round(clamp(s, 0, 100));
}

export function themeOf(state) {
  const uid = ensureTheme(state);
  return (state.uiDesigns || []).find((d) => d.uid === uid) || null;
}

export function themeBonus(state) {
  const d = themeOf(state);
  const score = d ? themeScore(d) : 0;
  return {
    design: d,
    score,
    popGrowth: score / 100 * 0.1,
    popCap: score / 100 * 3,
    licRate: score / 100 * 0.06,
    revenuePerInstall: score / 100 * 1.2,
  };
}

export function themeRevenue(state, installBase, era = 1) {
  const b = themeBonus(state);
  if (!b.design || !installBase) return 0;
  return Math.round(installBase * b.revenuePerInstall * era);
}

export function selectTheme(state, uid) {
  ensureTheme(state);
  const d = (state.uiDesigns || []).find((x) => x.uid === uid);
  if (!d) return { ok: false, msg: '找不到该主题' };
  state.osThemeUid = uid;
  addLog(state, 'tech', `OS 主题切换为「${d.name || '未命名'}」，主题评分 ${themeScore(d)}。`);
  return { ok: true, design: d, score: themeScore(d) };
}

export function themeSummary(state) {
  ensureTheme(state);
  return (state.uiDesigns || []).map((d) => ({
    design: d,
    uid: d.uid,
    name: d.name || '未命名主题',
    deviceType: d.deviceType || 'phone',
    deviceLabel: (d.deviceType || 'phone') === 'tablet' ? '平板' : (d.deviceType === 'watch' ? '手表' : '手机'),
    score: themeScore(d),
    active: d.uid === state.osThemeUid,
    hasWallpaper: !!d.wallpaper,
    hasLock: !!d.lockWallpaper,
  }));
}