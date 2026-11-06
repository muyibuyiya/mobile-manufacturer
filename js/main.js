// 启动器：主菜单、开局配置、读档、进入游戏
import { createGame, saveSlots, loadGame, GENES, autoSave, peekAutoSave, GAME_VERSION } from './core/state.js';
import { ERAS, COUNTRIES } from './data/world.js';
import { renderGame } from './ui/app.js';
import { sfx, unlockAudio, startAmbient } from './core/audio.js';
import { LOGO_EXTRA } from './data/logo-extra.js';

const root = document.getElementById('root');
let current = null;

// PWA Service Worker：只在正式 https 托管（GitHub Pages 等）注册；
// localhost 开发不注册（避免开发期吃到旧缓存），APK 壳（appassets.local）也不注册
if (location.protocol === 'https:' && location.hostname !== 'appassets.local') {
  navigator.serviceWorker?.register('sw.js').catch(() => {});
}

// 浏览器只允许在用户手势后启用音频：任一交互解锁一次即可
function armAudio() {
  unlockAudio();
  startAmbient();
  window.removeEventListener('pointerdown', armAudio);
  window.removeEventListener('keydown', armAudio);
}
window.addEventListener('pointerdown', armAudio, { once: true });
window.addEventListener('keydown', armAudio, { once: true });

export function toastStack() { return document.getElementById('toast-stack'); }
const TOAST_SFX = { good: 'good', bad: 'bad', warn: 'warn' };
export function toast(text, kind = '') {
  sfx(TOAST_SFX[kind] || 'click');
  const stack = toastStack();
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  stack.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; el.style.transition = 'all .3s'; }, 4200);
  setTimeout(() => el.remove(), 4700);
}

const MODE_INFO = {
  career: {
    name: '经营模式', tag: 'CAREER',
    desc: '从指定年代创办一家手机公司，招聘第一批员工，研发第一款机型，活到下一个时代。',
  },
  sandbox: {
    name: '自由沙盒', tag: 'SANDBOX',
    desc: '自定义资金、年代与科技解锁程度，专注设计手机或搭建你的工业帝国。',
  },
};

function menu() {
  if (current && current.destroy) current.destroy();
  current = null;
  const slots = saveSlots();
  const hasSaves = slots.some((s) => !s.empty);
  root.innerHTML = `
    <div class="menu-screen">
      <div class="menu-inner">
        <div class="row" style="gap:14px">
          <div class="logo-mark">M</div>
          <div>
            <div class="game-title" style="margin:0">手机开发商</div>
            <div class="game-sub">MOBILE MANUFACTURER · 企业模拟经营</div>
          </div>
          <div class="spacer"></div>
          <div class="tiny dim" style="text-align:right;line-height:1.7">
            原型版本 ${GAME_VERSION}<br/>纯前端 · three.js · 本地存档
          </div>
        </div>

        <div class="menu-cards">
          ${Object.entries(MODE_INFO).map(([id, m]) => `
            <div class="mode-card" data-mode="${id}">
              <span class="badge">${m.tag}</span>
              <h3>${m.name}</h3>
              <p>${m.desc}</p>
              <div class="row tiny dim" style="margin-top:14px;gap:6px">
                <span class="chip">${id === 'career' ? '七个发展阶段' : '全参数可调'}</span>
                <span class="chip">${id === 'career' ? '真实年代科技' : '无限资金可选'}</span>
              </div>
            </div>`).join('')}
        </div>

        ${(() => {
          const auto = peekAutoSave();
          if (!auto) return '';
          return `<div class="card" style="padding:10px 14px;margin-top:14px;border-color:rgba(74,163,255,.5)">
            <div class="row" style="gap:10px;align-items:center">
              <span class="chip good">自动存档</span>
              <div style="flex:1">
                <b>${auto.name}</b>
                <span class="tiny dim"> · ${auto.date.year}年${auto.date.month + 1}月 · 现金 ¥${(auto.cash / 1e4).toFixed(0)}万 · ${auto.models} 款机型</span>
              </div>
              <button class="btn small primary" id="btn-resume">继续上次进度 ▸</button>
            </div>
          </div>`;
        })()}

        ${hasSaves ? `
        <div class="card" style="padding:12px 14px;margin-top:14px">
          <div class="row tiny dim" style="margin-bottom:8px"><b>最近存档</b><div class="spacer"></div><button class="btn small ghost" id="btn-load">读取存档 →</button></div>
          <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px">
            ${slots.map((s) => s.empty ? `
              <div style="border:1px dashed var(--border);border-radius:8px;padding:10px;text-align:center" class="tiny dim">槽位 ${s.slot}<br/>空</div>` : `
              <div class="list-item" style="padding:10px 12px;border-radius:8px;cursor:pointer" data-quick-load="${s.slot}">
                <div style="flex:1">
                  <div><b>${s.name}</b></div>
                  <div class="tiny dim">${s.date.year}年${s.date.month + 1}月 · 现金 ¥${(s.cash / 1e4).toFixed(0)}万 · ${s.models} 款机型</div>
                </div>
                <span class="tiny dim">▸</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

        <div class="row" style="margin-top:14px;gap:6px;flex-wrap:wrap">
          ${['🏭 3D 园区与房间建造', '📱 六视图手机设计器', '⚔ 16 家真实厂商竞争', '🌐 9 大市场 · 关税与海外建厂', '📈 供应商与断供事件', '🏛 12 类政策系统', '🎬 发布会 3D 舞台', '🔊 程序化音效'].map((t) => `<span class="chip tiny dim">${t}</span>`).join('')}
        </div>

        <div class="row" style="margin-top:14px;gap:10px">
          <button class="btn" id="btn-load2">读取存档</button>
          <button class="btn ghost" id="btn-about">玩法说明</button>
          <div class="spacer"></div>
          <span class="tiny dim">建议 1440×900 以上窗口</span>
        </div>
      </div>
    </div>`;

  root.querySelectorAll('[data-mode]').forEach((el) => {
    el.onclick = () => config(el.dataset.mode);
  });
  document.getElementById('btn-load2').onclick = loadPanel;
  document.getElementById('btn-load')?.addEventListener?.('click', loadPanel);
  document.getElementById('btn-about').onclick = about;
  root.querySelectorAll('[data-quick-load]').forEach((el) => {
    el.onclick = () => {
      const s = loadGame(Number(el.dataset.quickLoad));
      if (!s) return toast('存档损坏，无法读取', 'bad');
      enter(s);
    };
  });
  const resumeBtn = document.getElementById('btn-resume');
  if (resumeBtn) {
    resumeBtn.onclick = () => {
      const s = loadGame('auto');
      if (!s) return toast('自动存档损坏，无法读取', 'bad');
      enter(s);
    };
  }
}

// ---------- 随机公司名 ----------
const NAME_A = ['星海', '晨曦', '极光', '岚图', '青澜', '玄机', '天工', '跃迁', '澄宇', '风行', '睿创', '光年', '深蓝', '星轨', '白泽', '知远'];
const NAME_B = ['移动', '科技', '通信', '智联', '数码', '电子', '创新', '未来', '智造', '视界'];
const NAME_EN_A = ['Nova', 'Aurora', 'Orbit', 'Zenith', 'Lumina', 'Vertex', 'Aether', 'Helix', 'Quanta', 'Stellar', 'Pulse', 'Echo'];
const NAME_EN_B = ['Tech', 'Mobile', 'Comms', 'Digital', 'Devices', 'Innovations', 'Dynamics', 'Electronics'];
function randName() {
  return NAME_A[Math.floor(Math.random() * NAME_A.length)] + NAME_B[Math.floor(Math.random() * NAME_B.length)];
}
function randNameEn() {
  return NAME_EN_A[Math.floor(Math.random() * NAME_EN_A.length)] + ' ' + NAME_EN_B[Math.floor(Math.random() * NAME_EN_B.length)];
}

// ---------- 预设 Logo（SVG，#C# 为品牌色占位符） ----------
const LOGO_PRESETS = [
  `<svg viewBox="0 0 64 64" width="20" height="20"><path fill="#C#" d="M32 4 56 18v28L32 60 8 46V18z"/><path fill="#0d1117" d="M32 16 44 40H20z"/></svg>`,
  `<svg viewBox="0 0 64 64" width="20" height="20"><path fill="none" stroke="#C#" stroke-width="9" d="M32 8a24 24 0 1 1-17 41"/><circle cx="32" cy="32" r="7" fill="#C#"/></svg>`,
  `<svg viewBox="0 0 64 64" width="20" height="20"><path fill="#C#" d="M8 8h48v10H18v10h30v10H18v10h38v10H8z"/></svg>`,
  `<svg viewBox="0 0 64 64" width="20" height="20"><path fill="#C#" d="M32 32V6a26 26 0 0 1 26 26z"/><path fill="#C#" opacity=".75" d="M32 32h26a26 26 0 0 1-26 26z"/><path fill="#C#" opacity=".55" d="M32 32v26A26 26 0 0 1 6 32z"/><path fill="#C#" opacity=".35" d="M32 32H6A26 26 0 0 1 32 6z"/></svg>`,
  `<svg viewBox="0 0 64 64" width="20" height="20"><path fill="#C#" d="M36 4 12 36h14l-6 24 26-34H30z"/></svg>`,
  `<svg viewBox="0 0 64 64" width="20" height="20"><circle cx="32" cy="32" r="26" fill="none" stroke="#C#" stroke-width="8"/><circle cx="32" cy="32" r="10" fill="#C#"/></svg>`,
  `<svg viewBox="0 0 64 64" width="20" height="20"><path fill="#C#" d="M4 52 22 16l12 22 8-12 18 26z"/></svg>`,
  `<svg viewBox="0 0 64 64" width="20" height="20"><path fill="none" stroke="#C#" stroke-width="7" d="M6 20c8-8 16-8 24 0s16 8 24 0M6 40c8-8 16-8 24 0s16 8 24 0"/></svg>`,
  `<svg viewBox="0 0 64 64" width="20" height="20"><path fill="#C#" d="M32 4 46 18 32 32 18 18z"/><path fill="#C#" opacity=".7" d="M18 32 32 46 18 60 4 46z"/><path fill="#C#" opacity=".45" d="M46 32 60 46 46 60 32 46z"/></svg>`,
  `<svg viewBox="0 0 64 64" width="20" height="20"><path fill="#C#" d="M6 58V6h12l14 24L46 6h12v52H44V28L32 48 20 28v30z"/></svg>`,
  `<svg viewBox="0 0 64 64" width="20" height="20"><path fill="#C#" d="M28 6h8v18a6 6 0 0 0 6 6h16v8H42a6 6 0 0 0-6 6v16h-8V44a6 6 0 0 0-6-6H6v-8h16a6 6 0 0 0 6-6z"/></svg>`,
  `<svg viewBox="0 0 64 64" width="20" height="20"><path fill="#C#" d="M32 4 56 12v20c0 16-10 26-24 30C18 58 8 48 8 32V12z"/><path fill="#0d1117" d="M32 14 46 20v12c0 9-6 15-14 18-8-3-14-9-14-18V20z"/></svg>`,
];
function presetSvg(idx, color) { return LOGO_PRESETS[idx].replaceAll('#C#', color); }

// ---------- 图形 Logo 库（149 款白色剪影，按品牌色染色） ----------
const LOGO_EXTRA_IMGS = [];
const EXTRA_TINT_CACHE = new Map();
LOGO_EXTRA.forEach((src, i) => {
  const img = new Image();
  img.onload = () => {};
  img.src = src;
  LOGO_EXTRA_IMGS[i] = img;
});
function tintExtraSync(idx, color) {
  const key = idx + '|' + color;
  if (EXTRA_TINT_CACHE.has(key)) return EXTRA_TINT_CACHE.get(key);
  const img = LOGO_EXTRA_IMGS[idx];
  if (!img || !img.complete || !img.naturalWidth) return LOGO_EXTRA[idx];
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, 64, 64);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 64, 64);
  const out = c.toDataURL('image/png');
  EXTRA_TINT_CACHE.set(key, out);
  return out;
}

// 图形 Logo 选择弹窗
function extraLogoModal(color, curIdx, onPick) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal" style="width:min(760px,94vw)">
      <h2>图形 Logo 库</h2>
      <div class="modal-sub">${LOGO_EXTRA.length} 款 · 点击选用（按当前品牌色染色）</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;max-height:56vh;overflow-y:auto;padding:6px;background:#10161f;border:1px solid #2a3546;border-radius:10px">
        ${LOGO_EXTRA.map((d, i) => `<div data-pick="${i}" title="图形 Logo ${i + 1}" style="width:52px;height:52px;border-radius:9px;background:#2a3648;border:2px solid ${i === curIdx ? '#fff' : '#2a3546'};display:flex;align-items:center;justify-content:center;cursor:pointer"><img src="${tintExtraSync(i, color)}" width="36" height="36" style="object-fit:contain" alt=""/></div>`).join('')}
      </div>
      <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" data-close>取消</button></div>
    </div>`;
  document.body.appendChild(mask);
  mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
  mask.querySelector('[data-close]').onclick = () => mask.remove();
  mask.querySelectorAll('[data-pick]').forEach((el) => {
    el.onclick = () => { onPick(Number(el.dataset.pick)); mask.remove(); };
  });
}

// logoSel: { type: 'none'|'preset'|'extra'|'image', idx, dataUrl }
function logoHtml(sel, color, size = 20) {
  if (sel.type === 'preset') return presetSvg(sel.idx, color).replaceAll('width="20" height="20"', `width="${size}" height="${size}"`);
  if (sel.type === 'extra') return `<img src="${tintExtraSync(sel.idx, color)}" width="${size}" height="${size}" style="object-fit:contain" alt=""/>`;
  if (sel.type === 'image') return `<img src="${sel.dataUrl}" width="${size}" height="${size}" style="border-radius:4px;object-fit:contain" alt=""/>`;
  return `<i style="display:inline-block;width:${size}px;height:${size}px;border-radius:5px;background:${color}"></i>`;
}

// 上传图片归一化：缩放到 64×64 导出 PNG dataURL（控制存档体积）
function normalizeImage(file, cb) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    const s = Math.min(64 / img.width, 64 / img.height);
    const w = img.width * s, h = img.height * s;
    ctx.drawImage(img, (64 - w) / 2, (64 - h) / 2, w, h);
    cb(c.toDataURL('image/png'));
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(file);
}

// 画板：64×64 逻辑分辨率绘制，保存为 PNG dataURL
function paintModal(current, onDone) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal">
      <h2>绘制 Logo</h2>
      <div class="modal-sub">64×64 画布 · 保存后作为公司 Logo（上传/绘制的 Logo 不随品牌色变化）</div>
      <div class="row" style="justify-content:center;margin:10px 0">
        <canvas id="paint-cv" width="64" height="64" style="width:192px;height:192px;image-rendering:pixelated;background:#10161f;border:1px solid #2a3546;border-radius:8px;cursor:crosshair;touch-action:none"></canvas>
      </div>
      <div class="row" style="gap:8px;justify-content:center">
        <button class="btn small" data-paint-color="#ffffff">白笔</button>
        <button class="btn small" data-paint-color="#4aa3ff">蓝笔</button>
        <button class="btn small" data-paint-color="#ff5d6c">红笔</button>
        <button class="btn small" data-paint-color="#37c9a5">绿笔</button>
        <button class="btn small" data-paint-eraser>橡皮</button>
        <button class="btn small ghost" data-paint-clear>清空</button>
      </div>
      <div class="row" style="margin-top:16px;justify-content:flex-end">
        <button class="btn" data-paint-cancel>取消</button>
        <button class="btn primary" data-paint-save>保存 Logo</button>
      </div>
    </div>`;
  document.body.appendChild(mask);
  const close = () => mask.remove();
  mask.onclick = (e) => { if (e.target === mask) close(); };
  const cv = mask.querySelector('#paint-cv');
  const ctx = cv.getContext('2d');
  ctx.lineCap = ctx.lineJoin = 'round';
  let color = '#ffffff', erasing = false, drawing = false;
  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * 64, (e.clientY - r.top) / r.height * 64];
  };
  cv.addEventListener('pointerdown', (e) => {
    drawing = true; cv.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y + 0.01);
    ctx.strokeStyle = erasing ? '#10161f' : color;
    ctx.lineWidth = erasing ? 6 : 3;
    ctx.stroke();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const [x, y] = pos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = erasing ? '#10161f' : color;
    ctx.lineWidth = erasing ? 6 : 3;
    ctx.stroke();
  });
  cv.addEventListener('pointerup', () => { drawing = false; });
  mask.querySelectorAll('[data-paint-color]').forEach((b) => {
    b.onclick = () => { color = b.dataset.paintColor; erasing = false; };
  });
  mask.querySelector('[data-paint-eraser]').onclick = () => { erasing = true; };
  mask.querySelector('[data-paint-clear]').onclick = () => ctx.clearRect(0, 0, 64, 64);
  mask.querySelector('[data-paint-cancel]').onclick = close;
  mask.querySelector('[data-paint-save]').onclick = () => { onDone(cv.toDataURL('image/png')); close(); };
  void current;
}

function config(mode) {
  const isSandbox = mode === 'sandbox';
  root.innerHTML = `
    <div class="menu-screen">
      <div class="menu-inner" style="width:min(680px,92vw)">
        <div class="row" style="margin-bottom:18px;gap:12px">
          <button class="btn small" id="back">← 返回</button>
          <div class="game-title" style="font-size:26px;margin:0">${MODE_INFO[mode].name}</div>
        </div>

        <div class="card">
          <div class="form-grid">
            <div class="field">
              <span>公司名称（中文）</span>
              <div class="row" style="gap:6px">
                <input type="text" id="f-name" value="星海移动" maxlength="14" style="flex:1" />
                <button class="btn small" id="btn-rand-name" title="随机公司名">🎲 随机</button>
              </div>
            </div>
            <div class="field">
              <span>公司名称（英文）</span>
              <div class="row" style="gap:6px">
                <input type="text" id="f-name-en" value="Stellar Mobile" maxlength="24" style="flex:1" />
                <button class="btn small" id="btn-rand-name-en" title="随机英文名">🎲 随机</button>
              </div>
            </div>
            <label class="field">
              <span>总部所在地</span>
              <select id="f-country">
                ${COUNTRIES.map((c) => `<option value="${c.id}">${c.name} · ${c.desc}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span>开局年代</span>
              <select id="f-year">
                ${ERAS.map((e) => `<option value="${e.year}">${e.name}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span>难度</span>
              <select id="f-diff">
                <option value="easy">轻松 — 资金宽松，容错高</option>
                <option value="normal" selected>标准 — 真实压力</option>
                <option value="hard">硬核 — 供应链与现金双重挤压</option>
              </select>
            </label>
            <label class="field" style="grid-column: span 2">
              <span>企业基因（开局专属加成）</span>
              <select id="f-gene">
                ${Object.values(GENES).map((g) => `<option value="${g.id}">${g.name} — ${g.desc}</option>`).join('')}
              </select>
            </label>
            ${isSandbox ? `
            <label class="field">
              <span>初始资金（元，0 = 不限）</span>
              <input type="number" id="f-cash" value="500000000" step="1000000" />
            </label>
            <label class="field">
              <span>科技解锁</span>
              <select id="f-tech">
                <option value="no">仅该年代技术</option>
                <option value="yes">全部科技解锁</option>
              </select>
            </label>` : `
            <div class="field" style="grid-column: span 2">
              <span class="tiny muted" id="era-desc"></span>
            </div>`}
          </div>

          <div class="row" style="margin-top:14px;align-items:flex-start;gap:16px">
            <div style="text-align:center;flex-shrink:0">
              <div id="logo-preview" style="width:52px;height:52px;border-radius:10px;background:#10161f;border:1px solid #2a3546;display:flex;align-items:center;justify-content:center">${logoHtml({ type: 'none' }, '#4aa3ff', 30)}</div>
              <div class="tiny dim" style="margin-top:4px">Logo 预览</div>
            </div>
            <div style="flex:1">
              <div class="row tiny dim">品牌色</div>
              <div class="row" id="color-row" style="gap:6px;margin-top:4px">
                ${['#4aa3ff', '#37c9a5', '#ff9f4a', '#ff5d6c', '#a78bfa', '#f5c542'].map((c, i) =>
                  `<div data-color="${c}" style="width:18px;height:18px;border-radius:5px;background:${c};cursor:pointer;border:2px solid ${i === 0 ? '#fff' : 'transparent'}"></div>`).join('')}
              </div>
              <div class="row tiny dim" style="margin-top:10px">预设 Logo（点击选用，随品牌色变化）</div>
              <div class="row" id="preset-row" style="gap:6px;margin-top:4px;flex-wrap:wrap">
                ${LOGO_PRESETS.map((svg, i) =>
                  `<div data-preset="${i}" title="预设 Logo ${i + 1}" style="width:26px;height:26px;border-radius:6px;background:#10161f;border:1px solid #2a3546;display:flex;align-items:center;justify-content:center;cursor:pointer">${presetSvg(i, '#4aa3ff')}</div>`).join('')}
              </div>
              <button class="btn small" id="btn-extra-logos" style="margin-top:8px">🖼 图形 Logo 库（${LOGO_EXTRA.length} 款）</button>
              <div class="row" style="margin-top:10px;gap:8px">
                <button class="btn small" id="btn-upload-logo">📁 上传图片</button>
                <button class="btn small" id="btn-paint-logo">✏️ 画一个</button>
                <button class="btn small ghost" id="btn-clear-logo">用色块</button>
                <input type="file" id="file-logo" accept="image/*" style="display:none" />
              </div>
            </div>
            <div style="flex-shrink:0;align-self:flex-end">
              <button class="btn primary" id="start" style="padding:9px 26px">开始经营 →</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  let logoColor = '#4aa3ff';
  const logoSel = { type: 'none', idx: -1, dataUrl: '' };
  const previewEl = document.getElementById('logo-preview');
  const refreshPreview = () => { previewEl.innerHTML = logoHtml(logoSel, logoColor, 30); };
  const refreshPresets = () => {
    root.querySelectorAll('[data-preset]').forEach((el) => {
      el.innerHTML = presetSvg(Number(el.dataset.preset), logoColor);
      el.style.borderColor = logoSel.type === 'preset' && logoSel.idx === Number(el.dataset.preset) ? '#fff' : '#2a3546';
    });
    root.querySelectorAll('[data-color]').forEach((x) => (x.style.borderColor = 'transparent'));
    const activeColor = root.querySelector(`[data-color="${logoColor}"]`);
    if (activeColor && logoSel.type === 'none') activeColor.style.borderColor = '#fff';
    const extraBtn = document.getElementById('btn-extra-logos');
    if (extraBtn) extraBtn.classList.toggle('primary', logoSel.type === 'extra');
  };
  root.querySelectorAll('[data-color]').forEach((el) => {
    el.onclick = () => {
      logoColor = el.dataset.color;
      // 保持当前 logo 类型：预设 SVG 会重新着色，上传/绘制图像不变
      refreshPresets(); refreshPreview();
    };
  });
  root.querySelectorAll('[data-preset]').forEach((el) => {
    el.onclick = () => {
      logoSel.type = 'preset';
      logoSel.idx = Number(el.dataset.preset);
      logoSel.dataUrl = '';
      refreshPresets(); refreshPreview();
    };
  });
  document.getElementById('btn-upload-logo').onclick = () => document.getElementById('file-logo').click();
  document.getElementById('file-logo').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    normalizeImage(f, (dataUrl) => {
      logoSel.type = 'image';
      logoSel.dataUrl = dataUrl;
      refreshPresets(); refreshPreview();
      toast('Logo 已导入（64×64）', 'good');
    });
  };
  document.getElementById('btn-paint-logo').onclick = () => {
    paintModal('', (dataUrl) => {
      logoSel.type = 'image';
      logoSel.dataUrl = dataUrl;
      refreshPresets(); refreshPreview();
    });
  };
  document.getElementById('btn-clear-logo').onclick = () => {
    logoSel.type = 'none';
    refreshPresets(); refreshPreview();
  };
  document.getElementById('btn-extra-logos').onclick = () => {
    extraLogoModal(logoColor, logoSel.type === 'extra' ? logoSel.idx : -1, (idx) => {
      logoSel.type = 'extra';
      logoSel.idx = idx;
      logoSel.dataUrl = '';
      refreshPresets(); refreshPreview();
      toast('图形 Logo 已选用', 'good');
    });
  };
  document.getElementById('btn-rand-name').onclick = () => {
    document.getElementById('f-name').value = randName();
    sfx('click');
  };
  document.getElementById('btn-rand-name-en').onclick = () => {
    document.getElementById('f-name-en').value = randNameEn();
    sfx('click');
  };
  refreshPresets(); refreshPreview();
  const yearSel = document.getElementById('f-year');
  if (!isSandbox) {
    const upd = () => {
      const e = ERAS.find((x) => x.year === Number(yearSel.value));
      document.getElementById('era-desc').textContent = `${e.name}：${e.desc} 初始资金 ${(e.cash / 1e4).toFixed(0)} 万元。`;
    };
    yearSel.onchange = upd; upd();
  }
  document.getElementById('back').onclick = menu;
  document.getElementById('start').onclick = () => {
    const cfg = {
      mode,
      year: Number(yearSel.value),
      companyName: document.getElementById('f-name').value.trim() || '未命名科技',
      companyEnName: document.getElementById('f-name-en').value.trim() || '',
      countryId: document.getElementById('f-country').value,
      difficulty: document.getElementById('f-diff').value,
      logoColor,
      gene: document.getElementById('f-gene').value,
      logoData: logoSel.type === 'preset' ? presetSvg(logoSel.idx, logoColor)
        : logoSel.type === 'extra' ? tintExtraSync(logoSel.idx, logoColor)
        : logoSel.type === 'image' ? logoSel.dataUrl : '',
    };
    if (isSandbox) {
      const cash = Number(document.getElementById('f-cash').value) || 0;
      cfg.cash = cash > 0 ? cash : 5e9;
      cfg.techAll = document.getElementById('f-tech').value === 'yes';
    }
    const s = createGame(cfg);
    enter(s);
  };
}

function loadPanel() {
  const slots = saveSlots();
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal">
      <h2>读取存档</h2>
      <div class="modal-sub">存档保存在浏览器本地（localStorage）</div>
      <div class="list">
        ${slots.map((s) => `
          <div class="list-item">
            <div style="flex:1">
              <div><b>槽位 ${s.slot}</b> ${s.empty ? '<span class="dim tiny">空</span>' : s.name}</div>
              <div class="tiny dim">${s.empty ? '—' : `${s.date.year}年${s.date.month + 1}月 · 现金 ¥${(s.cash / 1e4).toFixed(0)}万 · ${s.models} 款机型`}</div>
            </div>
            <button class="btn small primary" data-slot="${s.slot}" ${s.empty ? 'disabled' : ''}>读取</button>
          </div>`).join('')}
      </div>
      <div class="row" style="margin-top:16px;justify-content:flex-end">
        <button class="btn" data-close>关闭</button>
      </div>
    </div>`;
  document.body.appendChild(mask);
  mask.querySelector('[data-close]').onclick = () => mask.remove();
  mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
  mask.querySelectorAll('[data-slot]').forEach((b) => {
    b.onclick = () => {
      const s = loadGame(Number(b.dataset.slot));
      if (!s) return toast('存档损坏，无法读取', 'bad');
      mask.remove();
      enter(s);
    };
  });
}

function about() {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal">
      <h2>玩法说明</h2>
      <div class="modal-sub">这是一款以手机产业为核心的深度经营模拟原型</div>
      <div class="small" style="line-height:1.9;color:var(--muted)">
        <p><b class="accent">1. 时间</b>　以月为单位推进，可暂停并调整 1×/2×/4×/8× 速度。每月结算销量、研发、工资与现金流。</p>
        <p><b class="accent">2. 科技</b>　按年代解锁通信、处理器、屏幕、影像、电池等技术。研发需要分配研发人员与预算，前置技术必须先完成。</p>
        <p><b class="accent">3. 设计</b>　在「设计中心」里真正地设计手机：调机身尺寸、屏幕、摄像头、材质，2D 六视图与 3D 模型实时同步，系统会校验内部空间、装配与成本。</p>
        <p><b class="accent">4. 生产与销售</b>　设计通过后量产，选择代工厂或自建工厂；给不同市场定价，销量由产品力、品牌、价格与渠道共同决定。</p>
        <p><b class="accent">5. 竞争</b>　九家竞争对手会自主研发、发布新机、调整定价，不会站在原地等你。</p>
        <p class="dim tiny">提示：先在「科技」立项，同时用「设计中心」做一款能卖的手机，再去「生产」设置产量，最后到「市场」定价上市。</p>
      </div>
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-close>知道了</button></div>
    </div>`;
  document.body.appendChild(mask);
  mask.querySelector('[data-close]').onclick = () => mask.remove();
  mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
}

function enter(state) {
  // 刷新/关闭前兜底自动存档
  window.addEventListener('beforeunload', () => autoSave(state), { once: true });
  current = renderGame(root, state, {
    onExit: menu,
    onToast: toast,
    onLoad: (s) => enter(s),
  });
}

// 全局键位
window.addEventListener('keydown', (e) => {
  if (!current || !current.handleKey) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  current.handleKey(e);
});

menu();

