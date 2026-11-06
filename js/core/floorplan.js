// 楼层平面规划共享逻辑层（v0.8.0 办公室系统重做）
//
// 一切关于办公室楼层的数据、校验、寻路都在这里；3D 编辑器（office.js）与
// 2D 平面规划页（floorplan2d.js）只做渲染与拾取，**校验一律调用本模块**——双端行为永远一致。
//
// 坐标系约定：
// - 楼层网格：CELL=4 世界单位，FLOOR_W×FLOOR_H 格；cell (cx,cy) 中心世界坐标 =
//   ((cx + 0.5) * CELL - FLOOR_W*CELL/2, (cy + 0.5) * CELL - FLOOR_H*CELL/2)，原点=楼层中心
// - 房间：rooms[deptId] = { cx, cy, w, h }（楼层格坐标，cx/cy=西北角）
// - 家具：items = { uid, type, dept, cx, cy, rot }（cx/cy=房间内局部格，随房间移动）
// - 内置工位：不入 items，按部门人数派生（builtinDesks），容量 = 用户 desk + 内置工位
// - 门：rooms[deptId].door = { side: 'N'|'S'|'E'|'W', t }（t=沿该侧的格序号）
import { DEPT_DEFS } from '../data/depts.js';

export const CELL = 4;                       // 网格边长（世界单位）
export const FLOOR_W = 32;                   // 楼层宽（格）= 128 世界单位
export const FLOOR_H = 22;                   // 楼层深（格）= 88 世界单位
export const FLOOR_X = FLOOR_W * CELL;       // 128
export const FLOOR_Z = FLOOR_H * CELL;       // 88
export const ROOM_MIN = 3;
export const ROOM_MAX = 8;
export const WALL_H = 7.2;
export const MAX_SEATS_PER_DEPT = 12;        // 每部门内置工位上限（与旧版一致，超出共用工位）

// 入口区（南中 4×2 格）：不可建造，员工进出通道
export const ENTRANCE_RECT = { cx: 14, cy: FLOOR_H - 2, w: 4, h: 2 };
export const ENTRANCE_CELL = { cx: ENTRANCE_RECT.cx + 1, cy: ENTRANCE_RECT.cy - 1 }; // 入口步行点（区北侧）

const DEPT_IDS = DEPT_DEFS.slice(0, 9).map((d) => d.id);
export const DEPT_IDS_9 = DEPT_IDS;

// ---------- 坐标换算 ----------
export function cellToWorld(cx, cy) {
  return {
    x: (cx + 0.5) * CELL - FLOOR_X / 2,
    z: (cy + 0.5) * CELL - FLOOR_Z / 2,
  };
}
export function worldToCell(x, z) {
  return {
    cx: Math.floor((x + FLOOR_X / 2) / CELL),
    cy: Math.floor((z + FLOOR_Z / 2) / CELL),
  };
}
// 房间内局部格 (lx, ly) → 世界坐标（随房间移动）
export function roomCellWorld(layout, deptId, lx, ly) {
  const r = layout.rooms[deptId];
  if (!r) return null;
  return cellToWorld(r.cx + lx, r.cy + ly);
}
export function roomAt(layout, cx, cy) {
  for (const id of DEPT_IDS) {
    const r = layout.rooms[id];
    if (!r) continue;
    if (cx >= r.cx && cx < r.cx + r.w && cy >= r.cy && cy < r.cy + r.h) return id;
  }
  return null;
}
export function inEntrance(cx, cy) {
  return cx >= ENTRANCE_RECT.cx && cx < ENTRANCE_RECT.cx + ENTRANCE_RECT.w
    && cy >= ENTRANCE_RECT.cy && cy < ENTRANCE_RECT.cy + ENTRANCE_RECT.h;
}
const inFloor = (cx, cy) => cx >= 0 && cy >= 0 && cx < FLOOR_W && cy < FLOOR_H;

// ---------- 默认布局与迁移 ----------
// 默认双排：北 5 间（cy=2），南 4 间（cy=15），中间 7 格走廊带（可整房拖放）；
// 北排右侧留 2 格、南排两侧留 4 格松弛，保证初始布局就有可用的自由空间
export function defaultRooms() {
  const rooms = {};
  DEPT_IDS.forEach((id, i) => {
    rooms[id] = i < 5
      ? { cx: i * 6, cy: 2, w: 6, h: 6, door: { side: 'S', t: 2 } }
      : { cx: 4 + (i - 5) * 6, cy: 14, w: 6, h: 6, door: { side: 'N', t: 2 } };
  });
  return rooms;
}

// v1（{items, edges}，房间位置硬编码）→ v2（{v:2, rooms, items, edges}）
export function migrateV1(old) {
  const layout = {
    v: 2,
    rooms: defaultRooms(),
    items: Array.isArray(old?.items) ? old.items : [],
    edges: Array.isArray(old?.edges) ? old.edges : [],
  };
  return normalizeLayout(layout);
}

// sanitize 过滤：非法 type / 越界 / 坏 dept / 坏 door 全部剔除或修正
export function normalizeLayout(layout) {
  const out = {
    v: 2,
    rooms: layout?.rooms && typeof layout.rooms === 'object' ? { ...layout.rooms } : defaultRooms(),
    items: [],
    edges: [],
  };
  for (const id of DEPT_IDS) {
    const r = out.rooms[id];
    if (!r || !Number.isFinite(r.cx) || !Number.isFinite(r.cy)) { out.rooms[id] = defaultRooms()[id]; continue; }
    r.w = Math.max(ROOM_MIN, Math.min(ROOM_MAX, Math.round(r.w) || 6));
    r.h = Math.max(ROOM_MIN, Math.min(ROOM_MAX, Math.round(r.h) || 6));
    r.cx = Math.max(0, Math.min(FLOOR_W - r.w, Math.round(r.cx) || 0));
    r.cy = Math.max(0, Math.min(FLOOR_H - r.h, Math.round(r.cy) || 0));
    if (!r.door || !['N', 'S', 'E', 'W'].includes(r.door.side)) autoDoor(out, id);
    else clampDoor(out, id);
  }
  const okType = new Set(['desk', 'plant', 'sofa', 'coffee', 'printer', 'rack']);
  let uid = 1;
  for (const it of layout?.items || []) {
    if (!it || !okType.has(it.type) || !DEPT_IDS.includes(it.dept)) continue;
    const r = out.rooms[it.dept];
    const cx = Math.round(it.cx); const cy = Math.round(it.cy);
    if (!(cx >= 0 && cy >= 0 && cx < r.w && cy < r.h)) continue;
    out.items.push({
      uid: it.uid || 'f' + (uid++),
      type: it.type, dept: it.dept, cx, cy,
      rot: ((Math.round(it.rot) || 0) % 4 + 4) % 4,
    });
  }
  const okPart = new Set(['wall', 'door']);
  for (const ed of layout?.edges || []) {
    if (!ed || !okPart.has(ed.type) || !DEPT_IDS.includes(ed.dept)) continue;
    const r = out.rooms[ed.dept];
    const ex = Math.round(ed.ex); const ey = Math.round(ed.ey);
    // 周界边由房间模型自动生成，旧档里贴周界的用户隔墙直接剔除
    if (ed.orient === 'h' && (ey <= 0 || ey >= r.h)) continue;
    if (ed.orient === 'v' && (ex <= 0 || ex >= r.w)) continue;
    if (ed.orient === 'h' && !(ex >= 0 && ex < r.w && ey >= 0 && ey <= r.h)) continue;
    if (ed.orient === 'v' && !(ex >= 0 && ex <= r.w && ey >= 0 && ey < r.h)) continue;
    out.edges.push({ type: ed.type, dept: ed.dept, orient: ed.orient, ex, ey });
  }
  return out;
}

// ---------- 房间几何 ----------
export function roomCells(room) {
  const cells = [];
  for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) cells.push({ cx: room.cx + x, cy: room.cy + y });
  return cells;
}
export function roomsOverlap(a, b) {
  return a.cx < b.cx + b.w && b.cx < a.cx + a.w && a.cy < b.cy + b.h && b.cy < a.cy + a.h;
}

// 门 → 内/外格（外格=门洞旁的走廊格）
export function doorCells(layout, deptId) {
  const r = layout.rooms[deptId];
  if (!r) return null;
  const d = r.door;
  if (d.side === 'S') return { inner: { cx: r.cx + d.t, cy: r.cy + r.h - 1 }, outer: { cx: r.cx + d.t, cy: r.cy + r.h } };
  if (d.side === 'N') return { inner: { cx: r.cx + d.t, cy: r.cy }, outer: { cx: r.cx + d.t, cy: r.cy - 1 } };
  if (d.side === 'E') return { inner: { cx: r.cx + r.w - 1, cy: r.cy + d.t }, outer: { cx: r.cx + r.w, cy: r.cy + d.t } };
  return { inner: { cx: r.cx, cy: r.cy + d.t }, outer: { cx: r.cx - 1, cy: r.cy + d.t } }; // W
}

// 自动选门：邻接可走走廊格最多的一侧；平手取离入口更近的一侧
export function autoDoor(layout, deptId) {
  const r = layout.rooms[deptId];
  const others = DEPT_IDS.filter((id) => id !== deptId).map((id) => layout.rooms[id]);
  const openOn = (side, t) => {
    const probe = { cx: r.cx, cy: r.cy, w: r.w, h: r.h, door: { side, t } };
    const dc = doorCells({ rooms: { [deptId]: probe } }, deptId);
    if (!dc || !inFloor(dc.outer.cx, dc.outer.cy) || inEntrance(dc.outer.cx, dc.outer.cy)) return false;
    return !others.some((o) => o && dc.outer.cx >= o.cx && dc.outer.cx < o.cx + o.w && dc.outer.cy >= o.cy && dc.outer.cy < o.cy + o.h);
  };
  let best = null;
  for (const side of ['S', 'N', 'E', 'W']) {
    const n = side === 'N' || side === 'S' ? r.w : r.h;
    let count = 0;
    for (let t = 0; t < n; t++) if (openOn(side, t)) count++;
    const weight = count * 100 + (side === 'S' ? 3 : side === 'E' ? 2 : side === 'W' ? 1 : 0); // 南侧优先（近大门）
    if (count > 0 && (!best || weight > best.weight)) best = { side, weight, n };
  }
  if (!best) { r.door = { side: 'S', t: Math.floor(r.w / 2) }; return; } // 兜底：被围死时仍给一扇门（校验层会报不可达）
  // 取该侧居中的开放 t
  const mid = Math.floor(best.n / 2);
  let t = mid, span = 0;
  for (let off = 0; off < best.n; off++) {
    for (const cand of [mid + off, mid - off]) {
      if (cand >= 0 && cand < best.n && openOn(best.side, cand)) { t = cand; span = 1; break; }
    }
    if (span) break;
  }
  r.door = { side: best.side, t };
}
function clampDoor(layout, deptId) {
  const r = layout.rooms[deptId];
  const n = r.door.side === 'N' || r.door.side === 'S' ? r.w : r.h;
  r.door.t = Math.max(0, Math.min(n - 1, Math.round(r.door.t) || 0));
}

// ---------- 楼层导航（走廊 BFS） ----------
export function floorWalkable(layout) {
  const walk = new Set();
  const roomCellSet = new Set();
  for (const id of DEPT_IDS) for (const c of roomCells(layout.rooms[id])) roomCellSet.add(c.cx + ',' + c.cy);
  for (let cy = 0; cy < FLOOR_H; cy++) {
    for (let cx = 0; cx < FLOOR_W; cx++) {
      if (!roomCellSet.has(cx + ',' + cy)) walk.add(cx + ',' + cy);
    }
  }
  return walk;
}
// 从入口 BFS：返回 { dist: Map, prev: Map }；不可达房间在 reachability 里报
export function floorBFS(layout, start = ENTRANCE_CELL) {
  const walk = floorWalkable(layout);
  const startKey = start.cx + ',' + start.cy;
  const dist = new Map([[startKey, 0]]);
  const prev = new Map();
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    const d = dist.get(cur.cx + ',' + cur.cy);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.cx + dx, ny = cur.cy + dy;
      const k = nx + ',' + ny;
      if (!walk.has(k) || dist.has(k)) continue;
      dist.set(k, d + 1);
      prev.set(k, cur);
      q.push({ cx: nx, cy: ny });
    }
  }
  return { dist, prev, walk };
}
// 可达性：每个房间的门外格必须能从入口走到
export function reachability(layout) {
  const { dist } = floorBFS(layout);
  const bad = [];
  for (const id of DEPT_IDS) {
    const dc = doorCells(layout, id);
    if (!dc) continue;
    if (!dist.has(dc.outer.cx + ',' + dc.outer.cy)) bad.push(id);
  }
  return { ok: bad.length === 0, bad };
}
function bfsPath(layout, from, to) {
  const { dist, prev } = floorBFS(layout, from);
  const tk = to.cx + ',' + to.cy;
  if (!dist.has(tk)) return null;
  const path = [];
  let cur = to;
  while (!(cur.cx === from.cx && cur.cy === from.cy)) {
    path.push(cur);
    cur = prev.get(cur.cx + ',' + cur.cy);
    if (!cur) return null;
  }
  path.push(from);
  return path.reverse();
}

// ---------- 房内导航（家具阻挡 / 隔墙=边阻挡） ----------
function roomBlockedCells(layout, deptId, extraBlocked) {
  const r = layout.rooms[deptId];
  const blocked = new Set();
  for (const it of layout.items) {
    if (it.dept !== deptId) continue;
    if (extraBlocked && extraBlocked.skipItem === it.uid) continue;
    blocked.add(it.cx + ',' + it.cy);
  }
  if (extraBlocked && extraBlocked.cells) for (const c of extraBlocked.cells) blocked.add(c.cx + ',' + c.cy);
  return blocked;
}
function roomEdgeBlocked(layout, deptId) {
  const set = new Set();
  for (const ed of layout.edges) {
    if (ed.dept !== deptId || ed.type !== 'wall') continue; // door 不阻挡
    // 房内局部边：h 边沿 x（ex∈0..w-1，ey∈1..h-1 内部横线），v 边沿 z
    if (ed.orient === 'h') set.add(`H:${ed.ex}:${ed.ey}`);
    else set.add(`V:${ed.ex}:${ed.ey}`);
  }
  return set;
}
// 房内 BFS：from/to 为房内局部格；返回局部格路径（含首尾）或 null
export function roomLocalPath(layout, deptId, from, to, extraBlocked) {
  const r = layout.rooms[deptId];
  if (!r) return null;
  const blocked = roomBlockedCells(layout, deptId, extraBlocked);
  const edges = roomEdgeBlocked(layout, deptId);
  const key = (lx, ly) => lx + ',' + ly;
  if (blocked.has(key(from.lx, from.ly)) && !(from.lx === to.lx && from.ly === to.ly)) return null;
  const dist = new Map([[key(from.lx, from.ly), 0]]);
  const prev = new Map();
  const q = [{ lx: from.lx, ly: from.ly }];
  const passEdge = (lx, ly, dx, dy) => {
    // 跨越 (lx,ly)→(lx+dx,ly+dy) 的内部边是否被隔墙挡住
    if (dx === 1) return !edges.has(`V:${lx + 1}:${ly}`);
    if (dx === -1) return !edges.has(`V:${lx}:${ly}`);
    if (dy === 1) return !edges.has(`H:${lx}:${ly + 1}`);
    return !edges.has(`H:${lx}:${ly}`);
  };
  while (q.length) {
    const cur = q.shift();
    const d = dist.get(key(cur.lx, cur.ly));
    if (cur.lx === to.lx && cur.ly === to.ly) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.lx + dx, ny = cur.ly + dy;
      if (nx < 0 || ny < 0 || nx >= r.w || ny >= r.h) continue; // 周界（除门）
      const k = nx + ',' + ny;
      if (dist.has(k)) continue;
      if (blocked.has(k) && !(nx === to.lx && ny === to.ly)) continue; // 目的地若是家具格（坐下）允许
      if (!passEdge(cur.lx, cur.ly, dx, dy)) continue;
      dist.set(k, d + 1);
      prev.set(k, cur);
      q.push({ lx: nx, ly: ny });
    }
  }
  const tk = key(to.lx, to.ly);
  if (!dist.has(tk)) return null;
  const path = [];
  let cur = to;
  while (!(cur.lx === from.lx && cur.ly === from.ly)) {
    path.push(cur);
    cur = prev.get(key(cur.lx, cur.ly));
    if (!cur) return null;
  }
  path.push(from);
  return path.reverse();
}

// ---------- 内置工位（派生，不入 items） ----------
export function deptHeadcounts(state) {
  const out = {};
  for (const id of DEPT_IDS) out[id] = 0;
  for (const e of state.employees || []) if (out[e.deptId] !== undefined) out[e.deptId]++;
  return out;
}
// 内置工位：每部门 min(人数, 上限) 个，按房内行序落位在空闲格（rot=0，人坐南侧）
export function builtinDesks(layout, headcounts) {
  const out = [];
  for (const id of DEPT_IDS) {
    const r = layout.rooms[id];
    if (!r) continue;
    const user = new Set();
    for (const it of layout.items) if (it.dept === id) user.add(it.cx + ',' + it.cy);
    const dc = doorCells(layout, id);
    let placed = 0;
    const need = Math.min(headcounts[id] || 0, MAX_SEATS_PER_DEPT);
    for (let ly = 0; ly < r.h && placed < need; ly++) {
      for (let lx = 0; lx < r.w && placed < need; lx++) {
        if (user.has(lx + ',' + ly)) continue;
        if (lx === dc.inner.cx - r.cx && ly === dc.inner.cy - r.cy) continue; // 让开门内格
        // 避免完全堵门：门内格正后方一格也不放（保证进房第一步可走）
        out.push({ dept: id, lx, ly, rot: 0, builtin: true });
        placed++;
      }
    }
  }
  return out;
}
// desk 的工位（坐位）世界坐标与朝向：人坐在桌子背对显示器一侧
export function seatForDesk(layout, deptId, lx, ly, rot) {
  const w = roomCellWorld(layout, deptId, lx, ly);
  const off = [[0, 2.3], [2.3, 0], [0, -2.3], [-2.3, 0]][rot % 4];
  const world = { x: w.x + off[0], z: w.z + off[1] };
  return { x: world.x, z: world.z, rot: Math.PI + rot * Math.PI / 2 };
}

// ---------- 校验 ----------
// 房间移动/调尺寸：越界 / 与其他房间重叠 / 压入口区 / 移动后存在房间不可达
export function validateRoomPlace(layout, deptId, room, headcounts) {
  if (room.w < ROOM_MIN || room.h < ROOM_MIN || room.w > ROOM_MAX || room.h > ROOM_MAX) {
    return { ok: false, reason: `房间尺寸需在 ${ROOM_MIN}×${ROOM_MIN} ~ ${ROOM_MAX}×${ROOM_MAX} 格之间` };
  }
  if (room.cx < 0 || room.cy < 0 || room.cx + room.w > FLOOR_W || room.cy + room.h > FLOOR_H) {
    return { ok: false, reason: '房间超出楼层范围' };
  }
  for (const id of DEPT_IDS) {
    if (id === deptId) continue;
    if (roomsOverlap(room, layout.rooms[id])) return { ok: false, reason: '与其他房间重叠' };
  }
  for (let cy = room.cy; cy < room.cy + room.h; cy++) {
    for (let cx = room.cx; cx < room.cx + room.w; cx++) {
      if (inEntrance(cx, cy)) return { ok: false, reason: '不能挡住入口大厅' };
    }
  }
  // 试摆后校验可达性（门自动重指派）
  const trial = {
    v: 2,
    rooms: { ...layout.rooms, [deptId]: { cx: room.cx, cy: room.cy, w: room.w, h: room.h } },
    items: layout.items, edges: layout.edges,
  };
  autoDoor(trial, deptId);
  const reach = reachability(trial);
  if (!reach.ok) {
    const name = DEPT_DEFS[DEPT_IDS_9.indexOf(reach.bad[0])]?.name || reach.bad[0];
    return { ok: false, reason: `移动后 ${name} 无法从大门到达` };
  }
  // 家具溢出统计（缩小房间时界外家具将被回收）
  const overflow = layout.items.filter((it) => {
    if (it.dept !== deptId) return false;
    return it.cx >= room.w || it.cy >= room.h;
  }).length;
  return { ok: true, overflow };
}

// 家具放置/移动：房内界内、格空闲（含内置工位）、放完不隔断门与各工位
export function validateFurniturePlace(layout, deptId, item, headcounts, extra) {
  const r = layout.rooms[deptId];
  if (!r) return { ok: false, reason: '部门不存在' };
  if (item.cx < 0 || item.cy < 0 || item.cx >= r.w || item.cy >= r.h) {
    return { ok: false, reason: '超出房间范围' };
  }
  const dc = doorCells(layout, deptId);
  const doorLocal = { lx: dc.inner.cx - r.cx, ly: dc.inner.cy - r.cy };
  if (item.cx === doorLocal.lx && item.cy === doorLocal.ly) return { ok: false, reason: '不能堵在门口' };
  const taken = layout.items.find((i) => i.dept === deptId && i.cx === item.cx && i.cy === item.cy
    && (!extra || extra.skipItem !== i.uid));
  if (taken) return { ok: false, reason: '该格已有家具' };
  const bd = builtinDesks({ rooms: layout.rooms, items: layout.items.filter((i) => !(extra && extra.skipItem === i.uid)) }, headcounts);
  if (bd.some((d) => d.dept === deptId && d.lx === item.cx && d.ly === item.cy)) {
    return { ok: false, reason: '该格是员工工位' };
  }
  // 连通性：门内格 ↔ 每个有人的工位坐格必须互通（新家具视为阻挡）
  const trialItems = layout.items.filter((i) => !(extra && extra.skipItem === i.uid));
  const trial = { rooms: layout.rooms, items: [...trialItems, { ...item, dept: deptId }], edges: layout.edges };
  const seats = builtinDesks({ rooms: layout.rooms, items: trialItems }, headcounts)
    .filter((d) => d.dept === deptId)
    .map((d) => ({ lx: d.lx, ly: d.ly }));
  const targets = [doorLocal, ...seats.map((d) => ({ lx: d.lx + 0, ly: d.ly }))];
  for (const t of targets) {
    const p = roomLocalPath(trial, deptId, doorLocal, t, { cells: [] });
    if (!p) return { ok: false, reason: '会堵住房间通道' };
  }
  return { ok: true };
}

// 隔墙切换：加墙后门内格 ↔ 工位格必须仍互通
export function validateEdgeToggle(layout, deptId, edge, headcounts) {
  const r = layout.rooms[deptId];
  if (!r) return { ok: false, reason: '部门不存在' };
  const dc = doorCells(layout, deptId);
  const doorLocal = { lx: dc.inner.cx - r.cx, ly: dc.inner.cy - r.cy };
  const has = layout.edges.find((e) => e.dept === deptId && e.orient === edge.orient && e.ex === edge.ex && e.ey === edge.ey);
  const edges = has
    ? layout.edges.filter((e) => e !== has)
    : [...layout.edges, { ...edge, dept: deptId }];
  // 门的连通性：若把墙加在房间周界上，周界由房间模型管理，禁止
  if (edge.orient === 'h' && (edge.ey === 0 || edge.ey === r.h)) return { ok: false, reason: '周界墙由房间自动生成' };
  if (edge.orient === 'v' && (edge.ex === 0 || edge.ex === r.w)) return { ok: false, reason: '周界墙由房间自动生成' };
  const trial = { rooms: layout.rooms, items: layout.items, edges };
  const seats = builtinDesks(layout, headcounts).filter((d) => d.dept === deptId).map((d) => ({ lx: d.lx, ly: d.ly }));
  for (const t of [doorLocal, ...seats]) {
    if (!roomLocalPath(trial, deptId, doorLocal, t)) return { ok: false, reason: '隔墙会堵住房间通道' };
  }
  return { ok: true, removed: !!has };
}

// 门移位：目标边必须邻接可走走廊
export function validateDoorMove(layout, deptId, side, t) {
  const r = layout.rooms[deptId];
  const probe = { ...r, door: { side, t } };
  const dc = doorCells({ rooms: { [deptId]: probe } }, deptId);
  if (!inFloor(dc.outer.cx, dc.outer.cy) || inEntrance(dc.outer.cx, dc.outer.cy)) {
    return { ok: false, reason: '门外不是可通行的走廊' };
  }
  for (const id of DEPT_IDS) {
    if (id === deptId) continue;
    const o = layout.rooms[id];
    if (dc.outer.cx >= o.cx && dc.outer.cx < o.cx + o.w && dc.outer.cy >= o.cy && dc.outer.cy < o.cy + o.h) {
      return { ok: false, reason: '门外是另一间房' };
    }
  }
  return { ok: true };
}

// ---------- 跨区寻路：世界坐标 → 世界航点 ----------
// 从 from（世界坐标）到目标部门房间内的 to（世界坐标）；跨房经走廊 BFS，房内经房内 BFS
export function routePath(layout, headcounts, from, toDeptId, toLocal, extraBlocked) {
  const fromCell = worldToCell(from.x, from.z);
  const fromRoom = roomAt(layout, fromCell.cx, fromCell.cy);
  const toRoom = layout.rooms[toDeptId];
  const dcTo = doorCells(layout, toDeptId);
  const toInnerLocal = { lx: dcTo.inner.cx - toRoom.cx, ly: dcTo.inner.cy - toRoom.cy };
  const waypoints = [];
  const pushWorld = (p) => waypoints.push(p);
  const pushCell = (c) => pushWorld(cellToWorld(c.cx, c.cy));
  const pushRoomCell = (deptId, c) => pushWorld(roomCellWorld(layout, deptId, c.lx, c.ly));

  if (fromRoom === toDeptId) {
    const fromLocal = { lx: fromCell.cx - toRoom.cx, ly: fromCell.cy - toRoom.cy };
    const p = roomLocalPath(layout, toDeptId, fromLocal, toLocal, extraBlocked);
    if (p) { p.forEach((c) => pushRoomCell(toDeptId, c)); return waypoints; }
    pushWorld(toWorld(toDeptId, toLocal));
    return waypoints;
  }

  // 1) 出发房间 → 门口
  if (fromRoom) {
    const dcFrom = doorCells(layout, fromRoom);
    const fromLocal = { lx: fromCell.cx - layout.rooms[fromRoom].cx, ly: fromCell.cy - layout.rooms[fromRoom].cy };
    const innerLocal = { lx: dcFrom.inner.cx - layout.rooms[fromRoom].cx, ly: dcFrom.inner.cy - layout.rooms[fromRoom].cy };
    const p = roomLocalPath(layout, fromRoom, fromLocal, innerLocal, extraBlocked);
    if (p) p.forEach((c) => pushRoomCell(fromRoom, c));
    pushCell(dcFrom.outer);
  } else {
    pushWorld(from);
  }

  // 2) 走廊：当前位置门外格 → 目标门外格（BFS）
  const dcFromNow = fromRoom ? doorCells(layout, fromRoom) : null;
  const startCell = fromRoom ? dcFromNow.outer : fromCell;
  const corridor = bfsPath(layout, startCell, dcTo.outer);
  if (corridor && corridor.length > 1) corridor.slice(1, -1).forEach(pushCell);
  else if (!corridor) { pushCell(dcTo.outer); } // 不可达兜底：直线走过去（视觉上穿，但校验层会拦这种布局）

    // 3) 进目标房间：门外 → 门内 → 目标格
    pushCell(dcTo.outer);
    pushCell(dcTo.inner);
    const toLocalFromDoor = { lx: dcTo.inner.cx - toRoom.cx, ly: dcTo.inner.cy - toRoom.cy };
    if (!(toLocalFromDoor.lx === toLocal.lx && toLocalFromDoor.ly === toLocal.ly)) {
      const p = roomLocalPath(layout, toDeptId, toLocalFromDoor, toLocal, extraBlocked);
      if (p) p.slice(1).forEach((c) => pushRoomCell(toDeptId, c));
    }
    pushWorld(toWorld(toDeptId, toLocal));
    return waypoints;

  function toWorld(deptId, local) {
    return roomCellWorld(layout, deptId, local.lx, local.ly);
  }
}

// 走廊目标路由：从世界坐标出发到走廊上某格（晨会点/大门）；出房经门，走廊走 BFS
export function routeToCell(layout, from, toCell) {
  const fromCell = worldToCell(from.x, from.z);
  const fromRoom = roomAt(layout, fromCell.cx, fromCell.cy);
  const waypoints = [];
  if (fromRoom) {
    const dc = doorCells(layout, fromRoom);
    const r = layout.rooms[fromRoom];
    const fromLocal = { lx: fromCell.cx - r.cx, ly: fromCell.cy - r.cy };
    const innerLocal = { lx: dc.inner.cx - r.cx, ly: dc.inner.cy - r.cy };
    const p = roomLocalPath(layout, fromRoom, fromLocal, innerLocal);
    if (p) for (const c of p) waypoints.push(roomCellWorld(layout, fromRoom, c.lx, c.ly));
    waypoints.push(cellToWorld(dc.outer.cx, dc.outer.cy));
    const corridor = bfsPath(layout, dc.outer, toCell);
    if (corridor && corridor.length > 1) corridor.slice(1, -1).forEach((c) => waypoints.push(cellToWorld(c.cx, c.cy)));
  } else {
    const corridor = bfsPath(layout, fromCell, toCell);
    if (corridor && corridor.length > 1) corridor.slice(1, -1).forEach((c) => waypoints.push(cellToWorld(c.cx, c.cy)));
  }
  waypoints.push(cellToWorld(toCell.cx, toCell.cy));
  return waypoints;
}

// 简化航点：共线/可直视的点合并（走路更自然）
export function simplifyPath(points, blockedAt) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    for (; j > i + 1; j--) {
      if (clearLine(points[i], points[j], blockedAt)) break;
    }
    out.push(points[j]);
    i = j;
  }
  return out;
}
function clearLine(a, b, blockedAt) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const steps = Math.ceil(len / (CELL * 0.5));
  for (let s = 1; s < steps; s++) {
    const x = a.x + dx * s / steps, z = a.z + dz * s / steps;
    if (blockedAt(x, z)) return false;
  }
  return true;
}
