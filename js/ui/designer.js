// 手机设计器：参数化 2D 六视图 + three.js 3D 模型 + 合理性校验
import * as THREE from '../../vendor/three.module.js';
import { derive, validate, bomCost, screenSize, SCREEN_ASPECTS, defaultDesign, maxScreenInch, cameraModuleRect, lensSpecs, ensureLenses, ensureBranding, speakerRowSpec, PORT_OPENINGS, layoutPos, makeLens } from '../core/design.js';
import { CPUS, RAMS, STORAGES, SCREENS, CAMERAS, BATTERIES, SYSTEMS, EXTRAS, MATERIALS, FINISHES, CHARGERS, BODY_COLORS } from '../data/parts.js';
import { IMAGE_SENSORS, LENS_TYPES, DECO_SHAPES, PANEL_VENDORS, RES_TIERS, lensTypeById, sensorById, lensRadiusMm } from '../data/hardware.js';
import { TECHS } from '../data/tech.js';
import { ownCpuSpec, ownCmrSpec, ownOsSpec, ownPanelSpec } from '../core/divisions.js';
import { fmtNum, fmtMoney, clamp, esc } from '../core/util.js';
import { suggestedPrice } from '../core/sim.js';

const VIEWS = [
  { id: 'front', name: '正视图' }, { id: 'back', name: '后视图' },
  { id: 'left', name: '左视图' }, { id: 'right', name: '右视图' },
  { id: 'top', name: '顶视图' }, { id: 'bottom', name: '底视图' },
];

// 分焦段镜头外观（参考真机差异）：
// 主摄大而亮（金属圈+蓝膜）、超广角银圈、长焦黑圈小口、潜望方座大底、景深/微距小而素
const LENS_LOOK = {
  main:      { ring: 0xd2deeb, glass: 0x2b4a74, inner: 0x0a0f16, barrel: 0x141a22, plate: null },
  ultrawide: { ring: 0xb9c6d4, glass: 0x27415f, inner: 0x0a0e14, barrel: 0x11161d, plate: null },
  tele:      { ring: 0x3d4552, glass: 0x0c1117, inner: 0x070a0e, barrel: 0x0b0f15, plate: null },
  periscope: { ring: 0xc3cfdb, glass: 0x1e3550, inner: 0x090d13, barrel: 0x0e131a, plate: 0x171c24 },
  depth:     { ring: 0x87929f, glass: 0x10161d, inner: 0x080b10, barrel: 0x0d1117, plate: null },
  macro:     { ring: 0x9aa7b4, glass: 0x121820, inner: 0x080b10, barrel: 0x0d1117, plate: null },
};

// 屏幕圆角（mm）：screen.corner>0 用用户值，否则默认贴合机身圆角（同心缩进 bezel×0.8）
function screenCornerMm(design) {
  const b = design.body || {};
  const c = Number(design.screen?.corner) || 0;
  return c > 0 ? c : Math.max(0.5, (b.corner || 0) - (design.screen?.bezel || 2.2) * 0.8);
}

// ---------- 程序化镜头玻璃贴图 ----------
// 法线/粗糙度/颜色三张 256² 画布：中央凸弧 + 三道同心元件棱（镜片组层次）+ 细放射波纹，
// 供最外层玻璃的 MeshPhysicalMaterial 使用；clearcoat + 场景环境反射产生自然高光
let _lensTex = null;
function lensGlassTextures() {
  if (_lensTex) return _lensTex;
  const S = 256, C = S / 2, R = S / 2;
  const ridge = (rn, c, w, amp) => amp * Math.exp(-((rn - c) ** 2) / (2 * w * w));
  // 高度剖面：玻璃弧面 + 元件棱 + 细纹
  const height = (rn) => {
    if (rn >= 1) return 0;
    let h = 0.32 * Math.sqrt(Math.max(0, 1 - rn * rn));
    h += ridge(rn, 0.30, 0.05, 0.5) + ridge(rn, 0.55, 0.055, 0.42) + ridge(rn, 0.80, 0.06, 0.36);
    h += 0.045 * Math.sin(rn * 40);
    return h;
  };
  const hGrad = (rn) => {
    const e = 0.005;
    return (height(Math.min(1, rn + e)) - height(Math.max(0, rn - e))) / (2 * e);
  };
  // 法线图（切线空间）+ 粗糙度图（棱粗、弧面光）
  const nc = document.createElement('canvas'); nc.width = nc.height = S;
  const rc = document.createElement('canvas'); rc.width = rc.height = S;
  const nctx = nc.getContext('2d');
  const rctx = rc.getContext('2d');
  const nimg = nctx.createImageData(S, S);
  const rimg = rctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - C) / R, dy = (y - C) / R;
      const rn = Math.sqrt(dx * dx + dy * dy);
      const i = (y * S + x) * 4;
      const rc2 = Math.min(rn, 0.999);
      const g = hGrad(rc2);
      const inv = 1 / (rn || 1);
      const nx = -g * dx * inv, ny = -g * dy * inv;
      const nl = Math.sqrt(nx * nx + ny * ny + 1);
      nimg.data[i] = (nx / nl * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = (ny / nl * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = (1 / nl * 0.5 + 0.5) * 255;
      nimg.data[i + 3] = 255;
      const rough = clamp(0.16 + Math.abs(g) * 0.5 + ridge(rc2, 0.42, 0.3, 0.05), 0.06, 0.55);
      const rv = rough * 255;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rv;
      rimg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  // 颜色图：灰度亮度图案（瞳孔暗 / 元件区中 / 内壁边缘亮），由材质 color 按焦段调色
  const cc = document.createElement('canvas'); cc.width = cc.height = S;
  const cctx = cc.getContext('2d');
  const cg = cctx.createRadialGradient(C, C, 0, C, C, R);
  cg.addColorStop(0, 'rgb(30,34,44)');
  cg.addColorStop(0.28, 'rgb(42,50,62)');
  cg.addColorStop(0.45, 'rgb(104,120,146)');
  cg.addColorStop(0.62, 'rgb(70,82,104)');
  cg.addColorStop(0.8, 'rgb(112,128,156)');
  cg.addColorStop(0.93, 'rgb(150,166,190)');
  cg.addColorStop(1, 'rgb(24,28,36)');
  cctx.fillStyle = cg;
  cctx.fillRect(0, 0, S, S);
  const mk = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  _lensTex = { normal: mk(nc), rough: mk(rc), color: mk(cc, true) };
  return _lensTex;
}

// 玻璃材质（按焦段玻璃色缓存）：法线+粗糙度贴图 + clearcoat 物理玻璃；
// 高光来自场景环境反射（scene.environment）与平行光的自然响应，不再用白球假高光
const _glassMatCache = new Map();
function lensGlassMaterial(look) {
  if (_glassMatCache.has(look.glass)) return _glassMatCache.get(look.glass);
  const t = lensGlassTextures();
  const m = new THREE.MeshPhysicalMaterial({
    map: t.color,
    normalMap: t.normal,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: t.rough,
    color: new THREE.Color(look.glass).multiplyScalar(1.25),
    metalness: 0.08,
    roughness: 0.38, // 与 roughnessMap 相乘：弧面 ~0.06、元件棱 ~0.21
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    iridescence: 0.35,        // 镀膜薄膜干涉：真机镜头的蓝绿彩膜
    iridescenceIOR: 1.6,
    envMapIntensity: 1.8,
    emissive: new THREE.Color(look.glass),
    emissiveIntensity: 0.05,
  });
  _glassMatCache.set(look.glass, m);
  return m;
}

export function renderDesigner(container, state, model, hooks = {}) {
  const year = state.date.year;
  // 沙盒全解锁：年代门槛（x.year <= year）按「全部可用」处理（availYear=9999），
  // 科技解锁门槛（unlocked.includes(x.tech)）同样绕过——给全部科技 id；
  // 校验跳过年代合理性错误（validate opts.ignoreEra）
  const sandboxAll = state.mode === 'sandbox' && !!state.tech.all;
  const unlocked = sandboxAll ? TECHS.map((t) => t.id) : state.tech.unlocked;
  const availYear = sandboxAll ? 9999 : year;
  const VOPT = sandboxAll ? { ignoreEra: true } : {};
  const orig = JSON.parse(JSON.stringify(model.design));
  let viewMode = '2d'; // 2d | 3d
  let camView = 'hero';
  let autoRotate = false;
  let explodeTarget = 0;
  let explodeVal = 0;
  let camAnim = null;
  let foldView = 'open'; // 折叠机型 2D 显示状态：open 展开 / folded 折叠
  let schemeEdit = null;   // 配色方案编辑面板打开时保存 { name }（颜色实时写在机身上）
  let schemeSnapshot = null; // 打开编辑面板时的配色快照（取消时恢复）
  // 公司 Logo 预加载（预设 SVG 字符串 → dataURL；上传/绘制为 PNG dataURL），加载完成后重绘
  let logoImg = null;
  const logoSrc = state.company?.logoData || '';
  if (logoSrc) {
    ensureLogoImg(logoSrc); // 预热模块级缓存（产品页缩略图用）
    const img = new Image();
    img.onload = () => {
      logoImg = img;
      if (viewMode === '3d') { if (three) buildPhone(); } else draw2D();
    };
    img.src = logoSrcToUrl(logoSrc);
  }

  // Logo 染色/材质：logoColor 为 null 时跟随公司 Logo 色；finish = img(原图)/metal/glass/plastic
  // 返回 [c0,c1,c2,c3] 四段渐变色（img 且未染色时返回 null = 用原图）
  function logoShadeStops(base, finish) {
    if (finish === 'metal') return [shadeHex(base, 60), base, shadeHex(base, -55), shadeHex(base, 35)];
    if (finish === 'glass') return [shadeHex(base, 85), base, shadeHex(base, -70), shadeHex(base, -20)];
    if (finish === 'plastic') return [shadeHex(base, 18), base, shadeHex(base, -24), base];
    return null;
  }
  // 生成 Logo 画布（恒为 canvas）：需要染色/材质时输出剪影渐变填充，否则原样绘制位图
  function makeLogoCanvas() {
    if (!logoImg) return null;
    const d = model.design;
    const br = d.branding || {};
    const finish = br.logoFinish || 'img';
    const base = br.logoColor || state.company?.logoColor || '#4aa3ff';
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const lctx = c.getContext('2d');
    lctx.drawImage(logoImg, 0, 0, 128, 128);
    if (finish === 'img' && !br.logoColor) return c; // 原图直出
    lctx.globalCompositeOperation = 'source-in';
    const grad = lctx.createLinearGradient(0, 0, 0, 128);
    const stops = logoShadeStops(base, finish) || [base, base, base, base];
    grad.addColorStop(0, stops[0]); grad.addColorStop(0.42, stops[1]);
    grad.addColorStop(0.62, stops[2]); grad.addColorStop(1, stops[3]);
    lctx.fillStyle = grad;
    lctx.fillRect(0, 0, 128, 128);
    return c;
  }

  container.innerHTML = `
    <div class="designer">
      <div class="dz-panel" id="dz-left"></div>
      <div class="dz-stage">
        <div class="dz-toolbar">
          <div class="speed-group" style="background:#0d1219">
            <button data-vm="2d" class="on">2D 六视图</button>
            <button data-vm="3d">3D 模型</button>
          </div>
          <div class="speed-group" id="fold-toggle" style="background:#0d1219;display:none">
            <button data-fold="open" class="on">展开态</button>
            <button data-fold="folded">折叠态</button>
          </div>
          <div class="spacer"></div>
          <div class="row" id="cam-views" style="gap:4px;display:none">
            <button class="btn small" data-cam="front">正面</button>
            <button class="btn small" data-cam="back">背面</button>
            <button class="btn small" data-cam="side">侧面</button>
            <button class="btn small" data-cam="hero">45°</button>
            <button class="btn small ${autoRotate ? 'primary' : ''}" id="btn-rotate">自动旋转</button>
            <button class="btn small" id="btn-explode">拆解视图</button>
          </div>
          <button class="btn small ghost" id="dz-reset">重置</button>
          <button class="btn small" id="dz-close">返回</button>
          <button class="btn small primary" id="dz-save">保存设计</button>
        </div>
        <div class="dz-canvas-wrap" id="dz-stage-body">
          <canvas id="dz-2d"></canvas>
          <div class="dz-hint" id="dz-hint">滚轮缩放 · 拖动平移 · 后视图可直接拖拽镜头与闪光灯</div>
          <div class="dz-legend" id="dz-legend">
            <span><i style="background:#8fd0ff"></i>屏幕总成</span>
            <span><i style="background:#7de3b0"></i>主板</span>
            <span><i style="background:#ffd479"></i>电池</span>
            <span><i style="background:#c9a6ff"></i>影像模组</span>
            <span><i style="background:#a9b8c9"></i>后盖</span>
          </div>
        </div>
      </div>
      <div class="dz-panel" id="dz-right"></div>
    </div>`;

  const left = container.querySelector('#dz-left');
  const right = container.querySelector('#dz-right');
  const stageBody = container.querySelector('#dz-stage-body');
  const canvas2d = container.querySelector('#dz-2d');

  // ---------- 左侧控件 ----------
  // 分区折叠：折叠状态存 localStorage（视觉偏好，跨存档），展开/收起不触发重渲染
  const DZ_SEC_KEY = 'dz_collapsed_secs';
  const collapsedSecs = (() => {
    try { return new Set(JSON.parse(localStorage.getItem(DZ_SEC_KEY) || '[]')); } catch (e) { return new Set(); }
  })();
  function section(key, title, inner, tip = '') {
    const on = collapsedSecs.has(key);
    return `<div class="dz-sec ${on ? 'collapsed' : ''}" data-sec="${key}">
      <button type="button" class="dz-sec-head" data-sec-toggle="${key}"><span>${title}${tip ? ` <span class="tiny dim">${tip}</span>` : ''}</span><i class="chev"></i></button>
      <div class="dz-sec-body">${inner}</div>
    </div>`;
  }

  function controls() {
    const d = model.design;
    const body = d.body;
    const divs = state.divisions || {};
    const freeAspect = d.screen.aspect === '自由';
    const ports = body.ports || {};
    const sp = speakerRowSpec(ports.speakerStyle);
    const micSpan = ports.micStyle && ports.micStyle !== 'hole' ? speakerRowSpec(ports.micStyle).span : 2.8;
    return section('body', '机身', `
      ${sliderRow('长度', 'body.length', body.length, 70, 200, 1, 'mm')}
      ${sliderRow('宽度', 'body.width', body.width, 35, 100, 0.5, 'mm')}
      ${sliderRow('厚度', 'body.thickness', body.thickness, 5, 32, 0.1, 'mm')}
      ${sliderRow('边角弧度', 'body.corner', body.corner, 0, 20, 0.5, 'mm')}`)
      + section('screen', '屏幕', `
      <span class="tiny dim" style="display:block;margin-bottom:6px">调机身时屏幕自动贴合</span>
      ${sliderRow('屏幕尺寸', 'screen.inch', d.screen.inch, 1, 8.2, 0.1, '″')}
      ${sliderRow('边框宽度', 'screen.bezel', d.screen.bezel, 0.6, 12, 0.1, 'mm')}
      ${sliderRow('屏幕圆角（0=贴合机身）', 'screen.corner', d.screen.corner || 0, 0, 15, 0.1, 'mm')}
      <label class="field"><span>比例预设</span>
        <select data-k="screen.aspect">
          ${Object.keys(SCREEN_ASPECTS).map((a) => `<option ${d.screen.aspect === a ? 'selected' : ''}>${a}</option>`).join('')}
        </select>
      </label>
      ${freeAspect ? sliderRow('长宽比（自由，高/宽）', 'screen.aspectV', d.screen.aspectV || 2, 0.5, 2.6, 0.01, '') : ''}
      <label class="field"><span>前面板开孔</span>
        <select data-k="screen.notch">
          ${[['none', '无开孔'], ['punch', '单孔'], ['notch', '刘海'], ['waterdrop', '水滴'], ['popup', '升降式前摄']].map(([v, n]) => {
            const ok = v !== 'popup' || availYear >= 2018;
            return `<option value="${v}" ${d.screen.notch === v ? 'selected' : ''} ${ok ? '' : 'disabled'}>${n}${ok ? '' : '（2018 年）'}</option>`;
          }).join('')}
        </select>
      </label>
      ${d.screen.notch === 'punch' && !d.parts.extras.includes('x_udc') ? sliderRow('挖孔位置（0=居中，折叠机默认右半屏）', 'screen.holeX', d.screen.holeX ?? (d.body.fold !== 'none' ? 25 : 0), -45, 45, 1, '%') : ''}
      <label class="field"><span>屏幕面板</span>
        <select data-k="screen.panel">
          ${panelOptions(d)}
        </select>
      </label>
      <label class="field"><span>面板供应商</span>
        <select data-k="screen.panelVendor">
          <option value="" ${!d.screen.panelVendor ? 'selected' : ''}>公版 · 无品牌溢价</option>
          ${PANEL_VENDORS.map((v) => {
            const ok = v.year <= availYear && unlocked.includes(v.tech);
            return `<option value="${v.id}" ${d.screen.panelVendor === v.id ? 'selected' : ''} ${ok ? '' : 'disabled'}>${v.name} · 品质 ${Math.round(v.quality * 100)}% · 成本 ${v.cost > 1 ? '+' : ''}${Math.round((v.cost - 1) * 100)}%${ok ? '' : `（${v.year} 年）`}</option>`;
          }).join('')}
        </select>
      </label>
      ${(() => {
        const pv = PANEL_VENDORS.find((v) => v.id === d.screen.panelVendor);
        if (!pv || !pv.gens) return '';
        return `<label class="field"><span>发光材料世代</span>
          <select data-k="screen.panelGen">
            <option value="" ${!d.screen.panelGen ? 'selected' : ''}>标准材料</option>
            ${pv.gens.map((g) => {
              const ok = g.year <= availYear && unlocked.includes(pv.tech);
              return `<option value="${g.id}" ${d.screen.panelGen === g.id ? 'selected' : ''} ${ok ? '' : 'disabled'}>${g.name} · 品质 +${Math.round((g.q - 1) * 100)}%${ok ? '' : `（${g.year} 年）`}</option>`;
            }).join('')}
          </select>
        </label>`;
      })()}
      <label class="field"><span>分辨率</span>
        <select data-k="screen.res">
          ${RES_TIERS.map((r) => {
            const ok = r.year <= availYear;
            return `<option value="${r.id}" ${d.screen.res === r.id ? 'selected' : ''} ${ok ? '' : 'disabled'}>${r.name} · ${r.w}×${r.h}${ok ? '' : `（${r.year} 年）`}</option>`;
          }).join('')}
        </select>
      </label>
      <label class="field"><span>刷新率（独立于面板）</span>
        <select data-k="screen.hz">
          ${[[60, '60Hz', 0], [90, '90Hz', 2014], [120, '120Hz', 2019], [144, '144Hz', 2021], [165, '165Hz', 2022]].map(([v, n, y]) => {
            const ok = availYear >= y;
            return `<option value="${v}" ${(d.screen.hz || 60) === v ? 'selected' : ''} ${ok ? '' : 'disabled'}>${n}${ok ? '' : `（${y} 年解锁）`}</option>`;
          }).join('')}
        </select>
      </label>`)
      + section('camera', '影像模组', `
      ${d.camera.lenses.map((l, i) => lensCard(l, i, d, divs)).join('')}
      ${d.camera.lenses.length < 6 ? `<button type="button" class="btn small" data-lens-add style="margin:4px 0 8px">＋ 添加镜头（${d.camera.lenses.length}/6）</button>` : ''}
      <div class="tiny dim" style="margin:2px 0 6px">Deco 布局区 <span class="dim">（未开凸台时不渲染装饰板）</span></div>
      <label class="field"><span>deco 形状</span>
        <select data-k="camera.deco.shape">
          ${DECO_SHAPES.map((s) => `<option value="${s.id}" ${d.camera.deco.shape === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
        </select>
      </label>
      ${sliderRow('deco 宽', 'camera.deco.w', d.camera.deco.w, 8, Math.max(10, body.width - 6), 0.5, 'mm')}
      ${d.camera.deco.shape === 'circle' ? '' : sliderRow('deco 高', 'camera.deco.h', d.camera.deco.h, 8, Math.max(12, body.length * 0.7), 0.5, 'mm')}
      ${d.camera.deco.shape === 'circle' ? '' : sliderRow('deco 圆角', 'camera.deco.radius', d.camera.deco.radius, 0, 20, 0.5, 'mm')}
      <div class="tiny dim" style="margin:6px 0 4px">闪光灯</div>
      <label class="field"><span>闪光灯样式</span>
        <select data-k="camera.flash.style">
          ${[['round', '圆形'], ['rounded', '圆角矩形'], ['slot', '槽形'], ['ring', '环形（比例固定）']].map(([v, n]) => `<option value="${v}" ${(d.camera.flash.style || 'round') === v ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      ${sliderRow('闪光灯位置 · 横', 'camera.flash.x', d.camera.flash.x, -20, 20, 0.5, 'mm')}
      ${sliderRow('闪光灯位置 · 纵', 'camera.flash.y', d.camera.flash.y, -20, 20, 0.5, 'mm')}
      ${(d.camera.flash.style === 'rounded' || d.camera.flash.style === 'slot') ? `
      ${sliderRow('闪光灯宽度', 'camera.flash.w', d.camera.flash.w ?? 4, 2, Math.min(14, body.width - 6), 0.5, 'mm')}
      ${sliderRow('闪光灯长度', 'camera.flash.l', d.camera.flash.l ?? 6, 2, Math.min(18, body.length * 0.5), 0.5, 'mm')}` : `
      ${sliderRow('闪光灯大小', 'camera.flash.r', d.camera.flash.r, 0.8, 3, 0.1, 'mm')}`}
      <label class="opt ${d.camera.flash.offDeco ? 'on' : ''}" style="display:flex;gap:6px;align-items:center;padding:6px 8px;margin-bottom:6px">
        <input type="checkbox" data-k="camera.flash.offDeco" data-bool="1" ${d.camera.flash.offDeco ? 'checked' : ''} style="width:auto" />
        <span>闪光灯放在 deco 外</span>
      </label>
      <div class="tiny dim" style="margin:6px 0 4px">模组整体位置</div>
      <label class="field"><span>模组位置</span>
        <select data-k="camera.pos">
          ${[['top-left', '左上'], ['top-center', '顶部居中'], ['top-right', '右上']].map(([v, n]) => `<option value="${v}" ${d.camera.pos === v ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      ${sliderRow('位置偏移 · 横', 'camera.offX', d.camera.offX || 0, -40, 40, 0.5, 'mm')}
      ${sliderRow('位置偏移 · 纵', 'camera.offY', d.camera.offY || 0, -60, 20, 0.5, 'mm')}
      <label class="opt ${d.camera.step ? 'on' : ''}" style="display:flex;gap:6px;align-items:center;padding:6px 8px;margin-bottom:6px">
        <input type="checkbox" data-k="camera.step" data-bool="1" ${d.camera.step ? 'checked' : ''} style="width:auto" />
        <span>摄像头凸台（台阶）</span>
      </label>
      ${d.camera.step ? sliderRow('模组凸起', 'camera.bump', d.camera.bump, 0, 5, 0.1, 'mm') : ''}
      ${(d.camera.lenses || []).some((l) => l.type === 'periscope') ? `
      ${sliderRow('潜望凸台厚度', 'camera.periT', d.camera.periT ?? 0.6, 0.3, 3, 0.1, 'mm')}
      <label class="field"><span>潜望方向</span>
        <select data-k="camera.periDir">
          <option value="v" ${(d.camera.periDir || 'v') === 'v' ? 'selected' : ''}>竖向（长边沿机身纵向）</option>
          <option value="h" ${d.camera.periDir === 'h' ? 'selected' : ''}>横向（长边沿机身横向）</option>
        </select>
      </label>` : ''}`)
      + section('material', '材质与外观', `
      <label class="field"><span>中框</span>
        <select data-k="body.frame">
          ${MATERIALS.map((m) => `<option value="${m.id}" ${body.frame === m.id ? 'selected' : ''}>${m.name} · ¥${m.price}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span>后盖</span>
        <select data-k="body.back">
          ${MATERIALS.map((m) => `<option value="${m.id}" ${body.back === m.id ? 'selected' : ''}>${m.name} · ¥${m.price}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span>表面处理</span>
        <select data-k="body.finish">
          ${FINISHES.map((f) => `<option value="${f.id}" ${body.finish === f.id ? 'selected' : ''}>${f.name}</option>`).join('')}
        </select>
      </label>`)
      + section('scheme', '配色方案', schemeSection())
      + section('branding', '背面装饰', brandingSection())
      + section('buttons', '按键与接口', `
      <label class="field"><span>侧键样式</span>
        <select data-k="body.buttons">
          ${[['classic', '经典双键'], ['strip', '细长条'], ['split', '分离式音量键'], ['opposite', '电源键异侧'], ['hidden', '隐藏式（压感）']].map(([v, n]) => `<option value="${v}" ${(body.buttons || 'classic') === v ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      ${sliderRow('音量键位置 · 纵', 'body.btnVolY', body.btnVolY || 0, -(body.length / 2 - 4), body.length / 2 - 4, 0.5, 'mm')}
      ${sliderRow('电源键位置 · 纵', 'body.btnPowY', body.btnPowY || 0, -(body.length / 2 - 4), body.length / 2 - 4, 0.5, 'mm')}
      <label class="field"><span>扬声器开孔</span>
        <select data-k="body.ports.speakerStyle">
          ${[['dot5', '5 圆孔'], ['dot6', '6 圆孔'], ['slot2', '2 槽形孔'], ['slot3', '3 槽形孔']].map(([v, n]) => `<option value="${v}" ${(ports.speakerStyle || 'dot5') === v ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span>充电口类型</span>
        <select data-k="body.ports.charge">
          ${[['typec', 'USB Type-C'], ['micro', 'Micro-USB'], ['custom', '自定义充电接口']].map(([v, n]) => `<option value="${v}" ${(ports.charge || 'typec') === v ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span>接口命名（进卖点/宣传图，可自创如 Type-M）</span>
        <input type="text" data-k="body.ports.portLabel" maxlength="12" value="${esc(ports.portLabel || '')}" placeholder="如：Type-M 2.0" style="width:100%" />
      </label>
      <label class="field"><span>快充协议命名（可自创如 飓风 3.0）</span>
        <input type="text" data-k="body.ports.protoLabel" maxlength="12" value="${esc(ports.protoLabel || '')}" placeholder="如：飓风 3.0" style="width:100%" />
      </label>
      ${ports.charge === 'custom' ? `
      <label class="field"><span>自定义接口形状</span>
        <select data-k="body.ports.chargeShape.style">
          ${[['round', '圆孔'], ['capsule', '胶囊槽'], ['square', '方形口'], ['trap', '梯形口']].map(([v, n]) => `<option value="${v}" ${(ports.chargeShape?.style || 'round') === v ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      ${sliderRow('接口宽度', 'body.ports.chargeShape.w', ports.chargeShape?.w ?? 6, 2.5, 14, 0.5, 'mm')}
      ${sliderRow('接口深度', 'body.ports.chargeShape.h', ports.chargeShape?.h ?? 3, 1.5, 5, 0.5, 'mm')}
      ` : ''}
      ${sliderRow('充电口位置 · 横', 'body.ports.chargePos', ports.chargePos || 0, -(body.width / 2 - 6), body.width / 2 - 6, 0.5, 'mm')}
      ${sliderRow('扬声器位置 · 横', 'body.ports.speakerX', ports.speakerX ?? Math.round(body.width * 0.28 * 10) / 10, -(body.width / 2 - sp.span / 2 - 1), body.width / 2 - sp.span / 2 - 1, 0.5, 'mm')}
      <label class="field"><span>底部麦克风样式</span>
        <select data-k="body.ports.micStyle">
          ${[['hole', '小圆孔'], ['dot5', '5 圆孔'], ['dot6', '6 圆孔'], ['slot2', '2 槽形孔'], ['slot3', '3 槽形孔']].map(([v, n]) => `<option value="${v}" ${(ports.micStyle || 'hole') === v ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      ${sliderRow('麦克风位置 · 横', 'body.ports.micX', ports.micX ?? Math.round(-body.width * 0.2 * 10) / 10, -(body.width / 2 - micSpan / 2 - 1), body.width / 2 - micSpan / 2 - 1, 0.5, 'mm')}
      <label class="opt ${(ports.dualSpeaker) ? 'on' : ''}" style="display:flex;gap:6px;align-items:center;padding:6px 8px;margin-bottom:6px">
        <input type="checkbox" data-k="body.ports.dualSpeaker" data-bool="1" ${ports.dualSpeaker ? 'checked' : ''} style="width:auto" />
        <span>双扬声器（顶部 + 底部扬声器孔）</span>
      </label>
      ${ports.dualSpeaker ? sliderRow('顶部扬声器 · 横', 'body.ports.topSpeakerX', ports.topSpeakerX ?? Math.round(body.width * 0.28 * 10) / 10, -(body.width / 2 - sp.span / 2 - 1), body.width / 2 - sp.span / 2 - 1, 0.5, 'mm') : ''}
      <label class="opt ${(ports.quadSpeaker) ? 'on' : ''}" style="display:flex;gap:6px;align-items:center;padding:6px 8px;margin-bottom:6px">
        <input type="checkbox" data-k="body.ports.quadSpeaker" data-bool="1" ${ports.quadSpeaker ? 'checked' : ''} style="width:auto" />
        <span>4 扬声器（底部/顶部各一对，折叠屏每半一只）</span>
      </label>
      <label class="opt ${(ports.topMic) ? 'on' : ''}" style="display:flex;gap:6px;align-items:center;padding:6px 8px;margin-bottom:6px">
        <input type="checkbox" data-k="body.ports.topMic" data-bool="1" ${ports.topMic ? 'checked' : ''} style="width:auto" />
        <span>顶部麦克风孔</span>
      </label>
      ${ports.topMic ? sliderRow('顶部麦克风 · 横', 'body.ports.topMicX', ports.topMicX ?? Math.round(-body.width * 0.2 * 10) / 10, -(body.width / 2 - 2), body.width / 2 - 2, 0.5, 'mm') : ''}`)
      + section('fold', '折叠形态', `
      <label class="field"><span>结构</span>
        <select data-k="body.fold">
          <option value="none" ${body.fold === 'none' ? 'selected' : ''}>直板</option>
          <option value="fold" ${body.fold === 'fold' ? 'selected' : ''} ${availYear >= 2020 ? '' : 'disabled'}>横向折叠（${availYear >= 2020 ? '可用' : '2020 年解锁'}）</option>
          <option value="flip" ${body.fold === 'flip' ? 'selected' : ''} ${availYear >= 2020 ? '' : 'disabled'}>竖向翻折</option>
        </select>
      </label>
      ${body.fold !== 'none' ? `
      <div class="tiny" style="margin:2px 0 4px;padding:6px 8px;border-radius:7px;background:rgba(74,163,255,.08);line-height:1.8">
        ${body.fold === 'flip'
          ? `展开 <b>${body.width}×${Math.round(body.length * 2 * 10) / 10}mm</b>（单层）<br>折叠 <b>${body.width}×${body.length}mm</b>（双层，厚约 ${Math.round((body.thickness * 2 - 0.6) * 10) / 10}mm）`
          : `展开 <b>${Math.round(body.width * 2 * 10) / 10}×${body.length}mm</b>（单层）<br>折叠 <b>${body.width}×${body.length}mm</b>（双层，厚约 ${Math.round((body.thickness * 2 - 0.6) * 10) / 10}mm）`}
      </div>
      <div class="tiny dim" style="margin:2px 0 4px">${body.fold === 'flip' ? '竖向翻折：机身尺寸为折叠态单半，内屏=展开态全幅' : '横向折叠：机身尺寸为折叠态单半，内屏=展开态全幅'}</div>
      ${(() => {
        const cvOn = (body.coverScreen?.inch || 0) > 0;
        const maxInch = Math.max(0.8, Math.round(((body.width - 8) / 11.8) * 10) / 10);
        const cvRatio = body.coverScreen?.ratio || (body.fold === 'flip' ? 1.05 : 1.42);
        return `
      <label class="opt ${cvOn ? 'on' : ''}" style="display:flex;gap:6px;align-items:center;padding:6px 8px;margin-bottom:6px">
        <input type="checkbox" data-k="body.coverOn" data-bool="1" ${cvOn ? 'checked' : ''} style="width:auto" />
        <span>外屏（cover screen）</span>
      </label>
      ${cvOn ? `
      ${sliderRow('外屏尺寸', 'body.coverScreen.inch', body.coverScreen?.inch || 2.6, 0.8, maxInch, 0.1, '″')}
      ${sliderRow('外屏比例（高/宽）', 'body.coverScreen.ratio', cvRatio, 0.5, 2.4, 0.05, '')}
      ${sliderRow('外屏位置 · 横', 'body.coverScreen.x', body.coverScreen?.x || 0, -(body.width / 2 - 3), body.width / 2 - 3, 0.5, 'mm')}
      ${sliderRow('外屏位置 · 纵', 'body.coverScreen.y', body.coverScreen?.y || 0, -(body.length / 2 - 3), body.length / 2 - 3, 0.5, 'mm')}
      <label class="field"><span>外屏开孔</span>
        <select data-k="body.coverScreen.notch">
          <option value="none" ${(body.coverScreen?.notch || 'none') === 'none' ? 'selected' : ''}>无开孔</option>
          <option value="punch" ${body.coverScreen?.notch === 'punch' ? 'selected' : ''}>单孔（前置摄像头）</option>
          <option value="udc" ${body.coverScreen?.notch === 'udc' ? 'selected' : ''} ${d.parts.extras.includes('x_udc') ? '' : 'disabled'}>屏下摄像头${d.parts.extras.includes('x_udc') ? '' : '（需屏下摄像头技术）'}</option>
        </select>
      </label>
      ${body.coverScreen?.notch === 'punch' ? sliderRow('外屏挖孔位置（0=居中）', 'body.coverScreen.holeX', body.coverScreen?.holeX || 0, -40, 40, 1, '%') : ''}
      <label class="field"><span>外屏供应商</span>
        <select data-k="body.coverScreen.panelVendor">
          <option value="" ${!body.coverScreen?.panelVendor ? 'selected' : ''}>公版</option>
          ${PANEL_VENDORS.filter((v) => v.tech === 'oled').map((v) => {
            const ok = v.year <= availYear && unlocked.includes(v.tech);
            return `<option value="${v.id}" ${body.coverScreen?.panelVendor === v.id ? 'selected' : ''} ${ok ? '' : 'disabled'}>${v.name}${ok ? '' : `（${v.year} 年）`}</option>`;
          }).join('')}
        </select>
      </label>
      <label class="field"><span>外屏分辨率</span>
        <select data-k="body.coverScreen.res">
          ${RES_TIERS.map((r) => {
            const ok = r.year <= availYear && r.level <= 1.0;
            return `<option value="${r.id}" ${(body.coverScreen?.res || 'res1080') === r.id ? 'selected' : ''} ${ok ? '' : 'disabled'}>${r.name}${ok ? '' : `（${r.year} 年）`}</option>`;
          }).join('')}
        </select>
      </label>` : ''}`;
      })()})
      ` : ''}`)
      + section('backwin', '背部智窗', (() => {
        const bw = d.backWindow || { on: false, inch: 1.8, cx: 0, cy: -18 };
        return `
        ${sliderRow('智窗尺寸', 'backWindow.inch', bw.inch, 0.8, 4.0, 0.1, '″')}
        ${sliderRow('智窗位置 · 横', 'backWindow.cx', bw.cx, -30, 30, 0.5, 'mm')}
        ${sliderRow('智窗位置 · 纵', 'backWindow.cy', bw.cy, -(body.length / 2), body.length / 2, 0.5, 'mm')}
        <label class="opt ${bw.on ? 'on' : ''}" style="display:flex;gap:6px;align-items:center;padding:6px 8px;margin-bottom:6px">
          <input type="checkbox" data-k="backWindow.on" data-bool="1" ${bw.on ? 'checked' : ''} style="width:auto" />
          <span>启用背部智窗（2023 年+，装饰与息屏显示，需与摄像头模组避让）</span>
        </label>`;
      })())
      + section('hw', '硬件配置', `
      ${selectRow('处理器', 'parts.cpu', CPUS, (x) => `${x.name} · 性能 ${Math.round(x.perf)}`, 'tech', divs)}
      ${selectRow('内存', 'parts.ram', RAMS, (x) => `${x.name}${x.gb >= 0.1 ? ` · ${x.gb}GB` : ''}`, 'tech', divs)}
      ${selectRow('存储', 'parts.storage', STORAGES, (x) => x.name, 'tech', divs)}
      ${selectRow('电池', 'parts.battery', BATTERIES, (x) => `${x.name} · ${x.mah}mAh`, 'tech', divs)}
      ${selectRow('操作系统', 'parts.os', SYSTEMS, (x) => `${x.name} · ${x.kind === 'open' ? '开源' : x.kind === 'third' ? '三方' : x.kind === 'own' ? '自研' : '内置'}`, 'tech', divs)}
      <label class="field"><span>镜头阵列布局</span>
        <select data-k="camera.layout">
          ${[['vertical', '竖排胶囊'], ['square', '2×2 方阵'], ['dual', '横排双摄'], ['horizontal', '横排'], ['ring', '环绕']].map(([v, n]) => `<option value="${v}" ${(d.camera.layout || 'vertical') === v ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      <div class="tiny dim" style="margin:8px 0 4px">配置版本（同机型多配置，如 12+256 / 12+512 / 12+1T；库存共用，按定价倍率分配销量）</div>
      ${(d.variants || []).map((v, i) => variantCard(v, i)).join('')}
      ${(d.variants || []).length < 6 ? `<button type="button" class="btn small" data-variant-add style="margin:4px 0 8px">＋ 添加配置版本</button>` : ''}`)
      + section('charge', '充电', `
      <label class="field"><span>有线快充</span>
        <select data-k="parts.charge.wired">
          ${CHARGERS.wired.map((x) => {
            const ok = unlocked.includes(x.tech) && x.year <= availYear;
            return `<option value="${x.id}" ${(d.parts.charge?.wired) === x.id ? 'selected' : ''} ${ok ? '' : 'disabled'}>${x.name}${ok ? '' : '（未解锁）'}</option>`;
          }).join('')}
        </select>
      </label>
      <label class="field"><span>快充协议</span>
        <select data-k="parts.charge.proto">
          ${CHARGERS.proto.map((x) => {
            const ok = unlocked.includes(x.tech) && x.year <= availYear;
            return `<option value="${x.id}" ${(d.parts.charge?.proto) === x.id ? 'selected' : ''} ${ok ? '' : 'disabled'}>${x.name}${ok ? '' : '（未解锁）'}</option>`;
          }).join('')}
        </select>
      </label>
      <label class="field"><span>无线充电</span>
        <select data-k="parts.charge.wireless" ${d.parts.extras.includes('x_wl') ? '' : 'disabled'}>
          ${CHARGERS.wireless.map((x) => {
            const ok = unlocked.includes(x.tech) && x.year <= availYear;
            return `<option value="${x.id}" ${(d.parts.charge?.wireless) === x.id ? 'selected' : ''} ${ok ? '' : 'disabled'}>${x.name}${d.parts.extras.includes('x_wl') ? (ok ? '' : '（未解锁）') : '（需勾选无线充电）'}</option>`;
          }).join('')}
        </select>
      </label>`)
      + section('extras', '附加功能', `
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:5px">
        ${EXTRAS.map((x) => {
          const ok = unlocked.includes(x.tech) && (x.year || 0) <= availYear;
          const on = model.design.parts.extras.includes(x.id);
          return `<label class="opt ${on ? 'on' : ''} ${ok ? '' : 'disabled'}" style="text-align:left;padding:6px 8px;display:flex;gap:6px;align-items:center">
            <input type="checkbox" data-x="${x.id}" ${on ? 'checked' : ''} ${ok ? '' : 'disabled'} style="width:auto" />
            <span>${x.name}${x.year && x.year > availYear ? `（${x.year}）` : ''}</span>
          </label>`;
        }).join('')}
      </div>`);
  }

  // 配色方案区：平时只显示当前配色预览 + 已存方案 chips；点「添加配色方案」展开编辑面板
  function schemeSection() {
    const b = model.design.body;
    const c = b.colors || { frame: b.color || '#2b3440', back: b.color || '#2b3440', cover: '#05070a' };
    const schemes = state.colorSchemes || [];
    let html = `
      <div class="row" style="gap:5px;margin-bottom:7px;align-items:center">
        <span class="tiny dim">当前</span>
        <i style="width:14px;height:14px;border-radius:4px;background:${c.frame};border:1px solid rgba(255,255,255,.22)" title="中框"></i>
        <i style="width:14px;height:14px;border-radius:4px;background:${c.back};border:1px solid rgba(255,255,255,.22)" title="后盖"></i>
        <i style="width:14px;height:14px;border-radius:4px;background:${c.cover};border:1px solid rgba(255,255,255,.22)" title="盖板"></i>
        <span class="tiny">${b.schemeName ? esc(b.schemeName) : '<span class="dim">未命名</span>'}</span>
      </div>`;
    if (schemeEdit) {
      html += `
      <div class="scheme-editor">
        ${colorPicker('中框颜色', 'frame', c.frame)}
        ${colorPicker('后盖颜色', 'back', c.back)}
        ${colorPicker('正面盖板', 'cover', c.cover, '非黑需镀膜，成本上浮')}
        <label class="field"><span>方案名称 <span class="tiny dim">（用于销售文案）</span></span>
          <input type="text" id="scheme-name" maxlength="12" placeholder="如：星夜蓝" value="${esc(schemeEdit.name || '')}" style="width:100%" />
        </label>
        <div class="row" style="gap:6px;margin-bottom:6px">
          <button type="button" class="btn small primary" data-scheme-save style="flex:1">保存方案</button>
          <button type="button" class="btn small ghost" data-scheme-cancel>取消</button>
        </div>
      </div>`;
    } else {
      html += `<button type="button" class="btn small" data-scheme-add style="margin-bottom:8px">＋ 添加配色方案</button>`;
    }
    if (schemes.length) {
      html += `<div class="row wrap" style="gap:5px">
        ${schemes.map((sc) => `
          <span class="chip" data-scheme-apply="${sc.id}" title="点击套用" style="cursor:pointer;display:inline-flex;align-items:center;gap:5px">
            <i style="width:9px;height:9px;border-radius:3px;background:${sc.frame};display:inline-block"></i>
            <i style="width:9px;height:9px;border-radius:3px;background:${sc.back};display:inline-block"></i>
            <i style="width:9px;height:9px;border-radius:3px;background:${sc.cover};display:inline-block"></i>
            ${esc(sc.name)}
          </span>`).join('')}
      </div>`;
    } else if (!schemeEdit) {
      html += '<div class="tiny dim">把三处颜色搭配保存为命名方案，发布时可写入卖点。</div>';
    }
    return html;
  }

  // 背面装饰区：公司 Logo 图像 + 品牌文字，位置/大小可调（mm，原点=机身中心）
  function brandingSection() {
    const d = model.design;
    ensureBranding(d);
    const br = d.branding;
    const b = d.body;
    const txtVal = br.text === null || br.text === undefined ? '' : br.text;
    return `
      <label class="opt ${d.logoOnBack ? 'on' : ''}" style="display:flex;gap:6px;align-items:center;padding:6px 8px;margin-bottom:6px">
        <input type="checkbox" data-k="logoOnBack" data-bool="1" ${d.logoOnBack ? 'checked' : ''} style="width:auto" />
        <span>背面 Logo（用公司 Logo）</span>
      </label>
      ${d.logoOnBack ? `
      ${sliderRow('Logo 位置 · 横', 'branding.logoX', br.logoX, -(b.width / 2), b.width / 2, 0.5, 'mm')}
      ${sliderRow('Logo 位置 · 纵', 'branding.logoY', br.logoY, -(b.length / 2), b.length / 2, 0.5, 'mm')}
      ${sliderRow('Logo 大小', 'branding.logoSize', br.logoSize, 3, Math.max(8, b.width * 0.5), 0.5, 'mm')}
      <label class="field"><span>Logo 颜色 <span class="tiny dim">（默认跟随公司 Logo 色）</span></span>
        <input type="color" data-k="branding.logoColor" value="${br.logoColor || state.company.logoColor || '#4aa3ff'}" style="width:100%;height:26px;padding:2px;background:#10151c;border:1px solid var(--line-2);border-radius:7px;cursor:pointer" />
      </label>
      <label class="field"><span>Logo 表面效果</span>
        <select data-k="branding.logoFinish">
          ${[['img', '原图质感'], ['metal', '金属'], ['glass', '玻璃'], ['plastic', '塑料']].map(([v, n]) => `<option value="${v}" ${(br.logoFinish || 'img') === v ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>` : ''}
      <label class="opt ${d.brandText ? 'on' : ''}" style="display:flex;gap:6px;align-items:center;padding:6px 8px;margin-bottom:6px">
        <input type="checkbox" data-k="brandText" data-bool="1" ${d.brandText ? 'checked' : ''} style="width:auto" />
        <span>背面文字</span>
      </label>
      ${d.brandText ? `
      <label class="field"><span>文字内容 <span class="tiny dim">（留空显示公司英文名）</span></span>
        <input type="text" data-k="branding.text" maxlength="20" value="${esc(txtVal)}" placeholder="${esc(state.company.nameEn || state.company.name || '')}" style="width:100%" />
      </label>
      ${sliderRow('文字位置 · 横', 'branding.textX', br.textX, -(b.width / 2), b.width / 2, 0.5, 'mm')}
      ${sliderRow('文字位置 · 纵', 'branding.textY', br.textY, -(b.length / 2), b.length / 2, 0.5, 'mm')}
      ${sliderRow('文字大小', 'branding.textSize', br.textSize, 1.5, 10, 0.1, 'mm')}` : ''}
      <div class="tiny dim">Logo 与文字都会印在 3D 模型与产品缩略图上。</div>`;
  }

  function panelOptions(d) {
    const cur = d.screen.panel;
    const own = d.parts.ownPanel;
    return SCREENS.map((s) => {
      const ok = unlocked.includes(s.tech) && s.year <= availYear;
      return `<option value="${s.id}" ${cur === s.id && !own ? 'selected' : ''} ${ok ? '' : 'disabled'}>${s.label} · ${s.year}${ok ? '' : '（未解锁）'}</option>`;
    }).join('') + `<option value="__own" ${own ? 'selected' : ''} ${(state.divisions?.panel?.level || 0) < 1 ? 'disabled' : ''}>自研面板${(state.divisions?.panel?.level || 0) >= 1 ? ` ${state.divisions.panel.level}.0 · 品质 ${Math.round(ownPanelSpec(state).quality)}` : '（需成立面板研发部）'}</option>`;
  }
  function panelOwnCheckbox() { return ''; }

  // 逐镜编辑卡：类型 / 传感器（真实型号）/ 光圈 / 焦距 / OIS / 在 deco 内的位置
  function lensCard(l, i, d, divs) {
    const lt = lensTypeById(l.type);
    const ownLv = divs.optics?.level || 0;
    // 传感器候选：角色匹配的全部型号按品牌分组（未解锁的以禁用态留在组内），自研传感器需光学部
    // LENS_TYPES 用全名（潜望长焦），传感器 roles 用短名（潜望）——按映射表换算
    const roleName = { '潜望长焦': '潜望' }[lt.name] || lt.name;
    const candidates = IMAGE_SENSORS.filter((s) => s.roles.includes(roleName));
    const sGroups = [];
    const sByName = new Map();
    for (const s of candidates) {
      const g = s.vendor || '公版';
      if (!sByName.has(g)) { const grp = { name: g, items: [] }; sByName.set(g, grp); sGroups.push(grp); }
      sByName.get(g).items.push(s);
    }
    const sensorOpts = sGroups.map((g) => `<optgroup label="${g.name}">${g.items.map((s) => {
      const ok = s.year <= availYear && unlocked.includes(s.tech);
      return `<option value="${s.id}" ${l.sensor === s.id ? 'selected' : ''} ${ok ? '' : 'disabled'}>${s.name} · ${s.mp}MP · ${s.format} · ¥${s.price}${ok ? '' : '（未解锁）'}</option>`;
    }).join('')}</optgroup>`).join('');
    const ownOpt = ownLv >= 1 || l.sensor === 'sn_own'
      ? `<option value="sn_own" ${l.sensor === 'sn_own' ? 'selected' : ''}>自研传感器${l.sensor === 'sn_own' ? ' · 已采用' : ''}</option>`
      : `<option value="sn_own" disabled>自研传感器（需光学影像部）</option>`;
    return `
      <div style="border:1px solid var(--line-2);border-radius:8px;padding:8px;margin-bottom:6px">
        <div class="between" style="margin-bottom:5px">
          <b>镜头 ${i + 1}</b>
          ${d.camera.lenses.length > 1 ? `<button type="button" class="btn small ghost danger" data-lens-del="${i}">移除</button>` : ''}
        </div>
        <label class="field"><span>类型</span>
          <select data-k="camera.lenses.${i}.type">
            ${LENS_TYPES.map((t) => `<option value="${t.id}" ${l.type === t.id ? 'selected' : ''}>${t.name} · ${t.defFocal}mm 典型</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>传感器</span>
          <select data-k="camera.lenses.${i}.sensor">
            ${sensorOpts}${ownOpt}
          </select>
        </label>
        ${sliderRow('光圈 ƒ/', `camera.lenses.${i}.ap`, l.ap, 0.95, 4, 0.1, '')}
        ${sliderRow('等效焦距', `camera.lenses.${i}.focal`, l.focal, 8, 160, 1, 'mm')}
        <label class="opt ${l.ois ? 'on' : ''}" style="display:flex;gap:6px;align-items:center;padding:5px 8px;margin-bottom:5px">
          <input type="checkbox" data-k="camera.lenses.${i}.ois" data-bool="1" ${l.ois ? 'checked' : ''} style="width:auto" />
          <span>光学防抖（OIS）</span>
        </label>
        ${sliderRow('镜头位置 · 横', `camera.lenses.${i}.x`, l.x, -(d.camera.deco.w / 2), d.camera.deco.w / 2, 0.5, 'mm')}
        ${sliderRow('镜头位置 · 纵', `camera.lenses.${i}.y`, l.y, -(d.camera.deco.h / 2), d.camera.deco.h / 2, 0.5, 'mm')}
        ${sliderRow('镜头大小', `camera.lenses.${i}.size`, l.size ?? 1, 0.75, 1.5, 0.05, '×')}
      </div>`;
  }

  const fmtGb = (gb) => gb >= 1 ? `${Math.round(gb * 10) / 10}GB` : gb >= 0.001 ? `${Math.round(gb * 1024)}MB` : `${Math.round(gb * 1024 * 1024)}KB`;
  function variantCard(v, i) {
    const ram = RAMS.find((r) => r.id === v.ram) || RAMS[0];
    const stg = STORAGES.find((r) => r.id === v.stg) || STORAGES[0];
    const opt = (list, cur) => list.map((x) => {
      const ok = unlocked.includes(x.tech) && x.year <= availYear;
      return `<option value="${x.id}" ${cur === x.id ? 'selected' : ''} ${ok ? '' : 'disabled'}>${x.name}${ok ? '' : '（未解锁）'}</option>`;
    }).join('');
    return `
      <div style="border:1px solid var(--line-2);border-radius:8px;padding:8px;margin-bottom:6px">
        <div class="between" style="margin-bottom:5px">
          <b>版本 ${i + 1}</b>
          <button type="button" class="btn small ghost danger" data-variant-del="${i}">移除</button>
          <input type="text" data-k="variants.${i}.label" maxlength="8" value="${esc(v.label || '')}" placeholder="版本名（如 领先版/Pro）" style="width:100%;margin:4px 0;font-size:11.5px" />
        </div>
        <label class="field"><span>内存</span>
          <select data-k="variants.${i}.ram">${opt(RAMS, v.ram)}</select>
        </label>
        <label class="field"><span>存储</span>
          <select data-k="variants.${i}.stg">${opt(STORAGES, v.stg)}</select>
        </label>
        ${sliderRow('定价倍率', `variants.${i}.priceMul`, v.priceMul || 1, 0.7, 2, 0.05, '×')}
      </div>`;
  }

  function sliderRow(label, key, val, min, max, step, unit) {
    return `<div class="field">
      <span>${label} <b class="mono" data-out="o_${key}">${val}${unit}</b></span>
      <span class="srow" data-slider="${key}" data-min="${min}" data-max="${max}" data-step="${step}" data-unit="${unit}">
        <button type="button" class="sbtn" data-sdir="-1" title="减小">−</button>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-k="${key}" data-unit="${unit}" />
        <button type="button" class="sbtn" data-sdir="1" title="增大">+</button>
        <input type="number" class="snum" min="${min}" max="${max}" step="${step}" value="${val}" data-k="${key}" data-unit="${unit}" title="直接输入数值" />
      </span>
    </div>`;
  }
  // 单区颜色选择：预设色板 + 自定义拾色器
  function colorPicker(label, target, value, tip = '') {
    const cur = (value || '').toLowerCase();
    return `<div class="field"><span>${label}${tip ? ` <span class="tiny dim">（${tip}）</span>` : ''}</span>
      <div class="row wrap" style="gap:5px;margin:4px 0 4px">
        ${BODY_COLORS.map((c) => `<div data-color="${c.hex}" data-ctarget="${target}" title="${c.name}" style="width:18px;height:18px;border-radius:6px;background:${c.hex};cursor:pointer;border:2px solid ${cur === c.hex.toLowerCase() ? '#fff' : 'rgba(255,255,255,.15)'}"></div>`).join('')}
        <input type="color" data-color-pick="${target}" value="${value || '#000000'}" title="自定义颜色" style="width:26px;height:22px;padding:1px;background:#10151c;border:1px solid var(--line-2);border-radius:6px;cursor:pointer" />
      </div>
    </div>`;
  }

  // 帮 model.design 读取当前某区颜色（兼容旧档 body.color）
  function partColor(target) {
    const b = model.design.body;
    if (b.colors && b.colors[target]) return b.colors[target];
    return target === 'cover' ? '#05070a' : (b.color || '#2b3440');
  }
  function setPartColor(target, hex) {
    const b = model.design.body;
    if (!b.colors) b.colors = { frame: b.color || hex, back: b.color || hex, cover: '#05070a' };
    b.colors[target] = hex;
    // 兼容旧渲染路径：body.color 跟随后盖
    if (target === 'back') b.color = hex;
  }

  function selectRow(label, key, list, fmt, techKey, divs = {}) {
    const cur = model.design.parts[key.split('.')[1]];
    const lv = key === 'parts.cpu' ? (divs.chip?.level || 0) : key === 'parts.os' ? (divs.osd?.level || 0) : 99;
    // 有 vendor 字段的部件按品牌分组（optgroup）：同品牌全部归入一组（列表按年代排序，
    // 同品牌会穿插出现，不能只合并相邻项），组间保持品牌首次出现顺序
    const hasVendor = list.some((x) => x.vendor);
    if (hasVendor) {
      const groups = [];
      const byName = new Map();
      for (const x of list) {
        const g = x.vendor || '公版';
        if (!byName.has(g)) {
          const grp = { name: g, items: [] };
          byName.set(g, grp);
          groups.push(grp);
        }
        byName.get(g).items.push(x);
      }
      return `<label class="field"><span>${label}</span>
      <select data-k="${key}">
        ${groups.map((g) => `<optgroup label="${g.name}">${g.items.map((x) => {
          const ok = unlocked.includes(x[techKey]) && x.year <= availYear;
          let ownOk = true, ownTip = '';
          if (x.own && key === 'parts.cpu') { ownOk = lv >= 1; ownTip = '（需成立半导体研发中心）'; }
          return `<option value="${x.id}" ${cur === x.id ? 'selected' : ''} ${ok && ownOk ? '' : 'disabled'}>${fmt(x)}${ok ? '' : '（未解锁）'}${ownTip}</option>`;
        }).join('')}</optgroup>`).join('')}
      </select>
    </label>`;
    }
    return `<label class="field"><span>${label}</span>
      <select data-k="${key}">
        ${list.map((x) => {
          const ok = unlocked.includes(x[techKey]) && x.year <= availYear;
          // 自研部件需要对应部门等级
          let ownOk = true, ownTip = '';
          if (x.own) {
            if (key === 'parts.cpu') { ownOk = lv >= 1; ownTip = '（需成立半导体研发中心）'; }
            if (key === 'parts.os' && x.kind === 'own') {
              ownOk = lv >= (x.ownLv || 1);
              ownTip = ownOk ? '' : `（需系统开发部 Lv.${x.ownLv}）`;
            }
          }
          return `<option value="${x.id}" ${cur === x.id ? 'selected' : ''} ${ok && ownOk ? '' : 'disabled'}>${fmt(x)}${ok ? '' : '（未解锁）'}${ownTip}</option>`;
        }).join('')}
      </select>
    </label>`;
  }

  // ---------- 右侧评估 ----------
  function assessment() {
    const v = validate(model.design, year);
    const d = v.derived;
    const cost = bomCost(model.design, year);
    const price = suggestedPrice(state, { design: model.design }, 'cn');
    return `
      <div class="card-title" style="margin-bottom:10px">设计评估</div>
      <div class="score-ring"><div class="ring ${d.designScore > 70 ? 'good' : d.designScore > 45 ? '' : 'warn'}" style="--v:${d.designScore};width:52px;height:52px"><span>${Math.round(d.designScore)}</span></div>
        <div><div style="font-weight:600">外观设计</div><div class="tiny dim">时代契合度 ${Math.round(d.eraFit)} · 屏占比 ${d.screenRatio}%</div></div>
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px;margin:10px 0">
        ${[['性能', d.perf], ['影像', d.camera], ['续航', d.battery], ['散热', d.thermal]].map(([k, val]) => `
          <div style="background:#121821;border-radius:8px;padding:8px">
            <div class="between tiny"><span class="dim">${k}</span><b class="mono">${Math.round(val)}</b></div>
            <div class="bar" style="margin-top:5px"><i style="width:${val}%;background:${val > 65 ? 'var(--good)' : val > 40 ? 'var(--accent)' : 'var(--warn)'}"></i></div>
          </div>`).join('')}
      </div>

      <div class="tiny" style="line-height:2;margin-bottom:4px">
        <div class="between"><span class="dim">整机重量</span><b class="mono">${d.weight} g</b></div>
        <div class="between"><span class="dim">整机成本(含料)</span><b class="mono warn">¥${fmtNum(cost)}</b></div>
        <div class="between"><span class="dim">建议零售价</span><b class="mono">¥${fmtNum(price)}</b></div>
        <div class="between"><span class="dim">屏幕可视尺寸</span><b class="mono">${d.scr.w}×${d.scr.h}mm</b></div>
        <div class="between"><span class="dim">续航估算</span><b class="mono">${d.endurance} h</b></div>
        <div class="between"><span class="dim">有线充电</span><b class="mono">${d.watt}W · 约 ${d.chargeMin} 分钟充满</b></div>
        <div class="between"><span class="dim">无线充电</span><b class="mono">${d.wirelessWatt ? d.wirelessWatt + 'W' : '不支持'} · ${d.proto}</b></div>
      </div>

      ${lensSpecs(model.design).length ? `
      <div class="section-label">镜头规格</div>
      <div class="tiny" style="line-height:1.9">
        ${lensSpecs(model.design).map((l) => `<div class="between"><span class="dim">${l.role}${l.ois ? ' · OIS' : ''}</span><b class="mono">${l.mp}MP ${l.sensor} ${l.aperture} ${l.focal}</b></div>`).join('')}
      </div>` : ''}

      ${(model.design.parts.ownCpu || model.design.parts.ownCmr || model.design.parts.ownPanel) ? `
      <div class="section-label">自研部件</div>
      <div class="tiny" style="line-height:1.9">
        ${model.design.parts.ownCpu ? `<div class="between"><span class="dim" style="color:var(--good)">自研 SoC ${model.design.parts.ownCpu.gen}.0</span><b class="mono">性能 ${Math.round(model.design.parts.ownCpu.perf)}</b></div>` : ''}
        ${model.design.parts.ownCmr ? `<div class="between"><span class="dim" style="color:var(--good)">自研影像模组</span><b class="mono">评分 ${Math.round(model.design.parts.ownCmr.score)}</b></div>` : ''}
        ${model.design.parts.ownPanel ? `<div class="between"><span class="dim" style="color:var(--good)">自研面板</span><b class="mono">品质 ${Math.round(model.design.parts.ownPanel.quality)}</b></div>` : ''}
      </div>` : ''}

      <div class="section-label">内部空间</div>
      <div class="between tiny"><span class="dim">占用 ${d.spaceUse}%</span><span class="dim">${d.used} / ${d.internal} cm³</span></div>
      <div class="bar ${d.spaceUse > 100 ? 'bad' : d.spaceUse > 92 ? 'warn' : 'good'}" style="margin:5px 0 2px"><i style="width:${clamp(d.spaceUse, 0, 100)}%"></i></div>
      <div class="tiny dim">电池、摄像头模组、主板与散热都要塞进这个体积里。</div>

      <div class="section-label">装配检查</div>
      ${v.issues.length ? v.issues.map((i) => `<div class="issue ${i.level}">${i.level === 'error' ? '✕' : '!'} ${esc(i.text)}</div>`).join('')
        : '<div class="issue" style="background:rgba(55,201,165,.08);color:var(--good)">✓ 所有检查通过，可以量产</div>'}

      <div class="section-label">尺寸摘要</div>
      <div class="tiny dim" style="line-height:1.9">
        机身 ${model.design.body.length} × ${model.design.body.width} × ${model.design.body.thickness} mm<br/>
        屏幕 ${model.design.screen.inch}″ ${model.design.screen.aspect}，边框 ${model.design.screen.bezel}mm<br/>
        电池 ${BATTERIES.find((b) => b.id === model.design.parts.battery)?.mah || 0} mAh · 摄像头 ${model.design.camera.count} 颗
      </div>`;
  }

  // ---------- 2D 绘制 ----------
  function draw2D() {
    if (viewMode !== '2d') return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas2d.clientWidth, h = canvas2d.clientHeight;
    canvas2d.width = w * dpr; canvas2d.height = h * dpr;
    const ctx = canvas2d.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cols = 3, rows = 2;
    const cw = w / cols, ch = h / rows;
    const b = model.design.body;
    // 折叠机型 2D 语义：body 尺寸 = 折叠态单半足迹。
    // 折叠态：足迹不变（即单半），厚度按两层机身（扣铰链间隙），侧/顶视图画双层接缝；
    // 展开态：单层厚度，标记 __openFold 供 drawGridView 扩边渲染（fold 宽×2 / flip 长×2）+折痕+背部分屏
    const folded = foldView === 'folded' && b.fold !== 'none';
    let design2 = model.design;
    if (b.fold !== 'none') {
      design2 = JSON.parse(JSON.stringify(model.design));
      if (folded) {
        design2.body.thickness = Math.round((b.thickness * 2 - 0.6) * 10) / 10;
        design2.__foldedView = true;
      } else {
        design2.__openFold = true;
      }
    }
    const fpW = b.fold === 'fold' && !folded ? b.width * 2 : b.width;
    const fpL = b.fold === 'flip' && !folded ? b.length * 2 : b.length;
    const scale = Math.min((cw - 46) / fpW, (ch - 52) / fpL, 3.2);
    VIEWS.forEach((v, i) => {
      const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch;
      drawGridView(ctx, cx, cy, cw, ch, v, design2, scale);
    });
  }

  // ---------- 2D 画布拖拽：后视图直接拖动镜头 / 闪光灯（deco 内 mm 坐标） ----------
  // 坐标换算与 drawGridView 背视图分支同源：px = ox + (rect.cx+l.x)*scale，py = oy - (rect.cy+l.y)*scale
  let drag2d = null;
  function backViewMap2D() {
    const d = model.design, b = d.body;
    const folded = foldView === 'folded' && b.fold !== 'none';
    const w = canvas2d.clientWidth, h = canvas2d.clientHeight;
    if (!w || !h) return null;
    const cols = 3, rows = 2, cw = w / cols, ch = h / rows;
    const fpW = b.fold === 'fold' && !folded ? b.width * 2 : b.width;
    const fpL = b.fold === 'flip' && !folded ? b.length * 2 : b.length;
    const scale = Math.min((cw - 46) / fpW, (ch - 52) / fpL, 3.2);
    const i = VIEWS.findIndex((v) => v.id === 'back');
    const x0 = (i % cols) * cw, y0 = Math.floor(i / cols) * ch;
    const openFold = !folded && b.fold !== 'none';
    let realW = b.width, realH = b.length;
    if (openFold) { if (b.fold === 'fold') realW = b.width * 2; else realH = b.length * 2; }
    const W = realW * scale, H = realH * scale;
    const x = x0 + (cw - W) / 2, y = y0 + (ch - H) / 2;
    const camHalfDX = openFold && b.fold === 'fold' ? -W / 4 : 0;
    const camHalfDY = openFold && b.fold === 'flip' ? -H / 4 : 0;
    const rect = cameraModuleRect(d);
    if (!rect) return null;
    return { scale, ox: x + W / 2 + camHalfDX, oy: y + H / 2 + camHalfDY, rect };
  }
  function hit2D(mx, my) {
    const m = backViewMap2D();
    if (!m) return null;
    const d = model.design;
    ensureLenses(d);
    const fl = d.camera.flash;
    if (fl && !fl.offDeco) { // offDeco 闪光灯位置由布局推导，不响应拖拽
      const style = fl.style || 'round';
      const wide = style === 'rounded' || style === 'slot';
      const hw = (wide ? (fl.w || 4) / 2 : Math.max(1, fl.r || 1.5)) * m.scale + 3;
      const hh = (wide ? (fl.l || 6) / 2 : Math.max(1, fl.r || 1.5)) * m.scale + 3;
      const fx = m.ox + (m.rect.cx + (fl.x || 0)) * m.scale;
      const fy = m.oy - (m.rect.cy + (fl.y || 0)) * m.scale;
      if (Math.abs(mx - fx) <= hw && Math.abs(my - fy) <= hh) {
        return { kind: 'flash', m, gx: (mx - fx) / m.scale, gy: (fy - my) / m.scale };
      }
    }
    for (let i = d.camera.lenses.length - 1; i >= 0; i--) {
      const l = d.camera.lenses[i];
      const sn = l.sensor === 'sn_own' ? d.parts.ownCmr : sensorById(l.sensor);
      const rad = lensRadiusMm(sn ? sn.format : '1/2.4″') * (l.size || 1) * m.scale * 0.82;
      const hitR = Math.max(rad * (l.type === 'periscope' ? 1.6 : 1.15), 9);
      const lx = m.ox + (m.rect.cx + l.x) * m.scale;
      const ly = m.oy - (m.rect.cy + l.y) * m.scale;
      if ((mx - lx) * (mx - lx) + (my - ly) * (my - ly) <= hitR * hitR) {
        return { kind: 'lens', idx: i, m, gx: (mx - lx) / m.scale, gy: (ly - my) / m.scale };
      }
    }
    return null;
  }
  canvas2d.style.touchAction = 'none'; // 拖镜头优先于页面滚动（与 3D 画布一致）
  canvas2d.addEventListener('pointerdown', (e) => {
    if (viewMode !== '2d') return;
    const r = canvas2d.getBoundingClientRect();
    const hit = hit2D(e.clientX - r.left, e.clientY - r.top);
    if (!hit) return;
    e.preventDefault();
    drag2d = hit;
    try { canvas2d.setPointerCapture(e.pointerId); } catch (err) { /* 已释放则忽略 */ }
    canvas2d.style.cursor = 'grabbing';
  });
  canvas2d.addEventListener('pointermove', (e) => {
    if (viewMode !== '2d') return;
    const r = canvas2d.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (!drag2d) { // 悬停高亮：可拖拽目标显示抓手
      canvas2d.style.cursor = hit2D(mx, my) ? 'grab' : '';
      return;
    }
    const { m } = drag2d;
    const bx = (mx - m.ox) / m.scale - m.rect.cx; // deco 内 mm（+x 朝右）
    const by = (m.oy - my) / m.scale - m.rect.cy; // deco 内 mm（+y 朝上）
    const d = model.design, deco = d.camera.deco;
    if (drag2d.kind === 'lens') {
      const l = d.camera.lenses[drag2d.idx];
      const sn = l.sensor === 'sn_own' ? d.parts.ownCmr : sensorById(l.sensor);
      const rmm = lensRadiusMm(sn ? sn.format : '1/2.4″') * (l.size || 1) * (l.type === 'periscope' ? 1.25 : 1);
      const limX = Math.max(0, deco.w / 2 - rmm), limY = Math.max(0, deco.h / 2 - rmm);
      l.x = Math.round(clamp(bx - drag2d.gx, -limX, limX) * 2) / 2; // 0.5mm 步进与滑杆一致
      l.y = Math.round(clamp(by - drag2d.gy, -limY, limY) * 2) / 2;
      syncSliderUI(`camera.lenses.${drag2d.idx}.x`, l.x);
      syncSliderUI(`camera.lenses.${drag2d.idx}.y`, l.y);
    } else {
      const fl = d.camera.flash;
      const wide = (fl.style === 'rounded' || fl.style === 'slot');
      const ex = wide ? (fl.w || 4) / 2 : (fl.r || 1.5);
      const ey = wide ? (fl.l || 6) / 2 : (fl.r || 1.5);
      const limX = Math.max(0, deco.w / 2 - ex), limY = Math.max(0, deco.h / 2 - ey);
      fl.x = Math.round(clamp(bx - drag2d.gx, -limX, limX) * 2) / 2;
      fl.y = Math.round(clamp(by - drag2d.gy, -limY, limY) * 2) / 2;
      syncSliderUI('camera.flash.x', fl.x);
      syncSliderUI('camera.flash.y', fl.y);
    }
    draw2D();
  });
  const endDrag2D = () => {
    if (!drag2d) return;
    drag2d = null;
    canvas2d.style.cursor = '';
    renderAssessment(); // 装配检查随落点刷新
  };
  canvas2d.addEventListener('pointerup', endDrag2D);
  canvas2d.addEventListener('pointercancel', endDrag2D);

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawGridView(ctx, x0, y0, cw, ch, view, d, scale) {
    const b = d.body;
    const isSide = view.id === 'left' || view.id === 'right';
    const isTop = view.id === 'top' || view.id === 'bottom';
    const openFold = !!d.__openFold && b.fold !== 'none';
    const twoLayer = !!d.__foldedView && (isSide || isTop);
    // 展开态折叠机足迹：正/背视图 fold 宽×2 / flip 长×2；顶/底视图仅 fold 宽×2（flip 展开加长不改变顶视宽度）；
    // 侧视图仅 flip 长×2；折叠态侧/顶视图 = 双层机身（中间留铰链缝隙）
    let realW = isSide ? b.thickness : b.width;
    let realH = isTop ? b.thickness : b.length;
    if (openFold && !isSide && !isTop) {
      if (b.fold === 'fold') realW = b.width * 2;
      else realH = b.length * 2;
    } else if (openFold && isTop && b.fold === 'fold') {
      realW = b.width * 2;
    } else if (openFold && isSide && b.fold === 'flip') {
      realH = b.length * 2;
    }
    const W = realW * scale, H = realH * scale;
    const x = x0 + (cw - W) / 2, y = y0 + (ch - H) / 2;

    // 网格底纹
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.045)';
    ctx.lineWidth = 1;
    for (let gx = x0; gx < x0 + cw; gx += 16) { ctx.beginPath(); ctx.moveTo(gx, y0); ctx.lineTo(gx, y0 + ch); ctx.stroke(); }
    for (let gy = y0; gy < y0 + ch; gy += 16) { ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x0 + cw, gy); ctx.stroke(); }
    ctx.restore();

    // 标签
    ctx.fillStyle = '#6b7789';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(view.name, x0 + 10, y0 + 16);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#4a5464';
    const exW = openFold && b.fold === 'fold' ? Math.round(b.width * 2 * 10) / 10 : b.width;
    const exH = openFold && b.fold === 'flip' ? Math.round(b.length * 2 * 10) / 10 : b.length;
    ctx.fillText(isSide ? `厚 ${b.thickness}mm` : isTop ? `${exW}×${b.thickness}mm` : `${exH}×${exW}mm`, x0 + cw - 10, y0 + 16);

    // 机身：折叠态侧/顶视图画两层独立边框（中间留 0.6mm 铰链缝隙），其余为单块
    const viewColor = view.id === 'back' ? partColor('back') : partColor('frame');
    const gapPx = 0.6 * scale;
    const layers = [];
    if (twoLayer) {
      if (isSide) {
        const lw = (W - gapPx) / 2;
        layers.push([x, y, lw, H], [x + lw + gapPx, y, lw, H]);
      } else {
        const lh = (H - gapPx) / 2;
        layers.push([x, y, W, lh], [x, y + lh + gapPx, W, lh]);
      }
    } else {
      layers.push([x, y, W, H]);
    }
    for (const [lx, ly, lw, lh] of layers) {
      const rLm = isSide || isTop ? Math.min(b.corner, lw / scale / 2, lh / scale / 2) : b.corner;
      const rLp = Math.max(2, rLm * scale);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.5)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 5;
      const bodyGrad = ctx.createLinearGradient(lx, ly, lx + lw, ly + lh);
      bodyGrad.addColorStop(0, shade(viewColor, 26));
      bodyGrad.addColorStop(0.5, viewColor);
      bodyGrad.addColorStop(1, shade(viewColor, -18));
      ctx.fillStyle = bodyGrad;
      roundRect(ctx, lx, ly, lw, lh, rLp);
      ctx.fill();
      ctx.restore();
      // 边框高光
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.lineWidth = 1;
      roundRect(ctx, lx + 0.5, ly + 0.5, lw - 1, lh - 1, rLp);
      ctx.stroke();
    }
    // 折叠态双层：铰链端金属标记（画在缝隙端部）
    if (twoLayer) {
      ctx.fillStyle = 'rgba(160,170,182,.85)';
      const hw = Math.max(3, 2.4 * scale);
      if (isSide) {
        // fold：铰链沿长度方向（左视图可见铰链面）；flip：铰链横穿宽度（侧视下端断面）
        if (b.fold === 'fold') ctx.fillRect(x - 0.5, y + 2, 2.5, H - 4);
        else { ctx.beginPath(); ctx.arc(x + W / 2, y + H - 2, hw * 0.6, 0, Math.PI * 2); ctx.fill(); }
      } else if (b.fold === 'fold') {
        ctx.fillRect(x + 2, y + H / 2 - 1, W - 4, 2);
      } else {
        ctx.fillRect(x + W / 2 - hw / 2, y + H / 2 - 1, hw, 2);
      }
    }
    const rPx = Math.max(2, (isSide || isTop ? Math.min(b.corner, realW / 2, realH / 2) : b.corner) * scale);

    if (view.id === 'front') {
      // 折叠态正视图：显示外屏（cover screen）
      if (d.__foldedView) {
        const cv = d.body.coverScreen?.inch || 0;
        ctx.fillStyle = 'rgba(255,255,255,.06)';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        if (cv > 0) {
          const cvRatio = b.coverScreen?.ratio || (b.fold === 'flip' ? 1.05 : 1.42);
          const cvW = Math.min(W - 8 * scale, cv * 25.4 / 2.15 * scale);
          const cvH = Math.min(cvW * cvRatio, H - 10 * scale);
          const ccx = x + W / 2 + (b.coverScreen?.x || 0) * scale;
          const ccy = y + H / 2 - (b.coverScreen?.y || 0) * scale;
          const cg = ctx.createLinearGradient(ccx - cvW / 2, ccy - cvH / 2, ccx + cvW / 2, ccy + cvH / 2);
          cg.addColorStop(0, '#0e1826'); cg.addColorStop(0.5, '#2b5a8c'); cg.addColorStop(1, '#0a1018');
          ctx.fillStyle = cg;
          roundRect(ctx, ccx - cvW / 2, ccy - cvH / 2, cvW, cvH, Math.max(2, d.body.corner * scale * 0.5));
          ctx.fill();
          if (b.coverScreen?.notch === 'punch') { // 外屏前置挖孔（位置可调）
            const hf = (b.coverScreen?.holeX || 0) / 100;
            ctx.fillStyle = '#05080c';
            ctx.beginPath();
            ctx.arc(ccx + cvW * hf, ccy - cvH / 2 + Math.max(3, 4 * scale), Math.max(1.5, 2 * scale * 0.7), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = 'rgba(255,255,255,.4)';
          ctx.fillText(`外屏 ${cv}″`, ccx, ccy - cvH / 2 - 5);
        } else {
          ctx.fillText('后盖（未设计外屏）', x + W / 2, y + H / 2);
        }
        return;
      }
      const scr = screenSize(d);
      // 折叠机内屏钳制到展开足迹（减边框），保证视觉上铺满展开机身
      const maxSw = (openFold && b.fold === 'fold' ? b.width * 2 : b.width) - d.screen.bezel * 2 - 0.6;
      const maxSh = (openFold && b.fold === 'flip' ? b.length * 2 : b.length) - d.screen.bezel * 2 - 0.6;
      const sw = Math.min(scr.w, maxSw) * scale, sh = Math.min(scr.h, maxSh) * scale;
      const sx = x + (W - sw) / 2, sy = y + (H - sh) / 2;
      const sr = Math.max(2, screenCornerMm(d) * scale);
      if (openFold) {
        // 折叠机展开态：专用宽幅内屏壁纸（铺满整个展开面），后续再叠加折痕
        drawWideWallpaper(ctx, sx, sy, sw, sh, sr, b.fold);
      } else {
        const g = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
        g.addColorStop(0, '#0e1826');
        g.addColorStop(0.42, '#17293f');
        g.addColorStop(0.46, '#4d7fae');
        g.addColorStop(1, '#0a1018');
        ctx.fillStyle = g;
        roundRect(ctx, sx, sy, sw, sh, sr);
        ctx.fill();
      }
      // 屏幕反光
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#cfe6ff';
      ctx.beginPath();
      ctx.moveTo(sx, sy + sh * 0.25);
      ctx.lineTo(sx + sw, sy + sh * 0.05);
      ctx.lineTo(sx + sw, sy + sh * 0.16);
      ctx.lineTo(sx, sy + sh * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 展开态折叠机：屏幕中缝折痕（垂直折线 fold / 水平折线 flip）
      if (openFold) {
        ctx.save();
        roundRect(ctx, sx, sy, sw, sh, Math.max(2, screenCornerMm(d) * scale));
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,.09)';
        ctx.lineWidth = Math.max(1, 0.7 * scale);
        ctx.beginPath();
        if (d.body.fold === 'fold') { ctx.moveTo(sx + sw / 2, sy); ctx.lineTo(sx + sw / 2, sy + sh); }
        else { ctx.moveTo(sx, sy + sh / 2); ctx.lineTo(sx + sw, sy + sh / 2); }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (d.body.fold === 'fold') { ctx.moveTo(sx + sw / 2 + 1.5, sy); ctx.lineTo(sx + sw / 2 + 1.5, sy + sh); }
        else { ctx.moveTo(sx, sy + sh / 2 + 1.5); ctx.lineTo(sx + sw, sy + sh / 2 + 1.5); }
        ctx.stroke();
        ctx.restore();
      }

      // 开孔（屏下摄像头时隐藏单孔）；挖孔横向位置可调（%屏宽，折叠机默认右半屏中心）
      ctx.fillStyle = '#05080c';
      if (d.screen.notch === 'punch' && !d.parts.extras.includes('x_udc')) {
        const holeFrac = (d.screen.holeX ?? (d.body.fold !== 'none' ? 25 : 0)) / 100;
        ctx.beginPath();
        ctx.arc(x + W / 2 + sw * holeFrac, sy + Math.max(3, 4 * scale), 2.2 * Math.max(1, scale * 0.7), 0, Math.PI * 2);
        ctx.fill();
      } else if (d.screen.notch === 'notch') {
        const nw = Math.min(sw * 0.34, 26 * scale), nh = 5 * scale;
        roundRect(ctx, x + (W - nw) / 2, sy - 0.5, nw, nh, nh * 0.45);
        ctx.fill();
      } else if (d.screen.notch === 'waterdrop') {
        ctx.beginPath();
        ctx.arc(x + W / 2, sy + 2, 3.4 * scale * 0.7, 0, Math.PI);
        ctx.fill();
      }
      // 升降式前摄：顶缘升起的模块
      if (d.screen.notch === 'popup') {
        const mw = 9 * scale, mh = 3.6 * scale;
        const mx = x + W / 2 - mw / 2, my = y - mh * 0.55;
        ctx.fillStyle = shade(partColor('frame'), -8);
        roundRect(ctx, mx, my, mw, mh, 2 * scale * 0.5);
        ctx.fill();
        ctx.fillStyle = '#0a0f14';
        ctx.beginPath(); ctx.arc(mx + mw / 2, my + mh * 0.55, 1.1 * scale, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(120,160,220,.5)';
        ctx.beginPath(); ctx.arc(mx + mw / 2, my + mh * 0.55, 0.5 * scale, 0, Math.PI * 2); ctx.fill();
      }
      // 听筒
      if (d.screen.notch === 'none') {
        ctx.fillStyle = 'rgba(255,255,255,.22)';
        ctx.fillRect(x + W / 2 - 10 * scale * 0.5, sy - 5 * Math.max(0.6, scale * 0.35), 10 * Math.max(0.6, scale * 0.5), 1.2);
      }
    }

    if (view.id === 'back') {
      // 背面 mm→px 坐标（原点=机身中心，+y 朝上）：镜头 / 闪光灯 / Logo / 文字共用
      // 展开态折叠机：镜头在半A（fold=正视右半→背视左半；flip=上半），模组坐标映射到该半区中心；
      // 另一半区画外屏（有 coverScreen 时）或纯后盖
      const camHalfDX = openFold && b.fold === 'fold' ? -W / 4 : 0;
      const camHalfDY = openFold && b.fold === 'flip' ? -H / 4 : 0;
      const px = (xmm) => x + W / 2 + camHalfDX + xmm * scale;
      const py = (ymm) => y + H / 2 + camHalfDY - ymm * scale;
      if (openFold) {
        const cv = b.coverScreen?.inch || 0;
        ctx.save();
        roundRect(ctx, x, y, W, H, rPx);
        ctx.clip();
        // 分缝
        ctx.strokeStyle = 'rgba(0,0,0,.5)';
        ctx.lineWidth = Math.max(1.2, 0.9 * scale * 0.4);
        ctx.beginPath();
        if (b.fold === 'fold') { ctx.moveTo(x + W / 2, y - 2); ctx.lineTo(x + W / 2, y + H + 2); }
        else { ctx.moveTo(x - 2, y + H / 2); ctx.lineTo(x + W + 2, y + H / 2); }
        ctx.stroke();
        // 外屏（fold=背视右半 / flip=下半）：按尺寸+比例+位置偏移实绘，不默认占满半区
        if (cv > 0) {
          const cvRatio = b.coverScreen?.ratio || (b.fold === 'flip' ? 1.05 : 1.42);
          const halfPxW = b.fold === 'fold' ? W / 2 : W;
          const halfPxH = b.fold === 'flip' ? H / 2 : H;
          const cw = Math.min(cv * 25.4 / 2.15 * scale, halfPxW - 6 * scale);
          const chh = Math.min(cw * cvRatio, halfPxH - 6 * scale);
          const hx = b.fold === 'fold' ? x + W * 0.75 : x + W / 2;
          const hy = b.fold === 'flip' ? y + H * 0.75 : y + H / 2;
          const ccx = hx + (b.coverScreen?.x || 0) * scale;
          const ccy = hy - (b.coverScreen?.y || 0) * scale;
          const cg = ctx.createLinearGradient(ccx - cw / 2, ccy - chh / 2, ccx + cw / 2, ccy + chh / 2);
          cg.addColorStop(0, '#0e1826'); cg.addColorStop(0.5, '#2b5a8c'); cg.addColorStop(1, '#0a1018');
          ctx.fillStyle = cg;
          roundRect(ctx, ccx - cw / 2, ccy - chh / 2, cw, chh, Math.max(2, Math.min(cw, chh) * 0.16));
          ctx.fill();
          if (b.coverScreen?.notch === 'punch') { // 外屏前置挖孔（展开背面透视）
            const hf = (b.coverScreen?.holeX || 0) / 100;
            ctx.fillStyle = '#05080c';
            ctx.beginPath();
            ctx.arc(ccx + cw * hf, ccy - chh / 2 + Math.max(2, 3 * scale), Math.max(1.2, 1.8 * scale * 0.7), 0, Math.PI * 2);
            ctx.fill();
          }
          if (cw > 44) {
            ctx.fillStyle = 'rgba(255,255,255,.4)';
            ctx.font = '10px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`外屏 ${cv}″`, ccx, ccy + 3);
          }
        }
        ctx.restore();
      }
      if (!openFold && d.backWindow?.on) {
        const bwW = (d.backWindow.inch || 1.8) * 11 * scale;
        const bwH = (d.backWindow.inch || 1.8) * 8 * scale;
        const [wcx, wcy] = [px((d.backWindow.cx || 0)), py((d.backWindow.cy || 0))];
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 4;
        ctx.fillStyle = '#0a0f14';
        roundRect(ctx, wcx - bwW / 2, wcy - bwH / 2, bwW, bwH, Math.min(bwW, bwH) * 0.32);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,.14)';
        roundRect(ctx, wcx - bwW / 2 + 0.5, wcy - bwH / 2 + 0.5, bwW - 1, bwH - 1, Math.min(bwW, bwH) * 0.32);
        ctx.stroke();
        ctx.fillStyle = 'rgba(235,240,246,.85)';
        ctx.font = `600 ${Math.max(7, bwH * 0.3)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('12:38', wcx, wcy + bwH * 0.12);
      }
      // 摄像头模组（按 cameraModuleRect 定位，含位置偏移与大小）
      ensureLenses(d);
      if (d.camera.lenses.length > 0) {
        const rect = cameraModuleRect(d);
        const modPx = px(rect.cx - rect.w / 2), modPy = py(rect.cy + rect.h / 2);
        const modW = rect.w * scale, modH = rect.h * scale;
        const bump = d.camera.step ? Math.max(d.camera.bump, 0.4) : 0;
        // 装饰板只在凸台开启时渲染；关闭凸台 = 镜头直接装在后壳上
        if (d.camera.step) {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
          ctx.fillStyle = shade(partColor('back'), -22);
          const decoR = rect.shape === 'circle' ? modW / 2 : rect.shape === 'pill' ? modH / 2 : Math.min(rect.radius ?? 8, modH / 2) * (modW / rect.w);
          roundRect(ctx, modPx, modPy, modW, modH, decoR);
          ctx.fill();
          ctx.restore();
          ctx.strokeStyle = 'rgba(255,255,255,.14)';
          roundRect(ctx, modPx + 0.5, modPy + 0.5, modW - 1, modH - 1, decoR);
          ctx.stroke();
        }
        // 逐镜绘制：半径=传感器底大小×镜头大小倍率；外观按焦段差异（参考真机）
        ensureLenses(d);
        for (let i = 0; i < d.camera.lenses.length; i++) {
          const l = d.camera.lenses[i];
          let sn = sensorById(l.sensor);
          if (l.sensor === 'sn_own') sn = d.parts.ownCmr;
          const look = LENS_LOOK[l.type] || LENS_LOOK.main;
          const rad = (lensRadiusMm(sn ? sn.format : '1/2.4″')) * (l.size || 1) * scale * 0.82;
          const lx = px(rect.cx + l.x), ly = py(rect.cy + l.y);
          // 潜望长焦：棱镜模组外壳（竖/横方向可调；镜组偏一端、另一端棱镜反光窗）
          if (look.plate !== null) {
            const horiz = (d.camera.periDir ?? 'v') === 'h';
            const pw = horiz ? rad * 3.5 : rad * 2.4, ph = horiz ? rad * 2.4 : rad * 3.5;
            const px0 = horiz ? lx - pw * 0.42 : lx - pw / 2;
            const py0 = horiz ? ly - ph / 2 : ly - ph * 0.42;
            ctx.fillStyle = 'rgba(10,14,20,.88)';
            roundRect(ctx, px0, py0, pw, ph, Math.min(pw, ph) * 0.34);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,.10)';
            roundRect(ctx, px0 + 0.5, py0 + 0.5, pw - 1, ph - 1, Math.min(pw, ph) * 0.34);
            ctx.stroke();
            ctx.fillStyle = 'rgba(150,190,235,.16)';
            const wx = horiz ? px0 + pw * 0.62 : px0 + pw * 0.2;
            const wy = horiz ? py0 + ph * 0.2 : py0 + ph * 0.62;
            const ww = horiz ? pw * 0.3 : pw * 0.6, wh = horiz ? ph * 0.6 : ph * 0.3;
            roundRect(ctx, wx, wy, ww, wh, Math.min(ww, wh) * 0.45);
            ctx.fill();
          }
          // 镜筒玻璃（高光偏移渐变，色膜随焦段不同）
          const gHi = Math.min(255, ((look.glass >> 16) & 255) + 46);
          const gHg = Math.min(255, ((look.glass >> 8) & 255) + 46);
          const gHb = Math.min(255, (look.glass & 255) + 46);
          const lg = ctx.createRadialGradient(lx - rad * 0.32, ly - rad * 0.32, 1, lx, ly, rad);
          lg.addColorStop(0, `rgb(${gHi},${gHg},${gHb})`);
          lg.addColorStop(0.52, '#101820');
          lg.addColorStop(1, '#000');
          ctx.fillStyle = lg;
          ctx.beginPath(); ctx.arc(lx, ly, rad, 0, Math.PI * 2); ctx.fill();
          // 金属圈：主摄/潜望亮银，超广银灰，长焦近黑，景深/微距哑光
          ctx.lineWidth = Math.max(1, rad * 0.16);
          ctx.strokeStyle = `rgba(${(look.ring >> 16) & 255},${(look.ring >> 8) & 255},${look.ring & 255},.78)`;
          ctx.beginPath(); ctx.arc(lx, ly, rad * 0.96, 0, Math.PI * 2); ctx.stroke();
          ctx.lineWidth = 1;
          if (l.ois) { // OIS 内圈
            ctx.strokeStyle = 'rgba(125,227,176,.45)';
            ctx.beginPath(); ctx.arc(lx, ly, rad * 0.7, 0, Math.PI * 2); ctx.stroke();
          }
          // 镜片反光点：主摄/潜望更醒目
          ctx.fillStyle = `rgba(210,230,255,${l.type === 'main' || l.type === 'periscope' ? 0.5 : 0.26})`;
          ctx.beginPath(); ctx.arc(lx - rad * 0.34, ly - rad * 0.34, Math.max(0.8, rad * 0.13), 0, Math.PI * 2); ctx.fill();
          if (bump > 0) { // 凸台投影圈
            ctx.strokeStyle = 'rgba(0,0,0,.25)';
            ctx.beginPath(); ctx.arc(lx, ly + bump * scale * 0.8, rad, 0, Math.PI * 2); ctx.stroke();
          }
        }
        // 闪光灯（必备）：4 样式，offDeco 时放在 deco 外侧
        const fl = d.camera.flash || { x: 0, y: 0, r: 1.5 };
        const flStyle = fl.style || 'round';
        const flOffX = fl.offDeco ? rect.w / 2 + 2.6 : fl.x;
        const fx = px(rect.cx + (fl.offDeco ? flOffX : fl.x)), fy = py(rect.cy + (fl.offDeco ? -rect.h * 0.18 : fl.y));
        const fr = Math.max(1.0, fl.r || 1.5) * scale;
        const fw = Math.max(2, fl.w || 4) * scale;
        const flLen = Math.max(2, fl.l || 6) * scale;
        if (flStyle === 'rounded' || flStyle === 'slot') {
          const fg = ctx.createLinearGradient(fx - fw / 2, fy - flLen / 2, fx + fw / 2, fy + flLen / 2);
          fg.addColorStop(0, '#fff8e0'); fg.addColorStop(0.55, '#fdf3c8'); fg.addColorStop(1, '#c9b878');
          ctx.fillStyle = fg;
          const rr = Math.max(1, flStyle === 'slot' ? Math.min(fw, flLen) / 2 : Math.min(fw, flLen) / 4);
          roundRect(ctx, fx - fw / 2, fy - flLen / 2, fw, flLen, rr);
          ctx.fill();
          ctx.strokeStyle = 'rgba(160,190,220,.3)';
          roundRect(ctx, fx - fw / 2, fy - flLen / 2, fw, flLen, rr);
          ctx.stroke();
        } else if (flStyle === 'ring') {
          const fg = ctx.createRadialGradient(fx, fy, fr * 0.55, fx, fy, fr);
          fg.addColorStop(0, '#c9b878'); fg.addColorStop(0.5, '#fff8e0'); fg.addColorStop(1, '#c9b878');
          ctx.strokeStyle = fg;
          ctx.lineWidth = Math.max(1.5, fr * 0.42);
          ctx.beginPath(); ctx.arc(fx, fy, fr * 0.79, 0, Math.PI * 2); ctx.stroke();
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(160,190,220,.3)';
          ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.stroke();
        } else {
          const fg = ctx.createRadialGradient(fx, fy, 0.5, fx, fy, fr);
          fg.addColorStop(0, '#fff8e0');
          fg.addColorStop(1, '#c9b878');
          ctx.fillStyle = fg;
          ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(160,190,220,.3)';
          ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.stroke();
        }
      }
      // Logo：印公司 Logo 图像（未设置时退化为品牌色块），位置/大小可调
      if (d.logoOnBack) {
        ensureBranding(d);
        const br = d.branding;
        const lpx = px(br.logoX), lpy = py(br.logoY);
        const half = (br.logoSize / 2) * scale;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 3;
        const lc = makeLogoCanvas();
        if (lc) {
          ctx.drawImage(lc, lpx - half, lpy - half, half * 2, half * 2);
        } else {
          // 无 Logo 图像：色块（按所选颜色与材质上渐变）
          const base = br.logoColor || state.company.logoColor || '#4aa3ff';
          const stops = logoShadeStops(base, br.logoFinish || 'img') || [base, base, base, base];
          const lg = ctx.createLinearGradient(lpx, lpy - half, lpx, lpy + half);
          lg.addColorStop(0, stops[0]); lg.addColorStop(0.42, stops[1]);
          lg.addColorStop(0.62, stops[2]); lg.addColorStop(1, stops[3]);
          ctx.fillStyle = lg;
          roundRect(ctx, lpx - half, lpy - half, half * 2, half * 2, Math.max(1, half * 0.3));
          ctx.fill();
        }
        ctx.restore();
      }
      // 背面文字：自定义文案，留空跟随公司英文名，位置/大小可调
      if (d.brandText) {
        ensureBranding(d);
        const br = d.branding;
        const txt = (br.text === null || br.text === undefined || br.text === '') ? (state.company.nameEn || state.company.name || '') : br.text;
        if (txt) {
          ctx.fillStyle = 'rgba(255,255,255,.34)';
          ctx.font = `600 ${Math.max(4, br.textSize * scale)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(txt, px(br.textX), py(br.textY));
        }
      }
    }

    if (isSide) {
      // 侧键（按 body.buttons 样式绘制；左视图=音量键侧，右视图=电源/SIM 侧；
      // 普通样式为圆角矩形键身，strip 细长条为内凹槽型）
      const btnStyle = b.buttons || 'classic';
      const bw = Math.max(1.5, W * 0.18); // 键宽（凸出量）：略窄更接近真机比例
      const side = view.id === 'right' ? x + W - bw * 1.6 : x + bw * 0.6;
      const offPx = (view.id === 'left' ? (b.btnVolY || 0) : (b.btnPowY || 0)) * scale;
      const keys = [];
      if (view.id === 'left') {
        // 左侧：音量键
        if (btnStyle === 'strip') keys.push([H * 0.16, H * 0.17]);
        else if (btnStyle === 'split') { keys.push([H * 0.14, H * 0.09]); keys.push([H * 0.27, H * 0.09]); }
        else { keys.push([H * 0.18, H * 0.11]); keys.push([H * 0.33, H * 0.14]); }
      } else {
        // 右侧：电源键
        if (btnStyle === 'opposite') keys.push([H * 0.2, H * 0.08]);
        else keys.push([H * 0.33, H * 0.08]);
      }
      const isHidden = btnStyle === 'hidden';
      const isSlot = btnStyle === 'strip' && view.id === 'left';
      for (const [ty, th] of keys) {
        const bh = Math.max(3, th);
        if (btnStyle === 'hidden') {
          ctx.strokeStyle = 'rgba(160,180,205,.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(side + bw * 0.5, y + ty + offPx + bh * 0.15);
          ctx.lineTo(side + bw * 0.5, y + ty + offPx + bh * 0.85);
          ctx.stroke();
        } else if (isSlot) {
          // 槽型：深色胶囊凹槽 + 内侧微光
          ctx.fillStyle = '#0a0f15';
          roundRect(ctx, side + bw * 0.15, y + ty + offPx, bw * 0.7, bh, bh * 0.45);
          ctx.fill();
          ctx.strokeStyle = 'rgba(140,170,205,.22)';
          roundRect(ctx, side + bw * 0.15 + 0.5, y + ty + offPx + 0.5, bw * 0.7 - 1, bh - 1, bh * 0.45);
          ctx.stroke();
        } else {
          // 圆角矩形键身
          ctx.fillStyle = shade(partColor('frame'), -34);
          roundRect(ctx, side, y + ty + offPx, bw, bh, Math.min(bw, bh) * 0.32);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.12)';
          roundRect(ctx, side + 0.5, y + ty + offPx + 0.5, bw - 1, bh - 1, Math.min(bw, bh) * 0.32);
          ctx.stroke();
        }
      }
      // 屏幕侧影
      ctx.strokeStyle = 'rgba(120,180,255,.25)';
      ctx.beginPath();
      ctx.moveTo(x + (view.id === 'right' ? W * 0.2 : W * 0.8), y + H * 0.06);
      ctx.lineTo(x + (view.id === 'right' ? W * 0.2 : W * 0.8), y + H * 0.94);
      ctx.stroke();
    }

    if (isTop) {
      // 顶/底视图：开孔全部按真实 mm 尺寸绘制（Type-C 8.34×2.56 / Micro-B 6.85×1.8），
      // 扬声器 4 种样式（5/6 圆孔、2/3 槽形孔），横向位置可调（mm，原点=机身中心）
      const ports = b.ports || {};
      const isBottom = view.id === 'bottom';
      const cy = y + H / 2;
      const PX = (xmm) => x + W / 2 + xmm * scale;
      const hole = (xmm, pw, ph) => { // 圆孔（圆）或圆角矩形开孔，pw/ph 单位 mm
        ctx.fillStyle = '#0a0f15';
        ctx.beginPath();
        ctx.ellipse(PX(xmm), cy, Math.max(0.8, pw * scale / 2), Math.max(0.8, ph * scale / 2), 0, 0, Math.PI * 2);
        ctx.fill();
      };
      const slot = (xmm, pw, ph) => { // 槽形孔（胶囊）
        ctx.fillStyle = '#0a0f15';
        roundRect(ctx, PX(xmm) - pw * scale / 2, cy - ph * scale / 2, Math.max(1.4, pw * scale), Math.max(1, ph * scale), ph * scale / 2);
        ctx.fill();
      };
      const sp = speakerRowSpec(ports.speakerStyle);
      const micSp = ports.micStyle && ports.micStyle !== 'hole' ? speakerRowSpec(ports.micStyle) : null;
      const drawRow = (cxmm, spec) => { // 按样式规格画一排开孔
        if (spec.kind === 'slot') {
          const pitch = spec.w + spec.gap;
          for (let i = 0; i < spec.n; i++) slot(cxmm + (i - (spec.n - 1) / 2) * pitch, spec.w, spec.h);
        } else {
          for (let i = 0; i < spec.n; i++) hole(cxmm + (i - (spec.n - 1) / 2) * spec.gap, spec.d, spec.d);
        }
      };
      const drawSpeaker = (cxmm) => drawRow(cxmm, sp);
      // 充电口：标准开口尺寸；custom 用用户定义形状
      const po = PORT_OPENINGS[ports.charge] || { w: ports.chargeShape?.w || 6, h: ports.chargeShape?.h || 3 };
      const portShape = ports.charge === 'custom' ? (ports.chargeShape?.style || 'round') : (ports.charge === 'micro' ? 'rect' : 'capsule');
      const drawPort = (cxmm) => {
        if (portShape === 'capsule') slot(cxmm, po.w, po.h);
        else if (portShape === 'round') hole(cxmm, po.w, po.w);
        else roundRectFill(cxmm, po.w, po.h);
      };
      const roundRectFill = (cxmm, pw, ph) => {
        ctx.fillStyle = '#0a0f15';
        roundRect(ctx, PX(cxmm) - pw * scale / 2, cy - ph * scale / 2, Math.max(1.4, pw * scale), Math.max(1, ph * scale), Math.min(pw, ph) * scale * 0.3);
        ctx.fill();
      };
      if (twoLayer) {
        // 折叠态：两层各画各的开孔。上层 = 半B，下层 = 半A（fold：半A带全套底部开孔；
        // flip：折叠后顶边 = 半A顶边 + 半B底边，故顶视图见两排，底视图为铰链侧无开孔）
        const cyA = isSide ? cy : y + H - (H - gapPx) / 4;          // 下层中心
        const cyB = isSide ? cy : y + (H - gapPx) / 4;              // 上层中心
        const PXA = (xmm) => (isSide ? x + W - (W - gapPx) / 4 : x + W / 2 + xmm * scale);
        const PXB = (xmm) => (isSide ? x + (W - gapPx) / 4 : x + W / 2 + xmm * scale);
        const holeL = (cyp, xmm, pw, ph) => {
          ctx.fillStyle = '#0a0f15';
          ctx.beginPath();
          ctx.ellipse(isSide ? xmm : PX(xmm), cyp, Math.max(0.8, pw * scale / 2), Math.max(0.8, ph * scale / 2), 0, 0, Math.PI * 2);
          ctx.fill();
        };
        const slotL = (cyp, xmm, pw, ph) => {
          ctx.fillStyle = '#0a0f15';
          roundRect(ctx, (isSide ? xmm : PX(xmm)) - pw * scale / 2, cyp - ph * scale / 2, Math.max(1.4, pw * scale), Math.max(1, ph * scale), ph * scale / 2);
          ctx.fill();
        };
        const rowL = (cyp, xmm, spec) => {
          if (spec.kind === 'slot') {
            const pitch = spec.w + spec.gap;
            for (let i = 0; i < spec.n; i++) slotL(cyp, xmm + (i - (spec.n - 1) / 2) * pitch, spec.w, spec.h);
          } else {
            for (let i = 0; i < spec.n; i++) holeL(cyp, xmm + (i - (spec.n - 1) / 2) * spec.gap, spec.d, spec.d);
          }
        };
        const spkL = (cyp, xmm) => rowL(cyp, xmm, sp);
        const micL = (cyp, xmm) => micSp ? rowL(cyp, xmm, micSp) : holeL(cyp, xmm, 1.2, 1.2);
        const portL = (cyp, xmm) => {
          if (portShape === 'capsule') slotL(cyp, xmm, po.w, po.h);
          else if (portShape === 'round') holeL(cyp, xmm, po.w, po.w);
          else slotL(cyp, xmm, po.w, po.h);
        };
        const spX = ports.speakerX ?? b.width * 0.28;
        const tSpX = ports.topSpeakerX ?? b.width * 0.28;
        if (b.fold === 'fold') {
          if (isBottom) {
            // 下层（半A）：充电口 + 扬声器 + 麦克风；上层（半B）：quadSpeaker 时镜像扬声器（折叠后与半A对齐）
            portL(cyA, ports.chargePos || 0);
            spkL(cyA, spX);
            micL(cyA, ports.micX ?? -b.width * 0.2);
            if (ports.quadSpeaker) spkL(cyB, spX);
          } else {
            if (ports.dualSpeaker) spkL(cyA, tSpX);
            if (ports.topMic) holeL(cyA, ports.topMicX ?? -b.width * 0.2, 1.2, 1.2);
            if (ports.quadSpeaker) spkL(cyB, tSpX);
          }
        } else if (!isBottom) {
          // flip 折叠：顶视图 = 上层（半B底边：充电/扬声器/麦克风）+ 下层（半A顶边：顶部扬声器/麦克风）
          portL(cyB, ports.chargePos || 0);
          spkL(cyB, spX);
          micL(cyB, ports.micX ?? -b.width * 0.2);
          if (ports.quadSpeaker) spkL(cyB, -(ports.speakerX ?? b.width * 0.28));
          if (ports.dualSpeaker) spkL(cyA, tSpX);
          if (ports.topMic) holeL(cyA, ports.topMicX ?? -b.width * 0.2, 1.2, 1.2);
        }
      } else if (openFold && b.fold === 'fold') {
        // 展开态横向折叠：全宽足迹，半A（右半）带全套开孔，quadSpeaker 时半B镜像扬声器（折叠后两半对齐）
        const hw = b.width / 2;
        if (isBottom) {
          drawPort(hw + (ports.chargePos || 0));
          drawSpeaker(hw + (ports.speakerX ?? b.width * 0.28));
          micSp ? drawRow(hw + (ports.micX ?? -b.width * 0.2), micSp) : hole(hw + (ports.micX ?? -b.width * 0.2), 1.2, 1.2);
          if (ports.quadSpeaker) drawSpeaker(-(hw + (ports.speakerX ?? b.width * 0.28)));
        } else {
          if (ports.dualSpeaker) drawSpeaker(hw + (ports.topSpeakerX ?? b.width * 0.28));
          if (ports.quadSpeaker) drawSpeaker(-(hw + (ports.topSpeakerX ?? b.width * 0.28)));
          if (ports.topMic) hole(hw + (ports.topMicX ?? -b.width * 0.2), 1.2, 1.2);
        }
        // 中缝（铰链在中央，展开时不可见，仅画浅折线）
        ctx.strokeStyle = 'rgba(0,0,0,.28)';
        ctx.lineWidth = Math.max(1, 0.5 * scale);
        ctx.beginPath();
        ctx.moveTo(x + W / 2, y + 2);
        ctx.lineTo(x + W / 2, y + H - 2);
        ctx.stroke();
      } else if (isBottom) {
        drawPort(ports.chargePos || 0);
        drawSpeaker(ports.speakerX ?? b.width * 0.28);
        micSp ? drawRow(ports.micX ?? -b.width * 0.2, micSp) : hole(ports.micX ?? -b.width * 0.2, 1.2, 1.2);
        if (ports.quadSpeaker) drawSpeaker(-(ports.speakerX ?? b.width * 0.28));
      } else {
        if (ports.dualSpeaker) drawSpeaker(ports.topSpeakerX ?? b.width * 0.28);
        if (ports.quadSpeaker) drawSpeaker(-(ports.topSpeakerX ?? b.width * 0.28));
        if (ports.topMic) hole(ports.topMicX ?? -b.width * 0.2, 1.2, 1.2);
      }
    }

    // 尺寸标注
    ctx.fillStyle = 'rgba(139,151,168,.55)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    if (!isSide) ctx.fillText(`${b.width} mm`, x + W / 2, y + H + 12);
  }

  // 折叠机展开态专用内屏壁纸：宽幅桌面铺满整个展开面（时钟/图标/.Dock 按展开比例重排）
  function drawWideWallpaper(ctx, sx, sy, sw, sh, sr, fold) {
    ctx.save();
    roundRect(ctx, sx, sy, sw, sh, sr);
    ctx.clip();
    // 底色：横幅渐变（fold 横向流动 / flip 纵向）
    const g = ctx.createLinearGradient(sx, sy, sx + sw * 0.9, sy + sh);
    g.addColorStop(0, '#0a1f38');
    g.addColorStop(0.3, '#14497e');
    g.addColorStop(0.55, '#3a6fb8');
    g.addColorStop(0.78, '#5b4a9e');
    g.addColorStop(1, '#0b0f1c');
    ctx.fillStyle = g;
    ctx.fillRect(sx, sy, sw, sh);
    // 氛围光斑
    const rg = ctx.createRadialGradient(sx + sw * 0.26, sy + sh * 0.3, 4, sx + sw * 0.26, sy + sh * 0.3, Math.max(sw, sh) * 0.5);
    rg.addColorStop(0, 'rgba(140,210,255,.4)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(sx, sy, sw, sh);
    const rg2 = ctx.createRadialGradient(sx + sw * 0.8, sy + sh * 0.75, 4, sx + sw * 0.8, sy + sh * 0.75, Math.max(sw, sh) * 0.42);
    rg2.addColorStop(0, 'rgba(190,140,255,.32)');
    rg2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg2;
    ctx.fillRect(sx, sy, sw, sh);
    // 时钟（fold=左半区上侧；flip=上半中央）
    const clockX = fold === 'flip' ? sx + sw / 2 : sx + sw * 0.27;
    const clockY = fold === 'flip' ? sy + sh * 0.2 : sy + sh * 0.3;
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.textAlign = 'center';
    ctx.font = `600 ${Math.max(10, sh * 0.11)}px -apple-system, "Segoe UI", sans-serif`;
    ctx.fillText('09:41', clockX, clockY);
    ctx.font = `400 ${Math.max(5, sh * 0.038)}px -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,.66)';
    ctx.fillText('11月6日 星期五', clockX, clockY + sh * 0.06);
    // 图标网格：6 列 × 3 行铺满展开面
    const cols = 6, rows = 3;
    const size = Math.min(sw * 0.09, sh * 0.13);
    const gapX = (sw - 32 - cols * size) / (cols - 1);
    const startY = fold === 'flip' ? sy + sh * 0.3 : sy + sh * 0.44;
    const palette = ['#3a7bd5', '#e0533d', '#2fb37a', '#f2b134', '#8b5cf6', '#22a8c9', '#e8548a', '#5b6b7f', '#4aa3ff', '#37c9a5', '#ff9f4a', '#ff5d6c', '#a78bfa', '#f5c542', '#36c9c9', '#7d8ea3', '#d4763a', '#4f8f5f'];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ix = sx + 16 + c * (size + gapX);
        const iy = startY + r * (size + sh * 0.055);
        if (iy + size > sy + sh - sh * 0.16) break;
        const col0 = palette[(r * cols + c) % palette.length];
        const ig = ctx.createLinearGradient(ix, iy, ix + size, iy + size);
        ig.addColorStop(0, col0);
        ig.addColorStop(1, shade(col0, -34));
        ctx.fillStyle = ig;
        roundRect(ctx, ix, iy, size, size, size * 0.28);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.16)';
        ctx.lineWidth = 1;
        roundRect(ctx, ix + 0.5, iy + 0.5, size - 1, size - 1, size * 0.28);
        ctx.stroke();
      }
    }
    // 底部 Dock
    const dw = Math.min(sw * 0.62, sw - 40), dh = Math.max(12, sh * 0.1);
    const dx = sx + (sw - dw) / 2, dy = sy + sh - dh - sh * 0.05;
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    roundRect(ctx, dx, dy, dw, dh, dh * 0.32);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      const ix = dx + dw * 0.12 + i * (dw * 0.76 / 3) - size * 0.32;
      const iy = dy + (dh - size * 0.64) / 2;
      const col0 = palette[(i * 3 + 5) % palette.length];
      const ig = ctx.createLinearGradient(ix, iy, ix + size * 0.64, iy + size * 0.64);
      ig.addColorStop(0, col0);
      ig.addColorStop(1, shade(col0, -30));
      ctx.fillStyle = ig;
      roundRect(ctx, ix, iy, size * 0.64, size * 0.64, size * 0.18);
      ctx.fill();
    }
    // 桌面指示条
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    roundRect(ctx, sx + sw / 2 - sw * 0.055, sy + sh - sh * 0.022, sw * 0.11, Math.max(2, sh * 0.008), 2);
    ctx.fill();
    ctx.restore();
  }

  function shade(hex, amt) {
    const n = hex.replace('#', '');
    const num = parseInt(n.length === 3 ? n.split('').map((c) => c + c).join('') : n, 16);
    let r = (num >> 16) + amt, g = ((num >> 8) & 0xff) + amt, b = (num & 0xff) + amt;
    r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  // ---------- 3D ----------
  let three = null;

  function init3D() {
    if (three) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    stageBody.appendChild(renderer.domElement);
    canvas2d.style.display = 'none';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 2000);
    camera.position.set(90, 60, 190);

    // 环境反射
    const envCanvas = document.createElement('canvas');
    envCanvas.width = 128; envCanvas.height = 64;
    const ec = envCanvas.getContext('2d');
    const eg = ec.createLinearGradient(0, 0, 0, 64);
    eg.addColorStop(0, '#dfeaff'); eg.addColorStop(0.45, '#5d7591'); eg.addColorStop(0.5, '#222a35'); eg.addColorStop(1, '#080b10');
    ec.fillStyle = eg; ec.fillRect(0, 0, 128, 64);
    ec.fillStyle = '#ffffff'; ec.beginPath(); ec.ellipse(36, 14, 22, 7, 0, 0, Math.PI * 2); ec.fill();
    ec.fillStyle = 'rgba(255,255,255,.55)'; ec.beginPath(); ec.ellipse(96, 20, 12, 5, 0, 0, Math.PI * 2); ec.fill();
    const envTex = new THREE.CanvasTexture(envCanvas);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    envTex.colorSpace = THREE.SRGBColorSpace;
    scene.environment = envTex;

    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(70, 120, 130);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1; key.shadow.camera.far = 500;
    key.shadow.camera.left = -120; key.shadow.camera.right = 120;
    key.shadow.camera.top = 120; key.shadow.camera.bottom = -120;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc6ff, 1.9);
    rim.position.set(-120, 40, -110);
    scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xfff0d0, 1.1);
    rim2.position.set(140, -30, -120);
    scene.add(rim2);
    scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x20293a, 1.25));
    const fill = new THREE.PointLight(0xffd9a0, 60, 600);
    fill.position.set(-60, -40, 90);
    scene.add(fill);

    // 地面接影
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -95;
    ground.receiveShadow = true;
    scene.add(ground);

    const group = new THREE.Group();
    scene.add(group);

    // 手动轨道
    const orbit = { theta: Math.PI * 0.14, phi: Math.PI * 0.47, radius: 240, target: new THREE.Vector3(0, 0, 0) };
    let dragging = false, panning = false, lx = 0, ly = 0;
    const dom = renderer.domElement;
    dom.style.cursor = 'grab';
    dom.style.touchAction = 'none'; // 触摸设备：拖动只旋转视角，不带动页面
    dom.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') e.preventDefault();
      dragging = true;
      panning = e.button === 2 || e.shiftKey; // 右键 / Shift+拖拽 = 平移视点
      lx = e.clientX; ly = e.clientY; dom.setPointerCapture(e.pointerId); dom.style.cursor = 'grabbing';
    });
    dom.addEventListener('pointerup', (e) => { dragging = false; panning = false; dom.style.cursor = 'grab'; });
    dom.addEventListener('contextmenu', (e) => e.preventDefault()); // 右键保留给平移，始终屏蔽浏览器菜单（pointerup 已把 dragging 置 false，不能按 dragging 判断）
    dom.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      if (panning) {
        // 平移：沿相机右/上方向移动取景中心（幅度随视距缩放，越近移得越少）
        const panScale = orbit.radius * 0.0016;
        const forward = new THREE.Vector3().setFromSphericalCoords(1, orbit.phi, orbit.theta).negate();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();
        orbit.target.addScaledVector(right, -dx * panScale).addScaledVector(up, dy * panScale);
        // 限制平移范围，防止把模型弄丢
        orbit.target.clampScalar(-orbit.radius * 0.8, orbit.radius * 0.8);
      } else {
        orbit.theta -= dx * 0.008;
        orbit.phi = clamp(orbit.phi - dy * 0.006, 0.22, Math.PI - 0.22);
      }
      lx = e.clientX; ly = e.clientY;
      autoRotate = false;
      container.querySelector('#btn-rotate')?.classList.remove('primary');
    });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      orbit.radius = clamp(orbit.radius * (1 + Math.sign(e.deltaY) * 0.08), 130, 760);
    }, { passive: false });

    function resize() {
      const w = stageBody.clientWidth, h = stageBody.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(stageBody);
    resize();

    let raf = 0, t = 0;
    function loop() {
      raf = requestAnimationFrame(loop);
      if (autoRotate) orbit.theta += 0.0035;
      // 拆解动画
      explodeVal += (explodeTarget - explodeVal) * 0.09;
      const ex = explodeVal;
      // 镜头运镜
      if (camAnim) {
        const a = camAnim;
        orbit.theta += (a.theta - orbit.theta) * 0.075;
        orbit.phi += (a.phi - orbit.phi) * 0.075;
        orbit.radius += (a.radius - orbit.radius) * 0.075;
        if (Math.abs(a.theta - orbit.theta) < 0.002 && Math.abs(a.phi - orbit.phi) < 0.002 && Math.abs(a.radius - orbit.radius) < 0.6) {
          camAnim = null;
        }
      }
      applyExplode(ex, group);
      const sph = new THREE.Spherical(orbit.radius, orbit.phi, orbit.theta);
      camera.position.setFromSpherical(sph).add(orbit.target);
      camera.lookAt(orbit.target);
      renderer.render(scene, camera);
      t++;
    }
    loop();

    three = { renderer, scene, camera, group, orbit, resize, destroy() {
      cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); renderer.domElement.remove();
    } };
    container.__dz3d = three; // 测试/自动化句柄
  }

  // 按 explode 值把各层沿 Z 轴分开，并让标注淡入
  function applyExplode(ex, g) {
    for (const c of g.children) {
      const ud = c.userData;
      if (ud.explodeZ !== undefined) c.position.z = ud.baseZ + ud.explodeZ * ex;
    }
    const legend = container.querySelector('#dz-legend');
    if (legend) {
      const on = ex > 0.25;
      if (legend.classList.contains('on') !== on) legend.classList.toggle('on', on);
    }
  }

  function makeTag(text, color = '#9fd6ff') {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(8,13,20,.78)';
    const r = 12;
    ctx.beginPath();
    ctx.moveTo(r, 4); ctx.lineTo(256 - r, 4); ctx.quadraticCurveTo(252, 4, 252, 4 + r);
    ctx.lineTo(252, 60 - r); ctx.quadraticCurveTo(252, 60, 252 - r, 60);
    ctx.lineTo(r, 60); ctx.quadraticCurveTo(4, 60, 4, 60 - r);
    ctx.lineTo(4, 4 + r); ctx.quadraticCurveTo(4, 4, r, 4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '600 28px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 33);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
    sp.scale.set(26, 6.5, 1);
    sp.userData.tag = true;
    return sp;
  }

  // 闪光灯材质（惰性单例）：暖白 LED + 自发光
  function flashMaterial() {
    if (!flashMaterial.m) {
      flashMaterial.m = new THREE.MeshStandardMaterial({
        color: 0xfff6dc, emissive: 0xfff2c0, emissiveIntensity: 0.55, roughness: 0.3,
      });
    }
    return flashMaterial.m;
  }
  // 闪光灯网格：round 圆形 / rounded 圆角矩形（w×l）/ slot 槽形（w×l 全圆角）/ ring 环形（外径 r，环径比例固定）。
  // 全部朝 -Z 凸出 0.3mm（环形半埋），原点=背贴面，由调用方定位
  function makeFlashMesh(fl) {
    const style = fl.style || 'round';
    const fr = Math.max(1.0, fl.r || 1.5);
    const fw = Math.max(2, fl.w || 4);
    const flLen = Math.max(2, fl.l || 6);
    let geo;
    if (style === 'ring') {
      geo = new THREE.TorusGeometry(fr, fr * 0.22, 10, 28);
      geo.translate(0, 0, -0.05);
    } else if (style === 'rounded' || style === 'slot') {
      const rr = style === 'slot' ? Math.min(fw, flLen) / 2 : Math.min(fw, flLen) / 2 * 0.5;
      geo = new THREE.ExtrudeGeometry(roundedShape(fw, flLen, rr), { depth: 0.3, bevelEnabled: false, curveSegments: 12 });
      geo.translate(0, 0, -0.3);
    } else {
      geo = new THREE.CylinderGeometry(fr, fr, 0.3, 18);
      geo.rotateX(Math.PI / 2);
      geo.translate(0, 0, -0.3);
    }
    const m = new THREE.Mesh(geo, flashMaterial());
    m.userData.part = 'camera';
    return m;
  }

  function buildPhone() {
    if (!three) return;
    const g = three.group;
    while (g.children.length) {
      const c = g.children.pop();
      c.geometry?.dispose();
      if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => { m.map?.dispose(); m.dispose(); });
    }
    const d = model.design;
    const b = d.body;
    const W = b.width, L = b.length, T = b.thickness;
    // 折叠形态：两半机身绕铰链半开渲染（横向折叠/竖向翻折）
    if (b.fold !== 'none') {
      buildFoldedPhone(g, d, b);
      return;
    }
    const matFrame = MATERIALS.find((m) => m.id === b.frame) || MATERIALS[0];
    const matBack = MATERIALS.find((m) => m.id === b.back) || MATERIALS[0];
    const rough = b.finish === 'gloss' ? 0.12 : b.finish === 'matte' ? 0.52 : 0.34;
    const color = new THREE.Color(partColor('frame'));
    const backColor = new THREE.Color(partColor('back'));
    const coverColor = new THREE.Color(partColor('cover'));

    // 机身
    const shape = roundedShape(W, L, b.corner);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: T, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5,
      bevelSegments: 3, curveSegments: 8, steps: 1,
    });
    geo.translate(0, 0, -T / 2);
    const FACE = T / 2 + 0.58; // 挤出倒角后的真实前后面
    const frameMat = new THREE.MeshStandardMaterial({
      color, metalness: matFrame.id === 'plastic' ? 0.05 : 0.92,
      roughness: matFrame.id === 'ceramic' ? 0.28 : rough,
    });
    const bodyMesh = new THREE.Mesh(geo, frameMat);
    bodyMesh.userData.part = 'body';
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    g.add(bodyMesh);

    // 屏幕
    const scr = screenSize(d);
    const sw = Math.min(scr.w, W - 1), sh = Math.min(scr.h, L - 1);
    const screenShape = roundedShape(sw, sh, Math.max(0.8, screenCornerMm(d)));
    const screenGeo = new THREE.ShapeGeometry(screenShape, 12);
    normalizeUV(screenGeo);
    const screenTex = makeWallpaper();
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x0a0f16, metalness: 0.2, roughness: 0.08,
      emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 1.05, map: screenTex,
    });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.userData.part = 'screen';
    screen.position.z = FACE + 0.08;
    g.add(screen);

    // 正面盖板（屏幕四周的边框区域，颜色 = 盖板配色，默认黑）
    const plateW = Math.min(sw + 2 * d.screen.bezel + 0.6, W - 0.8);
    const plateH = Math.min(sh + 2 * d.screen.bezel + 0.6, L - 0.8);
    const plate = new THREE.Mesh(new THREE.ShapeGeometry(roundedShape(plateW, plateH, Math.max(0.8, b.corner * 0.75)), 12),
      new THREE.MeshStandardMaterial({ color: coverColor, metalness: 0.25, roughness: 0.18 }));
    plate.userData.part = 'cover';
    plate.position.z = FACE + 0.03;
    g.add(plate);

    // 玻璃反光层
    const glass = new THREE.Mesh(screenGeo.clone(), new THREE.MeshStandardMaterial({
      color: 0xffffff, metalness: 0.1, roughness: 0.02, transparent: true, opacity: 0.14,
    }));
    glass.userData.part = 'glass';
    glass.position.z = FACE + 0.16;
    g.add(glass);

    // 开孔（屏下摄像头时单孔隐藏于屏幕下）
    if (d.screen.notch === 'punch' && !d.parts.extras.includes('x_udc')) {
      const holeFrac = (d.screen.holeX ?? (b.fold !== 'none' ? 25 : 0)) / 100;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      hole.userData.part = 'screen';
      hole.position.set(sw * holeFrac, sh / 2 - 4, FACE + 0.19);
      g.add(hole);
    } else if (d.screen.notch === 'notch') {
      const notch = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(sw * 0.34, 18), 4.4), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      notch.userData.part = 'screen';
      notch.position.set(0, sh / 2 - 2.2, FACE + 0.19);
      g.add(notch);
    }

    // 后盖质感层
    const backShape = roundedShape(W - 1.2, L - 1.2, Math.max(1, b.corner * 0.9));
    const backMesh = new THREE.Mesh(new THREE.ShapeGeometry(backShape, 12), new THREE.MeshStandardMaterial({
      color: backColor.clone().multiplyScalar(1.35).offsetHSL(0, 0, 0.04),
      metalness: matBack.id === 'glass' ? 0.18 : matBack.id === 'ceramic' ? 0.08 : 0.55,
      roughness: b.finish === 'gloss' ? 0.14 : 0.46,
    }));
    backMesh.userData.part = 'back';
    backMesh.rotation.y = Math.PI;
    backMesh.position.z = -FACE;
    g.add(backMesh);

    // 摄像头模组（deco 形状 + 逐镜渲染 + 闪光灯位置可调）
    ensureLenses(d);
    if (d.camera.lenses.length > 0) {
      const rect = cameraModuleRect(d);
      const mw = rect.w, mh = rect.h;
      const stepOn = !!d.camera.step;
      // 凸台语义：step 开 → 凸起 d.camera.bump；关 → 模组齐平嵌入背盖（bump=0 不再有残留突起）
      const bump = stepOn ? Math.max(d.camera.bump, 0.5) : 0;
      // deco 形状：circle 全圆 / pill 胶囊 / rounded 用户圆角 / square 小圆角
      const decoR = rect.shape === 'circle' ? mw / 2 : rect.shape === 'pill' ? mh / 2 : rect.shape === 'square' ? Math.min(2.2, mh / 2) : Math.min(rect.radius ?? 8, mw / 2, mh / 2);
      const modShape = roundedShape(mw, mh, decoR);
      const modMat = new THREE.MeshStandardMaterial({ color: 0x1b2027, metalness: 0.55, roughness: 0.3 });
      let modTopZ; // 模组前表面 z（负向越靠外）
      if (stepOn) {
        const modGeo = new THREE.ExtrudeGeometry(modShape, {
          depth: bump, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3,
          bevelSegments: 2, curveSegments: 10, steps: 1,
        });
        modGeo.translate(0, 0, -bump); // 挤出向 -z（背面方向）
        const mod = new THREE.Mesh(modGeo, modMat);
        mod.userData.part = 'camera';
        mod.position.set(rect.cx, rect.cy, -FACE);
        mod.castShadow = true;
        g.add(mod);
        modTopZ = -FACE - bump - 0.3;
      } else {
        // 无凸台：不渲染 deco 装饰板，镜头直接装在后壳上
        modTopZ = -FACE;
      }

      // 逐镜渲染：精细镜组（金属环 + 阶梯镜身 + 镀膜镜片 + 瞳孔 + 高光），分焦段外观差异，大小可调
      for (let i = 0; i < d.camera.lenses.length; i++) {
        const l = d.camera.lenses[i];
        let sn = sensorById(l.sensor);
        if (l.sensor === 'sn_own') sn = d.parts.ownCmr;
        const look = LENS_LOOK[l.type] || LENS_LOOK.main;
        const lensR = lensRadiusMm(sn ? sn.format : '1/2.4″') * (l.size || 1);
        const lx = rect.cx + l.x, ly = rect.cy + l.y;
        const zBase = modTopZ; // 模组表面（无凸台时=后壳表面）
        // 潜望长焦：浅凸台 + 镜组贴装在凸台面上——外部凸出量与普通镜头接近（真实潜望
        // 结构在机身内部折转光路）；凸台厚度 camera.periT 与方向 periDir 用户可调
        let periShift = 0;
        if (look.plate !== null) {
          const pd = Math.max(0.35, d.camera.periT ?? 0.6);
          const horiz = (d.camera.periDir ?? 'v') === 'h';
          const bw = horiz ? lensR * 3.4 : lensR * 2.35;
          const bh = horiz ? lensR * 2.35 : lensR * 3.4;
          const boxGeo = new THREE.ExtrudeGeometry(roundedShape(bw, bh, lensR * 0.6), {
            depth: pd, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.18, bevelSegments: 2, curveSegments: 8,
          });
          boxGeo.translate(0, 0, -pd);
          const box = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x10151c, metalness: 0.5, roughness: 0.42 }));
          box.userData.part = 'camera';
          box.position.set(horiz ? lx + lensR * 0.35 : lx, horiz ? ly : ly - lensR * 0.35, zBase + 0.02);
          box.castShadow = true;
          g.add(box);
          periShift = pd + 0.08; // 镜组贴装在凸台外表面，金属圈半嵌进台面
        }
        const zL = zBase - periShift;
        // 金属装饰圈：主摄/潜望亮银、长焦近黑（粗糙度更高）
        const ringMat2 = new THREE.MeshStandardMaterial({ color: look.ring, metalness: 1, roughness: l.type === 'tele' ? 0.42 : 0.2 });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(lensR * 0.96, Math.max(0.32, lensR * 0.13), 10, 28), ringMat2);
        ring.userData.part = 'camera';
        ring.position.set(lx, ly, zL - 0.06);
        g.add(ring);
        // 镜身（标准圆柱上下等径；openEnded——端盖会挡住玻璃，且镜口本该是空的）
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(lensR * 0.98, lensR * 0.98, bump + 1.5, 26, 1, true),
          new THREE.MeshStandardMaterial({ color: look.barrel, metalness: 0.55, roughness: 0.32 }));
        barrel.userData.part = 'camera';
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(lx, ly, zL - bump / 2 - 0.35);
        g.add(barrel);
        // 内圈：OIS 亮绿圈 / 普通暗圈（浮在玻璃面外 0.02mm，作镀膜刻环）
        const innerRing = new THREE.Mesh(new THREE.TorusGeometry(lensR * 0.68, Math.max(0.06, lensR * 0.045), 8, 22),
          new THREE.MeshStandardMaterial({
            color: l.ois ? 0x7de3b0 : look.inner, metalness: l.ois ? 0.6 : 0.9, roughness: 0.3,
            emissive: l.ois ? 0x1d4a35 : 0x000000, emissiveIntensity: l.ois ? 0.5 : 0,
          }));
        innerRing.userData.part = 'camera';
        innerRing.rotation.y = Math.PI;
        innerRing.position.set(lx, ly, zL - bump - 1.04);
        g.add(innerRing);
        // 最外层玻璃：程序化法线贴图（同心元件棱 + 弧面）+ roughnessMap + clearcoat，
        // 层次感与自然高光来自环境反射，不再用白球假高光（瞳孔已烘进颜色图）
        const glass = new THREE.Mesh(new THREE.CircleGeometry(lensR * 0.94, 28), lensGlassMaterial(look));
        glass.userData.part = 'camera';
        glass.rotation.y = Math.PI;
        glass.position.set(lx, ly, zL - bump - 1.02);
        g.add(glass);
      }

      // 闪光灯（必备）：4 样式（圆/圆角矩形/槽形/环形），位置与大小可调；offDeco 时放 deco 外侧
      const fl = d.camera.flash || { x: 0, y: 0, r: 1.5 };
      const flStyle = fl.style || 'round';
      const fr = Math.max(1.0, fl.r || 1.5);
      const flHalfW = (flStyle === 'rounded' || flStyle === 'slot') ? Math.max(2, fl.w || 4) / 2 : fr;
      let flashPos;
      if (fl.offDeco) {
        const fx = rect.cx + mw / 2 + 2.6;
        flashPos = fx + flHalfW < b.width / 2 - 1 ? [fx, rect.cy - mh * 0.18] : [rect.cx - flHalfW - 0.5, rect.cy - mh / 2 - 2.4];
      } else {
        flashPos = [rect.cx + clamp(fl.x, -mw / 2, mw / 2), rect.cy + clamp(fl.y, -mh / 2, mh / 2)];
      }
      const flash = makeFlashMesh(fl);
      // deco 内的闪光灯必须贴在凸台表面（deco 板凸出至 modTopZ，贴 -FACE 会被板埋住）
      flash.position.set(flashPos[0], flashPos[1], stepOn ? modTopZ - 0.02 : -FACE);
      g.add(flash);
      if (flStyle === 'round') { // 圆形保留装饰圈；矩形/槽形/环形自身即造型
        const flashRing = new THREE.Mesh(new THREE.TorusGeometry(fr + 0.1, 0.22, 6, 18), new THREE.MeshStandardMaterial({ color: 0xaebccd, metalness: 1, roughness: 0.22 }));
        flashRing.userData.part = 'camera';
        flashRing.position.set(flashPos[0], flashPos[1], stepOn ? modTopZ - 0.07 : -FACE - 0.05);
        g.add(flashRing);
      }
    }

    // 侧键（按 body.buttons 样式；圆角矩形键身，纵向位置可调；
    // strip 槽型 / hidden 压感不渲染凸起）
    const btnMat = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.7), metalness: 0.85, roughness: 0.35 });
    const btnStyle = b.buttons || 'classic';
    if (d.screen.notch === 'popup') {
      const module = new THREE.Mesh(new THREE.BoxGeometry(9, 3.2, 3.4),
        new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.9), metalness: 0.6, roughness: 0.35 }));
      module.position.set(0, L / 2 + 1.4, T * 0.18);
      module.castShadow = true;
      g.add(module);
      const lensDot = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.5, 14),
        new THREE.MeshStandardMaterial({ color: 0x0a0f14, metalness: 0.5, roughness: 0.2 }));
      lensDot.rotation.x = Math.PI / 2;
      lensDot.position.set(0, L / 2 + 1.4, T * 0.18 + 1.8);
      g.add(lensDot);
    }
    const volY = b.btnVolY || 0, powY = b.btnPowY || 0;
    // 圆角矩形键身：截面(厚×长)圆角矩形沿 X 挤出
    const mkBtn = (sideSign, yPos, hLen) => {
      const th = T * 0.42;
      const geo = new THREE.ExtrudeGeometry(roundedShape(th, hLen, Math.min(th, hLen) * 0.32), {
        depth: 0.65, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 6,
      });
      geo.rotateY(Math.PI / 2); // 长 Y / 厚 Z / 凸出 X
      geo.translate(-0.325, 0, 0);
      const bm = new THREE.Mesh(geo, btnMat);
      bm.userData.part = 'button';
      bm.position.set(sideSign * (W / 2 + 0.42), yPos, 0);
      g.add(bm);
    };
    // 槽型键（strip）：内凹深色胶囊槽。注意挤出体经 rotateY 后占据 x∈[0,0.5]，
    // 必须镜像并定位到边框表面外侧（W/2+0.42 起），嵌入表面会被 0.5mm 倒角完全吞掉
    const mkSlot = (sideSign, yPos, hLen) => {
      const th = Math.max(1.2, T * 0.3);
      const geo = new THREE.ExtrudeGeometry(roundedShape(th, hLen, Math.min(th, hLen) * 0.48), {
        depth: 0.5, bevelEnabled: false, curveSegments: 8,
      });
      geo.rotateY(Math.PI / 2);
      if (sideSign < 0) geo.rotateY(Math.PI); // 左侧：翻转让槽片朝 -X 凸出
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x0a0f15, roughness: 0.7, metalness: 0.2 }));
      m.userData.part = 'button';
      m.position.set(sideSign * (W / 2 + 0.42), yPos, 0);
      g.add(m);
    };
    const R = 1, Lft = -1; // 右侧 / 左侧
    if (btnStyle !== 'hidden') {
    if (btnStyle === 'strip') {
      mkSlot(Lft, L * 0.12 + volY, L * 0.16);   // 细长条：音量槽
      mkSlot(R, -L * 0.02 + powY, L * 0.06);    // 电源键（同为槽型）
    } else if (btnStyle === 'split') {
      mkBtn(Lft, L * 0.22 + volY, L * 0.07);   // 音量加（分离）
      mkBtn(Lft, L * 0.10 + volY, L * 0.07);   // 音量减（分离）
      mkBtn(R, L * 0.14 + powY, L * 0.08);     // 电源
    } else if (btnStyle === 'opposite') {
      mkBtn(Lft, L * 0.16 + volY, L * 0.14);   // 音量一体（异侧）
      mkBtn(R, L * 0.14 + powY, L * 0.08);     // 电源（另一侧）
    } else {
      // classic：左音量双键 + 右电源（与 2D 视图一致）
      mkBtn(Lft, L * 0.20 + volY, L * 0.10);
      mkBtn(Lft, L * 0.06 + volY, L * 0.12);
      mkBtn(R, L * 0.14 + powY, L * 0.08);
    }
    }

    // 顶 / 底开孔（扬声器孔、麦克风孔、充电口）：标准 mm 尺寸 + 横向位置可调
    const ports = b.ports || { dualSpeaker: false, topMic: false, charge: 'typec' };
    // 孔洞本体深色 + 内衬微亮描边，保证在暗色机身上也能看清
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.75, metalness: 0.2 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x2c3d52, roughness: 0.35, metalness: 0.75, emissive: 0x18222e, emissiveIntensity: 0.5 });
    // 开孔：不在机身上真挖洞（无 CSG），把深色孔口做成 0.1mm 薄片贴在顶/底面外壁。
    // 关键：机身挤出带 0.5mm 倒角（bevelSize），顶/底/侧壁真实外表面在 L/2+0.5——
    // 按 L/2 定位会整片埋进倒角层（看不见），按 L/2+1 以上定位又凸出如图钉
    const EDGE = 0.5; // 与机身挤出 bevelSize 一致
    const dot = (xPos, sign) => { // 圆孔（直径 1.3mm）
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.1, 12), holeMat);
      m.userData.part = 'port';
      m.position.set(xPos, sign * (L / 2 + EDGE + 0.05), 0);
      g.add(m);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.12, 8, 16), rimMat);
      ring.rotation.x = Math.PI / 2;
      ring.userData.part = 'port';
      ring.position.set(xPos, sign * (L / 2 + EDGE), 0);
      g.add(ring);
    };
    const slotHole = (xPos, sign, w, h, cap = 0.1) => { // 槽形孔：胶囊薄片贴外壁
      const shp = new THREE.Shape();
      const hw = Math.max(1.2, w / 2), hh = Math.max(0.5, h / 2);
      shp.absarc(hw - hh, 0, hh, -Math.PI / 2, Math.PI / 2, false);
      shp.absarc(-hw + hh, 0, hh, Math.PI / 2, Math.PI * 1.5, false);
      shp.closePath();
      const geo = new THREE.ExtrudeGeometry(shp, { depth: cap, bevelEnabled: false, curveSegments: 12 });
      geo.rotateX(-Math.PI / 2); // 挤出朝 +Y
      if (sign === 1) geo.rotateX(Math.PI); // 顶面：翻转到 -Y 朝外贴
      const m = new THREE.Mesh(geo, holeMat);
      m.userData.part = 'port';
      m.position.set(xPos, sign * (L / 2 + EDGE + cap), 0);
      g.add(m);
    };
    const spRow = speakerRowSpec(ports.speakerStyle);
    // 底部麦克风可升级为扬声器同款样式；quadSpeaker = 底/顶各一对（镜像位置）
    const micRow = ports.micStyle && ports.micStyle !== 'hole' ? speakerRowSpec(ports.micStyle) : null;
    const rowSpec = (sign, cxmm, spec) => {
      const s = spec || spRow;
      if (s.kind === 'slot') {
        const pitch = s.w + s.gap;
        for (let i = 0; i < s.n; i++) slotHole(cxmm + (i - (s.n - 1) / 2) * pitch, sign, s.w, s.h);
      } else {
        for (let i = 0; i < s.n; i++) dot(cxmm + (i - (s.n - 1) / 2) * s.gap, sign);
      }
    };
    rowSpec(-1, ports.speakerX ?? W * 0.28);            // 底部扬声器（默认右侧）
    if (ports.quadSpeaker) rowSpec(-1, -(ports.speakerX ?? W * 0.28)); // 4 扬声器：底部第二只
    rowSpec(-1, ports.micX ?? -W * 0.2, micRow);        // 底部麦克风（默认左侧小孔）
    // 充电口：Type-C 开口 8.34×2.56 / Micro-B 6.85×1.8 / 自定义形状（style+w+h 可编辑），横向位置可调
    const cs = ports.chargeShape || { style: 'round', w: 6, h: 3 };
    const chargeX = ports.chargePos || 0;
    if (ports.charge === 'typec') {
      slotHole(chargeX, -1, 8.34, Math.min(2.56, T * 0.7));
    } else if (ports.charge === 'micro') {
      const mh = Math.min(1.8, T * 0.7);
      const m = new THREE.Mesh(new THREE.BoxGeometry(6.85, 0.1, mh), holeMat);
      m.userData.part = 'port';
      m.position.set(chargeX, -(L / 2 + EDGE + 0.05), 0); // 薄片贴底面外壁
      g.add(m);
    } else {
      // 自定义：2D 截面（XZ 平面）拉伸，薄片贴底面
      const cw = Math.max(2.4, Math.min(W * 0.6, cs.w || 6));
      const ch = Math.max(1.4, Math.min(T * 0.7, cs.h || 3));
      if (cs.style === 'capsule' || cs.style === 'round') {
        slotHole(chargeX, -1, cw, cs.style === 'round' ? Math.min(cw, ch) : ch);
      } else {
        const shp = new THREE.Shape();
        const hx = cw / 2, hz = ch / 2;
        if (cs.style === 'square') {
          shp.moveTo(-hx, -hz); shp.lineTo(hx, -hz); shp.lineTo(hx, hz); shp.lineTo(-hx, hz); shp.closePath();
        } else { // trap 梯形口
          shp.moveTo(-hx, -hz); shp.lineTo(hx, -hz);
          shp.lineTo(hx - ch * 0.6, hz); shp.lineTo(-hx + ch * 0.6, hz); shp.closePath();
        }
        const geo = new THREE.ExtrudeGeometry(shp, { depth: 0.1, bevelEnabled: false, curveSegments: 20 });
        geo.rotateX(-Math.PI / 2); // 截面平躺到 XZ 平面
        const m = new THREE.Mesh(geo, holeMat);
        m.userData.part = 'port';
        m.position.set(chargeX, -(L / 2 + EDGE + 0.1), 0);
        g.add(m);
      }
    }
    if (ports.dualSpeaker) rowSpec(1, ports.topSpeakerX ?? W * 0.28);        // 双扬声器：顶部
    if (ports.quadSpeaker) rowSpec(1, -(ports.topSpeakerX ?? W * 0.28));     // 4 扬声器：顶部第二只
    if (ports.topMic) dot(ports.topMicX ?? -W * 0.2, 1);                     // 顶部麦克风（保持小孔）

    // 背部智窗：深色玻璃面板 + 息屏时间纹理
    if (d.backWindow?.on) {
      const bw = d.backWindow;
      const ww = (bw.inch || 1.8) * 11, wh = (bw.inch || 1.8) * 8;
      const wc = document.createElement('canvas');
      wc.width = 256; wc.height = 192;
      const wcctx = wc.getContext('2d');
      wcctx.fillStyle = '#0a0f14'; wcctx.fillRect(0, 0, 256, 192);
      wcctx.fillStyle = 'rgba(235,240,246,.9)';
      wcctx.font = '600 52px sans-serif'; wcctx.textAlign = 'center';
      wcctx.fillText('12:38', 128, 92);
      wcctx.font = '500 26px sans-serif'; wcctx.fillStyle = 'rgba(235,240,246,.55)';
      wcctx.fillText('86%', 128, 138);
      const wtex = new THREE.CanvasTexture(wc);
      wtex.colorSpace = THREE.SRGBColorSpace;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshStandardMaterial({
        map: wtex, emissive: 0xffffff, emissiveMap: wtex, emissiveIntensity: 0.35,
        metalness: 0.2, roughness: 0.15,
      }));
      win.userData.part = 'screen';
      win.rotation.y = Math.PI;
      win.position.set(bw.cx || 0, bw.cy || 0, -FACE - 0.1);
      g.add(win);
    }

    // 背标：公司 Logo 图像 + 品牌文字（位置/大小按 branding，mm）
    ensureBranding(d);
    const BACKZ = -FACE - 0.08; // 贴在后盖表面外侧，避免 Z 冲突
    if (d.logoOnBack) {
      const br = d.branding;
      const finish = br.logoFinish || 'img';
      // 材质参数：金属高反射 / 玻璃近镜面 / 塑料哑光
      const matByFinish = {
        img: { metalness: 0.45, roughness: 0.3 },
        metal: { metalness: 1.0, roughness: 0.26 },
        glass: { metalness: 0.15, roughness: 0.07 },
        plastic: { metalness: 0.05, roughness: 0.55 },
      }[finish] || { metalness: 0.45, roughness: 0.3 };
      const lc = makeLogoCanvas();
      const logoMesh = lc
        ? new THREE.Mesh(new THREE.PlaneGeometry(br.logoSize, br.logoSize), (() => {
            const tex = new THREE.CanvasTexture(lc);
            tex.colorSpace = THREE.SRGBColorSpace;
            return new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.02, ...matByFinish });
          })())
        : new THREE.Mesh(new THREE.PlaneGeometry(br.logoSize, br.logoSize), new THREE.MeshStandardMaterial({
            color: br.logoColor || state.company.logoColor || '#4aa3ff', ...matByFinish,
          }));
      logoMesh.userData.part = 'logo';
      logoMesh.rotation.y = Math.PI;
      logoMesh.position.set(br.logoX, br.logoY, BACKZ);
      g.add(logoMesh);
    }
    if (d.brandText) {
      const br = d.branding;
      const txt = (br.text === null || br.text === undefined || br.text === '') ? (state.company.nameEn || state.company.name || '') : br.text;
      if (txt) {
        const tc = document.createElement('canvas');
        tc.width = 256; tc.height = 64;
        const tctx = tc.getContext('2d');
        tctx.fillStyle = 'rgba(235,240,246,.92)';
        tctx.font = '600 44px -apple-system, "Segoe UI", sans-serif';
        tctx.textAlign = 'center'; tctx.textBaseline = 'middle';
        const tw = tctx.measureText(txt).width;
        if (tw > 240) tctx.font = `600 ${Math.floor(44 * 240 / tw)}px -apple-system, "Segoe UI", sans-serif`;
        tctx.fillText(txt, 128, 34);
        const ttex = new THREE.CanvasTexture(tc);
        ttex.colorSpace = THREE.SRGBColorSpace;
        const th = br.textSize, tw2 = th * 4;
        const txtMesh = new THREE.Mesh(new THREE.PlaneGeometry(tw2, th), new THREE.MeshBasicMaterial({ map: ttex, transparent: true, opacity: 0.9 }));
        txtMesh.userData.part = 'logo';
        txtMesh.rotation.y = Math.PI;
        txtMesh.position.set(br.textX, br.textY, BACKZ);
        g.add(txtMesh);
      }
    }

    // ---------- 拆解视图：内部结构 ----------
    const hw = Math.max(1.2, T * 0.34);
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(W * 0.66, L * 0.36, hw),
      new THREE.MeshStandardMaterial({ color: 0x1b4b34, roughness: 0.72, metalness: 0.22 }));
    pcb.position.set(0, L * 0.28, 0);
    pcb.userData.part = 'mainboard';
    g.add(pcb);
    const chipset = new THREE.Mesh(new THREE.BoxGeometry(W * 0.22, W * 0.22, Math.max(1.2, T * 0.22)),
      new THREE.MeshStandardMaterial({ color: 0x14191f, roughness: 0.4, metalness: 0.65 }));
    chipset.position.set(0, L * 0.33, T * 0.09);
    chipset.userData.part = 'mainboard';
    g.add(chipset);
    const bat = new THREE.Mesh(new THREE.BoxGeometry(W * 0.74, L * 0.34, Math.max(1.6, T * 0.52)),
      new THREE.MeshStandardMaterial({ color: 0x2b3341, roughness: 0.6, metalness: 0.32 }));
    bat.position.set(0, -L * 0.23, 0);
    bat.userData.part = 'battery';
    g.add(bat);
    const spk = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(W * 0.09, 5), Math.min(W * 0.09, 5), Math.max(0.8, T * 0.3), 18),
      new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.45, metalness: 0.7 }));
    spk.rotation.x = Math.PI / 2;
    spk.position.set(W * 0.2, -L * 0.44, 0);
    spk.userData.part = 'speaker';
    g.add(spk);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 2.6, 14),
      new THREE.MeshStandardMaterial({ color: 0x8b949f, roughness: 0.32, metalness: 0.9 }));
    motor.rotation.z = Math.PI / 2;
    motor.position.set(-W * 0.25, -L * 0.44, 0);
    motor.userData.part = 'motor';
    g.add(motor);
    const flex = new THREE.Mesh(new THREE.BoxGeometry(W * 0.28, 1.3, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xc08a2e, roughness: 0.62, metalness: 0.35 }));
    flex.position.set(0, L * 0.06, 0);
    flex.userData.part = 'flex';
    g.add(flex);

    // ---------- 分层偏移 ----------
    // 分层间距按机身长度取值，保证拆解后层次清晰可读
    const EXPLODE = {
      glass: L * 0.44, cover: L * 0.38, screen: L * 0.33,
      body: 0, button: 0, port: 0,
      mainboard: L * 0.15, speaker: L * 0.11, motor: L * 0.11, flex: L * 0.08,
      battery: -L * 0.12,
      back: -L * 0.44, logo: -L * 0.48,
      camera: -L * 0.60,
    };
    for (const c of g.children) {
      const part = c.userData.part;
      if (!part) continue;
      c.userData.explodeZ = EXPLODE[part] ?? 0;
      c.userData.baseZ = c.position.z;
    }

    // 首次构建时取景，之后保留用户视角
    if (!three.framed) {
      const fit = Math.max(L, W) * 1.55;
      three.orbit.radius = clamp(fit * 1.6, 150, 620);
      three.orbit.target.set(0, 0, 0);
      three.framed = true;
    }
  }

  // 折叠形态：两半机身绕铰链半开。横向折叠 = 铰链竖直（沿 Y），竖向翻折 = 铰链水平（沿 X）
  function buildFoldedPhone(g, d, b) {
    const W = b.width, L = b.length, T = b.thickness;
    const isFlip = b.fold === 'flip';
    // 语义：body 尺寸 = 折叠态单半（flip 的设计长度为半长，fold 的设计宽度为半宽）
    const halfW = W;                       // 每半宽度
    const halfL = L;                       // 每半长度
    const matFrame = MATERIALS.find((m) => m.id === b.frame) || MATERIALS[0];
    const matBack = MATERIALS.find((m) => m.id === b.back) || MATERIALS[0];
    const rough = b.finish === 'gloss' ? 0.12 : b.finish === 'matte' ? 0.52 : 0.34;
    const color = new THREE.Color(partColor('frame'));
    const backColor = new THREE.Color(partColor('back'));
    const coverColor = new THREE.Color(partColor('cover'));
    const scr = screenSize(d);
    // 展开态（180° 平铺）或折叠态（半B 翻折叠到半A 上，留 0.7mm 间隙防穿模）
    const folded = foldView === 'folded';

    function buildHalf(sign) {
      const grp = new THREE.Group();
      // 铰链侧两角为直角：展开时两半在中缝平齐，避免出现拼图状缺口
      // halfA(sign=1)：fold=右半（铰链在左）/ flip=上半（铰链在下）；halfB 相反
      const r0 = Math.min(b.corner, halfW / 3, halfL / 3);
      const radii = isFlip
        ? (sign > 0 ? [r0, r0, 0, 0] : [0, 0, r0, r0])
        : (sign > 0 ? [0, r0, r0, 0] : [r0, 0, 0, r0]);
      const shape = roundedShape(halfW, halfL, r0, radii);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: T, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5,
        bevelSegments: 3, curveSegments: 8, steps: 1,
      });
      geo.translate(0, 0, -T / 2);
      if (isFlip) geo.translate(0, sign * halfL / 2, 0);
      else geo.translate(sign * halfW / 2, 0, 0);
      const bodyMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color, metalness: matFrame.id === 'plastic' ? 0.05 : 0.92,
        roughness: matFrame.id === 'ceramic' ? 0.28 : rough,
      }));
      bodyMesh.userData.part = 'body';
      bodyMesh.castShadow = true;
      grp.add(bodyMesh);

      // 背盖（几何居中于原点，必须随半体平移到半区中心，否则折叠/展开都会偏出机身）
      // 注意：不能用 rotation.y=π 朝后——那会把圆角形状水平镜像（圆角跑到铰链侧，与机身圆角错位）；
      // 改用 DoubleSide 不旋转，形状方向与机身完全一致
      const backShape = roundedShape(halfW - 1.2, halfL - 1.2, Math.max(1, b.corner * 0.9), radii.map((v) => Math.max(0, v - 0.3)));
      const backMesh = new THREE.Mesh(new THREE.ShapeGeometry(backShape, 12), new THREE.MeshStandardMaterial({
        color: backColor.clone().multiplyScalar(1.35).offsetHSL(0, 0, 0.04),
        metalness: matBack.id === 'glass' ? 0.18 : 0.5, roughness: b.finish === 'gloss' ? 0.14 : 0.46,
        side: THREE.DoubleSide,
      }));
      backMesh.userData.part = 'back';
      backMesh.position.set(isFlip ? 0 : sign * halfW / 2, isFlip ? sign * halfL / 2 : 0, -(T / 2 + 0.58));
      grp.add(backMesh);
      return grp;
    }

    // 铰链侧对齐原点，绕铰链旋转；折叠态半B 翻转 180° 并沿法向抬升，与半A 留缝隙
    const halfA = buildHalf(1);   // 右半（fold）/ 上半（flip）
    const halfB = buildHalf(-1);  // 左半 / 下半
    if (folded) {
      if (isFlip) {
        halfB.rotation.x = Math.PI;          // 下半向上翻折，叠到上半上
      } else {
        halfB.rotation.y = Math.PI;          // 左半向右翻折，叠到右半上
      }
      halfB.position.z = T + 1.5;            // 抬到半A 正面上方：平面间隙 1.5mm，扣除两侧 0.5 倒角后侧视有 0.5mm 可见分层缝（与 2D 双层画法一致）；半B 背面朝外 = 折叠态正面
    } else if (isFlip) {
      halfA.rotation.x = 0;
      halfB.rotation.x = 0;
    }
    g.add(halfA);
    g.add(halfB);

    // 内屏：展开态一整块（跨两半，无折缝）；折叠态两半合拢，整片内屏隐藏
    if (!folded) {
      const fullW = isFlip ? Math.min(scr.w, halfW - 1) : Math.min(scr.w, halfW * 2 - 1.4);
      const fullH = isFlip ? Math.min(scr.h, halfL * 2 - 1.4) : Math.min(scr.h, halfL - 1);
      const sShape = roundedShape(fullW, fullH, Math.max(0.8, screenCornerMm(d)));
      const sGeo = new THREE.ShapeGeometry(sShape, 12);
      normalizeUV(sGeo);
      // 折叠机展开态用宽幅桌面贴图（与 2D 一致），普通机型用竖版壁纸
      const wallTex = b.fold ? makeWideWallTex(b.fold, scr.h / scr.w) : makeWallpaper();
      const screen = new THREE.Mesh(sGeo, new THREE.MeshStandardMaterial({
        color: 0x0a0f16, metalness: 0.2, roughness: 0.08,
        emissive: 0xffffff, emissiveMap: wallTex, emissiveIntensity: 1.0, map: wallTex,
      }));
      screen.userData.part = 'screen';
      screen.position.z = T / 2 + 0.58;
      g.add(screen);
    }

    // 外屏（cover screen）：贴在 halfB 背面（折叠时朝外）；尺寸/比例/位置可调，钳制到半区幅面
    const cvInch = b.coverScreen?.inch || 0;
    if (cvInch > 0) {
      const cvTex = makeWallpaper();
      const cvRatio = b.coverScreen?.ratio || (isFlip ? 1.05 : 1.42);
      const cvW = Math.min(cvInch * 25.4 / 2.15, halfW - 4);
      const cvH = Math.min(cvW * cvRatio, halfL - 4);
      const cvShape = roundedShape(cvW, cvH, Math.max(0.8, b.corner * 0.4));
      const cvGeo = new THREE.ShapeGeometry(cvShape, 12);
      normalizeUV(cvGeo);
      const cvMesh = new THREE.Mesh(cvGeo, new THREE.MeshStandardMaterial({
        color: 0x0a0f16, metalness: 0.2, roughness: 0.1,
        emissive: 0xffffff, emissiveMap: cvTex, emissiveIntensity: 0.85, map: cvTex,
      }));
      cvMesh.userData.part = 'screen';
      cvMesh.rotation.y = Math.PI;
      // 与背盖保持 0.14mm 间距（背盖在 -(T/2+0.58)）：太近会深度冲突被背盖吞掉（flip 展开背面外屏消失的根因）
      cvMesh.position.set(
        (isFlip ? 0 : -halfW / 2) + (b.coverScreen?.x || 0),
        (isFlip ? -halfL / 2 : 0) + (b.coverScreen?.y || 0),
        -(T / 2 + 0.72));
      halfB.add(cvMesh);
      if (b.coverScreen?.notch === 'punch') { // 外屏前置挖孔（3D 折叠态正面可见）
        const hf = (b.coverScreen?.holeX || 0) / 100;
        const cvHole = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        cvHole.userData.part = 'screen';
        cvHole.rotation.y = Math.PI;
        cvHole.position.set(
          (isFlip ? 0 : -halfW / 2) + (b.coverScreen?.x || 0) + cvW * hf,
          (isFlip ? -halfL / 2 : 0) + (b.coverScreen?.y || 0) + cvH / 2 - 2.2,
          -(T / 2 + 0.74));
        halfB.add(cvHole);
      }
    }

    // 铰链圆柱
    const hinge = new THREE.Mesh(
      isFlip ? new THREE.CylinderGeometry(1.5, 1.5, W * 0.94, 18) : new THREE.CylinderGeometry(1.5, 1.5, L * 0.94, 18),
      new THREE.MeshStandardMaterial({ color: 0x8a939e, metalness: 1, roughness: 0.25 }));
    hinge.userData.part = 'back';
    if (isFlip) hinge.rotation.z = Math.PI / 2; // 折线沿宽度方向（圆柱轴转到 X）
    if (folded) hinge.position.z = (T + 1.5) / 2; // 折叠叠层的厚度中点，否则铰链偏心
    g.add(hinge);

    // 摄像头模组（放右半/上半的背面，半体局部坐标）
    // fold 的半A 占 x∈[0,W]，模组坐标（以半体中心为原点）需平移 halfW/2；flip 已在 y 向映射
    ensureLenses(d);
    if (d.camera.lenses.length > 0) {
      const rect = cameraModuleRect(d);
      const cxOff = isFlip ? 0 : halfW / 2;
      const bump = d.camera.step ? Math.max(d.camera.bump, 0.5) : 0;
      // flip 时把模组位置映射到上半（半体局部坐标 y∈[0,halfL]）的背面并钳入边界
      const cy = isFlip
        ? clamp(halfL / 2 + rect.cy, rect.h / 2 + 2, halfL - rect.h / 2 - 2)
        : rect.cy;
      const decoR = rect.shape === 'circle' ? rect.w / 2 : rect.shape === 'pill' ? rect.h / 2 : Math.min(rect.radius ?? 8, rect.w / 2, rect.h / 2);
      const modShape = roundedShape(rect.w, rect.h, decoR);
      const modMat = new THREE.MeshStandardMaterial({ color: 0x1b2027, metalness: 0.55, roughness: 0.3 });
      const halfFace = T / 2 + 0.58;
      let modTopZ;
      if (d.camera.step) {
        const modGeo = new THREE.ExtrudeGeometry(modShape, { depth: bump, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 2, curveSegments: 10 });
        modGeo.translate(0, 0, -bump);
        const mod = new THREE.Mesh(modGeo, modMat);
        mod.userData.part = 'camera';
        mod.position.set(rect.cx + cxOff, cy, -halfFace);
        halfA.add(mod);
        modTopZ = -halfFace - bump - 0.3;
      } else {
        // 无凸台：不渲染 deco 装饰板，镜头直接装在后壳上
        modTopZ = -halfFace;
      }
      for (let i = 0; i < d.camera.lenses.length; i++) {
        const l = d.camera.lenses[i];
        let sn = sensorById(l.sensor);
        if (l.sensor === 'sn_own') sn = d.parts.ownCmr;
        const look = LENS_LOOK[l.type] || LENS_LOOK.main;
        const lensR = lensRadiusMm(sn ? sn.format : '1/2.4″') * (l.size || 1);
        const lx = rect.cx + cxOff + l.x, ly = cy + l.y;
        // 潜望：浅凸台 + 镜组贴装台面（与主机型一致），厚度/方向可调
        let periShift = 0;
        if (look.plate !== null) {
          const pd = Math.max(0.35, d.camera.periT ?? 0.6);
          const horiz = (d.camera.periDir ?? 'v') === 'h';
          const bw = horiz ? lensR * 3.4 : lensR * 2.35;
          const bh = horiz ? lensR * 2.35 : lensR * 3.4;
          const boxGeo = new THREE.ExtrudeGeometry(roundedShape(bw, bh, lensR * 0.6), {
            depth: pd, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.18, bevelSegments: 2, curveSegments: 8,
          });
          boxGeo.translate(0, 0, -pd);
          const box = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x10151c, metalness: 0.5, roughness: 0.42 }));
          box.userData.part = 'camera';
          box.position.set(horiz ? lx + lensR * 0.35 : lx, horiz ? ly : ly - lensR * 0.35, modTopZ + 0.02);
          box.castShadow = true;
          halfA.add(box);
          periShift = pd + 0.08;
        }
        const zL = modTopZ - periShift;
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(lensR * 0.96, Math.max(0.32, lensR * 0.13), 10, 28),
          new THREE.MeshStandardMaterial({ color: look.ring, metalness: 1, roughness: l.type === 'tele' ? 0.42 : 0.2 }));
        ring2.userData.part = 'camera';
        ring2.position.set(lx, ly, zL - 0.06);
        halfA.add(ring2);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(lensR * 0.98, lensR * 0.98, bump + 1.5, 26, 1, true),
          new THREE.MeshStandardMaterial({ color: look.barrel, metalness: 0.55, roughness: 0.32 }));
        lens.userData.part = 'camera';
        lens.rotation.x = Math.PI / 2;
        lens.position.set(lx, ly, zL - bump / 2 - 0.35);
        halfA.add(lens);
        const glassLens = new THREE.Mesh(new THREE.CircleGeometry(lensR * 0.94, 26), lensGlassMaterial(look));
        glassLens.userData.part = 'camera';
        glassLens.rotation.y = Math.PI;
        glassLens.position.set(lx, ly, zL - bump - 1.02);
        halfA.add(glassLens);
      }
      // 闪光灯（样式与主机型一致）
      const fl2 = d.camera.flash || { x: 0, y: 0, r: 1.5 };
      const flash = makeFlashMesh(fl2);
      const flashX = (fl2.offDeco ? rect.cx + rect.w / 2 + 2.6 : rect.cx + clamp(fl2.x, -rect.w / 2, rect.w / 2)) + cxOff;
      const flashY = fl2.offDeco ? cy - rect.h * 0.18 : cy + clamp(fl2.y, -rect.h / 2, rect.h / 2);
      flash.position.set(flashX, flashY, d.camera.step ? modTopZ - 0.02 : -halfFace);
      halfA.add(flash);
    }

    // 侧键（右半外缘，圆角矩形键身）
    const btnMat = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.7), metalness: 0.85, roughness: 0.35 });
    const fBtnGeo = new THREE.ExtrudeGeometry(roundedShape(T * 0.42, halfL * 0.14, T * 0.14), {
      depth: 0.65, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 6,
    });
    fBtnGeo.rotateY(Math.PI / 2);
    fBtnGeo.translate(-0.325, 0, 0);
    const b1 = new THREE.Mesh(fBtnGeo, btnMat);
    b1.userData.part = 'body';
    // 侧键装在半A外缘右侧：fold=右半（x∈[0,W]，键在 W+0.42）；flip=上半（x∈[-W/2,W/2]，键在 W/2+0.42）
    if (isFlip) b1.position.set(halfW / 2 + 0.42, halfL * 0.7, 0);
    else b1.position.set(halfW + 0.42, halfL * 0.18, 0);
    halfA.add(b1);

    // 取景
    if (!three.framed) {
      const span = folded ? (isFlip ? L : Math.max(L, W)) : (isFlip ? L * 2 : Math.max(L, W * 2.2));
      three.orbit.radius = clamp(span * 1.55 * 1.6, 150, 620);
      // 折叠态机身偏向半A 象限，取景中心略作偏移
      if (folded) three.orbit.target.set(isFlip ? 0 : W * 0.2, isFlip ? L * 0.2 : 0, 0);
      else three.orbit.target.set(0, 0, 0);
      three.framed = true;
    }
  }

  function normalizeUV(geo) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const dx = Math.max(bb.max.x - bb.min.x, 0.001);
    const dy = Math.max(bb.max.y - bb.min.y, 0.001);
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) - bb.min.x) / dx, (pos.getY(i) - bb.min.y) / dy);
    }
    uv.needsUpdate = true;
  }

  // 圆角矩形轮廓；radii = [左上, 右上, 右下, 左下]（缺省四角同 r），0 = 直角
  function roundedShape(w, h, r, radii) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    const R = radii || [r, r, r, r];
    const rr = (v) => Math.max(0, Math.min(v, w / 2, h / 2));
    const tl = rr(R[0]), tr = rr(R[1]), br = rr(R[2]), bl = rr(R[3]);
    s.moveTo(x + bl, y);
    s.lineTo(x + w - br, y);
    if (br > 0) s.quadraticCurveTo(x + w, y, x + w, y + br);
    s.lineTo(x + w, y + h - tr);
    if (tr > 0) s.quadraticCurveTo(x + w, y + h, x + w - tr, y + h);
    s.lineTo(x + tl, y + h);
    if (tl > 0) s.quadraticCurveTo(x, y + h, x, y + h - tl);
    s.lineTo(x, y + bl);
    if (bl > 0) s.quadraticCurveTo(x, y, x + bl, y);
    return s;
  }

  function makeWallpaper() {
    const Wc = 256, Hc = 512;
    const c = document.createElement('canvas');
    c.width = Wc; c.height = Hc;
    const ctx = c.getContext('2d');
    // 壁纸底色
    const g = ctx.createLinearGradient(0, 0, Wc, Hc);
    g.addColorStop(0, '#071426');
    g.addColorStop(0.35, '#123a63');
    g.addColorStop(0.62, '#4b3f8f');
    g.addColorStop(1, '#0a0e18');
    ctx.fillStyle = g; ctx.fillRect(0, 0, Wc, Hc);
    const rg = ctx.createRadialGradient(184, 168, 8, 184, 168, 210);
    rg.addColorStop(0, 'rgba(120,200,255,.5)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, Wc, Hc);

    // 状态栏
    ctx.fillStyle = 'rgba(255,255,255,.86)';
    ctx.font = '600 15px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('9:41', 16, 26);
    ctx.textAlign = 'right';
    ctx.fillText('5G', Wc - 44, 26);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + i * 0.16})`;
      ctx.fillRect(Wc - 36 + i * 4, 26 - (3 + i * 3), 3, 3 + i * 3);
    }
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.fillRect(Wc - 22, 16, 12, 8);

    // 图标网格
    const cols = 4, size = 40, gapX = (Wc - 32 - cols * size) / (cols - 1);
    const palette = ['#3a7bd5', '#e0533d', '#2fb37a', '#f2b134', '#8b5cf6', '#22a8c9', '#e8548a', '#5b6b7f',
      '#4aa3ff', '#37c9a5', '#ff9f4a', '#ff5d6c', '#a78bfa', '#f5c542', '#36c9c9', '#7d8ea3'];
    for (let r = 0; r < 4; r++) {
      for (let col = 0; col < cols; col++) {
        const x = 16 + col * (size + gapX);
        const y = 64 + r * (size + 20);
        const col0 = palette[(r * cols + col) % palette.length];
        const ig = ctx.createLinearGradient(x, y, x + size, y + size);
        ig.addColorStop(0, col0);
        ig.addColorStop(1, shade(col0, -34));
        ctx.fillStyle = ig;
        roundRect(ctx, x, y, size, size, 11);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.18)';
        ctx.lineWidth = 1;
        roundRect(ctx, x + 0.5, y + 0.5, size - 1, size - 1, 11);
        ctx.stroke();
      }
    }

    // 底部 dock
    const dy = Hc - 92;
    ctx.fillStyle = 'rgba(255,255,255,.13)';
    roundRect(ctx, 24, dy, Wc - 48, 64, 20);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      const x = 42 + i * ((Wc - 84 - 38) / 3);
      const ig = ctx.createLinearGradient(x, dy + 12, x + 38, dy + 50);
      ig.addColorStop(0, palette[(i * 3 + 5) % palette.length]);
      ig.addColorStop(1, shade(palette[(i * 3 + 5) % palette.length], -30));
      ctx.fillStyle = ig;
      roundRect(ctx, x, dy + 12, 38, 38, 11);
      ctx.fill();
    }

    // 桌面指示条
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    roundRect(ctx, Wc / 2 - 28, Hc - 14, 56, 4, 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  // 3D 折叠机内屏宽幅壁纸贴图：复用 2D 的 drawWideWallpaper，按屏幕纵横比重建画布
  function makeWideWallTex(fold, aspectHW) {
    const Wc = 1024, Hc = Math.max(256, Math.round(1024 * aspectHW));
    const c = document.createElement('canvas');
    c.width = Wc; c.height = Hc;
    drawWideWallpaper(c.getContext('2d'), 0, 0, Wc, Hc, 0, fold);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  // ---------- 交互 ----------
  function setPath(obj, path, value) {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
  }

  // 面板重渲染时保留滚动位置（否则点一下选项就跳回顶部）
  function renderControls() {
    const st = left.scrollTop;
    left.innerHTML = controls();
    left.scrollTop = st;
  }
  function renderAssessment() {
    const st = right.scrollTop;
    right.innerHTML = assessment();
    right.scrollTop = st;
  }

  function refresh(rebuildAll = true) {
    if (rebuildAll) {
      renderControls();
      renderAssessment();
    } else {
      renderAssessment();
    }
    syncFoldToggle();
    if (viewMode === '2d') draw2D();
    else { init3D(); buildPhone(); }
  }

  // 折叠视图切换按钮只在折叠机型显示（2D/3D 均可用：3D 切换展开/折叠模型）
  function syncFoldToggle() {
    const el = container.querySelector('#fold-toggle');
    if (el) el.style.display = model.design.body.fold !== 'none' ? 'flex' : 'none';
  }

  function syncSliderUI(key, val) {
    // 同步同一 data-k 的 range / number 输入与数值标签
    left.querySelectorAll(`[data-k="${CSS.escape(key)}"]`).forEach((el) => { el.value = val; });
    const out = left.querySelector(`[data-out="o_${CSS.escape(key)}"]`);
    if (out) {
      const unit = out.textContent.match(/[^\d.\-]+$/) || [''];
      out.textContent = val + unit[0];
    }
  }

  function applyValue(key, v, { fromInput } = {}) {
    const d = model.design;
    const prevFold = d.body.fold;
    if (key.startsWith('body.ports') && !d.body.ports) d.body.ports = { dualSpeaker: false, topMic: false, charge: 'typec' };
    if (key.startsWith('body.colors') && !d.body.colors) d.body.colors = { frame: d.body.color, back: d.body.color, cover: '#05070a' };
    if (key.startsWith('branding')) ensureBranding(d);
    if (key.startsWith('variants') && !Array.isArray(d.variants)) d.variants = [];
    setPath(d, key, v);
    // 换面板供应商时校验发光材料世代归属，失效则回退标准材料
    if (key === 'screen.panelVendor') {
      const pvObj = PANEL_VENDORS.find((x) => x.id === d.screen.panelVendor);
      if (!pvObj || !pvObj.gens || !pvObj.gens.some((g) => g.id === d.screen.panelGen)) d.screen.panelGen = '';
    }
    // 切换折叠结构：body 尺寸 = 折叠态单半语义下的机身重配
    // → flip：长度减半（展开总长 ≈ 原直板长度）；flip → 直板：长度恢复翻倍
    if (key === 'body.fold' && v !== prevFold) {
      if (v === 'flip') {
        d.body.length = Math.max(70, Math.round(d.body.length / 2));
        syncSliderUI('body.length', d.body.length);
      } else if (prevFold === 'flip') {
        d.body.length = Math.min(240, Math.round(d.body.length * 2));
        syncSliderUI('body.length', d.body.length);
      }
      // 折叠机内屏比例贴合展开足迹（自由比例），保证内屏铺满展开机身
      if (v !== 'none') {
        const effW = v === 'fold' ? d.body.width * 2 : d.body.width;
        const effH = v === 'flip' ? d.body.length * 2 : d.body.length;
        d.screen.aspect = '自由';
        d.screen.aspectV = Math.round(clamp(effH / effW, 0.5, 2.6) * 100) / 100;
        syncSliderUI('screen.aspectV', d.screen.aspectV);
      }
      // 机身变小后，背面 Logo/文字坐标收回新机身范围（避免校验报越界错误）
      ensureBranding(d);
      const bd = d.branding;
      const bx = Math.max(2, d.body.width / 2 - 3), by = Math.max(2, d.body.length / 2 - 3);
      for (const k of ['logoX', 'textX']) bd[k] = clamp(bd[k] || 0, -bx, bx);
      for (const k of ['logoY', 'textY']) bd[k] = clamp(bd[k] || 0, -by, by);
      if (d.logoOnBack) syncSliderUI('branding.logoX', bd.logoX);
      syncSliderUI('branding.textX', bd.textX);
    }
    // 调机身/边框/折叠结构时屏幕自动贴合，避免出现机身与屏幕比例失衡
    if (key === 'body.length' || key === 'body.width' || key === 'screen.bezel' || key === 'body.fold') {
      const fitted = maxScreenInch(d);
      if (Math.abs(fitted - d.screen.inch) > 0.049) {
        d.screen.inch = fitted;
        syncSliderUI('screen.inch', fitted);
      }
      // 机身变小时外屏尺寸钳制到新幅面（滑杆上限同步收缩）
      const cs = d.body.coverScreen;
      if (cs && (cs.inch || 0) > 0) {
        const maxInch = Math.max(0.8, Math.round(((d.body.width - 8) / 11.8) * 10) / 10);
        if (cs.inch > maxInch) { cs.inch = maxInch; syncSliderUI('body.coverScreen.inch', cs.inch); }
      }
    }
    // 外屏开关：关→记住尺寸并清零（inch=0 即无外屏，所有渲染/校验沿用该语义）；开→恢复记忆尺寸
    if (key === 'body.coverOn') {
      const cs = d.body.coverScreen || (d.body.coverScreen = { inch: 0, last: 2.6, ratio: 0, x: 0, y: 0 });
      if (!v) { cs.last = cs.inch || cs.last || 2.6; cs.inch = 0; }
      else {
        const maxInch = Math.max(0.8, Math.round(((d.body.width - 8) / 11.8) * 10) / 10);
        cs.inch = Math.min(cs.last || 2.6, maxInch);
      }
      syncSliderUI('body.coverScreen.inch', cs.inch);
      delete d.body.coverOn; // 开关状态以 inch>0 为唯一真源，不落库
    }
    // 闪光灯放进 deco：默认中心位会压在纵列镜头上——底部腾出闪光灯条带（deco 只增不减）并自动落位
    if (key === 'camera.flash.offDeco' && v === false) {
      const fl = d.camera.flash, deco = d.camera.deco;
      if (fl && deco && !fl.x && !fl.y) {
        const fh = (fl.style === 'rounded' || fl.style === 'slot') ? (fl.l || 6) : (fl.r || 1.5) * 2;
        let bottom = 0;
        for (const l of d.camera.lenses || []) {
          const r = lensRadiusMm((sensorById(l.sensor) || {}).format) * (l.size || 1) * (l.type === 'periscope' ? 1.25 : 1);
          bottom = Math.max(bottom, Math.abs(l.y || 0) + r);
        }
        const needH = Math.ceil((bottom + fh + 2.6) * 2);
        if (needH > deco.h) { deco.h = needH; syncSliderUI('camera.deco.h', deco.h); }
        fl.y = -Math.round((deco.h / 2 - fh / 2 - 1.3) * 10) / 10;
        syncSliderUI('camera.flash.y', fl.y);
      }
    }
    if (!fromInput) syncSliderUI(key, v);
    else if (key !== 'screen.inch') { /* 输入源控件保持用户输入 */ }
    // 比例预设切到「自由」时需重建控件，出现长宽比滑杆；充电口切自定义时出现形状编辑；
    // 折叠结构/外屏开关切换时出现外屏编辑组；闪光灯样式切换时出现宽/长或大小滑杆；
    // 勾选背面 Logo/文字时出现位置、颜色与材质编辑；开孔样式切单孔时出现挖孔位置滑杆
    if (key === 'camera.layout') arrangeLenses(d.camera); // 切换镜头布局模式时半径感知重排
    if (key === 'screen.aspect' || key === 'screen.panelVendor' || key === 'body.ports.charge' || key === 'body.ports.micStyle' || key === 'body.fold' || key === 'camera.flash.style' || key === 'logoOnBack' || key === 'brandText' || key === 'body.coverOn' || key === 'screen.notch' || key === 'body.coverScreen.notch'
      || (key.startsWith('camera.lenses.') && key.endsWith('.type'))) { // 镜头类型切换时出现潜望凸台厚度/方向控件
      renderControls();
      syncFoldToggle();
    }
    renderAssessment();
    if (viewMode === '2d') draw2D(); else buildPhone();
  }

  left.addEventListener('input', (e) => {
    // 方案名输入：只记入草稿，不触发重渲染（避免打字时丢焦点）
    if (e.target.id === 'scheme-name' && schemeEdit) {
      schemeEdit.name = e.target.value;
      return;
    }
    const el = e.target.closest('[data-k]');
    if (el) {
      const k = el.dataset.k;
      let v = el.type === 'range' || el.type === 'number' ? Number(el.value) : el.value;
      if (el.dataset.bool) v = el.checked;
      // 自研部件选择：写入/清除动态规格快照
      if (k === 'parts.cpu' && v === 'c_own') {
        model.design.parts.ownCpu = ownCpuSpec(state);
      } else if (k === 'parts.cpu') {
        delete model.design.parts.ownCpu;
      }
      if (k === 'camera.part' && v === '__own') {
        model.design.parts.ownCmr = ownCmrSpec(state);
        model.design.camera.part = 'cam_own';
      } else if (k === 'camera.part') {
        delete model.design.parts.ownCmr;
      }
      if (k === 'screen.panel' && v === '__own') {
        model.design.parts.ownPanel = ownPanelSpec(state);
        v = model.design.screen.panel;
      } else if (k === 'screen.panel') {
        delete model.design.parts.ownPanel;
      }
      applyValue(k, v, { fromInput: el.type === 'number' });
      // 数值输入时同步滑杆位置
      if (el.type === 'number') {
        const range = el.parentElement.querySelector('input[type="range"]');
        if (range) range.value = v;
      } else if (el.type === 'range') {
        const num = el.parentElement.querySelector('input[type="number"]');
        if (num) num.value = v;
      }
      return;
    }
    const pick = e.target.closest('[data-color-pick]');
    if (pick) {
      setPartColor(pick.dataset.colorPick, pick.value);
      renderAssessment();
      if (viewMode === '2d') draw2D(); else buildPhone();
      return;
    }
    const x = e.target.closest('[data-x]');
    if (x) {
      const id = x.dataset.x;
      const arr = model.design.parts.extras;
      if (x.checked) { if (!arr.includes(id)) arr.push(id); }
      else model.design.parts.extras = arr.filter((a) => a !== id);
      renderAssessment();
      // 无线充电等联动控件解锁/禁用，重建左栏
      renderControls();
      if (viewMode === '3d') buildPhone(); else draw2D();
    }
  });

  left.addEventListener('click', (e) => {
    // 分区折叠：只切 class，不重渲染（保留滚动位置与输入焦点）
    const secBtn = e.target.closest('[data-sec-toggle]');
    if (secBtn) {
      e.preventDefault();
      const key = secBtn.dataset.secToggle;
      const sec = secBtn.closest('.dz-sec');
      const collapsed = !sec.classList.contains('collapsed');
      sec.classList.toggle('collapsed', collapsed);
      if (collapsed) collapsedSecs.add(key); else collapsedSecs.delete(key);
      try { localStorage.setItem(DZ_SEC_KEY, JSON.stringify([...collapsedSecs])); } catch (err) { /* 隐私模式忽略 */ }
      return;
    }
    const sbtn = e.target.closest('.sbtn[data-sdir]');
    if (sbtn) {
      e.preventDefault();
      const row = sbtn.closest('[data-slider]');
      const range = row.querySelector('input[type="range"]');
      const dir = Number(sbtn.dataset.sdir);
      const min = Number(row.dataset.min), max = Number(row.dataset.max);
      const st = Number(row.dataset.step) || 0.1;
      const v = clamp(Number(range.value) + dir * st, min, max);
      const k = row.dataset.slider;
      applyValue(k, clamp(+v.toFixed(4), min, max));
      return;
    }
    const sw = e.target.closest('[data-color]');
    if (sw) {
      e.preventDefault();
      const target = sw.dataset.ctarget || 'back';
      setPartColor(target, sw.dataset.color);
      renderControls();
      renderAssessment();
      if (viewMode === '2d') draw2D(); else buildPhone();
      return;
    }
    // 配色方案：打开编辑面板（颜色实时写在机身上预览，取消时恢复快照）
    const addBtn = e.target.closest('[data-scheme-add]');
    if (addBtn) {
      e.preventDefault();
      const c = model.design.body.colors || { frame: model.design.body.color, back: model.design.body.color, cover: '#05070a' };
      schemeSnapshot = { frame: c.frame, back: c.back, cover: c.cover, schemeName: model.design.body.schemeName || '' };
      schemeEdit = { name: model.design.body.schemeName || '' };
      renderControls();
      return;
    }
    const cancelBtn = e.target.closest('[data-scheme-cancel]');
    if (cancelBtn) {
      e.preventDefault();
      if (schemeSnapshot) {
        model.design.body.colors = { frame: schemeSnapshot.frame, back: schemeSnapshot.back, cover: schemeSnapshot.cover };
        model.design.body.color = schemeSnapshot.back;
        model.design.body.schemeName = schemeSnapshot.schemeName;
      }
      schemeEdit = null;
      schemeSnapshot = null;
      renderControls();
      renderAssessment();
      if (viewMode === '2d') draw2D(); else buildPhone();
      return;
    }
    const saveBtn = e.target.closest('[data-scheme-save]');
    if (saveBtn) {
      e.preventDefault();
      const name = (schemeEdit?.name || left.querySelector('#scheme-name')?.value || '').trim() || '未命名配色';
      const c = model.design.body.colors || { frame: model.design.body.color, back: model.design.body.color, cover: '#05070a' };
      state.colorSchemes = state.colorSchemes || [];
      state.colorSchemes.push({ id: 'cs_' + Math.random().toString(36).slice(2, 8), name, frame: c.frame, back: c.back, cover: c.cover });
      model.design.body.schemeName = name;
      schemeEdit = null;
      schemeSnapshot = null;
      renderControls();
      renderAssessment();
      return;
    }
    // 配置版本：添加 / 移除
    const vAdd = e.target.closest('[data-variant-add]');
    if (vAdd) {
      e.preventDefault();
      const d = model.design;
      d.variants = d.variants || [];
      if (d.variants.length < 6) {
        d.variants.push({ uid: 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), ram: d.parts.ram, stg: d.parts.storage, priceMul: 1 });
        renderControls();
        renderAssessment();
      }
      return;
    }
    const vDel = e.target.closest('[data-variant-del]');
    if (vDel) {
      e.preventDefault();
      const d = model.design;
      d.variants = d.variants || [];
      d.variants.splice(Number(vDel.dataset.variantDel), 1);
      renderControls();
      renderAssessment();
      return;
    }
    // 逐镜：添加 / 移除
    const lensAdd = e.target.closest('[data-lens-add]');
    if (lensAdd) {
      e.preventDefault();
      const d = model.design;
      const c = d.camera;
      const n = c.lenses.length;
      const [x, y] = layoutPos(n, n + 1, c.layout || 'vertical', c.deco.w, c.deco.h);
      c.lenses.push(makeLens(n === 0 ? 'main' : (n === 1 ? 'ultrawide' : (n === 2 ? 'tele' : 'depth')), availYear, unlocked, x, y, true));
      c.count = c.lenses.length;
      renderControls();
      renderAssessment();
      if (viewMode === '2d') draw2D(); else buildPhone();
      return;
    }
    const lensDel = e.target.closest('[data-lens-del]');
    if (lensDel) {
      e.preventDefault();
      const i = Number(lensDel.dataset.lensDel);
      const c = model.design.camera;
      if (c.lenses.length > 1) {
        c.lenses.splice(i, 1);
        c.count = c.lenses.length;
        // 保证有主摄
        if (!c.lenses.some((l) => l.type === 'main')) c.lenses[0].type = 'main';
        renderControls();
        renderAssessment();
        if (viewMode === '2d') draw2D(); else buildPhone();
      }
      return;
    }
    const applyBtn = e.target.closest('[data-scheme-apply]');
    if (applyBtn) {
      e.preventDefault();
      const sc = (state.colorSchemes || []).find((x) => x.id === applyBtn.dataset.schemeApply);
      if (sc) {
        model.design.body.colors = { frame: sc.frame, back: sc.back, cover: sc.cover };
        model.design.body.color = sc.back;
        model.design.body.schemeName = sc.name;
        renderControls();
        renderAssessment();
        if (viewMode === '2d') draw2D(); else buildPhone();
      }
      return;
    }
  });

  container.querySelector('.dz-toolbar').addEventListener('click', (e) => {
    const vm = e.target.closest('[data-vm]');
    if (vm) {
      viewMode = vm.dataset.vm;
      container.querySelectorAll('[data-vm]').forEach((b) => b.classList.toggle('on', b.dataset.vm === viewMode));
      container.querySelector('#cam-views').style.display = viewMode === '3d' ? 'flex' : 'none';
      container.querySelector('#dz-hint').style.display = viewMode === '2d' ? 'block' : 'none';
      syncFoldToggle(); // 折叠态切换仅 2D 可用，切 3D 时隐藏
      if (viewMode === '2d') {
        canvas2d.style.display = 'block';
        three?.renderer.domElement && (three.renderer.domElement.style.display = 'none');
        draw2D();
      } else {
        canvas2d.style.display = 'none';
        init3D();
        if (three.renderer.domElement) three.renderer.domElement.style.display = 'block';
        three.resize();
        buildPhone();
      }
      return;
    }
    const foldBtn = e.target.closest('[data-fold]');
    if (foldBtn) {
      foldView = foldBtn.dataset.fold;
      container.querySelectorAll('[data-fold]').forEach((b) => b.classList.toggle('on', b.dataset.fold === foldView));
      if (viewMode === '2d') draw2D();
      else if (three) buildPhone(); // 3D：重建折叠/展开模型
      return;
    }
    const cam = e.target.closest('[data-cam]');
    if (cam && three) {
      autoRotate = false;
      container.querySelector('#btn-rotate')?.classList.remove('primary');
      const v = cam.dataset.cam;
      const o = three.orbit;
      if (v === 'front') { o.theta = 0; o.phi = Math.PI / 2; }
      if (v === 'back') { o.theta = Math.PI; o.phi = Math.PI / 2; }
      if (v === 'side') { o.theta = Math.PI / 2; o.phi = Math.PI / 2; }
      if (v === 'hero') { o.theta = Math.PI * 0.12; o.phi = Math.PI * 0.42; }
      return;
    }
    if (e.target.closest('#btn-explode')) {
      explodeTarget = explodeTarget > 0 ? 0 : 1;
      e.target.closest('#btn-explode').classList.toggle('primary', explodeTarget > 0);
      autoRotate = false;
      container.querySelector('#btn-rotate')?.classList.remove('primary');
      if (three) {
        const L0 = model.design.body.length;
        camAnim = explodeTarget > 0
          ? { theta: Math.PI * 0.30, phi: Math.PI * 0.46, radius: clamp(L0 * 2.75, 280, 660) }
          : { theta: Math.PI * 0.14, phi: Math.PI * 0.47, radius: clamp(L0 * 1.55 * 1.6, 150, 620) };
      }
      return;
    }
    if (e.target.closest('#btn-rotate')) {
      autoRotate = !autoRotate;
      e.target.closest('#btn-rotate').classList.toggle('primary', autoRotate);
      return;
    }
    if (e.target.closest('#dz-reset')) {
      model.design = defaultDesign(year, unlocked);
      refresh(true);
      return;
    }
    if (e.target.closest('#dz-close')) { hooks.onClose?.(); return; }
    if (e.target.closest('#dz-save')) {
      const v = validate(model.design, year);
      if (!v.ok) hooks.onToast?.('设计仍有装配问题，已保存但无法量产', 'warn');
      else hooks.onSaved?.(`${model.name} 设计已保存`);
      hooks.onClose?.();
      return;
    }
  });

  window.addEventListener('resize', onResize);
  function onResize() { if (viewMode === '2d') draw2D(); else three?.resize(); }

  refresh(true);

  return {
    destroy() {
      window.removeEventListener('resize', onResize);
      three?.destroy();
      three = null;
      container.innerHTML = '';
    },
    getDesign: () => model.design,
  };
}

// 公司 Logo 源 → 可加载 URL：SVG 字符串补 xmlns（作为 <img>/贴图加载时 XML 解析必需），
// dataURL 直接返回
function logoSrcToUrl(src) {
  if (src.startsWith('<svg')) {
    const s = src.includes('xmlns=') ? src : src.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s)));
  }
  return src;
}

// 公司 Logo 图像缓存（SVG 字符串/dataURL → HTMLImageElement），供产品页缩略图使用
let logoCacheImg = null;
let logoCacheSrc = '';
function ensureLogoImg(src) {
  if (!src || logoCacheSrc === src) return;
  logoCacheSrc = src;
  const img = new Image();
  img.onload = () => { logoCacheImg = img; };
  img.src = logoSrcToUrl(src);
}

// ---------- 产品页真实外观缩略图 ----------
// 按设计数据绘制背视图（配色方案 + 逐镜模组 + 闪光灯 + 公司 Logo/文字），返回 dataURL
// company 可选：传入 state.company 时绘制真实 Logo 图像与品牌文字
export function phoneBackDataUrl(design, thumbW = 92, company = null) {
  ensureLenses(design);
  ensureBranding(design);
  if (company?.logoData) ensureLogoImg(company.logoData);
  const b = design.body;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const aspect = b.length / b.width;
  const wPx = Math.round(thumbW * dpr);
  const hPx = Math.round(thumbW * aspect * dpr);
  const cv = document.createElement('canvas');
  cv.width = wPx; cv.height = hPx;
  const ctx = cv.getContext('2d');
  const scale = (wPx - 8 * dpr) / b.width;
  const W = b.width * scale, H = b.length * scale;
  const x = (wPx - W) / 2, y = (hPx - H) / 2;
  const col = (t) => (design.body.colors?.[t]) || (t === 'cover' ? '#05070a' : design.body.color);
  const rMm = Math.min(b.corner, b.width / 2, b.length / 2);
  const px = (xmm) => x + W / 2 + xmm * scale;
  const py = (ymm) => y + H / 2 - ymm * scale;
  // 中框底色
  ctx.fillStyle = shadeHex(col('frame'), -6);
  roundRectPath(ctx, x, y, W, H, rMm * scale);
  ctx.fill();
  // 后盖
  const inset = Math.max(1, 0.6 * scale);
  ctx.fillStyle = shadeHex(col('back'), 8);
  roundRectPath(ctx, x + inset, y + inset, W - inset * 2, H - inset * 2, Math.max(1, (rMm - 0.6) * scale));
  ctx.fill();
  // 摄像头模组（deco 板只在凸台开启时渲染）
  try {
    const rect = cameraModuleRect(design);
    if (rect) {
      if (design.camera.step) {
        const modPx = x + W / 2 + (rect.cx - rect.w / 2) * scale;
        const modPy = y + H / 2 - (rect.cy + rect.h / 2) * scale;
        const modW = rect.w * scale, modH = rect.h * scale;
        ctx.fillStyle = shadeHex(col('back'), -22);
        roundRectPath(ctx, modPx, modPy, modW, modH, Math.min(10 * scale, modW * 0.18));
        ctx.fill();
      }
      // 逐镜：位置/大小/外观与设计器一致（简化版）
      for (const l of design.camera.lenses) {
        let sn = sensorById(l.sensor);
        if (l.sensor === 'sn_own') sn = design.parts.ownCmr;
        const look = LENS_LOOK[l.type] || LENS_LOOK.main;
        const rad = Math.max(1.4, lensRadiusMm(sn ? sn.format : '1/2.4″') * (l.size || 1) * scale * 0.82);
        const lx = px(rect.cx + l.x), ly = py(rect.cy + l.y);
        if (look.plate !== null) {
          const pw = rad * 2.35;
          ctx.fillStyle = 'rgba(10,14,20,.88)';
          roundRectPath(ctx, lx - pw / 2, ly - pw / 2, pw, pw, pw * 0.28);
          ctx.fill();
        }
        const lg = ctx.createRadialGradient(lx - rad * 0.3, ly - rad * 0.3, 1, lx, ly, rad);
        lg.addColorStop(0, '#4a5a6d'); lg.addColorStop(0.55, '#101820'); lg.addColorStop(1, '#000');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.arc(lx, ly, rad, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(${(look.ring >> 16) & 255},${(look.ring >> 8) & 255},${look.ring & 255},.6)`;
        ctx.stroke();
      }
      // 闪光灯（按样式）
      const fl = design.camera.flash || { x: 0, y: 0 };
      const flStyle = fl.style || 'round';
      const fx = fl.offDeco ? px(rect.cx + rect.w / 2 + 2.6) : px(rect.cx + (fl.x || 0));
      const fy = fl.offDeco ? py(rect.cy - rect.h * 0.18) : py(rect.cy + (fl.y || 0));
      const fr2 = Math.max(1.0, fl.r || 1.5) * scale;
      if (fx < x + W - 3 * dpr) {
        if (flStyle === 'rounded' || flStyle === 'slot') {
          const fw2 = Math.max(2, fl.w || 4) * scale, fln = Math.max(2, fl.l || 6) * scale;
          ctx.fillStyle = '#efe3b0';
          roundRectPath(ctx, fx - fw2 / 2, fy - fln / 2, fw2, fln, Math.max(1, flStyle === 'slot' ? Math.min(fw2, fln) / 2 : Math.min(fw2, fln) / 4));
          ctx.fill();
        } else if (flStyle === 'ring') {
          ctx.strokeStyle = '#efe3b0';
          ctx.lineWidth = Math.max(1, fr2 * 0.42);
          ctx.beginPath(); ctx.arc(fx, fy, fr2 * 0.79, 0, Math.PI * 2); ctx.stroke();
          ctx.lineWidth = 1;
        } else {
          ctx.fillStyle = '#efe3b0';
          ctx.beginPath(); ctx.arc(fx, fy, fr2, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  } catch (e) { /* 老数据容错 */ }
  // Logo：公司 Logo 图像（未设置时品牌色块），位置/大小按 branding
  if (design.logoOnBack) {
    const br = design.branding;
    const half = Math.max(1.6, (br.logoSize / 2) * scale);
    const lpx = px(br.logoX), lpy = py(br.logoY);
    if (company?.logoData && logoCacheImg) {
      ctx.drawImage(logoCacheImg, lpx - half, lpy - half, half * 2, half * 2);
    } else {
      ctx.fillStyle = company?.logoColor || 'rgba(255,255,255,.5)';
      roundRectPath(ctx, lpx - half, lpy - half, half * 2, half * 2, Math.max(1, half * 0.3));
      ctx.fill();
    }
  }
  // 文字：自定义文案（留空跟随公司英文名）
  if (design.brandText) {
    const br = design.branding;
    const txt = (br.text === null || br.text === undefined || br.text === '') ? (company?.nameEn || company?.name || '') : br.text;
    if (txt) {
      ctx.fillStyle = 'rgba(255,255,255,.34)';
      ctx.font = `600 ${Math.max(3, br.textSize * scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(txt, px(br.textX), py(br.textY));
    }
  }
  return cv.toDataURL('image/png');
}

// 正面外观缩略图：中框 + 盖板边框（配色方案）+ 屏幕（刘海/挖孔/屏下）
export function phoneFrontDataUrl(design, thumbW = 92) {
  const b = design.body;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const aspect = b.length / b.width;
  const wPx = Math.round(thumbW * dpr);
  const hPx = Math.round(thumbW * aspect * dpr);
  const cv = document.createElement('canvas');
  cv.width = wPx; cv.height = hPx;
  const ctx = cv.getContext('2d');
  const scale = (wPx - 8 * dpr) / b.width;
  const W = b.width * scale, H = b.length * scale;
  const x = (wPx - W) / 2, y = (hPx - H) / 2;
  const col = (t) => (design.body.colors?.[t]) || (t === 'cover' ? '#05070a' : design.body.color);
  const rMm = Math.min(b.corner, b.width / 2, b.length / 2);
  // 中框
  ctx.fillStyle = shadeHex(col('frame'), -4);
  roundRectPath(ctx, x, y, W, H, rMm * scale);
  ctx.fill();
  // 正面盖板（黑或用户配色）
  const inset = Math.max(1, 0.55 * scale);
  ctx.fillStyle = shadeHex(col('cover'), -2);
  roundRectPath(ctx, x + inset, y + inset, W - inset * 2, H - inset * 2, Math.max(1, (rMm - 0.5) * scale));
  ctx.fill();
  // 屏幕（按 bezel 内缩）；折叠机型缩略图=折叠态正面：有外屏画外屏，无外屏画熄屏面板
  const cvInch = b.fold && b.fold !== 'none' ? (b.coverScreen?.inch || 0) : 0;
  const bez = Math.max(1.2, (design.screen.bezel || 2.2) * scale * 0.9);
  const sr = Math.max(1, screenCornerMm(design) * scale);
  let sx = x + bez, sy = y + bez, sw = W - bez * 2, sh = H - bez * 2;
  if (b.fold && b.fold !== 'none' && cvInch > 0) {
    const cvRatio = b.coverScreen?.ratio || (b.fold === 'flip' ? 1.05 : 1.42);
    const cvWpx = Math.min(sw - 4, cvInch * 25.4 / 2.15 * scale);
    const cvHpx = Math.min(sh - 5, cvWpx * cvRatio);
    sx = x + (W - cvWpx) / 2 + (b.coverScreen?.x || 0) * scale; sy = y + (H - cvHpx) / 2 - (b.coverScreen?.y || 0) * scale;
    sw = cvWpx; sh = cvHpx;
  }
  const grad = ctx.createLinearGradient(sx, sy, sx + sw * 0.4, sy + sh);
  if (b.fold && b.fold !== 'none' && cvInch <= 0) {
    // 无外屏折叠态：熄屏（近黑，只有微弱反光）
    grad.addColorStop(0, '#0b0f15');
    grad.addColorStop(0.5, '#101720');
    grad.addColorStop(1, '#080c11');
  } else {
    grad.addColorStop(0, '#2e4a74');
    grad.addColorStop(0.45, '#16283f');
    grad.addColorStop(1, '#0a1422');
  }
  ctx.fillStyle = grad;
  roundRectPath(ctx, sx, sy, sw, sh, sr);
  ctx.fill();
  // 屏幕高光斜纹
  ctx.save();
  roundRectPath(ctx, sx, sy, sw, sh, sr);
  ctx.clip();
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#9fc6ff';
  ctx.beginPath();
  ctx.moveTo(sx, sy + sh * 0.15);
  ctx.lineTo(sx + sw * 0.65, sy);
  ctx.lineTo(sx + sw, sy + sh * 0.42);
  ctx.lineTo(sx, sy + sh * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // 开孔：挖孔 / 刘海（屏下摄像头不画）
  const udc = (design.parts.extras || []).includes('x_udc');
  if (design.screen.notch === 'punch' && !udc) {
    const onCover = b.fold && b.fold !== 'none' && cvInch > 0; // 折叠缩略图正面=外屏：画外屏挖孔（可选）
    if (onCover && b.coverScreen?.notch === 'punch') {
      const hf = (b.coverScreen?.holeX || 0) / 100;
      ctx.fillStyle = '#02040a';
      ctx.beginPath();
      ctx.arc(sx + sw / 2 + sw * hf, sy + Math.max(5, sh * 0.045), Math.max(1.3, sh * 0.014), 0, Math.PI * 2);
      ctx.fill();
    } else if (!onCover) {
      const holeFrac = (design.screen.holeX ?? (b.fold && b.fold !== 'none' ? 25 : 0)) / 100;
      ctx.fillStyle = '#02040a';
      ctx.beginPath();
      ctx.arc(sx + sw / 2 + sw * holeFrac, sy + Math.max(5, sh * 0.045), Math.max(1.3, sh * 0.014), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (design.screen.notch === 'notch') {
    ctx.fillStyle = '#02040a';
    const nw = sw * 0.34, nh = Math.max(4, sh * 0.028);
    roundRectPath(ctx, sx + sw / 2 - nw / 2, sy, nw, nh, nh / 2);
    ctx.fill();
  }
  return cv.toDataURL('image/png');
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function shadeHex(hex, amt) {
  const n = String(hex || '#333').replace('#', '');
  const num = parseInt(n.length === 3 ? n.split('').map((c) => c + c).join('') : n, 16);
  let r = (num >> 16) + amt, g = ((num >> 8) & 0xff) + amt, b = (num & 0xff) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}
