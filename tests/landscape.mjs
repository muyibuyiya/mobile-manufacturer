// 手机横屏（844×390）适配回归：无横向溢出、画布优先、控件抽屉可用
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 844, H = 390;

async function main() {
  const tabs = await (await fetch(BASE + '/json/list')).json();
  const page = tabs.find((t) => t.type === 'page');
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
    if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  const check = (name, ok, detail = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
  let bad = 0;

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: URL }); await sleep(1500);
  await ev('localStorage.clear()'); await send('Page.reload'); await sleep(1500);

  check('横屏无横向溢出', await ev(`document.documentElement.scrollWidth <= innerWidth + 1`), await ev(`document.documentElement.scrollWidth + '/' + innerWidth`));

  await ev(`[...document.querySelectorAll('.menu-item')].find(x => x.textContent.includes('沙盒'))?.click()`); await sleep(300);
  await ev(`(() => { const y = document.querySelector('#f-year'); y.value = '2020'; y.dispatchEvent(new Event('change')); return true; })()`); await sleep(200);
  await ev(`document.querySelector('#start')?.click()`); await sleep(1600);
  const tbH = await ev(`document.querySelector('.topbar')?.getBoundingClientRect().height`);
  check('顶栏压缩到 40px', tbH <= 44, String(tbH));
  await ev(`document.querySelector('[data-tab=product]')?.click()`); await sleep(300);
  await ev(`document.querySelector('[data-act="design"]')?.click()`); await sleep(1600);

  check('设计器进入横屏布局', await ev(`(() => { const d = document.querySelector('.designer'); if (!d) return false; const cs = getComputedStyle(d); return cs.gridTemplateColumns.split(' ').length === 1; })()`));
  check('控件栏默认收起', await ev(`document.querySelector('.designer')?.classList.contains('controls-hidden')`));
  check('画布占据主要高度', await ev(`(() => { const c = document.querySelector('#dz-2d'); if (!c) return false; const r = c.getBoundingClientRect(); return r.width > 300 && r.height > 250; })()`), await ev(`(() => { const c = document.querySelector('#dz-2d'); if (!c) return null; const r = c.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); })()`));
  check('横屏无横向溢出（设计器）', await ev(`document.documentElement.scrollWidth <= innerWidth + 1`), await ev(`document.documentElement.scrollWidth + '/' + innerWidth`));

  await ev(`document.querySelector('#dz-panel-toggle')?.click()`); await sleep(400);
  const drawer = await ev(`(() => { const l = document.querySelector('#dz-left'); if (!l) return null; const r = l.getBoundingClientRect(); const cs = getComputedStyle(l); return { x: Math.round(r.x), w: Math.round(r.width), pos: cs.position, vis: cs.display }; })()`);
  check('控件抽屉可展开且覆盖画布', drawer && drawer.pos === 'absolute' && drawer.w <= 340 && drawer.x <= 60, JSON.stringify(drawer));
  check('触控按钮命中区 ≥32px', await ev(`(() => { const b = document.querySelector('#dz-panel-toggle'); const r = b.getBoundingClientRect(); return r.height >= 32; })()`), await ev(`document.querySelector('#dz-panel-toggle')?.getBoundingClientRect().height`));
  check('无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log(`\n1 suite, ${bad} failed`);
  ws.close();
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });