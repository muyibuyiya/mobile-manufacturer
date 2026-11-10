// 2D 平面规划页：俯视整层楼的布局编辑器（v0.8.0）
// 与 3D 编辑模式（office.js）共用 state.officeLayout 与 floorplan.js 校验层——双端行为永远一致。
// 交互：选部门 → 选工具 → canvas 上放置/拖拽；R 旋转；Esc 取消；移动免费，卖出退一半。
import { DEPT_DEFS } from '../data/depts.js';
import { FURNITURE, FURNITURE_MAP, layoutMoraleBonus, layoutRndBonus } from '../data/furniture.js';
import { autoSave } from '../core/state.js';
import {
  CELL, FLOOR_W, FLOOR_H, FLOOR_X, FLOOR_Z,
  ROOM_MIN, ROOM_MAX, ENTRANCE_RECT, ENTRANCE_CELL, DEPT_IDS_9,
  migrateV1, roomAt, doorCells, autoDoor,
  deptHeadcounts, builtinDesks, seatForDesk,
  validateRoomPlace, validateFurniturePlace, validateEdgeToggle, validateDoorMove,
  reachability, cellToWorld, worldToCell, roomCellWorld,
} from '../core/floorplan.js';

export function openFloorplanPlanner(mount, state, { onChanged, onClose, onToast }) {
  const layout = state.officeLayout?.v === 2 ? state.officeLayout : migrateV1(state.officeLayout);
  state.officeLayout = layout;
  let tool = 'select';      // select | furniture:<id> | wall | door | move-room | resize | remove
  let dept = DEPT_IDS_9[0];
  let ghostRot = 0;
  let ghost = null;         // { kind, data, valid, reason }
  let dragItem = null;
  let dragRoom = null;
  let resize = null;        // { dept, corner:[x,y] }
  let selectedUid = null;
  let dead = false;

  // ---------- DOM ----------
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:70;background:rgba(6,9,14,.97);display:flex;flex-direction:column';
  overlay.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid #232e3d">
      <b style="font-size:15px">平面规划</b>
      <span class="tiny dim">与 3D 布局编辑共用同一份数据：这里改完，回 3D 立即生效</span>
      <div style="flex:1"></div>
      <button class="btn small" data-fp="close">完成</button>
    </div>
    <div data-fp="toolbar" style="display:flex;flex-direction:column;gap:6px;padding:8px 14px;border-bottom:1px solid #232e3d"></div>
    <div style="flex:1;position:relative;min-height:0">
      <canvas data-fp="cv" style="position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair"></canvas>
    </div>
    <div data-fp="info" class="tiny" style="padding:8px 14px;border-top:1px solid #232e3d;line-height:1.8;max-height:88px;overflow:auto"></div>`;
  mount.appendChild(overlay);
  const cv = overlay.querySelector('[data-fp=cv]');
  const toolbar = overlay.querySelector('[data-fp=toolbar]');
  const infoEl = overlay.querySelector('[data-fp=info]');
  const ctx = cv.getContext('2d');

  function renderToolbar() {
    const tools = [
      ['select', '☝ 选择/移动'], ['move-room', '⇄ 拖动房间'], ['resize', '⤡ 调整尺寸'],
      ...FURNITURE.map((f) => [`furniture:${f.id}`, `${f.icon} ${f.name} ¥${(f.cost / 1e4).toFixed(1)}万`]),
      ['wall', '▯ 隔墙 ¥0.3万'], ['door', '⊓ 移门'], ['remove', '✕ 拆除(退一半)'],
    ];
    toolbar.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:5px">
        ${DEPT_DEFS.slice(0, 9).map((d) => `<button class="btn tiny ${dept === d.id ? 'primary' : ''}" data-fd="${d.id}">${d.name}</button>`).join('')}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">
        ${tools.map(([id, name]) => `<button class="btn tiny ${tool === id ? 'primary' : ''}" data-ft="${id}">${name}</button>`).join('')}
        <span class="tiny dim" style="align-self:center;margin-left:8px">左键放置/拖拽 · R 旋转 · Esc 取消 · 隔墙会真的挡住员工</span>
      </div>`;
  }
  toolbar.addEventListener('click', (e) => {
    const d = e.target.closest('[data-fd]');
    if (d) { dept = d.dataset.fd; renderToolbar(); draw(); return; }
    const t = e.target.closest('[data-ft]');
    if (!t) return;
    tool = t.dataset.ft;
    cancelGhost();
    renderToolbar();
    draw();
  });
  overlay.querySelector('[data-fp=close]').onclick = () => destroy();

  // ---------- 坐标换算（绘制与拾取同源） ----------
  let scale = 1, ox = 0, oy = 0;
  function fit() {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min((r.width - 40) / FLOOR_X, (r.height - 40) / FLOOR_Z);
    ox = (r.width - FLOOR_X * scale) / 2;
    oy = (r.height - FLOOR_Z * scale) / 2;
  }
  const w2c = (wx, wz) => [ox + (wx + FLOOR_X / 2) * scale, oy + (wz + FLOOR_Z / 2) * scale];
  const c2w = (px, py) => ({ x: (px - ox) / scale - FLOOR_X / 2, z: (py - oy) / scale - FLOOR_Z / 2 });

  // ---------- 绘制 ----------
  function draw() {
    fit();
    const W = cv.width / Math.min(2, window.devicePixelRatio || 1);
    const H = cv.height / Math.min(2, window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#080b10';
    ctx.fillRect(0, 0, W, H);
    // 楼层底板
    const [fx, fy] = w2c(-FLOOR_X / 2, -FLOOR_Z / 2);
    const fw = FLOOR_X * scale, fh = FLOOR_Z * scale;
    ctx.fillStyle = '#131a23';
    ctx.fillRect(fx, fy, fw, fh);
    // 网格线
    ctx.strokeStyle = 'rgba(60,76,96,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let cx = 0; cx <= FLOOR_W; cx++) { const [x] = w2c(cx * CELL - FLOOR_X / 2, 0); ctx.moveTo(x, fy); ctx.lineTo(x, fy + fh); }
    for (let cy = 0; cy <= FLOOR_H; cy++) { const [, y] = w2c(0, cy * CELL - FLOOR_Z / 2); ctx.moveTo(fx, y); ctx.lineTo(fx + fw, y); }
    ctx.stroke();
    // 入口区
    const [ex, ey] = w2c(ENTRANCE_RECT.cx * CELL - FLOOR_X / 2, ENTRANCE_RECT.cy * CELL - FLOOR_Z / 2);
    ctx.fillStyle = 'rgba(245,165,66,.12)';
    ctx.fillRect(ex, ey, ENTRANCE_RECT.w * CELL * scale, ENTRANCE_RECT.h * CELL * scale);
    ctx.fillStyle = 'rgba(245,165,66,.75)';
    ctx.font = '11px sans-serif';
    ctx.fillText('入口大厅', ex + 6, ey + 14);

    const counts = deptHeadcounts(state);
    // 公共空间：色块 + 名称（虚线边框表示非部门房间）
    const FAC_COLORS = { meeting: '#6f7fd8', pantry: '#d8a95a', server: '#5aa6a0', exec: '#b07ac0' };
    for (const f of (layout.facilities || [])) {
      const [rx, ry] = w2c(f.cx * CELL - FLOOR_X / 2, f.cy * CELL - FLOOR_Z / 2);
      const rw = f.w * CELL * scale, rh = f.h * CELL * scale;
      const fc = FAC_COLORS[f.type] || '#55637a';
      ctx.fillStyle = hexA(fc, 0.1);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = fc;
      ctx.lineWidth = Math.max(1.6, 0.4 * scale);
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(214,226,242,.85)';
      ctx.font = '11px sans-serif';
      ctx.fillText(f.name, rx + 6, ry + rh / 2 + 4);
    }
    // 房间：色块 + 周界墙 + 门 + 标签
    for (const d of DEPT_DEFS.slice(0, 9)) {
      const room = layout.rooms[d.id];
      if (!room) continue;
      const [rx, ry] = w2c(room.cx * CELL - FLOOR_X / 2, room.cy * CELL - FLOOR_Z / 2);
      const rw = room.w * CELL * scale, rh = room.h * CELL * scale;
      ctx.fillStyle = hexA(d.color, 0.09);
      ctx.fillRect(rx, ry, rw, rh);
      // 周界墙：逐段画，门段留空
      ctx.lineWidth = Math.max(2.5, 0.55 * scale);
      ctx.strokeStyle = d.color;
      const seg = CELL * scale;
      const dc = doorCells(layout, d.id);
      const segs = [];
      for (let t = 0; t < room.w; t++) {
        segs.push({ kind: 'H', a: t, b: 0, isDoor: room.door.side === 'N' && room.door.t === t });
        segs.push({ kind: 'H', a: t, b: room.h, isDoor: room.door.side === 'S' && room.door.t === t });
      }
      for (let t = 0; t < room.h; t++) {
        segs.push({ kind: 'V', a: 0, b: t, isDoor: room.door.side === 'W' && room.door.t === t });
        segs.push({ kind: 'V', a: room.w, b: t, isDoor: room.door.side === 'E' && room.door.t === t });
      }
      for (const s of segs) {
        if (s.isDoor) { drawDoorGap(rx, ry, s, rw, rh, room); continue; }
        ctx.beginPath();
        if (s.kind === 'H') { const [, y] = w2c(0, (room.cy + s.b) * CELL - FLOOR_Z / 2); const [x0] = w2c((room.cx + s.a) * CELL - FLOOR_X / 2, 0); ctx.moveTo(x0, y); ctx.lineTo(x0 + seg, y); }
        else { const [x,] = w2c((room.cx + s.a) * CELL - FLOOR_X / 2, 0); const [, y0] = w2c(0, (room.cy + s.b) * CELL - FLOOR_Z / 2); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + seg); }
        ctx.stroke();
      }
      // 门标记（门洞上的小圆点）
      const dw = cellToWorld(dc.inner.cx, dc.inner.cy);
      const [mdx, mdy] = w2c(dw.x, dw.z);
      ctx.fillStyle = '#f5a542';
      ctx.beginPath(); ctx.arc(mdx, mdy, Math.max(3, 0.18 * scale * 4), 0, Math.PI * 2); ctx.fill();
      // 标签
      ctx.fillStyle = '#e8eef7';
      ctx.font = `600 ${Math.max(11, CELL * scale * 0.34)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${d.name} · ${counts[d.id] || 0}人`, rx + rw / 2, ry + rh / 2 + 4);
      // 家具
      for (const bd of builtinDesks(layout, counts).filter((x) => x.dept === d.id)) {
        drawItem(d.id, bd.lx, bd.ly, 0, 'desk', true);
      }
      for (const it of layout.items.filter((x) => x.dept === d.id)) drawItem(d.id, it.cx, it.cy, it.rot || 0, it.type, false, it.uid);
      // 用户隔墙
      for (const ed of layout.edges.filter((x) => x.dept === d.id)) {
        ctx.strokeStyle = ed.type === 'wall' ? '#93a7c2' : '#f5a542';
        ctx.lineWidth = Math.max(2, 0.4 * scale * 4);
        ctx.beginPath();
        if (ed.orient === 'h') { const [x0] = w2c((room.cx + ed.ex) * CELL - FLOOR_X / 2, 0); const [, y0] = w2c(0, (room.cy + ed.ey) * CELL - FLOOR_Z / 2); ctx.moveTo(x0, y0); ctx.lineTo(x0 + seg, y0); }
        else { const [x0] = w2c((room.cx + ed.ex) * CELL - FLOOR_X / 2, 0); const [, y0] = w2c(0, (room.cy + ed.ey) * CELL - FLOOR_Z / 2); ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + seg); }
        ctx.stroke();
      }
      // 选中高亮
      if (selectedUid && layout.items.some((i) => i.uid === selectedUid && i.dept === d.id)) {
        const it = layout.items.find((i) => i.uid === selectedUid);
        const sw = roomCellWorld(layout, d.id, it.cx, it.cy);
        const [sx, sy] = w2c(sw.x, sw.z);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx - seg / 2, sy - seg / 2, seg, seg);
      }
    }

    // 幽灵
    if (ghost) drawGhost();

    // 信息栏
    const reach = reachability(layout);
    const desksBy = {};
    for (const d of builtinDesks(layout, counts)) desksBy[d.dept] = (desksBy[d.dept] || 0) + 1;
    const userDesks = {};
    for (const i of layout.items) if (i.type === 'desk') userDesks[i.dept] = (userDesks[i.dept] || 0) + 1;
    const morale = layoutMoraleBonus(state);
    const rndB = layoutRndBonus(state);
    const warn = reach.ok ? '' : ` · <span style="color:#f56b6b">不可达：${reach.bad.map((id) => DEPT_DEFS[DEPT_IDS_9.indexOf(id)]?.name || id).join('、')}</span>`;
    infoEl.innerHTML =
      DEPT_DEFS.slice(0, 9).map((d) => {
        const cap = (desksBy[d.id] || 0) + (userDesks[d.id] || 0);
        const n = counts[d.id] || 0;
        const bad = cap < n ? `<span style="color:#f5a542">工位不足</span>` : '✓';
        return `<span style="margin-right:14px">${d.name} 工位 <b class="mono">${n}/${cap}</b> ${bad}</span>`;
      }).join('') +
      `<span style="margin-right:14px">满意度加成 <b class="mono">+${morale.toFixed(1)}</b></span>` +
      `<span style="margin-right:14px">研发效率 <b class="mono">+${Math.round(rndB * 100)}%</b></span>` +
      warn;
  }

  function drawItem(deptId, lx, ly, rot, type, isBuiltin, uid) {
    const room = layout.rooms[deptId];
    const w = roomCellWorld(layout, deptId, lx, ly);
    const [x, y] = w2c(w.x, w.z);
    const seg = CELL * scale;
    const f = FURNITURE_MAP[type];
    if (isBuiltin) {
      ctx.strokeStyle = 'rgba(143,191,74,.75)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x - seg * 0.36, y - seg * 0.36, seg * 0.72, seg * 0.72);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(143,191,74,.75)';
      ctx.font = `${Math.max(9, seg * 0.42)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('▦', x, y + seg * 0.16);
      return;
    }
    ctx.fillStyle = type === 'desk' ? 'rgba(143,191,74,.85)' : 'rgba(122,162,220,.85)';
    ctx.beginPath();
    const s = seg * 0.34;
    rr(ctx, x - s, y - s, s * 2, s * 2, s * 0.35);
    ctx.fill();
    ctx.fillStyle = '#0a0e14';
    ctx.font = `${Math.max(10, seg * 0.5)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(f ? f.icon : '?', x, y + seg * 0.18);
    // 朝向刻痕（rot 指示）
    if (rot) {
      const dir = [[0, 1], [1, 0], [0, -1], [-1, 0]][rot % 4];
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dir[0] * s * 0.9, y + dir[1] * s * 0.9);
      ctx.stroke();
    }
    if (uid && uid === selectedUid) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - s * 1.15, y - s * 1.15, s * 2.3, s * 2.3);
    }
  }

  function drawDoorGap(rx, ry, s, rw, rh, room) {
    // 门段：留空 + 门轴小弧
    ctx.strokeStyle = '#f5a542';
    ctx.lineWidth = Math.max(2, 0.3 * scale * 4);
    ctx.beginPath();
    if (s.kind === 'H') {
      const [x0] = w2c((room.cx + s.a) * CELL - FLOOR_X / 2, 0);
      const [, y] = w2c(0, (room.cy + s.b) * CELL - FLOOR_Z / 2);
      ctx.moveTo(x0 + 2, y); ctx.lineTo(x0 + CELL * scale - 2, y);
    } else {
      const [x,] = w2c((room.cx + s.a) * CELL - FLOOR_X / 2, 0);
      const [, y0] = w2c(0, (room.cy + s.b) * CELL - FLOOR_Z / 2);
      ctx.moveTo(x, y0 + 2); ctx.lineTo(x, y0 + CELL * scale - 2);
    }
    ctx.stroke();
  }

  function drawGhost() {
    ctx.globalAlpha = 0.55;
    if (ghost.kind === 'furniture') {
      const { cell, type, rot, dept: deptId, valid } = ghost;
      const room = layout.rooms[deptId];
      const w = roomCellWorld(layout, deptId, cell.cx - room.cx, cell.cy - room.cy);
      const [x, y] = w2c(w.x, w.z);
      const seg = CELL * scale;
      ctx.fillStyle = valid ? 'rgba(55,201,165,.5)' : 'rgba(245,107,107,.5)';
      rr(ctx, x - seg * 0.42, y - seg * 0.42, seg * 0.84, seg * 0.84, seg * 0.14);
      ctx.fill();
      ctx.fillStyle = '#e8eef7';
      ctx.font = `${Math.max(10, seg * 0.5)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(valid ? FURNITURE_MAP[type].icon : '✕', x, y + seg * 0.18);
    } else {
      const rect = ghost.kind === 'room'
        ? { cx: ghost.data.cx, cy: ghost.data.cy, w: layout.rooms[ghost.data.dept].w, h: layout.rooms[ghost.data.dept].h }
        : ghost.data.rect;
      const [x, y] = w2c(rect.cx * CELL - FLOOR_X / 2, rect.cy * CELL - FLOOR_Z / 2);
      const w = rect.w * CELL * scale, h = rect.h * CELL * scale;
      ctx.fillStyle = ghost.valid ? 'rgba(55,201,165,.28)' : 'rgba(245,107,107,.32)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = ghost.valid ? '#37c9a5' : '#f56b6b';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, w, h);
    }
    ctx.globalAlpha = 1;
    if (ghost && !ghost.valid && ghost.reason) {
      ctx.fillStyle = '#f56b6b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('✕ ' + ghost.reason, 14, 20);
    }
  }

  function hexA(hex, a) {
    const n = hex.replace('#', '');
    const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- 编辑操作（校验 → 数据 → autoSave → onChanged → 重绘） ----------
  function notify(msg, kind) { if (onToast) onToast(msg, kind || 'info'); }
  function afterChange() {
    try { autoSave(state); } catch (e) { /* 忽略 */ }
    if (onChanged) onChanged();
    draw();
  }

  function placeFurniture(deptId, cell, type, rot) {
    const f = FURNITURE_MAP[type];
    const room = layout.rooms[deptId];
    const v = validateFurniturePlace(layout, deptId, { type, cx: cell.cx - room.cx, cy: cell.cy - room.cy, rot }, deptHeadcounts(state));
    if (!v.ok) { notify(v.reason, 'warn'); return false; }
    if (state.company.cash < f.cost) { notify('资金不足', 'bad'); return false; }
    state.company.cash -= f.cost;
    layout.items.push({
      uid: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      type, dept: deptId, cx: cell.cx - room.cx, cy: cell.cy - room.cy, rot,
    });
    notify(`${f.name} 已就位（-¥${(f.cost / 1e4).toFixed(1)}万）`, 'good');
    afterChange();
    return true;
  }
  function moveItem(uidKey, cell) {
    const it = layout.items.find((x) => x.uid === uidKey);
    if (!it) return false;
    const room = layout.rooms[it.dept];
    const nlx = cell.cx - room.cx, nly = cell.cy - room.cy;
    if (nlx === it.cx && nly === it.cy) return false;
    const v = validateFurniturePlace(layout, it.dept, { type: it.type, cx: nlx, cy: nly, rot: it.rot }, deptHeadcounts(state), { skipItem: uidKey });
    if (!v.ok) { notify(v.reason, 'warn'); return false; }
    it.cx = nlx; it.cy = nly;
    afterChange();
    return true;
  }
  function rotateItem(uidKey) {
    const it = layout.items.find((x) => x.uid === uidKey);
    if (!it) return;
    it.rot = ((it.rot || 0) + 1) % 4;
    afterChange();
  }
  function sellItem(uidKey) {
    const idx = layout.items.findIndex((x) => x.uid === uidKey);
    if (idx < 0) return;
    const it = layout.items[idx];
    const refund = Math.round(FURNITURE_MAP[it.type].cost / 2);
    state.company.cash += refund;
    layout.items.splice(idx, 1);
    notify(`已拆除，退还 ¥${(refund / 1e4).toFixed(1)}万`, 'good');
    afterChange();
  }
  function moveRoom(deptId, topLeft) {
    const room = layout.rooms[deptId];
    const v = validateRoomPlace(layout, deptId, { ...room, cx: topLeft.cx, cy: topLeft.cy }, deptHeadcounts(state));
    if (!v.ok) { notify(v.reason, 'warn'); return false; }
    room.cx = topLeft.cx; room.cy = topLeft.cy;
    autoDoor(layout, deptId);
    afterChange();
    return true;
  }
  function resizeRoom(deptId, rect) {
    const v = validateRoomPlace(layout, deptId, rect, deptHeadcounts(state));
    if (!v.ok) { notify(v.reason, 'warn'); return false; }
    const room = layout.rooms[deptId];
    const outside = layout.items.filter((i) => i.dept === deptId && (i.cx >= rect.w || i.cy >= rect.h));
    for (const it of outside) {
      state.company.cash += FURNITURE_MAP[it.type].cost;
      layout.items.splice(layout.items.indexOf(it), 1);
    }
    room.cx = rect.cx; room.cy = rect.cy; room.w = rect.w; room.h = rect.h;
    autoDoor(layout, deptId);
    if (outside.length) notify(`房间缩小：${outside.length} 件界外家具已按原价回收`, 'info');
    afterChange();
    return true;
  }
  function toggleWall(deptId, edge) {
    const p = PARTITIONS_MAP.wall;
    const v = validateEdgeToggle(layout, deptId, edge, deptHeadcounts(state));
    if (!v.ok) { notify(v.reason, 'warn'); return; }
    if (v.removed) {
      const idx = layout.edges.findIndex((e) => e.dept === deptId && e.orient === edge.orient && e.ex === edge.ex && e.ey === edge.ey);
      state.company.cash += Math.round(p.cost / 2);
      layout.edges.splice(idx, 1);
      notify('隔墙已拆除（退一半）', 'good');
    } else {
      if (state.company.cash < p.cost) { notify('资金不足', 'bad'); return; }
      state.company.cash -= p.cost;
      layout.edges.push({ ...edge, dept: deptId });
      notify('隔墙已安装', 'good');
    }
    afterChange();
  }
  function moveDoor(deptId, side, t) {
    const v = validateDoorMove(layout, deptId, side, t);
    if (!v.ok) { notify(v.reason, 'warn'); return; }
    layout.rooms[deptId].door = { side, t };
    afterChange();
  }

  // ---------- 指针交互 ----------
  function ptr(e) {
    const r = cv.getBoundingClientRect();
    return c2w(e.clientX - r.left, e.clientY - r.top);
  }
  function cellOf(e) {
    const w = ptr(e);
    return worldToCell(w.x, w.z);
  }
  function cancelGhost() { ghost = null; dragItem = null; dragRoom = null; resize = null; draw(); }

  cv.addEventListener('pointerdown', (e) => {
    if (e.button === 2) { cancelGhost(); return; }
    const cell = cellOf(e);
    if (ghost && ghost.kind === 'room') {
      if (ghost.valid && moveRoom(ghost.data.dept, { cx: ghost.data.cx, cy: ghost.data.cy })) cancelGhost();
      return;
    }
    if (ghost && ghost.kind === 'resize') {
      if (ghost.valid) resizeRoomFn(ghost.data.dept, ghost.data.rect);
      cancelGhost();
      return;
    }
    if (dragItem) {
      if (moveItem(dragItem, cell)) { dragItem = null; selectedUid = null; }
      draw();
      return;
    }
    const deptId = roomAt(layout, cell.cx, cell.cy);
    if (tool === 'select') {
      const it = deptId && layout.items.find((i) => i.dept === deptId
        && i.cx === cell.cx - layout.rooms[deptId].cx && i.cy === cell.cy - layout.rooms[deptId].cy);
      if (it) { dragItem = it.uid; selectedUid = it.uid; }
      else selectedUid = null;
      draw();
      return;
    }
    if (tool.startsWith('furniture:')) {
      if (!deptId) { notify('请点击部门房间内部', 'info'); return; }
      placeFurniture(deptId, cell, tool.split(':')[1], ghostRot);
      return;
    }
    if (tool === 'remove') {
      if (!deptId) return;
      const it = layout.items.find((i) => i.dept === deptId
        && i.cx === cell.cx - layout.rooms[deptId].cx && i.cy === cell.cy - layout.rooms[deptId].cy);
      if (!it) { notify('这里没有家具', 'info'); return; }
      sellItem(it.uid);
      return;
    }
    if (tool === 'move-room') {
      if (!deptId) { notify('请点击要移动的房间', 'info'); return; }
      dragRoom = { dept: deptId };
      return;
    }
    if (tool === 'resize') {
      if (!deptId) { notify('请点击要调整的房间', 'info'); return; }
      const r = layout.rooms[deptId];
      const fx = cell.cx < r.cx + r.w / 2 ? r.cx + r.w : r.cx;
      const fy = cell.cy < r.cy + r.h / 2 ? r.cy + r.h : r.cy;
      resize = { dept: deptId, corner: [fx, fy] };
      return;
    }
    if (tool === 'wall' || tool === 'door') {
      if (!deptId) return;
      const room = layout.rooms[deptId];
      const lx = cell.cx - room.cx, ly = cell.cy - room.cy;
      const w = ptr(e);
      const center = cellToWorld(cell.cx, cell.cy);
      const dx = w.x - center.x, dz = w.z - center.z;
      if (tool === 'wall') {
        const edge = Math.abs(dx) > Math.abs(dz)
          ? { orient: 'v', ex: lx + (dx > 0 ? 1 : 0), ey: ly }
          : { orient: 'h', ex: lx, ey: ly + (dz > 0 ? 1 : 0) };
        toggleWall(deptId, edge);
      } else {
        const onEdge = lx === 0 || ly === 0 || lx === room.w - 1 || ly === room.h - 1;
        if (!onEdge) { notify('点击房间边缘格来移动门位', 'info'); return; }
        let side, t;
        if (lx === room.w - 1 && Math.abs(dx) >= Math.abs(dz)) { side = 'E'; t = ly; }
        else if (lx === 0 && Math.abs(dx) >= Math.abs(dz)) { side = 'W'; t = ly; }
        else if (ly === room.h - 1) { side = 'S'; t = lx; }
        else { side = 'N'; t = lx; }
        moveDoor(deptId, side, t);
      }
    }
  });
  cv.addEventListener('pointermove', (e) => {
    const cell = cellOf(e);
    if (dragItem) {
      const it = layout.items.find((x) => x.uid === dragItem);
      if (!it) { dragItem = null; return; }
      const room = layout.rooms[it.dept];
      const nlx = cell.cx - room.cx, nly = cell.cy - room.cy;
      const v = validateFurniturePlace(layout, it.dept, { type: it.type, cx: nlx, cy: nly, rot: it.rot }, deptHeadcounts(state), { skipItem: it.uid });
      ghost = { kind: 'furniture', data: { dept: it.dept, cell, type: it.type, rot: it.rot }, valid: v.ok, reason: v.reason };
      draw();
      return;
    }
    if (dragRoom) {
      const room = layout.rooms[dragRoom.dept];
      const tl = { cx: cell.cx - Math.floor(room.w / 2), cy: cell.cy - Math.floor(room.h / 2) };
      const v = validateRoomPlace(layout, dragRoom.dept, { ...room, ...tl }, deptHeadcounts(state));
      ghost = { kind: 'room', data: { dept: dragRoom.dept, ...tl }, valid: v.ok, reason: v.reason };
      draw();
      return;
    }
    if (resize) {
      const room = layout.rooms[resize.dept];
      const [fx, fy] = resize.corner;
      const nw = Math.max(ROOM_MIN, Math.min(ROOM_MAX, Math.abs(cell.cx - fx) + 1));
      const nh = Math.max(ROOM_MIN, Math.min(ROOM_MAX, Math.abs(cell.cy - fy) + 1));
      const rect = { cx: fx <= cell.cx ? fx : fx - nw + 1, cy: fy <= cell.cy ? fy : fy - nh + 1, w: nw, h: nh };
      const v = validateRoomPlace(layout, resize.dept, rect, deptHeadcounts(state));
      ghost = { kind: 'resize', data: { dept: resize.dept, rect }, valid: v.ok, reason: v.reason };
      draw();
      return;
    }
    if (tool.startsWith('furniture:')) {
      const deptId = roomAt(layout, cell.cx, cell.cy);
      if (deptId) {
        const room = layout.rooms[deptId];
        const v = validateFurniturePlace(layout, deptId, { type: tool.split(':')[1], cx: cell.cx - room.cx, cy: cell.cy - room.cy, rot: ghostRot }, deptHeadcounts(state));
        ghost = { kind: 'furniture', data: { dept: deptId, cell, type: tool.split(':')[1], rot: ghostRot }, valid: v.ok, reason: v.reason };
      } else ghost = null;
      draw();
    }
  });
  cv.addEventListener('pointerup', (e) => {
    const cell = cellOf(e);
    if (dragItem) { if (moveItem(dragItem, cell)) { dragItem = null; } draw(); return; }
    if (dragRoom) {
      const room = layout.rooms[dragRoom.dept];
      if (moveRoom(dragRoom.dept, { cx: cell.cx - Math.floor(room.w / 2), cy: cell.cy - Math.floor(room.h / 2) })) dragRoom = null;
      cancelGhost();
      return;
    }
    if (resize) {
      if (ghost && ghost.kind === 'resize' && ghost.valid) resizeRoomFn(ghost.data.dept, ghost.data.rect);
      cancelGhost();
      return;
    }
  });
  function resizeRoomFn(deptId, rect) {
    const room = layout.rooms[deptId];
    const outside = layout.items.filter((i) => i.dept === deptId && (i.cx >= rect.w || i.cy >= rect.h));
    for (const it of outside) {
      state.company.cash += FURNITURE_MAP[it.type].cost;
      layout.items.splice(layout.items.indexOf(it), 1);
    }
    room.cx = rect.cx; room.cy = rect.cy; room.w = rect.w; room.h = rect.h;
    autoDoor(layout, deptId);
    if (outside.length) notify(`房间缩小：${outside.length} 件界外家具已按原价回收`, 'info');
    afterChange();
  }

  function onKey(e) {
    if (e.key === 'r' || e.key === 'R') {
      ghostRot = (ghostRot + 1) % 4;
      if (ghost && ghost.kind === 'furniture') {
        const d = ghost.data;
        const room = layout.rooms[d.dept];
        const v = validateFurniturePlace(layout, d.dept, { type: d.type, cx: d.cell.cx - room.cx, cy: d.cell.cy - room.cy, rot: ghostRot }, deptHeadcounts(state));
        ghost = { ...ghost, data: { ...ghost.data, rot: ghostRot }, valid: v.ok, reason: v.reason };
        draw();
      }
      if (dragItem) rotateItem(dragItem);
    }
    if (e.key === 'Escape') cancelGhost();
  }
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', draw);

  renderToolbar();
  draw();

  function destroy() {
    dead = true;
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', draw);
    overlay.remove();
    if (onClose) onClose();
  }

  return { destroy };
}
