// 发布会 3D 舞台：巨型屏幕、追光、讲台、悬浮机型与镜头推近
import * as THREE from '../../vendor/three.module.js';
import { derive } from '../core/design.js';

const COL_WALL = 0x0a0d13;

export function createStageScene(container, state, model) {
  const W = container.clientWidth || 720;
  const H = container.clientHeight || 420;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL_WALL);
  scene.fog = new THREE.Fog(COL_WALL, 260, 620);

  const camera = new THREE.PerspectiveCamera(34, W / H, 0.5, 2000);

  // ---------- 环境反射 ----------
  const envCanvas = document.createElement('canvas');
  envCanvas.width = 128; envCanvas.height = 64;
  const ec = envCanvas.getContext('2d');
  const eg = ec.createLinearGradient(0, 0, 0, 64);
  eg.addColorStop(0, '#e8f2ff');
  eg.addColorStop(0.4, '#5a7396');
  eg.addColorStop(0.52, '#1a2029');
  eg.addColorStop(1, '#05070b');
  ec.fillStyle = eg; ec.fillRect(0, 0, 128, 64);
  ec.fillStyle = '#ffffff';
  ec.beginPath(); ec.ellipse(40, 12, 24, 6, 0, 0, Math.PI * 2); ec.fill();
  ec.beginPath(); ec.ellipse(100, 22, 14, 4, 0, 0, Math.PI * 2); ec.fill();
  const envTex = new THREE.CanvasTexture(envCanvas);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  scene.environment = envTex;

  // ---------- 灯光 ----------
  scene.add(new THREE.HemisphereLight(0x8fb4e0, 0x0a0e14, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(40, 120, 90);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 10;
  key.shadow.camera.far = 500;
  key.shadow.camera.left = -90; key.shadow.camera.right = 90;
  key.shadow.camera.top = 90; key.shadow.camera.bottom = -90;
  scene.add(key);

  // 两侧追光
  const brandColor = new THREE.Color(state.company.logoColor || '#4aa3ff');
  const beamColors = [0x6fb8ff, brandColor.getHex()];
  for (const [i, hex] of beamColors.entries()) {
    const spot = new THREE.SpotLight(hex, 900, 420, 0.30, 0.55, 1.4);
    spot.position.set(i === 0 ? -70 : 70, 118, 62);
    spot.target.position.set(0, 26, -6);
    scene.add(spot.target);
    scene.add(spot);
    // 光柱
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 26, 150, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: hex, transparent: true, opacity: 0.07,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    beam.position.set(i === 0 ? -46 : 46, 78, 30);
    beam.rotation.z = i === 0 ? 0.34 : -0.34;
    beam.rotation.x = -0.22;
    scene.add(beam);
  }
  const wash = new THREE.PointLight(0x4a8fd0, 260, 420);
  wash.position.set(0, 44, 96);
  scene.add(wash);

  // ---------- 舞台 ----------
  const stage = new THREE.Group();
  scene.add(stage);

  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(150, 150, 3, 64),
    new THREE.MeshStandardMaterial({ color: 0x0d1118, roughness: 0.42, metalness: 0.55 })
  );
  floor.position.y = -1.6;
  floor.receiveShadow = true;
  stage.add(floor);

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(46, 50, 10, 48),
    new THREE.MeshStandardMaterial({ color: 0x151b25, roughness: 0.5, metalness: 0.5 })
  );
  platform.position.y = 4;
  platform.receiveShadow = true;
  platform.castShadow = true;
  stage.add(platform);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(44, 1.3, 12, 72),
    new THREE.MeshStandardMaterial({ color: brandColor, emissive: brandColor, emissiveIntensity: 1.6, metalness: 0.8, roughness: 0.25 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 9.2;
  stage.add(ring);

  // 背景巨幕
  const screenTex = makeBackdrop(model ? model.name : '新品发布', state, model);
  const bigScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(210, 108),
    new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })
  );
  bigScreen.position.set(0, 54, -96);
  stage.add(bigScreen);

  const screenFrame = new THREE.Mesh(
    new THREE.BoxGeometry(218, 116, 3),
    new THREE.MeshStandardMaterial({ color: 0x0a0e15, roughness: 0.6, metalness: 0.4 })
  );
  screenFrame.position.set(0, 58, -99);
  stage.add(screenFrame);

  // 侧墙
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x080b11, roughness: 0.95, metalness: 0.05, side: THREE.DoubleSide });
  for (const x of [-118, 118]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(220, 140), wallMat);
    w.position.set(x, 60, -10);
    w.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    stage.add(w);
  }

  // ---------- 讲台 ----------
  const podium = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 12, 16, 32),
    new THREE.MeshStandardMaterial({ color: 0x1b2533, roughness: 0.35, metalness: 0.7 })
  );
  podium.position.set(0, 17, 0);
  podium.castShadow = true;
  stage.add(podium);
  const podiumTop = new THREE.Mesh(
    new THREE.CylinderGeometry(11.4, 11.4, 1.2, 32),
    new THREE.MeshStandardMaterial({ color: brandColor, emissive: brandColor, emissiveIntensity: 0.9, metalness: 0.9, roughness: 0.2 })
  );
  podiumTop.position.set(0, 25.2, 0);
  stage.add(podiumTop);

  // ---------- 悬浮机型 ----------
  const phone = new THREE.Group();
  const dims = buildPhoneMesh(phone, model, state);
  phone.position.set(0, 25 + dims.h * 0.55, 0);
  phone.rotation.y = -0.25;
  stage.add(phone);

  // 光晕
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(dims.h * 0.95, 24, 18),
    new THREE.MeshBasicMaterial({ color: brandColor, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  halo.position.copy(phone.position);
  stage.add(halo);

  // ---------- 观众 ----------
  const audience = new THREE.Group();
  const seatGeo = new THREE.CapsuleGeometry(2.4, 4.2, 4, 8);
  const headGeo = new THREE.SphereGeometry(2.3, 10, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0b0f16, roughness: 0.95 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x090c11, roughness: 0.9 });
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xdfefff, transparent: true, opacity: 0 });
  const flashes = [];
  for (let r = 0; r < 5; r++) {
    const cols = 12 + r * 2;
    const z = 56 + r * 15;
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * 11.5 + (r % 2 ? 3 : 0);
      if (Math.abs(x) > 96) continue;
      const body = new THREE.Mesh(seatGeo, bodyMat);
      body.position.set(x, 3.4, z);
      body.castShadow = true;
      audience.add(body);
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(x, 8.2, z);
      audience.add(head);
      if (Math.random() < 0.1) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), flashMat.clone());
        f.position.set(x + 1.2, 9.4, z - 1.8);
        f.userData.phase = Math.random() * 6.28;
        audience.add(f);
        flashes.push(f);
      }
    }
  }
  stage.add(audience);

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ---------- 镜头：开场推近，稍后缓慢环绕 ----------
  let t = 0;
  let raf = 0;
  function loop() {
    raf = requestAnimationFrame(loop);
    t += 1 / 60;
    const intro = Math.min(1, t / 2.4);
    const ease = 1 - Math.pow(1 - intro, 3);

    const radius = 380 - 168 * ease;
    const phi = 1.36 - 0.22 * ease;
    const theta = -0.34 + ease * 0.20 + Math.sin(t * 0.22) * 0.06;
    const targetY = 40 + 4 * ease;

    const sph = new THREE.Spherical(radius, phi, theta);
    camera.position.setFromSpherical(sph).add(new THREE.Vector3(0, targetY, 0));
    camera.lookAt(0, targetY - 4, 0);

    phone.rotation.y = -0.25 + Math.sin(t * 0.42) * 0.34;
    phone.position.y = 25 + dims.h * 0.55 + Math.sin(t * 1.1) * 1.4;
    halo.position.y = phone.position.y;
    ring.rotation.z += 0.004;
    ring.material.emissiveIntensity = 1.2 + Math.sin(t * 2) * 0.5;

    for (const f of flashes) {
      const v = Math.max(0, Math.sin(t * 3.1 + f.userData.phase));
      f.material.opacity = v > 0.96 ? 0.85 : 0;
    }
    renderer.render(scene, camera);
  }
  loop();

  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          m.map?.dispose();
          m.dispose();
        });
      });
      screenTex.dispose();
      envTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// 简化机型：与设计器同一份参数，保证发布会看到的就是设计出来的那台
function buildPhoneMesh(group, model, state) {
  const d = model ? model.design : null;
  const Wd = d ? d.body.width : 74;
  const Ld = d ? d.body.length : 159;
  const Td = d ? d.body.thickness : 8.2;
  const scale = Math.min(56 / Ld, 74 / Wd);
  const W = Wd * scale, L = Ld * scale, T = Math.max(3, Td * scale);
  const color = new THREE.Color(d ? d.body.color : '#2b3440');
  const corner = d ? d.body.corner : 9;

  const shape = roundedShape(W, L, corner * scale * 0.75);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: T, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.8, bevelSegments: 2, curveSegments: 6, steps: 1,
  });
  geo.translate(0, 0, -T / 2);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: color.clone().multiplyScalar(1.15),
    metalness: 0.72, roughness: d && d.body.finish === 'gloss' ? 0.16 : 0.42,
  });
  const body = new THREE.Mesh(geo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 屏幕
  const sw = W * 0.9, sh = L * 0.9;
  const screenTex = makeScreenTexture(model);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(sw, sh),
    new THREE.MeshBasicMaterial({ map: screenTex })
  );
  screen.position.z = T / 2 + 0.9;
  group.add(screen);

  // 摄像头模组（背面）
  const n = d ? Math.max(1, Math.min(4, d.camera.count)) : 3;
  const mw = n <= 1 ? W * 0.22 : W * 0.4;
  const mod = new THREE.Mesh(
    new THREE.BoxGeometry(mw, n <= 1 ? mw : L * 0.22, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x161b22, metalness: 0.6, roughness: 0.3 })
  );
  mod.position.set(-W / 2 + mw / 2 + 6, L / 2 - (mw / 2) - 8, -T / 2 - 1.1);
  group.add(mod);
  const lensGeo = new THREE.CylinderGeometry(n <= 1 ? mw * 0.26 : 5.4, n <= 1 ? mw * 0.26 : 5.4, 2.6, 20);
  for (let i = 0; i < n; i++) {
    const lens = new THREE.Mesh(lensGeo, new THREE.MeshStandardMaterial({
      color: 0x05080c, metalness: 0.7, roughness: 0.12, emissive: 0x0a1a2a, emissiveIntensity: 0.6,
    }));
    lens.rotation.x = Math.PI / 2;
    const ox = n === 1 ? 0 : (i % 2 === 0 ? -mw * 0.22 : mw * 0.22);
    const oy = n === 1 ? 0 : (i < 2 ? L * 0.055 : -L * 0.055);
    lens.position.set(mod.position.x + ox, mod.position.y + oy, -T / 2 - 2.1);
    group.add(lens);
  }

  return { w: W, h: L, d: T, screenTex };
}

function roundedShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.max(0.5, Math.min(r, Math.min(w, h) / 2 - 0.5));
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function makeScreenTexture(model) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 1024;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 512, 1024);
  g.addColorStop(0, '#0a2540');
  g.addColorStop(0.3, '#2a6ea8');
  g.addColorStop(0.62, '#6a5ac0');
  g.addColorStop(1, '#101728');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 1024);
  const rg = ctx.createRadialGradient(360, 260, 20, 360, 260, 420);
  rg.addColorStop(0, 'rgba(160,220,255,.65)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, 512, 1024);
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.font = '600 44px -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(model ? model.name.slice(0, 12) : '新品发布', 256, 560);
  ctx.font = '400 26px -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fillText('DESIGNED TO STAND OUT', 256, 606);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBackdrop(name, state, model) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 1024, 512);
  g.addColorStop(0, '#060a12');
  g.addColorStop(0.45, '#0e1a2b');
  g.addColorStop(1, '#05080e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = 'rgba(30,58,92,.55)';
  ctx.fillRect(0, 0, 1024, 512);
  const brand = state.company.logoColor || '#4aa3ff';
  const rg = ctx.createRadialGradient(512, 250, 40, 512, 250, 520);
  rg.addColorStop(0, hexA(brand, 0.35));
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, 1024, 512);

  // 细网格
  ctx.strokeStyle = 'rgba(255,255,255,.045)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 32; i++) {
    ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 16); ctx.lineTo(1024, i * 16); ctx.stroke();
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  ctx.font = '600 28px -apple-system, "Segoe UI", sans-serif';
  ctx.fillText(state.company.name.toUpperCase(), 64, 96);

  ctx.fillStyle = '#f2f7ff';
  ctx.font = '700 70px -apple-system, "Segoe UI", sans-serif';
  ctx.fillText((name || '新品发布').slice(0, 14), 60, 184);

  let spec = '全新一代设计';
  if (model) {
    const d = derive(model.design, state.date.year);
    spec = `性能 ${Math.round(d.perf)}　影像 ${Math.round(d.camera)}　续航 ${Math.round(d.battery)}　设计 ${Math.round(d.designScore)}`;
  }
  ctx.fillStyle = hexA(brand, 0.95);
  ctx.font = '500 28px -apple-system, "Segoe UI", sans-serif';
  ctx.fillText(spec, 64, 436);

  ctx.fillStyle = 'rgba(255,255,255,.32)';
  ctx.font = '400 20px -apple-system, "Segoe UI", sans-serif';
  ctx.fillText(`${state.date.year} · GLOBAL LAUNCH EVENT`, 64, 484);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hexA(hex, a) {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}
