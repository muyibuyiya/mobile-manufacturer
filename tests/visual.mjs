// 视觉回归：2D 六视图 + 3D 正视截图，与基线做像素差（阈值 0.5%）
// 用法：node tests/visual.mjs [url] [--update]
import fs from 'fs';
import path from 'path';

const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://127.0.0.1:8124/index.html';
const UPDATE = process.argv.includes('--update');
const DIR = path.resolve('tests/baselines');
const THRESHOLD = 0.005;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const tabs = await (await fetch(BASE + '/json/list')).json();
  const page = tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('没有可用的 CDP 页面（请先启动 headless Chrome 9222）');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) errors.push(String(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text).slice(0, 200));
    return r.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL }); await sleep(1500);
  await ev('localStorage.clear()'); await send('Page.reload'); await sleep(1500);
  await ev(`[...document.querySelectorAll('.menu-item')].find(x => x.textContent.includes('沙盒'))?.click()`); await sleep(300);
  await ev(`(() => { const y = document.querySelector('#f-year'); y.value = '2020'; y.dispatchEvent(new Event('change')); return true; })()`); await sleep(200);
  await ev(`document.querySelector('#start')?.click()`); await sleep(1500);
  await ev(`document.querySelector('[data-tab=product]')?.click()`); await sleep(300);
  await ev(`document.querySelector('[data-act="design"]')?.click()`); await sleep(1600);

  const shot2d = await ev(`document.querySelector('#dz-2d')?.toDataURL('image/png')`);
  const box = await ev(`(() => { const c = document.querySelector('#dz-3d canvas, .dz-stage canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; })()`);
  let shot3d = null;
  if (box && box.width > 40) {
    const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 } });
    shot3d = 'data:image/png;base64,' + r.result.data;
    // 3D 有阴影/抗锯齿，阈值放宽到 2%
  }

  const diffExpr = `(async (a, b) => {
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return 1;
    const cv = document.createElement('canvas'); cv.width = ia.width; cv.height = ia.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(ia, 0, 0); const pa = ctx.getImageData(0, 0, cv.width, cv.height).data;
    ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(ib, 0, 0); const pb = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let bad = 0;
    for (let i = 0; i < pa.length; i += 4) {
      if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i+1] - pb[i+1]) + Math.abs(pa[i+2] - pb[i+2]) > 24) bad++;
    }
    return bad / (pa.length / 4);
  })`;

  let pass = 0, fail = 0;
  const check = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
  check('拿到 2D 画布', typeof shot2d === 'string' && shot2d.length > 2000, `${Math.round((shot2d || '').length / 1024)}KB`);
  check('拿到 3D 画布', !!shot3d, box ? JSON.stringify(box) : 'no box');

  const cases = [['designer-2d', shot2d, THRESHOLD], ['designer-3d', shot3d, 0.02]];
  for (const [name, cur, limit] of cases) {
    if (!cur) { check(`${name} 截图缺失`, false); continue; }
    const file = path.join(DIR, `${name}.png`);
    if (UPDATE || !fs.existsSync(file)) {
      fs.writeFileSync(file, Buffer.from(cur.split(',')[1], 'base64'));
      console.log(`BASELINE  ${name}.png${UPDATE ? '（已更新）' : '（首次生成）'}`);
      continue;
    }
    const base = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    const ratio = await ev(`(${diffExpr})(${JSON.stringify(base)}, ${JSON.stringify(cur)})`);
    check(`${name} 像素差 < ${(limit * 100).toFixed(1)}%`, typeof ratio === 'number' && ratio <= limit, `${(ratio * 100).toFixed(3)}%`);
  }
  check('无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  ws.close();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });