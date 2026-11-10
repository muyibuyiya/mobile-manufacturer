// 公司园区 3D 场景：等距办公室 + 园区地块楼宇 + 员工寻路行为 + 室内家具与剖面
//
// 视角约定：
// - 45° 等距（默认）：隐藏面朝相机的墙体与天花板，方便看清室内
// - 正俯视：显示天花板，适合看整体布局
//
// v0.8.0 起办公室系统基于**单一楼层网格**（js/core/floorplan.js）：
// 房间可拖放/调尺寸、家具单数据源（内置工位派生自人数）、BFS 寻路感知墙与门、
// 编辑走增量 updateLayout（不重建场景）。3D 编辑器与 2D 平面规划页（floorplan2d.js）
// 共用 floorplan.js 校验层。
import * as THREE from '../../vendor/three.module.js';
import { DEPT_DEFS, autoSave } from '../core/state.js';
import { FURNITURE, FURNITURE_MAP, PARTITIONS_MAP } from '../data/furniture.js';
import {
  CELL, FLOOR_W, FLOOR_H, FLOOR_X, FLOOR_Z, WALL_H,
  ROOM_MIN, ROOM_MAX, ENTRANCE_RECT, ENTRANCE_CELL, DEPT_IDS_9,
  migrateV1, roomCellWorld, roomAt, doorCells, autoDoor,
  deptHeadcounts, builtinDesks, seatForDesk,
  validateRoomPlace, validateFurniturePlace, validateEdgeToggle, validateDoorMove,
  reachability, routePath, routeToCell, worldToCell, cellToWorld,
} from '../core/floorplan.js';

// 地块在园区里的环形位置（plots[0] 是总部办公室，居中）
export const PLOT_RING = [null,
  [0, -122], [112, -38], [70, 98], [-70, 98], [-112, -38]];

// ---------- 画质档（设置页可调，localStorage 持久化，场景重建时生效）----------
const QKEY = 'mm_quality_pref';
export function readQualityPref() {
  try {
    const v = localStorage.getItem(QKEY);
    return ['high', 'standard', 'low'].includes(v) ? v : 'auto';
  } catch (e) { return 'auto'; }
}
export function writeQualityPref(v) {
  try {
    if (['high', 'standard', 'low', 'auto'].includes(v)) localStorage.setItem(QKEY, v);
  } catch (e) { /* 忽略 */ }
}
// auto：桌面端高画质，移动端 / 高 DPR 设备标准画质
function resolveQuality(pref) {
  let level = pref;
  if (level === 'auto') {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const mobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
    level = mobile || dpr > 2 ? 'standard' : 'high';
  }
  if (level === 'high') return { ratio: Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1), shadows: true, mapSize: 2048 };
  if (level === 'standard') return { ratio: Math.min(1.25, (typeof window !== 'undefined' && window.devicePixelRatio) || 1), shadows: true, mapSize: 1024 };
  return { ratio: 1, shadows: false, mapSize: 512 };
}

// 公司大门牌匾：左侧 logo 图标，右侧两行（上中文名 / 下英文名），内容整体居中。
// 关闭深度测试，保证任何视角都不会被楼宇/门柱遮挡。
export function makeCompanyPlaque(zhName, enName, color, logoData = '') {
  const W = 768, H = 192;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const zh = zhName || '';
  const en = enName || '';
  ctx.font = '700 52px -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif';
  const zhW = ctx.measureText(zh).width;
  ctx.font = '500 30px -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif';
  const enW = en ? ctx.measureText(en).width : 0;
  const LOGO = 88, GAP = 26;
  const textW = Math.max(zhW, enW);
  // 牌匾宽度随内容收缩，整体在画布内居中
  const BW = Math.min(W - 32, LOGO + GAP + textW + 72);
  const BX = (W - BW) / 2, BY = (H - 152) / 2;

  const draw = (logoImg) => {
    ctx.clearRect(0, 0, W, H);
    // 牌匾底板：深色圆角 + 品牌色描边 + 内衬高光
    const r = 30;
    ctx.beginPath();
    ctx.moveTo(BX + r, BY); ctx.lineTo(BX + BW - r, BY); ctx.quadraticCurveTo(BX + BW, BY, BX + BW, BY + r);
    ctx.lineTo(BX + BW, BY + 152 - r); ctx.quadraticCurveTo(BX + BW, BY + 152, BX + BW - r, BY + 152);
    ctx.lineTo(BX + r, BY + 152); ctx.quadraticCurveTo(BX, BY + 152, BX, BY + 152 - r);
    ctx.lineTo(BX, BY + r); ctx.quadraticCurveTo(BX, BY, BX + r, BY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(10,14,20,.9)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.stroke();

    // 左侧 logo 图标（无 logo 时画品牌色圆角方块 + 首字母）
    const lx = BX + 26, ly = BY + 32, ls = LOGO;
    if (logoImg) {
      ctx.save();
      roundRectPath(ctx, lx, ly, ls, ls, 18);
      ctx.clip();
      ctx.drawImage(logoImg, lx, ly, ls, ls);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.lineWidth = 2;
      roundRectPath(ctx, lx, ly, ls, ls, 18);
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      roundRectPath(ctx, lx, ly, ls, ls, 18);
      ctx.fill();
      ctx.fillStyle = '#0a0e14';
      ctx.font = '800 52px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText((zh || 'M').slice(0, 1), lx + ls / 2, ly + ls / 2 + 2);
    }

    // 右侧两行：上中文名（大）/ 下英文名（小，可缺省）
    const tx = lx + ls + GAP;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#eef3fb';
    ctx.font = '700 52px -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText(zh, tx, en ? BY + 56 : BY + 76);
    if (en) {
      ctx.fillStyle = color;
      ctx.font = '500 30px -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.fillText(en, tx, BY + 112);
    }
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  draw(null);
  if (logoData) {
    const src = logoData.startsWith('<svg')
      ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(logoData)
      : logoData;
    const img = new Image();
    img.onload = () => draw(img);
    img.src = src;
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  sprite.renderOrder = 80;
  // 牌匾物理宽度 ≈ 内容宽度等比（画布 768 → 18 世界单位）
  const ratio = BW / W;
  sprite.scale.set(18 * ratio + 2.5, 4.5, 1);
  return sprite;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function createOfficeScene(container, state) {
  const W = container.clientWidth || 600;
  const H = container.clientHeight || 420;

  const q = resolveQuality(readQualityPref());
  const renderer = new THREE.WebGLRenderer({ antialias: q.ratio > 1, alpha: false });
  renderer.setPixelRatio(q.ratio);
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e14);
  scene.fog = new THREE.Fog(0x0a0e14, 220, 520);

  const camera = new THREE.PerspectiveCamera(32, W / H, 0.5, 1400);

  // ---------- 光照 ----------
  scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x10161e, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(90, 150, 70);
  key.castShadow = q.shadows;
  key.shadow.mapSize.set(q.mapSize, q.mapSize);
  key.shadow.camera.left = -180; key.shadow.camera.right = 180;
  key.shadow.camera.top = 180; key.shadow.camera.bottom = -180;
  key.shadow.camera.far = 500;
  scene.add(key);
  const rim = new THREE.PointLight(0x4aa3ff, 260, 320);
  rim.position.set(-70, 46, -60);
  scene.add(rim);
  const warm = new THREE.PointLight(0xffc887, 120, 240);
  warm.position.set(50, 30, -30);
  scene.add(warm);

  // ---------- 地面 ----------
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(300, 2, 300),
    new THREE.MeshStandardMaterial({ color: 0x10161d, roughness: 0.95, metalness: 0.05 })
  );
  ground.position.y = -1.1;
  ground.receiveShadow = true;
  scene.add(ground);
  const groundGrid = new THREE.GridHelper(300, 50, 0x1c2530, 0x141b23);
  groundGrid.position.y = -0.08;
  scene.add(groundGrid);

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(FLOOR_X, 2, FLOOR_Z),
    new THREE.MeshStandardMaterial({ color: 0x161d27, roughness: 0.9, metalness: 0.1 })
  );
  floor.position.y = -0.4;
  floor.receiveShadow = true;
  scene.add(floor);

  // 楼层网格线（按 CELL 间距自绘，支持非正方形楼层）
  const gridGroup = new THREE.Group();
  {
    const lineMat = new THREE.LineBasicMaterial({ color: 0x24303d, transparent: true, opacity: 0.55 });
    const pts = [];
    for (let cx = 0; cx <= FLOOR_W; cx++) {
      const x = cx * CELL - FLOOR_X / 2;
      pts.push(x, 0.62, -FLOOR_Z / 2, x, 0.62, FLOOR_Z / 2);
    }
    for (let cy = 0; cy <= FLOOR_H; cy++) {
      const z = cy * CELL - FLOOR_Z / 2;
      pts.push(-FLOOR_X / 2, 0.62, z, FLOOR_X / 2, 0.62, z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    gridGroup.add(new THREE.LineSegments(geo, lineMat));
    gridGroup.visible = false; // 编辑模式才显示
    scene.add(gridGroup);
  }

  const group = new THREE.Group();
  scene.add(group);

  // 需要剖面隐藏的物体（面朝相机时不可见）
  const cutaways = []; // { obj, normal: Vector3 }
  function tagCutaway(obj, normal) {
    obj.userData.cutNormal = normal.clone().normalize();
    cutaways.push(obj);
  }

  // ---------- 可复用几何 / 材质 ----------
  const GEO = {
    deskTop: new THREE.BoxGeometry(3.5, 0.26, 2.2),
    deskLeg: new THREE.BoxGeometry(0.18, 1.15, 2.0),
    monitor: new THREE.BoxGeometry(1.9, 1.15, 0.12),
    monitorStand: new THREE.BoxGeometry(0.3, 0.5, 0.3),
    seat: new THREE.BoxGeometry(1.5, 0.22, 1.5),
    back: new THREE.BoxGeometry(1.5, 1.5, 0.2),
    torso: new THREE.CapsuleGeometry(0.62, 0.95, 4, 10),
    head: new THREE.SphereGeometry(0.48, 14, 12),
    hair: new THREE.SphereGeometry(0.52, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    pad: new THREE.BoxGeometry(24.5, 0.25, 24.5),
    plantPot: new THREE.CylinderGeometry(0.9, 0.7, 1.2, 10),
    plantLeaf: new THREE.SphereGeometry(1.5, 10, 8),
  };
  const MAT = {
    desk: new THREE.MeshStandardMaterial({ color: 0x39465c, roughness: 0.62, metalness: 0.18 }),
    deskDark: new THREE.MeshStandardMaterial({ color: 0x222c3a, roughness: 0.7, metalness: 0.2 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x0b141d, emissive: 0x3f86c9, emissiveIntensity: 1.15, roughness: 0.25 }),
    chair: new THREE.MeshStandardMaterial({ color: 0x27313f, roughness: 0.75 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xd8b393, roughness: 0.72 }),
    pot: new THREE.MeshStandardMaterial({ color: 0x2c3542, roughness: 0.8 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x2f6b4a, roughness: 0.85 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x1b2531, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide }),
    roomWall: new THREE.MeshStandardMaterial({ color: 0x2a3546, roughness: 0.85, metalness: 0.08 }),
    win: new THREE.MeshStandardMaterial({
      color: 0x9fd0ff, emissive: 0x3d6f9e, emissiveIntensity: 0.7, roughness: 0.22, metalness: 0.15,
      transparent: true, opacity: 0.7,
    }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x232d3a, roughness: 0.92, metalness: 0.05 }),
    tower: new THREE.MeshStandardMaterial({ color: 0x2b3849, roughness: 0.7, metalness: 0.2 }),
    towerGlass: new THREE.MeshStandardMaterial({
      color: 0x7fb4e8, emissive: 0x2f5f8f, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.35,
      transparent: true, opacity: 0.75,
    }),
    crane: new THREE.MeshStandardMaterial({ color: 0xd99a2b, roughness: 0.6, metalness: 0.3 }),
    ceil: new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide }),
  };
  const SHIRT_COLORS = [0x4aa3ff, 0x37c9a5, 0xf5a542, 0xc47cf0, 0xf56b8f, 0x8fbf4a, 0x9b8cff, 0xe0c14a];
  const HAIR_COLORS = [0x1c1a17, 0x2e2119, 0x4a3320, 0x0f0e0d, 0x59402a];

  // 部门名牌（可选带公司 Logo：SVG 字符串或 dataURL，异步加载后重绘）
  function makeLabel(text, color, w = 512, logoData = '') {
    const c = document.createElement('canvas');
    c.width = w; c.height = 128;
    const ctx = c.getContext('2d');
    const draw = (logoImg) => {
      ctx.clearRect(0, 0, w, 128);
      ctx.fillStyle = 'rgba(10,14,20,.84)';
      const r = 26;
      ctx.beginPath();
      ctx.moveTo(r, 8); ctx.lineTo(w - r, 8); ctx.quadraticCurveTo(w - 8, 8, w - 8, 8 + r);
      ctx.lineTo(w - 8, 120 - r); ctx.quadraticCurveTo(w - 8, 120, w - r, 120);
      ctx.lineTo(r, 120); ctx.quadraticCurveTo(8, 120, 8, 120 - r);
      ctx.lineTo(8, 8 + r); ctx.quadraticCurveTo(8, 8, r, 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(44, 64, 12, 0, Math.PI * 2); ctx.fill();
      if (logoImg) ctx.drawImage(logoImg, 28, 40, 48, 48);
      ctx.fillStyle = '#e8eef7';
      ctx.font = '600 44px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, logoImg ? 92 : 72, 66);
      tex.needsUpdate = true;
    };
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    draw(null);
    if (logoData) {
      const src = logoData.startsWith('<svg')
        ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(logoData)
        : logoData;
      const img = new Image();
      img.onload = () => draw(img);
      img.src = src;
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(w / 512 * 13, 3.25, 1);
    return sprite;
  }


  // ============================================================
  // 一、部门房间（可拖放/调尺寸）+ 家具（单一数据源）+ 员工行为
  // 数据与校验在 js/core/floorplan.js；本段只做渲染，重建走 rebuildDyn()
  // ============================================================
  const layout = state.officeLayout?.v === 2 ? state.officeLayout : migrateV1(state.officeLayout);
  state.officeLayout = layout;
  const people = []; // { group, empId, dept, path, seg, speed, phase, timer, bob, seat, seatIdx }
  let headcounts = deptHeadcounts(state);

  // 动态组：房间墙/家具/门牌——updateLayout() 只重建这一组，员工与主循环不动
  const dynGroup = new THREE.Group();
  group.add(dynGroup);
  const dynCutaways = []; // 与静态 cutaways 分开，重建时不影响壳体
  function tagCutawayDyn(obj, normal) {
    obj.userData.cutNormal = normal.clone().normalize();
    dynCutaways.push(obj);
  }
  const seatsByDept = {}; // deptId -> [{x, z, rot}]
  const deptWorld = {};   // deptId -> 房间中心世界坐标
  let meetPoint = { x: 0, z: 0 };
  let roomCellKeys = new Set();      // 全部房间覆盖格（走廊简化寻路用）
  let furnitureCellKeys = new Set(); // 家具格（含内置工位）

  function disposeObj(root) {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose(); m.dispose(); });
    });
  }

  // 墙段绘制：key 归一化后跨房间去重（共享墙只画一次）
  function drawWallSeg(kind, a, b, isDoor, col, edgeMat) {
    // kind 'H'：沿 x 的横墙，a=格x，b=边界线y；'V'：沿 z 的纵墙，a=边界线x，b=格y
    const isH = kind === 'H';
    const wx = isH ? a * CELL - FLOOR_X / 2 + CELL / 2 : a * CELL - FLOOR_X / 2;
    const wz = isH ? b * CELL - FLOOR_Z / 2 : b * CELL - FLOOR_Z / 2 + CELL / 2;
    const DOOR_W = 2.8, SEG = (CELL - DOOR_W) / 2;
    const g = new THREE.Group();
    if (!isDoor) {
      const seg = new THREE.Mesh(isH ? new THREE.BoxGeometry(CELL, WALL_H, 0.7) : new THREE.BoxGeometry(0.7, WALL_H, CELL), MAT.roomWall);
      seg.position.set(wx, WALL_H / 2 + 0.12, wz);
      seg.castShadow = true; seg.receiveShadow = true;
      g.add(seg);
    } else {
      // 门洞：两侧窄墙段 + 过梁
      for (const t of [-1, 1]) {
        const seg = new THREE.Mesh(
          isH ? new THREE.BoxGeometry(SEG, WALL_H, 0.7) : new THREE.BoxGeometry(0.7, WALL_H, SEG), MAT.roomWall);
        seg.position.set(wx + (isH ? t * (DOOR_W / 2 + SEG / 2) : 0), WALL_H / 2 + 0.12, wz + (isH ? 0 : t * (DOOR_W / 2 + SEG / 2)));
        seg.castShadow = true;
        g.add(seg);
      }
      const lintel = new THREE.Mesh(
        isH ? new THREE.BoxGeometry(DOOR_W, WALL_H - 5.2, 0.7) : new THREE.BoxGeometry(0.7, WALL_H - 5.2, DOOR_W), MAT.roomWall);
      lintel.position.set(wx, 5.2 + (WALL_H - 5.2) / 2 + 0.12, wz);
      g.add(lintel);
    }
    // 墙顶部门色发光沿
    const glow = new THREE.Mesh(
      isH ? new THREE.BoxGeometry(CELL, 0.16, 0.9) : new THREE.BoxGeometry(0.9, 0.16, CELL), edgeMat);
    glow.position.set(wx, WALL_H + 0.28, wz);
    g.add(glow);
    dynGroup.add(g);
    return g;
  }

  function rebuildDyn() {
    while (dynGroup.children.length) {
      const c = dynGroup.children.pop();
      disposeObj(c);
    }
    dynCutaways.length = 0;
    for (const k of Object.keys(seatsByDept)) delete seatsByDept[k];
    headcounts = deptHeadcounts(state);
    roomCellKeys = new Set();
    furnitureCellKeys = new Set();
    const wallKeys = new Set();

    for (const dept of DEPT_DEFS.slice(0, 9)) {
      const room = layout.rooms[dept.id];
      if (!room) continue;
      const count = headcounts[dept.id] || 0;
      const col = new THREE.Color(dept.color);
      const px = room.cx * CELL - FLOOR_X / 2, pz = room.cy * CELL - FLOOR_Z / 2;
      const pw = room.w * CELL, ph = room.h * CELL;
      deptWorld[dept.id] = { x: px + pw / 2, z: pz + ph / 2 };
      for (let cy = room.cy; cy < room.cy + room.h; cy++) {
        for (let cx = room.cx; cx < room.cx + room.w; cx++) roomCellKeys.add(cx + ',' + cy);
      }

      // 地垫（部门色淡染）
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(pw - 0.4, 0.25, ph - 0.4),
        new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.06).offsetHSL(0, 0.01, 0), roughness: 0.95, metalness: 0.05 })
      );
      pad.position.set(px + pw / 2, 0.12, pz + ph / 2);
      pad.receiveShadow = true;
      dynGroup.add(pad);

      // 四面墙（共享墙去重；门段替换为门洞）
      const edgeMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.7, roughness: 0.4 });
      const isDoorSeg = (side, t) => room.door && room.door.side === side && room.door.t === t;
      const segs = [];
      for (let t = 0; t < room.w; t++) {
        segs.push({ kind: 'H', a: room.cx + t, b: room.cy, side: 'N', t });
        segs.push({ kind: 'H', a: room.cx + t, b: room.cy + room.h, side: 'S', t });
      }
      for (let t = 0; t < room.h; t++) {
        segs.push({ kind: 'V', a: room.cx, b: room.cy + t, side: 'W', t });
        segs.push({ kind: 'V', a: room.cx + room.w, b: room.cy + t, side: 'E', t });
      }
      for (const s of segs) {
        const key = `${s.kind}:${s.a}:${s.b}`;
        if (wallKeys.has(key)) continue;
        wallKeys.add(key);
        drawWallSeg(s.kind, s.a, s.b, isDoorSeg(s.side, s.t), col, edgeMat);
      }

      // 门牌：挂在门上方
      const dc = doorCells(layout, dept.id);
      const doorWorld = cellToWorld(dc.inner.cx, dc.outer.cy >= room.cy + room.h ? room.cy + room.h : dc.outer.cy);
      const doorWorldX = cellToWorld(dc.outer.cx, room.cy).x;
      const label = makeLabel(`${dept.name} · ${count}`, dept.color);
      label.scale.set(9.5, 2.4, 1);
      const sideN = room.door.side === 'N';
      const sideS = room.door.side === 'S';
      const doorZ = sideN ? pz : sideS ? pz + ph : pz + (dc.inner.cy - room.cy + 0.5) * CELL;
      const doorX = (room.door.side === 'N' || room.door.side === 'S') ? px + (room.door.t + 0.5) * CELL : (room.door.side === 'W' ? px : px + pw);
      const lblZ = sideN ? doorZ - 1.2 : sideS ? doorZ + 1.2 : doorZ;
      const lblX = sideN || sideS ? doorX : (room.door.side === 'W' ? doorX - 1.2 : doorX + 1.2);
      label.position.set(lblX, 6.4, lblZ);
      label.material.depthTest = false;
      label.renderOrder = 50;
      dynGroup.add(label);
    }

    // ---------- 公共空间：会议室 / 茶水间 / 机房 / 总经理办公室 ----------
    const FAC_COLORS = { meeting: 0x6f7fd8, pantry: 0xd8a95a, server: 0x5aa6a0, exec: 0xb07ac0 };
    for (const f of (layout.facilities || [])) {
      const px = f.cx * CELL - FLOOR_X / 2, pz = f.cy * CELL - FLOOR_Z / 2;
      const pw = f.w * CELL, ph = f.h * CELL;
      const col = new THREE.Color(FAC_COLORS[f.type] || 0x55637a);
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(pw - 0.4, 0.22, ph - 0.4),
        new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.1), roughness: 0.92, metalness: 0.06 }),
      );
      pad.position.set(px + pw / 2, 0.11, pz + ph / 2);
      pad.receiveShadow = true;
      dynGroup.add(pad);

      const edgeMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.45 });
      const isDoorSeg = (side, t) => f.door && f.door.side === side && f.door.t === t;
      const segs = [];
      for (let t = 0; t < f.w; t++) {
        segs.push({ kind: 'H', a: f.cx + t, b: f.cy, side: 'N', t });
        segs.push({ kind: 'H', a: f.cx + t, b: f.cy + f.h, side: 'S', t });
      }
      for (let t = 0; t < f.h; t++) {
        segs.push({ kind: 'V', a: f.cx, b: f.cy + t, side: 'W', t });
        segs.push({ kind: 'V', a: f.cx + f.w, b: f.cy + t, side: 'E', t });
      }
      for (const s of segs) {
        const key = `${s.kind}:${s.a}:${s.b}`;
        if (wallKeys.has(key)) continue;
        wallKeys.add(key);
        drawWallSeg(s.kind, s.a, s.b, isDoorSeg(s.side, s.t), col, edgeMat);
      }

      const label = makeLabel(f.name, '#d6e2f2');
      label.scale.set(9.5, 2.4, 1);
      const doorAtS = (f.door.side === 'N' || f.door.side === 'S');
      const lblZ = f.door.side === 'N' ? pz - 1.2 : f.door.side === 'S' ? pz + ph + 1.2 : pz + ph / 2;
      const lblX = doorAtS ? px + (f.door.t + 0.5) * CELL : (f.door.side === 'W' ? px - 1.2 : px + pw + 1.2);
      label.position.set(lblX, 6.4, lblZ);
      label.material.depthTest = false;
      label.renderOrder = 50;
      dynGroup.add(label);

      const cx0 = px + pw / 2, cz0 = pz + ph / 2;
      if (f.type === 'meeting') {
        const table = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.44, 0.36, ph * 0.4), MAT.desk);
        table.position.set(cx0, 1.9, cz0);
        dynGroup.add(table);
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const chair = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), MAT.chair);
          chair.position.set(cx0 + Math.cos(ang) * pw * 0.3, 1.2, cz0 + Math.sin(ang) * ph * 0.3);
          dynGroup.add(chair);
        }
        const screen = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.46, 2.1, 0.18), MAT.screen);
        screen.position.set(cx0, 3.6, pz + 0.9);
        dynGroup.add(screen);
      } else if (f.type === 'pantry') {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.78, 2.0, 1.5), MAT.desk);
        bar.position.set(cx0, 1.5, pz + ph * 0.3);
        dynGroup.add(bar);
        const coffee = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 1.0), MAT.deskDark);
        coffee.position.set(cx0 + pw * 0.24, 3.0, pz + ph * 0.3);
        dynGroup.add(coffee);
        const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.4, 10), MAT.chair);
        stool.position.set(cx0 - pw * 0.2, 0.9, cz0);
        dynGroup.add(stool);
      } else if (f.type === 'server') {
        for (let i = 0; i < 3; i++) {
          const rack = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4.2, 1.1), MAT.deskDark);
          rack.position.set(px + pw - 2.4, 2.9, pz + 3 + i * 2.6);
          rack.castShadow = true;
          dynGroup.add(rack);
          const led = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.1),
            new THREE.MeshStandardMaterial({ color: 0x37c9a5, emissive: 0x37c9a5, emissiveIntensity: 0.9 }));
          led.position.set(px + pw - 2.4, 3.9, pz + 2.4 + i * 2.6);
          dynGroup.add(led);
        }
      } else if (f.type === 'exec') {
        const desk = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.44, 0.3, ph * 0.3), MAT.desk);
        desk.position.set(cx0, 1.9, pz + ph * 0.34);
        dynGroup.add(desk);
        const sofa = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.4, 1.1, ph * 0.22), MAT.chair);
        sofa.position.set(cx0, 0.6, pz + ph * 0.78);
        dynGroup.add(sofa);
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.3, 3.2, 0.6), MAT.deskDark);
        shelf.position.set(px + 1.4, 1.9, cz0);
        dynGroup.add(shelf);
      }
    }

    // 家具：内置工位（派生）+ 用户 items —— 同一渲染路径，重叠从数据层杜绝
    const desks = builtinDesks(layout, headcounts);
    for (const d of desks) {
      const w = roomCellWorld(layout, d.dept, d.lx, d.ly);
      furnitureCellKeys.add(w.x + ',' + w.z);
      dynGroup.add(makeFurniture('desk', w, 0));
    }
    for (const it of layout.items) {
      const w = roomCellWorld(layout, it.dept, it.cx, it.cy);
      furnitureCellKeys.add(w.x + ',' + w.z);
      dynGroup.add(makeFurniture(it.type, w, it.rot || 0));
    }
    for (const ed of layout.edges) {
      const room = layout.rooms[ed.dept];
      if (!room) continue;
      const isH = ed.orient === 'h';
      const wx = room.cx * CELL - FLOOR_X / 2 + (isH ? (ed.ex + 0.5) * CELL : ed.ex * CELL);
      const wz = room.cy * CELL - FLOOR_Z / 2 + (isH ? ed.ey * CELL : (ed.ey + 0.5) * CELL);
      const g = new THREE.Group();
      if (ed.type === 'wall') {
        const seg = new THREE.Mesh(isH ? new THREE.BoxGeometry(CELL, 6, 0.7) : new THREE.BoxGeometry(0.7, 6, CELL), MAT.roomWall);
        seg.position.y = 3;
        seg.castShadow = true;
        g.add(seg);
        tagCutawayDyn(g, isH ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0));
      } else {
        // 房间门改位标记：小地垫提示（真正门洞在周界墙上）
        const mat = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.8, 0.18, CELL * 0.8),
          new THREE.MeshStandardMaterial({ color: 0xf5a542, emissive: 0xf5a542, emissiveIntensity: 0.4 }));
        mat.position.y = 0.3;
        g.add(mat);
      }
      g.position.set(wx, 0.6, wz);
      dynGroup.add(g);
    }

    // 工位表（内置 + 用户 desk；带房内局部格坐标供寻路）
    for (const dept of DEPT_DEFS.slice(0, 9)) {
      const list = [];
      for (const d of desks.filter((x) => x.dept === dept.id)) {
        list.push({ ...seatForDesk(layout, dept.id, d.lx, d.ly, 0), lx: d.lx, ly: d.ly });
      }
      for (const it of layout.items.filter((x) => x.dept === dept.id && x.type === 'desk')) {
        list.push({ ...seatForDesk(layout, dept.id, it.cx, it.cy, it.rot || 0), lx: it.cx, ly: it.cy });
      }
      seatsByDept[dept.id] = list;
    }

    // 晨会点：走廊上离楼层中心最近的可走格
    {
      const mid = { cx: Math.floor(FLOOR_W / 2), cy: Math.floor(FLOOR_H / 2) };
      const walk = floorWalkableSet();
      let bestC = mid, bestD = 1e9;
      for (const k of walk) {
        const [cx, cy] = k.split(',').map(Number);
        const d = (cx - mid.cx) ** 2 + (cy - mid.cy) ** 2;
        if (d < bestD) { bestD = d; bestC = { cx, cy }; }
      }
      meetPoint = cellToWorld(bestC.cx, bestC.cy);
    }
    refreshPeopleAnchors();
  }

  function floorWalkableSet() {
    const walk = new Set();
    for (let cy = 0; cy < FLOOR_H; cy++) {
      for (let cx = 0; cx < FLOOR_W; cx++) {
        if (!roomCellKeys.has(cx + ',' + cy)) walk.add(cx + ',' + cy);
      }
    }
    return walk;
  }

  // 人员锚点刷新：房间移动/调尺寸/家具变化后重新指派工位与房间中心
  function refreshPeopleAnchors() {
    const byDept = {};
    for (const p of people) {
      const dept = p.dept;
      byDept[dept] = (byDept[dept] || 0) + 1;
      const seats = seatsByDept[dept] || [];
      p.seat = seats[(byDept[dept] - 1) % Math.max(1, seats.length)] || { x: deptWorld[dept]?.x || 0, z: (deptWorld[dept]?.z || 0) + 4, rot: Math.PI };
      p.roomCenter = deptWorld[dept] || { x: 0, z: 0 };
      p.path = [];
    }
  }


  // ---------- 南侧前厅（入口区内侧）：logo 地环 + 前台 ----------
  const atrium = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 7, 0.16, 40),
    new THREE.MeshStandardMaterial({ color: 0x1e2833, roughness: 0.55, metalness: 0.35 })
  );
  atrium.position.set(0, 0.2, 36);
  atrium.receiveShadow = true;
  group.add(atrium);

  const logo = new THREE.Mesh(
    new THREE.TorusGeometry(3.8, 0.58, 14, 44),
    new THREE.MeshStandardMaterial({
      color: state.company.logoColor, emissive: state.company.logoColor,
      emissiveIntensity: 1.1, metalness: 0.7, roughness: 0.25,
    })
  );
  logo.rotation.x = -Math.PI / 2;
  logo.position.set(0, 0.7, 36);
  group.add(logo);

  const reception = new THREE.Mesh(new THREE.BoxGeometry(14, 2.4, 3.2), MAT.desk);
  reception.position.set(0, 1.6, 39);
  reception.castShadow = true;
  group.add(reception);
  const receptionTop = new THREE.Mesh(new THREE.BoxGeometry(15, 0.3, 4), new THREE.MeshStandardMaterial({
    color: new THREE.Color(state.company.logoColor), emissive: new THREE.Color(state.company.logoColor),
    emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.5,
  }));
  receptionTop.position.set(0, 2.95, 39);
  group.add(receptionTop);

  // ---------- 围墙（面朝相机时自动隐藏）与天花板（尺寸随楼层网格） ----------
  const wallH = 26;
  const halfW = FLOOR_X / 2, halfD = FLOOR_Z / 2;
  // 北墙（-z）与西墙（-x）：常驻，剖面规则通用
  const wallZ = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_X, wallH), MAT.wall);
  wallZ.position.set(0, wallH / 2 + 0.6, -halfD);
  tagCutaway(wallZ, new THREE.Vector3(0, 0, -1));
  group.add(wallZ);
  const wallX = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_Z, wallH), MAT.wall);
  wallX.position.set(-halfW, wallH / 2 + 0.6, 0);
  wallX.rotation.y = Math.PI / 2;
  tagCutaway(wallX, new THREE.Vector3(-1, 0, 0));
  group.add(wallX);

  // 南侧与东侧矮墙：面朝默认相机，同样参与剖面
  const parapetMat = new THREE.MeshStandardMaterial({ color: 0x141b24, roughness: 0.9, metalness: 0.08 });
  const parapetZ = new THREE.Mesh(new THREE.BoxGeometry(FLOOR_X, 3.4, 1.6), parapetMat);
  parapetZ.position.set(0, 2.3, halfD);
  tagCutaway(parapetZ, new THREE.Vector3(0, 0, 1));
  group.add(parapetZ);
  const parapetX = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.4, FLOOR_Z), parapetMat);
  parapetX.position.set(halfW, 2.3, 0);
  tagCutaway(parapetX, new THREE.Vector3(1, 0, 0));
  group.add(parapetX);

  // 窗（北墙 6 扇沿 x、西墙 5 扇沿 z）
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x39485c, roughness: 0.6, metalness: 0.5 });
  for (let i = 0; i < 6; i++) {
    const wx = -halfW + FLOOR_X / 6 * (i + 0.5);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), MAT.win);
    win.position.set(wx, 14.5, -halfD + 0.5);
    tagCutaway(win, new THREE.Vector3(0, 0, -1));
    group.add(win);
    for (const fy of [20.7, 8.3]) {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.6, 0.6), frameMat);
      fr.position.set(wx, fy, -halfD + 0.7);
      tagCutaway(fr, new THREE.Vector3(0, 0, -1));
      group.add(fr);
    }
  }
  for (let i = 0; i < 5; i++) {
    const wz = -halfD + FLOOR_Z / 5 * (i + 0.5);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(11, 12), MAT.win);
    win.position.set(-halfW + 0.5, 14.5, wz);
    win.rotation.y = Math.PI / 2;
    tagCutaway(win, new THREE.Vector3(-1, 0, 0));
    group.add(win);
    for (const fy of [20.7, 8.3]) {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 11.8), frameMat);
      fr.position.set(-halfW + 0.7, fy, wz);
      tagCutaway(fr, new THREE.Vector3(-1, 0, 0));
      group.add(fr);
    }
  }

  // 天花板：正俯视时可见，45° 时隐藏（看室内）
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(FLOOR_X, 0.8, FLOOR_Z), MAT.ceil);
  ceiling.position.set(0, wallH + 1.2, 0);
  ceiling.castShadow = false;
  group.add(ceiling);
  const ceilingLampMat = new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffe9b8, emissiveIntensity: 0.5 });
  for (let gx = -1; gx <= 1; gx++) {
    for (let gz = -1; gz <= 1; gz++) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(16, 0.3, 10), ceilingLampMat);
      lamp.position.set(gx * halfW * 0.55, wallH + 0.7, gz * halfD * 0.55);
      ceiling.add(lamp);
    }
  }

  // ---------- 总部大门（园区大道一侧） ----------
  const gateL = new THREE.Mesh(new THREE.BoxGeometry(2, 12, 2), frameMat);
  gateL.position.set(-7, 6, halfD + 5);
  group.add(gateL);
  const gateR = gateL.clone();
  gateR.position.x = 7;
  group.add(gateR);
  const gateTop = new THREE.Mesh(new THREE.BoxGeometry(17, 2, 2.2), frameMat);
  gateTop.position.set(0, 13, halfD + 5);
  group.add(gateTop);
  // 公司牌匾：挂在横梁正中（左 logo / 右中英文两行，整体居中，任何视角不被遮挡）
  const gateSign = makeCompanyPlaque(
    state.company.name,
    state.company.nameEn || '',
    state.company.logoColor || '#4aa3ff',
    state.company.logoData || '',
  );
  gateSign.position.set(0, 13.4, halfD + 6.4);
  group.add(gateSign);

  // ============================================================
  // 二、园区地块与楼宇（plots[1..5]）
  // ============================================================
  function buildingWorldPos(plotIdx) {
    const [px, pz] = PLOT_RING[plotIdx] || [0, 0];
    return { x: px, z: pz };
  }

  (state.campus?.plots || []).forEach((plot, idx) => {
    if (idx === 0) return; // 总部 = 中央办公室
    const { x, z } = buildingWorldPos(idx);
    const b = plot.building;
    const owned = !!plot.owned;

    // 地基平台
    const pad = new THREE.Mesh(new THREE.BoxGeometry(56, 1.2, 56), MAT.concrete);
    pad.position.set(x, 0.2, z);
    pad.receiveShadow = true;
    group.add(pad);

    if (!owned) {
      // 未购地块：虚线边界 + 名称
      const boundMat = new THREE.MeshStandardMaterial({ color: 0x51637d, roughness: 0.8 });
      for (const [dx, dz, w, d] of [[0, -27.6, 55, 0.7], [0, 27.6, 55, 0.7], [-27.6, 0, 0.7, 55], [27.6, 0, 0.7, 55]]) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), boundMat);
        seg.position.set(x + dx, 0.6, z + dz);
        group.add(seg);
      }
      const lb = makeLabel(`${plot.name} · 待购`, '#7f8fa6');
      lb.position.set(x, 5.5, z);
      group.add(lb);
      return;
    }

    if (!b) {
      const lb = makeLabel(`${plot.name} · 空地`, '#5b8f6b');
      lb.position.set(x, 5.5, z);
      group.add(lb);
      // 一小片"待开发"的沙堆点缀
      const mound = new THREE.Mesh(new THREE.BoxGeometry(10, 1.6, 10), MAT.concrete);
      mound.position.set(x + 12, 1.2, z + 12);
      mound.rotation.y = 0.5;
      group.add(mound);
      return;
    }

    const def = { name: b.typeId };
    if (b.status === 'building') {
      // 施工中：脚手架外壳 + 吊塔 + 进度牌
      const shellH = 6 + b.targetLevel * 7;
      const shell = new THREE.Mesh(
        new THREE.BoxGeometry(46, shellH, 46),
        new THREE.MeshStandardMaterial({ color: 0x39465c, roughness: 0.9, wireframe: true })
      );
      shell.position.set(x, shellH / 2 + 0.8, z);
      group.add(shell);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(46, 2, 46), MAT.concrete);
      slab.position.set(x, 0.9, z);
      group.add(slab);

      const craneBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 2.4), MAT.crane);
      craneBase.position.set(x + 30, 1.5, z + 30);
      group.add(craneBase);
      const mast = new THREE.Mesh(new THREE.BoxGeometry(1.6, shellH + 14, 1.6), MAT.crane);
      mast.position.set(x + 30, (shellH + 14) / 2 + 1.5, z + 30);
      group.add(mast);
      const jib = new THREE.Mesh(new THREE.BoxGeometry(30, 1.2, 1.2), MAT.crane);
      jib.position.set(x + 16, shellH + 15, z + 30);
      group.add(jib);
      const cable = new THREE.Mesh(new THREE.BoxGeometry(0.25, 10, 0.25), MAT.crane);
      cable.position.set(x + 4, shellH + 9, z + 30);
      group.add(cable);

      const pct = Math.round((1 - b.monthsLeft / Math.max(1, b.monthsTotal)) * 100);
      const lb = makeLabel(`${b.typeId === 'factory' ? '生产基地' : '在建楼宇'} · 施工 ${pct}%`, '#d99a2b', 640);
      lb.position.set(x, shellH + 6, z);
      group.add(lb);
      return;
    }

    // 建成楼宇：楼层高度随等级
    const defName = (state.campus?.plotNames?.[idx]) || plot.name;
    const floors = 1 + (b.level || 1);
    const floorH = 7.5;
    const H_ = floors * floorH;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(44, H_, 44), MAT.tower);
    tower.position.set(x, H_ / 2 + 0.8, z);
    tower.castShadow = true; tower.receiveShadow = true;
    group.add(tower);

    // 玻璃带（每层一条）
    for (let f = 1; f < floors; f++) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(44.6, 2.6, 44.6), MAT.towerGlass);
      band.position.set(x, f * floorH + 1.4, z);
      group.add(band);
    }
    // 屋顶：正俯视可见，45° 隐藏（剖面通用规则不适用于实心楼，改为俯视才显示）
    const roof = new THREE.Mesh(new THREE.BoxGeometry(45.5, 1.2, 45.5), MAT.concrete);
    roof.position.set(x, H_ + 1.6, z);
    roof.castShadow = true;
    roof.userData.roofOnly = true;
    group.add(roof);
    // 屋顶设备
    const acBox = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 6), frameMat);
    acBox.position.set(x + 12, H_ + 3.6, z - 10);
    acBox.visible = true;
    group.add(acBox);

    const lb = makeLabel(`${defName} · Lv.${b.level}`, '#4aa3ff', 640);
    lb.position.set(x, H_ + 6.5, z);
    group.add(lb);
  });

  // ---------- 园区道路（从大门到各地块的环路） ----------
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x1d2733, roughness: 0.95 });
  function road(x, z, w, d) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), roadMat);
    seg.position.set(x, 0.05, z);
    seg.receiveShadow = true;
    group.add(seg);
  }
  road(0, 80, 10, 48);           // 大门 → 办公室
  road(0, -80, 10, 56);          // 办公室 → 北地块
  road(70, 0, 96, 10); road(-70, 0, 96, 10);
  road(0, 80, 150, 10); road(0, -80, 160, 10);

  // ============================================================
  // 三、家具造型（渲染在 rebuildDyn 内；数据与校验见 floorplan.js）
  // ============================================================
  function makeFurniture(typeId, pos, rot = 0) {
    const g = new THREE.Group();
    switch (typeId) {
      case 'desk': {
        const top = new THREE.Mesh(GEO.deskTop, MAT.desk);
        top.position.y = 2.0; top.castShadow = true;
        const leg = new THREE.Mesh(GEO.deskLeg, MAT.deskDark);
        leg.position.y = 1.5;
        const mon = new THREE.Mesh(GEO.monitor, MAT.screen);
        mon.position.set(0, 2.72, -0.5);
        g.add(top, leg, mon);
        break;
      }
      case 'plant': {
        const pot = new THREE.Mesh(GEO.plantPot, MAT.pot);
        pot.position.y = 0.6; pot.castShadow = true;
        const leaf = new THREE.Mesh(GEO.plantLeaf, MAT.leaf);
        leaf.position.y = 2.1; leaf.castShadow = true;
        g.add(pot, leaf);
        break;
      }
      case 'sofa': {
        const base = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.1, 3), MAT.chair);
        base.position.y = 0.55; base.castShadow = true;
        const back = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.6, 0.7), MAT.chair);
        back.position.set(0, 1.6, -1.2);
        g.add(base, back);
        break;
      }
      case 'coffee': {
        const bodyM = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 2), MAT.deskDark);
        bodyM.position.y = 1.5;
        const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8), MAT.crane);
        spout.position.set(0, 1.4, 1.2);
        g.add(bodyM, spout);
        break;
      }
      case 'printer': {
        const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 2.8), MAT.deskDark);
        base.position.y = 0.7;
        const lid = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 2.4), MAT.pot);
        lid.position.y = 1.7;
        g.add(base, lid);
        break;
      }
      case 'rack': {
        const bodyM = new THREE.Mesh(new THREE.BoxGeometry(3, 7.2, 2.4), MAT.deskDark);
        bodyM.position.y = 3.6;
        for (let i = 0; i < 5; i++) {
          const led = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 0.1),
            new THREE.MeshStandardMaterial({ color: 0x37c9a5, emissive: 0x37c9a5, emissiveIntensity: 1.2 }));
          led.position.set(0, 1.4 + i * 1.2, 1.25);
          g.add(led);
        }
        g.add(bodyM);
        break;
      }
      default: break;
    }
    g.rotation.y = rot * Math.PI / 2;
    g.position.set(pos.x, 0.6, pos.z);
    return g;
  }

  // ---------- 员工实体（外观随机，工位由 rebuildDyn 指派） ----------
  const ENTRANCE_W = cellToWorld(ENTRANCE_CELL.cx, ENTRANCE_CELL.cy);
  function spawnPeople() {
    for (const emp of state.employees) {
      const dept = DEPT_DEFS.slice(0, 9).find((d) => d.id === emp.deptId);
      if (!dept) continue;
      const col = new THREE.Color(dept.color);
      const k = people.filter((p) => p.dept === dept.id).length;
      const shirt = new THREE.Color(SHIRT_COLORS[(emp.name.charCodeAt(0) + k) % SHIRT_COLORS.length]).lerp(col, 0.35);
      const hairCol = HAIR_COLORS[(emp.name.charCodeAt(1) || 7) % HAIR_COLORS.length];
      const person = new THREE.Group();
      const body = new THREE.Mesh(GEO.torso, new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.78 }));
      body.position.y = 2.55;
      body.castShadow = true;
      const head = new THREE.Mesh(GEO.head, MAT.skin);
      head.position.y = 3.75;
      head.castShadow = true;
      const hair = new THREE.Mesh(GEO.hair, new THREE.MeshStandardMaterial({ color: hairCol, roughness: 0.9 }));
      hair.position.y = 3.82;
      person.add(body, head, hair);
      person.position.set(ENTRANCE_W.x, 0, ENTRANCE_W.z);
      group.add(person);
      people.push({
        group: person,
        empId: emp.id,
        dept: dept.id,
        seat: null,
        roomCenter: deptWorld[dept.id] || { x: 0, z: 0 },
        path: [],
        seg: 0,
        speed: 5.2 + ((emp.name.length * 7) % 5) * 0.4,
        phase: 'toDesk',
        timer: 2 + k * 0.7,
        bob: Math.random() * Math.PI * 2,
      });
    }
    refreshPeopleAnchors();
  }

  // ============================================================
  // 三·五、3D 布局编辑模式（房间拖放/调尺寸、家具放置/移动/旋转/卖出、隔墙/门）
  // 校验一律走 floorplan.js；变更走 rebuildDyn() 增量更新 + onChanged 回调（autoSave/顶栏刷新）
  // ============================================================
  let editMode = false;
  let editTool = 'select';            // select | furniture:<id> | wall | door | move-room | resize | remove
  let editDept = DEPT_IDS_9[0];
  let ghost = null;                   // 当前幽灵 { group, kind, valid, reason, data }
  let dragRoom = null;                // 拖房中：{ dept }
  let dragItem = null;                // 拖家具中：{ uid }
  let resizeRoom = null;              // 调尺寸中：{ dept, corner:[x,y] 固定对角 }
  let ghostRot = 0;
  let selectedUid = null;
  let onChangedCb = null;
  let onToastCb = null;
  const ray = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // 编辑工具条（DOM，编辑模式显示）
  const editbar = document.createElement('div');
  editbar.style.cssText = 'position:absolute;left:10px;top:10px;display:none;flex-direction:column;gap:6px;z-index:6;max-width:380px';
  container.appendChild(editbar);
  function renderEditbar() {
    const tools = [
      ['select', '☝ 选择/移动'], ['move-room', '⇄ 拖动房间'], ['resize', '⤡ 调整尺寸'],
      ...FURNITURE.map((f) => [`furniture:${f.id}`, `${f.icon} ${f.name}`]),
      ['wall', '▯ 隔墙'], ['door', '⊓ 移门'], ['remove', '✕ 拆除(退一半)'],
    ];
    editbar.innerHTML = `
      <div class="row" style="flex-wrap:wrap;gap:5px;background:rgba(8,11,16,.92);border:1px solid #2a3546;border-radius:10px;padding:8px">
        ${DEPT_DEFS.slice(0, 9).map((d) => `<button class="btn tiny ${editDept === d.id ? 'primary' : ''}" data-ed="${d.id}">${d.name}</button>`).join('')}
      </div>
      <div class="row" style="flex-wrap:wrap;gap:5px;background:rgba(8,11,16,.92);border:1px solid #2a3546;border-radius:10px;padding:8px">
        ${tools.map(([id, name]) => `<button class="btn tiny ${editTool === id ? 'primary' : ''}" data-et="${id}">${name}</button>`).join('')}
      </div>
      <div class="tiny dim" style="background:rgba(8,11,16,.8);border-radius:8px;padding:6px 8px;line-height:1.6">
        左键放置/拖拽 · R 旋转 · 右键/Esc 取消 · 移动免费，卖出退一半 · 隔墙会真的挡住员工</div>`;
  }
  editbar.addEventListener('click', (e) => {
    const d = e.target.closest('[data-ed]');
    if (d) { editDept = d.dataset.ed; renderEditbar(); return; }
    const t = e.target.closest('[data-et]');
    if (t) setTool(t.dataset.et);
  });

  function setTool(t) {
    editTool = t;
    cancelGhost();
    renderEditbar();
    dom.style.cursor = 'crosshair';
  }

  function setEditMode(on) {
    editMode = !!on;
    editbar.style.display = editMode ? 'flex' : 'none';
    gridGroup.visible = editMode;
    cancelGhost();
    if (editMode) {
      goal.phi = 0.62; goal.radius = 170;
      orbit.target.set(0, 0, 0);
      renderEditbar();
      if (onToastCb) onToastCb('布局编辑：选择工具后左键操作，R 旋转，Esc 取消', 'info');
    } else {
      goal.phi = Math.PI * 0.27; goal.radius = 150;
      dom.style.cursor = 'grab';
    }
  }

  function cancelGhost() {
    if (ghost) { scene.remove(ghost.group); disposeObj(ghost.group); ghost = null; }
    dragRoom = null; dragItem = null; resizeRoom = null;
  }

  function pointerWorld(e) {
    const rect = dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    ray.setFromCamera(ndc, camera);
    const pt = new THREE.Vector3();
    if (!ray.ray.intersectPlane(floorPlane, pt)) return null;
    return { x: pt.x, z: pt.z };
  }

  function ghostMat(valid) {
    return new THREE.MeshStandardMaterial({
      color: valid ? 0x37c9a5 : 0xf56b6b, transparent: true, opacity: 0.45,
      emissive: valid ? 0x1d6b4f : 0x7a2a2a, emissiveIntensity: 0.6, depthWrite: false,
    });
  }

  function clearGhost() {
    if (ghost) { scene.remove(ghost.group); disposeObj(ghost.group); ghost = null; }
  }

  function showFurnitureGhost(cell, type, rot, deptId) {
    if (ghost && ghost.kind === 'furniture' && ghost.data.cell.cx === cell.cx && ghost.data.cell.cy === cell.cy
      && ghost.data.rot === rot && ghost.data.type === type && ghost.data.dept === deptId) return;
    clearGhost();
    const headcountsNow = deptHeadcounts(state);
    const room = layout.rooms[deptId];
    const v = validateFurniturePlace(layout, deptId, { type, cx: cell.cx - room.cx, cy: cell.cy - room.cy, rot }, headcountsNow);
    const w = roomCellWorld(layout, deptId, cell.cx - room.cx, cell.cy - room.cy);
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.85, 2.6, CELL * 0.85), ghostMat(v.ok));
    box.position.set(w.x, 1.5, w.z);
    g.add(box);
    scene.add(g);
    ghost = { group: g, kind: 'furniture', valid: v.ok, reason: v.reason, data: { cell, type, rot, dept: deptId } };
  }

  function showRoomGhost(deptId, topLeft) {
    if (ghost && ghost.kind === 'room' && ghost.data.dept === deptId
      && ghost.data.cx === topLeft.cx && ghost.data.cy === topLeft.cy) return;
    clearGhost();
    const room = layout.rooms[deptId];
    const headcountsNow = deptHeadcounts(state);
    const v = validateRoomPlace(layout, deptId, { cx: topLeft.cx, cy: topLeft.cy, w: room.w, h: room.h }, headcountsNow);
    const g = new THREE.Group();
    const x0 = topLeft.cx * CELL - FLOOR_X / 2, z0 = topLeft.cy * CELL - FLOOR_Z / 2;
    const w = room.w * CELL, h = room.h * CELL;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, h), ghostMat(v.ok));
    pad.position.set(x0 + w / 2, 0.9, z0 + h / 2);
    g.add(pad);
    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x0, 0.4, z0), new THREE.Vector3(x0 + w, 0.4, z0),
      new THREE.Vector3(x0 + w, 0.4, z0 + h), new THREE.Vector3(x0, 0.4, z0 + h),
    ]), new THREE.LineBasicMaterial({ color: v.ok ? 0x37c9a5 : 0xf56b6b }));
    g.add(outline);
    scene.add(g);
    ghost = { group: g, kind: 'room', valid: v.ok, reason: v.reason, data: { dept: deptId, ...topLeft } };
  }

  function showResizeGhost(deptId, rect) {
    if (ghost && ghost.kind === 'resize' && ghost.data.rect.cx === rect.cx && ghost.data.rect.cy === rect.cy
      && ghost.data.rect.w === rect.w && ghost.data.rect.h === rect.h) return;
    clearGhost();
    const headcountsNow = deptHeadcounts(state);
    const v = validateRoomPlace(layout, deptId, rect, headcountsNow);
    const g = new THREE.Group();
    const x0 = rect.cx * CELL - FLOOR_X / 2, z0 = rect.cy * CELL - FLOOR_Z / 2;
    const w = rect.w * CELL, h = rect.h * CELL;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, h), ghostMat(v.ok));
    pad.position.set(x0 + w / 2, 0.9, z0 + h / 2);
    g.add(pad);
    scene.add(g);
    ghost = { group: g, kind: 'resize', valid: v.ok, reason: v.reason, data: { dept: deptId, rect } };
  }

  // ---------- 操作应用（校验 → 改数据 → rebuildDyn → 回调） ----------
  function notify(msg, kind) {
    if (onToastCb) onToastCb(msg, kind || 'info');
  }
  function fmtCost(n) { return '¥' + (n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n)); }
  function afterChange() {
    try { autoSave(state); } catch (e) { /* 忽略 */ }
    if (onChangedCb) onChangedCb();
  }

  function applyPlaceFurniture(deptId, cell, type, rot) {
    const f = FURNITURE_MAP[type];
    const room = layout.rooms[deptId];
    const headcountsNow = deptHeadcounts(state);
    const v = validateFurniturePlace(layout, deptId, { type, cx: cell.cx - room.cx, cy: cell.cy - room.cy, rot }, headcountsNow);
    if (!v.ok) { notify(v.reason, 'warn'); return false; }
    if (state.company.cash < f.cost) { notify('资金不足', 'bad'); return false; }
    state.company.cash -= f.cost;
    layout.items.push({
      uid: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      type, dept: deptId,
      cx: cell.cx - room.cx, cy: cell.cy - room.cy, rot,
    });
    state.log.unshift({ t: `${state.date.year}/${state.date.month + 1}`, type: 'system', text: `购置家具：${f.name}（${fmtCost(f.cost)}）` });
    rebuildDyn();
    afterChange();
    return true;
  }

  function applyMoveFurniture(uidKey, cell) {
    const it = layout.items.find((x) => x.uid === uidKey);
    if (!it) return false;
    const room = layout.rooms[it.dept];
    const nlx = cell.cx - room.cx, nly = cell.cy - room.cy;
    if (nlx === it.cx && nly === it.cy) return false;
    const headcountsNow = deptHeadcounts(state);
    const v = validateFurniturePlace(layout, it.dept, { type: it.type, cx: nlx, cy: nly, rot: it.rot }, headcountsNow, { skipItem: uidKey });
    if (!v.ok) { notify(v.reason, 'warn'); return true; } // 无效落点保持拖拽态
    it.cx = nlx; it.cy = nly;
    rebuildDyn();
    afterChange();
    return true;
  }

  function applyRotateFurniture(uidKey) {
    const it = layout.items.find((x) => x.uid === uidKey);
    if (!it) return false;
    it.rot = ((it.rot || 0) + 1) % 4;
    rebuildDyn();
    afterChange();
    return true;
  }

  function applySellFurniture(uidKey) {
    const idx = layout.items.findIndex((x) => x.uid === uidKey);
    if (idx < 0) return false;
    const it = layout.items[idx];
    const f = FURNITURE_MAP[it.type];
    const refund = Math.round(f.cost / 2);
    state.company.cash += refund;
    layout.items.splice(idx, 1);
    state.log.unshift({ t: `${state.date.year}/${state.date.month + 1}`, type: 'system', text: `拆除家具：${f.name}（退还 ${fmtCost(refund)}）` });
    rebuildDyn();
    afterChange();
    return true;
  }

  function applyMoveRoom(deptId, topLeft) {
    const room = layout.rooms[deptId];
    const headcountsNow = deptHeadcounts(state);
    const v = validateRoomPlace(layout, deptId, { ...room, cx: topLeft.cx, cy: topLeft.cy }, headcountsNow);
    if (!v.ok) { notify(v.reason, 'warn'); return false; }
    room.cx = topLeft.cx; room.cy = topLeft.cy;
    autoDoor(layout, deptId);
    rebuildDyn();
    afterChange();
    return true;
  }

  function applyResizeRoom(deptId, rect) {
    const headcountsNow = deptHeadcounts(state);
    const v = validateRoomPlace(layout, deptId, rect, headcountsNow);
    if (!v.ok) { notify(v.reason, 'warn'); return false; }
    const room = layout.rooms[deptId];
    const outside = layout.items.filter((i) => i.dept === deptId && (i.cx >= rect.w || i.cy >= rect.h));
    for (const it of outside) {
      state.company.cash += FURNITURE_MAP[it.type].cost;
      layout.items.splice(layout.items.indexOf(it), 1);
    }
    room.cx = rect.cx; room.cy = rect.cy; room.w = rect.w; room.h = rect.h;
    autoDoor(layout, deptId);
    rebuildDyn();
    if (outside.length) notify(`房间缩小：${outside.length} 件界外家具已按原价回收`, 'info');
    afterChange();
    return true;
  }

  function applyToggleWall(deptId, edge) {
    const p = PARTITIONS_MAP.wall;
    const headcountsNow = deptHeadcounts(state);
    const v = validateEdgeToggle(layout, deptId, edge, headcountsNow);
    if (!v.ok) { notify(v.reason, 'warn'); return false; }
    if (v.removed) {
      const idx = layout.edges.findIndex((e) => e.dept === deptId && e.orient === edge.orient && e.ex === edge.ex && e.ey === edge.ey);
      state.company.cash += Math.round(p.cost / 2);
      layout.edges.splice(idx, 1);
    } else {
      if (state.company.cash < p.cost) { notify('资金不足', 'bad'); return false; }
      state.company.cash -= p.cost;
      layout.edges.push({ ...edge, dept: deptId });
    }
    rebuildDyn();
    afterChange();
    return true;
  }

  function applyMoveDoor(deptId, side, t) {
    const v = validateDoorMove(layout, deptId, side, t);
    if (!v.ok) { notify(v.reason, 'warn'); return false; }
    layout.rooms[deptId].door = { side, t };
    rebuildDyn();
    afterChange();
    return true;
  }

  // ---------- 编辑态指针交互 ----------
  function roomAtCell(cell) {
    return roomAt(layout, cell.cx, cell.cy);
  }
  function furnitureAt(cell) {
    const deptId = roomAtCell(cell);
    if (!deptId) return null;
    const room = layout.rooms[deptId];
    const lx = cell.cx - room.cx, ly = cell.cy - room.cy;
    const hit = layout.items.find((i) => i.dept === deptId && i.cx === lx && i.cy === ly);
    if (hit) return { ...hit, world: roomCellWorld(layout, deptId, lx, ly) };
    const bd = builtinDesks(layout, deptHeadcounts(state)).find((d) => d.dept === deptId && d.lx === lx && d.ly === ly);
    if (bd) return { builtin: true, type: 'desk', dept: deptId, uid: null, cx: lx, cy: ly, world: roomCellWorld(layout, deptId, lx, ly) };
    return null;
  }

  function onEditPointerDown(e) {
    if (e.button === 2) { cancelGhost(); dragItem = null; return true; }
    const wpt = pointerWorld(e);
    if (!wpt) return true;
    const cell = worldToCell(wpt.x, wpt.z);
    if (ghost && ghost.kind === 'room') {
      if (ghost.valid && applyMoveRoom(ghost.data.dept, { cx: ghost.data.cx, cy: ghost.data.cy })) cancelGhost();
      else if (!ghost.valid) notify(ghost.reason, 'warn');
      return true;
    }
    if (ghost && ghost.kind === 'resize') {
      if (ghost.valid) applyResizeRoom(ghost.data.dept, ghost.data.rect);
      else notify(ghost.reason, 'warn');
      cancelGhost();
      return true;
    }
    if (dragItem) {
      applyMoveFurniture(dragItem.uid, cell);
      return true;
    }
    if (editTool === 'select') {
      const f = furnitureAt(cell);
      if (f && !f.builtin) { dragItem = { uid: f.uid }; selectedUid = f.uid; dom.style.cursor = 'move'; }
      else if (f && f.builtin) notify('内置工位随部门人数自动增减；可购买工位桌自定义位置', 'info');
      else { selectedUid = null; cancelGhost(); }
      return true;
    }
    if (editTool.startsWith('furniture:')) {
      const deptId = roomAtCell(cell);
      if (!deptId) { notify('请点击部门房间内部', 'info'); return true; }
      applyPlaceFurniture(deptId, cell, editTool.split(':')[1], ghostRot);
      return true;
    }
    if (editTool === 'remove') {
      const f = furnitureAt(cell);
      if (!f) { notify('这里没有家具', 'info'); return true; }
      if (f.builtin) { notify('内置工位不可拆除（随人数自动变化）', 'info'); return true; }
      applySellFurniture(f.uid);
      return true;
    }
    if (editTool === 'move-room') {
      const deptId = roomAtCell(cell);
      if (!deptId) { notify('请点击要移动的房间', 'info'); return true; }
      dragRoom = { dept: deptId };
      return true;
    }
    if (editTool === 'resize') {
      const deptId = roomAtCell(cell);
      if (!deptId) { notify('请点击要调整的房间', 'info'); return true; }
      const r = layout.rooms[deptId];
      const fx = cell.cx < r.cx + r.w / 2 ? r.cx + r.w : r.cx;
      const fy = cell.cy < r.cy + r.h / 2 ? r.cy + r.h : r.cy;
      resizeRoom = { dept: deptId, corner: [fx, fy] };
      return true;
    }
    if (editTool === 'wall' || editTool === 'door') {
      const deptId = roomAtCell(cell);
      if (!deptId) { notify('请点击部门房间', 'info'); return true; }
      const room = layout.rooms[deptId];
      const lx = cell.cx - room.cx, ly = cell.cy - room.cy;
      const center = roomCellWorld(layout, deptId, lx, ly);
      const dx = wpt.x - center.x, dz = wpt.z - center.z;
      if (editTool === 'wall') {
        const edge = Math.abs(dx) > Math.abs(dz)
          ? { orient: 'v', ex: lx + (dx > 0 ? 1 : 0), ey: ly }
          : { orient: 'h', ex: lx, ey: ly + (dz > 0 ? 1 : 0) };
        applyToggleWall(deptId, edge);
      } else {
        const onEdge = lx === 0 || ly === 0 || lx === room.w - 1 || ly === room.h - 1;
        if (!onEdge) { notify('点击房间边缘格来移动门位', 'info'); return true; }
        let side, t;
        if (lx === room.w - 1 && Math.abs(dx) >= Math.abs(dz)) { side = 'E'; t = ly; }
        else if (lx === 0 && Math.abs(dx) >= Math.abs(dz)) { side = 'W'; t = ly; }
        else if (ly === room.h - 1) { side = 'S'; t = lx; }
        else { side = 'N'; t = lx; }
        applyMoveDoor(deptId, side, t);
      }
      return true;
    }
    return true;
  }

  function onEditPointerMove(e) {
    const wpt = pointerWorld(e);
    if (!wpt) return;
    const cell = worldToCell(wpt.x, wpt.z);
    if (dragItem) {
      const it = layout.items.find((x) => x.uid === dragItem.uid);
      if (!it) { dragItem = null; return; }
      showFurnitureGhost(cell, it.type, it.rot, it.dept);
      return;
    }
    if (dragRoom) {
      const room = layout.rooms[dragRoom.dept];
      showRoomGhost(dragRoom.dept, { cx: cell.cx - Math.floor(room.w / 2), cy: cell.cy - Math.floor(room.h / 2) });
      return;
    }
    if (resizeRoom) {
      const room = layout.rooms[resizeRoom.dept];
      const [fx, fy] = resizeRoom.corner;
      const nw = Math.max(ROOM_MIN, Math.min(ROOM_MAX, Math.abs(cell.cx - fx) + 1));
      const nh = Math.max(ROOM_MIN, Math.min(ROOM_MAX, Math.abs(cell.cy - fy) + 1));
      const rx = fx <= cell.cx ? fx : fx - nw + 1;
      const ry = fy <= cell.cy ? fy : fy - nh + 1;
      showResizeGhost(resizeRoom.dept, { cx: rx, cy: ry, w: nw, h: nh });
      return;
    }
    if (editTool.startsWith('furniture:')) {
      const deptId = roomAtCell(cell);
      if (deptId) showFurnitureGhost(cell, editTool.split(':')[1], ghostRot, deptId);
      else clearGhost();
    }
  }

  function onEditKey(e) {
    if (!editMode) return;
    if (e.key === 'r' || e.key === 'R') {
      ghostRot = (ghostRot + 1) % 4;
      if (ghost && ghost.kind === 'furniture') {
        const d = ghost.data;
        showFurnitureGhost(d.cell, d.type, ghostRot, d.dept);
      } else if (dragItem) applyRotateFurniture(dragItem.uid);
    }
    if (e.key === 'Escape') { cancelGhost(); dragItem = null; dom.style.cursor = 'crosshair'; }
  }
  window.addEventListener('keydown', onEditKey);

  function updateLayout() {
    rebuildDyn();
  }

  rebuildDyn();
  spawnPeople();

  // ============================================================
  // 四、相机：双视角切换 + 平移 + 剖面
  // ============================================================
  const orbit = {
    theta: Math.PI * 0.21, phi: Math.PI * 0.27, radius: 150,
    target: new THREE.Vector3(0, 4, 0),
  };
  const goal = { theta: orbit.theta, phi: orbit.phi, radius: orbit.radius };
  let viewMode = 'iso'; // iso | top
  let dragging = false, panning = false, lx = 0, ly = 0;
  const dom = renderer.domElement;
  dom.style.cursor = 'grab';

  // 视角切换按钮
  const ctrl = document.createElement('div');
  ctrl.style.cssText = 'position:absolute;top:10px;right:10px;display:flex;gap:6px;z-index:5;align-items:center';
  ctrl.innerHTML = `
    <span class="chip mono" id="office-clock" style="pointer-events:none">09:45</span>
    <button class="btn small" data-day="0" title="暂停日程">⏸</button>
    <button class="btn small primary" data-day="1">×1</button>
    <button class="btn small" data-day="3" title="快速日程">×3</button>
    <button class="btn small primary" data-view="iso">45° 视角</button>
    <button class="btn small" data-view="top">俯视</button>
    <button class="btn small" data-edit title="在 3D 内拖放房间与家具">布局编辑</button>`;
  container.style.position = 'relative';
  container.appendChild(ctrl);
  ctrl.addEventListener('click', (e) => {
    const d = e.target.closest('[data-day]');
    if (d) {
      daySpeed = Number(d.dataset.day);
      ctrl.querySelectorAll('[data-day]').forEach((x) => x.classList.toggle('primary', x === d));
      return;
    }
    if (e.target.closest('[data-edit]')) {
      setEditMode(!editMode);
      e.target.closest('[data-edit]').classList.toggle('primary', editMode);
      return;
    }
    const b = e.target.closest('[data-view]');
    if (!b) return;
    viewMode = b.dataset.view;
    ctrl.querySelectorAll('button').forEach((x) => x.classList.toggle('primary', x === b));
    if (viewMode === 'top') {
      goal.theta = Math.PI * 0.21; goal.phi = 0.06; goal.radius = 190;
      orbit.target.set(0, 0, 10);
    } else {
      goal.theta = Math.PI * 0.21; goal.phi = Math.PI * 0.27; goal.radius = 150;
      orbit.target.set(0, 4, 0);
    }
  });

  dom.addEventListener('contextmenu', (e) => e.preventDefault());
  // 触摸设备上禁止画布区域触发页面滚动/缩放，手势只作用于视角
  dom.style.touchAction = 'none';
  dom.addEventListener('pointerdown', (e) => {
    if (editMode) {
      if (e.pointerType !== 'mouse') e.preventDefault();
      // 编辑模式：左键=编辑操作，右键=视角平移
      if (e.button === 2 || e.ctrlKey) {
        dragging = true; panning = true;
        lx = e.clientX; ly = e.clientY;
        dom.setPointerCapture(e.pointerId);
        return;
      }
      lx = e.clientX; ly = e.clientY;
      dom.setPointerCapture(e.pointerId);
      onEditPointerDown(e);
      return;
    }
    if (e.pointerType !== 'mouse') e.preventDefault();
    dragging = true; panning = e.button === 2 || e.ctrlKey;
    lx = e.clientX; ly = e.clientY;
    dom.setPointerCapture(e.pointerId);
    dom.style.cursor = 'grabbing';
  });
  dom.addEventListener('pointerup', (e) => {
    if (editMode && !panning) {
      // 拖拽中的家具在 pointerup 落定（与 onEditPointerDown 的点击放置共用逻辑）
      dragging = false; panning = false;
      dom.style.cursor = editMode ? 'crosshair' : 'grab';
      return;
    }
    dragging = false; panning = false;
    dom.style.cursor = editMode ? 'crosshair' : 'grab';
  });
  dom.addEventListener('pointermove', (e) => {
    if (editMode && !panning) {
      onEditPointerMove(e);
      return;
    }
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    if (panning) {
      // 平移：沿相机右向与前向水平投影
      const right = new THREE.Vector3().setFromSpherical(new THREE.Spherical(1, Math.PI / 2, orbit.theta + Math.PI / 2));
      const fwd = new THREE.Vector3(-Math.sin(orbit.theta), 0, -Math.cos(orbit.theta));
      const k = orbit.radius * 0.0016;
      orbit.target.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
      const lim = 150;
      orbit.target.x = Math.max(-lim, Math.min(lim, orbit.target.x));
      orbit.target.z = Math.max(-lim, Math.min(lim, orbit.target.z));
      if (viewMode === 'top') goal.phi = 0.06;
    } else {
      goal.theta -= dx * 0.007;
      goal.phi = Math.max(viewMode === 'top' ? 0.04 : 0.18, Math.min(Math.PI / 2.05, goal.phi - dy * 0.005));
    }
  });
  dom.addEventListener('wheel', (e) => {
    e.preventDefault();
    goal.radius = Math.max(50, Math.min(340, goal.radius * (1 + Math.sign(e.deltaY) * 0.08)));
  }, { passive: false });

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ---------- 员工行为推进 ----------
  // 日程时钟：一天 = DAY_LEN 秒真实时间；上午会/午休/下班离场
  const DAY_LEN = 160;
  let dayT = 0.30; // 从上午开始
  let daySpeed = 1;
  function activityAt(t) {
    if (t < 0.16) return 'desk';        // 9:00-11:00 工作
    if (t < 0.22) return 'meet';        // 11:00-11:45 晨会
    if (t < 0.50) return 'desk';        // 11:45-15:00 工作
    if (t < 0.56) return 'break';       // 15:00-15:45 午休/茶水间
    if (t < 0.88) return 'desk';        // 15:45-18:30 工作
    return 'leave';                     // 18:30+ 下班离场
  }
  function timeLabel(t) {
    const h = 9 + t * 10.5; // 9:00 → 19:30
    return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  }

  function stepPeople(dt) {
    dayT += (dt * daySpeed) / DAY_LEN;
    if (dayT >= 1) {
      dayT = 0;
      for (const p of people) { p.group.visible = true; p.phase = 'toDesk'; p.path = []; }
    }
    const want = activityAt(dayT);
    for (const p of people) {
      p.timer -= dt;
      // 日程切换：强制改道（除已离场与正在赶路且目标一致的情形）
      if (p.phase !== 'gone') {
        const cur = p.phase === 'toDesk' || p.phase === 'working' ? 'desk'
          : p.phase === 'toMeet' || p.phase === 'meeting' ? 'meet'
          : p.phase === 'toLeave' ? 'leave' : 'break';
        if (cur !== want && p.phase !== 'toMeet' && p.phase !== 'toLeave') {
          p.path = [];
          if (want === 'meet') { p.phase = 'toMeet'; p.timer = 0; }
          else if (want === 'leave') { p.phase = 'toLeave'; p.timer = 0; }
          else if (want === 'desk') { p.phase = 'toDesk'; p.timer = 0; }
          else { p.phase = 'toBreak'; p.timer = 0; }
        }
      }
      if (p.phase === 'gone') continue;
      if (p.phase === 'toDesk' || p.phase === 'toBreak' || p.phase === 'toMeet' || p.phase === 'toLeave') {
        if (!p.path.length) {
          // 规划路径：一律走 floorplan 校验层（出房经门、走廊 BFS、隔墙与家具阻挡）
          const from = p.group.position;
          let pts;
          if (p.phase === 'toDesk') {
            pts = routePath(layout, headcounts, { x: from.x, z: from.z }, p.dept, { lx: p.seat.lx ?? 0, ly: p.seat.ly ?? 0 }).slice(1);
            // 终点落在工位坐位（seat.x/z），航点最后一段直接指向坐位
            if (pts.length) pts[pts.length - 1] = { x: p.seat.x, z: p.seat.z };
            else pts = [{ x: p.seat.x, z: p.seat.z }];
          } else if (p.phase === 'toMeet') {
            const jc = worldToCell(meetPoint.x + (Math.random() - 0.5) * 8, meetPoint.z + (Math.random() - 0.5) * 2);
            pts = routeToCell(layout, { x: from.x, z: from.z }, jc).slice(1);
          } else if (p.phase === 'toLeave') {
            pts = routeToCell(layout, { x: from.x, z: from.z }, ENTRANCE_CELL).slice(1);
          } else {
            // 茶歇：房内随机空闲格
            const r = layout.rooms[p.dept];
            const occ = new Set(layout.items.filter((i) => i.dept === p.dept).map((i) => i.cx + ',' + i.cy));
            const cand = [];
            for (let lx = 0; lx < r.w; lx++) for (let ly = 0; ly < r.h; ly++) if (!occ.has(lx + ',' + ly)) cand.push({ lx, ly });
            const pickL = cand.length ? cand[Math.floor(Math.random() * cand.length)] : { lx: Math.floor(r.w / 2), ly: Math.floor(r.h / 2) };
            pts = routePath(layout, headcounts, { x: from.x, z: from.z }, p.dept, pickL).slice(1);
          }
          p.path = pts.map((v) => new THREE.Vector3(v.x, 0, v.z));
          p.seg = 0;
        }
        const tgt = p.path[p.seg];
        const d = tgt.clone().sub(p.group.position).setY(0);
        const dist = d.length();
        if (dist < 0.6) {
          p.seg += 1;
          if (p.seg >= p.path.length) {
            p.path = [];
            if (p.phase === 'toDesk') {
              p.phase = 'working';
              p.timer = 8 + Math.random() * 14;
              p.group.position.set(p.seat.x, 0, p.seat.z);
              p.group.rotation.y = p.seat.rot;
            } else if (p.phase === 'toMeet') {
              p.phase = 'meeting';
              p.timer = 3 + Math.random() * 4;
            } else if (p.phase === 'toLeave') {
              p.phase = 'gone';
              p.group.visible = false;
            } else {
              p.phase = 'breaking';
              p.timer = 3 + Math.random() * 5;
            }
          }
        } else {
          d.normalize();
          p.group.position.addScaledVector(d, Math.min(p.speed * dt, dist));
          p.group.rotation.y = Math.atan2(d.x, d.z);
          // 走路摆动
          p.bob += dt * 9;
          p.group.children[0].position.y = 2.55 + Math.sin(p.bob) * 0.08;
        }
      } else if (p.phase === 'working') {
        // 工位上轻微起伏
        p.bob += dt * 1.6;
        p.group.children[0].position.y = 2.55 + Math.sin(p.bob) * 0.04;
        if (p.timer <= 0) {
          p.phase = 'toBreak';
          p.timer = 0;
        }
      } else if (p.phase === 'meeting') {
        p.bob += dt * 1.2;
        p.group.children[0].position.y = 2.55 + Math.sin(p.bob) * 0.03;
        if (p.timer <= 0) p.timer = 2 + Math.random() * 3; // 会议中偶尔转身
      } else if (p.phase === 'breaking') {
        if (p.timer <= 0) {
          p.phase = 'toDesk';
          p.timer = 0;
        }
      }

    }
  }

  let raf = 0;
  const clock = new THREE.Clock();
  const camDir = new THREE.Vector3();
  function loop() {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta());
    // 相机目标平滑插值
    orbit.theta += (goal.theta - orbit.theta) * 0.12;
    orbit.phi += (goal.phi - orbit.phi) * 0.12;
    orbit.radius += (goal.radius - orbit.radius) * 0.12;
    const sph = new THREE.Spherical(orbit.radius, orbit.phi, orbit.theta);
    camera.position.setFromSpherical(sph).add(orbit.target);
    camera.lookAt(orbit.target);
    // 剖面：面朝相机的墙体隐藏；天花板只在接近正俯视时显示
    camDir.copy(camera.position).sub(orbit.target).setY(0).normalize();
    const topDown = orbit.phi < 0.16;
    ceiling.visible = topDown;
    ceiling.traverse((o) => { o.visible = topDown; });
    for (const c of cutaways) {
      const n = c.userData.cutNormal;
      c.visible = camDir.dot(n) < 0.34;
    }
    // 楼宇屋顶只在俯视时显示
    group.traverse((o) => {
      if (o.userData.roofOnly) o.visible = topDown;
    });
    stepPeople(dt);
    const clockEl = ctrl.querySelector('#office-clock');
    if (clockEl) clockEl.textContent = timeLabel(dayT);
    renderer.render(scene, camera);
  }
  loop();

  return {
    setEditMode,
    updateLayout,
    setOnChanged(cb) { onChangedCb = cb; },
    setOnToast(cb) { onToastCb = cb; },
    // 测试钩子（CDP 验收用）：不经指针事件直接驱动编辑操作
    __test: {
      setTool: (t) => setTool(t),
      isActive: () => editMode,
      moveRoom: (deptId, cx, cy) => applyMoveRoom(deptId, { cx, cy }),
      resizeRoom: (deptId, w, h) => {
        const r = layout.rooms[deptId];
        return applyResizeRoom(deptId, { cx: r.cx, cy: r.cy, w, h });
      },
      placeFurniture: (deptId, type, cx, cy) => applyPlaceFurniture(deptId, { cx: layout.rooms[deptId].cx + cx, cy: layout.rooms[deptId].cy + cy }, type, 0),
      toggleWall: (deptId, edge) => applyToggleWall(deptId, edge),
      layout: () => JSON.parse(JSON.stringify(layout)),
      seats: () => ({ ...seatsByDept }),
      reach: () => reachability(layout),
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ctrl.remove();
      editbar.remove();
      window.removeEventListener('keydown', onEditKey);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          m.map?.dispose();
          m.dispose();
        });
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
