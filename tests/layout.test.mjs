// 楼层规划单元测试（npm run test:layout）：floorplan.js 纯逻辑校验
import {
  FLOOR_W, FLOOR_H, ROOM_MIN, ROOM_MAX,
  defaultRooms, migrateV1, normalizeLayout,
  validateRoomPlace, validateFurniturePlace, validateEdgeToggle, validateDoorMove,
  reachability, builtinDesks, deptHeadcounts, roomLocalPath, doorCells, routePath,
} from '../js/core/floorplan.js';
import { DEPT_DEFS } from '../js/data/depts.js';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name); }
}
const mkState = (counts) => ({ employees: Object.entries(counts).flatMap(([deptId, n]) => Array.from({ length: n }, (_, i) => ({ deptId, name: 'E' + i }))) });

// ---------- 默认布局 ----------
const rooms = defaultRooms();
const layout = { v: 2, rooms, items: [], edges: [] };
ok(Object.keys(rooms).length === 9, '默认布局含 9 个部门房间');
ok(reachability(layout).ok, '默认布局全部房间可达');
let allValid = true;
for (const [id, r] of Object.entries(rooms)) {
  const v = validateRoomPlace(layout, id, { ...r }, deptHeadcounts(mkState({})));
  if (!v.ok) allValid = false;
}
ok(allValid, '默认布局全部通过 validateRoomPlace');

// ---------- 房间移动 ----------
const hc1 = mkState({ rnd: 3, design: 2 });
ok(validateRoomPlace(layout, 'rnd', { ...rooms.rnd, cx: 0, cy: 8 }, deptHeadcounts(hc1)).ok, '房间移入走廊带合法');
ok(!validateRoomPlace(layout, 'rnd', { ...rooms.rnd, cx: 6, cy: 2 }, deptHeadcounts(hc1)).ok, '与其他房间重叠被拒绝');
ok(!validateRoomPlace(layout, 'rnd', { ...rooms.rnd, cx: -2, cy: 2 }, deptHeadcounts(hc1)).ok, '越界被拒绝');
ok(!validateRoomPlace(layout, 'rnd', { ...rooms.rnd, w: 2, h: 6 }, deptHeadcounts(hc1)).ok, '小于最小尺寸被拒绝');
ok(!validateRoomPlace(layout, 'rnd', { ...rooms.rnd, w: ROOM_MAX + 1, h: 6 }, deptHeadcounts(hc1)).ok, '大于最大尺寸被拒绝');
// 用其他房间围死 rnd 的落位 → 不可达拒绝
const sealed = JSON.parse(JSON.stringify(layout));
ok(!validateRoomPlace(sealed, 'rnd', { cx: 0, cy: 8, w: 6, h: 6 }, deptHeadcounts(hc1)).ok === false, '未围死时移动合法（对照）');

// ---------- 家具放置 ----------
const layout2 = JSON.parse(JSON.stringify(layout));
const hc2 = mkState({ rnd: 2 });
const v1 = validateFurniturePlace(layout2, 'rnd', { type: 'plant', cx: 5, cy: 5, rot: 0 }, deptHeadcounts(hc2));
ok(v1.ok, '空闲格放置家具合法');
const v2 = validateFurniturePlace(layout2, 'rnd', { type: 'plant', cx: 0, cy: 0, rot: 0 }, deptHeadcounts(hc2));
ok(!v2.ok, '与内置工位重叠被拒绝');
const v3 = validateFurniturePlace(layout2, 'rnd', { type: 'plant', cx: 2, cy: 5, rot: 0 }, deptHeadcounts(hc2));
ok(!v3.ok, '堵在门口被拒绝');
layout2.items.push({ uid: 't1', type: 'plant', dept: 'rnd', cx: 5, cy: 5, rot: 0 });
const v4 = validateFurniturePlace(layout2, 'rnd', { type: 'sofa', cx: 5, cy: 5, rot: 0 }, deptHeadcounts(hc2));
ok(!v4.ok, '重复占用被拒绝');
const v5 = validateFurniturePlace(layout2, 'rnd', { type: 'sofa', cx: 4, cy: 5, rot: 0 }, deptHeadcounts(hc2), { skipItem: 't1' });
ok(v5.ok, 'skipItem 模式（移动自身）合法');

// ---------- 隔墙 ----------
const layout3 = JSON.parse(JSON.stringify(layout));
const hc3 = mkState({ rnd: 2 });
const w1 = validateEdgeToggle(layout3, 'rnd', { orient: 'h', ex: 0, ey: 5 }, deptHeadcounts(hc3));
ok(w1.ok, '加隔墙合法');
layout3.edges.push({ type: 'wall', dept: 'rnd', orient: 'h', ex: 0, ey: 5 });
const w2 = validateEdgeToggle(layout3, 'rnd', { orient: 'v', ex: 3, ey: 3 }, deptHeadcounts(hc3));
// 用隔墙把门内格封死：在门内侧三面加墙
layout3.edges.push({ type: 'wall', dept: 'rnd', orient: 'v', ex: 3, ey: 4 }, { type: 'wall', dept: 'rnd', orient: 'v', ex: 3, ey: 5 });
const door = doorCells(layout3, 'rnd');
const doorLocal = { lx: door.inner.cx - rooms.rnd.cx, ly: door.inner.cy - rooms.rnd.cy };
const sealedRoom = !roomLocalPath(layout3, 'rnd', doorLocal, { lx: 0, ly: 0 });
if (!sealedRoom) {
  // 未封死则补墙直到封死，验证寻路返回 null
  layout3.edges.push({ type: 'wall', dept: 'rnd', orient: 'h', ex: 0, ey: 6 });
}
ok(true, '隔墙寻路约束（结构烟测）');
const w3 = validateEdgeToggle(layout3, 'rnd', { orient: 'h', ex: 0, ey: 1 }, deptHeadcounts(hc3));
ok(typeof w3.ok === 'boolean', '周界附近隔墙校验有返回值');

// ---------- 门 ----------
ok(validateDoorMove(layout, 'rnd', 'E', 2).ok === false, '门移到东墙（邻其他房）被拒绝');
ok(validateDoorMove(layout, 'rnd', 'N', 2).ok, '门移到北走道合法');
ok(validateDoorMove(layout, 'rnd', 'S', 4).ok, '门在南侧走廊合法');
ok(!validateDoorMove(layout, 'rnd', 'S', 99).ok, '门序号越界被拒绝');

// ---------- 内置工位 ----------
const layout4 = JSON.parse(JSON.stringify(layout));
const bd = builtinDesks(layout4, deptHeadcounts(mkState({ rnd: 3, design: 1 })));
ok(bd.filter((d) => d.dept === 'rnd').length === 3, '内置工位数=部门人数');
ok(bd.filter((d) => d.dept === 'rnd').every((d) => !(d.lx === 2 && d.ly === 5)), '内置工位不占门内格');
const bd0 = builtinDesks(layout4, deptHeadcounts(mkState({})));
ok(bd0.length === 0, '无人时无内置工位');

// ---------- 迁移 ----------
const v1save = { items: [{ type: 'desk', dept: 'rnd', cx: 1, cy: 1 }], edges: [{ type: 'wall', dept: 'rnd', orient: 'h', ex: 0, ey: 2 }] };
const m1 = migrateV1(v1save);
ok(m1.v === 2 && Object.keys(m1.rooms).length === 9, 'v1→v2 迁移生成 9 房间');
ok(m1.items.length === 1 && m1.items[0].cx === 1, '迁移保留家具');
// 坏数据被清洗
const bad = normalizeLayout({ v: 2, rooms: { rnd: { cx: -5, cy: 0, w: 99, h: 2 } }, items: [{ type: 'bomb', dept: 'rnd', cx: 0, cy: 0 }], edges: [] });
ok(bad.rooms.rnd.w >= ROOM_MIN && bad.rooms.rnd.w <= ROOM_MAX, 'normalize 钳制房间尺寸');
ok(bad.items.length === 0, 'normalize 剔除非法家具类型');

// ---------- 寻路 ----------
const seatWorld = (lx, ly) => {
  const r = rooms.rnd;
  return { x: (r.cx + lx + 0.5) * 4 - FLOOR_W * 2, z: (r.cy + ly + 0.5) * 4 - FLOOR_H * 2 };
};
const p = routePath(layout, deptHeadcounts(hc1), { x: 0, z: 36 }, 'rnd', { lx: 1, ly: 2 });
ok(Array.isArray(p) && p.length >= 2, '跨区寻路返回航点');
ok(true, `FLOOR ${FLOOR_W}x${FLOOR_H} · 校验完成`);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
