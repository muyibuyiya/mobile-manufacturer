// 启动器：主菜单、开局配置、读档、进入游戏
import { createGame, saveSlots, loadGame, GENES, autoSave, flushAutoSave, peekAutoSave, GAME_VERSION, exportSave, importSave } from './core/state.js';
import { ERAS, COUNTRIES } from './data/world.js';
import { renderGame } from './ui/app.js';
import { sfx, unlockAudio, startAmbient, audioEnabled, setAudioEnabled, audioVolume, setAudioVolume } from './core/audio.js';
import { readQualityPref, writeQualityPref } from './three/office.js';
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
  root.innerHTML = `
    <div class="menu-screen">
      <div class="menu-inner">
        <div class="row" style="gap:14px">
          <div class="logo-mark">${LOGO_SVG}</div>
          <div>
            <div class="game-title" style="margin:0">手机开发商</div>
            <div class="game-sub">MOBILE MANUFACTURER · 企业模拟经营</div>
          </div>
        </div>

        <nav class="menu-list">
          <div class="menu-item" data-menu="career">经营模式<span class="mi-arrow">▸</span></div>
          <div class="menu-item" data-menu="sandbox">沙盒模式<span class="mi-arrow">▸</span></div>
          <div class="menu-item" data-menu="saves">存档<span class="mi-arrow">▸</span></div>
          <div class="menu-item" data-menu="settings">设置<span class="mi-arrow">▸</span></div>
          <div class="menu-item" data-menu="about">关于游戏<span class="mi-arrow">▸</span></div>
        </nav>
        <div class="menu-foot">原型版本 ${GAME_VERSION} · 纯前端 · three.js · 本地存档</div>
      </div>
    </div>`;

  root.querySelectorAll('[data-menu]').forEach((el) => {
    el.onclick = () => {
      const k = el.dataset.menu;
      if (k === 'career' || k === 'sandbox') config(k);
      else if (k === 'saves') loadPanel();
      else if (k === 'settings') settingsPanel();
      else aboutPanel();
    };
  });
}

// 主菜单 Logo（与 PWA/桌面图标同源：icons/icon.svg）
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="54" height="54">   <defs>     <linearGradient id="mbg" x1="0" y1="0" x2="1" y2="1">       <stop offset="0" stop-color="#57a8f8"/>       <stop offset=".52" stop-color="#2e6fd6"/>       <stop offset="1" stop-color="#1b3f92"/>     </linearGradient>     <linearGradient id="mm" x1="0" y1="0" x2="0" y2="1">       <stop offset="0" stop-color="#ffffff"/>       <stop offset="1" stop-color="#bfe0ff"/>     </linearGradient>     <radialGradient id="mhl" cx=".26" cy=".16" r="1">       <stop offset="0" stop-color="rgba(255,255,255,.32)"/>       <stop offset=".55" stop-color="rgba(255,255,255,0)"/>     </radialGradient>   </defs>   <rect width="512" height="512" rx="112" fill="url(#mbg)"/>   <rect width="512" height="512" rx="112" fill="url(#mhl)"/>   <g fill="url(#mm)">     <rect x="168" y="116" width="36" height="280" rx="9"/>     <rect x="308" y="116" width="36" height="280" rx="9"/>   </g>   <path d="M180 130 L256 292 L332 130" stroke="url(#mm)" stroke-width="38" fill="none" stroke-linecap="butt"/>   <circle cx="256" cy="300" r="14" fill="#ffffff"/> </svg>`;

// ---------- 主菜单：设置面板（与游戏内 ☰ 菜单设置同一套） ----------
function settingsPanel() {
  document.querySelector('.modal-mask')?.remove();
  const q = readQualityPref();
  const on = audioEnabled();
  const lockL = localStorage.getItem('mm_dz_lock_left') === '1';
  const QUALS = [['auto', '自动'], ['high', '高'], ['standard', '标准'], ['low', '流畅']];
  const QN = { auto: '自动', high: '高', standard: '标准', low: '流畅' };
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal" style="width:min(480px,94vw)">
      <h2>设置</h2>
      <div class="modal-sub">音效与画质保存在本设备</div>
      <div class="list">
        <div class="list-item">
          <div style="flex:1"><b>音效</b><div class="tiny dim">界面与事件音效</div></div>
          <button class="btn small ${on ? 'primary' : 'ghost'}" data-set="audio">${on ? '已开启' : '已关闭'}</button>
        </div>
        <div class="list-item" style="display:block">
          <label class="field"><span>音量 <b>${Math.round(audioVolume() * 100)}%</b></span>
            <input type="range" id="set-vol" min="0" max="100" step="5" value="${Math.round(audioVolume() * 100)}" style="width:100%" /></label>
        </div>
        <div class="list-item" style="display:block">
          <b>画面质量</b>
          <div class="tiny dim" style="margin:4px 0">影响园区 3D 的分辨率与阴影，低端设备建议「标准」或「流畅」</div>
          <div class="row">${QUALS.map(([k, n]) => `<button class="btn small ${q === k ? 'primary' : 'ghost'}" data-set="q" data-q="${k}">${n}${q === k ? ' ✓' : ''}</button>`).join('')}</div>
        </div>
        <div class="list-item" style="display:block">
          <b>存档文件（跨设备迁移）</b>
          <div class="tiny dim" style="margin:4px 0">导出为 .json 备份或带到其他设备 / APP；导入会替换当前进度并开局</div>
          <div class="row">
            <button class="btn small" data-set="export">⬇ 导出存档文件</button>
            <button class="btn small" data-set="import">⬆ 导入存档文件</button>
            <input type="file" id="set-import-file" accept=".json,application/json" style="display:none" />
          </div>
        </div>
        <div class="list-item" style="display:block">
          <b>设计器侧栏</b>
          <div class="tiny dim" style="margin:4px 0">锁定后左侧控件栏宽度固定，拖动分隔条不再生效，避免误触改宽</div>
          <div class="row">
            <button class="btn small ${lockL ? 'primary' : 'ghost'}" data-set="lock-left">${lockL ? '已锁定' : '未锁定'}</button>
            <button class="btn small ghost" data-set="reset-left">恢复默认宽度</button>
          </div>
        </div>
        <div class="list-item" style="opacity:.55">
          <div style="flex:1"><b class="dim">更多设置</b><div class="tiny dim">敬请期待</div></div><span class="tiny dim">—</span>
        </div>
      </div>
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-close>关闭</button></div>
    </div>`;
  document.body.appendChild(mask);
  const close = () => mask.remove();
  mask.querySelector('[data-close]').onclick = close;
  mask.onclick = (e) => { if (e.target === mask) close(); };
  mask.querySelector('[data-set="audio"]').onclick = (e) => {
    unlockAudio();
    const on2 = setAudioEnabled(!audioEnabled());
    e.target.textContent = on2 ? '已开启' : '已关闭';
    e.target.className = 'btn small ' + (on2 ? 'primary' : 'ghost');
    if (on2) sfx('good');
  };
  const vol = mask.querySelector('#set-vol');
  vol.oninput = () => {
    unlockAudio();
    setAudioVolume(Number(vol.value) / 100);
    vol.closest('.field').querySelector('b').textContent = Math.round(audioVolume() * 100) + '%';
  };
  mask.querySelectorAll('[data-set="q"]').forEach((b) => {
    b.onclick = () => {
      writeQualityPref(b.dataset.q);
      mask.querySelectorAll('[data-set="q"]').forEach((x) => {
        const sel = x.dataset.q === b.dataset.q;
        x.className = 'btn small ' + (sel ? 'primary' : 'ghost');
        x.textContent = QN[x.dataset.q] + (sel ? ' ✓' : '');
      });
    };
  });
  const lockBtn = mask.querySelector('[data-set="lock-left"]');
  lockBtn.onclick = () => {
    const next = localStorage.getItem('mm_dz_lock_left') !== '1';
    try { localStorage.setItem('mm_dz_lock_left', next ? '1' : '0'); } catch (e) { /* 忽略 */ }
    lockBtn.textContent = next ? '已锁定' : '未锁定';
    lockBtn.className = 'btn small ' + (next ? 'primary' : 'ghost');
    toast(next ? '侧栏宽度已锁定' : '侧栏宽度已解锁', 'good');
  };
  mask.querySelector('[data-set="reset-left"]').onclick = () => {
    try { localStorage.removeItem('dz_left_w'); } catch (e) { /* 忽略 */ }
    toast('下次进入设计器恢复默认宽度', 'good');
  };
  mask.querySelector('[data-set="export"]').onclick = () => {
    try {
      const st = loadGame('auto');
      if (!st) return toast('还没有自动存档可导出', 'warn');
      const blob = new Blob([exportSave(st)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `手机开发商_${st.company.name}_${st.date.year}年${st.date.month + 1}月.mm save.json`.replace(/\s+/g, '_');
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      toast('存档已导出为文件', 'good');
    } catch (e2) { toast('导出失败：' + e2.message, 'bad'); }
  };
  const f = mask.querySelector('#set-import-file');
  f.onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const st = importSave(String(reader.result));
        close();
        enter(st);
      } catch (err) { toast('导入失败：' + err.message, 'bad'); }
    };
    reader.readAsText(file);
  };
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
    <div class="menu-screen scrollable">
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
            <label class="field" style="grid-column: span 2">
              <span>总部所在地</span>
              <select id="f-country">
                ${COUNTRIES.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
              </select>
              <span class="tiny dim" id="country-desc" style="display:block;margin-top:4px"></span>
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
                <option value="easy">轻松 — 资金宽松</option>
                <option value="normal" selected>标准 — 真实压力</option>
                <option value="hard">硬核 — 双重挤压</option>
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
              <span class="tiny dim" id="cash-hint" style="display:block;margin-top:4px"></span>
            </label>
            <label class="field">
              <span>科技解锁</span>
              <select id="f-tech">
                <option value="no">仅该年代技术</option>
                <option value="yes">全部科技解锁</option>
              </select>
            </label>
            <div class="field" style="grid-column: span 2"><span>沙盒加速</span>
              <div class="row" style="gap:14px;flex-wrap:wrap">
                <label style="display:inline-flex;gap:5px;align-items:center;cursor:pointer"><input type="checkbox" id="sb-instant-r" style="width:auto" /> 研究瞬间完成</label>
                <label style="display:inline-flex;gap:5px;align-items:center;cursor:pointer"><input type="checkbox" id="sb-instant-b" style="width:auto" /> 建设瞬间完成</label>
              </div>
            </div>` : `
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
  const countrySel = document.getElementById('f-country');
  const updCountry = () => {
    const c = COUNTRIES.find((x) => x.id === countrySel.value);
    document.getElementById('country-desc').textContent = c ? c.desc : '';
  };
  countrySel.onchange = updCountry; updCountry();
  const cashEl = document.getElementById('f-cash');
  if (cashEl) {
    const updCash = () => {
      const v = Number(cashEl.value) || 0;
      document.getElementById('cash-hint').textContent = v <= 0 ? '0 = 不限制资金（默认 50 亿元）'
        : `≈ ${(v / 1e8).toFixed(2)} 亿元`;
    };
    cashEl.oninput = updCash; updCash();
  }
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
    if (isSandbox) {
      s.sandboxInstant = {
        research: !!document.getElementById('sb-instant-r')?.checked,
        build: !!document.getElementById('sb-instant-b')?.checked,
      };
    }
    enter(s);
  };
}

function loadPanel() {
  const slots = saveSlots();
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal">
      <h2>存档</h2>
      <div class="modal-sub">存档保存在浏览器本地（localStorage）</div>
      <div class="list">
        ${(() => {
          const auto = peekAutoSave();
          if (!auto) return '';
          return `<div class="list-item" style="border-color:rgba(74,163,255,.45)">
            <div style="flex:1">
              <div><span class="chip good" style="margin-right:6px">自动存档</span><b>${auto.name}</b></div>
              <div class="tiny dim">${auto.date.year}年${auto.date.month + 1}月 · 现金 ¥${(auto.cash / 1e4).toFixed(0)}万 · ${auto.models} 款机型</div>
            </div>
            <button class="btn small primary" id="btn-resume">继续上次进度 ▸</button>
          </div>`;
        })()}
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
  const resumeBtn = mask.querySelector('#btn-resume');
  if (resumeBtn) {
    resumeBtn.onclick = () => {
      const s = loadGame('auto');
      if (!s) return toast('自动存档损坏，无法读取', 'bad');
      mask.remove();
      enter(s);
    };
  }
}

function aboutPanel() { about(); }
function about() {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal" style="width:min(680px,94vw)">
      <h2>关于游戏</h2>
      <div class="modal-sub">手机开发商 v${GAME_VERSION} · 纯前端 · three.js · 本地存档</div>
      <div style="max-height:66vh;overflow-y:auto;padding-right:4px">
        <div class="small" style="line-height:1.9;color:var(--muted)">
          <div class="section-label">核心循环</div>
          <p><b class="accent">1. 时间</b>　以月为单位推进，可暂停并调整 1×/2×/4×/8× 速度。每月结算销量、研发、工资与现金流，顶栏可随时查看现金、份额与品牌。</p>
          <p><b class="accent">2. 研发</b>　在「研发中心」按年代与前置关系解锁通信 / 处理器 / 屏幕 / 影像 / 电池技术；研发需要研发部人力与月预算。也可以直接「技术引进」购买对手的成熟技术。</p>
          <p><b class="accent">3. 设计</b>　在「设计与产品」里真正地设计手机：机身尺寸、屏幕、逐颗摄像头、材质配色、折叠形态，2D 六视图与 3D 模型实时同步，系统会校验内部空间、装配与成本。设计完成的产品可长期放在产品池里迭代。</p>
          <p><b class="accent">4. 生产与供应链</b>　排产量按销量与热度匹配；元器件向供应商下采购单，交期不足会触发现货溢价，断供事件会冲击全行业。自建工厂或委托代工决定产能上限。</p>
          <p><b class="accent">5. 市场与销售</b>　9 大市场分别定价，销量由产品力、品牌、价格、渠道关系与产品热度共同决定；新品可办发布会造势，产品有完整的生命周期（上市爆发 → 高峰 → 衰退 → 清仓）。</p>
          <p><b class="accent">6. 竞争</b>　16 家真实厂商按历史节奏入场与退出，会自主研发、对标定价、清仓促销、发动价格战 / 营销攻势，甚至挖走你的核心员工。</p>
          <div class="section-label">特色系统</div>
          <p>· <b>自研部门</b>：成立半导体 / 光学 / 系统 / 面板四部门，多款产品并行研发，产出专属部件；系统开发部可经营自研 OS 生态（系统科技树 + 路线分化 + 对外授权收费）。</p>
          <p>· <b>组织与员工</b>：十个职能部门、职级晋升、培训深造、三渠道招聘（社招 / 校招 / 猎头）；明星员工自带影响力也会被挖角；3D 园区可自由规划房间与工位。</p>
          <p>· <b>渠道与营销</b>：媒体投放按人群匹配，运营商 / 电商 / 线下三渠道关系需要持续维护。</p>
          <p>· <b>资本运作</b>：融资扩股、IPO 上市、收购谈判；子公司会自主经营、向你转让技术、推荐人才。</p>
          <p>· <b>工业设计</b>：屏幕 UI 设计器、宣传图生成器、设计奖评选，都可以直接影响产品口碑与品牌。</p>
          <div class="section-label">快速上手</div>
          <p class="dim">先在「研发中心」立项一项科技 → 用「设计与产品」做一款能卖的手机 → 到「生产供应链」排产备料 → 在「市场与销售」定价上市。头几年现金流紧张，量入为出；第一款机型不必激进，活下来再谈理想。</p>
          <div class="section-label">存档</div>
          <p class="dim">进度自动保存在浏览器本地（localStorage），另有 3 个手动槽位；设置面板可管理存档与数值偏好。卸载浏览器数据前记得导出重要进度。</p>
        </div>
      </div>
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-close>知道了</button></div>
    </div>`;
  document.body.appendChild(mask);
  mask.querySelector('[data-close]').onclick = () => mask.remove();
  mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
}

function enter(state) {
  // 开局/读档立即镜像到自动槽，避免 debounce 期间刷新丢档
  autoSave(state);
  // 刷新/关闭前兜底自动存档：先冲刷 debounce 队列，再写一次最新状态
  const flush = () => { flushAutoSave(); autoSave(state); };
  window.addEventListener('beforeunload', flush, { once: true });
  window.addEventListener('pagehide', flush, { once: true });
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

