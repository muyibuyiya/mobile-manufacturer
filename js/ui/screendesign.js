// 屏幕设计独立页（v1.8.0）：桌面 + 锁屏双画面设计
// 壁纸导入/裁剪 + 状态栏 + 导航键 + Dock + 锁屏通知，多方案保存
// 编辑使用草稿副本：保存/完成才写回 state，不保存退出不留痕迹
import { autoSave } from '../core/state.js';

const ICON_COLORS = ['#3a7bd5', '#e0533d', '#2fb37a', '#f2b134', '#8b5cf6', '#22a8c9', '#e8548a', '#5b6b7f'];

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function escAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 旧方案幂等补齐新字段
function normalizeDesign(d) {
  if (!d || typeof d !== 'object') return d;
  if (d.canvasW === undefined) d.canvasW = 1080;
  if (d.canvasH === undefined) d.canvasH = Math.round(d.canvasW * 19.5 / 9);
  if (!d.deviceType) d.deviceType = d.canvasH / d.canvasW < 1.05 ? (d.canvasH / d.canvasW < 0.9 ? 'tablet' : 'watch') : 'phone';
  if (d.watchShape === undefined) d.watchShape = 'round';
  if (d.watchLayout === undefined) d.watchLayout = 'grid';
  if (d.watchShowDate === undefined) d.watchShowDate = true;
  if (d.watchShowComplications === undefined) d.watchShowComplications = true;
  if (d.watchBattery === undefined) d.watchBattery = true;
  if (d.watchSteps === undefined) d.watchSteps = true;
  if (d.tabletSplit === undefined) d.tabletSplit = false;
  if (d.tabletDock === undefined) d.tabletDock = true;
  if (d.lockAspect === undefined) d.lockAspect = true;
  if (d.navDir === undefined) d.navDir = 'ltr';
  if (d.gestureW === undefined) d.gestureW = 28;
  if (d.gestureH === undefined) d.gestureH = 2.4;
  if (d.batteryDY === undefined) d.batteryDY = 0.9;
  if (d.lockWallpaper === undefined) d.lockWallpaper = '';
  if (d.lockWallColor === undefined) d.lockWallColor = '#141c33';
  if (d.lockShowTime === undefined) d.lockShowTime = true;
  if (d.lockShowDate === undefined) d.lockShowDate = true;
  if (d.lockShowNotif === undefined) d.lockShowNotif = true;
  return d;
}

// 底部导航区占用的高度：Dock 需整体上抬避让
function navReserve(H, d) {
  if (d.navStyle === 'buttons') return H * 0.052;
  if (d.navStyle === 'gesture') return H * 0.046;
  return H * 0.01;
}
function dockGeom(W, H, d) {
  const dockH = H * 0.095;
  const dockY = H - navReserve(H, d) - H * 0.012 - dockH;
  return { dockY, dockH };
}

export function openScreenDesign(mount, state, { onClose, onToast }) {
  // 草稿副本：所有编辑先落在 draft，保存/完成才提交到 state
  const draft = JSON.parse(JSON.stringify(state.uiDesigns || []));
  let active = draft[0] || null;
  let dirty = false;
  let previewMode = 'home';
  let sdTab = 'controls';
  let zoomMode = 'fit';
  const undoStack = [];
  const redoStack = [];
  let lastUndoAt = 0;
  let restoring = false;
  let onChangedCb = null;
  let dead = false;

  // ---------- DOM ----------
  const overlay = document.createElement('div');
  overlay.dataset.pauseGame = '1';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:70;background:rgba(6,9,14,.97);display:flex;flex-direction:column';
  overlay.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid #232e3d;flex-wrap:wrap">
      <b style="font-size:15px">屏幕设计</b>
      <span class="tiny dim">桌面 + 锁屏 · 保存后在设计器屏幕区选用</span>
      <span class="tiny" data-sd="status" style="color:#f2b134">未保存</span>
      <div class="speed-group" style="background:#0d1219">
        <button class="btn small on" data-sd="preview" data-v="home">桌面</button>
        <button class="btn small" data-sd="preview" data-v="lock">锁屏</button>
      </div>
      <div class="speed-group" style="background:#0d1219">
        <button class="btn small on" data-sd="zoom" data-v="fit">适应</button>
        <button class="btn small" data-sd="zoom" data-v="50">50%</button>
        <button class="btn small" data-sd="zoom" data-v="75">75%</button>
        <button class="btn small" data-sd="zoom" data-v="100">100%</button>
      </div>
      <button class="btn small ghost" data-sd="undo" title="撤销 Ctrl+Z">撤销</button>
      <button class="btn small ghost" data-sd="redo" title="重做 Ctrl+Shift+Z">重做</button>
      <div style="flex:1"></div>
      <button class="btn small ghost" data-sd="discard">不保存退出</button>
      <button class="btn small" data-sd="save">保存</button>
      <button class="btn small primary" data-sd="done">完成</button>
    </div>
    <div style="flex:1;display:flex;min-height:0">
      <div style="width:340px;flex-shrink:0;padding:10px 14px;border-right:1px solid #232e3d;overflow-y:auto" data-sd="controls"></div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;min-width:0" id="sd-preview-wrap" data-sd="preview-wrap">
        <canvas data-sd="cv" style="border-radius:18px;box-shadow:0 8px 40px rgba(0,0,0,.5)"></canvas>
      </div>
    </div>`;
  mount.appendChild(overlay);
  const cv = overlay.querySelector('[data-sd=cv]');
  const ctx = cv.getContext('2d');
  const controlsEl = overlay.querySelector('[data-sd=controls]');
  const statusEl = overlay.querySelector('[data-sd=status]');

  // ---------- 编辑逻辑 ----------
  function pushUndo() {
    if (restoring) return;
    const now = Date.now();
    if (now - lastUndoAt < 280) return;
    lastUndoAt = now;
    undoStack.push(JSON.parse(JSON.stringify(active)));
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  }
  function applySnap(snap) {
    restoring = true;
    for (const k of Object.keys(active)) delete active[k];
    Object.assign(active, JSON.parse(JSON.stringify(snap)));
    restoring = false;
    markDirty();
    renderControls(); draw();
  }
  function undoDesign() {
    if (!undoStack.length) return;
    redoStack.push(JSON.parse(JSON.stringify(active)));
    applySnap(undoStack.pop());
  }
  function redoDesign() {
    if (!redoStack.length) return;
    undoStack.push(JSON.parse(JSON.stringify(active)));
    applySnap(redoStack.pop());
  }
  function newDesign(name) {
    return {
      uid: 'ui' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), name,
      wallpaper: '', wallColor: '#0a1020',
      carrier: '5G', showTime: true, showBattery: true, showSignal: true,
      navStyle: 'gesture', navDir: 'ltr', gestureW: 28, gestureH: 2.4, batteryDY: 0.9,
      dockCount: 4, cols: 4, rows: 5,
      canvasW: 1080, canvasH: 2340, lockAspect: true,
      lockWallpaper: '', lockWallColor: '#141c33', lockShowTime: true, lockShowDate: true, lockShowNotif: true,
      deviceType: 'phone', watchShape: 'round', watchLayout: 'grid', watchShowDate: true,
      watchShowComplications: true, watchBattery: true, watchSteps: true, tabletSplit: false, tabletDock: true,
    };
  }
  function ensureActive() {
    if (!active) { active = newDesign('默认 UI'); draft.push(active); dirty = true; }
    normalizeDesign(active);
  }
  function markDirty() {
    dirty = true;
    updateStatus();
  }
  function updateStatus() {
    if (!statusEl) return;
    statusEl.textContent = dirty ? '未保存' : '已保存';
    statusEl.style.color = dirty ? '#f2b134' : '#2fb37a';
  }

  function wallpaperButton(kind) {
    const wp = kind === 'lock' ? active.lockWallpaper : active.wallpaper;
    const importAct = kind === 'lock' ? 'lock-import' : 'import';
    const clearAct = kind === 'lock' ? 'lock-clear' : 'clear-wp';
    return `<div class="row" style="gap:5px;margin-bottom:6px">
        <button class="btn small" data-sd="${importAct}">📁 导入图片</button>
        <button class="btn small ghost" data-sd="${clearAct}">清除</button>
      </div>
      ${wp
        ? `<img data-sd="wp-thumb" src="${wp}" style="width:80px;height:140px;object-fit:cover;border-radius:6px;border:1px solid #2a3546" />`
        : `<div style="width:80px;height:140px;border-radius:6px;border:1px dashed #2a3546;display:flex;align-items:center;justify-content:center" class="tiny dim">无壁纸</div>`}`;
  }

  function renderControls() {
    ensureActive();
    const designs = draft.map((d, i) => `<option value="${i}" ${d === active ? 'selected' : ''}>${escAttr(d.name)}</option>`).join('');
    const isGesture = active.navStyle === 'gesture';
    const ratios = active.deviceType === 'watch'
      ? [['1:1', 1]]
      : active.deviceType === 'tablet'
        ? [['16:10', 16 / 10], ['4:3', 4 / 3], ['3:2', 3 / 2], ['16:9', 16 / 9]]
        : [['16:9', 16 / 9], ['19.5:9', 19.5 / 9], ['21:9', 21 / 9], ['4:3', 4 / 3], ['1:1', 1]];
    controlsEl.innerHTML = `
      <div class="field"><span>方案</span>
        <div class="row" style="gap:5px">
          <select data-sd="sel" style="flex:1">${designs}</select>
          <button class="btn tiny" data-sd="new">＋</button>
          ${draft.length > 1 ? '<button class="btn tiny ghost" data-sd="del">✕</button>' : ''}
        </div>
      </div>
      <div class="field"><span>方案名称</span>
        <input type="text" data-sd="name" value="${escAttr(active.name)}" maxlength="14" style="width:100%" />
      </div>
      <div class="field"><span>设备类型</span>
        <div class="row" style="gap:5px">
          ${[['phone', '手机'], ['tablet', '平板'], ['watch', '手表']].map(([v, n]) => `<button class="btn tiny ${active.deviceType === v ? 'primary' : ''}" data-sd="type" data-v="${v}">${n}</button>`).join('')}
        </div>
      </div>
      <div class="sd-tabs">
        ${[['look', '外观'], ['controls', '控件'], ['canvas', '画布']].map(([v, n]) => `<button class="btn tiny ${sdTab === v ? 'primary' : ''}" data-sd="tab" data-v="${v}">${n}</button>`).join('')}
      </div>
      <div data-sdt="controls" data-sdsec="watch" class="${sdTab === 'controls' ? 'on' : ''}">
      ${active.deviceType === 'watch' ? `
      <div class="section-label">手表表盘</div>
      <div class="row" style="gap:5px;flex-wrap:wrap">
        ${[['round', '圆形'], ['square', '方形']].map(([v, n]) => `<button class="btn tiny ${active.watchShape === v ? 'primary' : ''}" data-sd="watch-shape" data-v="${v}">${n}</button>`).join('')}
        ${[['grid', '网格'], ['list', '列表']].map(([v, n]) => `<button class="btn tiny ${active.watchLayout === v ? 'primary' : ''}" data-sd="watch-layout" data-v="${v}">${n}</button>`).join('')}
      </div>
      <div class="row" style="gap:5px;flex-wrap:wrap;margin-top:6px">
        <label class="form-check" style="margin:0"><input type="checkbox" class="form-check-input" data-sd="watchShowDate" ${active.watchShowDate ? 'checked' : ''} /><span class="form-check-label tiny">日期</span></label>
        <label class="form-check" style="margin:0"><input type="checkbox" class="form-check-input" data-sd="watchShowComplications" ${active.watchShowComplications ? 'checked' : ''} /><span class="form-check-label tiny">复杂功能</span></label>
        <label class="form-check" style="margin:0"><input type="checkbox" class="form-check-input" data-sd="watchBattery" ${active.watchBattery ? 'checked' : ''} /><span class="form-check-label tiny">电量</span></label>
        <label class="form-check" style="margin:0"><input type="checkbox" class="form-check-input" data-sd="watchSteps" ${active.watchSteps ? 'checked' : ''} /><span class="form-check-label tiny">步数</span></label>
      </div>` : ''}
      ${active.deviceType === 'tablet' ? `
      <div class="section-label">平板布局</div>
      <label class="form-check" style="margin:0 0 6px"><input type="checkbox" class="form-check-input" data-sd="tabletSplit" ${active.tabletSplit ? 'checked' : ''} /><span class="form-check-label tiny">分屏桌面（双应用面板）</span></label>
        <label class="form-check" style="margin:0 0 6px"><input type="checkbox" class="form-check-input" data-sd="tabletDock" ${active.tabletDock !== false ? 'checked' : ''} /><span class="form-check-label tiny">底部任务栏（Dock）</span></label>` : ''}
      </div>
      <div data-sdt="look" data-sdsec="wallpaper" class="${sdTab === 'look' ? 'on' : ''}">
      <div class="section-label">桌面壁纸</div>
      ${wallpaperButton('home')}
      <label class="field"><span>底色（无壁纸时）</span>
        <input type="color" data-sd="wall-color" value="${active.wallColor || '#0a1020'}" style="width:44px;height:26px;padding:1px" />
      </label>
      <div class="section-label">锁屏画面</div>
      ${wallpaperButton('lock')}
      <label class="field"><span>锁屏底色（无壁纸时）</span>
        <input type="color" data-sd="lock-wall-color" value="${active.lockWallColor || '#141c33'}" style="width:44px;height:26px;padding:1px" />
      </label>
      <div class="row" style="gap:5px;flex-wrap:wrap;margin-bottom:6px">
        <label class="form-check" style="margin:0"><input type="checkbox" class="form-check-input" data-sd="lockShowTime" ${active.lockShowTime ? 'checked' : ''} /><span class="form-check-label tiny">时间</span></label>
        <label class="form-check" style="margin:0"><input type="checkbox" class="form-check-input" data-sd="lockShowDate" ${active.lockShowDate ? 'checked' : ''} /><span class="form-check-label tiny">日期</span></label>
        <label class="form-check" style="margin:0"><input type="checkbox" class="form-check-input" data-sd="lockShowNotif" ${active.lockShowNotif ? 'checked' : ''} /><span class="form-check-label tiny">通知</span></label>
      </div>
      </div>
      <div data-sdt="controls" data-sdsec="status" class="${sdTab === 'controls' ? 'on' : ''}">
      <div class="section-label">状态栏</div>
      <div class="row" style="gap:5px;flex-wrap:wrap">
        <label class="form-check" style="margin:0"><input type="checkbox" class="form-check-input" data-sd="showTime" ${active.showTime ? 'checked' : ''} /><span class="form-check-label tiny">时间</span></label>
        <label class="form-check" style="margin:0"><input type="checkbox" class="form-check-input" data-sd="showSignal" ${active.showSignal ? 'checked' : ''} /><span class="form-check-label tiny">信号</span></label>
        <label class="form-check" style="margin:0"><input type="checkbox" class="form-check-input" data-sd="showBattery" ${active.showBattery ? 'checked' : ''} /><span class="form-check-label tiny">电量</span></label>
      </div>
      <label class="field" style="margin-top:6px"><span>运营商文字</span>
        <input type="text" data-sd="carrier" value="${escAttr(active.carrier)}" maxlength="6" style="width:100%" />
      </label>
      <label class="field" style="margin-top:2px"><span>电池纵向位置</span>
        <div class="row" style="gap:6px;align-items:center">
          <input type="range" data-sd="batteryDY" min="-2" max="4" step="0.2" value="${num(active.batteryDY, 0.9)}" style="flex:1" />
          <span class="tiny dim" data-sd="batteryDY-v" style="width:36px;text-align:right">${num(active.batteryDY, 0.9).toFixed(1)}u</span>
        </div>
      </label>
      </div>
      <div data-sdt="controls" data-sdsec="nav" class="${sdTab === 'controls' ? 'on' : ''}">
      <div class="section-label">导航键</div>
      <div class="row" style="gap:5px;flex-wrap:wrap">
        ${[['gesture', '手势横条'], ['buttons', '三大键'], ['none', '无']].map(([v, n]) => `<button class="btn tiny ${active.navStyle === v ? 'primary' : ''}" data-sd="nav" data-v="${v}">${n}</button>`).join('')}
      </div>
      ${active.navStyle === 'buttons' ? `
        <div class="row" style="gap:5px;align-items:center;margin-top:6px">
          <span class="tiny dim">方向</span>
          <button class="btn tiny ${active.navDir !== 'rtl' ? 'primary' : ''}" data-sd="navdir" data-v="ltr">◁ ○ □</button>
          <button class="btn tiny ${active.navDir === 'rtl' ? 'primary' : ''}" data-sd="navdir" data-v="rtl">□ ○ ▷</button>
        </div>` : ''}
      ${active.navStyle === 'gesture' ? `
        <label class="field" style="margin-top:6px${isGesture ? '' : ';opacity:.5'}"><span>横条长度</span>
          <div class="row" style="gap:6px;align-items:center">
            <input type="range" data-sd="gestureW" min="10" max="50" step="1" value="${clamp(num(active.gestureW, 28), 10, 50)}" style="flex:1" />
            <span class="tiny dim" data-sd="gestureW-v" style="width:36px;text-align:right">${clamp(num(active.gestureW, 28), 10, 50)}%</span>
          </div>
        </label>
        <label class="field"><span>横条粗细</span>
          <div class="row" style="gap:6px;align-items:center">
            <input type="range" data-sd="gestureH" min="1" max="6" step="0.2" value="${clamp(num(active.gestureH, 2.4), 1, 6)}" style="flex:1" />
            <span class="tiny dim" data-sd="gestureH-v" style="width:36px;text-align:right">${clamp(num(active.gestureH, 2.4), 1, 6).toFixed(1)}u</span>
          </div>
        </label>` : ''}
      </div>
      ${active.deviceType === 'phone' ? `
      <div data-sdt="controls" data-sdsec="dock" class="${sdTab === 'controls' ? 'on' : ''}">
      <div class="section-label">Dock 栏</div>
      <div class="row" style="gap:5px;align-items:center">
        <span class="tiny dim">应用数</span>
        ${[0, 3, 4, 5].map((n) => `<button class="btn tiny ${active.dockCount === n ? 'primary' : ''}" data-sd="dock" data-v="${n}">${n || '无'}</button>`).join('')}
      </div>
      <div class="tiny dim" style="margin:4px 0 6px">有导航键/手势条时 Dock 会自动上抬避让</div>` : ''}
      </div>
      <div data-sdt="canvas" data-sdsec="canvas" class="${sdTab === 'canvas' ? 'on' : ''}">
      <div class="section-label">画布</div>
      <div class="row" style="gap:5px;flex-wrap:wrap;margin-bottom:6px">
        ${ratios.map(([n, r]) => {
          const cur = Math.abs(active.canvasH / active.canvasW - r) < 0.01;
          return `<button class="btn tiny ${cur ? 'primary' : ''}" data-sd="ratio" data-v="${r}">${n}</button>`;
        }).join('')}
      </div>
      <label class="form-check" style="margin:0 0 6px"><input type="checkbox" class="form-check-input" data-sd="lock" ${active.lockAspect ? 'checked' : ''} /><span class="form-check-label tiny">锁定比例（改宽自动算高）</span></label>
      <div class="row" style="gap:6px;align-items:center">
        <span class="tiny dim" style="width:52px">宽</span>
        <input type="number" data-sd="canvas-w" value="${active.canvasW}" min="240" max="2160" step="10" style="width:80px" />
        <span class="tiny dim">高</span>
        <input type="number" data-sd="canvas-h" value="${active.canvasH}" min="240" max="4680" step="10" style="width:80px" />
      </div>
      <div class="tiny dim" style="margin:4px 0 6px">设计分辨率（预览按窗口缩放显示）；壁纸导入按此比例裁切</div>
      </div>
      <div data-sdt="controls" data-sdsec="grid" class="${sdTab === 'controls' ? 'on' : ''}">
      <div class="section-label">桌面网格</div>
      <div class="row" style="gap:8px;align-items:center">
        <span class="tiny dim">列</span>${[3, 4, 5].map((n) => `<button class="btn tiny ${active.cols === n ? 'primary' : ''}" data-sd="cols" data-v="${n}">${n}</button>`).join('')}
        <span class="tiny dim" style="margin-left:8px">行</span>${[4, 5, 6].map((n) => `<button class="btn tiny ${active.rows === n ? 'primary' : ''}" data-sd="rows" data-v="${n}">${n}</button>`).join('')}
      </div>
      </div>
      <input type="file" accept="image/*" data-sd="file" style="display:none" />
      <input type="file" accept="image/*" data-sd="lock-file" style="display:none" />`;
    overlay.querySelectorAll('[data-sd="preview"]').forEach((b) => b.classList.toggle('on', b.dataset.v === previewMode));
    overlay.querySelectorAll('[data-sd="preview"]').forEach((b) => b.classList.toggle('primary', b.dataset.v === previewMode));
    overlay.querySelectorAll('[data-sd="zoom"]').forEach((b) => b.classList.toggle('on', b.dataset.v === zoomMode));
    overlay.querySelectorAll('[data-sd="zoom"]').forEach((b) => b.classList.toggle('primary', b.dataset.v === zoomMode));
    updateStatus();
  }

  // ---------- 合成渲染（与共享管线保持一致） ----------
  function compose(c) {
    ensureActive();
    const W = active.canvasW || 1080;
    const H = active.canvasH || Math.round(W * 19.5 / 9);
    const isLock = previewMode === 'lock';
    const wp = isLock ? active.lockWallpaper : active.wallpaper;
    const color = isLock ? (active.lockWallColor || '#141c33') : (active.wallColor || '#0a1020');
    const finish = () => {
      if (active.deviceType === 'watch') {
        if (isLock) drawWatchLock(c, W, H, active);
        else drawWatchHome(c, W, H, active);
      } else if (active.deviceType === 'tablet' && !isLock) {
        drawTabletHome(c, W, H, active);
      } else if (isLock) drawLockOverlays(c, W, H, active);
      else drawHomeOverlays(c, W, H, active);
    };
    if (wp) {
      const img = new Image();
      img.onload = () => {
        if (dead || previewMode !== (isLock ? 'lock' : 'home')) return;
        c.drawImage(img, 0, 0, W, H);
        finish();
      };
      img.src = wp;
      return;
    }
    const g = c.createLinearGradient(0, 0, 0, H);
    try { g.addColorStop(0, color); g.addColorStop(1, '#05070c'); } catch (e) { g.addColorStop(1, '#05070c'); }
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    finish();
  }

  function draw() {
    ensureActive();
    const wrap = overlay.querySelector('[data-sd=preview-wrap]');
    const W = active.canvasW || 1080;
    const H = active.canvasH || Math.round(W * 19.5 / 9);
    const ratio = H / W;
    const maxH = wrap.clientHeight - 20;
    const maxW = wrap.clientWidth - 20;
    let pw, ph;
    if (zoomMode === 'fit') {
      pw = maxW; ph = pw * ratio;
      if (ph > maxH) { ph = maxH; pw = ph / ratio; }
    } else {
      const z = Number(zoomMode) / 100;
      pw = W * z; ph = H * z;
    }
    cv.style.width = pw + 'px'; cv.style.height = ph + 'px';
    const watchRound = active.deviceType === 'watch' && active.watchShape === 'round';
    cv.style.borderRadius = active.deviceType === 'watch' ? (watchRound ? '50%' : '38px') : active.deviceType === 'tablet' ? '16px' : '26px';
    cv.style.border = active.deviceType === 'watch'
      ? '7px solid #1a1f28'
      : active.deviceType === 'tablet' ? '10px solid #121820' : '8px solid #121820';
    cv.style.boxShadow = '0 10px 44px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.06)';
    cv.width = W; cv.height = H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    compose(ctx);
  }

  // ---------- 导入壁纸（桌面/锁屏共用） ----------
  function importWallpaper(file, key) {
    if (!file) return;
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      const ratio2 = (active.canvasH || 2340) / (active.canvasW || 1080);
      let tw = Math.min(active.canvasW || 1080, 720);
      let th = Math.round(tw * ratio2);
      while (tw * th > 1300000) { tw = Math.round(tw * 0.9); th = Math.round(tw * ratio2); }
      const c = document.createElement('canvas');
      c.width = tw; c.height = th;
      const cctx = c.getContext('2d');
      const s = Math.max(tw / img.width, th / img.height);
      const dw = img.width * s, dh = img.height * s;
      cctx.drawImage(img, (tw - dw) / 2, (th - dh) / 2, dw, dh);
      try {
        active[key] = c.toDataURL('image/jpeg', 0.82);
      } catch (e) {
        if (onToast) onToast('图片过大或格式不支持，请换一张 JPG/PNG', 'warn');
        return;
      }
      markDirty();
      // 导入后自动切到对应画面，避免在桌面预览里导入锁屏壁纸“看不到效果”
      previewMode = key === 'lockWallpaper' ? 'lock' : 'home';
      renderControls(); draw();
      URL.revokeObjectURL(objUrl);
      if (onToast) onToast(key === 'lockWallpaper' ? '锁屏壁纸已导入（自动裁剪适配屏幕）' : '桌面壁纸已导入（自动裁剪适配屏幕）', 'good');
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      if (onToast) onToast('图片格式无法识别（HEIC 等格式不支持），请选 JPG/PNG', 'warn');
    };
    img.src = objUrl;
  }

  // ---------- 提交 / 退出 ----------
  function save() {
    state.uiDesigns = JSON.parse(JSON.stringify(draft));
    try { autoSave(state); } catch (e) { /* 忽略 */ }
    dirty = false;
    updateStatus();
    if (onChangedCb) onChangedCb();
    if (onToast) onToast('屏幕设计已保存', 'good');
  }
  function finish() {
    if (dirty) save();
    destroy();
  }
  function discard() {
    if (dirty && !window.confirm('有未保存的修改，确定不保存退出？')) return;
    if (onToast && dirty) onToast('已放弃本次修改', 'warn');
    destroy();
  }

  // ---------- 事件 ----------
  overlay.querySelector('[data-sd=save]').addEventListener('click', save);
  overlay.querySelector('[data-sd=done]').addEventListener('click', finish);
  overlay.querySelector('[data-sd=discard]').addEventListener('click', discard);

  controlsEl.addEventListener('click', (e) => {
    const act = e.target.closest('[data-sd]');
    if (!act) return;
    const k = act.dataset.sd;
    if (!['tab', 'preview', 'sel', 'undo', 'redo', 'import', 'lock-import'].includes(k)) pushUndo();
    if (k === 'new') {
      const d = newDesign(`UI 方案 ${draft.length + 1}`);
      draft.push(d); active = d; markDirty();
    } else if (k === 'del') {
      const idx = draft.indexOf(active);
      if (idx >= 0 && draft.length > 1) {
        draft.splice(idx, 1);
        active = draft[Math.max(0, idx - 1)]; markDirty();
      }
    } else if (k === 'import') { controlsEl.querySelector('[data-sd=file]').click(); return; }
    else if (k === 'lock-import') { controlsEl.querySelector('[data-sd=lock-file]').click(); return; }
    else if (k === 'clear-wp') { active.wallpaper = ''; markDirty(); }
    else if (k === 'lock-clear') { active.lockWallpaper = ''; markDirty(); }
    else if (k === 'tab') {
      sdTab = act.dataset.v;
      controlsEl.querySelectorAll('[data-sdt]').forEach((el) => el.classList.toggle('on', el.dataset.sdt === sdTab));
      controlsEl.querySelectorAll('[data-sd="tab"]').forEach((el) => el.classList.toggle('primary', el.dataset.v === sdTab));
      return;
    }
    if (k === 'type') {
      const t = act.dataset.v;
      active.deviceType = t;
      sdTab = 'controls';
      if (t === 'tablet') {
        active.canvasW = 2560; active.canvasH = 1600; active.lockAspect = false;
        active.dockCount = 6; active.cols = 6; active.rows = 4; active.navStyle = 'gesture';
      } else if (t === 'watch') {
        active.canvasW = 400; active.canvasH = 400; active.lockAspect = false;
        active.dockCount = 0; active.cols = 3; active.rows = 3; active.navStyle = 'none';
        active.watchShape = active.watchShape || 'round';
        previewMode = 'lock';
      } else {
        active.canvasW = 1080; active.canvasH = 2340; active.lockAspect = true;
        active.dockCount = 4; active.cols = 4; active.rows = 5; active.navStyle = 'gesture';
      }
      markDirty(); renderControls(); draw(); return;
    }
    else if (k === 'watch-shape') active.watchShape = act.dataset.v;
    else if (k === 'watch-layout') active.watchLayout = act.dataset.v;
    else if (k === 'preview') { previewMode = act.dataset.v === 'lock' ? 'lock' : 'home'; renderControls(); draw(); return; }
    else if (k === 'ratio') {
      const r = Number(act.dataset.v);
      active.canvasH = Math.round(active.canvasW * r);
      if (active.canvasH > 4680) { active.canvasH = 4680; active.canvasW = Math.round(active.canvasH / r); }
      markDirty();
    } else if (k === 'lock') {
      active.lockAspect = !active.lockAspect;
      markDirty();
    } else if (k === 'nav' || k === 'navdir' || k === 'dock' || k === 'cols' || k === 'rows') {
      const v = k === 'dock' || k === 'cols' || k === 'rows' ? Number(act.dataset.v) : act.dataset.v;
      if (k === 'nav') active.navStyle = v;
      else if (k === 'navdir') active.navDir = v;
      else if (k === 'dock') active.dockCount = v;
      else if (k === 'cols') active.cols = v;
      else active.rows = v;
      markDirty();
    }
    if (k !== 'import' && k !== 'lock-import') { renderControls(); draw(); }
  });

  controlsEl.addEventListener('input', (e) => {
    const k = e.target.dataset.sd;
    if (!k) return;
    pushUndo();
    if (k === 'name') active.name = e.target.value;
    else if (k === 'wall-color') active.wallColor = e.target.value;
    else if (k === 'lock-wall-color') active.lockWallColor = e.target.value;
    else if (k === 'carrier') active.carrier = e.target.value;
    else if (k === 'showTime') active.showTime = e.target.checked;
    else if (k === 'showSignal') active.showSignal = e.target.checked;
    else if (k === 'showBattery') active.showBattery = e.target.checked;
    else if (k === 'lockShowTime') active.lockShowTime = e.target.checked;
    else if (k === 'lockShowDate') active.lockShowDate = e.target.checked;
    else if (k === 'lockShowNotif') active.lockShowNotif = e.target.checked;
    else if (k === 'watchShowDate') active.watchShowDate = e.target.checked;
    else if (k === 'watchShowComplications') active.watchShowComplications = e.target.checked;
    else if (k === 'watchBattery') active.watchBattery = e.target.checked;
    else if (k === 'watchSteps') active.watchSteps = e.target.checked;
    else if (k === 'tabletSplit') active.tabletSplit = e.target.checked;
    else if (k === 'tabletDock') active.tabletDock = e.target.checked;
    else if (k === 'batteryDY') active.batteryDY = Number(e.target.value);
    else if (k === 'gestureW') active.gestureW = Number(e.target.value);
    else if (k === 'gestureH') active.gestureH = Number(e.target.value);
    else if (k === 'canvas-w') {
      const prevRatio = (active.canvasH || 2340) / (active.canvasW || 1080);
      active.canvasW = Math.round(Math.min(2160, Math.max(240, Number(e.target.value) || 1080)));
      if (active.lockAspect) active.canvasH = Math.round(active.canvasW * prevRatio);
    } else if (k === 'canvas-h') {
      const prevRatio = (active.canvasH || 2340) / (active.canvasW || 1080);
      const nh = Math.round(Math.min(4680, Math.max(240, Number(e.target.value) || 2340)));
      if (active.lockAspect) active.canvasW = Math.round(nh / prevRatio);
      active.canvasH = nh;
    } else if (k === 'lock') {
      active.lockAspect = e.target.checked;
    }
    // 输入即视为修改（是否落盘由保存按钮决定）
    markDirty();
    if (k === 'canvas-w' || k === 'canvas-h') { draw(); renderControls(); }
    else if (k === 'batteryDY' || k === 'gestureW' || k === 'gestureH') {
      // 拖动滑杆时只更新数值标签，避免重建 DOM 打断拖动
      const label = controlsEl.querySelector(`[data-sd="${k}-v"]`);
      if (label) {
        label.textContent = k === 'gestureW'
          ? `${clamp(num(active.gestureW, 28), 10, 50)}%`
          : `${clamp(num(active[k], 1), k === 'batteryDY' ? -2 : 1, k === 'batteryDY' ? 4 : 6).toFixed(1)}u`;
      }
      draw();
    }
    else draw();
  });

  controlsEl.addEventListener('change', (e) => {
    const k = e.target.dataset.sd;
    if (k === 'sel') {
      active = draft[Number(e.target.value)] || active;
      ensureActive();
      renderControls(); draw();
    }
    if (k === 'file') importWallpaper(e.target.files[0], 'wallpaper');
    if (k === 'lock-file') importWallpaper(e.target.files[0], 'lockWallpaper');
  });

  // 顶部预览/缩放切换（画布工具栏，不在左栏内）
  overlay.addEventListener('click', (e) => {
    const p = e.target.closest('[data-sd="preview"]');
    if (p && !controlsEl.contains(p)) {
      previewMode = p.dataset.v === 'lock' ? 'lock' : 'home';
      overlay.querySelectorAll('[data-sd="preview"]').forEach((b) => b.classList.toggle('primary', b.dataset.v === previewMode));
      draw(); return;
    }
    const z = e.target.closest('[data-sd="zoom"]');
    if (z) {
      zoomMode = z.dataset.v;
      overlay.querySelectorAll('[data-sd="zoom"]').forEach((b) => b.classList.toggle('primary', b.dataset.v === zoomMode));
      draw(); return;
    }
    if (e.target.closest('[data-sd="undo"]')) { undoDesign(); return; }
    if (e.target.closest('[data-sd="redo"]')) { redoDesign(); return; }
  });
  // 画布点选：上/中/下区域跳到对应控件组
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const y = (e.clientY - r.top) / Math.max(1, r.height);
    let sec = y < 0.14 ? 'status' : y > 0.86 ? 'nav' : 'wallpaper';
    if (active.deviceType === 'watch') sec = y > 0.8 ? 'nav' : 'watch';
    else if (active.deviceType === 'tablet') sec = y > 0.88 ? 'dock' : y < 0.12 ? 'status' : 'wallpaper';
    sdTab = sec === 'wallpaper' ? 'look' : 'controls';
    controlsEl.querySelectorAll('[data-sdt]').forEach((el) => el.classList.toggle('on', el.dataset.sdt === sdTab));
    controlsEl.querySelectorAll('[data-sd="tab"]').forEach((el) => el.classList.toggle('primary', el.dataset.v === sdTab));
    const node = controlsEl.querySelector(`[data-sdsec="${sec}"]`);
    if (node) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      node.classList.add('sd-flash');
      setTimeout(() => node.classList.remove('sd-flash'), 1200);
    }
  });

  // ---------- 键盘 ----------
  function onKey(e) {
    if (e.key === 'Escape') discard();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redoDesign(); else undoDesign();
    }
  }
  window.addEventListener('keydown', onKey);

  renderControls();
  const ro = new ResizeObserver(draw);
  ro.observe(overlay.querySelector('[data-sd=preview-wrap]'));
  draw();

  function destroy() {
    if (dead) return;
    dead = true;
    window.removeEventListener('keydown', onKey);
    ro.disconnect();
    overlay.remove();
    if (onClose) onClose();
  }

  return {
    destroy,
    setOnChanged(cb) { onChangedCb = cb; },
    getDesigns: () => state.uiDesigns,
  };
}

// ---------- 共享合成管线 ----------
// 把 UI 方案画到任意 canvas 上下文（3D 贴图 / 2D 正视 / 缩略图 / 锁屏预览）
export function composeScreenUI(ctx, W, H, ui, mode = 'home') {
  if (!ui) return false;
  normalizeDesign(ui);
  const isLock = mode === 'lock';
  const wp = isLock ? ui.lockWallpaper : ui.wallpaper;
  const color = isLock ? (ui.lockWallColor || '#141c33') : (ui.wallColor || '#0a1020');
  if (wp) {
    const img = wpCache.get(wp);
    if (img) {
      ctx.drawImage(img, 0, 0, W, H);
    } else {
      ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
      preloadWP(wp);
      return false;
    }
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    try { g.addColorStop(0, color); g.addColorStop(1, '#05070c'); } catch (e) { /* 忽略 */ }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (ui.deviceType === 'watch') {
    if (mode === 'lock') drawWatchLock(ctx, W, H, ui);
    else drawWatchHome(ctx, W, H, ui);
  } else if (ui.deviceType === 'tablet' && mode !== 'lock') drawTabletHome(ctx, W, H, ui);
  else if (mode === 'lock') drawLockOverlays(ctx, W, H, ui);
  else drawHomeOverlays(ctx, W, H, ui);
  return true;
}

const wpCache = new Map();
function preloadWP(src) {
  if (wpCache.has(src)) return;
  const img = new Image();
  img.onload = () => { wpCache.set(src, img); };
  img.src = src;
  wpCache.set(src, null); // 占位防重
}

// ---------- 状态栏 ----------
function drawStatus(ctx, W, H, d) {
  const u = W / 100;
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  const sbY = H * 0.028;
  ctx.font = `600 ${u * 3.2}px sans-serif`;
  ctx.textAlign = 'left';
  if (d.showTime) ctx.fillText('9:41', u * 7, sbY + u * 3);
  ctx.textAlign = 'right';
  let rightX = W - u * 7;
  if (d.showBattery) {
    // 电池纵向偏移：旧版本贴顶偏高，默认下移 0.9u 与文字视觉居中
    const by = sbY + u * clamp(num(d.batteryDY, 0.9), -2, 4);
    ctx.strokeRect(rightX - u * 6, by, u * 5, u * 2.4);
    ctx.fillRect(rightX - u * 5.7, by + u * 0.3, u * 3.4, u * 1.8);
    rightX -= u * 7.5;
  }
  if (d.showSignal) {
    for (let i = 0; i < 4; i++) { ctx.fillRect(rightX - u * 4 + i * u * 1.2, sbY + u * 2.2 - i * u * 0.55, u * 0.85, u * 0.85 + i * u * 0.55); }
    rightX -= u * 5.5;
  }
  if (d.carrier) {
    ctx.font = `500 ${u * 2.6}px sans-serif`;
    ctx.fillText(d.carrier, rightX, sbY + u * 2.8);
  }
  // 挖孔
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(W / 2, sbY + u * 1.5, u * 1.7, 0, Math.PI * 2); ctx.fill();
}

// ---------- 桌面 ----------
function drawHomeOverlays(ctx, W, H, active) {
  if (!active) return;
  const u = W / 100;
  drawStatus(ctx, W, H, active);

  const dock = dockGeom(W, H, active);
  const gridTop = H * 0.09;
  const gridBottom = active.dockCount > 0 ? dock.dockY - H * 0.014 : H - navReserve(H, active) - H * 0.03;
  const iconSize = Math.min((W - u * 12) / active.cols - u * 2, u * 13);
  const iconGap = (W - u * 10 - iconSize * active.cols) / Math.max(1, active.cols - 1);
  const rows = Math.max(1, Math.floor((gridBottom - gridTop) / (iconSize + u * 7)));
  for (let r = 0; r < Math.min(rows, active.rows || 5); r++) {
    for (let c2 = 0; c2 < active.cols; c2++) {
      const ix = u * 5 + c2 * (iconSize + iconGap);
      const iy = gridTop + r * (iconSize + u * 7);
      const col = ICON_COLORS[(r * active.cols + c2) % ICON_COLORS.length];
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(ix, iy, iconSize, iconSize, iconSize * 0.22); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.beginPath(); ctx.roundRect(ix, iy, iconSize, iconSize * 0.4, iconSize * 0.22); ctx.fill();
    }
  }

  // Dock：位于导航区上方，避让三大键/手势条
  if (active.dockCount > 0) {
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.roundRect(u * 4, dock.dockY, W - u * 8, dock.dockH, dock.dockH * 0.3); ctx.fill();
    const dockIcon = dock.dockH * 0.72;
    const dockGap = (W - u * 12 - dockIcon * active.dockCount) / Math.max(1, active.dockCount + 1);
    for (let i = 0; i < active.dockCount; i++) {
      const dx = u * 6 + i * (dockIcon + dockGap) + dockGap / 2;
      ctx.fillStyle = ICON_COLORS[i % ICON_COLORS.length];
      ctx.beginPath(); ctx.roundRect(dx, dock.dockY + (dock.dockH - dockIcon) / 2, dockIcon, dockIcon, dockIcon * 0.22); ctx.fill();
    }
  }

  // 导航键
  const navY = H - H * 0.018;
  if (active.navStyle === 'gesture') {
    const gw = u * clamp(num(active.gestureW, 28), 10, 50);
    const gh = u * clamp(num(active.gestureH, 2.4), 1, 6);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.roundRect(W / 2 - gw / 2, navY - gh / 2, gw, gh, gh / 2); ctx.fill();
  } else if (active.navStyle === 'buttons') {
    const rtl = active.navDir === 'rtl';
    const backX = rtl ? W * 0.78 : W * 0.22;
    const sqX = rtl ? W * 0.22 : W * 0.78;
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    // 返回三角：朝返回键所在的外侧
    ctx.beginPath();
    if (rtl) {
      ctx.moveTo(backX + u * 3, navY);
      ctx.lineTo(backX - u * 2, navY - u * 3);
      ctx.lineTo(backX - u * 2, navY + u * 3);
    } else {
      ctx.moveTo(backX - u * 3, navY);
      ctx.lineTo(backX + u * 2, navY - u * 3);
      ctx.lineTo(backX + u * 2, navY + u * 3);
    }
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = u * 0.7; ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.arc(W / 2, navY, u * 2.8, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeRect(sqX - u * 2.5, navY - u * 2.5, u * 5, u * 5);
  }
}

// ---------- 手表表盘 ----------
function drawWatchLock(ctx, W, H, d) {
  const u = W / 100;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.font = `700 ${u * 21}px sans-serif`;
  ctx.fillText('9:41', W / 2, H * 0.34);
  if (d.watchShowDate) {
    ctx.font = `500 ${u * 4.6}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.fillText('1月1日 周一', W / 2, H * 0.46);
  }
  if (d.watchShowComplications) {
    const cy = H * 0.66;
    if (d.watchBattery) {
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.beginPath(); ctx.arc(W * 0.30, cy, u * 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8fd0ff';
      ctx.font = `600 ${u * 5}px sans-serif`;
      ctx.fillText('82%', W * 0.30, cy + u * 1.8);
      ctx.font = `400 ${u * 2.8}px sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.fillText('电量', W * 0.30, cy + u * 7);
    }
    if (d.watchSteps) {
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.beginPath(); ctx.arc(W * 0.70, cy, u * 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#37c9a5';
      ctx.font = `600 ${u * 5}px sans-serif`;
      ctx.fillText('6,240', W * 0.70, cy + u * 1.8);
      ctx.font = `400 ${u * 2.8}px sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.fillText('步数', W * 0.70, cy + u * 7);
    }
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.font = `500 ${u * 3}px sans-serif`;
  ctx.fillText('上滑解锁', W / 2, H - u * 7);
  ctx.textAlign = 'left';
}

function drawWatchHome(ctx, W, H, d) {
  const u = W / 100;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.font = `700 ${u * 13}px sans-serif`;
  ctx.fillText('9:41', W / 2, H * 0.16);
  if (d.watchShowDate) {
    ctx.font = `500 ${u * 3.6}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.fillText('1月1日 周一', W / 2, H * 0.24);
  }
  const top = H * 0.34;
  if (d.watchLayout === 'list') {
    const rows = ['天气', '日程', '健康', '音乐'];
    rows.forEach((name, i) => {
      const y = top + i * u * 11;
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.beginPath(); ctx.roundRect(W * 0.16, y, W * 0.68, u * 8, u * 2); ctx.fill();
      ctx.textAlign = 'left';
      ctx.fillStyle = ICON_COLORS[i % ICON_COLORS.length];
      ctx.beginPath(); ctx.roundRect(W * 0.20, y + u * 1.5, u * 5, u * 5, u * 1.2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.font = `500 ${u * 3.4}px sans-serif`;
      ctx.fillText(name, W * 0.30, y + u * 5.2);
      ctx.textAlign = 'center';
    });
  } else {
    const cols = 3, size = u * 13, gap = u * 4;
    const x0 = (W - (cols * size + (cols - 1) * gap)) / 2;
    for (let i = 0; i < 9; i++) {
      const x = x0 + (i % cols) * (size + gap);
      const y = top + Math.floor(i / cols) * (size + gap);
      ctx.fillStyle = ICON_COLORS[i % ICON_COLORS.length];
      ctx.beginPath(); ctx.roundRect(x, y, size, size, size * 0.28); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.2)';
      ctx.beginPath(); ctx.roundRect(x, y, size, size * 0.42, size * 0.28); ctx.fill();
    }
  }
  ctx.textAlign = 'left';
}

function drawTabletHome(ctx, W, H, d) {
  const u = W / 100;
  const dockH = d.tabletDock !== false ? u * 9 : 0;
  const bottom = H * 0.90 - dockH;
  if (!d.tabletSplit) {
    drawHomeOverlays(ctx, W, H, d);
    if (dockH) drawTabletDock(ctx, W, H, d, u, dockH);
    return;
  }
  drawStatus(ctx, W, H, d);
  const top = H * 0.10;
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.beginPath(); ctx.roundRect(u * 3, top, W / 2 - u * 4, bottom - top, u * 3); ctx.fill();
  ctx.beginPath(); ctx.roundRect(W / 2 + u * 1, top, W / 2 - u * 4, bottom - top, u * 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.font = `600 ${u * 3.5}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('应用 A', W * 0.25, top + u * 8);
  ctx.fillText('应用 B', W * 0.75, top + u * 8);
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.beginPath(); ctx.roundRect(W / 2 - u * 0.3, top, u * 0.6, bottom - top, u * 0.3); ctx.fill();
  ctx.textAlign = 'left';
  if (dockH) drawTabletDock(ctx, W, H, d, u, dockH);
}

// 平板底部任务栏：半透明 Dock + 常用应用图标
function drawTabletDock(ctx, W, H, d, u, dockH) {
  const y = H - dockH - u;
  ctx.fillStyle = 'rgba(255,255,255,.15)';
  ctx.beginPath(); ctx.roundRect(u * 3, y, W - u * 6, dockH, u * 4); ctx.fill();
  const n = 6;
  const gap = (W - u * 12) / n;
  for (let i = 0; i < n; i++) {
    const cx = u * 6 + gap * i + gap / 2;
    ctx.fillStyle = ICON_COLORS[i % ICON_COLORS.length];
    ctx.beginPath(); ctx.roundRect(cx - u * 3, y + dockH / 2 - u * 3, u * 6, u * 6, u * 1.6); ctx.fill();
  }
}

// ---------- 锁屏 ----------
function drawLockOverlays(ctx, W, H, active) {
  if (!active) return;
  const u = W / 100;
  drawStatus(ctx, W, H, active);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,.94)';
  if (active.lockShowTime) {
    ctx.font = `700 ${u * 16}px sans-serif`;
    ctx.fillText('9:41', W / 2, H * 0.17);
  }
  if (active.lockShowDate) {
    ctx.font = `500 ${u * 4.2}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.fillText('1月1日 周一', W / 2, H * 0.17 + u * 6.4);
  }

  if (active.lockShowNotif) {
    const cardY = H * 0.28;
    const cardH = H * 0.085;
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.beginPath();
    ctx.roundRect(u * 6, cardY, W - u * 12, cardH, u * 4);
    ctx.fill();
    // 通知图标
    ctx.fillStyle = ICON_COLORS[2];
    ctx.beginPath();
    ctx.arc(u * 12, cardY + cardH / 2, u * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(u * 10.9, cardY + cardH / 2 - u * 1.4, u * 2.2, u * 2.8, u * 0.6);
    ctx.fill();
    // 文案
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.font = `600 ${u * 3.2}px sans-serif`;
    ctx.fillText('信息', u * 17.5, cardY + cardH * 0.4);
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.font = `400 ${u * 2.7}px sans-serif`;
    ctx.fillText('欢迎使用你的新手机', u * 17.5, cardY + cardH * 0.72);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillText('刚刚', W - u * 9, cardY + cardH * 0.4);
  }

  // 锁头
  ctx.strokeStyle = 'rgba(255,255,255,.6)';
  ctx.lineWidth = u * 0.7;
  ctx.beginPath();
  ctx.arc(W / 2, H - u * 17, u * 2.2, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.beginPath();
  ctx.roundRect(W / 2 - u * 3.2, H - u * 17, u * 6.4, u * 4.4, u * 1);
  ctx.fill();

  // 上滑解锁
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,.62)';
  ctx.font = `500 ${u * 3}px sans-serif`;
  ctx.fillText('上滑解锁', W / 2, H - u * 6);
  ctx.textAlign = 'left';
}