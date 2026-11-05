// 公司园区 3D 场景：等距办公室 + 园区地块楼宇 + 员工寻路行为 + 室内家具与剖面
//
// 视角约定：
// - 45° 等距（默认）：隐藏面朝相机的墙体与天花板，方便看清室内
// - 正俯视：显示天花板，适合看整体布局
import * as THREE from '../../vendor/three.module.js';
import { DEPT_DEFS } from '../core/state.js';
import { FURNITURE_MAP } from '../data/furniture.js';

// 室内编辑网格：每个部门 6×6 格
export const LAYOUT_GRID = 6;
export const LAYOUT_CELL = 3.9;

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
    new THREE.BoxGeometry(104, 2, 104),
    new THREE.MeshStandardMaterial({ color: 0x161d27, roughness: 0.9, metalness: 0.1 })
  );
  floor.position.y = -0.4;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(104, 26, 0x24303d, 0x1a222c);
  grid.position.y = 0.62;
  scene.add(grid);

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
    deskTop: new THREE.BoxGeometry(6.2, 0.28, 3.4),
    deskLeg: new THREE.BoxGeometry(0.22, 1.5, 3.2),
    monitor: new THREE.BoxGeometry(2.2, 1.3, 0.14),
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
  // 一、部门分区 + 工位 + 员工行为（总部办公室内部）
  // 布局参考真实办公楼：一条中央走廊（宽 4），两侧是各部门办公室
  // ============================================================
  const CELL = 24;
  const people = []; // { group, path, seg, t, phase, timer, deptColor, seatPos }

  // 走廊式布局：北排 5 间（研发/设计/生产/质量/供应链），南排 4 间（市场/销售/财务/人事）
  // 部门顺序按 DEPT_DEFS 前 9 个；走廊沿 X 轴，z ∈ [-2, 2]
  function deptCenter(i) {
    if (i < 5) return { x: (i - 2) * CELL, z: -14 };
    return { x: (i - 6.5) * CELL, z: 14 };
  }
  const ENTRANCE = { x: -64, z: 0 }; // 主入口：走廊西端

  // 部门房间门：每间房都开向中央走廊
  function deptDoor(cx, cz) {
    return { along: 'x', pos: cz > 0 ? cz - 12 : cz + 12 };
  }

  // 进场路径：走廊西端入口 → 沿走廊到门口 → 进门 → 工位
  function planEntry(seat, cx, cz) {
    const door = deptDoor(cx, cz);
    const dirZ = cz > 0 ? -1 : 1; // 房门朝走廊的方向
    const outer = { x: cx, z: door.pos + dirZ * 2.5 };  // 走廊侧
    const inner = { x: cx, z: door.pos - dirZ * 2.5 };  // 房间侧
    return [
      { x: ENTRANCE.x, z: ENTRANCE.z },
      { x: cx, z: ENTRANCE.z },
      { x: cx, z: outer.z },
      { x: cx, z: inner.z },
      { x: seat.x, z: seat.z },
    ];
  }

  // 出房间到走廊的路径（进场的逆序，去掉入口点）：工位 → 门内 → 门外 → 走廊
  function planExit(seat, cx, cz) {
    return planEntry(seat, cx, cz).reverse().slice(1);
  }

  DEPT_DEFS.slice(0, 9).forEach((dept, i) => {
    const count = state.employees.filter((e) => e.deptId === dept.id).length;
    // 未启用的部门（没有任何员工）不渲染房间——避免出现一排空房间
    if (count <= 0) return;
    const { x: cx, z: cz } = deptCenter(i);
    const col = new THREE.Color(dept.color);

    const pad = new THREE.Mesh(GEO.pad, new THREE.MeshStandardMaterial({
      color: col.clone().multiplyScalar(0.06).offsetHSL(0, 0.01, 0),
      roughness: 0.95, metalness: 0.05,
    }));
    pad.position.set(cx, 0.12, cz);
    pad.receiveShadow = true;
    group.add(pad);

    // 实体隔墙：每部门独立房间（24×24），房门开向中央走廊
    const WALL_H = 7.2, DOOR_W = 5.4, SEG = (24 - DOOR_W) / 2;
    const edgeMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.7, roughness: 0.4 });
    const door = deptDoor(cx, cz);
    for (const axis of ['x', 'z']) {
      for (const s of [-1, 1]) {
        const wpos = (axis === 'x' ? cz : cx) + s * 12;
        const isDoorWall = door.along === axis && Math.abs(door.pos - wpos) < 0.5;
        if (isDoorWall) {
          // 门洞两侧墙段 + 过梁
          const off = DOOR_W / 2 + SEG / 2;
          for (const t of [-1, 1]) {
            const seg = new THREE.Mesh(
              new THREE.BoxGeometry(axis === 'x' ? SEG : 0.7, WALL_H, axis === 'x' ? 0.7 : SEG), MAT.roomWall);
            seg.position.set(axis === 'x' ? cx + t * off : wpos, WALL_H / 2 + 0.12, axis === 'x' ? wpos : cz + t * off);
            seg.castShadow = true; seg.receiveShadow = true;
            group.add(seg);
          }
          const lintel = new THREE.Mesh(
            new THREE.BoxGeometry(axis === 'x' ? DOOR_W : 0.7, WALL_H - 5.2, axis === 'x' ? 0.7 : DOOR_W), MAT.roomWall);
          lintel.position.set(axis === 'x' ? cx : wpos, 5.2 + (WALL_H - 5.2) / 2 + 0.12, axis === 'x' ? wpos : cz);
          group.add(lintel);
        } else {
          const seg = new THREE.Mesh(
            new THREE.BoxGeometry(axis === 'x' ? 24 : 0.7, WALL_H, axis === 'x' ? 0.7 : 24), MAT.roomWall);
          seg.position.set(axis === 'x' ? cx : wpos, WALL_H / 2 + 0.12, axis === 'x' ? wpos : cz);
          seg.castShadow = true; seg.receiveShadow = true;
          group.add(seg);
        }
        // 墙顶部门色发光沿（保持分区辨识度）
        const glow = new THREE.Mesh(
          new THREE.BoxGeometry(axis === 'x' ? 24 : 0.9, 0.16, axis === 'x' ? 0.9 : 24), edgeMat);
        glow.position.set(axis === 'x' ? cx : wpos, WALL_H + 0.28, axis === 'x' ? wpos : cz);
        group.add(glow);
      }
    }

    // 门牌：挂在门上方（走廊侧），关闭深度测试避免被墙体遮挡
    const label = makeLabel(`${dept.name} · ${count}`, dept.color);
    label.scale.set(9.5, 2.4, 1);
    label.position.set(cx, 6.4, door.pos + (cz > 0 ? 0.8 : -0.8));
    label.material.depthTest = false;
    label.renderOrder = 50;
    group.add(label);

    // 工位坐标先收集，供员工寻路使用
    const seats = [];
    const n = Math.min(count, 12);
    const cols = 4;
    for (let k = 0; k < n; k++) {
      const dx = (k % cols - 1.5) * 5.9;
      const dz = (Math.floor(k / cols) - 1) * 7.0;
      const wx = cx + dx, wz = cz + dz;
      seats.push({ x: wx, z: wz + 2.35, rot: Math.PI + (k % 3 - 1) * 0.28 });

      const top = new THREE.Mesh(GEO.deskTop, MAT.desk);
      top.position.set(wx, 2.6, wz);
      top.castShadow = true; top.receiveShadow = true;
      group.add(top);
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(GEO.deskLeg, MAT.deskDark);
        leg.position.set(wx + s * 2.8, 1.5, wz);
        leg.castShadow = true;
        group.add(leg);
      }
      const mon = new THREE.Mesh(GEO.monitor, MAT.screen);
      mon.position.set(wx, 3.6, wz - 0.9);
      group.add(mon);
      const stand = new THREE.Mesh(GEO.monitorStand, MAT.deskDark);
      stand.position.set(wx, 2.95, wz - 0.9);
      group.add(stand);

      const seat = new THREE.Mesh(GEO.seat, MAT.chair);
      seat.position.set(wx, 1.5, wz + 2.4);
      seat.castShadow = true;
      group.add(seat);
      const backRest = new THREE.Mesh(GEO.back, MAT.chair);
      backRest.position.set(wx, 2.25, wz + 3.1);
      backRest.castShadow = true;
      group.add(backRest);
    }

    // 空部门：一盆绿植表示闲置
    if (n === 0) {
      const pot = new THREE.Mesh(GEO.plantPot, MAT.pot);
      pot.position.set(cx, 1.2, cz);
      pot.castShadow = true;
      group.add(pot);
      const leaf = new THREE.Mesh(GEO.plantLeaf, MAT.leaf);
      leaf.position.set(cx, 2.7, cz);
      leaf.castShadow = true;
      group.add(leaf);
    }

    // 员工实体：随机外观 + 行为状态机
    const emps = state.employees.filter((e) => e.deptId === dept.id);
    emps.forEach((emp, k) => {
      const shirt = new THREE.Color(SHIRT_COLORS[(emp.name.charCodeAt(0) + k) % SHIRT_COLORS.length])
        .lerp(col, 0.35);
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
      person.position.set(ENTRANCE.x, 0, ENTRANCE.z); // 从走廊西端主入口进场
      group.add(person);

      const seatPos = seats[k % Math.max(1, seats.length)] || { x: cx, z: cz + 4, rot: Math.PI };
      people.push({
        group: person,
        dept: dept.id,
        deptCx: cx,
        deptCz: cz,
        seat: seatPos,
        path: [],
        seg: 0,
        speed: 5.2 + ((emp.name.length * 7) % 5) * 0.4,
        phase: 'toDesk',   // toDesk → working → toBreak → breaking → toDesk
        timer: 2 + k * 0.7, // 错峰进场
        bob: Math.random() * Math.PI * 2,
        inPlace: false,
      });
    });
  });

  // ---------- 南侧前厅（大门内侧）：logo 地环 + 前台 ----------
  const atrium = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 0.16, 40),
    new THREE.MeshStandardMaterial({ color: 0x1e2833, roughness: 0.55, metalness: 0.35 })
  );
  atrium.position.set(0, 0.2, 45);
  atrium.receiveShadow = true;
  group.add(atrium);

  const logo = new THREE.Mesh(
    new THREE.TorusGeometry(4.2, 0.62, 14, 44),
    new THREE.MeshStandardMaterial({
      color: state.company.logoColor, emissive: state.company.logoColor,
      emissiveIntensity: 1.1, metalness: 0.7, roughness: 0.25,
    })
  );
  logo.rotation.x = -Math.PI / 2;
  logo.position.set(0, 0.7, 45);
  group.add(logo);

  const reception = new THREE.Mesh(new THREE.BoxGeometry(14, 2.4, 3.2), MAT.desk);
  reception.position.set(0, 1.6, 40);
  reception.castShadow = true;
  group.add(reception);
  const receptionTop = new THREE.Mesh(new THREE.BoxGeometry(15, 0.3, 4), new THREE.MeshStandardMaterial({
    color: new THREE.Color(state.company.logoColor), emissive: new THREE.Color(state.company.logoColor),
    emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.5,
  }));
  receptionTop.position.set(0, 2.95, 40);
  group.add(receptionTop);

  // ---------- 围墙（面朝相机时自动隐藏）与天花板 ----------
  const wallH = 26;
  // 北墙（-z）与西墙（-x）：常驻，剖面规则通用
  const wallZ = new THREE.Mesh(new THREE.PlaneGeometry(104, wallH), MAT.wall);
  wallZ.position.set(0, wallH / 2 + 0.6, -52);
  tagCutaway(wallZ, new THREE.Vector3(0, 0, -1));
  group.add(wallZ);
  const wallX = new THREE.Mesh(new THREE.PlaneGeometry(104, wallH), MAT.wall);
  wallX.position.set(-52, wallH / 2 + 0.6, 0);
  wallX.rotation.y = Math.PI / 2;
  tagCutaway(wallX, new THREE.Vector3(-1, 0, 0));
  group.add(wallX);

  // 南侧与东侧矮墙：面朝默认相机，同样参与剖面
  const parapetMat = new THREE.MeshStandardMaterial({ color: 0x141b24, roughness: 0.9, metalness: 0.08 });
  const parapetZ = new THREE.Mesh(new THREE.BoxGeometry(104, 3.4, 1.6), parapetMat);
  parapetZ.position.set(0, 2.3, 52);
  tagCutaway(parapetZ, new THREE.Vector3(0, 0, 1));
  group.add(parapetZ);
  const parapetX = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.4, 104), parapetMat);
  parapetX.position.set(52, 2.3, 0);
  tagCutaway(parapetX, new THREE.Vector3(1, 0, 0));
  group.add(parapetX);

  // 窗
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x39485c, roughness: 0.6, metalness: 0.5 });
  for (let i = 0; i < 6; i++) {
    const wx = -40 + i * 16;
    for (const [axis] of [['z'], ['x']]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 12), MAT.win);
      win.position.set(axis === 'z' ? wx : -51.5, 14.5, axis === 'z' ? -51.5 : wx);
      if (axis === 'x') win.rotation.y = Math.PI / 2;
      tagCutaway(win, axis === 'z' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(-1, 0, 0));
      group.add(win);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(axis === 'z' ? 12.4 : 0.6, 0.6, axis === 'z' ? 0.6 : 12.4), frameMat);
      fr.position.set(axis === 'z' ? wx : -51.3, 20.7, axis === 'z' ? -51.3 : wx);
      tagCutaway(fr, axis === 'z' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(-1, 0, 0));
      group.add(fr);
      const fr2 = fr.clone();
      fr2.position.y = 8.3;
      tagCutaway(fr2, axis === 'z' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(-1, 0, 0));
      group.add(fr2);
    }
  }

  // 天花板：正俯视时可见，45° 时隐藏（看室内）
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(104, 0.8, 104), MAT.ceil);
  ceiling.position.set(0, wallH + 1.2, 0);
  ceiling.castShadow = false;
  group.add(ceiling);
  const ceilingLampMat = new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffe9b8, emissiveIntensity: 0.5 });
  for (let gx = -1; gx <= 1; gx++) {
    for (let gz = -1; gz <= 1; gz++) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 18), ceilingLampMat);
      lamp.position.set(gx * 30, wallH + 0.7, gz * 30);
      ceiling.add(lamp);
    }
  }

  // ---------- 总部大门（园区大道一侧） ----------
  const gateL = new THREE.Mesh(new THREE.BoxGeometry(2, 12, 2), frameMat);
  gateL.position.set(-7, 6, 56);
  group.add(gateL);
  const gateR = gateL.clone();
  gateR.position.x = 7;
  group.add(gateR);
  const gateTop = new THREE.Mesh(new THREE.BoxGeometry(17, 2, 2.2), frameMat);
  gateTop.position.set(0, 13, 56);
  group.add(gateTop);
  // 公司牌匾：挂在横梁正中（左 logo / 右中英文两行，整体居中，任何视角不被遮挡）
  const gateSign = makeCompanyPlaque(
    state.company.name,
    state.company.nameEn || '',
    state.company.logoColor || '#4aa3ff',
    state.company.logoData || '',
  );
  gateSign.position.set(0, 13.4, 57.4);
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
  // 三、室内家具与隔墙（state.officeLayout）
  // ============================================================
  const layout = state.officeLayout || { items: [], edges: [] };
  const half = (LAYOUT_GRID * LAYOUT_CELL) / 2;

  function cellCenter(deptIdx, cx, cy) {
    const dc = deptCenter(deptIdx);
    return { x: dc.x - half + LAYOUT_CELL * (cx + 0.5), z: dc.z - half + LAYOUT_CELL * (cy + 0.5) };
  }

  function makeFurniture(typeId, pos) {
    const g = new THREE.Group();
    switch (typeId) {
      case 'desk': {
        const top = new THREE.Mesh(GEO.deskTop, MAT.desk);
        top.position.y = 2.6; top.castShadow = true;
        const leg = new THREE.Mesh(GEO.deskLeg, MAT.deskDark);
        leg.position.y = 1.5;
        const mon = new THREE.Mesh(GEO.monitor, MAT.screen);
        mon.position.set(0, 3.6, -0.9);
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
    g.position.set(pos.x, 0.6, pos.z);
    return g;
  }

  for (const it of layout.items || []) {
    const deptIdx = DEPT_DEFS.findIndex((d) => d.id === it.dept);
    if (deptIdx < 0 || deptIdx > 8) continue;
    const pos = cellCenter(deptIdx, it.cx, it.cy);
    group.add(makeFurniture(it.type, pos));
  }

  // 隔墙与门（放在部门边缘线上）
  for (const ed of layout.edges || []) {
    const deptIdx = DEPT_DEFS.findIndex((d) => d.id === ed.dept);
    if (deptIdx < 0 || deptIdx > 8) continue;
    const dc = deptCenter(deptIdx);
    // 边缘坐标：ex/ey 是 0..GRID 边界序号
    const isH = ed.orient === 'h';
    const wx = dc.x - half + LAYOUT_CELL * ed.ex;
    const wz = dc.z - half + LAYOUT_CELL * ed.ey;
    const len = LAYOUT_CELL;
    const g = new THREE.Group();
    if (ed.type === 'wall') {
      const seg = new THREE.Mesh(
        isH ? new THREE.BoxGeometry(len, 6, 0.7) : new THREE.BoxGeometry(0.7, 6, len),
        MAT.roomWall
      );
      seg.position.y = 3;
      seg.castShadow = true;
      g.add(seg);
    } else if (ed.type === 'door') {
      // 门 = 两段门柱 + 上梁，中间留 60% 的开口
      const post = isH ? new THREE.BoxGeometry(len * 0.2, 6, 0.7) : new THREE.BoxGeometry(0.7, 6, len * 0.2);
      const lintel = isH ? new THREE.BoxGeometry(len * 0.6, 1.8, 0.7) : new THREE.BoxGeometry(0.7, 1.8, len * 0.6);
      const p1 = new THREE.Mesh(post, MAT.roomWall);
      p1.position.set(isH ? -len * 0.4 : 0, 3, isH ? 0 : -len * 0.4);
      const p2 = new THREE.Mesh(post, MAT.roomWall);
      p2.position.set(isH ? len * 0.4 : 0, 3, isH ? 0 : len * 0.4);
      const top = new THREE.Mesh(lintel, MAT.roomWall);
      top.position.set(0, 5.1, 0);
      g.add(p1, p2, top);
    }
    g.position.set(wx, 0.6, wz);
    group.add(g);
    // 剖面：横墙面向 ±z，竖墙面向 ±x
    if (ed.type === 'wall') {
      tagCutaway(g, isH ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0));
    }
  }

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
    <button class="btn small" data-view="top">俯视</button>`;
  container.style.position = 'relative';
  container.appendChild(ctrl);
  ctrl.addEventListener('click', (e) => {
    const d = e.target.closest('[data-day]');
    if (d) {
      daySpeed = Number(d.dataset.day);
      ctrl.querySelectorAll('[data-day]').forEach((x) => x.classList.toggle('primary', x === d));
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
    if (e.pointerType !== 'mouse') e.preventDefault();
    dragging = true; panning = e.button === 2 || e.ctrlKey;
    lx = e.clientX; ly = e.clientY;
    dom.setPointerCapture(e.pointerId);
    dom.style.cursor = 'grabbing';
  });
  dom.addEventListener('pointerup', () => { dragging = false; panning = false; dom.style.cursor = 'grab'; });
  dom.addEventListener('pointermove', (e) => {
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
  const MEET = { x: 0, z: 0 }; // 中央走廊集合点（晨会）
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
          // 规划路径：房内一律先经房门走到走廊，杜绝穿墙；房外按目标直线
          const from = p.group.position;
          let dest;
          if (p.phase === 'toDesk') dest = new THREE.Vector3(p.seat.x, 0, p.seat.z);
          else if (p.phase === 'toMeet') dest = new THREE.Vector3(MEET.x + (Math.random() - 0.5) * 10, 0, MEET.z + (Math.random() - 0.5) * 2.2);
          else if (p.phase === 'toLeave') dest = new THREE.Vector3(ENTRANCE.x, 0, ENTRANCE.z);
          else dest = new THREE.Vector3(p.deptCx + (Math.random() - 0.5) * 16, 0, p.deptCz + (Math.random() - 0.5) * 16);
          const inRoom = Math.abs(from.x - p.deptCx) < 11.5 && Math.abs(from.z - p.deptCz) < 11.5;
          if ((p.phase === 'toMeet' || p.phase === 'toLeave') && inRoom) {
            // 出房路径（经门洞）→ 目的地
            p.path = planExit(p.seat, p.deptCx, p.deptCz).map((v) => new THREE.Vector3(v.x, 0, v.z));
            p.path.push(dest);
          } else if (p.phase === 'toDesk' && !inRoom) {
            p.path = planEntry(p.seat, p.deptCx, p.deptCz).map((v) => new THREE.Vector3(v.x, 0, v.z));
          } else if (p.phase === 'toMeet' && !inRoom) {
            // 在走廊内：沿走廊走（先回走廊中线再过去，避免斜穿房间）
            p.path = [new THREE.Vector3(from.x, 0, MEET.z), dest];
          } else {
            p.path = [dest];
          }
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
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ctrl.remove();
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
