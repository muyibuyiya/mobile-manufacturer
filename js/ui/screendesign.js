// 屏幕设计独立页（v0.9.0）：壁纸导入/裁剪 + 状态栏 + 导航键 + Dock，多方案保存
// 与设计器解耦：提前做好保存到 state.uiDesigns[]，设计器屏幕下拉选用
import { autoSave } from '../core/state.js';
import { fmtMoney } from '../core/util.js';

export function openScreenDesign(mount, state, { onClose, onToast }) {
  state.uiDesigns = state.uiDesigns || [];
  let active = state.uiDesigns[0] || null;
  let dirty = false;

  // ---------- DOM ----------
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:70;background:rgba(6,9,14,.97);display:flex;flex-direction:column';
  overlay.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid #232e3d">
      <b style="font-size:15px">屏幕设计</b>
      <span class="tiny dim">壁纸导入 + 状态栏 + 导航键 + Dock · 保存后在设计器屏幕区选用</span>
      <div style="flex:1"></div>
      <button class="btn small" data-sd="close">完成</button>
    </div>
    <div style="flex:1;display:flex;min-height:0">
      <div style="width:340px;flex-shrink:0;padding:10px 14px;border-right:1px solid #232e3d;overflow-y:auto" data-sd="controls"></div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;min-width:0" data-sd="preview-wrap">
        <canvas data-sd="cv" style="border-radius:18px;box-shadow:0 8px 40px rgba(0,0,0,.5)"></canvas>
      </div>
    </div>`;
  mount.appendChild(overlay);
  const cv = overlay.querySelector('[data-sd=cv]');
  const ctx = cv.getContext('2d');
  const controlsEl = overlay.querySelector('[data-sd=controls]');

  // ---------- 编辑逻辑 ----------
  function newDesign(name) {
    return { uid: 'ui' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), name, wallpaper: '', wallColor: '#0a1020',
      carrier: '5G', showTime: true, showBattery: true, showSignal: true, navStyle: 'gesture', dockCount: 4, cols: 4, rows: 5 };
  }
  function ensureActive() {
    if (!active) { active = newDesign('默认 UI'); state.uiDesigns.push(active); }
  }

  function renderControls() {
    ensureActive();
    const designs = state.uiDesigns.map((d, i) => `<option value="${i}" ${d === active ? 'selected' : ''}>${d.name}</option>`).join('');
    controlsEl.innerHTML = `
      <div class="field"><span>方案</span>
        <div class="row" style="gap:5px">
          <select data-sd="sel" style="flex:1">${designs}</select>
          <button class="btn tiny" data-sd="new">＋</button>
          ${state.uiDesigns.length > 1 ? '<button class="btn tiny ghost" data-sd="del">✕</button>' : ''}
        </div>
      </div>
      <div class="field"><span>方案名称</span>
        <input type="text" data-sd="name" value="${active.name}" maxlength="14" style="width:100%" />
      </div>
      <div class="section-label">壁纸</div>
      <div class="row" style="gap:5px;margin-bottom:6px">
        <button class="btn small" data-sd="import">📁 导入图片</button>
        <button class="btn small ghost" data-sd="clear-wp">清除</button>
        <input type="file" accept="image/*" data-sd="file" style="display:none" />
      </div>
      ${active.wallpaper ? '<img data-sd="wp-thumb" src="' + active.wallpaper + '" style="width:80px;height:140px;object-fit:cover;border-radius:6px;border:1px solid #2a3546" />' : `<div style="width:80px;height:140px;border-radius:6px;border:1px dashed #2a3546;display:flex;align-items:center;justify-content:center" class="tiny dim">无壁纸</div>`}
      <label class="field"><span>底色（无壁纸时）</span>
        <input type="color" data-sd="wall-color" value="${active.wallColor}" style="width:44px;height:26px;padding:1px" />
      </label>
      <div class="section-label">状态栏</div>
      <div class="row" style="gap:5px;flex-wrap:wrap">
        <label class="form-check" style="margin:0"><input type="checkbox" class="form-check-input" data-sd="showTime" ${active.showTime ? 'checked' : ''} /><span class="form-check-label tiny">时间</span></label>
        <label class="form-check" style="margin:0"><input type="checkbox" class="form-check-input" data-sd="showSignal" ${active.showSignal ? 'checked' : ''} /><span class="form-check-label tiny">信号</span></label>
        <label class="form-check" style="margin:0"><input type="checkbox" class="form-check-input" data-sd="showBattery" ${active.showBattery ? 'checked' : ''} /><span class="form-check-label tiny">电量</span></label>
      </div>
      <label class="field" style="margin-top:6px"><span>运营商文字</span>
        <input type="text" data-sd="carrier" value="${active.carrier}" maxlength="6" style="width:100%" />
      </label>
      <div class="section-label">导航键</div>
      <div class="row" style="gap:5px;flex-wrap:wrap">
        ${[['gesture', '手势横条'], ['buttons', '三大键'], ['none', '无']].map(([v, n]) => `<button class="btn tiny ${active.navStyle === v ? 'primary' : ''}" data-sd="nav" data-v="${v}">${n}</button>`).join('')}
      </div>
      <div class="section-label">Dock 栏</div>
      <div class="row" style="gap:5px;align-items:center">
        <span class="tiny dim">应用数</span>
        ${[0, 3, 4, 5].map((n) => `<button class="btn tiny ${active.dockCount === n ? 'primary' : ''}" data-sd="dock" data-v="${n}">${n || '无'}</button>`).join('')}
      </div>
      <div class="section-label">桌面网格</div>
      <div class="row" style="gap:8px;align-items:center">
        <span class="tiny dim">列</span>${[3, 4, 5].map((n) => `<button class="btn tiny ${active.cols === n ? 'primary' : ''}" data-sd="cols" data-v="${n}">${n}</button>`).join('')}
        <span class="tiny dim" style="margin-left:8px">行</span>${[4, 5, 6].map((n) => `<button class="btn tiny ${active.rows === n ? 'primary' : ''}" data-sd="rows" data-v="${n}">${n}</button>`).join('')}
      </div>`;
  }

  // ---------- 合成渲染（共享给设计器管线） ----------
  function compose(ctx, W, H) {
    ensureActive();
    // 底色 / 壁纸
    if (active.wallpaper) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, W, H);
        drawOverlays(ctx, W, H);
      };
      img.src = active.wallpaper;
      return; // 异步首次，onload 内完成
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      try { g.addColorStop(0, active.wallColor); g.addColorStop(1, '#05070c'); } catch (e) { g.addColorStop(1, '#05070c'); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    drawOverlays(ctx, W, H);
  }

  function drawOverlays(ctx, W, H) {
    const u = W / 100;
    // 状态栏
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    const sbY = H * 0.028;
    ctx.font = `600 ${u * 3.2}px sans-serif`;
    ctx.textAlign = 'left';
    if (active.showTime) ctx.fillText('9:41', u * 7, sbY + u * 3);
    ctx.textAlign = 'right';
    let rightX = W - u * 7;
    if (active.showBattery) {
      ctx.strokeRect(rightX - u * 6, sbY, u * 5, u * 2.4);
      ctx.fillRect(rightX - u * 5.7, sbY + u * 0.3, u * 3.4, u * 1.8);
      rightX -= u * 7.5;
    }
    if (active.showSignal) {
      for (let i = 0; i < 4; i++) { ctx.fillRect(rightX - u * 4 + i * u * 1.2, sbY + u * 2.2 - i * u * 0.55, u * 0.85, u * 0.85 + i * u * 0.55); }
      rightX -= u * 5.5;
    }
    if (active.carrier) {
      ctx.font = `500 ${u * 2.6}px sans-serif`;
      ctx.fillText(active.carrier, rightX, sbY + u * 2.8);
    }
    // 挖孔
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(W / 2, sbY + u * 1.5, u * 1.7, 0, Math.PI * 2); ctx.fill();
    // 桌面网格图标
    const gridTop = H * 0.09, gridBottom = active.dockCount > 0 ? H - H * 0.13 : H - H * 0.06;
    const iconSize = Math.min((W - u * 12) / active.cols - u * 2, u * 13);
    const iconGap = (W - u * 10 - iconSize * active.cols) / Math.max(1, active.cols - 1);
    const rows = Math.max(1, Math.floor((gridBottom - gridTop) / (iconSize + u * 7)));
    const iconColors = ['#3a7bd5', '#e0533d', '#2fb37a', '#f2b134', '#8b5cf6', '#22a8c9', '#e8548a', '#5b6b7f'];
    for (let r = 0; r < Math.min(rows, active.rows); r++) {
      for (let c2 = 0; c2 < active.cols; c2++) {
        const ix = u * 5 + c2 * (iconSize + iconGap);
        const iy = gridTop + r * (iconSize + u * 7);
        const col = iconColors[(r * active.cols + c2) % iconColors.length];
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.roundRect(ix, iy, iconSize, iconSize, iconSize * 0.22); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.16)';
        ctx.beginPath(); ctx.roundRect(ix, iy, iconSize, iconSize * 0.4, iconSize * 0.22); ctx.fill();
      }
    }
    // Dock
    if (active.dockCount > 0) {
      const dockY = H - H * 0.115;
      const dockH = H * 0.095;
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.beginPath(); ctx.roundRect(u * 4, dockY, W - u * 8, dockH, dockH * 0.3); ctx.fill();
      const dockIcon = dockH * 0.72;
      const dockGap = (W - u * 12 - dockIcon * active.dockCount) / Math.max(1, active.dockCount + 1);
      for (let i = 0; i < active.dockCount; i++) {
        const dx = u * 6 + i * (dockIcon + dockGap) + dockGap / 2;
        ctx.fillStyle = iconColors[i % iconColors.length];
        ctx.beginPath(); ctx.roundRect(dx, dockY + (dockH - dockIcon) / 2, dockIcon, dockIcon, dockIcon * 0.22); ctx.fill();
      }
    }
    // 导航键
    const navY = H - H * 0.018;
    if (active.navStyle === 'gesture') {
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.roundRect(W / 2 - u * 14, navY - u * 1.2, u * 28, u * 2.4, u * 1.2); ctx.fill();
    } else if (active.navStyle === 'buttons') {
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      const by = navY;
      // ◁ ○ □
      ctx.beginPath(); ctx.moveTo(W * 0.22 - u * 3, by); ctx.lineTo(W * 0.22 + u * 2, by - u * 3); ctx.lineTo(W * 0.22 + u * 2, by + u * 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(W / 2, by, u * 2.8, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = u * 0.7; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
      ctx.strokeRect(W * 0.78 - u * 2.5, by - u * 2.5, u * 5, u * 5);
    }
  }

  function draw() {
    const wrap = overlay.querySelector('[data-sd=preview-wrap]');
    const maxH = wrap.clientHeight - 20;
    const maxW = wrap.clientWidth - 20;
    const aspect = 19.5 / 9;
    let pw = maxW, ph = pw / aspect;
    if (ph > maxH) { ph = maxH; pw = ph * aspect; }
    cv.style.width = pw + 'px'; cv.style.height = ph + 'px';
    cv.width = pw * 2; cv.height = ph * 2;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    compose(ctx, pw, ph);
  }

  // ---------- 事件 ----------
  controlsEl.addEventListener('click', (e) => {
    const act = e.target.closest('[data-sd]');
    if (!act) return;
    const k = act.dataset.sd;
    if (k === 'new') {
      const d = newDesign(`UI 方案 ${state.uiDesigns.length + 1}`);
      state.uiDesigns.push(d); active = d; dirty = true;
    } else if (k === 'del') {
      const idx = state.uiDesigns.indexOf(active);
      if (idx >= 0 && state.uiDesigns.length > 1) {
        state.uiDesigns.splice(idx, 1);
        active = state.uiDesigns[Math.max(0, idx - 1)]; dirty = true;
      }
    } else if (k === 'import') { controlsEl.querySelector('[data-sd=file]').click(); return; }
    else if (k === 'clear-wp') { active.wallpaper = ''; dirty = true; }
    else if (k === 'nav' || k === 'dock' || k === 'cols' || k === 'rows') {
      const v = k === 'dock' || k === 'cols' || k === 'rows' ? Number(act.dataset.v) : act.dataset.v;
      if (k === 'nav') active.navStyle = v;
      else if (k === 'dock') active.dockCount = v;
      else if (k === 'cols') active.cols = v;
      else active.rows = v;
      dirty = true;
    }
    if (k !== 'import') { renderControls(); draw(); persist(); }
  });
  controlsEl.addEventListener('input', (e) => {
    const k = e.target.dataset.sd;
    if (!k) return;
    if (k === 'name') active.name = e.target.value;
    else if (k === 'wall-color') active.wallColor = e.target.value;
    else if (k === 'carrier') active.carrier = e.target.value;
    else if (k === 'showTime') active.showTime = e.target.checked;
    else if (k === 'showSignal') active.showSignal = e.target.checked;
    else if (k === 'showBattery') active.showBattery = e.target.checked;
    if (k !== 'name') { draw(); persist(); }
    else { draw(); } // 名称不触发持久化（打字中）
  });
  controlsEl.addEventListener('change', (e) => {
    if (e.target.dataset.sd === 'sel') {
      active = state.uiDesigns[Number(e.target.value)] || active;
      renderControls(); draw();
    }
    if (e.target.dataset.sd === 'file') {
      const file = e.target.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        // 压缩到屏幕纵横比，最大高度 640（控制存档体积）
        const maxH = 640;
        const aspect = 19.5 / 9;
        const tw = Math.min(360, Math.round(maxH * aspect));
        const th = Math.round(tw / aspect);
        const c = document.createElement('canvas');
        c.width = tw; c.height = th;
        const cctx = c.getContext('2d');
        // cover 裁切
        const s = Math.max(tw / img.width, th / img.height);
        const dw = img.width * s, dh = img.height * s;
        cctx.drawImage(img, (tw - dw) / 2, (th - dh) / 2, dw, dh);
        active.wallpaper = c.toDataURL('image/jpeg', 0.82);
        dirty = true;
        renderControls(); draw(); persist();
        if (onToast) onToast('壁纸已导入（自动裁剪适配屏幕）', 'good');
      };
      img.src = URL.createObjectURL(file);
    }
  });

  function persist() {
    if (!dirty) return;
    try { autoSave(state); } catch (e) { /* 忽略 */ }
    if (onChangedCb) onChangedCb();
    dirty = false;
  }
  let onChangedCb = null;

  // ---------- 键盘 ----------
  function onKey(e) { if (e.key === 'Escape') destroy(); }
  window.addEventListener('keydown', onKey);

  renderControls();
  const ro = new ResizeObserver(draw);
  ro.observe(overlay.querySelector('[data-sd=preview-wrap]'));
  draw();

  function destroy() {
    dead = true;
    window.removeEventListener('keydown', onKey);
    ro.disconnect();
    overlay.remove();
    if (onClose) onClose();
  }
  let dead = false;

  return {
    destroy,
    setOnChanged(cb) { onChangedCb = cb; },
    // 供设计器合成调用：把 active 方案或按 uid 找到方案画到 ctx
    getDesigns: () => state.uiDesigns,
  };
}

// ---------- 共享合成管线（designer.js 三处调用） ----------
// 把 UI 方案画到任意 canvas 上下文（3D 贴图 / 2D 正视 / 缩略图）
export function composeScreenUI(ctx, W, H, ui) {
  if (!ui) return false;
  // 底色 / 壁纸
  if (ui.wallpaper) {
    // 同步路径：壁纸已预加载为 HTMLImageElement（由页面初始化时预热）
    const img = wpCache.get(ui.wallpaper);
    if (img) {
      ctx.drawImage(img, 0, 0, W, H);
    } else {
      ctx.fillStyle = ui.wallColor || '#0a1020'; ctx.fillRect(0, 0, W, H);
      preloadWP(ui.wallpaper);
      return false;
    }
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    try { g.addColorStop(0, ui.wallColor || '#0a1020'); g.addColorStop(1, '#05070c'); } catch (e) { /* 忽略 */ }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  drawUIOverlays(ctx, W, H, ui);
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

function drawUIOverlays(ctx, W, H, active) {
  if (!active) return;
  const u = W / 100;
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  const sbY = H * 0.028;
  ctx.font = `600 ${u * 3.2}px sans-serif`;
  ctx.textAlign = 'left';
  if (active.showTime) ctx.fillText('9:41', u * 7, sbY + u * 3);
  ctx.textAlign = 'right';
  let rightX = W - u * 7;
  if (active.showBattery) {
    ctx.strokeRect(rightX - u * 6, sbY, u * 5, u * 2.4);
    ctx.fillRect(rightX - u * 5.7, sbY + u * 0.3, u * 3.4, u * 1.8);
    rightX -= u * 7.5;
  }
  if (active.showSignal) {
    for (let i = 0; i < 4; i++) { ctx.fillRect(rightX - u * 4 + i * u * 1.2, sbY + u * 2.2 - i * u * 0.55, u * 0.85, u * 0.85 + i * u * 0.55); }
    rightX -= u * 5.5;
  }
  if (active.carrier) {
    ctx.font = `500 ${u * 2.6}px sans-serif`;
    ctx.fillText(active.carrier, rightX, sbY + u * 2.8);
  }
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(W / 2, sbY + u * 1.5, u * 1.7, 0, Math.PI * 2); ctx.fill();
  const gridTop = H * 0.09, gridBottom = active.dockCount > 0 ? H - H * 0.13 : H - H * 0.06;
  const iconSize = Math.min((W - u * 12) / active.cols - u * 2, u * 13);
  const iconGap = (W - u * 10 - iconSize * active.cols) / Math.max(1, active.cols - 1);
  const rows = Math.max(1, Math.floor((gridBottom - gridTop) / (iconSize + u * 7)));
  const iconColors = ['#3a7bd5', '#e0533d', '#2fb37a', '#f2b134', '#8b5cf6', '#22a8c9', '#e8548a', '#5b6b7f'];
  for (let r = 0; r < Math.min(rows, active.rows || 5); r++) {
    for (let c2 = 0; c2 < active.cols; c2++) {
      const ix = u * 5 + c2 * (iconSize + iconGap);
      const iy = gridTop + r * (iconSize + u * 7);
      const col = iconColors[(r * active.cols + c2) % iconColors.length];
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(ix, iy, iconSize, iconSize, iconSize * 0.22); ctx.fill();
    }
  }
  if (active.dockCount > 0) {
    const dockY = H - H * 0.115;
    const dockH = H * 0.095;
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.roundRect(u * 4, dockY, W - u * 8, dockH, dockH * 0.3); ctx.fill();
    const dockIcon = dockH * 0.72;
    const dockGap = (W - u * 12 - dockIcon * active.dockCount) / Math.max(1, active.dockCount + 1);
    for (let i = 0; i < active.dockCount; i++) {
      const dx = u * 6 + i * (dockIcon + dockGap) + dockGap / 2;
      ctx.fillStyle = iconColors[i % iconColors.length];
      ctx.beginPath(); ctx.roundRect(dx, dockY + (dockH - dockIcon) / 2, dockIcon, dockIcon, dockIcon * 0.22); ctx.fill();
    }
  }
  const navY = H - H * 0.018;
  if (active.navStyle === 'gesture') {
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.roundRect(W / 2 - u * 14, navY - u * 1.2, u * 28, u * 2.4, u * 1.2); ctx.fill();
  } else if (active.navStyle === 'buttons') {
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.moveTo(W * 0.22 - u * 3, navY); ctx.lineTo(W * 0.22 + u * 2, navY - u * 3); ctx.lineTo(W * 0.22 + u * 2, navY + u * 3); ctx.closePath(); ctx.fill();
    ctx.lineWidth = u * 0.7; ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.arc(W / 2, navY, u * 2.8, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeRect(W * 0.78 - u * 2.5, navY - u * 2.5, u * 5, u * 5);
  }
}
