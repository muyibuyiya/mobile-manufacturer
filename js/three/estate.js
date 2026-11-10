// 园区总览 3D：地块 + 楼宇 + 道路 + 绿化（与楼层内部视图并列）
// 数据源：state.campus.plots（owned / building.typeId / level）；只做展示与视角操作
import * as THREE from '../../vendor/three.module.js';

const PLOT_COLORS = {
  hq: 0x5b7fb8,
  rnd: 0x4fa3a0,
  factory: 0x8a6f4e,
  design: 0xb07ac0,
  logistics: 0x6f8a5f,
  lab: 0x8a8f9f,
};

const TYPE_NAMES = {
  hq: '总部', rnd: '研发', factory: '生产', design: '设计', logistics: '物流', lab: '品质',
};

function makeLabel(text, color = '#dbe6f5') {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(8,12,18,0.72)';
  ctx.roundRect ? ctx.roundRect(4, 8, 248, 48, 10) : ctx.fillRect(4, 8, 248, 48);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = 'bold 26px -apple-system, "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(16, 4, 1);
  return sp;
}

function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.18, ...opts });
}

// 按楼宇类型给不同体块：塔楼 / 厂房 / 低层盒 / 仓库
function makeBuilding(typeId, level) {
  const g = new THREE.Group();
  const color = PLOT_COLORS[typeId] || 0x5b6472;
  const glass = stdMat(0x223349, { roughness: 0.28, metalness: 0.62 });
  const body = stdMat(color);
  if (typeId === 'factory') {
    // 厂房：宽扁主体 + 锯齿屋顶 + 烟囱
    const h = 4.2 + level * 0.9;
    const box = new THREE.Mesh(new THREE.BoxGeometry(20, h, 13), body);
    box.position.y = h / 2; box.castShadow = true; box.receiveShadow = true;
    g.add(box);
    for (let i = 0; i < 4; i++) {
      const saw = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.2, 13), stdMat(0x6f8598));
      saw.position.set(-7.5 + i * 5, h + 0.6, 0);
      saw.rotation.z = 0.22;
      g.add(saw);
    }
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, h + 6, 14), stdMat(0x59636e));
    stack.position.set(7.5, (h + 6) / 2, -5);
    g.add(stack);
    return g;
  }
  if (typeId === 'logistics') {
    // 仓库：低矮大跨 + 装卸雨棚
    const h = 4.6 + level * 0.7;
    const box = new THREE.Mesh(new THREE.BoxGeometry(22, h, 12), stdMat(0x5f7150));
    box.position.y = h / 2; box.castShadow = true;
    g.add(box);
    for (let i = 0; i < 4; i++) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(3.2, h * 0.62), stdMat(0x2b3742));
      door.position.set(-7.5 + i * 5, h * 0.35, 6.01);
      g.add(door);
    }
    return g;
  }
  if (typeId === 'hq') {
    // 总部：三段式塔楼 + 顶部机房
    const h1 = 8 + level * 2.2, h2 = h1 * 0.72, h3 = h1 * 0.5;
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(17, h1, 13), body);
    s1.position.y = h1 / 2; s1.castShadow = true; g.add(s1);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(13, h2, 10), body);
    s2.position.y = h1 + h2 / 2; s2.castShadow = true; g.add(s2);
    const s3 = new THREE.Mesh(new THREE.BoxGeometry(9, h3, 7), stdMat(0x2c3d52));
    s3.position.y = h1 + h2 + h3 / 2; g.add(s3);
    // 玻璃幕墙带
    for (let y = 1.4; y < h1; y += 2.6) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(17.15, 0.7, 13.15), glass);
      band.position.y = y; g.add(band);
    }
    return g;
  }
  // 通用低层：主体 + 玻璃带 + 屋顶设备
  const h = 6 + level * 2.6;
  const box = new THREE.Mesh(new THREE.BoxGeometry(15, h, 11), body);
  box.position.y = h / 2; box.castShadow = true; box.receiveShadow = true;
  g.add(box);
  const front = new THREE.Mesh(new THREE.BoxGeometry(15.1, h * 0.66, 0.3), glass);
  front.position.set(0, h * 0.42, 5.6);
  g.add(front);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 3), stdMat(0x3a4a5c));
  roof.position.set(-3.5, h + 0.7, 0);
  g.add(roof);
  return g;
}

function makeTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2.2, 6), stdMat(0x5b4634));
  trunk.position.y = 1.1; g.add(trunk);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(1.9, 4.2, 8), stdMat(0x2f6b4f));
  crown.position.y = 4.0; crown.castShadow = true; g.add(crown);
  return g;
}

export function createEstateScene(container, state) {
  const width = () => container.clientWidth || 900;
  const height = () => container.clientHeight || 520;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(width(), height());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b1118, 210, 480);
  const camera = new THREE.PerspectiveCamera(42, width() / height(), 1, 800);

  // 光照
  scene.add(new THREE.HemisphereLight(0x9fc3ff, 0x232c3a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(60, 90, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
  scene.add(sun);

  // 地坪 + 网格
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 220),
    stdMat(0x233040, { roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(320, 80, 0x22303f, 0x1a2430);
  grid.position.y = 0.02;
  scene.add(grid);

  // 地块排布：3 列 × 2 行，按 area 放大
  const plots = (state.campus && state.campus.plots) || [];
  const cols = 3;
  const cellW = 46, cellD = 36;
  const root = new THREE.Group();
  scene.add(root);

  plots.forEach((p, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const cx = (col - (cols - 1) / 2) * cellW * 1.32;
    const cz = (row - 0.5) * cellD * 1.5;
    const scale = Math.sqrt(Math.max(24, p.area || 32)) / 6.2;
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    root.add(g);

    const w = 30 * scale, d = 22 * scale;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.5, d),
      stdMat(p.owned ? 0x2b3746 : 0x223027, { roughness: 0.9 }),
    );
    base.position.y = 0.25;
    base.receiveShadow = true;
    g.add(base);

    // 围栏：已购为实线，未购为细虚线感的薄条
    const fenceMat = stdMat(p.owned ? 0x54657a : 0x3b5a45, { transparent: true, opacity: p.owned ? 0.9 : 0.6 });
    for (const [dx, dz, fw, fd] of [[0, d / 2, w, 0.35], [0, -d / 2, w, 0.35], [w / 2, 0, 0.35, d], [-w / 2, 0, 0.35, d]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(fw, 1.6, fd), fenceMat);
      f.position.set(dx, 0.8, dz);
      g.add(f);
    }

    const plotTag = makeLabel(p.name ? p.name.split(' ')[0] : p.id, '#93a7bd');
    plotTag.position.set(0, 1.6, -d / 2 + 3);
    plotTag.scale.set(12, 3, 1);
    g.add(plotTag);

    if (p.building) {
      const b = makeBuilding(p.building.typeId, p.building.level || 1);
      b.position.y = 0.5;
      g.add(b);
      const label = makeLabel(`${TYPE_NAMES[p.building.typeId] || ''} Lv.${p.building.level || 1}`, '#cfe3ff');
      label.position.set(0, 26 + (p.building.level || 1) * 2, 0);
      g.add(label);
      // 建设中的吊塔
      if (p.building.status === 'building') {
        const crane = new THREE.Mesh(new THREE.BoxGeometry(0.8, 18, 0.8), stdMat(0xd9b055));
        crane.position.set(w * 0.32, 9, -d * 0.28);
        g.add(crane);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(11, 0.6, 0.6), stdMat(0xd9b055));
        arm.position.set(w * 0.32 - 4, 17.6, -d * 0.28);
        g.add(arm);
      }
    } else if (p.owned) {
      const label = makeLabel('空地 · 可建设', '#9fb0c3');
      label.position.set(0, 10, 0);
      g.add(label);
      // 空地：停车位划线与两辆小车
      for (let k = 0; k < 4; k++) {
        const line = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 4.6), stdMat(0x46586c));
        line.rotation.x = -Math.PI / 2;
        line.position.set(-w / 2 + 4 + k * 3.3, 0.51, d / 2 - 4);
        g.add(line);
      }
      for (let k = 0; k < 2; k++) {
        const car = new THREE.Group();
        const bodyC = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 1.7), stdMat(k ? 0x7d8899 : 0x9a5f5f));
        bodyC.position.y = 0.9;
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 1.5), stdMat(0x2c3742));
        top.position.set(-0.2, 1.7, 0);
        car.add(bodyC, top);
        car.position.set(-w / 2 + 5.4 + k * 3.3, 0, d / 2 - 4);
        g.add(car);
      }
    } else {
      const label = makeLabel(`待购 · ¥${Math.round((p.price || 0) / 1e4)} 万`, '#e8b45a');
      label.position.set(0, 9, 0);
      g.add(label);
    }
  });

  // 道路：主入口大道 + 环园支路
  const roadMat = stdMat(0x232c38, { roughness: 0.95 });
  const road = new THREE.Mesh(new THREE.BoxGeometry(300, 0.12, 14), roadMat);
  road.position.set(0, 0.06, 58);
  scene.add(road);
  for (const x of [-62, 0, 62]) {
    const spur = new THREE.Mesh(new THREE.BoxGeometry(10, 0.12, 60), roadMat);
    spur.position.set(x, 0.06, 20);
    scene.add(spur);
  }
  // 入口大门
  const gate = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 5), stdMat(0x39485c));
  gate.position.set(0, 0.2, 55);
  scene.add(gate);

  // 绿化与路灯
  const treePos = [];
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1;
    const x = -135 + (i % 13) * 22;
    const z = side * 72 + (i % 3) * 6;
    treePos.push([x, z]);
  }
  for (const [x, z] of treePos) {
    if (Math.abs(x) > 150) continue;
    const tr = makeTree();
    tr.position.set(x, 0, z);
    tr.scale.setScalar(0.9 + ((x * 7 + z * 3) % 10) / 30);
    scene.add(tr);
  }
  for (let i = 0; i < 8; i++) {
    const x = -84 + i * 24;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 8, 6), stdMat(0x44536a));
    pole.position.set(x, 4, 50);
    scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.8), stdMat(0xffe9a8, { emissive: 0xffe9a8, emissiveIntensity: 0.6 }));
    lamp.position.set(x, 8.1, 50);
    scene.add(lamp);
  }

  // 相机轨道控制
  let yaw = -0.62, pitch = 0.82, dist = 132;
  const target = new THREE.Vector3(0, 6, 6);
  const applyCamera = () => {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    camera.position.set(
      target.x + Math.sin(yaw) * cp * dist,
      target.y + sp * dist,
      target.z + Math.cos(yaw) * cp * dist,
    );
    camera.lookAt(target);
  };
  applyCamera();

  let dragging = false, lastX = 0, lastY = 0;
  const el = renderer.domElement;
  const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
  const onMove = (e) => {
    if (!dragging) return;
    yaw -= (e.clientX - lastX) * 0.006;
    pitch = Math.min(1.35, Math.max(0.28, pitch + (e.clientY - lastY) * 0.005));
    lastX = e.clientX; lastY = e.clientY;
    applyCamera();
  };
  const onUp = () => { dragging = false; };
  const onWheel = (e) => {
    e.preventDefault();
    dist = Math.min(300, Math.max(70, dist + e.deltaY * 0.12));
    applyCamera();
  };
  el.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });

  let alive = true;
  const tick = () => {
    if (!alive) return;
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  tick();

  const onResize = () => {
    renderer.setSize(width(), height());
    camera.aspect = width() / height();
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  return {
    destroy() {
      alive = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('resize', onResize);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
    setTop() { pitch = 1.34; dist = 160; applyCamera(); },
    setAngle() { pitch = 0.82; dist = 132; applyCamera(); },
  };
}