// 宣传图生成器（v0.9.0）：手动布局画布，模板初始化，拖放元素，导出 PNG
import { phoneFrontDataUrl, phoneBackDataUrl } from './designer.js';
import { derive } from '../core/design.js';
import { RAMS, STORAGES } from '../data/parts.js';

const TEMPLATES = [
  {
    name: '经典横排', bg: '#2ce0c0',
    elements: [
      { type: 'phone-front', x: 0.06, y: 0.06, w: 0.20 },
      { type: 'phone-back', x: 0.28, y: 0.06, w: 0.22 },
      { type: 'title', x: 0.52, y: 0.08, w: 0.44, size: 1, color: '#111' },
      { type: 'slogan', x: 0.52, y: 0.20, w: 0.44, size: 1, color: '#333' },
      { type: 'specs', x: 0.52, y: 0.32, w: 0.44, size: 1, color: '#222' },
      { type: 'colors', x: 0.52, y: 0.60, w: 0.20 },
      { type: 'price', x: 0.52, y: 0.72, w: 0.44, size: 1.4, color: '#c00' },
    ],
  },
  {
    name: '大字报', bg: '#e8f5e9',
    elements: [
      { type: 'phone-back', x: 0.05, y: 0.08, w: 0.30 },
      { type: 'title', x: 0.40, y: 0.10, w: 0.55, size: 1.6, color: '#1a1a2e' },
      { type: 'slogan', x: 0.40, y: 0.26, w: 0.55, size: 1, color: '#555' },
      { type: 'specs', x: 0.40, y: 0.38, w: 0.55, size: 0.9, color: '#444' },
      { type: 'price', x: 0.40, y: 0.68, w: 0.55, size: 2.2, color: '#c62828' },
      { type: 'colors', x: 0.40, y: 0.90, w: 0.18 },
    ],
  },
  {
    name: '暗色展示', bg: '#0d1117',
    elements: [
      { type: 'phone-front', x: 0.04, y: 0.05, w: 0.22 },
      { type: 'phone-back', x: 0.27, y: 0.05, w: 0.24 },
      { type: 'title', x: 0.54, y: 0.10, w: 0.42, size: 1.5, color: '#e8eef7' },
      { type: 'slogan', x: 0.54, y: 0.24, w: 0.42, size: 1, color: '#9fb3cc' },
      { type: 'specs', x: 0.54, y: 0.38, w: 0.42, size: 0.85, color: '#7a94b8' },
      { type: 'colors', x: 0.54, y: 0.66, w: 0.20 },
      { type: 'price', x: 0.54, y: 0.78, w: 0.42, size: 1.8, color: '#4aa3ff' },
    ],
  },
];

export function openPosterStudio(mount, state, model, { onClose, onToast }) {
  const W = 1920, H = 1080;
  let bg = TEMPLATES[0].bg;
  let elements = JSON.parse(JSON.stringify(TEMPLATES[0].elements));
  let selected = -1;
  let dragging = null;
  let slogan = `${model.name} · 全新发布`;
  const d = derive(model.design, state.date.year);
  const price = Math.round(Math.min(...(model.design.variants || [{ priceMul: 1 }]).map((v) => (model.price.cn || d.cost * 1.8) * (v.priceMul || 1))));

  // ---------- DOM ----------
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:70;background:rgba(6,9,14,.97);display:flex;flex-direction:column';
  overlay.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid #232e3d">
      <b style="font-size:15px">宣传图生成器</b>
      <span class="tiny dim">${esc(model.name)} · 拖动元素布局，点击选中编辑</span>
      <div style="flex:1"></div>
      <select data-p="tpl" class="form-select" style="width:auto">
        ${TEMPLATES.map((t, i) => `<option value="${i}" ${i === 0 ? 'selected' : ''}>模板：${t.name}</option>`).join('')}
      </select>
      <button class="btn small" data-p="export">📥 导出 PNG</button>
      <button class="btn small" data-p="close">完成</button>
    </div>
    <div style="flex:1;position:relative;min-height:0">
      <canvas data-p="cv" style="position:absolute;inset:0;width:100%;height:100%;cursor:grab"></canvas>
      <div data-p="panel" style="position:absolute;right:10px;top:10px;width:220px;background:rgba(13,17,23,.94);border:1px solid #2a3546;border-radius:10px;padding:10px;display:none">
        <div class="tiny dim" data-p="sel-info"></div>
        <label class="field" style="margin-top:6px"><span>颜色</span>
          <input type="color" data-p="sel-color" style="width:44px;height:26px;padding:1px" />
        </label>
        <label class="field"><span>大小 ×<span data-p="size-val"></span></span>
          <input type="range" data-p="sel-size" min="0.5" max="3" step="0.05" style="width:100%" />
        </label>
        <label class="field"><span>文字</span>
          <input type="text" data-p="sel-text" style="width:100%" />
        </label>
      </div>
    </div>`;
  mount.appendChild(overlay);
  const cv = overlay.querySelector('[data-p=cv]');
  const ctx = cv.getContext('2d');
  const panel = overlay.querySelector('[data-p=panel]');

  function esc(x) { return String(x || '').replace(/</g, '&lt;'); }
  function el(type) { return elements.find((e2) => e2.type === type); }

  function autoSlogan() { return d.designScore >= 75 ? '真旗舰，敢创新' : '好设计，会说话'; }
  function autoSpecs() {
    const lines = [];
    lines.push(`${model.design.screen.inch}″ ${model.design.screen.hz || 60}Hz 屏幕`);
    lines.push(`${d.battery}· 续航估算 ${d.endurance}h`);
    lines.push(`${d.watt}W 有线快充 · ${d.chargeMin} 分钟充满`);
    if (d.camera >= 40) lines.push(`影像评分 ${Math.round(d.camera)}`);
    const cpu = model.design.parts.cpu;
    if (cpu) lines.push(`搭载 ${cpu.toUpperCase?.() || ''} 处理器`);
    return lines.join('\n');
  }

  // 初始化文字内容
  if (!el('title')?.text) { const t = el('title'); if (t) t.text = model.name; }
  if (!el('slogan')?.text) { const t = el('slogan'); if (t) t.text = slogan; }
  if (!el('specs')?.text) { const t = el('specs'); if (t) t.text = autoSpecs(); }
  if (!el('price')?.text) { const t = el('price'); if (t) t.text = `${fmtPrice(price)}起`; }
  function fmtPrice(n) { return '¥' + Math.round(n / 100) * 100; }

  // ---------- 渲染 ----------
  let phoneF = null, phoneB = null;
  try { phoneF = new Image(); phoneF.src = phoneFrontDataUrl(model.design, 240); } catch (e) { /* 忽略 */ }
  try { phoneB = new Image(); phoneB.src = phoneBackDataUrl(model.design, 240, state.company); } catch (e) { /* 忽略 */ }

  function draw() {
    const r = cv.getBoundingClientRect();
    cv.width = r.width * 2; cv.height = r.height * 2;
    ctx.setTransform(2 * r.width / W, 0, 0, 2 * r.height / H, 0, 0);
    // 背景
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // 元素
    for (let i = 0; i < elements.length; i++) {
      const e2 = elements[i];
      const ex = e2.x * W, ey = e2.y * H, ew = e2.w * W;
      ctx.save();
      if (i === selected) { ctx.strokeStyle = 'rgba(74,163,255,.6)'; ctx.lineWidth = 2; ctx.strokeRect(ex - 4, ey - 4, ew + 8, 20 + ew * 0.5); }
      if (e2.type === 'phone-front' && phoneF?.complete) {
        ctx.drawImage(phoneF, ex, ey, ew, ew * 2.17);
      } else if (e2.type === 'phone-back' && phoneB?.complete) {
        ctx.drawImage(phoneB, ex, ey, ew, ew * 2.17);
      } else if (e2.type === 'title') {
        ctx.fillStyle = e2.color || '#111';
        ctx.font = `800 ${36 * (e2.size || 1)}px -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(e2.text || '', ex, ey);
      } else if (e2.type === 'slogan') {
        ctx.fillStyle = e2.color || '#333';
        ctx.font = `600 ${22 * (e2.size || 1)}px sans-serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(e2.text || '', ex, ey);
      } else if (e2.type === 'specs') {
        ctx.fillStyle = e2.color || '#444';
        ctx.font = `500 ${15 * (e2.size || 1)}px sans-serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        (e2.text || '').split('\n').forEach((line, li) => { ctx.fillText('· ' + line, ex, ey + li * 24 * (e2.size || 1)); });
      } else if (e2.type === 'price') {
        ctx.fillStyle = e2.color || '#c00';
        ctx.font = `900 ${52 * (e2.size || 1)}px sans-serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(e2.text || '', ex, ey);
      } else if (e2.type === 'colors') {
        const colors = [model.design.body.colors?.frame, model.design.body.colors?.back, model.design.body.colors?.cover, '#f5f5f5', '#1a1a1a'];
        const cs = ew / 5;
        colors.forEach((c2, ci) => {
          ctx.fillStyle = c2 || '#888';
          ctx.beginPath(); ctx.roundRect(ex + ci * (cs + 6), ey, cs, cs * 0.9, cs * 0.18); ctx.fill();
        });
      } else if (e2.type === 'badge') {
        ctx.fillStyle = 'rgba(245,165,66,.9)';
        ctx.font = `600 ${16 * (e2.size || 1)}px sans-serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('🏆 ' + (e2.text || ''), ex, ey);
      }
      ctx.restore();
    }
  }

  // ---------- 交互 ----------
  function hitTest(mx, my) {
    for (let i = elements.length - 1; i >= 0; i--) {
      const e2 = elements[i];
      const ex = e2.x * W, ey = e2.y * H, ew = e2.w * W;
      const eh = e2.type.startsWith('phone') ? ew * 2.17 : e2.type === 'price' ? 60 * (e2.size || 1) : e2.type === 'specs' ? 5 * 24 * (e2.size || 1) : 36 * (e2.size || 1);
      if (mx >= ex && mx <= ex + ew && my >= ey - 10 && my <= ey + eh + 10) return i;
    }
    return -1;
  }

  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width * W;
    const my = (e.clientY - r.top) / r.height * H;
    selected = hitTest(mx, my);
    dragging = selected >= 0 ? { idx: selected, ox: mx - elements[selected].x * W, oy: my - elements[selected].y * H } : null;
    cv.style.cursor = dragging ? 'grabbing' : 'default';
    showPanel();
    draw();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const r = cv.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width * W;
    const my = (e.clientY - r.top) / r.height * H;
    elements[dragging.idx].x = Math.max(0, Math.min(W - elements[dragging.idx].w * W, (mx - dragging.ox) / W));
    elements[dragging.idx].y = Math.max(0, Math.min(H - 40, (my - dragging.oy) / H));
    draw();
  });
  cv.addEventListener('pointerup', () => { dragging = null; cv.style.cursor = 'grab'; });

  function showPanel() {
    if (selected < 0) { panel.style.display = 'none'; return; }
    const e2 = elements[selected];
    panel.style.display = 'block';
    overlay.querySelector('[data-p=sel-info]').textContent = `元素：${e2.type}`;
    overlay.querySelector('[data-p=sel-color]').value = e2.color || '#111111';
    overlay.querySelector('[data-p=sel-size]').value = e2.size || 1;
    overlay.querySelector('[data-p=size-val]').textContent = (e2.size || 1).toFixed(2);
    const textInput = overlay.querySelector('[data-p=sel-text]');
    if (['title', 'slogan', 'specs', 'price', 'badge'].includes(e2.type)) {
      textInput.style.display = 'block'; textInput.value = e2.text || '';
    } else { textInput.style.display = 'none'; }
  }
  panel.addEventListener('input', (e) => {
    if (selected < 0) return;
    const e2 = elements[selected];
    if (e2.color !== undefined) e2.color = overlay.querySelector('[data-p=sel-color]').value;
    e2.size = Number(overlay.querySelector('[data-p=sel-size]').value) || 1;
    if (['title', 'slogan', 'specs', 'price', 'badge'].includes(e2.type)) e2.text = overlay.querySelector('[data-p=sel-text]').value;
    overlay.querySelector('[data-p=size-val]').textContent = e2.size.toFixed(2);
    draw();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target.closest('[data-p=close]')) { destroy(); return; }
    if (e.target.closest('[data-p=export]')) {
      const a = document.createElement('a');
      a.href = cv.toDataURL('image/png');
      a.download = `${model.name}-宣传图.png`;
      a.click();
      if (onToast) onToast('宣传图已导出', 'good');
      return;
    }
    const tpl = e.target.closest('[data-p=tpl]');
    if (tpl) {
      const t = TEMPLATES[Number(tpl.value)];
      bg = t.bg; elements = JSON.parse(JSON.stringify(t.elements));
      if (!el('title')?.text) { const t2 = el('title'); if (t2) t2.text = model.name; }
      if (!el('slogan')?.text) { const t2 = el('slogan'); if (t2) t2.text = autoSlogan(); }
      if (!el('specs')?.text) { const t2 = el('specs'); if (t2) t2.text = autoSpecs(); }
      if (!el('price')?.text) { const t2 = el('price'); if (t2) t2.text = `${fmtPrice(price)}起`; }
      selected = -1; showPanel(); draw();
    }
  });

  const ro = new ResizeObserver(draw);
  ro.observe(cv.parentElement);
  draw();

  let dead = false;
  function destroy() {
    dead = true;
    ro.disconnect();
    overlay.remove();
    if (onClose) onClose();
  }
  return { destroy };
}
